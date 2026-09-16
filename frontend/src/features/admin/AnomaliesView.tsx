import React from 'react';
import { AnomalyTicket } from '../../api/admin/types';

interface AnomaliesViewProps {
  anomalies: AnomalyTicket[];
}

export const AnomaliesView: React.FC<AnomaliesViewProps> = ({ anomalies }) => {
  return (
    <div className="admin-panel-card">
      <h2>Журнал отклонений и незавершенных талонов</h2>
      <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>
        Автоматический мониторинг задержек, неявок клиентов и операционных инцидентов.
      </p>

      {anomalies.length === 0 ? (
        <p style={{ color: '#166534', padding: '16px', background: '#f0fdf4', borderRadius: '8px' }}>
          Отклонений и сбоев в работе отделения не зафиксировано.
        </p>
      ) : (
        anomalies.map((a) => (
          <div key={a.id} className="anomaly-item">
            <div className="anomaly-title">
              {a.publicNumber} — {a.description}
            </div>
            <div className="anomaly-desc">
              Время фиксации: <strong>{a.time}</strong> | Длительность инцидента:{' '}
              <strong>{a.durationMinutes} мин.</strong>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
