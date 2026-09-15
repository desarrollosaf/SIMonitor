import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import mysql, { Pool } from 'mysql2/promise';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  async onModuleInit() {
    const cfg = {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    };
    const dbName = process.env.DB_NAME || 'monitor_red';
    try {
      const admin = await mysql.createConnection(cfg);
      await admin.query(`CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
      await admin.end();
    } catch (e: any) {
      console.error('\n============================================================');
      console.error('ERROR: no se pudo conectar a MySQL.');
      console.error(`  Servidor: ${cfg.host}:${cfg.port}   Usuario: ${cfg.user}`);
      console.error(`  Detalle : ${e.code || ''} ${e.message}`);
      console.error('Revise DB_USER / DB_PASSWORD en config.env y que el servicio MySQL esté iniciado.');
      console.error('============================================================\n');
      throw e;
    }
    this.pool = mysql.createPool({ ...cfg, database: dbName, waitForConnections: true, connectionLimit: 10, timezone: 'Z' });
    await this.pool.query('SELECT 1');
    await this.ensureSchema();
    console.log(`Base de datos '${dbName}' lista en ${cfg.host}:${cfg.port}. Esquema V0.4.1 verificado/actualizado.`);
  }

  async onModuleDestroy() { if (this.pool) await this.pool.end(); }

  async query<T = any>(sql: string, params: any[] = []): Promise<T> {
    const [rows] = await this.pool.execute(sql, params);
    return rows as T;
  }

  private async ensureColumn(table: string, column: string, definition: string) {
    const rows = await this.query<any[]>(`SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`, [table, column]);
    if (!Number(rows[0]?.n || 0)) {
      await this.pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`Migración: ${table}.${column} agregado.`);
    }
  }

  private async ensureIndex(table: string, index: string, definition: string) {
    const rows = await this.query<any[]>(`SELECT COUNT(*) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?`, [table, index]);
    if (!Number(rows[0]?.n || 0)) await this.pool.query(`ALTER TABLE \`${table}\` ADD ${definition}`);
  }

  /**
   * Igual que ensureIndex pero tolerante: si ya existen duplicados en la instalación,
   * avisa por consola en lugar de impedir el arranque del servidor.
   */
  private async ensureUniqueIndex(table: string, index: string, column: string) {
    const rows = await this.query<any[]>(`SELECT COUNT(*) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?`, [table, index]);
    if (Number(rows[0]?.n || 0)) return;
    try {
      await this.pool.query(`ALTER TABLE \`${table}\` ADD UNIQUE INDEX \`${index}\`(\`${column}\`)`);
      console.log(`Migración: índice único ${index} creado en ${table}.${column}.`);
    } catch (e: any) {
      console.warn(`AVISO: no se pudo crear el índice único ${table}.${column}: ${e.code || e.message}`);
      console.warn(`       Hay valores duplicados. Depúrelos y reinicie para activar la protección contra duplicados.`);
    }
  }

  private async ensureSchema() {
    const statements = [
      `CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(80) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(30) NOT NULL DEFAULT 'admin',
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS sites (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        description VARCHAR(500) NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS probes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        token_hash CHAR(64) NOT NULL UNIQUE,
        site_id INT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        version VARCHAR(30) NULL,
        hostname VARCHAR(150) NULL,
        ip_address VARCHAR(80) NULL,
        last_seen DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_probes_site(site_id),
        CONSTRAINT fk_probes_site FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE SET NULL
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS devices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        site_id INT NOT NULL,
        parent_id INT NULL,
        name VARCHAR(150) NOT NULL,
        host VARCHAR(255) NOT NULL,
        device_type VARCHAR(50) NOT NULL DEFAULT 'generic',
        check_type VARCHAR(20) NOT NULL DEFAULT 'ping',
        check_port INT NULL,
        check_path VARCHAR(255) NULL,
        interval_sec INT NOT NULL DEFAULT 60,
        warning_ms INT NOT NULL DEFAULT 80,
        critical_ms INT NOT NULL DEFAULT 150,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        last_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
        last_latency_ms DECIMAL(10,2) NULL,
        last_checked_at DATETIME NULL,
        CONSTRAINT fk_devices_site FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE,
        CONSTRAINT fk_devices_parent FOREIGN KEY(parent_id) REFERENCES devices(id) ON DELETE SET NULL
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS check_results (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        device_id INT NOT NULL,
        status VARCHAR(20) NOT NULL,
        latency_ms DECIMAL(10,2) NULL,
        packet_loss DECIMAL(6,2) NULL,
        message VARCHAR(1000) NULL,
        checked_at DATETIME NOT NULL,
        INDEX idx_results_device_time(device_id, checked_at),
        CONSTRAINT fk_results_device FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS incidents (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        device_id INT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        severity VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        diagnosis VARCHAR(1500) NULL,
        started_at DATETIME NOT NULL,
        resolved_at DATETIME NULL,
        last_event_at DATETIME NOT NULL,
        CONSTRAINT fk_incidents_device FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE,
        INDEX idx_incidents_status(status, started_at)
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS probe_heartbeats (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        probe_name VARCHAR(120) NOT NULL,
        version VARCHAR(30) NULL,
        hostname VARCHAR(150) NULL,
        ip_address VARCHAR(80) NULL,
        created_at DATETIME NOT NULL,
        INDEX idx_probe_time(probe_name, created_at)
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS wifi_ap_config (
        device_id INT PRIMARY KEY,
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        snmp_profile VARCHAR(100) NULL,
        poll_interval_sec INT NOT NULL DEFAULT 120,
        max_clients INT NOT NULL DEFAULT 40,
        warn_utilization_pct DECIMAL(5,2) NOT NULL DEFAULT 70,
        critical_utilization_pct DECIMAL(5,2) NOT NULL DEFAULT 85,
        warn_noise_dbm DECIMAL(6,2) NOT NULL DEFAULT -75,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_wifi_config_device FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS wifi_ap_metrics (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        device_id INT NOT NULL,
        collector_status VARCHAR(20) NOT NULL DEFAULT 'ok',
        message VARCHAR(1000) NULL,
        client_count INT NULL,
        uptime_sec BIGINT NULL,
        poe_watts DECIMAL(10,2) NULL,
        uplink_mbps DECIMAL(12,2) NULL,
        cpu_pct DECIMAL(6,2) NULL,
        memory_pct DECIMAL(6,2) NULL,
        checked_at DATETIME NOT NULL,
        INDEX idx_wifi_ap_time(device_id, checked_at),
        CONSTRAINT fk_wifi_ap_metric_device FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS wifi_radio_metrics (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        device_id INT NOT NULL,
        radio_name VARCHAR(100) NOT NULL,
        band VARCHAR(30) NULL,
        status VARCHAR(20) NULL,
        channel_no INT NULL,
        channel_width_mhz INT NULL,
        client_count INT NULL,
        utilization_pct DECIMAL(6,2) NULL,
        noise_dbm DECIMAL(7,2) NULL,
        tx_power_dbm DECIMAL(7,2) NULL,
        checked_at DATETIME NOT NULL,
        INDEX idx_wifi_radio_time(device_id, radio_name, checked_at),
        CONSTRAINT fk_wifi_radio_device FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS wifi_ssid_metrics (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        device_id INT NOT NULL,
        ssid VARCHAR(128) NOT NULL,
        band VARCHAR(30) NULL,
        status VARCHAR(20) NULL,
        client_count INT NULL,
        checked_at DATETIME NOT NULL,
        INDEX idx_wifi_ssid_time(device_id, ssid, checked_at),
        CONSTRAINT fk_wifi_ssid_device FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS wifi_alerts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        device_id INT NOT NULL,
        alert_key VARCHAR(180) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        severity VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        diagnosis VARCHAR(1500) NULL,
        started_at DATETIME NOT NULL,
        resolved_at DATETIME NULL,
        last_event_at DATETIME NOT NULL,
        INDEX idx_wifi_alert_open(device_id, status, alert_key),
        INDEX idx_wifi_alert_time(status, started_at),
        CONSTRAINT fk_wifi_alert_device FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS switch_monitor_config (
        device_id INT PRIMARY KEY,
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        snmp_profile VARCHAR(100) NULL,
        poll_interval_sec INT NOT NULL DEFAULT 300,
        crc_warn_delta INT NOT NULL DEFAULT 1,
        uplink_utilization_pct DECIMAL(5,2) NOT NULL DEFAULT 80,
        uplink_hold_minutes INT NOT NULL DEFAULT 10,
        storm_min_ports INT NOT NULL DEFAULT 3,
        storm_discard_delta INT NOT NULL DEFAULT 20,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_switch_config_device FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS switch_port_config (
        device_id INT NOT NULL,
        if_index INT NOT NULL,
        custom_name VARCHAR(180) NULL,
        critical TINYINT(1) NOT NULL DEFAULT 0,
        is_uplink TINYINT(1) NOT NULL DEFAULT 0,
        expected_speed_mbps INT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY(device_id, if_index),
        CONSTRAINT fk_port_config_device FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS switch_port_state (
        device_id INT NOT NULL,
        if_index INT NOT NULL,
        if_name VARCHAR(150) NULL,
        if_descr VARCHAR(255) NULL,
        if_alias VARCHAR(255) NULL,
        admin_status VARCHAR(20) NULL,
        oper_status VARCHAR(20) NULL,
        speed_mbps INT NULL,
        max_speed_seen_mbps INT NULL,
        duplex VARCHAR(20) NULL,
        lldp_neighbor VARCHAR(255) NULL,
        lldp_port VARCHAR(255) NULL,
        last_rx_bytes DECIMAL(20,0) NULL,
        last_tx_bytes DECIMAL(20,0) NULL,
        last_crc_errors DECIMAL(20,0) NULL,
        last_late_collisions DECIMAL(20,0) NULL,
        last_in_discards DECIMAL(20,0) NULL,
        last_out_discards DECIMAL(20,0) NULL,
        high_util_since DATETIME NULL,
        last_checked_at DATETIME NOT NULL,
        last_up_at DATETIME NULL,
        PRIMARY KEY(device_id, if_index),
        INDEX idx_port_state_status(device_id, oper_status),
        CONSTRAINT fk_port_state_device FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS switch_port_metrics (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        device_id INT NOT NULL,
        if_index INT NOT NULL,
        speed_mbps INT NULL,
        duplex VARCHAR(20) NULL,
        rx_mbps DECIMAL(14,3) NULL,
        tx_mbps DECIMAL(14,3) NULL,
        utilization_pct DECIMAL(6,2) NULL,
        rx_bytes DECIMAL(20,0) NULL,
        tx_bytes DECIMAL(20,0) NULL,
        crc_errors_total DECIMAL(20,0) NULL,
        crc_errors_delta BIGINT NULL,
        late_collisions_total DECIMAL(20,0) NULL,
        late_collisions_delta BIGINT NULL,
        in_discards_total DECIMAL(20,0) NULL,
        out_discards_total DECIMAL(20,0) NULL,
        discards_delta BIGINT NULL,
        checked_at DATETIME NOT NULL,
        INDEX idx_port_metric_time(device_id, if_index, checked_at),
        INDEX idx_port_metric_device_time(device_id, checked_at),
        INDEX idx_port_metric_retention(checked_at),
        CONSTRAINT fk_port_metric_device FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS port_alerts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        device_id INT NOT NULL,
        if_index INT NOT NULL DEFAULT 0,
        alert_key VARCHAR(200) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        severity VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        diagnosis VARCHAR(1500) NULL,
        started_at DATETIME NOT NULL,
        resolved_at DATETIME NULL,
        last_event_at DATETIME NOT NULL,
        INDEX idx_port_alert_open(device_id, if_index, status, alert_key),
        INDEX idx_port_alert_time(status, severity, started_at),
        CONSTRAINT fk_port_alert_device FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS device_interfaces (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        device_id INT NOT NULL,
        name VARCHAR(120) NOT NULL,
        mac_address VARCHAR(32) NULL,
        ipv4_address VARCHAR(80) NULL,
        ipv6_address VARCHAR(80) NULL,
        vlan_id INT NULL,
        speed_mbps INT NULL,
        interface_type VARCHAR(60) NULL,
        switch_device_id INT NULL,
        switch_if_index INT NULL,
        switch_port_name VARCHAR(100) NULL,
        wall_jack VARCHAR(100) NULL,
        patch_panel VARCHAR(100) NULL,
        patch_port VARCHAR(60) NULL,
        notes VARCHAR(1000) NULL,
        primary_interface TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_iface_device(device_id),
        INDEX idx_iface_mac(mac_address),
        INDEX idx_iface_ipv4(ipv4_address),
        INDEX idx_iface_switch(switch_device_id,switch_if_index),
        CONSTRAINT fk_iface_device FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE,
        CONSTRAINT fk_iface_switch FOREIGN KEY(switch_device_id) REFERENCES devices(id) ON DELETE SET NULL
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS inventory_audit (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        entity_type VARCHAR(40) NOT NULL,
        entity_id BIGINT NOT NULL,
        action VARCHAR(40) NOT NULL,
        username VARCHAR(80) NULL,
        summary VARCHAR(1000) NULL,
        before_json JSON NULL,
        after_json JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_inventory_audit_entity(entity_type,entity_id,created_at),
        INDEX idx_inventory_audit_time(created_at)
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS site_vlans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        site_id INT NOT NULL,
        vlan_id INT NOT NULL,
        name VARCHAR(120) NOT NULL,
        purpose VARCHAR(60) NULL,
        subnet_cidr VARCHAR(45) NULL,
        gateway VARCHAR(45) NULL,
        dhcp_range VARCHAR(90) NULL,
        description VARCHAR(500) NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_site_vlan(site_id, vlan_id),
        INDEX idx_site_vlan_purpose(purpose),
        CONSTRAINT fk_vlan_site FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(40) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`
    ];
    for (const s of statements) await this.pool.query(s);

    // Migraciones incrementales: preservan instalaciones V0.2.x existentes.
    await this.ensureColumn('devices', 'probe_id', 'INT NULL AFTER site_id');
    await this.ensureColumn('devices', 'consecutive_failures', 'INT NOT NULL DEFAULT 0');
    await this.ensureColumn('devices', 'consecutive_successes', 'INT NOT NULL DEFAULT 0');
    await this.ensureColumn('check_results', 'probe_id', 'INT NULL AFTER device_id');
    await this.ensureColumn('check_results', 'received_at', 'DATETIME NULL AFTER checked_at');
    await this.ensureColumn('probe_heartbeats', 'probe_id', 'INT NULL AFTER id');
    await this.ensureColumn('wifi_ap_metrics', 'probe_id', 'INT NULL AFTER device_id');

    // V0.4.1 - Sedes multisitio con dirección y datos operativos estructurados.
    for (const [column, definition] of [
      ['code','VARCHAR(40) NULL'],['official_name','VARCHAR(220) NULL'],['site_type','VARCHAR(80) NULL'],['country','VARCHAR(100) NULL'],
      ['state','VARCHAR(100) NULL'],['municipality','VARCHAR(120) NULL'],['locality','VARCHAR(120) NULL'],
      ['neighborhood','VARCHAR(150) NULL'],['postal_code','VARCHAR(15) NULL'],['street','VARCHAR(180) NULL'],
      ['exterior_number','VARCHAR(30) NULL'],['interior_number','VARCHAR(30) NULL'],['reference','VARCHAR(500) NULL'],
      ['latitude','DECIMAL(10,7) NULL'],['longitude','DECIMAL(10,7) NULL'],['phone','VARCHAR(80) NULL'],
      ['manager_name','VARCHAR(160) NULL'],['manager_phone','VARCHAR(80) NULL'],['manager_email','VARCHAR(160) NULL'],
      ['technical_contact','VARCHAR(160) NULL'],['technical_phone','VARCHAR(80) NULL'],['schedule','VARCHAR(120) NULL'],
      ['primary_isp','VARCHAR(150) NULL'],['primary_bandwidth_mbps','INT NULL'],['secondary_isp','VARCHAR(150) NULL'],
      ['secondary_bandwidth_mbps','INT NULL'],["criticality","VARCHAR(20) NOT NULL DEFAULT 'medium'"],['notes','VARCHAR(2000) NULL']
    ] as Array<[string,string]>) await this.ensureColumn('sites', column, definition);

    // V0.4.1 - El antiguo concepto de sonda pasa a ser Agente de Sitio, conservando la tabla para compatibilidad.
    for (const [column, definition] of [
      ['agent_code','VARCHAR(40) NULL'],['description','VARCHAR(500) NULL'],['platform','VARCHAR(80) NULL'],
      ['os_version','VARCHAR(160) NULL'],['architecture','VARCHAR(40) NULL'],['buffer_depth','INT NOT NULL DEFAULT 0'],
      ['last_sync_at','DATETIME NULL']
    ] as Array<[string,string]>) await this.ensureColumn('probes', column, definition);

    // V0.4.1 - Inventario técnico, patrimonial y ubicación física del equipo.
    for (const [column, definition] of [
      ['inventory_number','VARCHAR(80) NULL'],['asset_number','VARCHAR(80) NULL'],['hostname','VARCHAR(150) NULL'],
      ['fqdn','VARCHAR(150) NULL'],['description','VARCHAR(1000) NULL'],['category','VARCHAR(80) NULL'],
      ['subcategory','VARCHAR(80) NULL'],['manufacturer','VARCHAR(120) NULL'],['model','VARCHAR(160) NULL'],
      ['serial_number','VARCHAR(160) NULL'],['part_number','VARCHAR(160) NULL'],['service_tag','VARCHAR(160) NULL'],
      ['mac_address','VARCHAR(32) NULL'],['management_vlan','INT NULL'],['subnet_mask','VARCHAR(80) NULL'],
      ['gateway','VARCHAR(80) NULL'],['dns_servers','VARCHAR(255) NULL'],["addressing_method","VARCHAR(20) NOT NULL DEFAULT 'static'"],
      ['firmware','VARCHAR(160) NULL'],['operating_system','VARCHAR(160) NULL'],['os_version','VARCHAR(160) NULL'],
      ['building','VARCHAR(150) NULL'],['floor','VARCHAR(80) NULL'],['area','VARCHAR(180) NULL'],['room','VARCHAR(180) NULL'],
      ['rack_name','VARCHAR(100) NULL'],['rack_unit','INT NULL'],['physical_location','VARCHAR(180) NULL'],
      ['responsible_person','VARCHAR(180) NULL'],['administrative_unit','VARCHAR(180) NULL'],['supplier','VARCHAR(180) NULL'],
      ['acquisition_date','DATE NULL'],['warranty_end','DATE NULL'],['contract_reference','VARCHAR(180) NULL'],
      ["lifecycle_status","VARCHAR(30) NOT NULL DEFAULT 'active'"],["criticality","VARCHAR(20) NOT NULL DEFAULT 'medium'"],
      ['notes','VARCHAR(3000) NULL']
    ] as Array<[string,string]>) await this.ensureColumn('devices', column, definition);

    await this.ensureColumn('device_interfaces', 'switch_port_name', 'VARCHAR(100) NULL AFTER switch_if_index');

    await this.ensureIndex('sites', 'idx_sites_code', 'INDEX idx_sites_code(code)');
    await this.ensureIndex('sites', 'idx_sites_municipality', 'INDEX idx_sites_municipality(municipality)');
    await this.ensureIndex('devices', 'idx_devices_site_type', 'INDEX idx_devices_site_type(site_id,device_type)');
    await this.ensureIndex('devices', 'idx_devices_manufacturer_model', 'INDEX idx_devices_manufacturer_model(manufacturer,model)');
    await this.ensureIndex('devices', 'idx_devices_inventory', 'INDEX idx_devices_inventory(inventory_number)');
    await this.ensureIndex('devices', 'idx_devices_mac', 'INDEX idx_devices_mac(mac_address)');
    await this.ensureIndex('devices', 'idx_devices_lifecycle', 'INDEX idx_devices_lifecycle(lifecycle_status)');
    await this.ensureIndex('probes', 'idx_probes_agent_code', 'INDEX idx_probes_agent_code(agent_code)');

    // V0.4.1 - Unicidad real de los identificadores del inventario. Antes sólo se comprobaba
    // en la aplicación, lo que permitía duplicados con dos pestañas abiertas a la vez.
    await this.ensureUniqueIndex('sites', 'uk_sites_code', 'code');
    await this.ensureUniqueIndex('probes', 'uk_probes_agent_code', 'agent_code');
    await this.ensureUniqueIndex('devices', 'uk_devices_inventory_number', 'inventory_number');
    await this.ensureUniqueIndex('devices', 'uk_devices_serial_number', 'serial_number');

    await this.ensureIndex('devices', 'idx_devices_probe', 'INDEX idx_devices_probe(probe_id)');
    await this.ensureIndex('check_results', 'idx_results_probe_time', 'INDEX idx_results_probe_time(probe_id, checked_at)');
    await this.ensureIndex('check_results', 'idx_results_retention', 'INDEX idx_results_retention(checked_at)');
    await this.ensureIndex('switch_port_metrics', 'idx_port_metric_retention', 'INDEX idx_port_metric_retention(checked_at)');
    await this.query(`INSERT IGNORE INTO schema_migrations(version) VALUES('0.3.0'),('0.4.1'),('0.4.1')`);

    const username = process.env.ADMIN_USER || 'admin';
    const existing = await this.query<any[]>('SELECT id FROM users WHERE username=? LIMIT 1', [username]);
    if (!existing.length) {
      const initial = process.env.ADMIN_PASSWORD || '';
      if (initial.length < 10) {
        throw new Error('No existe un administrador y ADMIN_PASSWORD no está definida o tiene menos de 10 caracteres. Ejecute INSTALAR.bat o defina una clave inicial segura.');
      }
      const hash = await bcrypt.hash(initial, 12);
      await this.query('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)', [username, hash, 'admin']);
      console.log(`Usuario administrador inicial creado: ${username}`);
    }
  }
}
