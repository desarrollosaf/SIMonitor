import { Component, inject, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors, HttpClient, HttpHeaders, HttpInterceptorFn, HttpParams } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector:'app-root', standalone:true, imports:[CommonModule,FormsModule],
  template:`
  <div *ngIf="!token" class="login-shell"><form class="card login" (ngSubmit)="login()"><h1>Gestión de Infraestructura de Red</h1><p>V0.4.1 · Arquitectura multisitio con Agentes de Sitio</p><label>Usuario<input [(ngModel)]="username" name="u" required></label><label>Contraseña<input [(ngModel)]="password" name="p" type="password" required></label><button>Ingresar</button><div class="error" *ngIf="error()">{{error()}}</div></form></div>

  <div *ngIf="token" class="app">
    <header>
      <div class="brand"><b>Infraestructura Multisitio</b><small>V0.4.1 · {{username}}</small></div>
      <nav>
        <div class="nav-group">
          <span class="nav-label">Operación</span>
          <div class="nav-items">
            <button [class.active]="tab==='dashboard'" (click)="go('dashboard')">Panel</button>
            <button [class.active]="tab==='noc'" (click)="go('noc')">Monitor <span class="pill alarm-pill" *ngIf="noc()?.counts?.critical">{{noc()?.counts?.critical}}</span></button>
            <button [class.active]="tab==='incidents'" (click)="go('incidents')">Incidentes</button>
            <button [class.active]="tab==='ports'" (click)="go('ports')">Puertos</button>
            <button [class.active]="tab==='wifi'" (click)="go('wifi')">Wi-Fi</button>
            <button [class.active]="tab==='analysis'" (click)="go('analysis')">Análisis</button>
          </div>
        </div>
        <div class="nav-group">
          <span class="nav-label">Configuración</span>
          <div class="nav-items">
            <button [class.active]="tab==='setup'" (click)="go('setup')">Puesta en marcha <span class="pill" *ngIf="pendingSteps()">{{pendingSteps()}}</span></button>
            <button [class.active]="tab==='sites'" (click)="go('sites')">1 · Sedes</button>
            <button [class.active]="tab==='vlans'" (click)="go('vlans')">VLANs</button>
            <button [class.active]="tab==='agents'" (click)="go('agents')">2 · Agentes</button>
            <button [class.active]="tab==='inventory'" (click)="go('inventory')">3 · Inventario</button>
            <button [class.active]="tab==='monitoring'" (click)="go('monitoring')">4 · Monitoreo SNMP</button>
          </div>
        </div>
        <div class="nav-group">
          <span class="nav-label">Cuenta</span>
          <div class="nav-items">
            <button [class.active]="tab==='account'" (click)="go('account')">Mi cuenta</button>
            <button class="ghost" (click)="logout()">Salir</button>
          </div>
        </div>
      </nav>
    </header>

    <main>
      <div class="alarm" *ngIf="opError()">{{opError()}} <button class="ghost mini" (click)="opError.set('')">Cerrar</button></div>

      <!-- ============================ PUESTA EN MARCHA ============================ -->
      <section *ngIf="tab==='setup'">
        <div class="title"><div><h2>Puesta en marcha</h2><p>Siga los pasos en orden. Cada uno se marca como listo en cuanto detecta la información correspondiente.</p></div><button class="ghost" (click)="loadAll()">Actualizar estado</button></div>
        <div class="steps">
          <article class="step" *ngFor="let s of setupSteps()" [class.done]="s.done">
            <div class="step-num">{{s.done?'✓':s.n}}</div>
            <div class="step-body">
              <h3>{{s.title}} <span class="badge ok" *ngIf="s.done">listo</span><span class="badge unknown" *ngIf="!s.done && s.optional">opcional</span></h3>
              <p>{{s.text}}</p>
              <p class="step-detail" [class.pending]="!s.done">{{s.detail}}</p>
            </div>
            <div class="step-cta"><button [class.ghost]="s.done" (click)="go(s.tab)">{{s.cta}}</button></div>
          </article>
        </div>
        <div class="card block narrow">
          <h3>¿Dónde está cada cosa?</h3>
          <table class="plain"><tbody>
            <tr><td><b>Operación</b></td><td>Lo que mira todos los días: estado actual, incidentes, puertos y Wi-Fi.</td></tr>
            <tr><td><b>Configuración</b></td><td>Lo que registra una vez y corrige de vez en cuando: sedes, agentes, equipos y monitoreo SNMP.</td></tr>
            <tr><td><b>Mi cuenta</b></td><td>Su contraseña y su sesión. Nada de aquí afecta a los equipos monitoreados.</td></tr>
          </tbody></table>
        </div>
      </section>

      <!-- ============================ MONITOR / SALA DE CONTROL ============================ -->
      <section *ngIf="tab==='noc'" class="noc" [class.alarma]="unackedCritical()>0">
        <div class="noc-bar">
          <div class="noc-title"><b>MONITOR DE INCIDENCIAS</b><small>{{nocClock}} · actualizado {{nocAgo()}}</small></div>
          <div class="noc-counts">
            <div class="noc-count crit"><b>{{noc()?.counts?.critical || 0}}</b><span>Críticas</span></div>
            <div class="noc-count warn"><b>{{noc()?.counts?.warning || 0}}</b><span>Advertencias</span></div>
            <div class="noc-count"><b>{{noc()?.counts?.sites || 0}}</b><span>Sedes afectadas</span></div>
            <div class="noc-count"><b>{{noc()?.counts?.agents_offline || 0}}</b><span>Agentes caídos</span></div>
          </div>
          <div class="noc-actions">
            <button *ngIf="!soundReady" (click)="enableSound()">🔊 Activar sonido</button>
            <button *ngIf="soundReady" class="ghost" (click)="muted=!muted;saveNocPrefs()">{{muted?'🔇 Sonido apagado':'🔊 Sonido activo'}}</button>
            <button class="ghost" [disabled]="!unackedCritical() && !unackedWarning()" (click)="silence()">Silenciar ({{unackedCritical()+unackedWarning()}})</button>
            <select [(ngModel)]="refreshSec" (ngModelChange)="startAutoRefresh()" name="rsec"><option [ngValue]="5">5 s</option><option [ngValue]="10">10 s</option><option [ngValue]="15">15 s</option><option [ngValue]="30">30 s</option></select>
            <button class="ghost" (click)="toggleFullscreen()">⛶ Pantalla completa</button>
          </div>
        </div>

        <div class="noc-ok" *ngIf="!(noc()?.events || []).length">
          <div class="noc-ok-mark">✓</div>
          <h2>Sin incidencias activas</h2>
          <p>{{noc()?.counts?.sites === 0 ? 'Todas las sedes reportan con normalidad.' : ''}}</p>
        </div>

        <div class="noc-sites" *ngIf="(noc()?.sites || []).length">
          <article *ngFor="let s of noc()?.sites" class="noc-site" [class.crit]="s.critical>0" (click)="nocSiteFilter = (nocSiteFilter===s.site_id ? null : s.site_id)" [class.sel]="nocSiteFilter===s.site_id">
            <b>{{s.site_name}}</b>
            <div class="noc-site-nums"><span class="crit" *ngIf="s.critical">{{s.critical}} crít.</span><span class="warn" *ngIf="s.warning">{{s.warning}} adv.</span></div>
            <small>{{s.kinds.agent? s.kinds.agent+' agente · ':''}}{{s.kinds.incident? s.kinds.incident+' equipo · ':''}}{{s.kinds.port? s.kinds.port+' puerto · ':''}}{{s.kinds.wifi? s.kinds.wifi+' wifi':''}}</small>
          </article>
        </div>

        <div class="noc-list" *ngIf="(noc()?.events || []).length">
          <div class="noc-row head"><span>Gravedad</span><span>Sede</span><span>Equipo</span><span>Incidencia</span><span>Desde</span></div>
          <div class="noc-row" *ngFor="let e of nocFiltered()" [class.crit]="e.severity==='critical'" [class.nuevo]="isNewEvent(e)" (click)="openEvent(e)">
            <span class="sev"><i [class]="'dot '+e.severity"></i>{{e.severity==='critical'?'CRÍTICA':'ADVERTENCIA'}}<small class="kind">{{kindLabel(e.kind)}}</small></span>
            <span><b>{{e.site_name}}</b><small>{{e.site_code || ''}}</small></span>
            <span><b>{{e.device_name}}</b><small>{{e.host}}<span *ngIf="e.if_index"> · puerto {{e.if_index}}</span></small></span>
            <span><b>{{e.title}}</b><small class="diag">{{e.diagnosis}}</small></span>
            <span class="edad">{{eventAge(e)}}<small>{{e.started_at | date:'dd/MM HH:mm'}}</small></span>
          </div>
          <p class="noc-foot" *ngIf="nocSiteFilter">Mostrando sólo una sede. <button class="ghost mini" (click)="nocSiteFilter=null">Ver todas</button></p>
        </div>
      </section>

      <!-- ============================ PANEL ============================ -->
      <section *ngIf="tab==='dashboard'">
        <div class="title"><div><h2>Estado general multisitio</h2><p>Los equipos se monitorean localmente mediante Agentes de Sitio y sincronizan resultados con este servidor central.</p></div><div class="actions"><button class="ghost" (click)="enableNotifications()">Activar alertas</button><button (click)="loadAll()">Actualizar</button></div></div>
        <div class="alarm neutral" *ngIf="pendingSteps()">⚙️ La configuración inicial todavía tiene {{pendingSteps()}} paso(s) pendiente(s). <button class="ghost mini" (click)="go('setup')">Ver puesta en marcha</button></div>
        <div class="alarm" *ngIf="(summary()?.devices?.down || 0)>0">🔴 ALARMA: existen equipos sin comunicación.</div>
        <div class="alarm" *ngIf="(summary()?.probesOffline || 0)>0">🔴 AGENTES: {{summary()?.probesOffline}} agente(s) no han enviado heartbeat recientemente. <button class="ghost mini" (click)="go('agents')">Revisar agentes</button></div>
        <div class="alarm amber" *ngIf="(summary()?.portOpenAlerts || 0)>0">🟠 PUERTOS: {{summary()?.portOpenAlerts}} problema(s) abierto(s).</div>
        <div class="alarm amber" *ngIf="(summary()?.wifiOpenAlerts || 0)>0">🟠 WI-FI: {{summary()?.wifiOpenAlerts}} alerta(s) inalámbrica(s).</div>
        <div class="alarm neutral" *ngIf="(summary()?.unassignedDevices || 0)>0">⚪ {{summary()?.unassignedDevices}} equipo(s) no tienen un Agente de Sitio válido/asignable para su sede. <button class="ghost mini" (click)="go('inventory')">Revisar inventario</button></div>
        <div class="metrics six"><article><span>Sedes</span><b>{{summary()?.sites || 0}}</b></article><article><span>Equipos</span><b>{{summary()?.devices?.total || 0}}</b></article><article class="ok"><span>Operando</span><b>{{summary()?.devices?.ok || 0}}</b></article><article class="warn"><span>Advertencia/crítico</span><b>{{(summary()?.devices?.warning || 0)+(summary()?.devices?.critical || 0)}}</b></article><article class="down"><span>Sin comunicación</span><b>{{summary()?.devices?.down || 0}}</b></article><article><span>Sin datos</span><b>{{summary()?.devices?.unknown || 0}}</b></article></div>

        <div class="grid"><div class="card"><div class="title compact"><div><h3>Salud de sedes · últimos {{analytics()?.days || 30}} días</h3><p>Ordenado por puntuación de fallas.</p></div><button class="ghost" (click)="go('analysis')">Analizar</button></div><div class="table-wrap"><table><thead><tr><th>Sede</th><th>Disponibilidad</th><th>Incidentes</th><th>Inc./100 eq.</th><th>Críticos</th><th>MTTR</th><th>Salud</th></tr></thead><tbody><tr *ngFor="let s of (analytics()?.ranking || []).slice(0,8)"><td><b>{{s.name}}</b><small class="sub">{{s.municipality || ''}}</small></td><td>{{s.availability_pct | number:'1.2-2'}}%</td><td>{{s.incident_count}}</td><td>{{s.incidents_per_100_devices | number:'1.1-2'}}</td><td>{{s.critical_incidents}}</td><td>{{s.mttr_minutes}} min</td><td><span [class]="'badge '+s.health">{{s.health}}</span></td></tr><tr *ngIf="!(analytics()?.ranking || []).length"><td colspan="7">Sin datos todavía. Registre sedes y equipos para ver el análisis.</td></tr></tbody></table></div></div>
        <div class="card side"><div class="title compact"><div><h3>Agentes de Sitio</h3></div><button class="ghost mini" (click)="go('agents')">Administrar</button></div><div class="incident" *ngFor="let p of summary()?.probes"><b>{{p.name}}</b><span [class]="'badge '+(p.online?'ok':'down')">{{p.online?'EN LÍNEA':'SIN HEARTBEAT'}}</span><small>{{p.site_name || 'sin sede'}} · {{p.device_count || 0}} equipos<br>{{p.hostname || '-'}} · buffer {{p.buffer_depth || 0}}</small></div><p *ngIf="!summary()?.probes?.length" class="muted">Todavía no hay agentes registrados.</p></div></div>

        <div class="card block problem-card"><div class="title compact"><div><h3>Puertos con problemas</h3><p>Lista de trabajo priorizada para soporte.</p></div><button class="ghost" (click)="go('ports')">Ver todos</button></div><div class="table-wrap"><table><thead><tr><th>Gravedad</th><th>Switch / puerto</th><th>Sede</th><th>LLDP</th><th>Qué revisar</th></tr></thead><tbody><tr *ngFor="let a of portProblems().slice(0,10)" (click)="openSwitch(a.device_id,a.if_index)" class="click-row"><td><span [class]="'badge '+a.severity">{{a.severity}}</span></td><td><b>{{a.switch_name}}</b><small class="sub">{{a.port_name}}</small></td><td>{{a.site_name}}</td><td>{{a.lldp_neighbor || '-'}}</td><td>{{a.diagnosis}}</td></tr><tr *ngIf="!portProblems().length"><td colspan="5">Sin problemas abiertos.</td></tr></tbody></table></div></div>
      </section>

      <!-- ============================ PASO 1 · SEDES ============================ -->
      <section *ngIf="tab==='sites'">
        <div class="title"><div><span class="crumb">Configuración · Paso 1 de 4</span><h2>Sedes y edificios</h2><p>Registre aquí cada edificio o red independiente. Todo lo demás (agentes, equipos, análisis) se organiza a partir de la sede.</p></div><button class="ghost" (click)="newSite()">Nueva sede</button></div>
        <div class="guide" *ngIf="!sites().length">Empiece por aquí: complete el formulario de abajo con al menos el <b>nombre</b> de la sede. Los demás campos puede completarlos después con el botón Editar.</div>

        <form class="card" (ngSubmit)="saveSite()">
          <div class="title compact"><div><h3>{{editingSiteId?'Editar sede':'Registrar sede'}}</h3><p>La dirección, responsables y conectividad quedan separadas para permitir filtros y análisis posteriores.</p></div><button type="button" class="ghost" *ngIf="editingSiteId" (click)="newSite()">Cancelar edición</button></div>
          <details open><summary>Identificación <small class="req">obligatorio: nombre</small></summary><div class="form-grid four"><label>Código<input [(ngModel)]="siteForm.code" name="scode" placeholder="PL-SANTANDER"></label><label>Nombre corto<input [(ngModel)]="siteForm.name" name="sname" required></label><label>Nombre oficial<input [(ngModel)]="siteForm.official_name" name="soff"></label><label>Tipo<select [(ngModel)]="siteForm.site_type" name="stype"><option value="administrative">Administrativo</option><option value="legislative">Legislativo</option><option value="archive">Archivo</option><option value="library">Biblioteca</option><option value="other">Otro</option></select></label><label>Criticidad<select [(ngModel)]="siteForm.criticality" name="scrit"><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="critical">Crítica</option></select></label><label>Teléfono<input [(ngModel)]="siteForm.phone" name="sphone"></label><label>Horario<input [(ngModel)]="siteForm.schedule" name="ssch" placeholder="08:00 - 20:00"></label></div><p class="hint">Si deja el código vacío se genera a partir del nombre. Debe ser único.</p></details>
          <details><summary>Dirección <small class="opc">opcional</small></summary><div class="form-grid four"><label>País<input [(ngModel)]="siteForm.country" name="scountry"></label><label>Estado<input [(ngModel)]="siteForm.state" name="sstate"></label><label>Municipio<input [(ngModel)]="siteForm.municipality" name="smun"></label><label>Localidad<input [(ngModel)]="siteForm.locality" name="sloc"></label><label>Colonia<input [(ngModel)]="siteForm.neighborhood" name="snei"></label><label>Código postal<input [(ngModel)]="siteForm.postal_code" name="scp"></label><label class="span2">Calle<input [(ngModel)]="siteForm.street" name="sst"></label><label>Núm. exterior<input [(ngModel)]="siteForm.exterior_number" name="sext"></label><label>Núm. interior<input [(ngModel)]="siteForm.interior_number" name="sint"></label><label class="span2">Referencia<input [(ngModel)]="siteForm.reference" name="sref"></label><label>Latitud<input type="number" step="any" [(ngModel)]="siteForm.latitude" name="slat"></label><label>Longitud<input type="number" step="any" [(ngModel)]="siteForm.longitude" name="slon"></label></div><p class="hint">Municipio es el campo por el que podrá agrupar y comparar sedes en la pestaña Análisis.</p></details>
          <details><summary>Responsables y enlaces <small class="opc">opcional</small></summary><div class="form-grid four"><label>Responsable del inmueble<input [(ngModel)]="siteForm.manager_name" name="smgr"></label><label>Tel. responsable<input [(ngModel)]="siteForm.manager_phone" name="smgrp"></label><label>Correo responsable<input type="email" [(ngModel)]="siteForm.manager_email" name="smgre"></label><label>Contacto técnico<input [(ngModel)]="siteForm.technical_contact" name="stech"></label><label>Tel. técnico<input [(ngModel)]="siteForm.technical_phone" name="stechp"></label><label>Proveedor Internet principal<input [(ngModel)]="siteForm.primary_isp" name="sisp1"></label><label>Mbps principal<input type="number" [(ngModel)]="siteForm.primary_bandwidth_mbps" name="sbw1"></label><label>Proveedor secundario<input [(ngModel)]="siteForm.secondary_isp" name="sisp2"></label><label>Mbps secundario<input type="number" [(ngModel)]="siteForm.secondary_bandwidth_mbps" name="sbw2"></label><label class="span4">Notas<textarea [(ngModel)]="siteForm.notes" name="snotes"></textarea></label></div></details>
          <button>{{editingSiteId?'Guardar cambios':'Registrar sede'}}</button>
        </form>

        <div class="card block"><div class="title compact"><div><h3>Catálogo de sedes</h3><p>{{sites().length}} sede(s) registrada(s).</p></div><button class="ghost" *ngIf="sites().length" (click)="go('agents')">Siguiente paso: Agentes →</button></div><div class="table-wrap"><table><thead><tr><th>Código</th><th>Sede</th><th>Dirección</th><th>Municipio</th><th>Equipos</th><th>Agentes</th><th>Enlace principal</th><th>Acciones</th></tr></thead><tbody><tr *ngFor="let s of sites()"><td>{{s.code || '-'}}</td><td><b>{{s.name}}</b><small class="sub">{{s.official_name || ''}}</small></td><td>{{siteAddress(s)}}</td><td>{{s.municipality || '-'}}</td><td>{{s.device_count || 0}}</td><td>{{s.agent_count || 0}}</td><td>{{s.primary_isp || '-'}} <small *ngIf="s.primary_bandwidth_mbps">· {{s.primary_bandwidth_mbps}} Mbps</small></td><td class="nowrap"><button class="ghost mini" (click)="editSite(s)">Editar</button> <button class="danger mini" (click)="removeSite(s)">Eliminar</button></td></tr><tr *ngIf="!sites().length"><td colspan="8">Todavía no hay sedes registradas.</td></tr></tbody></table></div><p class="hint">Una sede sólo puede eliminarse cuando ya no tiene equipos ni agentes, para no perder su histórico por accidente.</p></div>
      </section>

      <!-- ============================ VLANs Y SUBREDES ============================ -->
      <section *ngIf="tab==='vlans'">
        <div class="title"><div><span class="crumb">Configuración · complemento del paso 1</span><h2>VLANs y subredes por sede</h2><p>Declare qué significa cada VLAN en cada edificio. En cuanto una sede tenga VLANs declaradas, los formularios de equipos e interfaces dejan de pedir un número suelto y ofrecen la lista.</p></div><button class="ghost" (click)="newVlan()">Nueva VLAN</button></div>
        <div class="guide">El catálogo es <b>opcional y por sede</b>: mientras una sede no declare ninguna VLAN, se sigue pudiendo escribir el número a mano. En cuanto declare la primera, el sistema exige que las VLANs de esa sede pertenezcan al catálogo, y si la VLAN tiene subred declarada comprueba además que las IP caigan dentro.</div>

        <form class="card" (ngSubmit)="saveVlan()">
          <div class="title compact"><div><h3>{{editingVlanId?'Editar VLAN':'Declarar VLAN'}}</h3></div><button type="button" class="ghost" *ngIf="editingVlanId" (click)="newVlan()">Cancelar</button></div>
          <div class="form-grid four">
            <label>Sede<select [(ngModel)]="vlanForm.site_id" name="vsite" required [disabled]="!!editingVlanId"><option [ngValue]="null">Seleccione</option><option *ngFor="let s of sites()" [ngValue]="s.id">{{s.name}}</option></select></label>
            <label>Número de VLAN<input type="number" min="1" max="4094" [(ngModel)]="vlanForm.vlan_id" name="vnum" required placeholder="20"></label>
            <label>Nombre<input [(ngModel)]="vlanForm.name" name="vname" required placeholder="Voz"></label>
            <label>Propósito<select [(ngModel)]="vlanForm.purpose" name="vpur"><option value="datos">Datos / usuarios</option><option value="voz">Voz (telefonía IP)</option><option value="gestion">Gestión de equipos de red</option><option value="camaras">Cámaras y videovigilancia</option><option value="impresion">Impresión</option><option value="servidores">Servidores</option><option value="control">Control de acceso</option><option value="invitados">Invitados</option><option value="otro">Otro</option></select></label>
            <label>Subred (CIDR)<input [(ngModel)]="vlanForm.subnet_cidr" name="vcidr" placeholder="10.20.20.0/24"></label>
            <label>Gateway<input [(ngModel)]="vlanForm.gateway" name="vgw" placeholder="10.20.20.1"></label>
            <label>Rango DHCP<input [(ngModel)]="vlanForm.dhcp_range" name="vdhcp" placeholder="10.20.20.100-10.20.20.200"></label>
            <label class="check"><input type="checkbox" [(ngModel)]="vlanForm.active" name="vact"> VLAN activa</label>
            <label class="span4">Descripción<input [(ngModel)]="vlanForm.description" name="vdesc" placeholder="Teléfonos IP de todos los pisos, marcado por el conmutador"></label>
          </div>
          <button>{{editingVlanId?'Guardar cambios':'Declarar VLAN'}}</button>
        </form>

        <div class="card block">
          <div class="title compact"><div><h3>Catálogo de VLANs</h3><p>{{vlans().length}} VLAN(s) declarada(s).</p></div><label class="inline-filter">Sede<select [(ngModel)]="vlanSiteFilter" (ngModelChange)="loadVlans()" name="vfil"><option [ngValue]="''">Todas</option><option *ngFor="let s of sites()" [ngValue]="s.id">{{s.name}}</option></select></label></div>
          <div class="table-wrap"><table><thead><tr><th>Sede</th><th>VLAN</th><th>Nombre</th><th>Propósito</th><th>Subred</th><th>Gateway</th><th>En uso</th><th>Acciones</th></tr></thead><tbody>
            <tr *ngFor="let v of vlans()">
              <td>{{v.site_name}}</td>
              <td><b>{{v.vlan_id}}</b></td>
              <td>{{v.name}}<small class="sub">{{v.description || ''}}</small></td>
              <td>{{purposeLabel(v.purpose)}}</td>
              <td>{{v.subnet_cidr || '-'}}<small class="sub" *ngIf="v.dhcp_range">DHCP {{v.dhcp_range}}</small></td>
              <td>{{v.gateway || '-'}}</td>
              <td>{{v.interface_count || 0}} interfaz(ces)<small class="sub" *ngIf="v.management_count">{{v.management_count}} como VLAN de gestión</small></td>
              <td class="nowrap"><button class="ghost mini" (click)="editVlan(v)">Editar</button> <button class="danger mini" (click)="removeVlan(v)">Eliminar</button></td>
            </tr>
            <tr *ngIf="!vlans().length"><td colspan="8">Ninguna VLAN declarada todavía. Mientras el catálogo esté vacío, las VLANs se capturan como número libre.</td></tr>
          </tbody></table></div>
          <p class="hint">Una VLAN no puede eliminarse ni renumerarse mientras haya interfaces usándola.</p>
        </div>
      </section>

      <!-- ============================ PASO 2 · AGENTES ============================ -->
      <section *ngIf="tab==='agents'">
        <div class="title"><div><span class="crumb">Configuración · Paso 2 de 4</span><h2>Agentes de Sitio</h2><p>Un agente por sede. Mide desde dentro de esa red y envía los resultados aquí. Cada uno tiene su propia credencial: si se revoca uno, las demás sedes no quedan comprometidas.</p></div></div>
        <div class="guide" *ngIf="!sites().length">Antes de crear un agente conviene tener la sede registrada. <button class="ghost mini" (click)="go('sites')">Ir a Sedes</button></div>

        <div class="grid two">
          <form class="card" (ngSubmit)="saveAgent()">
            <div class="title compact"><div><h3>{{editingAgentId?'Editar Agente de Sitio':'Nuevo Agente de Sitio'}}</h3><p *ngIf="editingAgentId">ID {{editingAgentId}} · el token no cambia al editar.</p><p *ngIf="!editingAgentId">Al guardarlo se genera el token que necesitará el instalador en la sede.</p></div><button type="button" class="ghost" *ngIf="editingAgentId" (click)="newAgent()">Cancelar</button></div>
            <label>Nombre<input [(ngModel)]="agentForm.name" name="an" required placeholder="Agente Santander"></label>
            <label>Código<input [(ngModel)]="agentForm.agent_code" name="ac" placeholder="AGT-SANTANDER"></label>
            <label>Sede<select [(ngModel)]="agentForm.site_id" name="as"><option [ngValue]="null">Sin asignar</option><option *ngFor="let s of sites()" [ngValue]="s.id">{{s.name}}</option></select></label>
            <label>Descripción<textarea [(ngModel)]="agentForm.description" name="ad"></textarea></label>
            <label class="check" *ngIf="editingAgentId"><input type="checkbox" [(ngModel)]="agentForm.enabled" name="aen"> Agente habilitado</label>
            <button>{{editingAgentId?'Guardar cambios':'Generar agente y token'}}</button>
          </form>
          <div class="card">
            <h3>Token del agente</h3>
            <div *ngIf="agentTokenOnce()" class="token-box"><p><b>Guárdelo ahora.</b> Por seguridad el servidor no volverá a mostrar este token.</p><textarea readonly [value]="agentTokenOnce()"></textarea><div class="actions"><button class="ghost mini" (click)="copyToken()">Copiar</button><button class="ghost mini" (click)="agentTokenOnce.set('')">Ocultar</button></div></div>
            <p *ngIf="!agentTokenOnce()" class="muted">Al crear un agente (o al generar un token nuevo) aparecerá aquí una sola vez.</p>
            <hr>
            <h4>Qué hacer con el token</h4>
            <ol class="mini-list">
              <li>Copie el sistema al equipo que quedará encendido en esa sede.</li>
              <li>Ejecute <code>INSTALAR-AGENTE.bat</code> en ese equipo.</li>
              <li>Indique la URL de esta API y pegue el token.</li>
              <li>Ejecute <code>INICIAR-AGENTE.bat</code> y confirme que aparece EN LÍNEA en la tabla de abajo.</li>
            </ol>
            <p class="hint">Guía completa: <code>docs/GUIA_INSTALACION_AGENTE_SITIO.md</code></p>
          </div>
        </div>

        <div class="card block"><div class="title compact"><div><h3>Agentes registrados</h3><p>{{agents().length}} agente(s).</p></div><button class="ghost" *ngIf="agents().length" (click)="go('inventory')">Siguiente paso: Inventario →</button></div><div class="table-wrap"><table><thead><tr><th>Código</th><th>Agente</th><th>Sede</th><th>Estado</th><th>Equipo local</th><th>Buffer</th><th>Versión</th><th>Acciones</th></tr></thead><tbody><tr *ngFor="let a of agents()"><td>{{a.agent_code || '-'}}</td><td><b>{{a.name}}</b><small class="sub">{{a.description || ''}}</small></td><td><select [ngModel]="a.site_id" (ngModelChange)="assignAgentSite(a,$event)" [name]="'ags-'+a.id"><option [ngValue]="null">Sin sede</option><option *ngFor="let s of sites()" [ngValue]="s.id">{{s.name}}</option></select></td><td><span [class]="'badge '+(agentOnline(a)?'ok':'down')">{{agentOnline(a)?'EN LÍNEA':'SIN HEARTBEAT'}}</span></td><td>{{a.hostname || '-'}}<small class="sub">{{a.ip_address || ''}} {{a.platform || ''}}</small></td><td>{{a.buffer_depth || 0}}</td><td>{{a.version || '-'}}</td><td class="nowrap"><button class="ghost mini" (click)="editAgent(a)">Editar</button> <button class="ghost mini" (click)="rotateAgentToken(a)">Nuevo token</button> <button class="danger mini" (click)="removeAgent(a)">Eliminar</button></td></tr><tr *ngIf="!agents().length"><td colspan="8">Todavía no hay agentes registrados.</td></tr></tbody></table></div><p class="hint">Una sede con un solo agente activo asigna sus equipos automáticamente. Con dos o más, cada equipo debe indicar su agente de forma explícita.</p></div>
      </section>

      <!-- ============================ PASO 3 · INVENTARIO ============================ -->
      <section *ngIf="tab==='inventory'">
        <div class="title"><div><span class="crumb">Configuración · Paso 3 de 4</span><h2>Inventario de equipos</h2><p>Para empezar a monitorear basta con sede, nombre, host y tipo de prueba. El resto de la ficha puede completarla después sin perder el histórico.</p></div><button class="ghost" (click)="newDevice()">Nuevo equipo</button></div>
        <div class="guide" *ngIf="!sites().length">Primero necesita al menos una sede. <button class="ghost mini" (click)="go('sites')">Ir a Sedes</button></div>

        <div class="card filters"><h3>Filtros</h3><div class="form-grid six"><label>Sede<select [(ngModel)]="inventoryFilters.site_id" (ngModelChange)="loadInventory()"><option value="">Todas</option><option *ngFor="let s of sites()" [value]="s.id">{{s.name}}</option></select></label><label>Tipo<select [(ngModel)]="inventoryFilters.device_type" (ngModelChange)="loadInventory()"><option value="">Todos</option><option *ngFor="let x of deviceTypes()">{{x}}</option></select></label><label>Fabricante<input [(ngModel)]="inventoryFilters.manufacturer" (keyup.enter)="loadInventory()" placeholder="Cisco, Fortinet..."></label><label>Estado<select [(ngModel)]="inventoryFilters.lifecycle_status" (ngModelChange)="loadInventory()"><option value="">Todos</option><option value="active">Activo</option><option value="maintenance">Mantenimiento</option><option value="reserve">Reserva</option><option value="replaced">Sustituido</option><option value="retired">Baja</option></select></label><label>Criticidad<select [(ngModel)]="inventoryFilters.criticality" (ngModelChange)="loadInventory()"><option value="">Todas</option><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="critical">Crítica</option></select></label><label>Monitoreo<select [(ngModel)]="inventoryFilters.status" (ngModelChange)="loadInventory()"><option value="">Todos</option><option value="ok">Operando</option><option value="warning">Advertencia</option><option value="critical">Crítico</option><option value="down">Sin comunicación</option><option value="unknown">Sin datos</option></select></label><label>Buscar<input [(ngModel)]="inventoryFilters.text" (keyup.enter)="loadInventory()" placeholder="nombre, IP, serie, MAC..."></label></div><div class="actions"><button (click)="loadInventory()">Aplicar</button><button class="ghost" (click)="clearInventoryFilters()">Limpiar</button></div></div>

        <form class="card block" (ngSubmit)="saveDevice()" *ngIf="showDeviceForm">
          <div class="title compact"><div><h3>{{editingDeviceId?'Editar equipo':'Registrar equipo'}}</h3><p *ngIf="editingDeviceId">ID {{editingDeviceId}} · puede modificar la información sin perder su histórico de monitoreo.</p><p *ngIf="!editingDeviceId">Las dos primeras secciones son las necesarias para monitorear; las demás son documentación del inventario.</p></div><button type="button" class="ghost" (click)="closeDeviceForm()">Cerrar</button></div>
          <details open><summary>1 · Identificación y clasificación <small class="req">obligatorio: sede y nombre</small></summary><div class="form-grid four"><label>Sede<select [(ngModel)]="deviceForm.site_id" (ngModelChange)="onDeviceSiteChange($event)" name="dsite" required><option [ngValue]="null">Seleccione</option><option *ngFor="let s of sites()" [ngValue]="s.id">{{s.name}}</option></select></label><label>Agente de Sitio<select [(ngModel)]="deviceForm.probe_id" name="dag"><option [ngValue]="null">Heredar agente de la sede</option><option *ngFor="let a of agentsForSite(deviceForm.site_id)" [ngValue]="a.id">{{a.name}} · {{a.site_name || 'sin sede'}}</option></select></label><label>Equipo padre / dependencia<select [(ngModel)]="deviceForm.parent_id" name="dparent"><option [ngValue]="null">Sin dependencia</option><option *ngFor="let p of devicesForSite(deviceForm.site_id)" [ngValue]="p.id">{{p.name}}</option></select></label><label>Nombre<input [(ngModel)]="deviceForm.name" name="dname" required></label><label>Tipo<select [(ngModel)]="deviceForm.device_type" name="dtype"><optgroup label="Red"><option value="gateway">Router / gateway</option><option value="internet">Enlace a Internet / WAN</option><option value="firewall">Firewall</option><option value="switch">Switch</option><option value="ap">Access point Wi-Fi</option><option value="controller">Controladora Wi-Fi</option><option value="dns">Servidor DNS</option></optgroup><optgroup label="Cómputo"><option value="server">Servidor</option><option value="pc">Equipo de cómputo</option><option value="storage">Almacenamiento / NAS</option><option value="ups">UPS / No-break</option></optgroup><optgroup label="Periféricos y oficina"><option value="printer">Impresora</option><option value="copier">Copiadora / multifuncional</option><option value="scanner">Escáner de red</option><option value="voip">Teléfono IP</option><option value="pbx">Conmutador / PBX</option><option value="projector">Proyector / pantalla</option></optgroup><optgroup label="Seguridad y control"><option value="camera">Cámara IP</option><option value="nvr">Grabador de video (NVR/DVR)</option><option value="access-control">Control de acceso / biométrico</option><option value="clock">Reloj checador</option></optgroup><optgroup label="Otros"><option value="generic">Genérico / otro</option></optgroup></select></label><label>Núm. inventario<input [(ngModel)]="deviceForm.inventory_number" name="dinv"></label><label>Núm. activo<input [(ngModel)]="deviceForm.asset_number" name="dasset"></label><label>Categoría<input [(ngModel)]="deviceForm.category" name="dcat"></label><label>Subcategoría<input [(ngModel)]="deviceForm.subcategory" name="dsub"></label><label>Fabricante<input [(ngModel)]="deviceForm.manufacturer" name="dmfg"></label><label>Modelo<input [(ngModel)]="deviceForm.model" name="dmodel"></label><label>Núm. serie<input [(ngModel)]="deviceForm.serial_number" name="dserial"></label><label>Part number<input [(ngModel)]="deviceForm.part_number" name="dpn"></label><label>Service tag<input [(ngModel)]="deviceForm.service_tag" name="dstag"></label><label>Estado<select [(ngModel)]="deviceForm.lifecycle_status" name="dlife"><option value="active">Activo</option><option value="maintenance">Mantenimiento</option><option value="reserve">Reserva</option><option value="replaced">Sustituido</option><option value="retired">Baja</option></select></label><label>Criticidad<select [(ngModel)]="deviceForm.criticality" name="dcrit"><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="critical">Crítica</option></select></label><label class="check"><input type="checkbox" [(ngModel)]="deviceForm.enabled" name="den"> Monitoreo habilitado</label><label class="span4">Descripción<textarea [(ngModel)]="deviceForm.description" name="ddesc"></textarea></label></div><p class="hint">El <b>equipo padre</b> es lo que hace útil el diagnóstico: si marca que estos equipos dependen de su switch, cuando el switch caiga el sistema le dirá dónde revisar primero en lugar de abrir veinte incidentes sueltos.</p></details>

          <details open><summary>2 · Red y prueba de monitoreo <small class="req">obligatorio: host</small></summary><div class="form-grid four"><label>Host / IP de monitoreo<input [(ngModel)]="deviceForm.host" name="dhost" required></label><label>Hostname<input [(ngModel)]="deviceForm.hostname" name="dhn"></label><label>FQDN<input [(ngModel)]="deviceForm.fqdn" name="dfqdn"></label><label>MAC principal<input [(ngModel)]="deviceForm.mac_address" name="dmac" placeholder="AA:BB:CC:DD:EE:FF"></label><label>VLAN gestión<select *ngIf="vlansForSite(deviceForm.site_id).length" [(ngModel)]="deviceForm.management_vlan" name="dvlan"><option [ngValue]="null">Sin especificar</option><option *ngFor="let v of vlansForSite(deviceForm.site_id)" [ngValue]="v.vlan_id">{{v.vlan_id}} · {{v.name}}</option></select><input *ngIf="!vlansForSite(deviceForm.site_id).length" type="number" [(ngModel)]="deviceForm.management_vlan" name="dvlan" placeholder="sin catálogo: número libre"></label><label>Máscara<input [(ngModel)]="deviceForm.subnet_mask" name="dmask"></label><label>Gateway<input [(ngModel)]="deviceForm.gateway" name="dgw"></label><label>DNS<input [(ngModel)]="deviceForm.dns_servers" name="ddns" placeholder="10.0.0.10,10.0.0.11"></label><label>Direccionamiento<select [(ngModel)]="deviceForm.addressing_method" name="daddr"><option value="static">Estático</option><option value="dhcp">DHCP</option><option value="other">Otro</option></select></label><label>Prueba<select [(ngModel)]="deviceForm.check_type" name="dcheck"><option value="ping">PING</option><option value="tcp">TCP</option><option value="dns">DNS</option><option value="https">HTTPS</option></select></label><label>Puerto prueba<input type="number" [(ngModel)]="deviceForm.check_port" name="dcport"></label><label>Ruta / nombre prueba<input [(ngModel)]="deviceForm.check_path" name="dcpath"></label><label>Intervalo seg.<input type="number" [(ngModel)]="deviceForm.interval_sec" name="dint"></label><label>Warning ms<input type="number" [(ngModel)]="deviceForm.warning_ms" name="dwarn"></label><label>Crítico ms<input type="number" [(ngModel)]="deviceForm.critical_ms" name="dcritical"></label></div><p class="hint">{{checkHelp()}}</p></details>

          <details><summary>3 · Hardware, software y ubicación física <small class="opc">documentación</small></summary><div class="form-grid four"><label>Firmware<input [(ngModel)]="deviceForm.firmware" name="dfw"></label><label>Sistema operativo<input [(ngModel)]="deviceForm.operating_system" name="dos"></label><label>Versión SO<input [(ngModel)]="deviceForm.os_version" name="dosv"></label><label>Edificio / sección<input [(ngModel)]="deviceForm.building" name="dbuild"></label><label>Piso<input [(ngModel)]="deviceForm.floor" name="dfloor"></label><label>Área<input [(ngModel)]="deviceForm.area" name="darea"></label><label>Cuarto / SITE<input [(ngModel)]="deviceForm.room" name="droom"></label><label>Rack<input [(ngModel)]="deviceForm.rack_name" name="drack"></label><label>Unidad U<input type="number" [(ngModel)]="deviceForm.rack_unit" name="dru"></label><label class="span2">Ubicación física detallada<input [(ngModel)]="deviceForm.physical_location" name="dphys" placeholder="Techo frente a recepción / escritorio 12"></label></div></details>

          <details><summary>4 · Responsable, adquisición y garantía <small class="opc">documentación</small></summary><div class="form-grid four"><label>Persona responsable<input [(ngModel)]="deviceForm.responsible_person" name="dresp"></label><label>Unidad administrativa<input [(ngModel)]="deviceForm.administrative_unit" name="dunit"></label><label>Proveedor<input [(ngModel)]="deviceForm.supplier" name="dsupp"></label><label>Fecha adquisición<input type="date" [(ngModel)]="deviceForm.acquisition_date" name="dacq"></label><label>Fin garantía<input type="date" [(ngModel)]="deviceForm.warranty_end" name="dwarr"></label><label>Contrato / referencia<input [(ngModel)]="deviceForm.contract_reference" name="dcontract"></label><label class="span4">Notas<textarea [(ngModel)]="deviceForm.notes" name="dnotes"></textarea></label></div></details>
          <div class="actions"><button>{{editingDeviceId?'Guardar cambios':'Registrar equipo'}}</button><button type="button" class="ghost" (click)="closeDeviceForm()">Cancelar</button></div>
        </form>

        <div class="card block"><div class="title compact"><div><h3>Equipos registrados</h3><p>{{inventoryDevices().length}} registro(s) según los filtros actuales.</p></div><button class="ghost" *ngIf="inventoryDevices().length" (click)="go('monitoring')">Siguiente paso: Monitoreo SNMP →</button></div><div class="table-wrap"><table><thead><tr><th>Equipo</th><th>Sede / ubicación</th><th>Fabricante / modelo</th><th>Red</th><th>Agente</th><th>Estado</th><th>Monitoreo</th><th>Acciones</th></tr></thead><tbody><tr *ngFor="let d of inventoryDevices()"><td><b>{{d.name}}</b><small class="sub">{{d.device_type}} · {{d.inventory_number || 'sin inventario'}}<br>{{d.serial_number || ''}}</small></td><td>{{d.site_name}}<small class="sub">{{deviceLocation(d)}}</small></td><td>{{d.manufacturer || '-'}}<small class="sub">{{d.model || ''}}</small></td><td>{{d.host}}<small class="sub">{{d.mac_address || ''}} <span *ngIf="d.management_vlan">· VLAN {{d.management_vlan}}</span></small></td><td>{{d.probe_name || 'heredado por sede'}}</td><td>{{d.lifecycle_status}}<small class="sub">criticidad {{d.criticality}}</small></td><td><span [class]="'badge '+(d.effective_status||'unknown')">{{statusLabel(d.effective_status)}}</span></td><td class="nowrap"><button class="ghost mini" (click)="editDevice(d)">Editar</button> <button class="ghost mini" (click)="manageInterfaces(d)">Interfaces ({{d.interface_count || 0}})</button> <button class="danger mini" (click)="removeDevice(d.id)">Eliminar</button></td></tr><tr *ngIf="!inventoryDevices().length"><td colspan="8">No hay resultados.</td></tr></tbody></table></div><p class="hint">Para dar de baja un equipo conservando su histórico, prefiera editarlo y poner Estado = Baja. El botón Eliminar borra también todas sus mediciones.</p></div>

        <div class="card block" *ngIf="interfaceDevice"><div class="title compact"><div><h3>Interfaces de {{interfaceDevice.name}}</h3><p>Permite varias MAC/IP/VLAN y documentar el switch, puerto, roseta y patch panel. Es la base del mapeo físico de la red.</p><p class="muted" *ngIf="vlansForSite(interfaceDevice?.site_id).length">VLANs declaradas en esta sede: {{vlanSummary(interfaceDevice?.site_id)}}</p></div><button class="ghost" (click)="closeInterfaces()">Cerrar</button></div><form (ngSubmit)="saveInterface()"><div class="form-grid six"><label>Nombre<input [(ngModel)]="ifaceForm.name" name="ifn" required placeholder="Ethernet / iLO / WAN"></label><label>MAC<input [(ngModel)]="ifaceForm.mac_address" name="ifmac"></label><label>IPv4<input [(ngModel)]="ifaceForm.ipv4_address" name="if4"></label><label>IPv6<input [(ngModel)]="ifaceForm.ipv6_address" name="if6"></label><label>VLAN<select *ngIf="vlansForSite(interfaceDevice?.site_id).length" [(ngModel)]="ifaceForm.vlan_id" name="ifv"><option [ngValue]="null">Sin especificar</option><option *ngFor="let v of vlansForSite(interfaceDevice?.site_id)" [ngValue]="v.vlan_id">{{v.vlan_id}} · {{v.name}}</option></select><input *ngIf="!vlansForSite(interfaceDevice?.site_id).length" type="number" [(ngModel)]="ifaceForm.vlan_id" name="ifv" placeholder="sin catálogo"></label><label>Velocidad Mbps<input type="number" [(ngModel)]="ifaceForm.speed_mbps" name="ifs"></label><label>Tipo<input [(ngModel)]="ifaceForm.interface_type" name="ift" placeholder="ethernet / wifi / management"></label><label>Switch<select [(ngModel)]="ifaceForm.switch_device_id" name="ifsw"><option [ngValue]="null">Sin documentar</option><option *ngFor="let sw of switchDevices()" [ngValue]="sw.id">{{sw.name}}</option></select></label><label>ifIndex SNMP<input type="number" [(ngModel)]="ifaceForm.switch_if_index" name="ifidx"></label><label>Puerto físico<input [(ngModel)]="ifaceForm.switch_port_name" name="ifport" placeholder="Gi1/0/24"></label><label>Roseta / nodo<input [(ngModel)]="ifaceForm.wall_jack" name="ifjack"></label><label>Patch panel<input [(ngModel)]="ifaceForm.patch_panel" name="ifpp"></label><label>Puerto patch<input [(ngModel)]="ifaceForm.patch_port" name="ifppp"></label><label class="check"><input type="checkbox" [(ngModel)]="ifaceForm.primary_interface" name="ifprim"> Interfaz principal</label><label class="span4">Notas<input [(ngModel)]="ifaceForm.notes" name="ifnotes"></label></div><div class="actions"><button>{{editingInterfaceId?'Guardar interfaz':'Agregar interfaz'}}</button><button type="button" class="ghost" *ngIf="editingInterfaceId" (click)="newInterface()">Cancelar</button></div></form><div class="table-wrap"><table><thead><tr><th>Interfaz</th><th>MAC</th><th>IP</th><th>VLAN</th><th>Conexión física</th><th>Acciones</th></tr></thead><tbody><tr *ngFor="let i of interfaces()"><td><b>{{i.name}}</b><small class="sub">{{i.interface_type || ''}} {{i.primary_interface?'· principal':''}}</small></td><td>{{i.mac_address || '-'}}</td><td>{{i.ipv4_address || '-'}}<small class="sub">{{i.ipv6_address || ''}}</small></td><td>{{i.vlan_id || '-'}}</td><td>{{i.switch_name || '-'}} <span *ngIf="i.switch_port_label || i.switch_if_index">/ {{i.switch_port_label || ('ifIndex '+i.switch_if_index)}}</span><small class="sub">{{i.wall_jack || ''}} {{i.patch_panel || ''}} {{i.patch_port || ''}}</small></td><td class="nowrap"><button class="ghost mini" (click)="editInterface(i)">Editar</button> <button class="danger mini" (click)="removeInterface(i.id)">Eliminar</button></td></tr><tr *ngIf="!interfaces().length"><td colspan="6">Este equipo todavía no tiene interfaces documentadas.</td></tr></tbody></table></div></div>
      </section>

      <!-- ============================ PASO 4 · MONITOREO SNMP ============================ -->
      <section *ngIf="tab==='monitoring'">
        <div class="title"><div><span class="crumb">Configuración · Paso 4 de 4 · opcional</span><h2>Monitoreo SNMP avanzado</h2><p>Sólo para switches y access points. Activa la lectura de puertos y de métricas Wi-Fi además del sondeo básico.</p></div></div>
        <div class="guide">El <b>perfil SNMP</b> que escriba aquí debe existir con el mismo nombre en <code>probe/config/snmp-profiles.json</code> del agente de esa sede, que es donde viven las credenciales. Los perfiles <code>SIMULADOR-WIFI</code> y <code>SIMULADOR-SWITCH</code> generan datos de prueba y no consultan la red. Sólo se admite SNMPv3.</div>

        <div class="grid two">
          <form class="card" (ngSubmit)="saveSwitchConfig()">
            <h3>Puertos de switch</h3>
            <label>Switch<select [(ngModel)]="switchEdit.device_id" name="sid" (ngModelChange)="selectSwitchConfig()"><option [ngValue]="null">Seleccione</option><option *ngFor="let d of switchDevices()" [ngValue]="d.id">{{d.name}} · {{d.site_name}}</option></select></label>
            <label class="check"><input type="checkbox" [(ngModel)]="switchEdit.switch_enabled" name="sen"> Habilitar lectura de puertos</label>
            <label>Perfil SNMP<input [(ngModel)]="switchEdit.switch_snmp_profile" name="ssp" placeholder="SNMPV3-ESTANDAR"></label>
            <label>Intervalo seg.<input type="number" [(ngModel)]="switchEdit.switch_poll_interval_sec" name="spi"></label>
            <div class="row3"><label>CRC/intervalo<input type="number" [(ngModel)]="switchEdit.crc_warn_delta" name="crc"></label><label>Uplink alto %<input type="number" [(ngModel)]="switchEdit.uplink_utilization_pct" name="uup"></label><label>Min. sostenidos<input type="number" [(ngModel)]="switchEdit.uplink_hold_minutes" name="uhm"></label></div>
            <div class="actions"><button [disabled]="!switchEdit.device_id">Guardar</button><button type="button" class="danger" [disabled]="!switchEdit.device_id" (click)="removeSwitchConfig()">Quitar monitoreo</button></div>
            <p class="hint">Quitar el monitoreo cierra las alertas abiertas de ese switch y conserva el histórico de puertos.</p>
          </form>
          <form class="card" (ngSubmit)="saveWifiConfig()">
            <h3>Access points Wi-Fi</h3>
            <label>AP<select [(ngModel)]="wifiEdit.device_id" name="wid" (ngModelChange)="selectWifiDevice()"><option [ngValue]="null">Seleccione</option><option *ngFor="let d of apDevices()" [ngValue]="d.id">{{d.name}} · {{d.site_name}}</option></select></label>
            <label class="check"><input type="checkbox" [(ngModel)]="wifiEdit.wifi_enabled" name="wien"> Habilitar lectura Wi-Fi</label>
            <label>Perfil SNMP<input [(ngModel)]="wifiEdit.snmp_profile" name="wip"></label>
            <label>Intervalo seg.<input type="number" [(ngModel)]="wifiEdit.wifi_poll_interval_sec" name="wii"></label>
            <div class="row3"><label>Clientes máx.<input type="number" [(ngModel)]="wifiEdit.wifi_max_clients" name="wim"></label><label>Warning %<input type="number" [(ngModel)]="wifiEdit.wifi_warn_utilization" name="wiw"></label><label>Crítico %<input type="number" [(ngModel)]="wifiEdit.wifi_critical_utilization" name="wic"></label></div>
            <div class="actions"><button [disabled]="!wifiEdit.device_id">Guardar</button><button type="button" class="danger" [disabled]="!wifiEdit.device_id" (click)="removeWifiConfig()">Quitar monitoreo</button></div>
            <p class="hint">Quitar el monitoreo cierra las alertas Wi-Fi abiertas y conserva el histórico del AP.</p>
          </form>
        </div>
        <div class="card block"><div class="title compact"><div><h3>Equipos con monitoreo SNMP activo</h3></div><div class="actions"><button class="ghost" (click)="go('ports')">Ver puertos</button><button class="ghost" (click)="go('wifi')">Ver Wi-Fi</button></div></div><div class="table-wrap"><table><thead><tr><th>Equipo</th><th>Sede</th><th>Tipo</th><th>Perfil</th><th>Intervalo</th></tr></thead><tbody><tr *ngFor="let d of snmpDevices()"><td><b>{{d.name}}</b><small class="sub">{{d.host}}</small></td><td>{{d.site_name}}</td><td>{{d.switch_enabled?'Puertos de switch':'Wi-Fi'}}</td><td>{{d.switch_enabled? (d.switch_snmp_profile||'sin perfil') : (d.snmp_profile||'sin perfil')}}</td><td>{{(d.switch_enabled? d.switch_poll_interval_sec : d.wifi_poll_interval_sec) || '-'}} s</td></tr><tr *ngIf="!snmpDevices().length"><td colspan="5">Ningún equipo tiene monitoreo SNMP activo todavía.</td></tr></tbody></table></div></div>
      </section>

      <!-- ============================ ANÁLISIS ============================ -->
      <section *ngIf="tab==='analysis'">
        <div class="title"><div><span class="crumb">Operación</span><h2>Análisis por sede</h2><p>Identifica los edificios con mayor recurrencia, indisponibilidad y tiempo de recuperación.</p></div><button (click)="loadAnalytics()">Recalcular</button></div>
        <div class="card filters"><div class="form-grid four"><label>Periodo<select [(ngModel)]="analyticsDays" (ngModelChange)="loadAnalytics()"><option [ngValue]="7">7 días</option><option [ngValue]="30">30 días</option><option [ngValue]="90">90 días</option><option [ngValue]="365">365 días</option></select></label><label>Municipio<select [(ngModel)]="analysisMunicipality"><option value="">Todos</option><option *ngFor="let m of municipalities()" [value]="m">{{m}}</option></select></label><label>Buscar sede<input [(ngModel)]="analysisText" placeholder="Santander"></label><label>Criticidad<select [(ngModel)]="analysisCriticality"><option value="">Todas</option><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="critical">Crítica</option></select></label></div></div>
        <div class="metrics five"><article><span>Sedes analizadas</span><b>{{filteredAnalytics().length}}</b></article><article class="down"><span>Incidentes</span><b>{{analyticsTotal('incident_count')}}</b></article><article class="down"><span>Críticos</span><b>{{analyticsTotal('critical_incidents')}}</b></article><article class="warn"><span>Alertas de puerto</span><b>{{analyticsTotal('port_alerts')}}</b></article><article class="warn"><span>Alertas Wi-Fi</span><b>{{analyticsTotal('wifi_alerts')}}</b></article></div>
        <div class="card"><h3>Ranking de fallas</h3><div class="table-wrap"><table><thead><tr><th>#</th><th>Sede</th><th>Equipos</th><th>Disponibilidad</th><th>Incidentes</th><th>Inc./100 eq.</th><th>Críticos</th><th>Tiempo caído</th><th>MTTR</th><th>Puertos</th><th>Wi-Fi</th><th>Riesgo</th><th>Salud</th></tr></thead><tbody><tr *ngFor="let s of filteredAnalytics(); let n=index"><td>{{n+1}}</td><td><b>{{s.name}}</b><small class="sub">{{s.municipality || ''}}</small></td><td>{{s.device_count}}</td><td>{{s.availability_pct | number:'1.2-2'}}%</td><td>{{s.incident_count}}</td><td>{{s.incidents_per_100_devices | number:'1.1-2'}}</td><td>{{s.critical_incidents}}</td><td>{{s.downtime_minutes}} min</td><td>{{s.mttr_minutes}} min</td><td>{{s.port_alerts}}</td><td>{{s.wifi_alerts}}</td><td><b>{{s.risk_score | number:'1.1-2'}}</b></td><td><span [class]="'badge '+s.health">{{s.health}}</span></td></tr></tbody></table></div><p class="hint">La disponibilidad es un indicador operativo aproximado calculado con el tiempo acumulado de incidentes respecto del número de equipos monitorizados del sitio.</p></div>
      </section>

      <!-- ============================ PUERTOS ============================ -->
      <section *ngIf="tab==='ports'">
        <div class="title"><div><span class="crumb">Operación</span><h2>Puertos y enlaces</h2><p>IF-MIB / IF-X-MIB / EtherLike-MIB y LLDP desde el Agente de Sitio local.</p></div><div class="actions"><button class="ghost" (click)="go('monitoring')">Configurar</button><button (click)="loadPorts()">Actualizar</button></div></div>
        <div class="metrics"><article><span>Switches configurados</span><b>{{switchSummary()?.switches?.enabled || 0}}</b></article><article class="down"><span>Problemas críticos</span><b>{{switchSummary()?.alerts?.critical || 0}}</b></article><article class="warn"><span>Advertencias</span><b>{{switchSummary()?.alerts?.warning || 0}}</b></article></div>
        <div class="grid ports-layout"><div class="card"><h3>Puertos con problemas</h3><div class="table-wrap"><table><thead><tr><th>Gravedad</th><th>Switch</th><th>Puerto</th><th>LLDP</th><th>Diagnóstico</th></tr></thead><tbody><tr *ngFor="let a of portProblems()" (click)="openSwitch(a.device_id,a.if_index)" class="click-row"><td><span [class]="'badge '+a.severity">{{a.severity}}</span></td><td>{{a.switch_name}}<small class="sub">{{a.site_name}}</small></td><td><b>{{a.port_name}}</b><small class="sub">{{a.if_name || ('ifIndex '+a.if_index)}} · {{a.speed_mbps || '-'}} Mbps · {{a.duplex || '-'}}</small></td><td>{{a.lldp_neighbor || '-'}}<small class="sub">{{a.lldp_port || ''}}</small></td><td>{{a.diagnosis}}</td></tr><tr *ngIf="!portProblems().length"><td colspan="5">Sin problemas abiertos.</td></tr></tbody></table></div></div>
        <div class="card side"><h3>Detalle de switch</h3><label>Seleccionar switch<select [(ngModel)]="selectedSwitchId" (ngModelChange)="loadSwitchDetail()"><option [ngValue]="null">Seleccione</option><option *ngFor="let d of switchDevices()" [ngValue]="d.id">{{d.name}} · {{d.site_name}}</option></select></label><p *ngIf="switchDetail()?.device"><b>{{switchDetail().device.name}}</b><br><small>{{switchDetail().device.host}} · {{switchDetail().device.manufacturer || ''}} {{switchDetail().device.model || ''}}</small></p></div></div>
        <div *ngIf="switchDetail()?.device" class="card block"><h3>Mapa de puertos · {{switchDetail().device.name}}</h3><div class="port-map"><button *ngFor="let p of switchDetail().ports" [class]="'port '+portClass(p)" (click)="selectPort(p)"><b>{{p.if_name || p.if_index}}</b><small>{{p.custom_name || p.if_alias || ''}}</small><span>{{p.speed_mbps ? p.speed_mbps+'M' : p.oper_status}}</span></button></div><p class="hint" *ngIf="!switchDetail().ports?.length">Este switch todavía no ha reportado puertos. Revise que tenga monitoreo SNMP habilitado y que el agente de su sede esté en línea.</p></div>
        <div *ngIf="selectedPort" class="grid two block"><form class="card" (ngSubmit)="savePortConfig()"><h3>{{selectedPort.if_name}} · configuración</h3><label>Nombre funcional<input [(ngModel)]="portEdit.custom_name" name="pcn"></label><label>Velocidad esperada Mbps<input type="number" [(ngModel)]="portEdit.expected_speed_mbps" name="pes"></label><label class="check"><input type="checkbox" [(ngModel)]="portEdit.critical" name="pcr"> Puerto crítico</label><label class="check"><input type="checkbox" [(ngModel)]="portEdit.is_uplink" name="pul"> Es uplink</label><div class="actions"><button>Guardar puerto</button><button type="button" class="danger" (click)="resetPortConfig()">Restablecer</button></div><p class="hint">Restablecer borra el nombre funcional y las marcas de crítico/uplink de este puerto.</p><p class="hint">LLDP: {{selectedPort.lldp_neighbor || 'sin vecino'}} {{selectedPort.lldp_port || ''}}</p></form><div class="card"><h3>Alertas</h3><div class="incident" *ngFor="let a of portHistory()?.alerts"><b>{{a.title}}</b><span>{{a.status}} · {{a.severity}}</span><p>{{a.diagnosis}}</p></div><p *ngIf="!portHistory()?.alerts?.length">Sin alertas.</p></div></div>
        <div *ngIf="selectedPort" class="card block"><h3>Tráfico y errores · 24 h</h3><div class="chart-wrap"><svg viewBox="0 0 620 190" preserveAspectRatio="none"><line x1="10" y1="170" x2="610" y2="170" class="axis"/><polyline [attr.points]="chartPoints('rx_mbps')" class="line rx"/><polyline [attr.points]="chartPoints('tx_mbps')" class="line tx"/></svg></div><div class="legend"><span>RX Mbps</span><span>TX Mbps</span></div><div class="chart-wrap"><svg viewBox="0 0 620 190" preserveAspectRatio="none"><line x1="10" y1="170" x2="610" y2="170" class="axis"/><polyline [attr.points]="chartPoints('crc_errors_delta')" class="line err"/><polyline [attr.points]="chartPoints('discards_delta')" class="line discard"/></svg></div><div class="legend"><span>Errores CRC</span><span>Descartes</span></div></div>
      </section>

      <!-- ============================ WI-FI ============================ -->
      <section *ngIf="tab==='wifi'">
        <div class="title"><div><span class="crumb">Operación</span><h2>Wi-Fi</h2><p>Métricas obtenidas localmente por SNMP en cada edificio.</p></div><div class="actions"><button class="ghost" (click)="go('monitoring')">Configurar</button><button (click)="loadWifi()">Actualizar</button></div></div>
        <div class="metrics five"><article><span>AP</span><b>{{wifi()?.counts?.total || 0}}</b></article><article class="ok"><span>Operando</span><b>{{wifi()?.counts?.online || 0}}</b></article><article class="warn"><span>Advertencia</span><b>{{wifi()?.counts?.warning || 0}}</b></article><article class="down"><span>Caídos</span><b>{{wifi()?.counts?.down || 0}}</b></article><article><span>Clientes</span><b>{{wifi()?.totalClients || 0}}</b></article></div>
        <div class="grid wifi-grid"><div class="card"><h3>Access points</h3><div class="table-wrap"><table><thead><tr><th>AP</th><th>Sede</th><th>Estado</th><th>Clientes</th><th>PoE</th><th>CPU</th><th>Memoria</th></tr></thead><tbody><tr *ngFor="let a of wifi()?.aps"><td><b>{{a.name}}</b><small class="sub">{{a.host}}</small></td><td>{{a.site_name}}</td><td><span [class]="'badge '+a.effective_status">{{statusLabel(a.effective_status)}}</span></td><td>{{a.client_count ?? '-'}}</td><td>{{a.poe_watts ?? '-'}} W</td><td>{{a.cpu_pct ?? '-'}}%</td><td>{{a.memory_pct ?? '-'}}%</td></tr><tr *ngIf="!wifi()?.aps?.length"><td colspan="7">Ningún AP con monitoreo Wi-Fi habilitado.</td></tr></tbody></table></div></div><div class="card side"><h3>Alertas Wi-Fi</h3><div class="incident" *ngFor="let a of wifi()?.openAlerts"><b>{{a.device_name}}</b><span>{{a.severity}}</span><p>{{a.title}} · {{a.diagnosis}}</p></div><p *ngIf="!wifi()?.openAlerts?.length">Sin alertas.</p></div></div>
      </section>

      <!-- ============================ INCIDENTES ============================ -->
      <section *ngIf="tab==='incidents'"><div class="title"><div><span class="crumb">Operación</span><h2>Historial de incidentes</h2><p>Conectividad por equipo y sede.</p></div><button (click)="loadIncidents()">Actualizar</button></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Inicio</th><th>Equipo</th><th>Sede</th><th>Severidad</th><th>Estado</th><th>Diagnóstico</th></tr></thead><tbody><tr *ngFor="let i of incidents()"><td>{{i.started_at | date:'short'}}</td><td>{{i.device_name}}</td><td>{{i.site_name}}</td><td><span [class]="'badge '+i.severity">{{i.severity}}</span></td><td>{{i.status}}</td><td>{{i.diagnosis}}</td></tr><tr *ngIf="!incidents().length"><td colspan="6">Sin incidentes registrados.</td></tr></tbody></table></div></div></section>

      <!-- ============================ MI CUENTA ============================ -->
      <section *ngIf="tab==='account'">
        <div class="title"><div><span class="crumb">Cuenta</span><h2>Mi cuenta</h2><p>Ajustes de su sesión. Nada de esta sección afecta a los equipos monitoreados ni a los agentes.</p></div></div>
        <div class="grid two">
          <form class="card" (ngSubmit)="changePassword()"><h3>Cambiar mi contraseña</h3><label>Contraseña actual<input type="password" [(ngModel)]="pwd.current_password" name="pc" required></label><label>Nueva contraseña (mín. 10 caracteres)<input type="password" [(ngModel)]="pwd.new_password" name="pn" required minlength="10"></label><button>Cambiar contraseña</button><div class="error" *ngIf="pwdMsg()">{{pwdMsg()}}</div></form>
          <div class="card"><h3>Sesión</h3><table class="plain"><tbody><tr><td>Usuario</td><td><b>{{username}}</b></td></tr><tr><td>Versión</td><td>0.4.1</td></tr><tr><td>Alertas del navegador</td><td><button class="ghost mini" (click)="enableNotifications()">Activar</button></td></tr></tbody></table><hr><p class="hint">En esta versión existe un solo usuario administrador y no hay gestión de usuarios ni de roles. Quien entre con esta cuenta puede crear agentes, ver sus tokens y eliminar equipos: trate la contraseña como una credencial de administración.</p><button class="ghost" (click)="logout()">Cerrar sesión</button></div>
        </div>
      </section>
    </main>
  </div>`
})
class AppComponent {
  http=inject(HttpClient); token=localStorage.getItem('token')||''; username='admin'; password=''; tab='dashboard'; error=signal('');
  summary=signal<any>(null); sites=signal<any[]>([]); agents=signal<any[]>([]); devices=signal<any[]>([]); inventoryDevices=signal<any[]>([]); incidents=signal<any[]>([]); wifi=signal<any>(null); analytics=signal<any>(null);
  portProblems=signal<any[]>([]); switchSummary=signal<any>(null); switchDetail=signal<any>(null); portHistory=signal<any>(null);
  interfaces=signal<any[]>([]); agentTokenOnce=signal(''); pwdMsg=signal(''); opError=signal('');
  selectedSwitchId:any=null; selectedPort:any=null; portEdit:any={}; interfaceDevice:any=null; editingInterfaceId:number|null=null;
  siteForm:any=this.blankSite(); editingSiteId:number|null=null; showDeviceForm=false; deviceForm:any=this.blankDevice(); editingDeviceId:number|null=null; ifaceForm:any=this.blankInterface();
  inventoryFilters:any={site_id:'',device_type:'',manufacturer:'',lifecycle_status:'',criticality:'',status:'',text:''}; analyticsDays=30; analysisText=''; analysisCriticality=''; analysisMunicipality='';
  agentForm:any=this.blankAgent(); editingAgentId:number|null=null; wifiEdit:any=this.blankWifiEdit(); switchEdit:any=this.blankSwitchEdit();
  previousCritical=0; previousProbesOffline=0; previousWifiAlerts=0; previousPortAlerts=0; pwd:any={current_password:'',new_password:''};

