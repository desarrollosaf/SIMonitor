import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { AuthService } from './auth.service';
import { DatabaseService } from './database.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private auth: AuthService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    req.user = await this.auth.verify(req.headers['authorization']);
    return true;
  }
}

@Injectable()
export class ProbeGuard implements CanActivate {
  constructor(private db: DatabaseService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = String(req.headers['x-agent-token'] || req.headers['x-probe-token'] || '');
    if (!token) throw new UnauthorizedException('Token de Agente de Sitio ausente');
    const hash = createHash('sha256').update(token).digest('hex');
    const registered = await this.db.query<any[]>('SELECT id FROM probes WHERE token_hash=? AND enabled=1 LIMIT 1',[hash]);
    // Compatibilidad V0.3: el token bootstrap del servidor puede registrar el primer agente.
    if (!registered.length && !bootstrapTokenValid(token)) throw new UnauthorizedException('Token de Agente de Sitio inválido o revocado');
    req.probeTokenHash = hash;
    return true;
  }
}

/** Compatibilidad de actualización: AGENT_BOOTSTRAP_TOKEN/PROBE_TOKEN pueden contener varios tokens separados por coma. */
export function bootstrapTokenValid(candidate: string): boolean {
  const raw = process.env.AGENT_BOOTSTRAP_TOKEN || process.env.PROBE_TOKEN || '';
  const tokens = String(raw).split(',').map(t => t.trim()).filter(Boolean);
  const c = Buffer.from(candidate);
  return tokens.some(t => {
    const b = Buffer.from(t);
    return b.length === c.length && timingSafeEqual(b, c);
  });
}
