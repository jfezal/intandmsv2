import { Global, Module } from '@nestjs/common';
import { CsrfService } from '../../common/csrf.service';
import { RateLimitService } from '../../common/rate-limit.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './session-auth.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionAuthGuard, CsrfService, RateLimitService],
  exports: [AuthService, SessionAuthGuard, CsrfService, RateLimitService],
})
export class AuthModule {}
