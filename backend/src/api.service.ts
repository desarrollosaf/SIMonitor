import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from './database.service';

const SITE_FIELDS = [
  'code','name','official_name','site_type','country','state','municipality','locality','neighborhood','postal_code','street',
  'exterior_number','interior_number','reference','latitude','longitude','phone','manager_name','manager_phone','manager_email',
  'technical_contact','technical_phone','schedule','primary_isp','primary_bandwidth_mbps','secondary_isp','secondary_bandwidth_mbps',
  'criticality','notes','description','active'
];
const DEVICE_FIELDS = [
  'site_id','probe_id','parent_id','name','host','device_type','check_type','check_port','check_path','interval_sec','warning_ms','critical_ms','enabled',
  'inventory_number','asset_number','hostname','fqdn','description','category','subcategory','manufacturer','model','serial_number','part_number','service_tag',
  'mac_address','management_vlan','subnet_mask','gateway','dns_servers','addressing_method','firmware','operating_system','os_version','building','floor','area','room',
  'rack_name','rack_unit','physical_location','responsible_person','administrative_unit','supplier','acquisition_date','warranty_end','contract_reference','lifecycle_status','criticality','notes'
];
const INTERFACE_FIELDS = ['name','mac_address','ipv4_address','ipv6_address','vlan_id','speed_mbps','interface_type','switch_device_id','switch_if_index','switch_port_name','wall_jack','patch_panel','patch_port','notes','primary_interface'];
// Nunca se expone token_hash al navegador: es material sensible del Agente de Sitio.
const AGENT_PUBLIC_COLUMNS = ['id','name','agent_code','description','site_id','enabled','version','hostname','ip_address','platform','os_version','architecture','buffer_depth','last_seen','last_sync_at','created_at','updated_at'];
const AGENT_SELECT = AGENT_PUBLIC_COLUMNS.map(c=>`p.${c}`).join(',');
// Coincidencia exacta, no por subcadena: con includes('ap') un equipo tipo "laptop"
// se trataba como access point y se le creaba configuración Wi-Fi.
const AP_TYPES = ['ap','access-point','access_point','accesspoint','wifi','wireless'];
const SWITCH_TYPES = ['switch','switch-poe','switch_core','core-switch'];
export function isApType(t:any){ return AP_TYPES.includes(String(t||'').toLowerCase().trim()); }
export function isSwitchType(t:any){ return SWITCH_TYPES.includes(String(t||'').toLowerCase().trim()); }

@Injectable()
export class ApiService {
  constructor(private db: DatabaseService) {}

  private effectiveStatusSql(alias='d') {
    return `CASE WHEN ${alias}.last_checked_at IS NULL OR TIMESTAMPDIFF(SECOND,${alias}.last_checked_at,UTC_TIMESTAMP()) > GREATEST(30,ROUND(${alias}.interval_sec*2.5)) THEN 'unknown' ELSE ${alias}.last_status END`;
  }

  private async audit(entityType:string,entityId:number,action:string,username?:string,before?:any,after?:any,summary?:string){
    await this.db.query('INSERT INTO inventory_audit(entity_type,entity_id,action,username,summary,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP())',[
      entityType,entityId,action,username||null,summary||null,before?JSON.stringify(before):null,after?JSON.stringify(after):null
    ]);
  }

  private async validateAgentForSite(probeId:any,siteId:any){
    if(!probeId) return;
    const a=(await this.db.query<any[]>('SELECT id,site_id,name FROM probes WHERE id=? AND enabled=1',[probeId]))[0];
    if(!a) throw new BadRequestException('El Agente de Sitio seleccionado no existe o está deshabilitado.');
    if(a.site_id && Number(a.site_id)!==Number(siteId)) throw new BadRequestException(`El agente ${a.name} pertenece a otra sede. Asigne un agente de la misma sede o déjelo heredado.`);
  }

  private async validateSiteRelations(siteId:any,parentId?:any,currentDeviceId?:number){
    const site=(await this.db.query<any[]>('SELECT id,name,active FROM sites WHERE id=?',[siteId]))[0];
    if(!site) throw new BadRequestException('La sede seleccionada no existe.');
    if(parentId){
      if(currentDeviceId && Number(parentId)===Number(currentDeviceId)) throw new BadRequestException('Un equipo no puede ser su propio equipo padre.');
      const parent=(await this.db.query<any[]>('SELECT id,name,site_id FROM devices WHERE id=?',[parentId]))[0];
      if(!parent) throw new BadRequestException('El equipo padre seleccionado no existe.');
      if(Number(parent.site_id)!==Number(siteId)) throw new BadRequestException(`El equipo padre ${parent.name} pertenece a otra sede.`);
    }
    return site;
  }

  private validateDeviceValues(v:any){
    const warning=Number(v.warning_ms), critical=Number(v.critical_ms);
    if(Number.isFinite(warning)&&Number.isFinite(critical)&&warning>=critical) throw new BadRequestException('El umbral crítico debe ser mayor que el umbral de advertencia.');
    if(v.mac_address) v.mac_address=normalizeMac(v.mac_address);
  }

  private async validateInterfaceSwitch(deviceId:number,switchDeviceId:any){
    if(!switchDeviceId) return;
    const rows=await this.db.query<any[]>(`SELECT d.site_id,d.name,sw.site_id switch_site,sw.name switch_name FROM devices d JOIN devices sw ON sw.id=? WHERE d.id=?`,[switchDeviceId,deviceId]);
    if(!rows.length) throw new BadRequestException('El equipo o switch seleccionado no existe.');
    const r=rows[0];
    if(Number(r.site_id)!==Number(r.switch_site)) throw new BadRequestException(`No se puede conectar ${r.name} con ${r.switch_name}: pertenecen a sedes distintas.`);
  }

  async summary() {
    const es=this.effectiveStatusSql('d');
    const counts = await this.db.query<any[]>(`SELECT COUNT(*) total,
      COALESCE(SUM((${es})='ok'),0) ok, COALESCE(SUM((${es})='warning'),0) warning,
      COALESCE(SUM((${es})='critical'),0) critical, COALESCE(SUM((${es})='down'),0) down,
      COALESCE(SUM((${es})='unknown'),0) unknown FROM devices d WHERE d.enabled=1`);
    const open = await this.db.query<any[]>(`SELECT i.*, d.name device_name, d.host, s.name site_name
      FROM incidents i JOIN devices d ON d.id=i.device_id JOIN sites s ON s.id=d.site_id
      WHERE i.status='open' ORDER BY FIELD(i.severity,'critical','warning'),i.started_at DESC LIMIT 20`);
    const staleSec = Number(process.env.AGENT_STALE_SEC || process.env.PROBE_STALE_SEC || 90);
    const probes = await this.probes();
    for (const p of probes) p.online = !!p.enabled && p.last_seen && Number(p.age_sec) <= staleSec;
    const heartbeat = probes.filter(p=>p.last_seen).sort((a,b)=>Number(a.age_sec)-Number(b.age_sec))[0] || null;
    const wifiOpen = await this.db.query<any[]>(`SELECT COUNT(*) total FROM wifi_alerts WHERE status='open'`);
    const portOpen = await this.db.query<any[]>(`SELECT COUNT(*) total FROM port_alerts WHERE status='open'`);
    const unassigned = await this.db.query<any[]>(`SELECT COUNT(*) total FROM devices d WHERE d.enabled=1 AND (
      (d.probe_id IS NULL AND (SELECT COUNT(*) FROM probes p WHERE p.site_id=d.site_id AND p.enabled=1)<>1)
      OR (d.probe_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM probes p WHERE p.id=d.probe_id AND p.enabled=1 AND (p.site_id IS NULL OR p.site_id=d.site_id)))
    )`);
    const siteCount = await this.db.query<any[]>(`SELECT COUNT(*) total FROM sites WHERE active=1`);
    return {
      devices: counts[0] || {}, openIncidents: open, lastProbeHeartbeat: heartbeat, probes,
      probesOffline: probes.filter(p => !p.online).length, probeStaleSec: staleSec,
      wifiOpenAlerts: Number(wifiOpen[0]?.total || 0), portOpenAlerts:Number(portOpen[0]?.total||0),
      unassignedDevices:Number(unassigned[0]?.total||0), sites:Number(siteCount[0]?.total||0)
    };
  }

  sites() { return this.db.query<any[]>(`SELECT s.*,
    (SELECT COUNT(*) FROM devices d WHERE d.site_id=s.id AND d.lifecycle_status<>'retired') device_count,
    (SELECT COUNT(*) FROM probes p WHERE p.site_id=s.id AND p.enabled=1) agent_count
    FROM sites s ORDER BY s.name`); }

  async createSite(body:any,username?:string) {
    const v:any={criticality:'medium',active:1,...body};
    if(!v.code) v.code=slugCode(v.name);
    const duplicate=await this.db.query<any[]>('SELECT id FROM sites WHERE code=? LIMIT 1',[v.code]);
    if(duplicate.length) throw new BadRequestException(`Ya existe una sede con el código ${v.code}.`);
    const cols=SITE_FIELDS.filter(k=>v[k]!==undefined);
    const vals=cols.map(k=>normalizeDbValue(k,v[k]));
    const r:any=await this.db.query(`INSERT INTO sites(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`,vals);
    const created=(await this.db.query<any[]>('SELECT * FROM sites WHERE id=?',[r.insertId]))[0];
    await this.audit('site',r.insertId,'create',username,null,created,`Alta de sede ${created.name}`);
    return created;
  }

  async updateSite(id:number,body:any,username?:string){
    const before=(await this.db.query<any[]>('SELECT * FROM sites WHERE id=?',[id]))[0];
    if(!before) throw new NotFoundException('Sede no encontrada');
    const v={...before,...body};
    if(!v.code) v.code=slugCode(v.name);
    const duplicate=await this.db.query<any[]>('SELECT id FROM sites WHERE code=? AND id<>? LIMIT 1',[v.code,id]);
    if(duplicate.length) throw new BadRequestException(`Ya existe otra sede con el código ${v.code}.`);
    const sets=SITE_FIELDS.map(k=>`${k}=?`).join(',');
    await this.db.query(`UPDATE sites SET ${sets} WHERE id=?`,[...SITE_FIELDS.map(k=>normalizeDbValue(k,v[k])),id]);
    const after=(await this.db.query<any[]>('SELECT * FROM sites WHERE id=?',[id]))[0];
    await this.audit('site',id,'update',username,before,after,`Edición de sede ${after.name}`);
    return after;
  }

  /** Baja de sede. Exige que no queden equipos ni agentes para no perder histórico por accidente. */
  async deleteSite(id:number,username?:string){
    const before=(await this.db.query<any[]>('SELECT * FROM sites WHERE id=?',[id]))[0];
    if(!before) throw new NotFoundException('Sede no encontrada');
    const devices=Number((await this.db.query<any[]>('SELECT COUNT(*) total FROM devices WHERE site_id=?',[id]))[0]?.total||0);
    if(devices) throw new BadRequestException(`La sede ${before.name} tiene ${devices} equipo(s). Muévalos a otra sede o elimínelos antes de dar de baja la sede; al borrarla se perdería todo su histórico.`);
    const agents=Number((await this.db.query<any[]>('SELECT COUNT(*) total FROM probes WHERE site_id=?',[id]))[0]?.total||0);
    if(agents) throw new BadRequestException(`La sede ${before.name} tiene ${agents} Agente(s) de Sitio asignado(s). Reasígnelos o elimínelos primero.`);
    await this.audit('site',id,'delete',username,before,null,`Baja de sede ${before.name}`);
    await this.db.query('DELETE FROM sites WHERE id=?',[id]);
    return {ok:true};
  }

