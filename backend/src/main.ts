import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: process.env.MIGRATE_ONLY==='1' ? ['error','warn','log'] : undefined });
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) console.warn('ADVERTENCIA: JWT_SECRET ausente o corto (<32 caracteres). Ejecute CONFIGURAR.bat para generarlo.');
  app.setGlobalPrefix('api');
  app.enableCors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:4200,http://localhost:3000').split(','), credentials: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  if(process.env.MIGRATE_ONLY==='1'){
    await app.init();
    console.log('Migración automática V0.4.1 completada.');
    await app.close();
    return;
  }
  const publicDir = join(process.cwd(), 'public');
  if (existsSync(publicDir)) app.useStaticAssets(publicDir, { index: 'index.html' });
  await app.listen(Number(process.env.PORT || 3000), '0.0.0.0');
  const port = process.env.PORT || 3000;
  console.log('\n============================================================');
  console.log(`  Gestión de Infraestructura de Red 0.4.1 lista.`);
  console.log(`  Abra en el navegador:  http://localhost:${port}`);
  console.log(`  Usuario: ${process.env.ADMIN_USER || 'admin'}`);
  console.log('============================================================\n');
}
bootstrap().catch(e => { console.error(e); process.exit(1); });