  headers(){return {headers:new HttpHeaders({Authorization:'Bearer '+this.token})};}
  blankSite(){return {code:'',name:'',official_name:'',site_type:'administrative',country:'México',state:'México',municipality:'',locality:'',neighborhood:'',postal_code:'',street:'',exterior_number:'',interior_number:'',reference:'',latitude:null,longitude:null,phone:'',manager_name:'',manager_phone:'',manager_email:'',technical_contact:'',technical_phone:'',schedule:'',primary_isp:'',primary_bandwidth_mbps:null,secondary_isp:'',secondary_bandwidth_mbps:null,criticality:'medium',notes:'',description:'',active:true};}
  blankDevice(){return {site_id:null,probe_id:null,parent_id:null,name:'',host:'',device_type:'generic',check_type:'ping',check_port:null,check_path:'',interval_sec:60,warning_ms:80,critical_ms:150,enabled:true,inventory_number:'',asset_number:'',hostname:'',fqdn:'',description:'',category:'',subcategory:'',manufacturer:'',model:'',serial_number:'',part_number:'',service_tag:'',mac_address:'',management_vlan:null,subnet_mask:'',gateway:'',dns_servers:'',addressing_method:'static',firmware:'',operating_system:'',os_version:'',building:'',floor:'',area:'',room:'',rack_name:'',rack_unit:null,physical_location:'',responsible_person:'',administrative_unit:'',supplier:'',acquisition_date:null,warranty_end:null,contract_reference:'',lifecycle_status:'active',criticality:'medium',notes:''};}
  blankInterface(){return {name:'Ethernet',mac_address:'',ipv4_address:'',ipv6_address:'',vlan_id:null,speed_mbps:null,interface_type:'ethernet',switch_device_id:null,switch_if_index:null,switch_port_name:'',wall_jack:'',patch_panel:'',patch_port:'',notes:'',primary_interface:false};}
  blankAgent(){return {name:'',agent_code:'',site_id:null,description:'',enabled:true};}
  blankWifiEdit(){return {device_id:null,wifi_enabled:true,snmp_profile:'SIMULADOR-WIFI',wifi_poll_interval_sec:120,wifi_max_clients:40,wifi_warn_utilization:70,wifi_critical_utilization:85,wifi_warn_noise_dbm:-75};}
  blankSwitchEdit(){return {device_id:null,switch_enabled:true,switch_snmp_profile:'SIMULADOR-SWITCH',switch_poll_interval_sec:300,crc_warn_delta:1,uplink_utilization_pct:80,uplink_hold_minutes:10,storm_min_ports:3,storm_discard_delta:20};}

