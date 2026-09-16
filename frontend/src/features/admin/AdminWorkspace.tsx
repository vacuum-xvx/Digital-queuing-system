import React, { useState, useEffect } from 'react';
import { AdminBranchOverview, PriorityRule } from '../../api/admin/types';
import * as api from '../../api/admin/adminApi';
import { KpiCards } from './KpiCards';
import { LiveQueueView } from './LiveQueueView';
import { WindowsManagementView } from './WindowsManagementView';
import { PrioritySettingsView } from './PrioritySettingsView';
import { AnomaliesView } from './AnomaliesView';
import './admin.css';

type AdminTab = 'monitor' | 'windows' | 'priorities' | 'anomalies';

export const AdminWorkspace: React.FC = () => {
  const [overview, setOverview] = useState<AdminBranchOverview | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('monitor');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadData = () => {
    setIsLoading(true);
    api
      .getAdminOverview()
      .then((data) => setOverview(data))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleWindow = async (windowId: string, newStatus: 'OPEN' | 'CLOSED') => {
    if (!overview) return;
    await api.toggleWindowStatus(windowId, newStatus);
    setOverview((prev) => {
      if (!prev) return prev;
      const updatedWindows = prev.windows.map((w) =>
        w.id === windowId ? { ...w, status: newStatus } : w
      );
      const activeCount = updatedWindows.filter((w) => w.status === 'OPEN').length;
      return {
        ...prev,
        windows: updatedWindows,
        metrics: {
          ...prev.metrics,
          activeWindowsCount: activeCount,
        },
      };
    });
  };

  const handleSavePriorities = async (rules: PriorityRule[]) => {
    if (!overview) return;
    const updated = await api.savePriorityRules(rules, overview.branchId);
    setOverview((prev) => (prev ? { ...prev, priorities: updated } : prev));
  };

  if (isLoading && !overview) {
    return (
      <div className="admin-container">
        <p style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>
          Загрузка панели руководителя...
        </p>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="admin-container">
        <p style={{ color: '#ef4444', textAlign: 'center', padding: '40px' }}>
          Не удалось загрузить данные мониторинга отделения.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-container">
      {/* Header */}
      <header className="admin-header">
        <div className="admin-header-title">
          <h1>Панель руководителя отделения</h1>
          <p>Цифровая очередь нового поколения — Оперативное управление и аналитика</p>
        </div>
        <div className="admin-branch-badge">{overview.branchName}</div>
      </header>

      {/* Top KPI Cards */}
      <KpiCards metrics={overview.metrics} />

      {/* Tabs Navigation */}
      <nav className="admin-tabs" aria-label="Разделы управления">
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'monitor' ? 'active' : ''}`}
          onClick={() => setActiveTab('monitor')}
        >
          📊 Мониторинг очереди
        </button>
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'windows' ? 'active' : ''}`}
          onClick={() => setActiveTab('windows')}
        >
          🪟 Окна и услуги ({overview.windows.length})
        </button>
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'priorities' ? 'active' : ''}`}
          onClick={() => setActiveTab('priorities')}
        >
          ⚙️ Правила приоритета
        </button>
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'anomalies' ? 'active' : ''}`}
          onClick={() => setActiveTab('anomalies')}
        >
          ⚠️ Отклонения ({overview.anomalies.length})
        </button>
      </nav>

      {/* Active Tab View */}
      <main>
        {activeTab === 'monitor' && (
          <LiveQueueView windows={overview.windows} queue={overview.queue} />
        )}

        {activeTab === 'windows' && (
          <WindowsManagementView
            windows={overview.windows}
            onToggleStatus={handleToggleWindow}
          />
        )}

        {activeTab === 'priorities' && (
          <PrioritySettingsView
            initialPriorities={overview.priorities}
            onSave={handleSavePriorities}
          />
        )}

        {activeTab === 'anomalies' && <AnomaliesView anomalies={overview.anomalies} />}
      </main>
    </div>
  );
};
