import React from 'react';
import { AdminMetrics } from '../../api/admin/types';

interface KpiCardsProps {
  metrics: AdminMetrics;
}

export const KpiCards: React.FC<KpiCardsProps> = ({ metrics }) => {
  return (
    <section className="kpi-grid" aria-label="Ключевые показатели очереди">
      <div className="kpi-card">
        <div className="kpi-label">Ожидают в очереди</div>
        <div className="kpi-value">{metrics.waitingClientsCount} чел.</div>
        <div className="kpi-sub">по всем открытым окнам</div>
      </div>

      <div className="kpi-card warning">
        <div className="kpi-label">Ср. время ожидания</div>
        <div className="kpi-value">{metrics.avgWaitTimeMinutes} мин.</div>
        <div className="kpi-sub">макс. ожидание: {metrics.maxWaitTimeMinutes} мин.</div>
      </div>

      <div className="kpi-card success">
        <div className="kpi-label">Обслужено сегодня</div>
        <div className="kpi-value">{metrics.servedTodayCount} чел.</div>
        <div className="kpi-sub">за текущую рабочую смену</div>
      </div>

      <div className="kpi-card purple">
        <div className="kpi-label">Активные окна</div>
        <div className="kpi-value">
          {metrics.activeWindowsCount} / {metrics.totalWindowsCount}
        </div>
        <div className="kpi-sub">готовы принимать талоны</div>
      </div>
    </section>
  );
};
