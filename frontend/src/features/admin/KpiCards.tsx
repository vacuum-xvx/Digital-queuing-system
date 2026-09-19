import React from 'react';
import { AdminMetrics } from '../../api/admin/types';

interface KpiCardsProps {
  metrics: AdminMetrics;
  noShowCount?: number;
}

export const KpiCards: React.FC<KpiCardsProps> = ({ metrics, noShowCount = 0 }) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 font-mono">
      {/* 1. Ср. ожидание */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
        <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Ср. ожидание</div>
        <div className="text-2xl font-black text-slate-900 mt-1">
          {metrics.avgWaitTimeMinutes} мин
        </div>
        <div className="text-xs text-emerald-700 font-semibold mt-1 font-sans">
          {metrics.avgWaitTimeMinutes <= 8 ? '✓ В нормативе (< 8 мин)' : 'Мониторинг SLA'}
        </div>
        <div className="text-xs text-slate-500 mt-2 font-sans">P90 ожидания: {metrics.p90WaitMinutes ?? '—'} мин</div>
      </div>

      {/* 2. Макс. ожидание */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
        <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Макс. ожидание</div>
        <div className="text-2xl font-black text-amber-700 mt-1">
          {metrics.maxWaitTimeMinutes} мин
        </div>
        <div className="text-xs text-slate-500 mt-1 font-sans">
          {metrics.maxWaitTimeMinutes > 15 ? '⚠ Защита от голодания' : 'В норме'}
        </div>
      </div>

      {/* 3. В зале ожидания */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
        <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">В зале ожидания</div>
        <div className="text-2xl font-black text-[#054FA6] mt-1">
          {metrics.waitingClientsCount} чел
        </div>
        <div className="text-xs text-slate-500 mt-1 font-sans">
          {metrics.activeWindowsCount} / {metrics.totalWindowsCount} окна в работе
        </div>
      </div>

      {/* 4. Обслужено за смену */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
        <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Обслужено за смену</div>
        <div className="text-2xl font-black text-slate-900 mt-1">
          {metrics.servedTodayCount} чел
        </div>
        <div className="text-xs text-emerald-700 font-semibold mt-1 font-sans">
          За текущий день (МСК)
        </div>
      </div>

      {/* 5. Неявки */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm col-span-2 lg:col-span-1">
        <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Неявки</div>
        <div className="text-2xl font-black text-[#D92534] mt-1">
          {noShowCount} талона
        </div>
        <div className="text-xs text-slate-500 mt-1 font-sans">
          Окна освобождены
        </div>
      </div>
    </div>
  );
};
