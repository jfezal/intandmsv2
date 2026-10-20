import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadEnv } from './config/env.schema';
import { AuthModule } from './modules/auth/auth.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { HealthModule } from './modules/health/health.module';
import { PlatformModule } from './modules/platform/platform.module';
import { RepositoriesModule } from './modules/repositories/repositories.module';
import { SearchModule } from './modules/search/search.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: false,
      envFilePath: ['../../.env', '.env'],
      load: [() => loadEnv(process.env)],
    }),
    PrismaModule,
    AuthorizationModule,
    HealthModule,
    AuthModule,
    RepositoriesModule,
    DocumentsModule,
    SearchModule,
    PlatformModule,
  ],
})
export class AppModule {}
