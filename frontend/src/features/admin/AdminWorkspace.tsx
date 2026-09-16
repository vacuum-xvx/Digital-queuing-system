import React, { useState, useEffect } from 'react';
import { QueuePolicyEditor } from './QueuePolicyEditor';
import { Branch } from '../../api/operator/types';
import * as operatorApi from '../../api/operator/operatorApi';
import * as adminApi from '../../api/admin/adminApi';
import './admin.css';

export const AdminWorkspace: React.FC = () => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    '11111111-1111-1111-1111-111111111111'
  );

  useEffect(() => {
    let active = true;
    operatorApi
      .listBranches()
      .then((items) => {
        if (!active) return;
        if (items.length > 0) {
          setBranches(items);
          if (!items.some((b) => b.id === selectedBranchId)) {
            setSelectedBranchId(items[0].id);
          }
        }
      })
      .catch(() => {
        // Fallback to default branch
      });

    return () => {
      active = false;
    };
  }, [selectedBranchId]);

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  return (
    <div className="admin-container">
      <header className="admin-header">
        <div className="admin-header-title">
          <h1>Панель администратора — Управление очередью</h1>
          <p>Настройка правил приоритета очереди (Sprint #2 Queue Policy)</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {branches.length > 1 && (
            <select
              className="operator-select"
              style={{ width: 'auto' }}
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              aria-label="Выбор отделения"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          {adminApi.isMockEnabled() ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="window-badge badge-open" style={{ padding: '6px 12px', fontSize: '12px' }}>
                ● Демо-режим активен
              </span>
              <button
                type="button"
                className="btn btn-retry"
                style={{ padding: '6px 12px', fontSize: '12px' }}
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.delete('mock');
                  window.location.href = url.toString();
                }}
              >
                К реальному серверу
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              style={{ minWidth: 'auto', padding: '8px 16px', fontSize: '13px' }}
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set('mock', '1');
                window.location.href = url.toString();
              }}
            >
              Включить демо-режим
            </button>
          )}
        </div>
      </header>

      <main>
        <QueuePolicyEditor
          branchId={selectedBranchId}
          branchName={selectedBranch?.name || 'Демо-отделение №1'}
        />
      </main>
    </div>
  );
};
