import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import type { AppEnv } from '../config/env.schema';

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly redis: IORedis | null;
  private readonly memory = new Map<string, { count: number; resetAt: number }>();

  constructor(config: ConfigService<AppEnv, true>) {
    const url = config.get('VALKEY_URL', { infer: true });
    this.redis = url ? new IORedis(url, { maxRetriesPerRequest: 1 }) : null;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  async increment(key: string, windowSeconds: number, max: number): Promise<boolean> {
    if (this.redis) {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, windowSeconds);
      }
      return count <= max;
    }

    const now = Date.now();
    const current = this.memory.get(key);
    if (!current || current.resetAt <= now) {
      this.memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return true;
    }
    current.count += 1;
    return current.count <= max;
  }
}
