import React, { useState, useEffect } from 'react';
import { QueuePolicyEditor } from './QueuePolicyEditor';
import { Branch } from '../../api/operator/types';
import * as api from '../../api/admin/adminApi';
import './admin.css';

export const AdminWorkspace: React.FC = () => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.listBranches().then((items) => {
      if (!active) return;
      setBranches(items);
      setSelectedBranchId(items[0]?.id ?? '');
    }).catch(() => {
      if (active) setError('Не удалось загрузить список отделений');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [attempt]);

  return (
    <div className="admin-container">
      <header className="admin-header">
        <div className="admin-header-title">
          <h1>Настройки очереди</h1>
          <p>Приоритет предварительной записи и QR</p>
        </div>
        {branches.length > 0 && (
          <label>Отделение
            <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)}>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
        )}
      </header>
      <main>
        {loading ? <p role="status">Загрузка отделений...</p> : error ? (
          <div role="alert">{error} <button onClick={() => setAttempt((n) => n + 1)}>Повторить</button></div>
        ) : selectedBranchId ? (
          <QueuePolicyEditor key={selectedBranchId} branchId={selectedBranchId}
            branchName={branches.find((branch) => branch.id === selectedBranchId)?.name} />
        ) : <p>Нет доступных отделений</p>}
      </main>
    </div>
  );
};
