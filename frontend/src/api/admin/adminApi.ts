import {
  AdminBranchOverview,
  PriorityRule,
  QueuePolicy,
  UpdateQueuePolicyRequest,
  AdminApiError,
} from './types';
import {
  DEMO_ADMIN_OVERVIEW,
  getMockQueuePolicy,
  updateMockQueuePolicy,
} from './mockData';

let stateOverview: AdminBranchOverview = JSON.parse(JSON.stringify(DEMO_ADMIN_OVERVIEW));

export function isMockEnabled(): boolean {
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
      const data = await response.json();
      if (data?.error) {
        errorCode = data.error.code || errorCode;
        errorMessage = data.error.message || errorMessage;
        requestId = data.error.requestId;
      }
    } catch {
      // non-JSON
    }

    throw new AdminApiError(errorCode, errorMessage, response.status, requestId);
  }

  return (await response.json()) as T;
}

export async function getQueuePolicy(branchId: string): Promise<QueuePolicy> {
  if (isMockEnabled()) {
    return getMockQueuePolicy();
  }

  const base = getApiBaseUrl();
  const res = await fetch(`${base}/admin/branches/${encodeURIComponent(branchId)}/queue-policy`, {
    headers: { Accept: 'application/json' },
  });

  return await handleResponse<QueuePolicy>(res);
}

export async function updateQueuePolicy(
  branchId: string,
  req: UpdateQueuePolicyRequest
): Promise<QueuePolicy> {
  if (isMockEnabled()) {
    try {
      return updateMockQueuePolicy(
        req.appointmentDuePriority,
        req.qrPriority,
        req.expectedVersion
      );
    } catch (e: any) {
      if (e?.message === 'POLICY_VERSION_CONFLICT') {
        throw new AdminApiError(
          'POLICY_VERSION_CONFLICT',
          'Policy version conflict',
          409
        );
      }
      throw e;
    }
  }

  const base = getApiBaseUrl();
  const res = await fetch(`${base}/admin/branches/${encodeURIComponent(branchId)}/queue-policy`, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
  });

  return await handleResponse<QueuePolicy>(res);
}

export async function getAdminOverview(branchId?: string): Promise<AdminBranchOverview> {
  const base = getApiBaseUrl();
  const id = branchId || stateOverview.branchId;

  try {
    const res = await fetch(`${base}/admin/branches/${encodeURIComponent(id)}/overview`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      return (await res.json()) as AdminBranchOverview;
    }
  } catch {
    // If backend doesn't implement admin endpoints yet, use rich demo state
  }

  return stateOverview;
}

export async function savePriorityRules(
  rules: PriorityRule[],
  branchId?: string
): Promise<PriorityRule[]> {
  const base = getApiBaseUrl();
  const id = branchId || stateOverview.branchId;

  try {
    const res = await fetch(`${base}/admin/branches/${encodeURIComponent(id)}/priorities`, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items: rules }),
    });
    if (res.ok) {
      return (await res.json()) as PriorityRule[];
    }
  } catch {
    // Update local state
  }

  stateOverview = {
    ...stateOverview,
    priorities: rules,
  };
  return stateOverview.priorities;
}

export async function toggleWindowStatus(
  windowId: string,
  newStatus: 'OPEN' | 'CLOSED'
): Promise<void> {
  const base = getApiBaseUrl();

  try {
    await fetch(`${base}/admin/windows/${encodeURIComponent(windowId)}/status`, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: newStatus }),
    });
  } catch {
    // Update local state
  }

  stateOverview = {
    ...stateOverview,
    windows: stateOverview.windows.map((w) =>
      w.id === windowId ? { ...w, status: newStatus } : w
    ),
  };
}
