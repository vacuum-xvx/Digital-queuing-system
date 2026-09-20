import React from 'react';
import { AdminWindow } from '../../api/admin/types';

interface WindowsManagementViewProps {
  windows: AdminWindow[];
  onToggleStatus: (windowId: string, newStatus: 'OPEN' | 'CLOSED') => void;
  onAddWindow?: () => void;
  onDeleteWindow?: (windowId: string, windowNumber: number) => void;
}

export const WindowsManagementView: React.FC<WindowsManagementViewProps> = ({
  windows,
  onToggleStatus,
  onAddWindow,
  onDeleteWindow,
}) => {
  return (
    <div className="admin-panel-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2>Управление окнами и перечнем услуг отделения</h2>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>
            Руководитель отделения может открывать и закрывать окна, а также контролировать
            распределение доступных категорий услуг.
          </p>
        </div>
        {onAddWindow && (
          <button
            type="button"
            className="btn-primary"
            onClick={onAddWindow}
            style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
          >
            + Добавить окно
          </button>
        )}
      </div>

      <div className="admin-table-container max-h-[500px] overflow-y-auto scrollbar-thin">
        <table className="admin-table">
          <thead className="sticky top-0 z-10">
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
            {windows.slice().sort((a, b) => a.number - b.number).map((w) => {
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
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className={`btn-sm ${isOpen ? 'btn-toggle-open' : 'btn-toggle-closed'}`}
                        onClick={() => onToggleStatus(w.id, isOpen ? 'CLOSED' : 'OPEN')}
                      >
                        {isOpen ? 'Закрыть окно' : 'Открыть окно'}
                      </button>
                      {onDeleteWindow && (
                        <button
                          type="button"
                          className="btn-sm btn-danger"
                          style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                          onClick={() => onDeleteWindow(w.id, w.number)}
                          title={`Удалить окно №${w.number}`}
                        >
                          Удалить
                        </button>
                      )}
                    </div>
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