  login(){this.error.set('');this.http.post<any>('api/auth/login',{username:this.username,password:this.password}).subscribe({next:r=>{this.token=r.access_token;localStorage.setItem('token',this.token);this.startAutoRefresh();},error:()=>this.error.set('Credenciales incorrectas o API no disponible.')});}
  logout(){this.stopAutoRefresh();localStorage.removeItem('token');this.token='';}
  // ===================== Monitor de sala de control =====================
  noc=signal<any>(null);
  nocSeen=new Set<string>();      // eventos ya mostrados: sirve para detectar los nuevos
  nocAcked=new Set<string>();     // eventos silenciados por el operador
  nocNew=new Map<string,number>();// event_id -> momento en que apareció (para el resaltado)
  nocSiteFilter:any=null;
  nocClock='';
  nocUpdatedAt=0;
  soundReady=false; muted=false;
  audioCtx:any=null; alarmTimer:any=null; clockTimer:any=null;
  refreshSec=15;

  loadNoc(){
    this.http.get<any>('api/monitor/events',this.headers()).subscribe({
      next:r=>{
        const eventos:any[]=r?.events||[];
        const ids=new Set<string>(eventos.map(e=>e.event_id));
        const primeraCarga=!this.nocUpdatedAt;
        let nuevasCriticas=0, nuevasAdvertencias=0;
        for(const e of eventos){
          if(this.nocSeen.has(e.event_id)) continue;
          this.nocSeen.add(e.event_id);
          this.nocNew.set(e.event_id,Date.now());
          // En la primera carga no suena: mostraría una alarma por cada incidencia ya conocida.
          if(!primeraCarga){ if(e.severity==='critical') nuevasCriticas++; else nuevasAdvertencias++; }
        }
        // Lo que ya se resolvió deja de ocupar memoria y vuelve a poder sonar si reaparece.
        for(const id of [...this.nocSeen]) if(!ids.has(id)){ this.nocSeen.delete(id); this.nocAcked.delete(id); this.nocNew.delete(id); }
        this.noc.set(r); this.nocUpdatedAt=Date.now();
        if(nuevasCriticas){ this.alarm('critical'); this.notify('Incidencia crítica',`${nuevasCriticas} incidencia(s) crítica(s) nueva(s).`); }
        else if(nuevasAdvertencias){ this.alarm('warning'); this.notify('Nueva advertencia',`${nuevasAdvertencias} advertencia(s) nueva(s).`); }
        this.updateAlarmLoop();
      },
      error:e=>this.apiFail(e)
    });
  }

