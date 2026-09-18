import { useState, useEffect, useCallback } from 'react';

// A simple hook for polling data from a URL
export function usePoll<T>(url: string, intervalMs: number = 3000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!url) {
      setIsLoading(false);
      return;
    }
    try {
      const envUrl = import.meta.env.VITE_API_BASE_URL;
      const apiPrefix = envUrl ? `${envUrl.replace(/\/$/, '')}/api/v1` : '/api/v1';
      const cleanPath = url.startsWith('/api/v1') ? url.replace(/^\/api\/v1/, '') : url;
      const fullUrl = `${apiPrefix}${cleanPath.startsWith('/') ? '' : '/'}${cleanPath}`;
      
      const response = await fetch(fullUrl, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const json = await response.json();
      setData(json);
      setError(null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchData(); // initial fetch
    if (intervalMs > 0 && url) {
      const intervalId = setInterval(fetchData, intervalMs);
      return () => clearInterval(intervalId);
    }
  }, [fetchData, intervalMs, url]);

  return { data, error, isLoading, refetch: fetchData };
}

// Specific hooks

export function useTVQueue(branchId: string, intervalMs: number = 3000) {
  return usePoll<any>(`/branches/${encodeURIComponent(branchId)}/tv`, intervalMs);
}

export function useAdminOverview(branchId: string, intervalMs: number = 5000) {
  return usePoll<any>(`/admin/branches/${encodeURIComponent(branchId)}/overview`, intervalMs);
}

export function useWindows(branchId: string, intervalMs: number = 3000) {
  return usePoll<any>(`/operator/branches/${encodeURIComponent(branchId)}/windows`, intervalMs);
}

export function useQueuePosition(ticketId: string | null, intervalMs: number = 3000) {
  const { data, error, isLoading, refetch } = usePoll<any>(
    ticketId ? `/tickets/${encodeURIComponent(ticketId)}/position` : '',
    ticketId ? intervalMs : 0
  );
  
  // Return null if no ticketId
  return { 
    data: ticketId ? data : null, 
    error, 
    isLoading: ticketId ? isLoading : false, 
    refetch 
  };
}
