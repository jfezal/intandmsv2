import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import type { AppEnv } from '../../config/env.schema';

/**
 * Stream events carry ids only. Clients refetch through the normal authorised endpoints, so a
 * stale subscription never receives message content it is no longer allowed to read.
 */
export type MessageEvent =
  | { type: 'message'; conversationId: string; messageId: string }
  | { type: 'conversation'; conversationId: string }
  | { type: 'read'; conversationId: string };

type Listener = (event: MessageEvent) => void;

const CHANNEL = 'intandms:messages';
export const MAX_STREAMS_PER_USER = 5;

@Injectable()
export class MessageHubService implements OnModuleDestroy {
  private readonly logger = new Logger(MessageHubService.name);
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly publisher: IORedis | null;
  private readonly subscriber: IORedis | null;

  constructor(config: ConfigService<AppEnv, true>) {
    const url = config.get('VALKEY_URL', { infer: true });
    this.publisher = url ? new IORedis(url, { maxRetriesPerRequest: 1 }) : null;
    this.subscriber = url ? new IORedis(url) : null;
    if (this.subscriber) {
      this.subscriber.subscribe(CHANNEL).catch((error: unknown) => {
        this.logger.warn(`Message stream fan-out unavailable: ${error instanceof Error ? error.message : 'unknown'}`);
      });
      this.subscriber.on('message', (_channel, payload) => {
        try {
          const { userIds, event } = JSON.parse(payload) as { userIds: string[]; event: MessageEvent };
          this.deliverLocal(userIds, event);
        } catch {
          this.logger.warn('Ignored a malformed message stream payload.');
        }
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.publisher?.quit(), this.subscriber?.quit()]);
  }

  /** Returns false when the user already has the maximum number of open streams. */
  subscribe(userId: string, listener: Listener): (() => void) | null {
    const set = this.listeners.get(userId) ?? new Set<Listener>();
    if (set.size >= MAX_STREAMS_PER_USER) return null;
    set.add(listener);
    this.listeners.set(userId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(userId);
    };
  }

  publish(userIds: Iterable<string>, event: MessageEvent): void {
    const recipients = [...new Set(userIds)];
    if (recipients.length === 0) return;
    if (this.publisher) {
      this.publisher.publish(CHANNEL, JSON.stringify({ userIds: recipients, event })).catch(() => {
        // Valkey down: still reach subscribers on this instance; others catch up on reconnect/refresh.
        this.deliverLocal(recipients, event);
      });
      return;
    }
    this.deliverLocal(recipients, event);
  }

  private deliverLocal(userIds: string[], event: MessageEvent): void {
    for (const userId of userIds) {
      for (const listener of this.listeners.get(userId) ?? []) {
        listener(event);
      }
    }
  }
}