  nocFiltered(){ const ev=this.noc()?.events||[]; return this.nocSiteFilter?ev.filter((e:any)=>e.site_id===this.nocSiteFilter):ev; }
  unackedCritical(){ return (this.noc()?.events||[]).filter((e:any)=>e.severity==='critical'&&!this.nocAcked.has(e.event_id)).length; }
  unackedWarning(){ return (this.noc()?.events||[]).filter((e:any)=>e.severity!=='critical'&&!this.nocAcked.has(e.event_id)).length; }
  isNewEvent(e:any){ const t=this.nocNew.get(e.event_id); return !!t && Date.now()-t < 60000; }
  kindLabel(k:string){ return k==='agent'?'agente':k==='port'?'puerto':k==='wifi'?'wi-fi':'equipo'; }
  nocAgo(){ if(!this.nocUpdatedAt) return 'nunca'; const s=Math.round((Date.now()-this.nocUpdatedAt)/1000); return s<60?`hace ${s} s`:`hace ${Math.round(s/60)} min`; }
  eventAge(e:any){
    if(!e.started_at) return '-';
    const min=Math.max(0,Math.round((Date.now()-new Date(e.started_at).getTime())/60000));
    if(min<60) return `${min} min`;
    const h=Math.floor(min/60); return h<24?`${h} h ${min%60} min`:`${Math.floor(h/24)} d ${h%24} h`;
  }
  openEvent(e:any){
    this.nocAcked.add(e.event_id); this.updateAlarmLoop();
    if(e.kind==='port'&&e.device_id) this.openSwitch(e.device_id,e.if_index);
    else if(e.kind==='agent') this.go('agents');
    else if(e.kind==='wifi') this.go('wifi');
    else this.go('incidents');
  }
  /** Reconocer: deja de sonar por lo que ya está en pantalla, pero una incidencia nueva vuelve a sonar. */
  silence(){ for(const e of (this.noc()?.events||[])) this.nocAcked.add(e.event_id); this.updateAlarmLoop(); }

