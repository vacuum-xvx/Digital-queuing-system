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
import { BranchScheduleShiftManager } from './BranchScheduleShiftManager';
import { LiveQueueView } from './LiveQueueView';
import {
  Activity,
  Sliders,
  AlertTriangle,
  Users,
  QrCode,
  CheckCircle2,
  RefreshCw,
  Calendar,
  Tv,
  ArrowRight,
} from 'lucide-react';

type AdminTab = 'overview' | 'queue' | 'policy' | 'schedule' | 'anomalies' | 'users' | 'qr';

export const AdminWorkspace: React.FC = () => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Real backend overview data
  const [overview, setOverview] = useState<AdminBranchOverview | null>(null);

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
        const interval = activeTab === 'queue' ? 2500 : 5000;
        if (active) timer = window.setTimeout(loadOverview, interval);
      }
    }

    void loadOverview();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selectedBranchId, activeTab]);

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
            onClick={() => setActiveTab('queue')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'queue'
                ? 'bg-white text-[#003B73] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>Очередь (Live)</span>
            {(overview?.queue?.length ?? 0) > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-[#003B73] text-[10px] font-mono font-black">
                {overview?.queue?.length}
              </span>
            )}
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
            onClick={() => setActiveTab('schedule')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'schedule'
                ? 'bg-white text-[#003B73] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Режим работы и смена</span>
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
            onClick={() => setActiveTab('users')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'users'
                ? 'bg-white text-[#003B73] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Пользователи</span>
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
                {overview?.windowRecommendation && (
                  <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${overview.windowRecommendation.severity === 'critical' ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`} role="alert">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-sm">Рекомендация по нагрузке</div>
                        <div className="text-xs mt-1">{overview.windowRecommendation.reason}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="px-3 py-2 rounded-xl border border-current text-xs font-bold hover:bg-white/60"
                      onClick={async () => {
                        const closed = overview.windows.filter((window) => window.status === 'CLOSED').slice(0, overview.windowRecommendation!.recommendedCount);
                        for (const window of closed) await handleToggleWindow(window.id, window.status);
                      }}
                    >
                      Открыть рекомендованные ({overview.windowRecommendation.recommendedCount})
                    </button>
                  </div>
                )}
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

              {/* Quick Live Queue Preview Card */}
              <div className="bg-white rounded-3xl border border-[#D2D8E2] p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#003B73] flex items-center justify-center">
                      <Tv className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">
                        Оперативная очередь отделения
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Клиенты, ожидающие обслуживания прямо сейчас ({overview?.queue?.length ?? 0} чел.)
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('queue')}
                    className="px-3 py-1.5 rounded-xl bg-[#003B73] hover:bg-[#054FA6] text-white text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5"
                  >
                    <span>Открыть табло очереди</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {overview?.queue && overview.queue.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                    {overview.queue.slice(0, 6).map((item, idx) => {
                      const isApt = item.source === 'APPOINTMENT';
                      const isQr = item.source === 'QR';
                      return (
                        <div
                          key={item.id}
                          className="p-3 rounded-2xl border border-slate-200 bg-slate-50 text-center flex flex-col justify-between"
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                            <span>#{idx + 1}</span>
                            <span>{item.waitTimeMinutes}м</span>
                          </div>
                          <div className="text-xl font-black font-mono text-[#003B73] my-1">
                            {item.publicNumber}
                          </div>
                          <div className="text-[10px] text-slate-600 truncate font-semibold">
                            {item.serviceName}
                          </div>
                          <div className="mt-1">
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase ${
                                isApt
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : isQr
                                  ? 'bg-sky-100 text-[#054FA6]'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {isApt ? 'Запись' : isQr ? 'QR' : 'Живая'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-slate-400 font-mono">
                    Ожидающих клиентов в очереди нет
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: LIVE QUEUE (ТАБЛО ЗАЛА + ОПЕРАТИВНЫЙ РЕЕСТР) */}
          {activeTab === 'queue' && (
            <LiveQueueView
              windows={overview?.windows || []}
              queue={overview?.queue || []}
              branchName={branches.find((b) => b.id === selectedBranchId)?.name}
              onRefresh={async () => {
                if (selectedBranchId) {
                  try {
                    const next = await api.getOverview(selectedBranchId);
                    setOverview(next);
                  } catch {}
                }
              }}
            />
          )}

          {/* TAB 2: QUEUE POLICY */}
          {activeTab === 'policy' && (
            <QueuePolicyEditor
              key={selectedBranchId}
              branchId={selectedBranchId}
              branchName={branches.find((b) => b.id === selectedBranchId)?.name}
            />
          )}

          {/* TAB 3: SCHEDULE & SHIFT */}
          {activeTab === 'schedule' && (
            <BranchScheduleShiftManager
              branch={
                branches.find((b) => b.id === selectedBranchId) || {
                  id: selectedBranchId,
                  name: 'Отделение',
                  workHours: '08:00–20:00',
                }
              }
              overview={overview}
              onBranchUpdated={(updated) => {
                setBranches((prev) =>
                  prev.map((b) => (b.id === updated.id ? { ...b, workHours: updated.workHours } : b))
                );
              }}
              onRefreshOverview={async () => {
                if (selectedBranchId) {
                  try {
                    const next = await api.getOverview(selectedBranchId);
                    setOverview(next);
                  } catch {
                    // silent
                  }
                }
              }}
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

          {/* TAB 4: USERS (IAM) */}
          {activeTab === 'users' && <UsersManagement />}

          {/* TAB 5: QR CODE */}
          {activeTab === 'qr' && <BranchQR branchId={selectedBranchId} />}
        </main>
      ) : (
        <p className="text-center text-slate-500 py-12">Нет доступных отделений</p>
      )}
    </div>
  );
};
