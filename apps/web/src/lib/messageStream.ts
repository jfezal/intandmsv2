import { useEffect, useRef } from 'react';

export type MessageStreamEvent =
  | { type: 'message'; conversationId: string; messageId: string }
  | { type: 'conversation'; conversationId: string }
  | { type: 'read'; conversationId: string }
  /** Emitted locally after the stream (re)connects, so views can refetch anything missed. */
  | { type: 'resync' };

const EVENT_NAME = 'intandms:message-event';

function dispatch(event: MessageStreamEvent): void {
  window.dispatchEvent(new CustomEvent<MessageStreamEvent>(EVENT_NAME, { detail: event }));
}

/** Opens one server-sent event stream for the signed-in user; EventSource reconnects by itself. */
export function useMessageStream(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/v1/messages/stream', { withCredentials: true });
    let opened = false;
    const relay = (raw: MessageEvent<string>) => {
      try {
        dispatch(JSON.parse(raw.data) as MessageStreamEvent);
      } catch {
        // Ignore malformed frames; the next resync restores state.
      }
    };
    source.addEventListener('message', relay);
    source.addEventListener('conversation', relay);
    source.addEventListener('read', relay);
    source.onopen = () => {
      if (opened) dispatch({ type: 'resync' });
      opened = true;
    };
    return () => source.close();
  }, [enabled]);
}

export function useMessageEvents(handler: (event: MessageStreamEvent) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const listener = (event: Event) => ref.current((event as CustomEvent<MessageStreamEvent>).detail);
    window.addEventListener(EVENT_NAME, listener);
    return () => window.removeEventListener(EVENT_NAME, listener);
  }, []);
}