  // ---------- sonido ----------
  // Los navegadores no permiten reproducir audio sin una acción del usuario:
  // por eso el operador debe pulsar "Activar sonido" una vez por sesión.
  enableSound(){
    try{
      const Ctx=(window as any).AudioContext||(window as any).webkitAudioContext;
      this.audioCtx=new Ctx(); this.audioCtx.resume?.();
      this.soundReady=true; this.muted=false; this.saveNocPrefs();
      this.tone(880,0.12,0); this.tone(1175,0.16,0.14);
      if('Notification' in window) Notification.requestPermission();
    }catch{ this.opError.set('Este navegador no permite reproducir el tono de alarma.'); }
  }
  private tone(freq:number,dur:number,delay:number,vol=0.22){
    if(!this.audioCtx||this.muted) return;
    const t0=this.audioCtx.currentTime+delay;
    const osc=this.audioCtx.createOscillator(); const gain=this.audioCtx.createGain();
    osc.type='square'; osc.frequency.value=freq;
    gain.gain.setValueAtTime(0.0001,t0);
    gain.gain.exponentialRampToValueAtTime(vol,t0+0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    osc.connect(gain); gain.connect(this.audioCtx.destination);
    osc.start(t0); osc.stop(t0+dur+0.02);
  }
  /** Crítica: tres pulsos agudos. Advertencia: dos tonos graves, claramente distintos. */
  alarm(sev:string){
    if(!this.soundReady||this.muted) return;
    if(sev==='critical'){ this.tone(988,0.16,0); this.tone(988,0.16,0.22); this.tone(988,0.24,0.44); }
    else { this.tone(587,0.18,0); this.tone(494,0.22,0.22); }
  }
  /** Mientras quede una crítica sin reconocer, el tono se repite cada 20 s. */
  updateAlarmLoop(){
    const activa=this.unackedCritical()>0;
    if(activa&&!this.alarmTimer) this.alarmTimer=setInterval(()=>{ if(this.unackedCritical()>0&&this.tab==='noc') this.alarm('critical'); else this.updateAlarmLoop(); },20000);
    if(!activa&&this.alarmTimer){ clearInterval(this.alarmTimer); this.alarmTimer=null; }
  }
  toggleFullscreen(){ if(document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.(); }
  saveNocPrefs(){ try{ localStorage.setItem('noc-muted',this.muted?'1':'0'); localStorage.setItem('noc-refresh',String(this.refreshSec)); }catch{} }
  loadNocPrefs(){ try{ this.muted=localStorage.getItem('noc-muted')==='1'; const r=Number(localStorage.getItem('noc-refresh')); if([5,10,15,30].includes(r)) this.refreshSec=r; }catch{} }

  refreshTimer:any=null;
  ngOnInit(){ this.loadNocPrefs(); if(this.token)this.startAutoRefresh(); }
  ngOnDestroy(){ this.stopAutoRefresh(); }
  startAutoRefresh(){
    this.stopAutoRefresh(); this.saveNocPrefs(); this.loadAll();
    if(this.tab==='noc') this.loadNoc();
    this.refreshTimer=setInterval(()=>{
      if(!this.token){this.stopAutoRefresh();return;}
      if(this.tab==='noc'){this.loadNoc();return;}   // el tablero sólo pide lo suyo: una consulta por ciclo
      if(this.tab==='dashboard')this.loadAll();
      if(this.tab==='wifi')this.loadWifi();
      if(this.tab==='ports')this.loadPorts(false);
    },Math.max(5,this.refreshSec)*1000);
    this.clockTimer=setInterval(()=>{ this.nocClock=new Date().toLocaleTimeString(); },1000);
  }
  stopAutoRefresh(){
    if(this.refreshTimer){clearInterval(this.refreshTimer);this.refreshTimer=null;}
    if(this.clockTimer){clearInterval(this.clockTimer);this.clockTimer=null;}
    if(this.alarmTimer){clearInterval(this.alarmTimer);this.alarmTimer=null;}
  }
  go(t:string){
    this.tab=t;
    window.scrollTo({top:0,behavior:'smooth'});
    if(t==='noc'){this.loadNoc();return;}
    if(t==='dashboard'||t==='setup'||t==='monitoring')this.loadAll();
    if(t==='sites')this.loadSites();
    if(t==='vlans'){this.loadSites();this.loadVlans();this.loadAllVlans();}
    if(t==='agents'){this.loadAgents();this.loadSites();}
    if(t==='inventory'){this.loadSites();this.loadAgents();this.loadAllVlans();this.loadInventory();}
    if(t==='analysis')this.loadAnalytics();
    if(t==='ports')this.loadPorts();
    if(t==='wifi')this.loadWifi();
    if(t==='incidents')this.loadIncidents();
  }

  /**
   * Guía de puesta en marcha: cada paso se marca como listo a partir de los datos
   * que ya existen, para que se vea de un vistazo qué falta y en qué orden.
   */
  setupSteps(){
    const sedes=this.sites().length;
    const ags=this.agents();
    const enLinea=ags.filter((a:any)=>this.agentOnline(a)).length;
    const equipos=this.devices().length;
    const snmp=this.snmpDevices().length;
    return [
      {n:1,title:'Registrar las sedes',tab:'sites',cta:'Ir a Sedes',optional:false,done:sedes>0,
       text:'Cada edificio o red independiente es una sede. Todo lo demás se organiza a partir de ella.',
       detail:sedes?`${sedes} sede(s) registrada(s).`:'Todavía no hay ninguna sede registrada.'},
      {n:2,title:'Crear un Agente de Sitio por sede',tab:'agents',cta:'Ir a Agentes',optional:false,done:ags.length>0,
       text:'El agente es quien mide desde dentro de esa red. Al crearlo se genera un token que se muestra una sola vez.',
       detail:ags.length?`${ags.length} agente(s) creado(s).`:'Todavía no hay agentes. Cree uno por cada sede.'},
      {n:3,title:'Instalar el agente en el equipo de la sede',tab:'agents',cta:'Ver estado de agentes',optional:false,done:enLinea>0,
       text:'En el equipo de la sede: ejecute INSTALAR-AGENTE.bat, indique la URL de esta API y pegue el token. Después INICIAR-AGENTE.bat.',
       detail:enLinea?`${enLinea} de ${ags.length} agente(s) están reportando.`:'Ningún agente ha enviado heartbeat todavía.'},
      {n:4,title:'Registrar los equipos',tab:'inventory',cta:'Ir a Inventario',optional:false,done:equipos>0,
       text:'Para empezar a monitorear basta con sede, nombre, host y tipo de prueba. El resto de la ficha se completa después.',
       detail:equipos?`${equipos} equipo(s) registrado(s).`:'Todavía no hay equipos registrados.'},
      {n:5,title:'Activar el monitoreo SNMP',tab:'monitoring',cta:'Ir a Monitoreo SNMP',optional:true,done:snmp>0,
       text:'Sólo para switches y access points, si quiere ver puertos, errores CRC y métricas Wi-Fi además del sondeo básico.',
       detail:snmp?`${snmp} equipo(s) con lectura SNMP activa.`:'Ningún equipo tiene monitoreo SNMP activo (es opcional).'}
    ];
  }
  pendingSteps(){return this.setupSteps().filter(s=>!s.done&&!s.optional).length;}
  snmpDevices(){return this.devices().filter((d:any)=>Number(d.wifi_enabled)===1||Number(d.switch_enabled)===1);}

  /** Explica en el formulario qué campos usa el tipo de prueba elegido. */
  checkHelp(){
    switch(String(this.deviceForm?.check_type||'ping')){
      case 'tcp':   return 'TCP: comprueba que un servicio acepta conexiones. Indique el puerto.';
      case 'dns':   return 'DNS: el host es el servidor DNS a probar y la ruta es el nombre que debe resolver (por ejemplo www.microsoft.com).';
      case 'https': return 'HTTPS: el host es el sitio y la ruta el camino a consultar. Atención: se valida el certificado, así que los equipos con certificado autofirmado (switches, APs, UPS) darán error. Para esos use PING o TCP.';
      default:      return 'PING: envía varios paquetes ICMP y reporta latencia media y pérdida. Es lo adecuado para la mayoría de los equipos.';
    }
  }

  copyToken(){
    const t=this.agentTokenOnce(); if(!t) return;
    navigator.clipboard?.writeText(t).then(()=>this.pwdMsg.set(''),()=>{});
  }
  loadAll(){
    this.http.get<any>('api/dashboard/summary',this.headers()).subscribe(r=>{const critical=Number(r?.devices?.down||0)+Number(r?.devices?.critical||0);const po=Number(r?.probesOffline||0),wa=Number(r?.wifiOpenAlerts||0),pa=Number(r?.portOpenAlerts||0);if(critical>this.previousCritical)this.notify('Alarma de red',`Hay ${critical} equipo(s) sin comunicación o críticos.`);if(po>this.previousProbesOffline)this.notify('Agente sin comunicación',`${po} agente(s) sin heartbeat.`);if(wa>this.previousWifiAlerts)this.notify('Alerta Wi-Fi',`${wa} alerta(s) Wi-Fi.`);if(pa>this.previousPortAlerts)this.notify('Alerta de puerto',`${pa} problema(s) de puerto.`);this.previousCritical=critical;this.previousProbesOffline=po;this.previousWifiAlerts=wa;this.previousPortAlerts=pa;this.summary.set(r);});
    this.loadSites(); this.loadAgents(); this.loadAllVlans(); this.http.get<any[]>('api/devices',this.headers()).subscribe(r=>this.devices.set(r)); this.http.get<any[]>('api/ports/problems',this.headers()).subscribe(r=>this.portProblems.set(r)); this.loadAnalytics();
  }
  loadSites(){this.http.get<any[]>('api/sites',this.headers()).subscribe(r=>this.sites.set(r));}
  loadAgents(){this.http.get<any[]>('api/agents',this.headers()).subscribe(r=>this.agents.set(r));}
  loadWifi(){this.http.get<any>('api/wifi/summary',this.headers()).subscribe(r=>this.wifi.set(r));}
  loadIncidents(){this.http.get<any[]>('api/incidents',this.headers()).subscribe(r=>this.incidents.set(r));}
  loadAnalytics(){this.http.get<any>('api/analytics/sites?days='+this.analyticsDays,this.headers()).subscribe(r=>this.analytics.set(r));}
  loadPorts(refreshDetail=true){this.http.get<any>('api/switches/summary',this.headers()).subscribe(r=>this.switchSummary.set(r));this.http.get<any[]>('api/ports/problems',this.headers()).subscribe(r=>this.portProblems.set(r));this.http.get<any[]>('api/devices',this.headers()).subscribe(r=>{this.devices.set(r);if(refreshDetail&&this.selectedSwitchId)this.loadSwitchDetail();});}
  loadInventory(){let p=new HttpParams();for(const [k,v] of Object.entries(this.inventoryFilters)){if(v!==''&&v!==null&&v!==undefined)p=p.set(k,String(v));}this.http.get<any[]>('api/devices',{...this.headers(),params:p}).subscribe(r=>this.inventoryDevices.set(r));}

  // ===================== Catálogo de VLANs =====================
  vlans=signal<any[]>([]); vlanForm:any=this.blankVlan(); editingVlanId:number|null=null; vlanSiteFilter:any='';
  blankVlan(){return {site_id:null,vlan_id:null,name:'',purpose:'datos',subnet_cidr:'',gateway:'',dhcp_range:'',description:'',active:true};}
  loadVlans(){const q=this.vlanSiteFilter?('?site_id='+this.vlanSiteFilter):'';this.http.get<any[]>('api/vlans'+q,this.headers()).subscribe(r=>this.vlans.set(r));}
  /** Catálogo completo en memoria para poder ofrecer las VLANs de cualquier sede en los formularios. */
  allVlans=signal<any[]>([]);
  loadAllVlans(){this.http.get<any[]>('api/vlans',this.headers()).subscribe(r=>this.allVlans.set(r));}
  vlansForSite(siteId:any){ if(!siteId) return []; return this.allVlans().filter((v:any)=>Number(v.site_id)===Number(siteId)&&Number(v.active)===1); }
  vlanSummary(siteId:any){ return this.vlansForSite(siteId).map((v:any)=>`${v.vlan_id} ${v.name}`).join(' · '); }
  purposeLabel(p:string){ const m:any={datos:'Datos / usuarios',voz:'Voz (telefonía IP)',gestion:'Gestión de red',camaras:'Cámaras',impresion:'Impresión',servidores:'Servidores',control:'Control de acceso',invitados:'Invitados',otro:'Otro'}; return m[String(p||'')]||'Sin especificar'; }
  newVlan(){this.editingVlanId=null;this.vlanForm=this.blankVlan();}
  editVlan(v:any){this.editingVlanId=v.id;this.vlanForm={...this.blankVlan(),...v,site_id:Number(v.site_id),vlan_id:Number(v.vlan_id),active:!!v.active};window.scrollTo({top:0,behavior:'smooth'});}
  saveVlan(){
    this.opError.set('');
    const payload=this.clean(this.vlanForm);
    if(this.editingVlanId){
      delete payload.site_id;
      this.http.patch('api/vlans/'+this.editingVlanId,payload,this.headers()).subscribe({next:()=>{this.newVlan();this.loadVlans();this.loadAllVlans();},error:e=>this.apiFail(e)});
    }else{
      const site=this.vlanForm.site_id;
      if(!site){this.opError.set('Seleccione la sede a la que pertenece la VLAN.');return;}
      delete payload.site_id;
      this.http.post('api/sites/'+site+'/vlans',payload,this.headers()).subscribe({next:()=>{this.newVlan();this.loadVlans();this.loadAllVlans();},error:e=>this.apiFail(e)});
    }
  }
  removeVlan(v:any){
    if(!confirm(`¿Eliminar la VLAN ${v.vlan_id} (${v.name}) del catálogo de ${v.site_name}?`)) return;
    this.opError.set('');
    this.http.delete('api/vlans/'+v.id,this.headers()).subscribe({next:()=>{if(this.editingVlanId===v.id)this.newVlan();this.loadVlans();this.loadAllVlans();},error:e=>this.apiFail(e)});
  }

  newSite(){this.editingSiteId=null;this.siteForm=this.blankSite();}
  editSite(s:any){this.editingSiteId=s.id;this.siteForm={...this.blankSite(),...s,active:!!s.active};window.scrollTo({top:0,behavior:'smooth'});}
  saveSite(){this.opError.set('');const req=this.editingSiteId?this.http.patch('api/sites/'+this.editingSiteId,this.clean(this.siteForm),this.headers()):this.http.post('api/sites',this.clean(this.siteForm),this.headers());req.subscribe({next:()=>{this.newSite();this.loadSites();this.loadAnalytics();},error:e=>this.apiFail(e)});}
  removeSite(s:any){
    if(!confirm(`¿Dar de baja la sede "${s.name}"?\n\nSólo es posible si ya no tiene equipos ni Agentes de Sitio asignados.`)) return;
    this.opError.set('');
    this.http.delete('api/sites/'+s.id,this.headers()).subscribe({next:()=>{if(this.editingSiteId===s.id)this.newSite();this.loadSites();this.loadAnalytics();},error:e=>this.apiFail(e)});
  }
  siteAddress(s:any){return [s.street,s.exterior_number?`No. ${s.exterior_number}`:'',s.interior_number?`Int. ${s.interior_number}`:'',s.neighborhood,s.postal_code].filter(Boolean).join(', ')||'-';}

  newDevice(){this.editingDeviceId=null;this.deviceForm=this.blankDevice();this.showDeviceForm=true;window.scrollTo({top:0,behavior:'smooth'});}
  closeDeviceForm(){this.showDeviceForm=false;this.editingDeviceId=null;this.deviceForm=this.blankDevice();}
  editDevice(d:any){this.editingDeviceId=d.id;this.deviceForm={...this.blankDevice(),...d,site_id:Number(d.site_id),probe_id:d.probe_id?Number(d.probe_id):null,enabled:!!d.enabled,wifi_enabled:!!d.wifi_enabled,acquisition_date:this.dateOnly(d.acquisition_date),warranty_end:this.dateOnly(d.warranty_end)};this.showDeviceForm=true;window.scrollTo({top:0,behavior:'smooth'});}
  saveDevice(){this.opError.set('');const payload=this.clean(this.deviceForm);const req=this.editingDeviceId?this.http.patch('api/devices/'+this.editingDeviceId,payload,this.headers()):this.http.post('api/devices',payload,this.headers());req.subscribe({next:()=>{this.closeDeviceForm();this.loadAll();this.loadInventory();},error:e=>this.apiFail(e)});}
  removeDevice(id:number){if(confirm('¿Eliminar este dispositivo y todo su histórico? Para una baja normal es preferible editar Estado = Baja.'))this.http.delete('api/devices/'+id,this.headers()).subscribe(()=>{this.loadAll();this.loadInventory();});}
  clearInventoryFilters(){this.inventoryFilters={site_id:'',device_type:'',manufacturer:'',lifecycle_status:'',criticality:'',status:'',text:''};this.loadInventory();}
  deviceTypes(){return [...new Set(this.devices().map(d=>d.device_type).filter(Boolean))].sort();}
  deviceLocation(d:any){return [d.building,d.floor?`Piso ${d.floor}`:'',d.area,d.room,d.rack_name].filter(Boolean).join(' · ')||'ubicación no documentada';}
  agentsForSite(siteId:any){return this.agents().filter((a:any)=>!a.site_id||!siteId||Number(a.site_id)===Number(siteId));}
  devicesForSite(siteId:any){return this.devices().filter((d:any)=>Number(d.site_id)===Number(siteId)&&Number(d.id)!==Number(this.editingDeviceId));}
  onDeviceSiteChange(siteId:any){const a=this.agents().find((x:any)=>Number(x.id)===Number(this.deviceForm.probe_id));if(a?.site_id&&Number(a.site_id)!==Number(siteId))this.deviceForm.probe_id=null;const p=this.devices().find((x:any)=>Number(x.id)===Number(this.deviceForm.parent_id));if(p&&Number(p.site_id)!==Number(siteId))this.deviceForm.parent_id=null;}
  apiFail(e:any){const m=e?.error?.message;this.opError.set(Array.isArray(m)?m.join(' · '):(m?.toString()||'No se pudo completar la operación.'));window.scrollTo({top:0,behavior:'smooth'});}

  manageInterfaces(d:any){this.interfaceDevice=d;this.newInterface();this.loadInterfaces();setTimeout(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}),50);}
  closeInterfaces(){this.interfaceDevice=null;this.interfaces.set([]);this.newInterface();}
  loadInterfaces(){if(!this.interfaceDevice)return;this.http.get<any[]>('api/devices/'+this.interfaceDevice.id+'/interfaces',this.headers()).subscribe(r=>this.interfaces.set(r));}
  newInterface(){this.editingInterfaceId=null;this.ifaceForm=this.blankInterface();}
  editInterface(i:any){this.editingInterfaceId=i.id;this.ifaceForm={...this.blankInterface(),...i,primary_interface:!!i.primary_interface,switch_device_id:i.switch_device_id?Number(i.switch_device_id):null};}
  saveInterface(){if(!this.interfaceDevice)return;this.opError.set('');const payload=this.clean(this.ifaceForm);const req=this.editingInterfaceId?this.http.patch('api/interfaces/'+this.editingInterfaceId,payload,this.headers()):this.http.post('api/devices/'+this.interfaceDevice.id+'/interfaces',payload,this.headers());req.subscribe({next:()=>{this.newInterface();this.loadInterfaces();this.loadInventory();},error:e=>this.apiFail(e)});}
  removeInterface(id:number){if(confirm('¿Eliminar esta interfaz documentada?'))this.http.delete('api/interfaces/'+id,this.headers()).subscribe(()=>{this.loadInterfaces();this.loadInventory();});}

