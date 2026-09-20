export interface TVCallEvent {
  ticketNumber: string;
  windowNumber: number | string;
  timestamp: number;
}

const TV_CHANNEL_NAME = 'pochta_tv_channel';
const TV_STORAGE_KEY = 'pochta_tv_call_event';

/**
 * Notifies all open /tv tabs (across browser tabs on the same origin)
 * about a ticket call or repeat call. The operator tab will NOT play sound.
 */
export function broadcastTicketCallToTV(ticketNumber: string, windowNumber: number | string): void {
  const event: TVCallEvent = {
    ticketNumber: ticketNumber.trim(),
    windowNumber,
    timestamp: Date.now(),
  };

  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const channel = new BroadcastChannel(TV_CHANNEL_NAME);
      channel.postMessage({ type: 'TICKET_CALL', ...event });
      channel.close();
    }
  } catch {}

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(TV_STORAGE_KEY, JSON.stringify(event));
    }
  } catch {}
}

/**
 * Subscribes to ticket call events broadcasted by operators.
 * Used exclusively by the /tv board.
 */
export function subscribeToTVCalls(callback: (ticketNumber: string, windowNumber: number | string) => void): () => void {
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      channel = new BroadcastChannel(TV_CHANNEL_NAME);
      channel.onmessage = (e) => {
        if (e.data?.type === 'TICKET_CALL' && e.data.ticketNumber && e.data.windowNumber) {
          callback(e.data.ticketNumber, e.data.windowNumber);
        }
      };
    }
  } catch {}

  const onStorage = (e: StorageEvent) => {
    if (e.key === TV_STORAGE_KEY && e.newValue) {
      try {
        const data = JSON.parse(e.newValue);
        if (data?.ticketNumber && data?.windowNumber) {
          callback(data.ticketNumber, data.windowNumber);
        }
      } catch {}
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  return () => {
    if (channel) {
      channel.close();
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}