  probes() { return this.db.query<any[]>(`SELECT ${AGENT_SELECT},s.name site_name,s.code site_code,TIMESTAMPDIFF(SECOND,p.last_seen,UTC_TIMESTAMP()) age_sec,
      (SELECT COUNT(*) FROM devices d WHERE (d.probe_id=p.id AND (p.site_id IS NULL OR d.site_id=p.site_id)) OR (d.probe_id IS NULL AND d.site_id=p.site_id AND (SELECT COUNT(*) FROM probes p2 WHERE p2.site_id=p.site_id AND p2.enabled=1)=1)) device_count
      FROM probes p LEFT JOIN sites s ON s.id=p.site_id ORDER BY COALESCE(s.name,''),p.name`); }

  async createAgent(body:any,username?:string){
    if(body.site_id) await this.validateSiteRelations(body.site_id);
    const token=randomBytes(32).toString('base64url');
    const hash=createHash('sha256').update(token).digest('hex');
    const r:any=await this.db.query('INSERT INTO probes(name,token_hash,site_id,agent_code,description,enabled) VALUES(?,?,?,?,?,1)',[
      body.name,hash,body.site_id||null,body.agent_code||null,body.description||null
    ]);
    const code=body.agent_code||`AGT-${String(r.insertId).padStart(3,'0')}`;
    await this.db.query('UPDATE probes SET agent_code=? WHERE id=?',[code,r.insertId]);
    const created=await this.agentById(r.insertId);
    await this.audit('agent',r.insertId,'create',username,null,created,`Alta de Agente de Sitio ${created.name}`);
    return {...created,agent_token:token,token_notice:'El token sólo se muestra en esta respuesta. Guárdelo en el agente remoto.'};
  }

  /** Devuelve un agente sin columnas sensibles. */
  private async agentById(id:number){
    return (await this.db.query<any[]>(`SELECT ${AGENT_PUBLIC_COLUMNS.join(',')} FROM probes WHERE id=?`,[id]))[0]||null;
  }

  async updateAgent(id:number,body:any,username?:string){
    const before=await this.agentById(id); if(!before) throw new NotFoundException('Agente no encontrado');
    const v={...before,...body};
    const nextSite=v.site_id?Number(v.site_id):null;
    if(nextSite){
      await this.validateSiteRelations(nextSite);
      const incompatible=await this.db.query<any[]>('SELECT id,name,site_id FROM devices WHERE probe_id=? AND site_id<>? LIMIT 5',[id,nextSite]);
      if(incompatible.length) throw new BadRequestException(`No se puede mover el agente a otra sede mientras tenga equipos asignados en la sede anterior. Reasigne primero: ${incompatible.map(x=>x.name).join(', ')}`);
    }
    if(v.agent_code){
      const dup=await this.db.query<any[]>('SELECT id FROM probes WHERE agent_code=? AND id<>? LIMIT 1',[v.agent_code,id]);
      if(dup.length) throw new BadRequestException(`Ya existe otro Agente de Sitio con el código ${v.agent_code}.`);
    }
    await this.db.query('UPDATE probes SET name=?,agent_code=?,site_id=?,description=?,enabled=? WHERE id=?',[v.name,v.agent_code||null,nextSite,v.description||null,v.enabled===false?0:1,id]);
    const after=await this.agentById(id);
    await this.audit('agent',id,'update',username,before,after,`Edición de Agente de Sitio ${after.name}`);
    return after;
  }

  /** Baja de un Agente de Sitio. Los equipos quedan sin agente explícito, nunca se borran. */
  async deleteAgent(id:number,username?:string){
    const before=await this.agentById(id); if(!before) throw new NotFoundException('Agente no encontrado');
    const assigned=await this.db.query<any[]>('SELECT COUNT(*) total FROM devices WHERE probe_id=?',[id]);
    const total=Number(assigned[0]?.total||0);
    await this.db.query('UPDATE devices SET probe_id=NULL WHERE probe_id=?',[id]);
    await this.db.query('UPDATE probe_heartbeats SET probe_id=NULL WHERE probe_id=?',[id]);
    await this.db.query('UPDATE check_results SET probe_id=NULL WHERE probe_id=?',[id]);
    await this.db.query('UPDATE wifi_ap_metrics SET probe_id=NULL WHERE probe_id=?',[id]);
    await this.db.query('DELETE FROM probes WHERE id=?',[id]);
    await this.audit('agent',id,'delete',username,before,null,`Baja de Agente de Sitio ${before.name}. ${total} equipo(s) quedaron sin agente explícito.`);
    return {ok:true,released_devices:total};
  }

  /** Genera un token nuevo e invalida el anterior de inmediato. */
  async regenerateAgentToken(id:number,username?:string){
    const agent=await this.agentById(id); if(!agent) throw new NotFoundException('Agente no encontrado');
    const token=randomBytes(32).toString('base64url');
    const hash=createHash('sha256').update(token).digest('hex');
    await this.db.query('UPDATE probes SET token_hash=? WHERE id=?',[hash,id]);
    await this.audit('agent',id,'rotate-token',username,null,null,`Token regenerado para ${agent.name}. El token anterior quedó revocado.`);
    return {...agent,agent_token:token,token_notice:'Token nuevo. El anterior ya no funciona: actualice agent.env en el sitio y reinicie el agente.'};
  }

  // ===================== Catálogo de VLANs por sede =====================
  /** Lista las VLANs declaradas, con el número de interfaces y equipos que las usan. */
  async vlans(siteId?:any){
    const where = siteId ? 'WHERE v.site_id=?' : '';
    const params = siteId ? [siteId] : [];
    return this.db.query<any[]>(`SELECT v.*, s.name site_name, s.code site_code,
      (SELECT COUNT(*) FROM device_interfaces i JOIN devices d ON d.id=i.device_id
        WHERE d.site_id=v.site_id AND i.vlan_id=v.vlan_id) interface_count,
      (SELECT COUNT(*) FROM devices d WHERE d.site_id=v.site_id AND d.management_vlan=v.vlan_id) management_count
      FROM site_vlans v JOIN sites s ON s.id=v.site_id ${where}
      ORDER BY s.name, v.vlan_id`, params);
  }

  async createVlan(siteId:number, body:any, username?:string){
    await this.validateSiteRelations(siteId);
    validateCidr(body.subnet_cidr);
    const dup=await this.db.query<any[]>('SELECT id FROM site_vlans WHERE site_id=? AND vlan_id=? LIMIT 1',[siteId,body.vlan_id]);
    if(dup.length) throw new BadRequestException(`La VLAN ${body.vlan_id} ya está declarada en esta sede.`);
    const r:any=await this.db.query(`INSERT INTO site_vlans(site_id,vlan_id,name,purpose,subnet_cidr,gateway,dhcp_range,description,active)
      VALUES(?,?,?,?,?,?,?,?,?)`,[siteId,body.vlan_id,body.name,body.purpose||null,body.subnet_cidr||null,body.gateway||null,body.dhcp_range||null,body.description||null,body.active===false?0:1]);
    const created=(await this.db.query<any[]>('SELECT * FROM site_vlans WHERE id=?',[r.insertId]))[0];
    await this.audit('vlan',r.insertId,'create',username,null,created,`Alta de VLAN ${created.vlan_id} (${created.name})`);
    return created;
  }

  async updateVlan(id:number, body:any, username?:string){
    const before=(await this.db.query<any[]>('SELECT * FROM site_vlans WHERE id=?',[id]))[0];
    if(!before) throw new NotFoundException('VLAN no encontrada');
    const v={...before,...body};
    validateCidr(v.subnet_cidr);
    if(Number(v.vlan_id)!==Number(before.vlan_id)){
      const dup=await this.db.query<any[]>('SELECT id FROM site_vlans WHERE site_id=? AND vlan_id=? AND id<>? LIMIT 1',[before.site_id,v.vlan_id,id]);
      if(dup.length) throw new BadRequestException(`La VLAN ${v.vlan_id} ya está declarada en esta sede.`);
      const enUso=Number((await this.db.query<any[]>(`SELECT COUNT(*) total FROM device_interfaces i JOIN devices d ON d.id=i.device_id WHERE d.site_id=? AND i.vlan_id=?`,[before.site_id,before.vlan_id]))[0]?.total||0);
      if(enUso) throw new BadRequestException(`No se puede cambiar el número de la VLAN ${before.vlan_id}: ${enUso} interfaz(ces) la están usando. Reasígnelas primero.`);
    }
    await this.db.query(`UPDATE site_vlans SET vlan_id=?,name=?,purpose=?,subnet_cidr=?,gateway=?,dhcp_range=?,description=?,active=? WHERE id=?`,
      [v.vlan_id,v.name,v.purpose||null,v.subnet_cidr||null,v.gateway||null,v.dhcp_range||null,v.description||null,v.active===false?0:1,id]);
    const after=(await this.db.query<any[]>('SELECT * FROM site_vlans WHERE id=?',[id]))[0];
    await this.audit('vlan',id,'update',username,before,after,`Edición de VLAN ${after.vlan_id}`);
    return after;
  }

  async deleteVlan(id:number, username?:string){
    const before=(await this.db.query<any[]>('SELECT * FROM site_vlans WHERE id=?',[id]))[0];
    if(!before) throw new NotFoundException('VLAN no encontrada');
    const enUso=Number((await this.db.query<any[]>(`SELECT COUNT(*) total FROM device_interfaces i JOIN devices d ON d.id=i.device_id WHERE d.site_id=? AND i.vlan_id=?`,[before.site_id,before.vlan_id]))[0]?.total||0);
    if(enUso) throw new BadRequestException(`La VLAN ${before.vlan_id} está en uso por ${enUso} interfaz(ces). Reasígnelas antes de eliminarla del catálogo.`);
    await this.audit('vlan',id,'delete',username,before,null,`Baja de VLAN ${before.vlan_id}`);
    await this.db.query('DELETE FROM site_vlans WHERE id=?',[id]);
    return {ok:true};
  }

  /**
   * Valida una VLAN contra el catálogo de la sede. Si la sede todavía no declaró
   * ninguna VLAN no se bloquea nada: el catálogo es opcional y se adopta cuando conviene.
   */
  private async validateVlanForSite(siteId:any, vlan:any, campo:string){
    if(vlan===null||vlan===undefined||vlan==='') return null;
    const cat=await this.db.query<any[]>('SELECT vlan_id,name,subnet_cidr FROM site_vlans WHERE site_id=? AND active=1',[siteId]);
    if(!cat.length) return null;
    const encontrada=cat.find(v=>Number(v.vlan_id)===Number(vlan));
    if(!encontrada) throw new BadRequestException(`${campo}: la VLAN ${vlan} no está declarada en el catálogo de esta sede. Declaradas: ${cat.map(v=>`${v.vlan_id} (${v.name})`).join(', ')}.`);
    return encontrada;
  }

