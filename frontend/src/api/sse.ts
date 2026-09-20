export interface SSEEvent<T = any> {
  topic: string;
  type: string;
  data: T;
}

export type SSECallback<T = any> = (event: SSEEvent<T>) => void;

/**
 * Subscribes to Server-Sent Events for given topics with auto-reconnect.
 * Returns an unsubscribe function.
 */
export function subscribeSSE(
  topics: string[],
  onEvent: SSECallback,
  onError?: (err: Event) => void
): () => void {
  if (typeof window === 'undefined' || !window.EventSource || topics.length === 0) {
    return () => {};
  }

  const query = topics.map((t) => `topic=${encodeURIComponent(t)}`).join('&');
  const url = `/api/v1/events?${query}`;
  let es: EventSource | null = new EventSource(url, { withCredentials: true });

  const eventTypes = [
    'ticket_update',
    'tv_update',
    'queue_update',
    'connected',
  ];

  const handler = (e: MessageEvent) => {
    try {
      const parsed = JSON.parse(e.data);
      onEvent({ topic: parsed.topic || '', type: e.type, data: parsed.data !== undefined ? parsed.data : parsed });
    } catch {
      // non-json or heartbeat message
    }
  };

  eventTypes.forEach((type) => es?.addEventListener(type, handler));

  es.onerror = (err) => {
    if (onError) onError(err);
  };

  return () => {
    if (es) {
      eventTypes.forEach((type) => es?.removeEventListener(type, handler));
      es.close();
      es = null;
    }
  };
}
