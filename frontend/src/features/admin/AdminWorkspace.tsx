import React, { useState, useEffect, useCallback } from 'react';
import { QueuePolicyEditor } from './QueuePolicyEditor';
import { Branch } from '../../api/operator/types';
import * as api from '../../api/admin/adminApi';
import { AdminBranchOverview, AdminWindow } from '../../api/admin/types';
import { BranchQR } from './BranchQR';
import { UsersManagement } from './UsersManagement';
import { KpiCards } from './KpiCards';
import { PochtaEmblem } from '../../components/common/PochtaBrand';
import { formatMoscowDateTime } from '../../utils/time';
import {
  Activity,
  Sliders,
  AlertTriangle,
  FileText,
  Users,
  QrCode,
  CheckCircle2,
  RefreshCw,
  Search
} from 'lucide-react';

type AdminTab = 'overview' | 'policy' | 'anomalies' | 'audit' | 'users' | 'qr';

export const AdminWorkspace: React.FC = () => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Real backend overview data
  const [overview, setOverview] = useState<AdminBranchOverview | null>(null);

  // Ticket audit search
  const [auditTicketId, setAuditTicketId] = useState('');
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');

  // Initial branches fetch
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.listBranches()
      .then((items) => {
        if (!active) return;
        setBranches(items);
        setSelectedBranchId(items[0]?.id ?? '');
      })
      .catch(() => {
        if (active) setError('Не удалось загрузить список отделений');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Poll overview for the selected branch
  useEffect(() => {
    if (!selectedBranchId) return;
    let active = true;
    let timer: number;

    async function loadOverview() {
      try {
        const next = await api.getOverview(selectedBranchId);
        if (active) {
          setOverview(next);
        }
      } catch {
        // silent retry in background
      } finally {
        if (active) timer = window.setTimeout(loadOverview, 5000);
      }
    }

    void loadOverview();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selectedBranchId]);

  const handleToggleWindow = async (windowId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'OPEN' ? 'CLOSED' : 'OPEN';
    try {
      await api.changeWindowStatus(windowId, nextStatus as any);
      if (selectedBranchId) {
        const updated = await api.getOverview(selectedBranchId);
        setOverview(updated);
      }
    } catch {
      // ignore
    }
  };

  const handleSearchAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditTicketId.trim()) return;
    setAuditLoading(true);
    setAuditError('');
    try {
      const res = await fetch(`/api/v1/admin/tickets/${encodeURIComponent(auditTicketId.trim())}/events`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAuditEvents(data?.items || []);
    } catch {
      setAuditError('Не удалось найти события для указанного ID талона');
    } finally {
      setAuditLoading(false);
    }
  };

  const anomaliesList = overview?.anomalies || [];
  const noShowCount = anomaliesList.filter(a => a.type === 'NO_SHOW').length;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* 1. Header & Branch Context Card */}
      <section className="bg-white rounded-3xl border border-[#D2D8E2] p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3.5">
            <PochtaEmblem className="w-11 h-11 drop-shadow-sm shrink-0" bg="#003B73" fg="#FFFFFF" />
            <div>
              <div className="text-[11px] font-mono uppercase text-slate-500 font-bold tracking-wider">
                Мониторинг ОПС · Главпочтамт
              </div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                Панель управления начальника ОПС
              </h1>
            </div>
          </div>

          {branches.length > 0 && (
            <label className="flex flex-col text-xs font-bold text-slate-700">
              <span className="text-[10px] uppercase font-bold text-slate-400 font-mono mb-1">
                Отделение
              </span>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white text-slate-800 font-sans shadow-sm"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-white text-[#003B73] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Мониторинг & KPI</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('policy')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'policy'
                ? 'bg-white text-[#003B73] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Queue Policy</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('anomalies')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'anomalies'
                ? 'bg-white text-[#D92534] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span>Аномалии</span>
            {anomaliesList.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 text-[10px] flex items-center justify-center font-mono font-black">
                {anomaliesList.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'bg-white text-[#003B73] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Аудит талонов</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'users'
                ? 'bg-white text-[#003B73] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Пользователи (IAM)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'qr'
                ? 'bg-white text-[#003B73] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>QR отделения</span>
          </button>

          <a
            href="/grafana/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 bg-blue-50 text-[#003B73] hover:bg-blue-100 font-bold ml-auto border border-blue-200"
            title="Открыть дашборд Grafana со всеми метриками и логами"
          >
            <Activity className="w-4 h-4 text-blue-600" />
            <span>Grafana ↗</span>
          </a>
        </div>
      </section>

      {/* 2. Top KPI Cards (Live from Backend Overview) */}
      {overview?.metrics && (
        <KpiCards metrics={overview.metrics} noShowCount={noShowCount} />
      )}

      {/* 3. Tab Contents */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 font-mono text-xs animate-pulse" role="status">
          Загрузка отделений...
        </div>
      ) : error ? (
        <div role="alert" className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
          {error}
        </div>
      ) : selectedBranchId ? (
        <main className="space-y-4">
          {/* TAB 1: OVERVIEW (Windows Table & Branch QR) */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Windows Management Table */}
              <div className="bg-white rounded-3xl border border-[#D2D8E2] p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">
                      Управление окнами ОПС и распределение нагрузки
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Смена, статус окон и текущие клиенты
                    </p>
                  </div>
                  <span className="text-xs font-mono text-slate-500 font-bold">
                    {overview?.windows.length || 0} окон в отделении
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[11px]">
                      <tr>
                        <th className="p-3">Окно</th>
                        <th className="p-3">Статус</th>
                        <th className="p-3">Текущий талон</th>
                        <th className="p-3">Обслужено за смену</th>
                        <th className="p-3 text-right">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {overview?.windows.map((win) => (
                        <tr key={win.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-bold text-slate-900">Окно №{win.number}</td>
                          <td className="p-3">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                win.status === 'OPEN'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-slate-200 text-slate-700 border-slate-300'
                              }`}
                            >
                              {win.status === 'OPEN' ? 'В РАБОТЕ' : 'ЗАКРЫТО'}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-[#054FA6]">
                            {win.currentTicketNumber || '—'}
                          </td>
                          <td className="p-3 font-bold text-slate-700">
                            {win.servedCount} чел
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleToggleWindow(win.id, win.status)}
                              className="px-3 py-1 rounded-lg border text-[11px] font-bold hover:bg-slate-100 transition-colors"
                            >
                              {win.status === 'OPEN' ? 'Закрыть' : 'Открыть'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Branch QR card is also visible on overview for quick access */}
              <BranchQR branchId={selectedBranchId} />
            </div>
          )}

          {/* TAB 2: QUEUE POLICY */}
          {activeTab === 'policy' && (
            <QueuePolicyEditor
              key={selectedBranchId}
              branchId={selectedBranchId}
              branchName={branches.find((b) => b.id === selectedBranchId)?.name}
            />
          )}

          {/* TAB 3: ANOMALIES */}
          {activeTab === 'anomalies' && (
            <div className="bg-white rounded-3xl border border-[#D2D8E2] p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Реестр отклонений, задержек и неявок (NO_SHOW)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Автоматическая фиксация инцидентов и нарушений SLA
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-full border border-red-200">
                  {anomaliesList.length} событий
                </span>
              </div>

              <div className="space-y-2">
                {anomaliesList.length > 0 ? (
                  anomaliesList.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center font-bold font-mono shrink-0">
                          {item.type === 'NO_SHOW' ? 'N/S' : 'WARN'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 text-sm">
                              {item.publicNumber}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white border border-slate-300">
                              {item.type}
                            </span>
                          </div>
                          <p className="text-slate-600 mt-0.5">{item.description}</p>
                        </div>
                      </div>
                      <div className="text-right font-mono text-[11px] text-slate-500">
                        {formatMoscowDateTime(item.time)} МСК
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-xs text-slate-400 font-mono">
                    Отклонений и аномалий за текущую смену не зафиксировано
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: AUDIT */}
          {activeTab === 'audit' && (
            <div className="bg-white rounded-3xl border border-[#D2D8E2] p-5 sm:p-6 shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-bold text-sm text-slate-900">
                  Аудит жизненного цикла талонов (Audit Trail)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Неизменяемый журнал переходов состояний очереди
                </p>
              </div>

              <form onSubmit={handleSearchAudit} className="flex gap-2 max-w-lg">
                <input
                  type="text"
                  value={auditTicketId}
                  onChange={(e) => setAuditTicketId(e.target.value)}
                  placeholder="UUID талона (например 22222222-...)"
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                />
                <button
                  type="submit"
                  disabled={auditLoading}
                  className="px-4 py-2 bg-[#003B73] hover:bg-[#054FA6] text-white rounded-xl font-bold text-xs flex items-center gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Поиск</span>
                </button>
              </form>

              {auditError && (
                <div role="alert" className="p-3 rounded-xl bg-red-50 text-red-700 text-xs">
                  {auditError}
                </div>
              )}

              {auditEvents.length > 0 && (
                <div className="space-y-1.5 text-xs font-mono">
                  {auditEvents.map((evt) => (
                    <div
                      key={evt.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-[#054FA6]">[{evt.type}]</span>
                        <span className="ml-2 text-slate-700 font-sans">
                          {evt.fromStatus ? `${evt.fromStatus} → ` : ''}{evt.toStatus}
                        </span>
                        {evt.windowId && (
                          <span className="ml-2 text-slate-500">Окно: {evt.windowId.slice(0, 8)}…</span>
                        )}
                      </div>
                      <span className="text-slate-400 text-[11px]">
                        {formatMoscowDateTime(evt.createdAt)} МСК
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: USERS (IAM) */}
          {activeTab === 'users' && <UsersManagement />}

          {/* TAB 6: QR CODE */}
          {activeTab === 'qr' && <BranchQR branchId={selectedBranchId} />}
        </main>
      ) : (
        <p className="text-center text-slate-500 py-12">Нет доступных отделений</p>
      )}
    </div>
  );
};