  /** Si la VLAN tiene subred declarada, la IP de la interfaz debe caer dentro. */
  private async validateIpInVlan(vlanRow:any, ip:any){
    if(!vlanRow?.subnet_cidr || !ip) return;
    if(!ipInCidr(String(ip), String(vlanRow.subnet_cidr)))
      throw new BadRequestException(`La dirección ${ip} no pertenece a la subred ${vlanRow.subnet_cidr} declarada para la VLAN ${vlanRow.vlan_id} (${vlanRow.name}).`);
  }

  async devices(filters:any={}) {
    const es=this.effectiveStatusSql('d'); const where=['1=1']; const params:any[]=[];
    const add=(sql:string,val:any)=>{ if(val!==undefined&&val!==null&&String(val)!==''){where.push(sql);params.push(val);} };
    add('d.id=?',filters.id);
    add('d.site_id=?',filters.site_id); add('d.device_type=?',filters.device_type);
    if(filters.manufacturer){where.push('d.manufacturer LIKE ?');params.push(`%${String(filters.manufacturer).trim()}%`);}
    if(filters.model){where.push('d.model LIKE ?');params.push(`%${String(filters.model).trim()}%`);}
    add('d.lifecycle_status=?',filters.lifecycle_status); add('d.criticality=?',filters.criticality);
    if(filters.status){ where.push(`(${es})=?`); params.push(filters.status); }
    if(filters.text){ const q=`%${String(filters.text).trim()}%`; where.push('(d.name LIKE ? OR d.host LIKE ? OR d.inventory_number LIKE ? OR d.serial_number LIKE ? OR d.mac_address LIKE ? OR d.hostname LIKE ?)'); params.push(q,q,q,q,q,q); }
    return this.db.query<any[]>(`SELECT d.*,(${es}) effective_status,s.name site_name,s.code site_code,p.name parent_name,pr.name probe_name,pr.agent_code,
      COALESCE(w.enabled,0) wifi_enabled,w.snmp_profile,w.poll_interval_sec wifi_poll_interval_sec,
      w.max_clients wifi_max_clients,w.warn_utilization_pct wifi_warn_utilization,w.critical_utilization_pct wifi_critical_utilization,w.warn_noise_dbm wifi_warn_noise_dbm,
      COALESCE(sw.enabled,0) switch_enabled,sw.snmp_profile switch_snmp_profile,sw.poll_interval_sec switch_poll_interval_sec,
      (SELECT COUNT(*) FROM device_interfaces ni WHERE ni.device_id=d.id) interface_count
      FROM devices d JOIN sites s ON s.id=d.site_id LEFT JOIN devices p ON p.id=d.parent_id LEFT JOIN probes pr ON pr.id=d.probe_id
      LEFT JOIN wifi_ap_config w ON w.device_id=d.id LEFT JOIN switch_monitor_config sw ON sw.device_id=d.id
      WHERE ${where.join(' AND ')} ORDER BY s.name,d.name`,params);
  }

  async deviceDetail(id:number){
    const rows=await this.devices({id}); const device=rows[0];
    if(!device) throw new NotFoundException('Equipo no encontrado');
    const interfaces=await this.deviceInterfaces(id);
    const audit=await this.db.query<any[]>('SELECT id,action,username,summary,created_at FROM inventory_audit WHERE entity_type=\'device\' AND entity_id=? ORDER BY id DESC LIMIT 50',[id]);
    return {device,interfaces,audit};
  }

  async createDevice(body:any,username?:string) {
    await this.validateSiteRelations(body.site_id,body.parent_id);
    await this.validateAgentForSite(body.probe_id,body.site_id);
    const v:any={device_type:'generic',check_type:'ping',interval_sec:60,warning_ms:80,critical_ms:150,enabled:1,addressing_method:'static',lifecycle_status:'active',criticality:'medium',...body};
    this.validateDeviceValues(v);
    await this.validateVlanForSite(v.site_id, v.management_vlan, 'VLAN de gestión');
    const cols=DEVICE_FIELDS.filter(k=>v[k]!==undefined && !['wifi_enabled','snmp_profile','wifi_poll_interval_sec','wifi_max_clients','wifi_warn_utilization','wifi_critical_utilization','wifi_warn_noise_dbm'].includes(k));
    const vals=cols.map(k=>normalizeDbValue(k,v[k]));
    const r:any=await this.db.query(`INSERT INTO devices(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`,vals);
    const esAp=isApType(v.device_type);
    const esSwitch=isSwitchType(v.device_type);
    if (esAp || body.wifi_enabled===true) await this.upsertWifiConfig(r.insertId, body);
    if (esSwitch || body.switch_enabled===true) await this.upsertSwitchConfig(r.insertId, body);
    const created=(await this.db.query<any[]>('SELECT * FROM devices WHERE id=?',[r.insertId]))[0];
    await this.audit('device',r.insertId,'create',username,null,created,`Alta de equipo ${created.name}`);
    return created;
  }

  async deleteDevice(id:number,username?:string){
    const before=(await this.db.query<any[]>('SELECT * FROM devices WHERE id=?',[id]))[0]; if(!before) throw new NotFoundException('Equipo no encontrado');
    await this.audit('device',id,'delete',username,before,null,`Eliminación de equipo ${before.name}`);
    await this.db.query('DELETE FROM devices WHERE id=?',[id]); return {ok:true};
  }

  async updateDevice(id:number, body:any,username?:string){
    const before=(await this.db.query<any[]>('SELECT * FROM devices WHERE id=?',[id]))[0]; if(!before) throw new NotFoundException('Equipo no encontrado');
    const changes=Object.fromEntries(Object.entries(body||{}).filter(([,val])=>val!==undefined)); const v={...before,...changes};
    await this.validateSiteRelations(v.site_id,v.parent_id,id);
    await this.validateAgentForSite(v.probe_id,v.site_id);
    this.validateDeviceValues(v);
    await this.validateVlanForSite(v.site_id, v.management_vlan, 'VLAN de gestión');
    const sets=DEVICE_FIELDS.map(k=>`${k}=?`).join(',');
    await this.db.query(`UPDATE devices SET ${sets} WHERE id=?`,[...DEVICE_FIELDS.map(k=>normalizeDbValue(k,v[k])),id]);
    if(Number(before.site_id)!==Number(v.site_id)){
      await this.db.query(`UPDATE device_interfaces ni JOIN devices sw ON sw.id=ni.switch_device_id SET ni.switch_device_id=NULL,ni.switch_if_index=NULL,ni.switch_port_name=NULL WHERE ni.device_id=? AND sw.site_id<>?`,[id,v.site_id]);
    }
    // Sólo se toca wifi_ap_config si el equipo es un AP o si se pidió habilitarlo explícitamente.
    // Antes bastaba con que el formulario reenviara wifi_enabled=0 para crear config Wi-Fi a impresoras y servidores.
    const tieneWifi=(await this.db.query<any[]>('SELECT device_id FROM wifi_ap_config WHERE device_id=?',[id])).length>0;
    const esAp=isApType(v.device_type);
    if (esAp || body.wifi_enabled===true || (tieneWifi && body.wifi_enabled!==undefined)) await this.upsertWifiConfig(id, body);
    const after=(await this.db.query<any[]>('SELECT * FROM devices WHERE id=?',[id]))[0];
    await this.audit('device',id,'update',username,before,after,`Edición de equipo ${after.name}`);
    return {ok:true,device:after};
  }

  async deviceInterfaces(deviceId:number){
    return this.db.query<any[]>(`SELECT ni.*,sw.name switch_name,st.if_name discovered_switch_port_name,COALESCE(ni.switch_port_name,pc.custom_name,st.if_alias,st.if_name) switch_port_label
      FROM device_interfaces ni LEFT JOIN devices sw ON sw.id=ni.switch_device_id
      LEFT JOIN switch_port_state st ON st.device_id=ni.switch_device_id AND st.if_index=ni.switch_if_index
      LEFT JOIN switch_port_config pc ON pc.device_id=ni.switch_device_id AND pc.if_index=ni.switch_if_index
      WHERE ni.device_id=? ORDER BY ni.primary_interface DESC,ni.name`,[deviceId]);
  }

  async addDeviceInterface(deviceId:number,body:any,username?:string){
    const d=(await this.db.query<any[]>('SELECT id,name,site_id FROM devices WHERE id=?',[deviceId]))[0]; if(!d) throw new NotFoundException('Equipo no encontrado');
    await this.validateInterfaceSwitch(deviceId,body.switch_device_id);
    const vlanRow=await this.validateVlanForSite(d.site_id, body.vlan_id, 'VLAN de la interfaz');
    await this.validateIpInVlan(vlanRow, body.ipv4_address);
    if(body.mac_address) body.mac_address=normalizeMac(body.mac_address);
    if(body.primary_interface) await this.db.query('UPDATE device_interfaces SET primary_interface=0 WHERE device_id=?',[deviceId]);
    const cols=['device_id',...INTERFACE_FIELDS]; const vals=[deviceId,...INTERFACE_FIELDS.map(k=>normalizeDbValue(k,body[k]))];
    const r:any=await this.db.query(`INSERT INTO device_interfaces(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`,vals);
    const created=(await this.db.query<any[]>('SELECT * FROM device_interfaces WHERE id=?',[r.insertId]))[0];
    await this.audit('interface',r.insertId,'create',username,null,created,`Interfaz ${created.name} agregada a ${d.name}`); return created;
  }

  async updateDeviceInterface(id:number,body:any,username?:string){
    const before=(await this.db.query<any[]>('SELECT * FROM device_interfaces WHERE id=?',[id]))[0]; if(!before) throw new NotFoundException('Interfaz no encontrada');
    const v={...before,...body};
    await this.validateInterfaceSwitch(Number(before.device_id),v.switch_device_id);
    const dev=(await this.db.query<any[]>('SELECT site_id FROM devices WHERE id=?',[before.device_id]))[0];
    const vlanRow=await this.validateVlanForSite(dev?.site_id, v.vlan_id, 'VLAN de la interfaz');
    await this.validateIpInVlan(vlanRow, v.ipv4_address);
    if(v.mac_address) v.mac_address=normalizeMac(v.mac_address);
    if(body.primary_interface) await this.db.query('UPDATE device_interfaces SET primary_interface=0 WHERE device_id=?',[before.device_id]);
    await this.db.query(`UPDATE device_interfaces SET ${INTERFACE_FIELDS.map(k=>`${k}=?`).join(',')} WHERE id=?`,[...INTERFACE_FIELDS.map(k=>normalizeDbValue(k,v[k])),id]);
    const after=(await this.db.query<any[]>('SELECT * FROM device_interfaces WHERE id=?',[id]))[0]; await this.audit('interface',id,'update',username,before,after,`Edición de interfaz ${after.name}`); return after;
  }

