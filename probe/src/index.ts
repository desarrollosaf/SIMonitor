import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import net from 'node:net';
import dns from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as snmp from 'net-snmp';
const execFileAsync=promisify(execFile);

function loadEnv(){
  for(const f of [path.join(process.cwd(),'.env'),path.join(process.cwd(),'..','agent.env'),path.join(process.cwd(),'..','config.env')]){
    if(!fs.existsSync(f)) continue;
    for(const line of fs.readFileSync(f,'utf8').split(/\r?\n/)){
      const m=line.match(/^\s*([^#=]+)=(.*)$/);
      if(m && process.env[m[1].trim()]===undefined) process.env[m[1].trim()]=m[2].trim();
    }
  }
}
loadEnv();
const API=(process.env.API_URL||'http://localhost:3000/api').replace(/\/$/,'');
const TOKEN=(process.env.AGENT_TOKEN||process.env.PROBE_TOKEN_ACTIVE||(process.env.PROBE_TOKEN||'').split(',')[0]||'').trim();
const NAME=process.env.AGENT_NAME||process.env.PROBE_NAME||os.hostname();
const PROFILE_FILE=path.resolve(process.env.SNMP_PROFILES_FILE||path.join(process.cwd(),'config','snmp-profiles.json'));
const API_TIMEOUT_MS=Math.max(1000,Number(process.env.API_TIMEOUT_MS||8000));
if(!TOKEN){ console.error('Falta AGENT_TOKEN en agent.env/config.env'); process.exit(1); }
const headers={'Content-Type':'application/json','X-Agent-Token':TOKEN};
async function jfetch(url:string, options:any={}){
  const r=await fetch(url,{...options,signal:options.signal||AbortSignal.timeout(API_TIMEOUT_MS),headers:{...headers,...(options.headers||{})}});
  if(!r.ok){ const e:any=new Error(`${r.status} ${await r.text()}`); e.status=r.status; throw e; } return r.json();
}

// Buffer local: el monitoreo continúa aunque el enlace al servidor central se pierda.
const BUFFER_FILE=path.resolve(process.env.AGENT_BUFFER_DB||path.join(process.cwd(),'data','agent-buffer.sqlite'));
const BUFFER_MAX=Math.max(100,Number(process.env.AGENT_BUFFER_MAX||10000));
const QUEUE_MAX_ATTEMPTS=Math.max(3,Number(process.env.AGENT_BUFFER_MAX_ATTEMPTS||20));
fs.mkdirSync(path.dirname(BUFFER_FILE),{recursive:true});
const queueDb=new DatabaseSync(BUFFER_FILE);
queueDb.exec(`CREATE TABLE IF NOT EXISTS outbound_queue(id INTEGER PRIMARY KEY AUTOINCREMENT,endpoint TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0); CREATE INDEX IF NOT EXISTS idx_outbound_queue_id ON outbound_queue(id);`);
function queueDepth(){ return Number((queueDb.prepare('SELECT COUNT(*) n FROM outbound_queue').get() as any)?.n||0); }
function enqueue(endpoint:string,payload:any){
  while(queueDepth()>=BUFFER_MAX) queueDb.prepare('DELETE FROM outbound_queue WHERE id=(SELECT MIN(id) FROM outbound_queue)').run();
  queueDb.prepare('INSERT INTO outbound_queue(endpoint,payload,created_at) VALUES(?,?,?)').run(endpoint,JSON.stringify(payload),new Date().toISOString());
}
async function sendOrQueue(endpoint:string,payload:any){
  try{ return await jfetch(`${API}${endpoint}`,{method:'POST',body:JSON.stringify(payload)}); }
  catch(e:any){
    const status=Number(e?.status||0);
    if(status>=400&&status<500&&![408,429].includes(status)){ console.error(`Servidor rechazó ${endpoint}; no se guarda en buffer por ser un error permanente (${status}):`,e.message); return null; }
    enqueue(endpoint,payload); console.error(`Servidor central no disponible; resultado en buffer (${queueDepth()} pendientes):`,e.message); return null;
  }
}
let flushing=false;
async function flushQueue(){
  if(flushing||!queueDepth()) return; flushing=true;
  try{
    const rows=queueDb.prepare('SELECT id,endpoint,payload,attempts FROM outbound_queue ORDER BY id LIMIT 200').all() as any[];
    for(const row of rows){
      try{ await jfetch(`${API}${row.endpoint}`,{method:'POST',body:row.payload}); queueDb.prepare('DELETE FROM outbound_queue WHERE id=?').run(row.id); }
      catch(e:any){
        if(Number(e?.status)>=400&&Number(e?.status)<500&&![408,429].includes(Number(e.status))){ console.error(`Se descarta elemento de buffer ${row.id} por respuesta permanente:`,e.message); queueDb.prepare('DELETE FROM outbound_queue WHERE id=?').run(row.id); continue; }
        // Sin este tope, un elemento que el servidor rechace siempre bloquearía la cola
        // para siempre, porque se procesa en orden de id y se corta al primer fallo.
        if(Number(row.attempts||0)+1>=QUEUE_MAX_ATTEMPTS){ console.error(`Se descarta elemento de buffer ${row.id} tras ${QUEUE_MAX_ATTEMPTS} intentos.`); queueDb.prepare('DELETE FROM outbound_queue WHERE id=?').run(row.id); continue; }
        queueDb.prepare('UPDATE outbound_queue SET attempts=attempts+1 WHERE id=?').run(row.id); break;
      }
    }
  }finally{ flushing=false; }
}

type PortCfg={if_index:number,custom_name?:string,critical?:number|boolean,is_uplink?:number|boolean,expected_speed_mbps?:number};
type D={id:number,name:string,host:string,device_type:string,check_type:string,check_port?:number,check_path?:string,interval_sec:number,wifi_enabled?:number|boolean,snmp_profile?:string,wifi_poll_interval_sec?:number,switch_enabled?:number|boolean,switch_snmp_profile?:string,switch_poll_interval_sec?:number,switch_ports?:PortCfg[]};
type OidSpec=string|{oid:string,scale?:number,offset?:number};
type RadioProfile={name:string,band?:string,oids?:Record<string,OidSpec>};
type SsidProfile={ssid?:string,name?:string,band?:string,oids?:Record<string,OidSpec>};
type SwitchOids={ifName?:string,ifDescr?:string,ifAlias?:string,ifType?:string,ifAdminStatus?:string,ifOperStatus?:string,ifSpeed?:string,ifHighSpeed?:string,ifInOctets?:string,ifOutOctets?:string,ifHCInOctets?:string,ifHCOutOctets?:string,ifInErrors?:string,ifOutErrors?:string,ifInDiscards?:string,ifOutDiscards?:string,fcsErrors?:string,lateCollisions?:string,duplex?:string,lldpLocPortId?:string,lldpRemPortDesc?:string,lldpRemSysName?:string};
type SnmpProfile={mode?:'snmpv3'|'simulation',description?:string,port?:number,timeoutMs?:number,retries?:number,user?:string,securityLevel?:string,authProtocol?:string,authKey?:string,privProtocol?:string,privKey?:string,apMetrics?:Record<string,OidSpec>,radios?:RadioProfile[],ssids?:SsidProfile[],switchOids?:SwitchOids,maxPorts?:number};
type ProfileFile={profiles:Record<string,SnmpProfile>};

// Varios paquetes por sondeo: permite reportar pérdida real (packet_loss) y detectar
// degradación antes de que el enlace caiga del todo. Con un solo paquete la columna
// packet_loss de la base nunca se llenaba y cualquier pérdida aislada marcaba 'down'.
const PING_COUNT=Math.min(10,Math.max(1,Number(process.env.PING_COUNT||4)));
async function ping(host:string){
  const args=process.platform==='win32'
    ?['-n',String(PING_COUNT),'-w','1500',host]
    :['-c',String(PING_COUNT),'-W','2','-i','0.3',host];
  const timeout=2000+PING_COUNT*1800;
  try{ const {stdout}=await execFileAsync('ping',args,{timeout,windowsHide:true}); return parsePing(String(stdout)); }
  catch(e:any){ if(e?.code==='ENOENT') return {status:'down',latency_ms:null,packet_loss:100,message:'El comando ping no está disponible en el agente'}; if(e?.stdout){ const r=parsePing(String(e.stdout)); if(r.status!=='down') return r; } return {status:'down',latency_ms:null,packet_loss:100,message:'Sin respuesta ICMP'}; }
}
function parsePing(out:string){
  const text=out.toLowerCase();
  const rtts=[...text.matchAll(/(?:tiempo|time)\s*([=<])\s*(\d+(?:[.,]\d+)?)\s*ms/g)]
    .map(m=>{const v=Number(m[2].replace(',','.'));return m[1]==='<'?Math.min(v,1):v;});
  // Porcentaje de pérdida informado por el propio ping (formato inglés y español).
  const lossMatch=text.match(/\((\d+(?:[.,]\d+)?)%\s*(?:packet\s*)?(?:loss|perdidos|de p[eé]rdida)\)/)
    ||text.match(/(\d+(?:[.,]\d+)?)%\s*(?:packet\s*)?(?:loss|perdidos)/);
  let loss=lossMatch?Number(lossMatch[1].replace(',','.')):null;
  if(loss===null) loss=Math.round(((PING_COUNT-rtts.length)/PING_COUNT)*100);
  if(!rtts.length){
    if(/ttl=|ttl:/.test(text)) return {status:'ok',latency_ms:null,packet_loss:loss,message:'ICMP respondió (RTT no reconocido)'};
    return {status:'down',latency_ms:null,packet_loss:100,message:'Sin respuesta ICMP'};
  }
  const avg=rtts.reduce((a,b)=>a+b,0)/rtts.length;
  // Con pérdida parcial el equipo sí responde: es degradación, no caída.
  const status=loss>=100?'down':(loss>0?'warning':'ok');
  const msg=loss>0?`ICMP respondió con ${loss}% de pérdida (${rtts.length}/${PING_COUNT} paquetes)`:'ICMP respondió';
  return {status,latency_ms:Number(avg.toFixed(2)),packet_loss:loss,message:msg};
}
async function tcp(host:string,port:number){ const start=Date.now(); return await new Promise<any>(res=>{ const s=net.createConnection({host,port,timeout:2000}); const done=(v:any)=>{s.destroy();res(v)}; s.once('connect',()=>done({status:'ok',latency_ms:Date.now()-start,message:`TCP ${port} disponible`}));s.once('timeout',()=>done({status:'down',latency_ms:null,message:`Timeout TCP ${port}`}));s.once('error',e=>done({status:'down',latency_ms:null,message:`TCP ${port}: ${e.message}`}));}); }
async function dnsCheck(server:string,testName?:string){
  const start=Date.now();
  try{ const resolver=new dns.Resolver(); resolver.setServers([server]); const name=testName||process.env.DNS_TEST_NAME||'www.microsoft.com'; const r=await Promise.race([resolver.resolve4(name),new Promise<never>((_,rej)=>setTimeout(()=>rej(new Error('timeout')),2500))]); return {status:'ok',latency_ms:Date.now()-start,message:`DNS ${server} resolvió ${name}: ${r[0]||'OK'}`}; }
  catch(e:any){return {status:'down',latency_ms:null,message:`DNS ${server}: ${e.message}`};}
}
async function webCheck(host:string,p='/'){ const start=Date.now(); const base=/^https?:\/\//i.test(host)?host:`https://${host}`; const url=(p&&p!=='/')?base.replace(/\/$/,'')+(p.startsWith('/')?p:'/'+p):base; return await new Promise<any>(res=>{ const lib=url.startsWith('https:')?https:http; const req=lib.get(url,{timeout:3000,rejectUnauthorized:true},r=>{r.resume();res({status:r.statusCode&&r.statusCode<500?'ok':'warning',latency_ms:Date.now()-start,message:`HTTP ${r.statusCode}`});});req.on('timeout',()=>{req.destroy();res({status:'down',latency_ms:null,message:'Timeout HTTP/S'});});req.on('error',e=>res({status:'down',latency_ms:null,message:`HTTP/S: ${e.message}`}));}); }
async function check(d:D){ switch(d.check_type){case'tcp':return tcp(d.host,d.check_port||443);case'dns':return dnsCheck(d.host,d.check_path);case'https':return webCheck(d.host,d.check_path||'/');default:return ping(d.host);} }

function loadProfiles():ProfileFile{
  try{ if(!fs.existsSync(PROFILE_FILE)) return {profiles:{}}; return JSON.parse(fs.readFileSync(PROFILE_FILE,'utf8')) as ProfileFile; }
  catch(e:any){ console.error(`No se pudo leer ${PROFILE_FILE}:`,e.message); return {profiles:{}}; }
}
function specOid(s:OidSpec){ return typeof s==='string'?s:s.oid; }
function counterBigInt(v:any):bigint{
  if(v===null||v===undefined) return 0n; if(typeof v==='bigint') return v; if(typeof v==='number') return BigInt(Math.max(0,Math.trunc(v)));
  if(Buffer.isBuffer(v)){ let n=0n; for(const b of v.values()) n=(n<<8n)+BigInt(b); return n; }
  try{return BigInt(String(v));}catch{return 0n;}
}
function convertRaw(v:any){
  if(Buffer.isBuffer(v)){ const s=v.toString('utf8').replace(/\0/g,'').trim(); if(s && /^-?\d+(\.\d+)?$/.test(s)) return Number(s); if(s && /^[\x20-\x7E]+$/.test(s)) return s; return counterBigInt(v).toString(); }
  if(typeof v==='bigint') return v.toString(); return v;
}
function applySpec(raw:any,spec:OidSpec){ const v=convertRaw(raw); if(typeof v!=='number') return v; if(typeof spec==='string') return v; return v*Number(spec.scale??1)+Number(spec.offset??0); }
function mapSecurityLevel(v?:string){ const x=String(v||'authPriv').toLowerCase(); if(x==='noauthnopriv') return snmp.SecurityLevel.noAuthNoPriv; if(x==='authnopriv') return snmp.SecurityLevel.authNoPriv; return snmp.SecurityLevel.authPriv; }
function mapAuth(v?:string){ return String(v||'sha').toLowerCase()==='md5'?snmp.AuthProtocols.md5:snmp.AuthProtocols.sha; }
function mapPriv(v?:string){ const x=String(v||'aes').toLowerCase(); return x==='des'?snmp.PrivProtocols.des:snmp.PrivProtocols.aes; }
function createSession(host:string,profile:SnmpProfile){
  const user:any={name:profile.user||'',level:mapSecurityLevel(profile.securityLevel),authProtocol:mapAuth(profile.authProtocol),authKey:profile.authKey||'',privProtocol:mapPriv(profile.privProtocol),privKey:profile.privKey||''};
  return snmp.createV3Session(host,user,{port:Number(profile.port||161),retries:Number(profile.retries??1),timeout:Number(profile.timeoutMs||1800),transport:'udp4'} as any);
}
function getSnmp(host:string,profile:SnmpProfile,specs:Record<string,OidSpec>):Promise<Record<string,any>>{
  return new Promise((resolve,reject)=>{ const session=createSession(host,profile); const entries=Object.entries(specs).filter(([,s])=>!!specOid(s)); const oids=entries.map(([,s])=>specOid(s)); if(!oids.length){session.close();resolve({});return;} session.get(oids,(err:any,varbinds:any[])=>{ try{if(err){reject(err);return;}const out:Record<string,any>={};for(let i=0;i<entries.length;i++){const [key,spec]=entries[i];const vb=varbinds?.[i];if(vb&&!snmp.isVarbindError(vb))out[key]=applySpec(vb.value,spec);}resolve(out);}finally{session.close();} }); });
}
function walkRaw(session:any,baseOid:string):Promise<Map<string,any>>{
  return new Promise((resolve,reject)=>{ const out=new Map<string,any>(); session.subtree(baseOid,20,(varbinds:any[])=>{ for(const vb of varbinds||[]){ if(!snmp.isVarbindError(vb)){ const suffix=String(vb.oid).slice(baseOid.length).replace(/^\./,''); out.set(suffix,vb.value); } } },(err:any)=>err?reject(err):resolve(out)); });
}
async function walkOptional(session:any,baseOid?:string){ if(!baseOid) return new Map<string,any>(); try{return await walkRaw(session,baseOid);}catch{return new Map<string,any>();} }
function idxMap(raw:Map<string,any>,counter=false){ const m=new Map<number,any>(); for(const [suffix,v] of raw){ const idx=Number(suffix.split('.').pop()); if(Number.isFinite(idx))m.set(idx,counter?counterBigInt(v):convertRaw(v)); } return m; }
function statusValue(v:any){ const s=String(v??'').toLowerCase(); if(['1','true','up','active','enabled','ok'].includes(s)) return 'up'; if(['2','0','false','down','inactive','disabled'].includes(s)) return 'down'; return s||null; }
function ifStatus(v:any){ const n=Number(v); if(n===1)return'up'; if(n===2)return'down'; if(n===3)return'testing'; if(n===5)return'dormant'; if(n===6)return'notPresent'; if(n===7)return'lowerLayerDown'; return String(v??'unknown'); }
function duplexStatus(v:any){ const n=Number(v); return n===2?'half':n===3?'full':'unknown'; }
function toNum(v:any){ const n=Number(v); return Number.isFinite(n)?n:null; }
function normalizeAp(v:Record<string,any>){ return {client_count:toNum(v.client_count),uptime_sec:v.uptime_sec!=null?toNum(v.uptime_sec):(v.uptime_ticks!=null?Math.round(Number(v.uptime_ticks)/100):null),poe_watts:toNum(v.poe_watts),uplink_mbps:toNum(v.uplink_mbps),cpu_pct:toNum(v.cpu_pct),memory_pct:toNum(v.memory_pct)}; }
function normalizeRadio(p:RadioProfile,v:Record<string,any>){ return {name:p.name,band:p.band||v.band||null,status:statusValue(v.status),channel:toNum(v.channel),channel_width_mhz:toNum(v.channel_width_mhz),client_count:toNum(v.client_count),utilization_pct:toNum(v.utilization_pct),noise_dbm:toNum(v.noise_dbm),tx_power_dbm:toNum(v.tx_power_dbm)}; }
function normalizeSsid(p:SsidProfile,v:Record<string,any>){ return {ssid:p.ssid||p.name||String(v.ssid||'SSID'),band:p.band||v.band||null,status:statusValue(v.status),client_count:toNum(v.client_count)}; }

async function collectWifi(d:D){
  const profiles=loadProfiles(); const profile=profiles.profiles?.[String(d.snmp_profile||'')];
  if(!profile) return {collector_status:'warning',message:`Perfil SNMP '${d.snmp_profile||''}' no encontrado en la sonda.`,ap:{},radios:[],ssids:[]};
  if(profile.mode==='simulation'){
    const t=Math.floor(Date.now()/120000); const base=(d.id*7+t)%17;
    return {collector_status:'ok',message:'SIMULADOR-WIFI: métricas sintéticas de laboratorio.',ap:{client_count:12+base,uptime_sec:86400+(t%500)*120,poe_watts:9.8,uplink_mbps:1000,cpu_pct:18+(base%8),memory_pct:42+(base%6)},radios:[{name:'radio-2g',band:'2.4 GHz',status:'up',channel:1+((d.id%3)*5),channel_width_mhz:20,client_count:5+(base%7),utilization_pct:31+(base%22),noise_dbm:-91+(base%5),tx_power_dbm:16},{name:'radio-5g',band:'5 GHz',status:'up',channel:36+((d.id%4)*4),channel_width_mhz:40,client_count:7+(base%10),utilization_pct:24+(base%28),noise_dbm:-94+(base%5),tx_power_dbm:18}],ssids:[{ssid:'LAB-WIFI',band:'2.4/5 GHz',status:'up',client_count:12+base}]};
  }
  try{ const apRaw=await getSnmp(d.host,profile,profile.apMetrics||{}); const radios:any[]=[]; const ssids:any[]=[]; for(const rp of profile.radios||[]){ const raw=await getSnmp(d.host,profile,rp.oids||{}); radios.push(normalizeRadio(rp,raw)); } for(const sp of profile.ssids||[]){ const raw=await getSnmp(d.host,profile,sp.oids||{}); ssids.push(normalizeSsid(sp,raw)); } return {collector_status:'ok',message:'Consulta SNMPv3 completada.',ap:normalizeAp(apRaw),radios,ssids}; }
  catch(e:any){ return {collector_status:'warning',message:`SNMPv3: ${e.message}`,ap:{},radios:[],ssids:[]}; }
}

const STANDARD:Required<SwitchOids>={
  ifName:'1.3.6.1.2.1.31.1.1.1.1',ifDescr:'1.3.6.1.2.1.2.2.1.2',ifAlias:'1.3.6.1.2.1.31.1.1.1.18',ifType:'1.3.6.1.2.1.2.2.1.3',ifAdminStatus:'1.3.6.1.2.1.2.2.1.7',ifOperStatus:'1.3.6.1.2.1.2.2.1.8',ifSpeed:'1.3.6.1.2.1.2.2.1.5',ifHighSpeed:'1.3.6.1.2.1.31.1.1.1.15',ifInOctets:'1.3.6.1.2.1.2.2.1.10',ifOutOctets:'1.3.6.1.2.1.2.2.1.16',ifHCInOctets:'1.3.6.1.2.1.31.1.1.1.6',ifHCOutOctets:'1.3.6.1.2.1.31.1.1.1.10',ifInErrors:'1.3.6.1.2.1.2.2.1.14',ifOutErrors:'1.3.6.1.2.1.2.2.1.20',ifInDiscards:'1.3.6.1.2.1.2.2.1.13',ifOutDiscards:'1.3.6.1.2.1.2.2.1.19',fcsErrors:'1.3.6.1.2.1.10.7.2.1.3',lateCollisions:'1.3.6.1.2.1.10.7.2.1.8',duplex:'1.3.6.1.2.1.10.7.2.1.19',lldpLocPortId:'1.0.8802.1.1.2.1.3.7.1.3',lldpRemPortDesc:'1.0.8802.1.1.2.1.4.1.1.8',lldpRemSysName:'1.0.8802.1.1.2.1.4.1.1.9'
};
type PrevCounters={at:number,rx:bigint,tx:bigint,crc:bigint,late:bigint,inD:bigint,outD:bigint};
const portPrev=new Map<string,PrevCounters>();
function delta(cur:bigint,prev:bigint){ return cur>=prev?cur-prev:0n; }
function safeNumber(v:bigint){ const max=BigInt(Number.MAX_SAFE_INTEGER); return Number(v>max?max:v); }
function valueCounter(primary:Map<number,any>,fallback:Map<number,any>,idx:number){ const a=primary.get(idx); return a!==undefined?counterBigInt(a):counterBigInt(fallback.get(idx)); }
function lldpMap(locRaw:Map<string,any>,nameRaw:Map<string,any>,portRaw:Map<string,any>,ifNames:Map<number,any>,ifDescr:Map<number,any>){
  const local=new Map<number,string>(); for(const [s,v] of locRaw){const n=Number(s.split('.').pop());if(Number.isFinite(n))local.set(n,String(convertRaw(v)||''));}
  const rem=new Map<number,{neighbor?:string,port?:string}>();
  for(const [s,v] of nameRaw){const parts=s.split('.').map(Number);const lp=parts.length>=2?parts[parts.length-2]:NaN;if(Number.isFinite(lp)){const x=rem.get(lp)||{};x.neighbor=String(convertRaw(v)||'');rem.set(lp,x);}}
  for(const [s,v] of portRaw){const parts=s.split('.').map(Number);const lp=parts.length>=2?parts[parts.length-2]:NaN;if(Number.isFinite(lp)){const x=rem.get(lp)||{};x.port=String(convertRaw(v)||'');rem.set(lp,x);}}
  const out=new Map<number,{neighbor?:string,port?:string}>();
  for(const [lp,r] of rem){const id=(local.get(lp)||'').toLowerCase();let idx=lp;if(id){for(const [i,n] of ifNames){if(String(n).toLowerCase()===id||String(ifDescr.get(i)||'').toLowerCase()===id){idx=i;break;}}}out.set(idx,r);}
  return out;
}

async function collectSwitch(d:D){
  const profiles=loadProfiles(); const profile=profiles.profiles?.[String(d.switch_snmp_profile||'')];
  if(!profile) return {collector_status:'warning',message:`Perfil SNMP '${d.switch_snmp_profile||''}' no encontrado en la sonda.`,states:[],ports:[]};
  if(profile.mode==='simulation'){
    const now=Date.now(); const states:any[]=[]; const ports:any[]=[];
    for(let i=1;i<=24;i++){const up=i<=18||i===24;const speed=i===24?1000:(i<=18?1000:0);const alias=i===24?'Uplink simulado':(i===3?'AP recepción':'');const lldp=i===24?{lldp_neighbor:'Core-SW-01',lldp_port:'Gi1/0/48'}:{};states.push({if_index:i,if_name:`Gi1/0/${i}`,if_descr:`GigabitEthernet1/0/${i}`,if_alias:alias,admin_status:'up',oper_status:up?'up':'down',speed_mbps:speed,duplex:up?'full':'unknown',...lldp});if(up){const rx=i===24?620+(Math.sin(now/60000)*30):5+(i%7)*2;const tx=i===24?210+(Math.cos(now/60000)*20):2+(i%5);const total=BigInt(Math.floor(now/1000))*BigInt(100000+i*100);ports.push({...states[states.length-1],rx_mbps:Math.max(0,rx),tx_mbps:Math.max(0,tx),utilization_pct:Math.max(rx,tx)/speed*100,rx_bytes:total.toString(),tx_bytes:(total/2n).toString(),crc_errors_total:'0',crc_errors_delta:0,late_collisions_total:'0',late_collisions_delta:0,in_discards_total:'0',out_discards_total:'0',discards_delta:0});}}
    return {collector_status:'ok',message:'SIMULADOR-SWITCH: 24 puertos sintéticos, sin tráfico SNMP real.',states,ports};
  }
  const session=createSession(d.host,profile); const overrides=Object.fromEntries(Object.entries(profile.switchOids||{}).filter(([,v])=>typeof v==='string'&&v.trim())) as SwitchOids; const o={...STANDARD,...overrides} as Required<SwitchOids>;
  try{
    // IF-MIB básico es obligatorio; IF-X/EtherLike/LLDP se tratan como capacidades opcionales.
    const descr=idxMap(await walkRaw(session,o.ifDescr)); const types=idxMap(await walkRaw(session,o.ifType)); const admin=idxMap(await walkRaw(session,o.ifAdminStatus)); const oper=idxMap(await walkRaw(session,o.ifOperStatus)); const speed=idxMap(await walkRaw(session,o.ifSpeed));
    const names=idxMap(await walkOptional(session,o.ifName)); const alias=idxMap(await walkOptional(session,o.ifAlias)); const high=idxMap(await walkOptional(session,o.ifHighSpeed));
    const hcIn=idxMap(await walkOptional(session,o.ifHCInOctets),true); const hcOut=idxMap(await walkOptional(session,o.ifHCOutOctets),true); const inOct=idxMap(await walkRaw(session,o.ifInOctets),true); const outOct=idxMap(await walkRaw(session,o.ifOutOctets),true); const inDis=idxMap(await walkRaw(session,o.ifInDiscards),true); const outDis=idxMap(await walkRaw(session,o.ifOutDiscards),true);
    const fcs=idxMap(await walkOptional(session,o.fcsErrors),true); const late=idxMap(await walkOptional(session,o.lateCollisions),true); const dup=idxMap(await walkOptional(session,o.duplex));
    let lldp=new Map<number,{neighbor?:string,port?:string}>(); const loc=await walkOptional(session,o.lldpLocPortId); const rn=await walkOptional(session,o.lldpRemSysName); const rp=await walkOptional(session,o.lldpRemPortDesc); if(loc.size&&rn.size) lldp=lldpMap(loc,rn,rp,names,descr);
    const indices=[...new Set([...names.keys(),...descr.keys(),...oper.keys()])].sort((a,b)=>a-b); const physical=indices.filter(i=>Number(types.get(i)||0)===6); const chosen=(physical.length?physical:indices.filter(i=>Number(high.get(i)||0)>0||Number(speed.get(i)||0)>0)).slice(0,Number(profile.maxPorts||256));
    const states:any[]=[]; const ports:any[]=[]; const now=Date.now();
    for(const i of chosen){
      const highMbps=Number(high.get(i)||0); const speedMbps=highMbps>0?highMbps:Math.round(Number(speed.get(i)||0)/1_000_000); const operStatus=ifStatus(oper.get(i)); const adminStatus=ifStatus(admin.get(i)); const ll=lldp.get(i)||{}; const state={if_index:i,if_name:String(names.get(i)||descr.get(i)||`if${i}`),if_descr:String(descr.get(i)||''),if_alias:String(alias.get(i)||''),admin_status:adminStatus,oper_status:operStatus,speed_mbps:speedMbps||null,duplex:duplexStatus(dup.get(i)),lldp_neighbor:ll.neighbor||null,lldp_port:ll.port||null}; states.push(state);
      const key=`${d.id}:${i}`; if(operStatus!=='up'){portPrev.delete(key);continue;}
      const rx=valueCounter(hcIn,inOct,i); const tx=valueCounter(hcOut,outOct,i); const crc=fcs.has(i)?counterBigInt(fcs.get(i)):0n; const lc=counterBigInt(late.get(i)); const idisc=counterBigInt(inDis.get(i)); const odisc=counterBigInt(outDis.get(i)); const prev=portPrev.get(key); let rxMbps:null|number=null,txMbps:null|number=null,crcD=0,lateD=0,discD=0;
      if(prev){const sec=Math.max(1,(now-prev.at)/1000);const drx=delta(rx,prev.rx),dtx=delta(tx,prev.tx);rxMbps=safeNumber(drx)*8/sec/1_000_000;txMbps=safeNumber(dtx)*8/sec/1_000_000;crcD=safeNumber(delta(crc,prev.crc));lateD=safeNumber(delta(lc,prev.late));discD=safeNumber(delta(idisc,prev.inD)+delta(odisc,prev.outD));}
      portPrev.set(key,{at:now,rx,tx,crc,late:lc,inD:idisc,outD:odisc}); const util=speedMbps>0&&rxMbps!==null&&txMbps!==null?Math.min(999,Math.max(rxMbps,txMbps)/speedMbps*100):null;
      ports.push({...state,rx_mbps:rxMbps,tx_mbps:txMbps,utilization_pct:util,rx_bytes:rx.toString(),tx_bytes:tx.toString(),crc_errors_total:crc.toString(),crc_errors_delta:crcD,late_collisions_total:lc.toString(),late_collisions_delta:lateD,in_discards_total:idisc.toString(),out_discards_total:odisc.toString(),discards_delta:discD});
    }
    return {collector_status:'ok',message:`SNMPv3: ${states.length} interfaces físicas leídas; ${ports.length} puertos operativos guardables.`,states,ports};
  }catch(e:any){ return {collector_status:'warning',message:`SNMPv3 switch: ${e.message}`,states:[],ports:[]}; }
  finally{session.close();}
}

const last=new Map<number,number>(); const lastWifi=new Map<number,number>(); const lastSwitch=new Map<number,number>(); let devices:D[]=[];
async function refresh(){ try{ devices=await jfetch(`${API}/probe/config`); console.log(`Configuración: ${devices.length} dispositivos asignados a ${NAME}`);}catch(e:any){console.error('No se pudo cargar configuración:',e.message);} }
async function heartbeat(){ try{ await jfetch(`${API}/probe/heartbeat`,{method:'POST',body:JSON.stringify({agent_name:NAME,probe_name:NAME,version:'0.4.1',hostname:os.hostname(),ip_address:Object.values(os.networkInterfaces()).flat().find((x:any)=>x&&x.family==='IPv4'&&!x.internal)?.address,platform:os.platform(),os_version:os.release(),architecture:os.arch(),buffer_depth:queueDepth()})}); await flushQueue(); }catch(e:any){console.error('Heartbeat:',e.message);} }
const CONCURRENCY=Math.max(1,Number(process.env.PROBE_CONCURRENCY||5));
const SNMP_CONCURRENCY=Math.max(1,Number(process.env.SNMP_CONCURRENCY||2));
// Tope por dispositivo: un switch colgado no puede retener un worker indefinidamente.
const DEVICE_TIMEOUT_MS=Math.max(10000,Number(process.env.DEVICE_TIMEOUT_MS||60000));

async function runLimited(tasks:(()=>Promise<void>)[],limit:number){
  let i=0;
  const worker=async()=>{ while(i<tasks.length){ const t=tasks[i++]; try{ await t(); }catch(e:any){ console.error('Tarea:',e.message); } } };
  await Promise.all(Array.from({length:Math.min(limit,tasks.length)},worker));
}
function withTimeout<T>(label:string,p:Promise<T>):Promise<T>{
  return Promise.race([p,new Promise<T>((_,rej)=>setTimeout(()=>rej(new Error(`${label}: tiempo máximo (${DEVICE_TIMEOUT_MS} ms) superado`)),DEVICE_TIMEOUT_MS))]);
}

/**
 * Dos ciclos independientes con su propio candado.
 * Antes ambos compartían uno solo: un switch lento en SNMP (unas 15 consultas walk
 * secuenciales) dejaba sin pinguear a TODA la sede durante minutos, y el servidor
 * marcaba esos equipos como 'unknown' sin motivo aparente.
 */
let runningChecks=false, runningSnmp=false;

async function loopChecks(){
  if(runningChecks) return; runningChecks=true;
  try{
    const now=Date.now(); const tasks:(()=>Promise<void>)[]=[];
    for(const d of devices){
      if(now-(last.get(d.id)||0)<Math.max(10,d.interval_sec||60)*1000) continue;
      last.set(d.id,now);
      tasks.push(async()=>{
        const r=await withTimeout(d.name,check(d));
        await sendOrQueue('/probe/result',{device_id:d.id,...r,checked_at:new Date().toISOString()});
        console.log(`${d.name}: ${r.status} ${r.latency_ms??'-'}ms${r.packet_loss?` · ${r.packet_loss}% pérdida`:''}`);
      });
    }
    if(tasks.length) await runLimited(tasks,CONCURRENCY);
  } finally { runningChecks=false; }
}

async function loopSnmp(){
  if(runningSnmp) return; runningSnmp=true;
  try{
    const now=Date.now(); const tasks:(()=>Promise<void>)[]=[];
    for(const d of devices){
      if(Boolean(Number(d.wifi_enabled||0))&&d.snmp_profile&&now-(lastWifi.get(d.id)||0)>=Math.max(30,Number(d.wifi_poll_interval_sec||120))*1000){
        lastWifi.set(d.id,now);
        tasks.push(async()=>{
          const wr=await withTimeout(`${d.name} Wi-Fi`,collectWifi(d));
          await sendOrQueue('/probe/wifi-result',{device_id:d.id,...wr,checked_at:new Date().toISOString()});
          console.log(`${d.name} Wi-Fi: ${wr.collector_status}`);
        });
      }
      if(Boolean(Number(d.switch_enabled||0))&&d.switch_snmp_profile&&now-(lastSwitch.get(d.id)||0)>=Math.max(60,Number(d.switch_poll_interval_sec||300))*1000){
        lastSwitch.set(d.id,now);
        tasks.push(async()=>{
          const sr=await withTimeout(`${d.name} puertos`,collectSwitch(d));
          await sendOrQueue('/probe/switch-result',{device_id:d.id,...sr,checked_at:new Date().toISOString()});
          console.log(`${d.name} puertos: ${sr.collector_status} · ${sr.ports?.length||0} activos`);
        });
      }
    }
    if(tasks.length) await runLimited(tasks,SNMP_CONCURRENCY);
  } finally { runningSnmp=false; }
}

async function main(){
  console.log(`Agente de Sitio ${NAME} v0.4.1. Buffer: ${BUFFER_FILE}. Perfiles SNMP: ${PROFILE_FILE}`);
  await heartbeat(); await refresh();
  setInterval(refresh,Number(process.env.CONFIG_REFRESH_SEC||60)*1000);
  setInterval(heartbeat,Number(process.env.HEARTBEAT_SEC||30)*1000);
  setInterval(loopChecks,1000);
  setInterval(loopSnmp,5000);
  await loopChecks();
}
main().catch(e=>{ console.error(e); process.exit(1); });
