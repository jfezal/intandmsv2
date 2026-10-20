import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LoginBody } from '@intandms/contracts';
import {
  createSessionToken,
  digestSessionToken,
  sessionExpiry,
  verifyPassword,
} from '@intandms/identity';
import type { AppEnv } from '../../config/env.schema';
import { RateLimitService } from '../../common/rate-limit.service';
import { PrismaService } from '../../prisma/prisma.service';

type AuthUser = {
  id: string;
  login: string;
  displayName: string;
  permissions: string[];
};

@Injectable()
export class AuthService {
  private readonly attemptState = new Map<string, { failures: number; lockedUntil?: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly rateLimit: RateLimitService,
  ) {}

  async login(body: LoginBody, ipAddress?: string): Promise<{ token: string; user: AuthUser }> {
    this.assertNotRateLimited(body.login);

    const ipKey = ipAddress ? `auth:ip:${ipAddress}` : 'auth:ip:unknown';
    const loginKey = `auth:login:${body.login}`;
    const ipOk = await this.rateLimit.increment(ipKey, 900, 60);
    const loginOk = await this.rateLimit.increment(loginKey, 900, 20);
    if (!ipOk || !loginOk) {
      throw new UnauthorizedException('Invalid login or password.');
    }

    const user = await this.prisma.client.user.findUnique({
      where: { login: body.login },
      include: {
        passwordCredential: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    const credential = user?.passwordCredential;
    const passwordOk =
      credential !== undefined &&
      credential !== null &&
      (await verifyPassword(body.password, credential.passwordHash));

    if (!user || !user.enabled || !passwordOk) {
      this.registerFailure(body.login);
      await this.prisma.client.authEvent.create({
        data: {
          login: body.login,
          outcome: 'failure',
          reason: 'invalid_credentials',
          ipAddress,
        },
      });
      throw new UnauthorizedException('Invalid login or password.');
    }

    this.clearFailures(body.login);

    const token = createSessionToken();
    const digest = digestSessionToken(token);
    const now = new Date();
    const expiresAt = sessionExpiry(
      {
        idleSeconds: this.config.get('SESSION_IDLE_SECONDS', { infer: true }),
        absoluteSeconds: this.config.get('SESSION_ABSOLUTE_SECONDS', { infer: true }),
      },
      now,
    );

    await this.prisma.client.$transaction(async (tx) => {
      await tx.session.create({
        data: {
          userId: user.id,
          tokenDigest: digest,
          expiresAt,
          securityRevision: user.securityRevision,
        },
      });
      await tx.authEvent.create({
        data: {
          userId: user.id,
          login: user.login,
          outcome: 'success',
          reason: 'login',
          ipAddress,
        },
      });
    });

    return {
      token,
      user: this.toAuthUser(user),
    };
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }
    const digest = digestSessionToken(token);
    await this.prisma.client.session.updateMany({
      where: { tokenDigest: digest, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async resolveUserFromToken(token: string | undefined): Promise<AuthUser | null> {
    if (!token) {
      return null;
    }
    const digest = digestSessionToken(token);
    const session = await this.prisma.client.session.findUnique({
      where: { tokenDigest: digest },
      include: {
        user: {
          include: {
            userRoles: {
              include: {
                role: {
                  include: {
                    rolePermissions: {
                      include: { permission: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      return null;
    }

    const user = session.user;
    if (!user.enabled || user.securityRevision !== session.securityRevision) {
      return null;
    }

    await this.prisma.client.session.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    });

    return this.toAuthUser(user);
  }

  async isBootstrapOpen(): Promise<boolean> {
    const state = await this.prisma.client.installationState.findUnique({
      where: { id: 'default' },
    });
    return !state?.bootstrapClosed;
  }

  async assertBootstrapOpen(): Promise<void> {
    if (!(await this.isBootstrapOpen())) {
      throw new ForbiddenException('Installation bootstrap is closed.');
    }
  }

  private toAuthUser(user: {
    id: string;
    login: string;
    displayName: string;
    userRoles: Array<{
      role: {
        rolePermissions: Array<{ permission: { key: string } }>;
      };
    }>;
  }): AuthUser {
    const permissions = new Set<string>();
    for (const userRole of user.userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        permissions.add(rolePermission.permission.key);
      }
    }
    return {
      id: user.id,
      login: user.login,
      displayName: user.displayName,
      permissions: [...permissions].sort(),
    };
  }

  private assertNotRateLimited(login: string): void {
    const state = this.attemptState.get(login);
    if (state?.lockedUntil && state.lockedUntil > Date.now()) {
      throw new UnauthorizedException('Invalid login or password.');
    }
  }

  private registerFailure(login: string): void {
    const current = this.attemptState.get(login) ?? { failures: 0 };
    const failures = current.failures + 1;
    const next: { failures: number; lockedUntil?: number } = { failures };
    if (failures >= 8) {
      next.lockedUntil = Date.now() + 15 * 60 * 1000;
      next.failures = 0;
    }
    this.attemptState.set(login, next);
  }

  private clearFailures(login: string): void {
    this.attemptState.delete(login);
  }
}