  async deleteDeviceInterface(id:number,username?:string){
    const before=(await this.db.query<any[]>('SELECT * FROM device_interfaces WHERE id=?',[id]))[0]; if(!before) throw new NotFoundException('Interfaz no encontrada');
    await this.audit('interface',id,'delete',username,before,null,`Eliminación de interfaz ${before.name}`); await this.db.query('DELETE FROM device_interfaces WHERE id=?',[id]); return {ok:true};
  }

  async siteAnalytics(days=30){
    days=Math.min(3650,Math.max(1,Number.isFinite(days)?Math.round(days):30)); const seconds=days*86400;
    const rows=await this.db.query<any[]>(`SELECT s.id,s.code,s.name,s.municipality,s.criticality,
      (SELECT COUNT(*) FROM devices d WHERE d.site_id=s.id AND d.lifecycle_status<>'retired') device_count,
      (SELECT COUNT(*) FROM probes p WHERE p.site_id=s.id AND p.enabled=1) agent_count,
      (SELECT COUNT(*) FROM incidents i JOIN devices d ON d.id=i.device_id WHERE d.site_id=s.id AND i.started_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL ${days} DAY)) incident_count,
      (SELECT COUNT(*) FROM incidents i JOIN devices d ON d.id=i.device_id WHERE d.site_id=s.id AND i.severity='critical' AND i.started_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL ${days} DAY)) critical_incidents,
      (SELECT COUNT(*) FROM incidents i JOIN devices d ON d.id=i.device_id WHERE d.site_id=s.id AND i.status='open') open_incidents,
      (SELECT COALESCE(SUM(TIMESTAMPDIFF(SECOND,GREATEST(i.started_at,DATE_SUB(UTC_TIMESTAMP(),INTERVAL ${days} DAY)),LEAST(COALESCE(i.resolved_at,UTC_TIMESTAMP()),UTC_TIMESTAMP()))),0) FROM incidents i JOIN devices d ON d.id=i.device_id WHERE d.site_id=s.id AND i.started_at<=UTC_TIMESTAMP() AND COALESCE(i.resolved_at,UTC_TIMESTAMP())>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL ${days} DAY)) downtime_seconds,
      (SELECT COALESCE(AVG(TIMESTAMPDIFF(SECOND,i.started_at,i.resolved_at))/60,0) FROM incidents i JOIN devices d ON d.id=i.device_id WHERE d.site_id=s.id AND i.status='resolved' AND i.started_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL ${days} DAY)) mttr_minutes,
      (SELECT COUNT(*) FROM port_alerts a JOIN devices d ON d.id=a.device_id WHERE d.site_id=s.id AND a.started_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL ${days} DAY)) port_alerts,
      (SELECT COUNT(*) FROM wifi_alerts a JOIN devices d ON d.id=a.device_id WHERE d.site_id=s.id AND a.started_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL ${days} DAY)) wifi_alerts
      FROM sites s WHERE s.active=1 ORDER BY s.name`);
    for(const r of rows){
      const capacity=Math.max(1,Number(r.device_count||0))*seconds; r.availability_pct=Math.max(0,Math.min(100,100-(Number(r.downtime_seconds||0)/capacity*100)));
      r.downtime_minutes=Math.round(Number(r.downtime_seconds||0)/60); r.mttr_minutes=Math.round(Number(r.mttr_minutes||0));
      const deviceBase=Math.max(1,Number(r.device_count||0));
      r.incidents_per_100_devices=Number(((Number(r.incident_count||0)/deviceBase)*100).toFixed(2));
      r.alerts_per_100_devices=Number((((Number(r.port_alerts||0)+Number(r.wifi_alerts||0))/deviceBase)*100).toFixed(2));
      r.failure_score=Number(r.critical_incidents||0)*5+Number(r.incident_count||0)*2+Number(r.port_alerts||0)+Number(r.wifi_alerts||0);
      r.risk_score=Number(((r.failure_score/deviceBase)+(100-r.availability_pct)*10).toFixed(2));
      r.health=r.open_incidents>0||r.availability_pct<98?'critical':r.availability_pct<99.5||r.risk_score>10?'warning':'ok';
    }
    return {days,sites:rows,ranking:[...rows].sort((a,b)=>b.risk_score-a.risk_score||b.failure_score-a.failure_score)};
  }

  async inventoryAnalytics(){
    const byType=await this.db.query<any[]>(`SELECT device_type label,COUNT(*) total FROM devices WHERE lifecycle_status<>'retired' GROUP BY device_type ORDER BY total DESC`);
    const byManufacturer=await this.db.query<any[]>(`SELECT COALESCE(NULLIF(manufacturer,''),'Sin especificar') label,COUNT(*) total FROM devices WHERE lifecycle_status<>'retired' GROUP BY manufacturer ORDER BY total DESC LIMIT 30`);
    const warranty=await this.db.query<any[]>(`SELECT COUNT(*) total,COALESCE(SUM(warranty_end IS NOT NULL AND warranty_end<CURDATE()),0) expired,COALESCE(SUM(warranty_end BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 90 DAY)),0) next90 FROM devices WHERE lifecycle_status<>'retired'`);
    return {byType,byManufacturer,warranty:warranty[0]||{}};
  }

  async wifiConfig(deviceId:number) {
    const rows=await this.db.query<any[]>('SELECT * FROM wifi_ap_config WHERE device_id=?',[deviceId]);
    return rows[0] || null;
  }

  async upsertWifiConfig(deviceId:number, body:any) {
    const d=await this.db.query<any[]>('SELECT id FROM devices WHERE id=?',[deviceId]);
    if(!d.length) throw new NotFoundException('Dispositivo no encontrado');
    const current=await this.db.query<any[]>('SELECT * FROM wifi_ap_config WHERE device_id=?',[deviceId]);
    const c=current[0] || {};
    const enabled = body.wifi_enabled ?? c.enabled ?? 0;
    const snmp = body.snmp_profile ?? c.snmp_profile ?? null;
    const poll = Number(body.wifi_poll_interval_sec ?? body.poll_interval_sec ?? c.poll_interval_sec ?? 120);
    const maxClients = Number(body.wifi_max_clients ?? body.max_clients ?? c.max_clients ?? 40);
    const warnUtil = Number(body.wifi_warn_utilization ?? body.warn_utilization_pct ?? c.warn_utilization_pct ?? 70);
    const criticalUtil = Number(body.wifi_critical_utilization ?? body.critical_utilization_pct ?? c.critical_utilization_pct ?? 85);
    const warnNoise = Number(body.wifi_warn_noise_dbm ?? body.warn_noise_dbm ?? c.warn_noise_dbm ?? -75);
    if(warnUtil>=criticalUtil) throw new BadRequestException('El umbral Wi-Fi de advertencia debe ser menor que el crítico.');
    await this.db.query(`INSERT INTO wifi_ap_config(device_id,enabled,snmp_profile,poll_interval_sec,max_clients,warn_utilization_pct,critical_utilization_pct,warn_noise_dbm)
      VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),snmp_profile=VALUES(snmp_profile),poll_interval_sec=VALUES(poll_interval_sec),max_clients=VALUES(max_clients),warn_utilization_pct=VALUES(warn_utilization_pct),critical_utilization_pct=VALUES(critical_utilization_pct),warn_noise_dbm=VALUES(warn_noise_dbm)`,
      [deviceId, enabled?1:0, snmp, Math.max(30,poll), Math.max(1,maxClients), warnUtil, criticalUtil, warnNoise]);
    return this.wifiConfig(deviceId);
  }

  async switchConfig(deviceId:number){
    const rows=await this.db.query<any[]>('SELECT * FROM switch_monitor_config WHERE device_id=?',[deviceId]);
    return rows[0] || null;
  }

  async upsertSwitchConfig(deviceId:number, body:any){
    const d=await this.db.query<any[]>('SELECT id FROM devices WHERE id=?',[deviceId]); if(!d.length) throw new NotFoundException('Switch no encontrado');
    const cur=(await this.db.query<any[]>('SELECT * FROM switch_monitor_config WHERE device_id=?',[deviceId]))[0]||{};
    const v={
      enabled:body.switch_enabled??cur.enabled??0,
      snmp:body.switch_snmp_profile??body.snmp_profile??cur.snmp_profile??null,
      poll:Number(body.switch_poll_interval_sec??body.poll_interval_sec??cur.poll_interval_sec??300),
      crc:Number(body.crc_warn_delta??cur.crc_warn_delta??1),
      util:Number(body.uplink_utilization_pct??cur.uplink_utilization_pct??80),
      hold:Number(body.uplink_hold_minutes??cur.uplink_hold_minutes??10),
      stormPorts:Number(body.storm_min_ports??cur.storm_min_ports??3),
      stormDelta:Number(body.storm_discard_delta??cur.storm_discard_delta??20)
    };
    await this.db.query(`INSERT INTO switch_monitor_config(device_id,enabled,snmp_profile,poll_interval_sec,crc_warn_delta,uplink_utilization_pct,uplink_hold_minutes,storm_min_ports,storm_discard_delta)
      VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),snmp_profile=VALUES(snmp_profile),poll_interval_sec=VALUES(poll_interval_sec),crc_warn_delta=VALUES(crc_warn_delta),uplink_utilization_pct=VALUES(uplink_utilization_pct),uplink_hold_minutes=VALUES(uplink_hold_minutes),storm_min_ports=VALUES(storm_min_ports),storm_discard_delta=VALUES(storm_discard_delta)`,
      [deviceId,v.enabled?1:0,v.snmp,Math.max(60,v.poll),Math.max(1,v.crc),Math.min(100,Math.max(1,v.util)),Math.max(1,v.hold),Math.max(2,v.stormPorts),Math.max(1,v.stormDelta)]);
    return this.switchConfig(deviceId);
  }

  async updatePortConfig(deviceId:number,ifIndex:number,body:any){
    const dev=await this.db.query<any[]>('SELECT id FROM devices WHERE id=?',[deviceId]); if(!dev.length) throw new NotFoundException('Switch no encontrado');
    const current=(await this.db.query<any[]>('SELECT * FROM switch_port_config WHERE device_id=? AND if_index=?',[deviceId,ifIndex]))[0]||{};
    const custom=(body.custom_name!==undefined?body.custom_name:current.custom_name)||null;
    const critical=body.critical!==undefined?body.critical:!!current.critical;
    const uplink=body.is_uplink!==undefined?body.is_uplink:!!current.is_uplink;
    const expected=body.expected_speed_mbps!==undefined?body.expected_speed_mbps:current.expected_speed_mbps;
    const enabled=body.enabled!==undefined?body.enabled:(current.enabled===undefined?true:!!current.enabled);
    await this.db.query(`INSERT INTO switch_port_config(device_id,if_index,custom_name,critical,is_uplink,expected_speed_mbps,enabled)
      VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE custom_name=VALUES(custom_name),critical=VALUES(critical),is_uplink=VALUES(is_uplink),expected_speed_mbps=VALUES(expected_speed_mbps),enabled=VALUES(enabled)`,
      [deviceId,ifIndex,custom,critical?1:0,uplink?1:0,expected||null,enabled?1:0]);
    return {ok:true};
  }

