import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadEnv } from './config/env.schema';
import { CsrfService } from './common/csrf.service';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { ConnectorsModule } from './modules/connectors/connectors.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { HealthModule } from './modules/health/health.module';
import { MessagesModule } from './modules/messages/messages.module';
import { PlatformModule } from './modules/platform/platform.module';
import { RepositoriesModule } from './modules/repositories/repositories.module';
import { RetentionModule } from './modules/retention/retention.module';
import { SearchModule } from './modules/search/search.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
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
    WorkflowModule,
    RetentionModule,
    AuditModule,
    AdminModule,
    ConnectorsModule,
    MessagesModule,
  ],
  providers: [CsrfService],
})
export class AppModule {}