  newAgent(){this.editingAgentId=null;this.agentForm=this.blankAgent();}
  editAgent(a:any){this.editingAgentId=a.id;this.agentForm={name:a.name||'',agent_code:a.agent_code||'',site_id:a.site_id?Number(a.site_id):null,description:a.description||'',enabled:!!a.enabled};window.scrollTo({top:0,behavior:'smooth'});}
  saveAgent(){
    this.opError.set('');
    const payload=this.clean(this.agentForm);
    if(this.editingAgentId){
      this.http.patch('api/agents/'+this.editingAgentId,payload,this.headers()).subscribe({next:()=>{this.newAgent();this.loadAgents();this.loadAll();},error:e=>this.apiFail(e)});
    }else{
      delete payload.enabled;
      this.http.post<any>('api/agents',payload,this.headers()).subscribe({next:r=>{this.agentTokenOnce.set(r.agent_token||'');this.newAgent();this.loadAgents();this.loadAll();},error:e=>this.apiFail(e)});
    }
  }
  rotateAgentToken(a:any){
    if(!confirm(`¿Generar un token nuevo para "${a.name}"?\n\nEl token actual dejará de funcionar de inmediato: tendrá que actualizar agent.env en el sitio y reiniciar el agente.`)) return;
    this.opError.set('');
    this.http.post<any>('api/agents/'+a.id+'/token',{},this.headers()).subscribe({next:r=>{this.agentTokenOnce.set(r.agent_token||'');this.loadAgents();window.scrollTo({top:0,behavior:'smooth'});},error:e=>this.apiFail(e)});
  }
  removeAgent(a:any){
    if(!confirm(`¿Eliminar el Agente de Sitio "${a.name}"?\n\nSu token queda revocado. Los equipos que tuviera asignados NO se borran: quedan sin agente explícito y deberá reasignarlos.`)) return;
    this.opError.set('');
    this.http.delete<any>('api/agents/'+a.id,this.headers()).subscribe({next:r=>{if(this.editingAgentId===a.id)this.newAgent();if(r?.released_devices)alert(`${r.released_devices} equipo(s) quedaron sin Agente de Sitio asignado. Revíselos en Inventario.`);this.loadAgents();this.loadAll();},error:e=>this.apiFail(e)});
  }
  assignAgentSite(a:any,siteId:any){this.opError.set('');this.http.patch('api/agents/'+a.id,{site_id:siteId},this.headers()).subscribe({next:()=>{this.loadAgents();this.loadAll();},error:e=>{this.apiFail(e);this.loadAgents();}});}
  agentOnline(a:any){return !!a.enabled&&a.last_seen&&Number(a.age_sec)<=Number(this.summary()?.probeStaleSec||90);}