  /** Quita el monitoreo Wi-Fi de un AP. Las métricas históricas se conservan. */
  async deleteWifiConfig(deviceId:number,username?:string){
    const before=await this.wifiConfig(deviceId); if(!before) throw new NotFoundException('Este equipo no tiene configuración Wi-Fi.');
    await this.db.query('DELETE FROM wifi_ap_config WHERE device_id=?',[deviceId]);
    await this.db.query("UPDATE wifi_alerts SET status='resolved',resolved_at=UTC_TIMESTAMP(),last_event_at=UTC_TIMESTAMP() WHERE device_id=? AND status='open'",[deviceId]);
    await this.audit('wifi-config',deviceId,'delete',username,before,null,'Monitoreo Wi-Fi retirado del equipo');
    return {ok:true};
  }

  /** Quita el monitoreo SNMP de puertos de un switch. El estado y las métricas se conservan. */
  async deleteSwitchConfig(deviceId:number,username?:string){
    const before=await this.switchConfig(deviceId); if(!before) throw new NotFoundException('Este switch no tiene monitoreo de puertos configurado.');
    await this.db.query('DELETE FROM switch_monitor_config WHERE device_id=?',[deviceId]);
    await this.db.query("UPDATE port_alerts SET status='resolved',resolved_at=UTC_TIMESTAMP(),last_event_at=UTC_TIMESTAMP() WHERE device_id=? AND status='open'",[deviceId]);
    await this.audit('switch-config',deviceId,'delete',username,before,null,'Monitoreo de puertos retirado del switch');
    return {ok:true};
  }

  /** Devuelve un puerto a sus valores por defecto (sin nombre funcional, ni crítico, ni uplink). */
  async deletePortConfig(deviceId:number,ifIndex:number,username?:string){
    const before=(await this.db.query<any[]>('SELECT * FROM switch_port_config WHERE device_id=? AND if_index=?',[deviceId,ifIndex]))[0];
    if(!before) throw new NotFoundException('Este puerto no tiene configuración personalizada.');
    await this.db.query('DELETE FROM switch_port_config WHERE device_id=? AND if_index=?',[deviceId,ifIndex]);
    await this.audit('port-config',deviceId,'delete',username,before,null,`Configuración del puerto ${ifIndex} restablecida`);
    return {ok:true};
  }

  async switchSummary(){
    const counts=await this.db.query<any[]>(`SELECT COUNT(*) total,COALESCE(SUM(sw.enabled=1),0) enabled FROM switch_monitor_config sw JOIN devices d ON d.id=sw.device_id WHERE d.enabled=1`);
    const open=await this.db.query<any[]>(`SELECT COUNT(*) total,COALESCE(SUM(severity='critical'),0) critical,COALESCE(SUM(severity='warning'),0) warning FROM port_alerts WHERE status='open'`);
    return {switches:counts[0]||{},alerts:open[0]||{}};
  }

  async portProblems(){
    return this.db.query<any[]>(`SELECT a.*,d.name switch_name,d.host,s.name site_name,st.if_name,st.if_alias,st.oper_status,st.speed_mbps,st.duplex,st.lldp_neighbor,st.lldp_port,
      pc.custom_name,pc.critical,pc.is_uplink,CASE WHEN a.if_index=0 THEN 'Múltiples puertos / switch' ELSE COALESCE(pc.custom_name,NULLIF(st.if_alias,''),st.if_name,CONCAT('Puerto ',a.if_index)) END port_name
      FROM port_alerts a JOIN devices d ON d.id=a.device_id JOIN sites s ON s.id=d.site_id
      LEFT JOIN switch_port_state st ON st.device_id=a.device_id AND st.if_index=a.if_index
      LEFT JOIN switch_port_config pc ON pc.device_id=a.device_id AND pc.if_index=a.if_index
      WHERE a.status='open' ORDER BY FIELD(a.severity,'critical','warning'),a.started_at,a.device_id,a.if_index LIMIT 300`);
  }

  async switchPorts(deviceId:number){
    const device=(await this.db.query<any[]>(`SELECT d.*,s.name site_name,sw.enabled switch_enabled,sw.snmp_profile switch_snmp_profile,sw.poll_interval_sec switch_poll_interval_sec,
      sw.crc_warn_delta,sw.uplink_utilization_pct,sw.uplink_hold_minutes,sw.storm_min_ports,sw.storm_discard_delta
      FROM devices d JOIN sites s ON s.id=d.site_id LEFT JOIN switch_monitor_config sw ON sw.device_id=d.id WHERE d.id=?`,[deviceId]))[0];
    if(!device) throw new NotFoundException('Switch no encontrado');
    const ports=await this.db.query<any[]>(`SELECT st.*,pc.custom_name,COALESCE(pc.critical,0) critical,COALESCE(pc.is_uplink,0) is_uplink,pc.expected_speed_mbps,COALESCE(pc.enabled,1) port_enabled,
      (SELECT a.severity FROM port_alerts a WHERE a.device_id=st.device_id AND a.if_index=st.if_index AND a.status='open' ORDER BY FIELD(a.severity,'critical','warning') LIMIT 1) problem_severity,
      (SELECT COUNT(*) FROM port_alerts a WHERE a.device_id=st.device_id AND a.if_index=st.if_index AND a.status='open') problem_count
      FROM switch_port_state st LEFT JOIN switch_port_config pc ON pc.device_id=st.device_id AND pc.if_index=st.if_index
      WHERE st.device_id=? ORDER BY st.if_index`,[deviceId]);
    return {device,ports};
  }

  async switchPortHistory(deviceId:number,ifIndex:number){
    const metrics=await this.db.query<any[]>(`SELECT * FROM switch_port_metrics WHERE device_id=? AND if_index=? AND checked_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR) ORDER BY checked_at ASC LIMIT 1000`,[deviceId,ifIndex]);
    const alerts=await this.db.query<any[]>(`SELECT * FROM port_alerts WHERE device_id=? AND if_index=? ORDER BY started_at DESC LIMIT 100`,[deviceId,ifIndex]);
    return {metrics,alerts};
  }

  private async getProbeByHash(tokenHash:string){
    const rows=await this.db.query<any[]>('SELECT * FROM probes WHERE token_hash=? AND enabled=1',[tokenHash]);
    return rows[0]||null;
  }

  async probeConfig(tokenHash:string) {
    const probe=await this.getProbeByHash(tokenHash); if(!probe) return [];
    const params:any[]=[probe.id]; let scope='d.probe_id=?';
    if(probe.site_id){
      const siblings=await this.db.query<any[]>('SELECT COUNT(*) total FROM probes WHERE site_id=? AND enabled=1',[probe.site_id]);
      if(Number(siblings[0]?.total||0)===1){ scope='((d.probe_id=? AND d.site_id=?) OR (d.probe_id IS NULL AND d.site_id=?))'; params.push(probe.site_id,probe.site_id); }
      else { scope='(d.probe_id=? AND d.site_id=?)'; params.push(probe.site_id); }
    }
    const devices=await this.db.query<any[]>(`SELECT d.id,d.site_id,d.name,d.host,d.device_type,d.check_type,d.check_port,d.check_path,d.interval_sec,d.warning_ms,d.critical_ms,d.parent_id,
      d.hostname,d.manufacturer,d.model,d.serial_number,d.mac_address,d.criticality,d.building,d.floor,d.area,d.room,d.rack_name,d.rack_unit,
      COALESCE(w.enabled,0) wifi_enabled,w.snmp_profile,w.poll_interval_sec wifi_poll_interval_sec,
      COALESCE(sw.enabled,0) switch_enabled,sw.snmp_profile switch_snmp_profile,sw.poll_interval_sec switch_poll_interval_sec,
      sw.crc_warn_delta,sw.uplink_utilization_pct,sw.uplink_hold_minutes,sw.storm_min_ports,sw.storm_discard_delta
      FROM devices d LEFT JOIN wifi_ap_config w ON w.device_id=d.id LEFT JOIN switch_monitor_config sw ON sw.device_id=d.id
      WHERE d.enabled=1 AND d.lifecycle_status NOT IN ('retired','replaced') AND ${scope} ORDER BY d.id`,params);
    if(devices.length){
      const ids=devices.map((d:any)=>d.id); const placeholders=ids.map(()=>'?').join(',');
      const cfg=await this.db.query<any[]>(`SELECT * FROM switch_port_config WHERE device_id IN (${placeholders}) AND enabled=1 ORDER BY device_id,if_index`,ids);
      const by=new Map<number,any[]>(); for(const p of cfg){ if(!by.has(p.device_id))by.set(p.device_id,[]);by.get(p.device_id)!.push(p); }
      for(const d of devices) d.switch_ports=by.get(d.id)||[];
    }
    return devices;
  }

