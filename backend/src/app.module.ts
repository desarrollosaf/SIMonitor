import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseService } from './database.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ApiController, ProbeApiController, UserApiController } from './api.controller';
import { ApiService } from './api.service';
import { JwtAuthGuard, ProbeGuard } from './auth.guard';
import { RetentionService } from './retention.service';

@Module({
  imports: [
    // Configuración única en <raíz>/config.env; backend/.env (opcional) tiene prioridad para desarrollo.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../config.env'] }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [AuthController, ApiController, UserApiController, ProbeApiController],
  providers: [DatabaseService, AuthService, ApiService, RetentionService, JwtAuthGuard, ProbeGuard],
})
export class AppModule {}