  filteredAnalytics(){const text=this.analysisText.toLowerCase().trim();return (this.analytics()?.ranking||[]).filter((s:any)=>(!this.analysisCriticality||s.criticality===this.analysisCriticality)&&(!this.analysisMunicipality||s.municipality===this.analysisMunicipality)&&(!text||String(s.name+' '+(s.code||'')).toLowerCase().includes(text)));}
  municipalities(){return [...new Set((this.analytics()?.sites||[]).map((s:any)=>s.municipality).filter(Boolean))].sort();}
  analyticsTotal(k:string){return this.filteredAnalytics().reduce((n:number,x:any)=>n+Number(x[k]||0),0);}

  // Coincidencia exacta: con includes('ap') un equipo tipo "laptop" aparecía como access point.
  isApType(t:any){return ['ap','access-point','access_point','accesspoint','wifi','wireless'].includes(String(t||'').toLowerCase().trim());}
  apDevices(){return this.devices().filter(d=>this.isApType(d.device_type)||Number(d.wifi_enabled)===1);}
  switchDevices(){return this.devices().filter(d=>String(d.device_type||'').toLowerCase().includes('switch')||d.switch_enabled);}
  selectWifiDevice(){const d=this.devices().find(x=>x.id===this.wifiEdit.device_id);if(!d)return;this.wifiEdit={device_id:d.id,wifi_enabled:!!d.wifi_enabled,snmp_profile:d.snmp_profile||'SIMULADOR-WIFI',wifi_poll_interval_sec:d.wifi_poll_interval_sec||120,wifi_max_clients:d.wifi_max_clients||40,wifi_warn_utilization:Number(d.wifi_warn_utilization??70),wifi_critical_utilization:Number(d.wifi_critical_utilization??85),wifi_warn_noise_dbm:Number(d.wifi_warn_noise_dbm??-75)};}
  saveWifiConfig(){const id=this.wifiEdit.device_id;if(!id)return;this.opError.set('');this.http.patch('api/wifi/config/'+id,this.wifiEdit,this.headers()).subscribe({next:()=>{this.loadAll();this.loadWifi();},error:e=>this.apiFail(e)});}
  removeWifiConfig(){
    const id=this.wifiEdit.device_id;if(!id)return;
    if(!confirm('¿Quitar el monitoreo Wi-Fi de este AP?\n\nSe cierran sus alertas abiertas. El histórico de métricas se conserva.')) return;
    this.opError.set('');
    this.http.delete('api/wifi/config/'+id,this.headers()).subscribe({next:()=>{this.wifiEdit=this.blankWifiEdit();this.loadAll();this.loadWifi();},error:e=>this.apiFail(e)});
  }
  selectSwitchConfig(){const d=this.devices().find(x=>x.id===this.switchEdit.device_id);if(!d)return;this.http.get<any>('api/switches/'+d.id+'/config',this.headers()).subscribe(c=>this.switchEdit={...this.blankSwitchEdit(),device_id:d.id,switch_enabled:c?!!c.enabled:true,switch_snmp_profile:c?.snmp_profile||'SIMULADOR-SWITCH',switch_poll_interval_sec:c?.poll_interval_sec||300,crc_warn_delta:c?.crc_warn_delta||1,uplink_utilization_pct:Number(c?.uplink_utilization_pct||80),uplink_hold_minutes:c?.uplink_hold_minutes||10,storm_min_ports:c?.storm_min_ports||3,storm_discard_delta:c?.storm_discard_delta||20});}
  saveSwitchConfig(){const id=this.switchEdit.device_id;if(!id)return;this.opError.set('');this.http.patch('api/switches/'+id+'/config',this.switchEdit,this.headers()).subscribe({next:()=>{this.loadAll();this.loadPorts();},error:e=>this.apiFail(e)});}
  removeSwitchConfig(){
    const id=this.switchEdit.device_id;if(!id)return;
    if(!confirm('¿Quitar el monitoreo SNMP de puertos de este switch?\n\nSe cierran sus alertas de puerto abiertas. El histórico se conserva.')) return;
    this.opError.set('');
    this.http.delete('api/switches/'+id+'/config',this.headers()).subscribe({next:()=>{this.switchEdit=this.blankSwitchEdit();this.loadAll();this.loadPorts();},error:e=>this.apiFail(e)});
  }
  openSwitch(id:number,ifIndex?:number){this.tab='ports';this.selectedSwitchId=id;this.loadSwitchDetail(()=>{if(ifIndex){const p=this.switchDetail()?.ports?.find((x:any)=>Number(x.if_index)===Number(ifIndex));if(p)this.selectPort(p);}});}
  loadSwitchDetail(after?:()=>void){if(!this.selectedSwitchId){this.switchDetail.set(null);this.selectedPort=null;return;}this.http.get<any>('api/switches/'+this.selectedSwitchId+'/ports',this.headers()).subscribe(r=>{this.switchDetail.set(r);if(this.selectedPort){const p=r.ports.find((x:any)=>x.if_index===this.selectedPort.if_index);if(p)this.selectedPort=p;}if(after)after();});}
  selectPort(p:any){this.selectedPort=p;this.portEdit={custom_name:p.custom_name||'',critical:!!p.critical,is_uplink:!!p.is_uplink,expected_speed_mbps:p.expected_speed_mbps||p.max_speed_seen_mbps||null};this.http.get<any>(`api/switches/${this.selectedSwitchId}/ports/${p.if_index}/history`,this.headers()).subscribe(r=>this.portHistory.set(r));}
  savePortConfig(){if(!this.selectedSwitchId||!this.selectedPort)return;this.opError.set('');this.http.patch(`api/switches/${this.selectedSwitchId}/ports/${this.selectedPort.if_index}`,this.portEdit,this.headers()).subscribe({next:()=>this.loadSwitchDetail(),error:e=>this.apiFail(e)});}
  resetPortConfig(){
    if(!this.selectedSwitchId||!this.selectedPort)return;
    if(!confirm('¿Restablecer la configuración de este puerto?\n\nSe borran el nombre funcional, la velocidad esperada y las marcas de crítico/uplink.')) return;
    this.opError.set('');
    this.http.delete(`api/switches/${this.selectedSwitchId}/ports/${this.selectedPort.if_index}`,this.headers()).subscribe({next:()=>{this.portEdit={custom_name:'',critical:false,is_uplink:false,expected_speed_mbps:null};this.loadSwitchDetail();},error:e=>this.apiFail(e)});
  }
  portClass(p:any){if(p.problem_severity==='critical')return'critical';if(p.problem_severity==='warning')return'warning';return String(p.oper_status).toLowerCase()==='up'?'up':'down';}
  chartPoints(key:string){const a=this.portHistory()?.metrics||[];if(a.length<2)return'';const vals=a.map((x:any)=>Number(x[key]||0));const max=Math.max(1,...vals);return vals.map((v:number,i:number)=>`${10+(600*i/(vals.length-1))},${170-(150*v/max)}`).join(' ');}

