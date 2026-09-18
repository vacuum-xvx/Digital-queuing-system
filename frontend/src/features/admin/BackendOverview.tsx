import { useEffect, useState } from 'react';
import { AdminBranchOverview } from '../../api/admin/types';
import { getOverview } from '../../api/admin/adminApi';
import { KpiCards } from './KpiCards';
import { formatMoscowDateTime } from '../../utils/time';

export function BackendOverview({ branchId }: { branchId: string }) {
  const [data, setData] = useState<AdminBranchOverview | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let timer: number;
    setData(null);
    async function poll() {
      try { const next = await getOverview(branchId); if (active) { setData(next); setError(false); } }
      catch { if (active) setError(true); }
      finally { if (active) timer = window.setTimeout(poll, 5000); }
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [branchId]);
  return <section><h2>Работа отделения · сегодня по МСК</h2>
    {error && <p role="alert">Не удалось обновить показатели. Отображаются последние полученные данные.</p>}
    {data?.branchId === branchId ? <><KpiCards metrics={data.metrics} />
      {data.anomalies.length > 0 && <details><summary>События, требующие внимания</summary>{data.anomalies.map(item => <p key={item.id}>{item.publicNumber}: {item.description} · {formatMoscowDateTime(item.time)} МСК</p>)}</details>}
    </> : <p role="status">Загрузка показателей…</p>}
  </section>;
}