  async heartbeat(body:any,tokenHash:string) {
    const name=String(body.agent_name||body.probe_name||'Agente').slice(0,120);
    const existing=await this.db.query<any[]>('SELECT * FROM probes WHERE token_hash=? LIMIT 1',[tokenHash]);
    if(!existing.length){
      // Sólo ocurre con el token bootstrap de compatibilidad V0.3.
      await this.db.query(`INSERT INTO probes(name,token_hash,agent_code,version,hostname,ip_address,platform,os_version,architecture,buffer_depth,last_seen,last_sync_at)
        VALUES(?,?,?, ?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,[name,tokenHash,`AGT-${Date.now().toString(36).toUpperCase()}`,body.version||null,body.hostname||null,body.ip_address||null,body.platform||null,body.os_version||null,body.architecture||null,Number(body.buffer_depth||0)]);
    }else{
      await this.db.query(`UPDATE probes SET version=?,hostname=?,ip_address=?,platform=?,os_version=?,architecture=?,buffer_depth=?,last_seen=UTC_TIMESTAMP(),last_sync_at=UTC_TIMESTAMP() WHERE token_hash=?`,
        [body.version||null,body.hostname||null,body.ip_address||null,body.platform||null,body.os_version||null,body.architecture||null,Number(body.buffer_depth||0),tokenHash]);
    }
    const probe=await this.getProbeByHash(tokenHash);
    await this.db.query('INSERT INTO probe_heartbeats(probe_id,probe_name,version,hostname,ip_address,created_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP())',[probe?.id||null,probe?.name||name,body.version||null,body.hostname||null,body.ip_address||null]);
    return {ok:true,agent_id:probe?.id||null,probe_id:probe?.id||null,site_id:probe?.site_id||null,server_time:new Date().toISOString()};
  }

  private async assertProbeOwnsDevice(deviceId:number,tokenHash:string){
    const probe=await this.getProbeByHash(tokenHash); if(!probe) throw new ForbiddenException('Agente de Sitio no registrado o deshabilitado.');
    const rows=await this.db.query<any[]>('SELECT * FROM devices WHERE id=?',[deviceId]); if(!rows.length) throw new NotFoundException('Dispositivo no encontrado');
    const d=rows[0]; const sameSite=!probe.site_id || Number(d.site_id)===Number(probe.site_id); const explicit=Number(d.probe_id)===Number(probe.id) && sameSite; let inherited=false;
    if(!d.probe_id && probe.site_id && Number(d.site_id)===Number(probe.site_id)){ const siblings=await this.db.query<any[]>('SELECT COUNT(*) total FROM probes WHERE site_id=? AND enabled=1',[probe.site_id]); inherited=Number(siblings[0]?.total||0)===1; }
    if(!explicit && !inherited) throw new ForbiddenException('Este equipo no pertenece al Agente de Sitio autenticado o la sede tiene varios agentes y requiere asignación explícita.');
    return {probe,device:d};
  }

  async ingestResult(body:any,tokenHash:string) {
    const {probe,device:d}=await this.assertProbeOwnsDevice(Number(body.device_id),tokenHash);
    const latency=numOrNull(body.latency_ms);
    let status=['ok','warning','critical','down'].includes(body.status)?body.status:'down';
    if(status==='ok' && latency!==null && latency>=d.critical_ms) status='critical'; else if(status==='ok' && latency!==null && latency>=d.warning_ms) status='warning';
    const now = safeCheckedAt(body.checked_at);
    await this.db.query('INSERT INTO check_results(device_id,probe_id,status,latency_ms,packet_loss,message,checked_at,received_at) VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP())',[d.id,probe.id,status,latency,body.packet_loss??null,body.message||null,now]);
    const failNeed=Math.max(1,Number(process.env.FAIL_CONFIRMATIONS||3)); const okNeed=Math.max(1,Number(process.env.RECOVERY_CONFIRMATIONS||2));
    if(status==='ok'){
      const successes=Number(d.consecutive_successes||0)+1;
      await this.db.query('UPDATE devices SET last_status=?,last_latency_ms=?,last_checked_at=?,consecutive_failures=0,consecutive_successes=? WHERE id=?',[status,latency,now,successes,d.id]);
      if(successes>=okNeed) await this.reconcileIncident(d,'ok',body.message||null,now);
    }else{
      const failures=Number(d.consecutive_failures||0)+1;
      await this.db.query('UPDATE devices SET last_status=?,last_latency_ms=?,last_checked_at=?,consecutive_failures=?,consecutive_successes=0 WHERE id=?',[status,latency,now,failures,d.id]);
      if(failures>=failNeed) await this.reconcileIncident(d,status,body.message||null,now);
    }
    return {ok:true,status};
  }

  private async reconcileIncident(d:any,status:string,message:string|null,now:Date){
    const open=await this.db.query<any[]>('SELECT * FROM incidents WHERE device_id=? AND status=\'open\' ORDER BY id DESC LIMIT 1',[d.id]);
    if(status==='ok'){
      if(open.length) await this.db.query("UPDATE incidents SET status='resolved',resolved_at=?,last_event_at=? WHERE id=?",[now,now,open[0].id]);
      return;
    }
    const severity=(status==='down'||status==='critical')?'critical':'warning';
    const diagnosis=await this.diagnose(d,status,message);
    if(open.length) await this.db.query('UPDATE incidents SET severity=?,diagnosis=?,last_event_at=? WHERE id=?',[severity,diagnosis,now,open[0].id]);
    else await this.db.query("INSERT INTO incidents(device_id,status,severity,title,diagnosis,started_at,last_event_at) VALUES(?,'open',?,'Falla de conectividad',?,?,?)",[d.id,severity,diagnosis,now,now]);
  }

  private async diagnose(d:any,status:string,message:string|null){
    if(d.parent_id){
      const p=await this.db.query<any[]>('SELECT name,last_status,last_checked_at,interval_sec FROM devices WHERE id=?',[d.parent_id]);
      if(p[0] && ['down','critical'].includes(p[0].last_status)) return `El equipo padre ${p[0].name} también está sin comunicación. Revisar primero alimentación, uplink, fibra/SFP o enlace del equipo padre.`;
    }
    const type=String(d.device_type||'').toLowerCase();
    if(type.includes('dns')) return 'Posible falla de resolución DNS. Confirmar conectividad IP y revisar el servicio DNS configurado.';
    if(type.includes('internet')||type.includes('wan')) return 'Posible degradación o caída del enlace WAN/ISP. Revisar ONT/módem, interfaz WAN, ruta por defecto y estado del proveedor.';
    if(isSwitchType(type)||type.includes('switch')) return 'Posible falla de switch, alimentación o uplink. Revisar energía, puerto troncal, negociación, SFP/fibra y errores de interfaz.';
    if(isApType(type)) return 'Posible falla del AP, PoE o puerto de acceso. Revisar alimentación PoE, puerto del switch, cableado y conectividad hacia el controlador si existe.';
    return `El equipo no responde correctamente. ${message||'Revisar energía, cableado, interfaz de red y dependencia superior.'}`;
  }

  /**
   * Tablero de sala de control: todas las incidencias activas en una sola consulta,
   * unificando caídas de equipo, alertas de puerto, alertas Wi-Fi y agentes sin comunicación.
   * Cada evento trae un event_id estable para que la interfaz distinga los nuevos y suene sólo una vez.
   */
  async monitorEvents(){
    const staleSec = Number(process.env.AGENT_STALE_SEC || process.env.PROBE_STALE_SEC || 90);
    const rows = await this.db.query<any[]>(`
      SELECT * FROM (
      SELECT CONCAT('incident:',i.id) event_id,'incident' kind,i.severity severity,i.title,i.diagnosis,
             i.started_at started_at,i.last_event_at,d.id device_id,d.name device_name,d.host,d.device_type,
             s.id site_id,s.name site_name,s.code site_code,s.criticality site_criticality,NULL if_index
        FROM incidents i JOIN devices d ON d.id=i.device_id JOIN sites s ON s.id=d.site_id
       WHERE i.status='open'
      UNION ALL
      SELECT CONCAT('port:',a.id),'port',a.severity,a.title,a.diagnosis,a.started_at,a.last_event_at,
             d.id,d.name,d.host,d.device_type,s.id,s.name,s.code,s.criticality,a.if_index
        FROM port_alerts a JOIN devices d ON d.id=a.device_id JOIN sites s ON s.id=d.site_id
       WHERE a.status='open'
      UNION ALL
      SELECT CONCAT('wifi:',a.id),'wifi',a.severity,a.title,a.diagnosis,a.started_at,a.last_event_at,
             d.id,d.name,d.host,d.device_type,s.id,s.name,s.code,s.criticality,NULL
        FROM wifi_alerts a JOIN devices d ON d.id=a.device_id JOIN sites s ON s.id=d.site_id
       WHERE a.status='open'
      ) eventos
      ORDER BY FIELD(eventos.severity,'critical','warning'), eventos.started_at DESC
      LIMIT 500`);

    // Un agente caído no genera incidencia por equipo, pero es lo más grave que puede pasar:
    // esa sede deja de medirse por completo y sus equipos quedarían en 'sin datos' silenciosamente.
    const agents = await this.db.query<any[]>(`SELECT p.id,p.name,p.agent_code,p.last_seen,
        TIMESTAMPDIFF(SECOND,p.last_seen,UTC_TIMESTAMP()) age_sec,
        s.id site_id,s.name site_name,s.code site_code,s.criticality site_criticality
        FROM probes p LEFT JOIN sites s ON s.id=p.site_id WHERE p.enabled=1`);
    const agentEvents = agents
      .filter(a => !a.last_seen || Number(a.age_sec) > staleSec)
      .map(a => ({
        event_id:`agent:${a.id}`, kind:'agent', severity:'critical',
        title:`Agente ${a.name} sin comunicación`,
        diagnosis: a.last_seen
          ? `Sin heartbeat desde hace ${Math.round(Number(a.age_sec)/60)} minuto(s). Mientras tanto los equipos de esta sede no se están midiendo. Revise el equipo donde corre el agente y el enlace de la sede.`
          : 'El agente nunca ha reportado. Verifique que esté instalado e iniciado en la sede y que el token sea el correcto.',
        started_at: a.last_seen, last_event_at: a.last_seen,
        device_id:null, device_name:a.name, host:a.agent_code||'', device_type:'agent',
        site_id:a.site_id, site_name:a.site_name||'Sin sede', site_code:a.site_code,
        site_criticality:a.site_criticality, if_index:null
      }));

    const events = [...agentEvents, ...rows];
    const bySite = new Map<string, any>();
    for (const e of events) {
      const key = String(e.site_id ?? 'sin-sede');
      if (!bySite.has(key)) bySite.set(key, { site_id:e.site_id, site_name:e.site_name, site_code:e.site_code,
        site_criticality:e.site_criticality, critical:0, warning:0, total:0, kinds:{incident:0,port:0,wifi:0,agent:0} });
      const g = bySite.get(key);
      g.total++;
      if (e.severity === 'critical') g.critical++; else g.warning++;
      g.kinds[e.kind] = (g.kinds[e.kind] || 0) + 1;
    }
    const sites = [...bySite.values()].sort((a,b)=>b.critical-a.critical||b.total-a.total);
    return {
      generated_at: new Date().toISOString(),
      stale_sec: staleSec,
      counts: {
        total: events.length,
        critical: events.filter(e=>e.severity==='critical').length,
        warning: events.filter(e=>e.severity==='warning').length,
        sites: sites.length,
        agents_offline: agentEvents.length
      },
      sites, events
    };
  }

  incidents(){ return this.db.query<any[]>(`SELECT i.*, d.name device_name,d.host,s.name site_name FROM incidents i JOIN devices d ON d.id=i.device_id JOIN sites s ON s.id=d.site_id ORDER BY i.started_at DESC LIMIT 200`); }
  async results(deviceId:number){ return this.db.query<any[]>('SELECT * FROM check_results WHERE device_id=? ORDER BY checked_at DESC LIMIT 500',[deviceId]); }

  async wifiSummary(){
    const es=this.effectiveStatusSql('d');
    const counts=await this.db.query<any[]>(`SELECT COUNT(*) total,
      COALESCE(SUM((${es})='ok'),0) online,
      COALESCE(SUM(((${es})='warning') OR ((${es})='critical')),0) warning,
      COALESCE(SUM((${es})='down'),0) down,
      COALESCE(SUM((${es})='unknown'),0) unknown
      FROM wifi_ap_config w JOIN devices d ON d.id=w.device_id WHERE w.enabled=1 AND d.enabled=1`);
    const aps=await this.db.query<any[]>(`SELECT d.id,d.name,d.host,(${es}) effective_status,d.last_status,d.last_latency_ms,d.last_checked_at,s.name site_name,
      w.snmp_profile,w.poll_interval_sec,w.max_clients,w.warn_utilization_pct,w.critical_utilization_pct,w.warn_noise_dbm,
      m.collector_status,m.message collector_message,m.client_count,m.uptime_sec,m.poe_watts,m.uplink_mbps,m.cpu_pct,m.memory_pct,m.checked_at wifi_checked_at
      FROM wifi_ap_config w JOIN devices d ON d.id=w.device_id JOIN sites s ON s.id=d.site_id
      LEFT JOIN wifi_ap_metrics m ON m.id=(SELECT MAX(m2.id) FROM wifi_ap_metrics m2 WHERE m2.device_id=d.id)
      WHERE w.enabled=1 AND d.enabled=1 ORDER BY s.name,d.name`);
    const radios=await this.db.query<any[]>(`SELECT r.*,d.name device_name,s.name site_name FROM wifi_radio_metrics r
      JOIN devices d ON d.id=r.device_id JOIN sites s ON s.id=d.site_id
      WHERE r.id IN (SELECT MAX(r2.id) FROM wifi_radio_metrics r2 GROUP BY r2.device_id,r2.radio_name)
      ORDER BY s.name,d.name,r.band,r.radio_name`);
    const ssids=await this.db.query<any[]>(`SELECT x.*,d.name device_name,s.name site_name FROM wifi_ssid_metrics x
      JOIN devices d ON d.id=x.device_id JOIN sites s ON s.id=d.site_id
      WHERE x.id IN (SELECT MAX(x2.id) FROM wifi_ssid_metrics x2 GROUP BY x2.device_id,x2.ssid,x2.band)
      ORDER BY s.name,d.name,x.ssid,x.band`);
    const alerts=await this.db.query<any[]>(`SELECT a.*,d.name device_name,s.name site_name FROM wifi_alerts a
      JOIN devices d ON d.id=a.device_id JOIN sites s ON s.id=d.site_id WHERE a.status='open' ORDER BY FIELD(a.severity,'critical','warning'),a.started_at DESC LIMIT 100`);
    const totalClients=aps.reduce((sum:number,a:any)=>sum+Number(a.client_count||0),0);
    return {counts:counts[0]||{},totalClients,aps,radios,ssids,openAlerts:alerts};
  }

  async wifiHistory(deviceId:number){
    return {
      ap: await this.db.query<any[]>('SELECT * FROM wifi_ap_metrics WHERE device_id=? ORDER BY checked_at DESC LIMIT 250',[deviceId]),
      radios: await this.db.query<any[]>('SELECT * FROM wifi_radio_metrics WHERE device_id=? ORDER BY checked_at DESC LIMIT 500',[deviceId]),
      ssids: await this.db.query<any[]>('SELECT * FROM wifi_ssid_metrics WHERE device_id=? ORDER BY checked_at DESC LIMIT 500',[deviceId]),
      alerts: await this.db.query<any[]>('SELECT * FROM wifi_alerts WHERE device_id=? ORDER BY started_at DESC LIMIT 250',[deviceId])
    };
  }

  async ingestWifiResult(body:any,tokenHash:string){
    const {probe}=await this.assertProbeOwnsDevice(Number(body.device_id),tokenHash);
    const drows=await this.db.query<any[]>(`SELECT d.*,w.enabled wifi_enabled,w.snmp_profile,w.max_clients,w.warn_utilization_pct,w.critical_utilization_pct,w.warn_noise_dbm
      FROM devices d JOIN wifi_ap_config w ON w.device_id=d.id WHERE d.id=?`,[body.device_id]);
    if(!drows.length) throw new NotFoundException('AP Wi-Fi no configurado');
    const d=drows[0]; const now=safeCheckedAt(body.checked_at); const ap=body.ap||{}; const collectorStatus=body.collector_status||'ok';
    await this.db.query(`INSERT INTO wifi_ap_metrics(device_id,probe_id,collector_status,message,client_count,uptime_sec,poe_watts,uplink_mbps,cpu_pct,memory_pct,checked_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`,[d.id,probe.id,collectorStatus,body.message||null,numOrNull(ap.client_count),numOrNull(ap.uptime_sec),numOrNull(ap.poe_watts),numOrNull(ap.uplink_mbps),numOrNull(ap.cpu_pct),numOrNull(ap.memory_pct),now]);
    for(const r of Array.isArray(body.radios)?body.radios:[]) await this.db.query(`INSERT INTO wifi_radio_metrics(device_id,radio_name,band,status,channel_no,channel_width_mhz,client_count,utilization_pct,noise_dbm,tx_power_dbm,checked_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`,[d.id,r.name||'radio',r.band||null,r.status||null,intOrNull(r.channel),intOrNull(r.channel_width_mhz),intOrNull(r.client_count),numOrNull(r.utilization_pct),numOrNull(r.noise_dbm),numOrNull(r.tx_power_dbm),now]);
    for(const s of Array.isArray(body.ssids)?body.ssids:[]) await this.db.query(`INSERT INTO wifi_ssid_metrics(device_id,ssid,band,status,client_count,checked_at) VALUES(?,?,?,?,?,?)`,[d.id,s.ssid||s.name||'SSID',s.band||null,s.status||null,intOrNull(s.client_count),now]);
    await this.evaluateWifi(d,collectorStatus,body,now); return {ok:true};
  }

  private async evaluateWifi(d:any,collectorStatus:string,body:any,now:Date){
    await this.reconcileWifiAlert(d.id,'collector',collectorStatus!=='ok','warning','No se pudieron obtener métricas Wi-Fi',`La sonda no pudo consultar el perfil ${d.snmp_profile||'(sin perfil)'}. ${body.message||'Revise conectividad UDP/161, credenciales SNMPv3 y OIDs del fabricante.'}`,now);
    const clients=numOrNull(body.ap?.client_count);
    if(clients!==null){ const critical=clients>=Math.ceil(Number(d.max_clients||40)*1.25); const warning=clients>=Number(d.max_clients||40); await this.reconcileWifiAlert(d.id,'clients:ap',warning||critical,critical?'critical':'warning','Alta concentración de clientes',`El AP reporta ${clients} clientes; el umbral configurado es ${d.max_clients}. Revisar distribución entre AP, potencia, roaming, capacidad y cobertura antes de modificar configuración.`,now); }
    for(const r of Array.isArray(body.radios)?body.radios:[]){
      const name=String(r.name||'radio'); const status=String(r.status||'').toLowerCase();
      await this.reconcileWifiAlert(d.id,`radio:${name}:down`,status==='down'||status==='disabled','critical',`Radio ${name} fuera de servicio`,`La radio ${name}${r.band?` (${r.band})`:''} no está operativa. Revisar estado en controlador/AP, alimentación, configuración y eventos del equipo.`,now);
      const util=numOrNull(r.utilization_pct); if(util!==null){ const crit=util>=Number(d.critical_utilization_pct||85); const warn=util>=Number(d.warn_utilization_pct||70); await this.reconcileWifiAlert(d.id,`radio:${name}:util`,warn||crit,crit?'critical':'warning',`Alta utilización de canal en ${name}`,`Utilización ${util}% en ${name}. Revisar interferencia/co-canal, ancho de canal, distribución de AP y carga de clientes. No cambiar canal o potencia automáticamente.`,now); }
      const noise=numOrNull(r.noise_dbm); if(noise!==null){ const warn=noise>Number(d.warn_noise_dbm??-75); await this.reconcileWifiAlert(d.id,`radio:${name}:noise`,warn,'warning',`Nivel de ruido elevado en ${name}`,`Ruido ${noise} dBm; umbral ${d.warn_noise_dbm} dBm. Revisar interferencias y confirmar con herramientas del fabricante o análisis de espectro antes de intervenir.`,now); }
    }
    for(const s of Array.isArray(body.ssids)?body.ssids:[]){ const status=String(s.status||'').toLowerCase(); const ssid=String(s.ssid||s.name||'SSID'); await this.reconcileWifiAlert(d.id,`ssid:${ssid}:${s.band||'all'}`,status==='down'||status==='disabled','warning',`SSID ${ssid} no disponible`,`El AP reporta el SSID ${ssid} como ${status||'no disponible'}. Corroborar en el controlador y revisar si la condición es intencional.`,now); }
  }

  private async reconcileWifiAlert(deviceId:number,key:string,active:boolean,severity:string,title:string,diagnosis:string,now:Date){
    const open=await this.db.query<any[]>('SELECT * FROM wifi_alerts WHERE device_id=? AND alert_key=? AND status=\'open\' ORDER BY id DESC LIMIT 1',[deviceId,key]);
    if(!active){ if(open.length) await this.db.query("UPDATE wifi_alerts SET status='resolved',resolved_at=?,last_event_at=? WHERE id=?",[now,now,open[0].id]); return; }
    if(open.length) await this.db.query('UPDATE wifi_alerts SET severity=?,title=?,diagnosis=?,last_event_at=? WHERE id=?',[severity,title,diagnosis,now,open[0].id]);
    else await this.db.query("INSERT INTO wifi_alerts(device_id,alert_key,status,severity,title,diagnosis,started_at,last_event_at) VALUES(?,?, 'open',?,?,?,?,?)",[deviceId,key,severity,title,diagnosis,now,now]);
  }

  async ingestSwitchResult(body:any,tokenHash:string){
    const {device:d}=await this.assertProbeOwnsDevice(Number(body.device_id),tokenHash);
    const cfg=(await this.db.query<any[]>('SELECT * FROM switch_monitor_config WHERE device_id=? AND enabled=1',[d.id]))[0];
    if(!cfg) throw new NotFoundException('Monitoreo de puertos no habilitado para este switch');
    const now=safeCheckedAt(body.checked_at); const collector=String(body.collector_status||'ok');
    await this.reconcilePortAlert(d.id,0,'collector',collector!=='ok','warning','No se pudieron leer los puertos por SNMP',body.message||'Revise conectividad UDP/161, credenciales SNMPv3 y soporte IF-MIB/EtherLike-MIB.',now);
    if(collector!=='ok') return {ok:true,stored:0};

    const states=Array.isArray(body.states)?body.states:[]; const ports=Array.isArray(body.ports)?body.ports:[];
    for(const s of states){
      const idx=intOrNull(s.if_index); if(idx===null) continue;
      const speed=intOrNull(s.speed_mbps); const up=String(s.oper_status||'').toLowerCase()==='up';
      await this.db.query(`INSERT INTO switch_port_state(device_id,if_index,if_name,if_descr,if_alias,admin_status,oper_status,speed_mbps,max_speed_seen_mbps,duplex,lldp_neighbor,lldp_port,last_checked_at,last_up_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE if_name=VALUES(if_name),if_descr=VALUES(if_descr),if_alias=VALUES(if_alias),admin_status=VALUES(admin_status),oper_status=VALUES(oper_status),speed_mbps=VALUES(speed_mbps),max_speed_seen_mbps=GREATEST(COALESCE(max_speed_seen_mbps,0),COALESCE(VALUES(speed_mbps),0)),duplex=VALUES(duplex),lldp_neighbor=VALUES(lldp_neighbor),lldp_port=VALUES(lldp_port),last_checked_at=VALUES(last_checked_at),last_up_at=IF(VALUES(oper_status)='up',VALUES(last_checked_at),last_up_at)`,
        [d.id,idx,s.if_name||null,s.if_descr||null,s.if_alias||null,s.admin_status||null,s.oper_status||null,speed,speed,s.duplex||null,s.lldp_neighbor||null,s.lldp_port||null,now,up?now:null]);
    }
    const pcRows=await this.db.query<any[]>('SELECT * FROM switch_port_config WHERE device_id=?',[d.id]); const pc=new Map<number,any>(pcRows.map(x=>[Number(x.if_index),x]));
    let stored=0; let stormPorts=0;
    for(const p of ports){
      const idx=intOrNull(p.if_index); if(idx===null || String(p.oper_status||'up').toLowerCase()!=='up') continue;
      stored++;
      await this.db.query(`INSERT INTO switch_port_metrics(device_id,if_index,speed_mbps,duplex,rx_mbps,tx_mbps,utilization_pct,rx_bytes,tx_bytes,crc_errors_total,crc_errors_delta,late_collisions_total,late_collisions_delta,in_discards_total,out_discards_total,discards_delta,checked_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[d.id,idx,intOrNull(p.speed_mbps),p.duplex||null,numOrNull(p.rx_mbps),numOrNull(p.tx_mbps),numOrNull(p.utilization_pct),decimalString(p.rx_bytes),decimalString(p.tx_bytes),decimalString(p.crc_errors_total),intOrNull(p.crc_errors_delta),decimalString(p.late_collisions_total),intOrNull(p.late_collisions_delta),decimalString(p.in_discards_total),decimalString(p.out_discards_total),intOrNull(p.discards_delta),now]);
      await this.db.query(`UPDATE switch_port_state SET last_rx_bytes=?,last_tx_bytes=?,last_crc_errors=?,last_late_collisions=?,last_in_discards=?,last_out_discards=? WHERE device_id=? AND if_index=?`,[decimalString(p.rx_bytes),decimalString(p.tx_bytes),decimalString(p.crc_errors_total),decimalString(p.late_collisions_total),decimalString(p.in_discards_total),decimalString(p.out_discards_total),d.id,idx]);
      const c=pc.get(idx)||{}; const critical=!!c.critical; const portName=c.custom_name||p.if_alias||p.if_name||`puerto ${idx}`;
      const crcDelta=Number(p.crc_errors_delta||0); const crcActive=crcDelta>=Number(cfg.crc_warn_delta||1);
      await this.reconcilePortAlert(d.id,idx,`crc:${idx}`,crcActive,critical?'critical':'warning',`Errores CRC/FCS en ${portName}`,`Los errores CRC/FCS crecieron ${crcDelta} en el último intervalo. Revisar cable, conector, patch panel, transceptor/SFP y el puerto ${portName} del switch ${d.name}.`,now);
      const late=Number(p.late_collisions_delta||0); await this.reconcilePortAlert(d.id,idx,`late:${idx}`,late>0,critical?'critical':'warning',`Colisiones tardías en ${portName}`,`Se detectaron ${late} colisiones tardías nuevas. Revisar dúplex, cableado, longitud/estado del enlace y negociación en ambos extremos.`,now);
      const half=String(p.duplex||'').toLowerCase()==='half'; await this.reconcilePortAlert(d.id,idx,`duplex:${idx}`,half,critical?'critical':'warning',`${portName} trabaja en half-duplex`,`El puerto ${portName} negoció half-duplex. Confirmar auto-negociación en ambos extremos y revisar cable/conector antes de forzar parámetros.`,now);
      const state=(await this.db.query<any[]>('SELECT * FROM switch_port_state WHERE device_id=? AND if_index=?',[d.id,idx]))[0]||{};
      const baseline=Number(c.expected_speed_mbps||state.max_speed_seen_mbps||0); const speed=Number(p.speed_mbps||0); const speedDrop=baseline>=1000 && speed>0 && speed<baseline;
      await this.reconcilePortAlert(d.id,idx,`speed:${idx}`,speedDrop,critical?'critical':'warning',`Velocidad negociada menor en ${portName}`,`El puerto está a ${speed} Mbps y anteriormente/por configuración se esperaba ${baseline} Mbps. Si cayó a 100/10 Mbps, revisar pares del cable, conectores, patch panel, NIC/SFP y auto-negociación.`,now);
      const discards=Number(p.discards_delta||0); if(discards>=Number(cfg.storm_discard_delta||20)) stormPorts++;
      const util=Number(p.utilization_pct||0); const uplink=!!c.is_uplink; const high=uplink && util>=Number(cfg.uplink_utilization_pct||80);
      let highSince=state.high_util_since?new Date(state.high_util_since):null;
      if(high && !highSince){ highSince=now; await this.db.query('UPDATE switch_port_state SET high_util_since=? WHERE device_id=? AND if_index=?',[now,d.id,idx]); }
      if(!high && highSince){ highSince=null; await this.db.query('UPDATE switch_port_state SET high_util_since=NULL WHERE device_id=? AND if_index=?',[d.id,idx]); }
      const held=!!(high && highSince && (now.getTime()-highSince.getTime())>=Number(cfg.uplink_hold_minutes||10)*60000);
      await this.reconcilePortAlert(d.id,idx,`uplink:${idx}`,held,critical?'critical':'warning',`Uplink ${portName} con utilización sostenida alta`,`La utilización es ${util.toFixed(1)}% y ha permanecido por encima de ${cfg.uplink_utilization_pct}% durante al menos ${cfg.uplink_hold_minutes} minutos. Revisar tráfico, capacidad, tormentas y crecimiento antes de ampliar el enlace.`,now);
      await this.reconcilePortAlert(d.id,idx,`critical-down:${idx}`,false,'critical','','',now);
    }

    // Los puertos apagados no generan muestras históricas; sólo se conserva su estado actual (una fila por puerto, sin crecimiento).
    for(const s of states){
      const idx=intOrNull(s.if_index); if(idx===null || String(s.oper_status||'').toLowerCase()==='up') continue;
      const c=pc.get(idx)||{}; const portName=c.custom_name||s.if_alias||s.if_name||`puerto ${idx}`;
      await this.reconcilePortAlert(d.id,idx,`critical-down:${idx}`,!!c.critical,'critical',`Puerto crítico ${portName} sin enlace`,`El puerto está marcado como crítico y se encuentra ${s.oper_status||'down'}. Revisar alimentación/equipo remoto, cableado, patch panel, SFP y estado administrativo del puerto.`,now);
      for(const key of ['crc','late','duplex','speed','uplink']) await this.reconcilePortAlert(d.id,idx,`${key}:${idx}`,false,'warning','','',now);
      await this.db.query('UPDATE switch_port_state SET high_util_since=NULL WHERE device_id=? AND if_index=?',[d.id,idx]);
    }
    const stormActive=stormPorts>=Number(cfg.storm_min_ports||3);
    await this.reconcilePortAlert(d.id,0,'storm',stormActive,'critical','Descartes simultáneos en varios puertos',`${stormPorts} puertos incrementaron descartes en el mismo intervalo. Sospechar congestión severa, bucle de capa 2 o tormenta de broadcast/multicast. Revisar STP, topología, contadores de broadcast y uplinks antes de desconectar enlaces.`,now);
    return {ok:true,stored};
  }

  private async reconcilePortAlert(deviceId:number,ifIndex:number,key:string,active:boolean,severity:string,title:string,diagnosis:string,now:Date){
    const open=await this.db.query<any[]>('SELECT * FROM port_alerts WHERE device_id=? AND if_index=? AND alert_key=? AND status=\'open\' ORDER BY id DESC LIMIT 1',[deviceId,ifIndex,key]);
    if(!active){ if(open.length) await this.db.query("UPDATE port_alerts SET status='resolved',resolved_at=?,last_event_at=? WHERE id=?",[now,now,open[0].id]); return; }
    if(open.length) await this.db.query('UPDATE port_alerts SET severity=?,title=?,diagnosis=?,last_event_at=? WHERE id=?',[severity,title,diagnosis,now,open[0].id]);
    else await this.db.query("INSERT INTO port_alerts(device_id,if_index,alert_key,status,severity,title,diagnosis,started_at,last_event_at) VALUES(?,?,?,'open',?,?,?,?,?)",[deviceId,ifIndex,key,severity,title,diagnosis,now,now]);
  }
}

/** Convierte una IPv4 a entero sin signo; null si no es válida. */
export function ipToLong(ip:string):number|null{
  const p=String(ip||'').trim().split('.');
  if(p.length!==4) return null;
  let n=0;
  for(const part of p){
    if(!/^\d{1,3}$/.test(part)) return null;
    const b=Number(part); if(b>255) return null;
    n=n*256+b;
  }
  return n;
}
export function ipInCidr(ip:string,cidr:string):boolean{
  const [base,bitsRaw]=String(cidr||'').split('/');
  const bits=Number(bitsRaw);
  const baseLong=ipToLong(base), ipLong=ipToLong(ip);
  if(baseLong===null||ipLong===null||!Number.isFinite(bits)||bits<0||bits>32) return true; // dato incompleto: no se bloquea
  if(bits===0) return true;
  const mask=bits===32?0xFFFFFFFF:((0xFFFFFFFF<<(32-bits))>>>0);
  return ((baseLong & mask)>>>0)===((ipLong & mask)>>>0);
}
function validateCidr(cidr:any){
  if(cidr===null||cidr===undefined||cidr==='') return;
  const [base,bits]=String(cidr).split('/');
  if(ipToLong(base)===null||!/^\d{1,2}$/.test(bits||'')||Number(bits)>32)
    throw new BadRequestException(`La subred debe tener formato CIDR, por ejemplo 10.20.20.0/24. Recibido: ${cidr}`);
}
function normalizeDbValue(key:string,v:any):any {
  if(v===undefined||v==='') return null;
  if(key==='mac_address' && v) return normalizeMac(v);
  if(['active','enabled','primary_interface'].includes(key)) return v?1:0;
  if(['probe_id','parent_id','check_port','management_vlan','rack_unit','primary_bandwidth_mbps','secondary_bandwidth_mbps','switch_device_id','switch_if_index','vlan_id','speed_mbps'].includes(key)) return v===null?null:Number(v);
  return v;
}
function normalizeMac(v:any){
  const raw=String(v||'').trim(); if(!raw) return null;
  const hex=raw.replace(/[^0-9a-fA-F]/g,'');
  if(hex.length!==12) throw new BadRequestException('La dirección MAC debe contener 12 dígitos hexadecimales.');
  return hex.match(/.{2}/g)!.join(':').toUpperCase();
}
function slugCode(v:any){ return String(v||'SITE').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,32)||'SITE'; }
/**
 * El agente envía checked_at con el reloj del sitio. Si viene inválido o con un desfase
 * mayor a 24 h se usa la hora del servidor: evita errores de MySQL y muestras "en el futuro"
 * que harían que effectiveStatusSql marque todo como 'unknown' sin explicación.
 */
export function safeCheckedAt(v:any):Date {
  if(v===null||v===undefined||v==='') return new Date();
  const d=new Date(v);
  if(!Number.isFinite(d.getTime())) return new Date();
  if(Math.abs(d.getTime()-Date.now())>24*3600*1000) return new Date();
  return d;
}
function numOrNull(v:any):number|null { if(v===null||v===undefined||v==='') return null; const n=Number(v); return Number.isFinite(n)?n:null; }
function intOrNull(v:any):number|null { const n=numOrNull(v); return n===null?null:Math.round(n); }
function decimalString(v:any):string|null { if(v===null||v===undefined||v==='') return null; try { return BigInt(String(v)).toString(); } catch { const n=Number(v); return Number.isFinite(n)?Math.max(0,Math.round(n)).toString():null; } }
