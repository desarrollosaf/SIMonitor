import { Injectable, UnauthorizedException, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from './database.service';

const MAX_ATTEMPTS = 5;          // intentos fallidos permitidos
const WINDOW_MS = 15 * 60 * 1000; // por ventana de 15 minutos

@Injectable()
export class AuthService {
  private attempts = new Map<string, { count: number; first: number }>();
  constructor(private db: DatabaseService, private jwt: JwtService) {}

  /** Limitador simple en memoria contra fuerza bruta (por usuario + IP). */
  private checkRate(key: string) {
    const now = Date.now();
    const a = this.attempts.get(key);
    if (a && now - a.first > WINDOW_MS) this.attempts.delete(key);
    const cur = this.attempts.get(key);
    if (cur && cur.count >= MAX_ATTEMPTS) throw new HttpException('Demasiados intentos. Espere 15 minutos.', HttpStatus.TOO_MANY_REQUESTS);
  }
  private registerFailure(key: string) {
    const a = this.attempts.get(key);
    if (!a) this.attempts.set(key, { count: 1, first: Date.now() }); else a.count++;
  }

  async login(username: string, password: string, ip = '') {
    const key = `${username}@${ip}`;
    this.checkRate(key);
    const rows = await this.db.query<any[]>('SELECT * FROM users WHERE username=? AND active=1 LIMIT 1', [username]);
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
      this.registerFailure(key);
      throw new UnauthorizedException('Credenciales incorrectas');
    }
    this.attempts.delete(key);
    return { access_token: await this.jwt.signAsync({ sub: rows[0].id, username, role: rows[0].role }), user: { username, role: rows[0].role } };
  }

  async changePassword(userId: number, current: string, next: string) {
    const rows = await this.db.query<any[]>('SELECT * FROM users WHERE id=? AND active=1 LIMIT 1', [userId]);
    if (!rows.length || !(await bcrypt.compare(current, rows[0].password_hash))) throw new UnauthorizedException('Contraseña actual incorrecta');
    if (current === next) throw new BadRequestException('La nueva contraseña debe ser distinta');
    await this.db.query('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(next, 12), userId]);
    return { ok: true };
  }

  async verify(token?: string) {
    if (!token) throw new UnauthorizedException();
    try { return await this.jwt.verifyAsync(token.replace(/^Bearer\s+/i, '')); }
    catch { throw new UnauthorizedException(); }
  }
}
