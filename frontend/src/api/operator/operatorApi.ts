import {
  Branch,
  BranchListResponse,
  OperatorWindow,
  WindowListResponse,
  Ticket,
  ApiErrorResponse,
  OperatorApiError,
} from './types';
import {
  DEMO_BRANCH,
  DEMO_WINDOWS,
  getMockActiveTicket,
  setMockActiveTicket,
  createMockTicket,
} from './mockData';

export function isMockEnabled(): boolean {
  if (!window.location.pathname.startsWith('/demo')) return false;
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mock') === '1') return true;
  }
  return import.meta.env.VITE_USE_MOCK === 'true';
}

function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string') {
    return `${envUrl.replace(/\/$/, '')}/api/v1`;
  }
  return '/api/v1';
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorCode = 'INTERNAL_ERROR';
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    let requestId: string | undefined;

    try {
      const data = (await response.json()) as ApiErrorResponse;
      if (data?.error) {
        errorCode = data.error.code || errorCode;
        errorMessage = data.error.message || errorMessage;
        requestId = data.error.requestId;
      }
    } catch {
      // Non-JSON or empty response body
    }

    throw new OperatorApiError(errorCode, errorMessage, response.status, requestId);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export async function listBranches(): Promise<Branch[]> {
  if (isMockEnabled()) {
    return [DEMO_BRANCH];
  }

  const base = getApiBaseUrl();
  const res = await fetch(`${base}/branches`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  const data = await handleResponse<BranchListResponse>(res);
  return data.items ?? [];
}

export async function listWindows(branchId: string): Promise<OperatorWindow[]> {
  if (isMockEnabled()) {
    return DEMO_WINDOWS;
  }

  const base = getApiBaseUrl();
  const res = await fetch(`${base}/operator/branches/${encodeURIComponent(branchId)}/windows`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  const data = await handleResponse<WindowListResponse>(res);
  return data.items ?? [];
}

export async function getCurrentTicket(windowId: string): Promise<Ticket | null> {
  if (isMockEnabled()) {
    const current = getMockActiveTicket();
    if (current && current.window?.id === windowId) {
      return current;
    }
    return null; // 204 equivalent
  }

  const base = getApiBaseUrl();
  const res = await fetch(`${base}/operator/windows/${encodeURIComponent(windowId)}/current-ticket`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (res.status === 204) {
    return null;
  }

  return await handleResponse<Ticket>(res);
}

export async function callNext(windowId: string): Promise<Ticket> {
  if (isMockEnabled()) {
    const matchedWindow = DEMO_WINDOWS.find((w) => w.id === windowId) || DEMO_WINDOWS[0];
    const ticket = createMockTicket(matchedWindow.number, 'CALLED');
    setMockActiveTicket(ticket);
    return ticket;
  }

  const base = getApiBaseUrl();
  const res = await fetch(`${base}/operator/windows/${encodeURIComponent(windowId)}/call-next`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  return await handleResponse<Ticket>(res);
}

export async function startService(ticketId: string): Promise<Ticket> {
  if (isMockEnabled()) {
    const current = getMockActiveTicket();
    if (!current || current.id !== ticketId) {
      throw new OperatorApiError('NOT_FOUND', 'Ticket not found', 404);
    }
    if (current.status !== 'CALLED') {
      throw new OperatorApiError('INVALID_TICKET_STATE', 'Ticket is not in CALLED status', 409);
    }
    const updated: Ticket = {
      ...current,
      status: 'SERVING',
      serviceStartedAt: new Date().toISOString(),
    };
    setMockActiveTicket(updated);
    return updated;
  }

  const base = getApiBaseUrl();
  const res = await fetch(`${base}/operator/tickets/${encodeURIComponent(ticketId)}/start`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  return await handleResponse<Ticket>(res);
}

export async function completeService(ticketId: string): Promise<Ticket> {
  if (isMockEnabled()) {
    const current = getMockActiveTicket();
    if (!current || current.id !== ticketId) {
      throw new OperatorApiError('NOT_FOUND', 'Ticket not found', 404);
    }
    if (current.status !== 'SERVING') {
      throw new OperatorApiError('INVALID_TICKET_STATE', 'Ticket is not in SERVING status', 409);
    }
    const completed: Ticket = {
      ...current,
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
    };
    setMockActiveTicket(null);
    return completed;
  }

  const base = getApiBaseUrl();
  const res = await fetch(`${base}/operator/tickets/${encodeURIComponent(ticketId)}/complete`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  return await handleResponse<Ticket>(res);
}

export async function createLiveTicket(branchId: string, serviceId: string, idempotencyKey: string): Promise<Ticket> {
  if (isMockEnabled()) {
    const ticket = createMockTicket(0, 'WAITING');
    const live = { ...ticket, source: 'LIVE' as const, publicNumber: `L-${ticket.publicNumber.replace(/\D/g, '').padStart(6, '0')}` };
    return live;
  }
  const res = await fetch(`${getApiBaseUrl()}/operator/branches/${encodeURIComponent(branchId)}/tickets/live`, {
    method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ serviceId }),
  });
  return await handleResponse<Ticket>(res);
}

export async function markNoShow(ticketId: string): Promise<Ticket> {
  if (isMockEnabled()) {
    const current = getMockActiveTicket();
    if (!current || current.id !== ticketId) throw new OperatorApiError('NOT_FOUND', 'Ticket not found', 404);
    if (current.status !== 'CALLED') throw new OperatorApiError('INVALID_TICKET_STATE', 'Ticket is not CALLED', 409);
    const updated = { ...current, status: 'NO_SHOW' as const };
    setMockActiveTicket(null);
    return updated;
  }
  const res = await fetch(`${getApiBaseUrl()}/operator/tickets/${encodeURIComponent(ticketId)}/no-show`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json' } });
  return await handleResponse<Ticket>(res);
}

export async function returnTicket(ticketId: string): Promise<Ticket> {
  const res = await fetch(`${getApiBaseUrl()}/operator/tickets/${encodeURIComponent(ticketId)}/return`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  return await handleResponse<Ticket>(res);
}

export async function redirectTicket(ticketId: string, newServiceId?: string, targetWindowId?: string): Promise<Ticket> {
  const res = await fetch(`${getApiBaseUrl()}/operator/tickets/${encodeURIComponent(ticketId)}/redirect`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ newServiceId, targetWindowId }),
  });
  return await handleResponse<Ticket>(res);
}
