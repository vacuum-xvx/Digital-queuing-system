import { QueuePolicy, UpdateQueuePolicyRequest, AdminApiError, AdminWindow } from './types';
import { Branch, BranchListResponse } from '../operator/types';

export async function getOverview(branchId: string): Promise<import('./types').AdminBranchOverview> {
  const response = await fetch(`${getApiBaseUrl()}/admin/branches/${encodeURIComponent(branchId)}/overview`, { credentials: 'include', headers: { Accept: 'application/json' } });
  return handleResponse(response);
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
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/admin/branches/${encodeURIComponent(branchId)}/queue-policy`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  return await handleResponse<QueuePolicy>(res);
}

export async function updateQueuePolicy(
  branchId: string,
  req: UpdateQueuePolicyRequest
): Promise<QueuePolicy> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/admin/branches/${encodeURIComponent(branchId)}/queue-policy`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
  });

  return await handleResponse<QueuePolicy>(res);
}

export async function listBranches(): Promise<Branch[]> {
  const res = await fetch(`${getApiBaseUrl()}/branches`, {
    headers: { Accept: 'application/json' },
  });
  return (await handleResponse<BranchListResponse>(res)).items;
}

export type WindowStatusUpdate = 'OPEN' | 'CLOSED' | 'CLOSING';

// Persist window shift status (OPEN/CLOSED/CLOSING). Without persistence the next
// overview poll reverts the operator's change.
export async function changeWindowStatus(windowId: string, status: WindowStatusUpdate): Promise<AdminWindow> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/admin/windows/${encodeURIComponent(windowId)}/status`, {
    method: 'PUT',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  return await handleResponse<AdminWindow>(res);
}

// Replace the set of services a window is allowed to serve (window_services).
export async function updateWindowServices(windowId: string, serviceIds: string[]): Promise<AdminWindow> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/admin/windows/${encodeURIComponent(windowId)}/services`, {
    method: 'PUT',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceIds }),
  });
  return await handleResponse<AdminWindow>(res);
}