  statusLabel(s:any){return String(s||'unknown')==='unknown'?'sin datos':String(s);}
  changePassword(){this.pwdMsg.set('');this.http.post('api/auth/change-password',this.pwd,this.headers()).subscribe({next:()=>{this.pwd={current_password:'',new_password:''};this.pwdMsg.set('Contraseña actualizada.');},error:(e)=>this.pwdMsg.set(e?.error?.message?.toString()||'No se pudo cambiar la contraseña.')});}
  enableNotifications(){if('Notification' in window)Notification.requestPermission();}
  notify(title:string,body:string){if('Notification' in window&&Notification.permission==='granted')new Notification(title,{body});}
  dateOnly(v:any){if(!v)return null;return String(v).slice(0,10);}
  clean(obj:any){const out:any={};for(const [k,v] of Object.entries(obj)){out[k]=v===''?null:v;}return out;}
}
const authExpiredInterceptor:HttpInterceptorFn=(req,next)=>next(req).pipe(catchError(err=>{if(err?.status===401&&!req.url.includes('/auth/login')){localStorage.removeItem('token');location.reload();}return throwError(()=>err);}));
bootstrapApplication(AppComponent,{providers:[provideHttpClient(withInterceptors([authExpiredInterceptor]))]}).catch(console.error);
