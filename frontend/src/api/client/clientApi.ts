import {
  Branch,
  BranchListResponse,
  Service,
  ServiceListResponse,
  Ticket,
} from './types';

export class ClientApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ClientApiError';
  }
}

function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string') {
    return `${envUrl.replace(/\/$/, '')}/api/v1`;
  }
  return '/api/v1';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new ClientApiError(`Некорректное поле ${field}`);
  return value;
}

function parseBranches(value: unknown): BranchListResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new ClientApiError('Некорректный формат списка отделений');
  }
  return {
    items: value.items.map((item) => {
      if (!isRecord(item)) throw new ClientApiError('Некорректное отделение');
      return { id: requireString(item.id, 'id'), name: requireString(item.name, 'name') };
    }),
  };
}

function parseServices(value: unknown): ServiceListResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new ClientApiError('Некорректный формат списка услуг');
  }
  return {
    items: value.items.map((item) => {
      if (!isRecord(item)) throw new ClientApiError('Некорректная услуга');
      return {
        id: requireString(item.id, 'id'),
        code: requireString(item.code, 'code'),
        name: requireString(item.name, 'name'),
      };
    }),
  };
}

const statuses = new Set(['SCHEDULED', 'WAITING', 'CALLED', 'SERVING', 'COMPLETED', 'CANCELLED', 'NO_SHOW']);
const sources = new Set(['APPOINTMENT', 'QR', 'LIVE']);

function parseTicket(value: unknown): Ticket {
  if (!isRecord(value)) throw new ClientApiError('Некорректный формат талона');
  if (!statuses.has(value.status as string) || !sources.has(value.source as string)) {
    throw new ClientApiError('Некорректный статус или источник талона');
  }
  const window = value.window;
  if (window !== null && (!isRecord(window) || typeof window.number !== 'number')) {
    throw new ClientApiError('Некорректное окно талона');
  }
  return {
    id: requireString(value.id, 'id'),
    publicNumber: requireString(value.publicNumber, 'publicNumber'),
    branchId: requireString(value.branchId, 'branchId'),
    serviceId: requireString(value.serviceId, 'serviceId'),
    source: value.source as Ticket['source'],
    status: value.status as Ticket['status'],
    scheduledTime: value.scheduledTime ? requireString(value.scheduledTime, 'scheduledTime') : null,
    window: window === null ? null : {
      id: requireString(window.id, 'window.id'),
      number: window.number as number,
    },
    createdAt: requireString(value.createdAt, 'createdAt'),
    queueEnteredAt: requireString(value.queueEnteredAt, 'queueEnteredAt'),
    calledAt: value.calledAt === null ? null : requireString(value.calledAt, 'calledAt'),
    serviceStartedAt: value.serviceStartedAt === null ? null : requireString(value.serviceStartedAt, 'serviceStartedAt'),
    completedAt: value.completedAt === null ? null : requireString(value.completedAt, 'completedAt'),
  };
}

async function request<T>(path: string, init?: RequestInit, parser?: (value: unknown) => T): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch {
    throw new ClientApiError('Не удалось связаться с сервером');
  }

  if (!response.ok) {
    let message = `Ошибка сервера (${response.status})`;
    try {
      const body = await response.json() as { error?: { message?: string; code?: string } };
      message = body.error?.message || message;
      throw new ClientApiError(message, response.status, body.error?.code);
    } catch (error) {
      if (error instanceof ClientApiError) throw error;
      throw new ClientApiError(message, response.status);
    }
  }

  const body: unknown = await response.json();
  return parser ? parser(body) : body as T;
}

export async function listBranches(signal?: AbortSignal): Promise<Branch[]> {
  const response = await request('/branches', { signal }, parseBranches);
  return response.items;
}

export async function listServices(branchId: string, signal?: AbortSignal): Promise<Service[]> {
  const response = await request(`/branches/${encodeURIComponent(branchId)}/services`, { signal }, parseServices);
  return response.items;
}

export async function createQrTicket(branchId: string, serviceId: string, idempotencyKey: string, signal?: AbortSignal): Promise<Ticket> {
  return request(`/branches/${encodeURIComponent(branchId)}/tickets/qr`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ serviceId }),
  }, parseTicket);
}

export async function getTicket(ticketId: string, signal?: AbortSignal): Promise<Ticket> {
  return request(`/tickets/${encodeURIComponent(ticketId)}`, { signal }, parseTicket);
}

export async function createAppointmentTicket(
  branchId: string,
  serviceId: string,
  scheduledTime: string,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<Ticket> {
  return request(`/branches/${encodeURIComponent(branchId)}/tickets/appointment`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ serviceId, scheduledTime }),
  }, parseTicket);
}

export async function cancelTicket(ticketId: string, signal?: AbortSignal): Promise<Ticket> {
  return request(`/tickets/${encodeURIComponent(ticketId)}/cancel`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
  }, parseTicket);
}


