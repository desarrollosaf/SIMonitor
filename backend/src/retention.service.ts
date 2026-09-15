import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from './database.service';

/**
 * Purga periódica para evitar crecimiento sin control.
 * RETENTION_DAYS (30 por defecto): resultados, Wi-Fi, métricas de puertos e incidentes/alertas resueltos.
 * HEARTBEAT_RETENTION_HOURS (48 por defecto): heartbeats detallados; la tabla probes conserva sólo el último estado.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private db: DatabaseService) {}

  onModuleInit() {
    const everyMs = Math.max(5, Number(process.env.RETENTION_EVERY_MIN || 60)) * 60 * 1000;
    this.timer = setInterval(() => this.run().catch(e => console.error('Retención:', e.message)), everyMs);
    setTimeout(() => this.run().catch(e => console.error('Retención:', e.message)), 30_000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /**
   * Borra en lotes para no bloquear tablas grandes: un DELETE sin LIMIT sobre
   * switch_port_metrics con 30 días de histórico puede retener la tabla varios minutos.
   */
  private async purge(table: string, where: string) {
    let total = 0;
    for (let i = 0; i < 400; i++) {
      const r: any = await this.db.query(`DELETE FROM ${table} WHERE ${where} LIMIT 5000`);
      const n = Number(r?.affectedRows || 0);
      total += n;
      if (n < 5000) break;
      await new Promise(res => setTimeout(res, 50)); // cede el paso a las escrituras de los agentes
    }
    return total;
  }

  async run() {
    const days = Math.max(1, Number(process.env.RETENTION_DAYS || 30));
    const hbHours = Math.max(1, Number(process.env.HEARTBEAT_RETENTION_HOURS || 48));
    const auditDays = Math.max(days, Number(process.env.AUDIT_RETENTION_DAYS || 365));
    const old = `DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${days} DAY)`;
    await this.purge('check_results', `checked_at < ${old}`);
    await this.purge('wifi_ap_metrics', `checked_at < ${old}`);
    await this.purge('wifi_radio_metrics', `checked_at < ${old}`);
    await this.purge('wifi_ssid_metrics', `checked_at < ${old}`);
    await this.purge('switch_port_metrics', `checked_at < ${old}`);
    await this.purge('incidents', `status='resolved' AND resolved_at < ${old}`);
    await this.purge('wifi_alerts', `status='resolved' AND resolved_at < ${old}`);
    await this.purge('port_alerts', `status='resolved' AND resolved_at < ${old}`);
    await this.purge('probe_heartbeats', `created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${hbHours} HOUR)`);
    // La auditoría del inventario se conserva mucho más tiempo, pero tampoco crece sin límite.
    await this.purge('inventory_audit', `created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${auditDays} DAY)`);
  }
}
