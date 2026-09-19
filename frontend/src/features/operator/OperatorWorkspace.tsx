import React, { useEffect, useRef, useState } from 'react';
import * as api from '../../api/operator/operatorApi';
import { changeWindowStatus, updateWindowServices } from '../../api/admin/adminApi';
import { AdminApiError } from '../../api/admin/types';
import { listServices, arriveAppointment } from '../../api/client/clientApi';
import { Branch, OperatorWindow, Ticket, OperatorApiError } from '../../api/operator/types';
import { Service } from '../../api/client/types';
import { getMe, User } from '../../api/authApi';
import { ActionControls } from './ActionControls';
import { TicketCard } from './TicketCard';
import {
  Clock,
  UserPlus,
  ArrowRightLeft,
  RotateCcw,
  CheckSquare,
  Square,
  AlertCircle,
  Users,
  Layers,
  ChevronDown
} from 'lucide-react';

export function OperatorWorkspace() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [windows, setWindows] = useState<OperatorWindow[]>([]);
  const [windowId, setWindowId] = useState('');
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [current, setCurrent] = useState<Ticket | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);

  // Side panel TV queue state
  const [tvQueue, setTvQueue] = useState<Array<{ publicNumber: string; source?: string; serviceName?: string }>>([]);

  // Elapsed timer for active service
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Redirect modal state
  const [showRedirectModal, setShowRedirectModal] = useState(false);
  const [redirectServiceId, setRedirectServiceId] = useState('');
  const [redirectWindowId, setRedirectWindowId] = useState('');

  const epoch = useRef(0);
  const busy = useRef(false);
  const liveKey = useRef<{ selection: string; key: string } | null>(null);

  useEffect(() => {
    getMe().then(setCurrentUser).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    api.listBranches().then(items => {
      if (!active) return;
      setBranches(items);
      const saved = localStorage.getItem('operator.branch');
      setBranchId(items.find(b => b.id === saved)?.id ?? items[0]?.id ?? '');
    }).catch(() => { if (active) setError('Не удалось загрузить отделения. Обновите страницу.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setWindowId(''); setWindows([]); setServices([]); setServiceId(''); setCurrent(null); setReady(false);
    if (!branchId) return;
    localStorage.setItem('operator.branch', branchId);
    Promise.all([api.listWindows(branchId), listServices(branchId)]).then(([items, catalog]) => {
      if (!active) return;
      setWindows(items); setServices(catalog);
      const saved = localStorage.getItem('operator.window:' + branchId);
      setWindowId(items.find(w => w.id === saved)?.id ?? items[0]?.id ?? '');
      setServiceId(catalog[0]?.id ?? '');
    }).catch(() => { if (active) setError('Не удалось загрузить окна. Проверьте сессию и обновите страницу.'); });
    return () => { active = false; };
  }, [branchId]);

  useEffect(() => {
    const generation = ++epoch.current;
    let timer: number;
    setCurrent(null); setReady(false);
    if (!windowId) return;
    localStorage.setItem('operator.window:' + branchId, windowId);

    async function poll() {
      try {
        const [ticket, items] = await Promise.all([api.getCurrentTicket(windowId), api.listWindows(branchId)]);
        if (epoch.current !== generation || busy.current) return;
        setCurrent(ticket); setWindows(items); setReady(true); setError('');

        // Also fetch real TV queue for side panel
        if (branchId) {
          try {
            const tvRes = await fetch(`/api/v1/branches/${encodeURIComponent(branchId)}/tv`);
            if (tvRes.ok) {
              const tvData = await tvRes.json();
              if (epoch.current === generation && tvData?.queue) {
                setTvQueue(tvData.queue);
              }
            }
          } catch {}
        }
      } catch {
        if (epoch.current === generation) {
          setReady(false);
          setError('Не удалось обновить окно. Проверьте соединение и сессию.');
        }
      } finally {
        if (epoch.current === generation) timer = window.setTimeout(poll, 2000);
      }
    }
    void poll();
    return () => { ++epoch.current; clearTimeout(timer); };
  }, [branchId, windowId, revision]);

  // Timer counter
  useEffect(() => {
    if (!current || (current.status !== 'CALLED' && current.status !== 'SERVING')) {
      setElapsedSeconds(0);
      return;
    }
    const startTime = current.serviceStartedAt
      ? new Date(current.serviceStartedAt).getTime()
      : current.calledAt
      ? new Date(current.calledAt).getTime()
      : Date.now();

    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      setElapsedSeconds(diff);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [current?.id, current?.status, current?.calledAt, current?.serviceStartedAt]);

  async function act(action: () => Promise<unknown>) {
    if (busy.current) return;
    busy.current = true; ++epoch.current; setPending(true); setError(''); setNotice('');
    try {
      await action();
    } catch (err) {
      const code = err instanceof OperatorApiError ? err.code : '';
      setNotice(
        code === 'NO_ELIGIBLE_TICKETS'
          ? 'Сейчас нет доступных талонов.'
          : 'Операция не выполнена. Состояние окна будет обновлено; проверьте сессию при повторной ошибке.'
      );
    } finally {
      busy.current = false;
      setPending(false);
      setRevision(n => n + 1);
    }
  }

  const selected = windows.find(w => w.id === windowId);

  // Переключение услуги окна (window_services). Набор не может стать пустым.
  // С миграции 000012 услугу можно отключить всегда — даже если окно уже
  // обслуживало по ней талоны; ветка 409 ниже оставлена как защитный fallback.
  async function toggleWindowService(serviceId: string) {
    if (!selected || busy.current) return;
    const currentIds = selected.services.map(s => s.id);
    const nextIds = currentIds.includes(serviceId)
      ? currentIds.filter(id => id !== serviceId)
      : [...currentIds, serviceId];
    if (nextIds.length === 0) {
      setNotice('У окна должна остаться доступной хотя бы одна услуга.');
      return;
    }
    busy.current = true; ++epoch.current; setPending(true); setError(''); setNotice('');
    try {
      const updated = await updateWindowServices(selected.id, nextIds);
      setWindows(prev => prev.map(w => (w.id === updated.id ? { ...w, services: updated.services } : w)));
      setNotice(`Окно № ${updated.number}: список услуг обновлён.`);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) {
        setNotice('Услугу нельзя отключить: в этом окне уже обслуживали талоны с такой услугой.');
      } else if (err instanceof AdminApiError && err.status === 404) {
        setNotice('Окно не найдено. Обновите страницу и попробуйте снова.');
      } else if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
        setError('Недостаточно прав или сессия истекла. Войдите заново и повторите попытку.');
      } else {
        setNotice('Не удалось сохранить список услуг окна. Проверьте соединение и попробуйте снова.');
      }
    } finally {
      busy.current = false;
      setPending(false);
      setRevision(n => n + 1);
    }
  }

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  async function callSpecificTicket(publicNum: string) {
    if (busy.current || !windowId) return;
    void act(async () => {
      if (publicNum.startsWith('A-')) {
        try {
          await arriveAppointment(publicNum);
        } catch {}
      }
      await api.callNext(windowId);
    });
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* 1. TOP WORKSTATION CARD */}
      <section className="bg-white rounded-3xl border border-[#D2D8E2] p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#003B73] text-white font-mono font-black text-2xl flex items-center justify-center shadow-md shrink-0">
              № {selected?.number ?? '—'}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-black text-lg text-slate-900 tracking-tight">
                                    {selected ? `Окно № ${selected.number}` : 'Рабочее место оператора'}
                </h1>
                {selected && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border ${
                      selected.status === 'OPEN'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-slate-200 text-slate-700 border-slate-300'
                    }`}
                  >
                    {selected.status === 'OPEN' ? 'СМЕНА АКТИВНА' : 'ОКНО ЗАКРЫТО'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Оператор:{' '}
                <strong className="text-slate-800">
                  {currentUser?.email ?? 'operator@pochta.local'}
                </strong>{' '}
                {selected && `· Отделение: ${branches.find(b => b.id === branchId)?.name || 'Почта России'}`}
              </p>
            </div>
          </div>

          {/* Branch and Window Selectors + Shift Toggle */}
          <div className="flex flex-wrap items-end justify-start gap-3 w-full">
            {/* Branch Selector */}
            <div className="flex flex-col shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 pl-1">Отделение</span>
              <select
                aria-label="Отделение"
                value={branchId}
                disabled={pending}
                onChange={e => {
                  if (e.target.value === branchId) return;
                  ++epoch.current;
                  setReady(false);
                  setCurrent(null);
                  setBranchId(e.target.value);
                }}
                className="px-3 h-12 rounded-xl border border-slate-300 text-sm font-medium bg-white text-slate-800 shadow-sm min-w-[200px] outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Window Buttons */}
            <div className="flex flex-col shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 pl-1">Окно</span>
              <div className="flex items-center gap-2 h-12">
              {windows.map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    if (w.id === windowId) return;
                    ++epoch.current;
                    setReady(false);
                    setCurrent(null);
                    setWindowId(w.id);
                  }}
                  className={`h-full px-3 rounded-xl border text-sm font-medium shadow-sm transition-all flex items-center justify-center gap-1.5 whitespace-nowrap overflow-visible shrink-0 ${
                    windowId === w.id
                      ? 'bg-[#003B73] text-white border-[#003B73] ring-2 ring-[#003B73]/20 shadow-[#003B73]/20'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-slate-400'
                  }`}
                >
                  Окно {w.number}
                  <span className={`w-2.5 h-2.5 rounded-full ${w.status === 'OPEN' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-slate-300'}`}></span>
                </button>
              ))}
              </div>
            </div>

            {/* Shift Open/Close Button */}
            {selected && (
              <div className="flex flex-col shrink-0">
                <span aria-hidden="true" className="text-[10px] font-bold uppercase tracking-wider mb-1 pl-1 invisible select-none">Смена</span>
                <div className="h-12 flex items-center">
                  <button
                    type="button"
                    disabled={pending || !ready}
                    onClick={() =>
                      void act(() =>
                        changeWindowStatus(windowId, selected.status === 'OPEN' ? 'CLOSED' : 'OPEN')
                      )
                    }
                    className={`h-full px-4 rounded-xl border shadow-sm text-sm font-semibold flex items-center justify-center whitespace-nowrap overflow-visible shrink-0 transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                      selected.status === 'OPEN'
                        ? 'text-red-700 border-red-200 bg-red-50 hover:bg-red-100 focus:ring-red-500'
                        : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 focus:ring-emerald-500'
                    }`}
                  >
                    {selected.status === 'OPEN' ? 'Закрыть окно' : 'Открыть окно'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Window Services List — чипы-переключатели услуг окна */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-500">Услуги окна:</span>
            {services.map(srv => {
              const isEnabled = selected?.services.some(ws => ws.id === srv.id) ?? false;
              return (
                <button
                  key={srv.id}
                  type="button"
                  aria-pressed={isEnabled}
                  disabled={pending || !selected}
                  title={
                    isEnabled
                      ? `Отключить услугу «${srv.name}» для этого окна`
                      : `Включить услугу «${srv.name}» для этого окна`
                  }
                  onClick={() => void toggleWindowService(srv.id)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition-all ${
                    isEnabled
                      ? 'bg-blue-50/70 border-blue-200 text-[#054FA6] hover:bg-blue-100'
                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'
                  } ${pending || !selected ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {isEnabled ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                  <span className={isEnabled ? '' : 'line-through'}>{srv.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center justify-between">
          <span>{error}</span>
          <a href="/operator/login" className="underline font-bold">Вход</a>
        </div>
      )}

      {notice && (
        <div role="status" className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-[#054FA6] text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* 2. MAIN WORK AREA (2 COLUMNS: 7 / 5) */}
      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: 7 cols - Active Client Card & Primary Controls */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-3xl border border-[#D2D8E2] p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-500 font-bold">
                  Текущий клиент у стойки Окна № {selected.number}
                </div>
                {current && (
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-800 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                    <Clock className="w-4 h-4 text-[#003B73]" />
                    <span>{formatTimer(elapsedSeconds)}</span>
                  </div>
                )}
              </div>

              {!ready ? (
                <div className="py-12 text-center text-slate-400 font-mono text-xs animate-pulse" role="status">
                  Обновляем окно…
                </div>
              ) : (
                <>
                  <TicketCard ticket={current} selectedWindow={selected} services={services} />

                  <div className="pt-2">
                    <ActionControls
                      currentTicket={current}
                      isPending={pending || !ready}
                      onCallNext={() =>
                        void act(async () => {
                          try {
                            await api.callNext(windowId);
                          } catch (err) {
                            if (err instanceof OperatorApiError && err.code === 'NO_ELIGIBLE_TICKETS' && tvQueue.length > 0) {
                              const nextApt = tvQueue.find(t => t.publicNumber.startsWith('A-'));
                              if (nextApt) {
                                try {
                                  await arriveAppointment(nextApt.publicNumber);
                                  await api.callNext(windowId);
                                  return;
                                } catch {}
                              }
                            }
                            throw err;
                          }
                        })
                      }
                      onStartService={() => current && void act(() => api.startService(current.id))}
                      onCompleteService={() => current && void act(() => api.completeService(current.id))}
                      onNoShow={() => current && void act(() => api.markNoShow(current.id))}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Secondary Service Operations Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Issue LIVE Ticket Card */}
              <div className="p-4 rounded-3xl bg-white border border-[#D2D8E2] shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
                  <UserPlus className="w-4 h-4 text-[#054FA6]" />
                  <span>Живая очередь</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Выдача талона клиенту без мобильного устройства
                </p>
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-slate-600">
                    Услуга
                    <select
                      value={serviceId}
                      disabled={pending}
                      onChange={e => setServiceId(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                    >
                      {services.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={pending || !serviceId}
                    onClick={() =>
                      void act(async () => {
                        const selection = branchId + ':' + serviceId;
                        if (liveKey.current?.selection !== selection) {
                          liveKey.current = { selection, key: crypto.randomUUID() };
                        }
                        const ticket = await api.createLiveTicket(branchId, serviceId, liveKey.current.key);
                        liveKey.current = null;
                        setNotice('Выдан талон ' + ticket.publicNumber);
                      })
                    }
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-blue-50 border border-[#054FA6] text-[#054FA6] hover:bg-blue-100 font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
                  >
                    Выдать LIVE-талон
                  </button>
                </div>
              </div>

              {/* Auxiliary Transfer / Return Card */}
              <div className="p-4 rounded-3xl bg-white border border-[#D2D8E2] shadow-sm space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
                    <ArrowRightLeft className="w-4 h-4 text-[#003B73]" />
                    <span>Перенаправление и возврат</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Возврат клиента в общую очередь или перевод к другому специалисту
                  </p>
                </div>
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    disabled={!current || pending}
                    onClick={() => {
                      if (!current) return;
                      void act(async () => {
                        await api.returnTicket(current.id);
                        setNotice(`Талон ${current.publicNumber} возвращен в очередь`);
                      });
                    }}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                    <span>Вернуть в очередь</span>
                  </button>
                  <button
                    type="button"
                    disabled={!current || pending}
                    onClick={() => {
                      setRedirectServiceId('');
                      setRedirectWindowId('');
                      setShowRedirectModal(true);
                    }}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500" />
                    <span>Перенаправить в другое окно</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: 5 cols - Queue Side Panel */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-[#D2D8E2] p-5 space-y-3 shadow-sm flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#003B73]" />
                  <span>Очередь отделения</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  {branches.find(b => b.id === branchId)?.name || 'Текущее отделение'}
                </p>
              </div>
              <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 text-[#054FA6] border border-blue-200">
                {tvQueue.length} в очереди
              </span>
            </div>

            {tvQueue.length > 0 ? (
              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {tvQueue.map((item, idx) => {
                  const isApt = item.source === 'APPOINTMENT' || item.publicNumber.startsWith('A-');
                  const isQr = item.source === 'QR' || item.publicNumber.startsWith('Q-');
                  return (
                    <div
                      key={item.publicNumber + '-' + idx}
                      className={`p-3 rounded-2xl border text-xs flex items-center justify-between transition-all ${
                        idx === 0
                          ? 'bg-blue-50/70 border-blue-200 ring-1 ring-blue-400'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-black text-slate-900 text-sm">
                          {item.publicNumber}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
                            isApt
                              ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                              : isQr
                              ? 'bg-sky-50 text-[#054FA6] border-sky-200'
                              : 'bg-amber-50 text-amber-900 border-amber-200'
                          }`}
                        >
                          {isApt ? 'Запись' : isQr ? 'QR-код' : 'Живая'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-slate-500">
                          {idx === 0 ? 'Следующий' : `Ожидает (#${idx + 1})`}
                        </span>
                        {selected?.status === 'OPEN' && !current && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => void callSpecificTicket(item.publicNumber)}
                            className="px-2 py-1 bg-[#003B73] hover:bg-[#054FA6] text-white text-[10px] font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50"
                          >
                            Вызвать
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 space-y-2 text-slate-400 flex-1 flex flex-col items-center justify-center">
                <Layers className="w-8 h-8 mx-auto stroke-1" />
                <p className="text-xs font-bold text-slate-600">Очередь свободна</p>
                <p className="text-[11px] text-slate-400 max-w-xs">
                  В данный момент нет ожидающих клиентов для выбранного профиля
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Redirect Modal */}
      {showRedirectModal && current && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  Перенаправление
                </span>
                <h3 className="text-base font-black text-slate-900">
                  Талон {current.publicNumber}
                </h3>
              </div>
              <span
                className={`text-[11px] px-2.5 py-1 rounded-lg font-mono font-bold border ${
                  current.source === 'APPOINTMENT'
                    ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                    : current.source === 'QR'
                    ? 'bg-sky-50 text-[#054FA6] border-sky-200'
                    : 'bg-amber-50 text-amber-900 border-amber-200'
                }`}
              >
                {current.source === 'APPOINTMENT'
                  ? 'Предварительная запись'
                  : current.source === 'QR'
                  ? 'QR-код'
                  : 'Живая очередь'}
              </span>
            </div>

            <p className="text-xs text-slate-500">
              Выберите целевое окно или услугу для перевода клиента. Талон будет направлен на обслуживание.
            </p>

            <div className="space-y-3">
              {/* Target Window */}
              <label className="block text-xs font-bold text-slate-700">
                Целевое окно
                <select
                  value={redirectWindowId}
                  onChange={e => setRedirectWindowId(e.target.value)}
                  className="mt-1 block w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 bg-white font-medium shadow-2xs"
                >
                  <option value="">Любое подходящее окно (общая очередь)</option>
                  {windows
                    .filter(w => w.id !== windowId)
                    .map(w => (
                      <option key={w.id} value={w.id}>
                        Окно № {w.number} · {w.status === 'OPEN' ? 'Смена открыта' : 'Закрыто'}
                      </option>
                    ))}
                </select>
              </label>

              {/* Service */}
              <label className="block text-xs font-bold text-slate-700">
                Услуга
                <select
                  value={redirectServiceId}
                  onChange={e => setRedirectServiceId(e.target.value)}
                  className="mt-1 block w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 bg-white font-medium shadow-2xs"
                >
                  <option value="">
                    Без изменения услуги ({services.find(s => s.id === current.serviceId)?.name || 'текущая'})
                  </option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowRedirectModal(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 hover:bg-slate-50 transition-colors"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRedirectModal(false);
                  const targetWin = windows.find(w => w.id === redirectWindowId);
                  void act(async () => {
                    await api.redirectTicket(
                      current.id,
                      redirectServiceId || undefined,
                      redirectWindowId || undefined
                    );
                    const targetText = targetWin ? `в Окно №${targetWin.number}` : 'в очередь';
                    setNotice(`Талон ${current.publicNumber} успешно перенаправлен ${targetText}`);
                  });
                }}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-[#003B73] hover:bg-[#054FA6] text-white shadow-sm transition-colors"
              >
                Перенаправить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
