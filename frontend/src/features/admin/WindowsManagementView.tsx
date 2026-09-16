import React from 'react';
import { AdminWindow } from '../../api/admin/types';

interface WindowsManagementViewProps {
  windows: AdminWindow[];
  onToggleStatus: (windowId: string, newStatus: 'OPEN' | 'CLOSED') => void;
}

export const WindowsManagementView: React.FC<WindowsManagementViewProps> = ({
  windows,
  onToggleStatus,
}) => {
  return (
    <div className="admin-panel-card">
      <h2>Управление окнами и перечнем услуг отделения</h2>
      <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>
        Руководитель отделения может открывать и закрывать окна, а также контролировать
        распределение доступных категорий услуг.
      </p>

      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Номер</th>
              <th>Оператор</th>
              <th>Статус</th>
              <th>Закрепленные услуги</th>
              <th>Обслужено талонов</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {windows.map((w) => {
              const isOpen = w.status === 'OPEN';
              return (
                <tr key={w.id}>
                  <td>
                    <strong>Окно №{w.number}</strong>
                  </td>
                  <td>{w.operatorName || '—'}</td>
                  <td>
                    <span className={`status-pill ${isOpen ? 'status-open' : 'status-closed'}`}>
                      {isOpen ? 'Открыто' : 'Закрыто'}
                    </span>
                  </td>
                  <td>
                    {w.services.map((s) => (
                      <span
                        key={s.id}
                        style={{
                          display: 'inline-block',
                          background: '#f1f5f9',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          marginRight: '6px',
                        }}
                      >
                        {s.name}
                      </span>
                    ))}
                  </td>
                  <td>{w.servedCount}</td>
                  <td>
                    <button
                      type="button"
                      className={`btn-sm ${isOpen ? 'btn-toggle-open' : 'btn-toggle-closed'}`}
                      onClick={() => onToggleStatus(w.id, isOpen ? 'CLOSED' : 'OPEN')}
                    >
                      {isOpen ? 'Закрыть окно' : 'Открыть окно'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
