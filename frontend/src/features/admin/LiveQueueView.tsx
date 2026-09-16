import React from 'react';
import { AdminWindow, AdminQueueTicket } from '../../api/admin/types';

interface LiveQueueViewProps {
  windows: AdminWindow[];
  queue: AdminQueueTicket[];
}

export const LiveQueueView: React.FC<LiveQueueViewProps> = ({ windows, queue }) => {
  return (
    <div className="admin-section-grid">
      {/* Windows Live Status */}
      <section className="admin-panel-card" aria-label="Состояние окон">
        <h2>
          <span>Окна отделения</span>
          <span style={{ fontSize: '13px', color: '#64748b' }}>Всего: {windows.length}</span>
        </h2>
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Окно</th>
                <th>Статус</th>
                <th>Обслуживает</th>
                <th>Услуга</th>
                <th>Обслужено</th>
              </tr>
            </thead>
            <tbody>
              {windows.map((w) => (
                <tr key={w.id}>
                  <td>
                    <strong>Окно №{w.number}</strong>
                    {w.operatorName && (
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>{w.operatorName}</div>
                    )}
                  </td>
                  <td>
                    <span
                      className={`status-pill ${
                        w.status === 'OPEN' ? 'status-open' : 'status-closed'
                      }`}
                    >
                      {w.status === 'OPEN' ? 'Открыто' : 'Закрыто'}
                    </span>
                  </td>
                  <td>
                    {w.currentTicketNumber ? (
                      <strong style={{ color: '#0055a5', fontSize: '15px' }}>
                        {w.currentTicketNumber}
                      </strong>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>Свободно</span>
                    )}
                  </td>
                  <td>{w.currentService || '—'}</td>
                  <td>{w.servedCount} клиентов</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Waiting Queue List */}
      <section className="admin-panel-card" aria-label="Текущая очередь">
        <h2>
          <span>Очередь ожидания</span>
          <span style={{ fontSize: '13px', color: '#64748b' }}>В очереди: {queue.length}</span>
        </h2>
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Талон</th>
                <th>Источник</th>
                <th>Услуга</th>
                <th>Ожидание</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: '24px' }}>
                    В очереди нет ожидающих клиентов
                  </td>
                </tr>
              ) : (
                queue.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong style={{ fontSize: '15px', color: '#0f172a' }}>{t.publicNumber}</strong>
                    </td>
                    <td>
                      <span
                        className={`source-badge ${
                          t.source === 'QR'
                            ? 'source-qr'
                            : t.source === 'APPOINTMENT'
                            ? 'source-appointment'
                            : 'source-live'
                        }`}
                      >
                        {t.source === 'QR'
                          ? 'QR-код'
                          : t.source === 'APPOINTMENT'
                          ? 'Запись'
                          : 'Живая очередь'}
                      </span>
                    </td>
                    <td>{t.serviceName}</td>
                    <td>
                      <span
                        style={{
                          fontWeight: 600,
                          color: t.waitTimeMinutes > 10 ? '#dc2626' : '#475569',
                        }}
                      >
                        {t.waitTimeMinutes} мин.
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
