import { AdminBranchOverview, PriorityRule } from './types';
import { DEMO_ADMIN_OVERVIEW } from './mockData';

let stateOverview: AdminBranchOverview = JSON.parse(JSON.stringify(DEMO_ADMIN_OVERVIEW));

function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string') {
    return `${envUrl.replace(/\/$/, '')}/api/v1`;
  }
  return '/api/v1';
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
