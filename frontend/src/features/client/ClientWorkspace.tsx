import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../../api/client/clientApi';
import { getMe } from '../../api/authApi';
import { Appointment, Branch, Service, Ticket, TicketStatus, QueuePosition, TicketETA } from '../../api/client/types';
import { CalendarClock, Ticket as TicketIcon, ListChecks, ChevronLeft, ChevronRight, MapPin, Clock, Check, Sparkles, Building2, AlertCircle } from 'lucide-react';
import './client.css';
import './kiosk.css';
import { formatMoscowDateTime, parseMoscowDatetimeLocal, toMoscowDatetimeLocal } from '../../utils/time';
import { PochtaEmblem } from '../../components/common/PochtaBrand';
import { BranchWorkloadCard } from './BranchWorkloadCard';

const POLL_INTERVAL_MS = 2000;
const terminalStatuses = new Set<TicketStatus>(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

const STORAGE_BRANCH_KEY = 'client_selected_branch_id';
const STORAGE_SERVICE_KEY = 'client_selected_service_id';
const STORAGE_TICKETS_KEY = 'client_active_ticket_ids';
const STORAGE_APPOINTMENTS_KEY = 'client.appointments';
const ANON_SCOPE = 'anon';

type ClientScreen = 'home' | 'booking' | 'walkin' | 'my';

function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localDateTimeValue(date: Date): string {
  return toMoscowDatetimeLocal(date);
}

function statusMessage(status: TicketStatus): string {
  switch (status) {
    case 'WAITING': return 'Вы в очереди';
    case 'CALLED': return 'Вас вызывают';
    case 'SERVING': return 'Идёт обслуживание';
    case 'COMPLETED': return 'Обслуживание завершено';
    case 'CANCELLED': return 'Запись отменена';
    case 'NO_SHOW': return 'Вы не подошли к окну';
    case 'SCHEDULED': return 'Запись подтверждена';
    default: return 'Статус обновляется';
  }
}

function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`cx-badge cx-badge-${status.toLowerCase()}`}>{statusMessage(status)}</span>;
}

function ETASparkline({ eta }: { eta: TicketETA }) {
  const samples = eta.distribution?.samples ?? [];
  if (samples.length === 0) return null;
  const min = Math.min(...samples);
  const range = Math.max(Math.max(...samples) - min, 1);
  const points = samples.map((value, index) => `${(index / Math.max(samples.length - 1, 1)) * 100},${28 - ((value - min) / range) * 24}`).join(' ');
  const distribution = eta.distribution!;
  return (
    <span className="flex items-center justify-center gap-2 mt-1" title={`Среднее ${distribution.avg} / Взвешенное ${distribution.weightedAvg} / Медиана ${distribution.median}`}>
      <svg viewBox="0 0 100 32" className="w-24 h-8 text-[#054FA6]" role="img" aria-label="Распределение времени обслуживания">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      {distribution.p90 - distribution.median > 0.5 * distribution.median && <span className="text-[10px] text-slate-600 border border-slate-300 rounded px-1.5 py-0.5">Повышенная дисперсия</span>}
    </span>
  );
}

function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="cx-steps" aria-label="Этапы оформления">
      {steps.map((label, index) => (
        <li
          key={label}
          className={`cx-step${index < current ? ' cx-step-done' : ''}${index === current ? ' cx-step-active' : ''}`}
          aria-current={index === current ? 'step' : undefined}
        >
          <span className="cx-step-dot">{index < current ? <Check size={13} strokeWidth={3} aria-hidden /> : index + 1}</span>
          <span className="cx-step-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

function BranchCard({ branch, selected, onSelect }: { branch: Branch; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={`cx-choice active:scale-[0.99] transition-all${selected ? ' cx-choice-selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2 w-full">
        <div className="flex-1 min-w-0">
          <span className="cx-choice-title text-sm sm:text-base">{branch.name}</span>
          {branch.address ? <span className="cx-choice-meta text-xs"><MapPin size={13} aria-hidden className="shrink-0" /> <span className="truncate">{branch.address}</span></span> : null}
          {branch.workHours ? <span className="cx-choice-meta text-xs"><Clock size={13} aria-hidden className="shrink-0" /> {branch.workHours}</span> : null}
        </div>
        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-all mt-0.5 ${selected ? 'bg-[#003B73] border-[#003B73] text-white' : 'border-slate-300 bg-white'}`}>
          {selected && <Check size={12} strokeWidth={3} />}
        </div>
      </div>
      <div className="pt-1 w-full">
        <BranchWorkloadCard branch={branch} compact />
      </div>
    </button>
  );
}

function ServiceCard({ service, selected, onSelect }: { service: Service; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={`cx-choice active:scale-[0.99] transition-all${selected ? ' cx-choice-selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-3 w-full">
        <div className="flex-1 min-w-0">
          <span className="cx-choice-title text-sm sm:text-base">{service.name}</span>
          <span className="cx-choice-meta text-xs">Обслуживание в порядке электронной очереди</span>
        </div>
        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${selected ? 'bg-[#003B73] border-[#003B73] text-white' : 'border-slate-300 bg-white'}`}>
          {selected && <Check size={12} strokeWidth={3} />}
        </div>
      </div>
    </button>
  );
}

function ticketsKeyFor(scope: string): string {
  return `${STORAGE_TICKETS_KEY}:${scope}`;
}

function appointmentsKeyFor(scope: string): string {
  return `${STORAGE_APPOINTMENTS_KEY}:${scope}`;
}

// Талоны храним строго по владельцу: ключ `client_active_ticket_ids:<userId|anon>`.
// Общий (legacy) ключ больше не читаем, чтобы чужие талоны не подхватывались.
function getSavedTicketIds(scope: string): string[] {
  try {
    const val = sessionStorage.getItem(ticketsKeyFor(scope));
    if (!val) return [];
    const parsed = JSON.parse(val);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

function addSavedTicketId(id: string, scope: string) {
  const ids = getSavedTicketIds(scope);
  if (!ids.includes(id)) {
    sessionStorage.setItem(ticketsKeyFor(scope), JSON.stringify([...ids, id]));
  }
}

function removeSavedTicketId(id: string, scope: string) {
  const ids = getSavedTicketIds(scope);
  const newIds = ids.filter(i => i !== id);
  if (newIds.length === 0) {
    sessionStorage.removeItem(ticketsKeyFor(scope));
  } else {
    sessionStorage.setItem(ticketsKeyFor(scope), JSON.stringify(newIds));
  }
}

try {
  sessionStorage.removeItem(STORAGE_TICKETS_KEY);
  sessionStorage.removeItem(STORAGE_APPOINTMENTS_KEY);
} catch {
  /* ignore legacy shared keys */
}

export function ClientWorkspace({ qrBranchId, kiosk = false, resetToken = 0 }: { qrBranchId?: string; kiosk?: boolean; resetToken?: number }) {
  const [screen, setScreen] = useState<ClientScreen>(qrBranchId ? 'walkin' : 'home');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const servicesLoadingBranchRef = useRef<string | null>(null);

  const [branchId, setBranchId] = useState(() => {
    if (qrBranchId) return qrBranchId;
    const v = sessionStorage.getItem(STORAGE_BRANCH_KEY);
    return v && v !== 'undefined' && v !== 'null' ? v : '';
  });
  const [serviceId, setServiceId] = useState(() => {
    const v = sessionStorage.getItem(STORAGE_SERVICE_KEY);
    return v && v !== 'undefined' && v !== 'null' ? v : '';
  });
  const [scheduledAtInput, setScheduledAtInput] = useState('');
  const [bookingStep, setBookingStep] = useState(0);
  const [walkinStep, setWalkinStep] = useState(qrBranchId ? 1 : 0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [kioskTicket, setKioskTicket] = useState<Ticket | null>(null);

  // Владелец талонов. Талоны храним и показываем строго по текущему пользователю,
  // чтобы новый пользователь не видел талоны, созданные другим.
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const ownerScope = currentUserId ?? ANON_SCOPE;
  // Держим актуальный scope доступным внутри колбэков без пересоздания pollAll.
  const ownerScopeRef = useRef(ownerScope);
  ownerScopeRef.current = ownerScope;
  const [appointments, setAppointments] = useState<Record<string, Appointment>>({});
  // Записи (appointments) тоже храним по владельцу, чтобы они не «переезжали» к другому пользователю.
  const appointmentsScopeRef = useRef<string | null>(null);
  useEffect(() => {
    appointmentsScopeRef.current = null;
    let loaded: Record<string, Appointment> = {};
    try { loaded = JSON.parse(sessionStorage.getItem(appointmentsKeyFor(ownerScope)) || '{}'); } catch { loaded = {}; }
    appointmentsScopeRef.current = ownerScope;
    setAppointments(loaded);
  }, [ownerScope]);
  useEffect(() => {
    if (appointmentsScopeRef.current !== ownerScope) return;
    try { sessionStorage.setItem(appointmentsKeyFor(ownerScope), JSON.stringify(appointments)); } catch { /* ignore */ }
  }, [appointments, ownerScope]);

  const [positions, setPositions] = useState<Record<string, QueuePosition>>({});
  const [etas, setEtas] = useState<Record<string, TicketETA>>({});
  const [pollError, setPollError] = useState<string | null>(null);
  const [arrivalAcknowledgedTicketIds, setArrivalAcknowledgedTicketIds] = useState<Set<string>>(new Set());

  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [arriving, setArriving] = useState(false);

  useEffect(() => {
    if (resetToken > 0) {
      setScreen('walkin');
      setWalkinStep(qrBranchId ? 1 : 0);
      setKioskTicket(null);
      setServiceId('');
      sessionStorage.removeItem(STORAGE_SERVICE_KEY);
      setError(null);
      if (qrBranchId) void fetchServices(qrBranchId);
    }
    // Kiosk idle reset intentionally restores the first walk-in step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  const pollTimer = useRef<number | null>(null);
  const pollGeneration = useRef(0);
  const createLock = useRef(false);
  const requestKey = useRef<{ identity: string; key: string } | null>(null);
  const keyFor = (identity: string) => {
    if (requestKey.current?.identity !== identity) requestKey.current = { identity, key: makeIdempotencyKey() };
    return requestKey.current.key;
  };

  useEffect(() => {
    let active = true;
    const refreshOwner = () => {
      getMe()
        .then((me) => { if (active) setCurrentUserId(me?.id ?? null); })
        .catch(() => { if (active) setCurrentUserId(null); });
    };
    refreshOwner();
    // Реагируем на вход/выход через шапку: «мои талоны» пересчитываются для нового владельца.
    const handleAuthChanged = () => refreshOwner();
    window.addEventListener('pochta:auth', handleAuthChanged);
    return () => {
      active = false;
      window.removeEventListener('pochta:auth', handleAuthChanged);
    };
  }, []);

  const friendlyError = (err: any, fallback: string) => {
    if (err?.name === 'AbortError') return null;
    return err instanceof Error ? err.message : fallback;
  };

  const arrivalStorageKey = (ticketId: string) => `client-arrived:${ticketId}`;
  const hasArrivalAcknowledgement = (ticketId: string): boolean => {
    try { return sessionStorage.getItem(arrivalStorageKey(ticketId)) === '1'; } catch { return false; }
  };
  const rememberArrival = (ticketId: string) => {
    try { sessionStorage.setItem(arrivalStorageKey(ticketId), '1'); } catch { /* ignore */ }
  };

  const loadBranches = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const blist = await api.listBranches();
      setBranches(blist);
      if (blist.length === 1 && !branchId) {
        setBranchId(blist[0].id);
      }
    } catch (err: any) {
      setError(friendlyError(err, 'Не удалось загрузить данные отделений'));
    } finally {
      setLoading(false);
    }
  }, [branchId, kiosk]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const fetchServices = useCallback(async (targetBranchId: string) => {
    if (!targetBranchId) {
      setServices([]);
      setServicesLoading(false);
      return;
    }
    servicesLoadingBranchRef.current = targetBranchId;
    setServicesLoading(true);
    try {
      const slist = await api.listServices(targetBranchId);
      if (servicesLoadingBranchRef.current === targetBranchId) {
        setServices(slist);
      }
    } catch (err: any) {
      if (servicesLoadingBranchRef.current === targetBranchId) {
        setError(friendlyError(err, 'Не удалось загрузить услуги'));
      }
    } finally {
      if (servicesLoadingBranchRef.current === targetBranchId) {
        setServicesLoading(false);
      }
    }
  }, [kiosk]);

  useEffect(() => {
    if (!branchId) {
      setServices([]);
      return;
    }
    fetchServices(branchId);
  }, [branchId, fetchServices]);

  useEffect(() => {
    if (branchId && ((screen === 'walkin' && walkinStep === 1) || (screen === 'booking' && bookingStep === 1))) {
      if (services.length === 0 && !servicesLoading && servicesLoadingBranchRef.current !== branchId) {
        fetchServices(branchId);
      }
    }
  }, [screen, walkinStep, bookingStep, branchId, services.length, servicesLoading, fetchServices]);

  useEffect(() => {
    if (kiosk) return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (!action) return;

    window.history.replaceState({}, '', window.location.pathname);

    if (action === 'booking') {
      resetBooking();
      setScreen('booking');
    } else if (action === 'walkin') {
      resetWalkin();
      setScreen('walkin');
    } else if (action === 'my') {
      setScreen('my');
    }
  }, []);

  const stopPolling = useCallback(() => {
    pollGeneration.current += 1;
    if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const pollAll = useCallback(() => {
    const generation = pollGeneration.current;
    const scope = ownerScopeRef.current;
    const ids = getSavedTicketIds(scope);

    if (ids.length === 0) {
      setTickets([]);
      setAppointments({});
      setPositions({});
      setEtas({});
      return;
    }

    const fetchedTickets: Ticket[] = [];
    const fetchedPositions: Record<string, QueuePosition> = {};
    const fetchedEtas: Record<string, TicketETA> = {};
    const failedIds = new Set<string>();

    Promise.allSettled(ids.map(async id => {
      try {
        const nextTicket = await api.getTicket(id);
        if (generation !== pollGeneration.current) return;

        fetchedTickets.push(nextTicket);
        if (nextTicket.source === 'APPOINTMENT' && nextTicket.status === 'SCHEDULED') {
          setAppointments(prev => ({ ...prev, [id]: { ticket: nextTicket, scheduledAt: nextTicket.queueEnteredAt } }));
        }

        if (nextTicket.source === 'APPOINTMENT' && nextTicket.status === 'SCHEDULED') {
          if (hasArrivalAcknowledgement(nextTicket.id)) {
            setArrivalAcknowledgedTicketIds(prev => {
              const next = new Set(prev);
              next.add(nextTicket.id);
              return next;
            });
          }
        }

        if (!terminalStatuses.has(nextTicket.status)) {
          const etaRequest = api.getTicketETA(nextTicket.id).then(eta => {
            if (generation === pollGeneration.current && eta.ticketId === id) fetchedEtas[id] = eta;
          }).catch(() => {});
          try {
            const pos = await api.getQueuePosition(nextTicket.id);
            if (generation !== pollGeneration.current) return;
            fetchedPositions[id] = pos;
          } catch {}
          await etaRequest;
        } else {
          removeSavedTicketId(id, scope);
        }
      } catch (err: any) {
        if (generation !== pollGeneration.current) return;
        if (err.status === 404 || err.message === 'NOT_FOUND') {
          removeSavedTicketId(id, scope);
        } else failedIds.add(id);
      }
    })).then(() => {
      if (generation !== pollGeneration.current) return;
      setTickets(prev => [...fetchedTickets, ...prev.filter(t => failedIds.has(t.id))].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setPositions(fetchedPositions);
      setEtas(fetchedEtas);
      setPollError(failedIds.size ? 'Не удалось обновить часть талонов. Повторяем подключение…' : null);
    }).catch(reason => {
      if (generation !== pollGeneration.current) return;
      setPollError(friendlyError(reason, 'Не удалось обновить талоны'));
    }).finally(() => {
      if (generation === pollGeneration.current && getSavedTicketIds(scope).length > 0) {
        pollTimer.current = window.setTimeout(pollAll, POLL_INTERVAL_MS);
      }
    });
  }, []);

  useEffect(() => {
    if (screen === 'my') {
      stopPolling();
      pollAll();
    }
    return () => {
      stopPolling();
    };
  }, [screen, pollAll, stopPolling]);

  // При смене пользователя (вход/выход/регистрация) перезагружаем талоны
  // строго для нового владельца, чтобы чужие талоны не оставались на экране.
  useEffect(() => {
    setTickets([]);
    setPositions({});
    setEtas({});
    stopPolling();
    pollAll();
  }, [ownerScope, pollAll, stopPolling]);

  const resetBooking = () => {
    setBookingStep(0);
    setServiceId('');
    sessionStorage.removeItem(STORAGE_SERVICE_KEY);
    setScheduledAtInput('');
    setError(null);
  };

  const resetWalkin = () => {
    setWalkinStep(qrBranchId ? 1 : 0);
    setServiceId('');
    sessionStorage.removeItem(STORAGE_SERVICE_KEY);
    setError(null);
    if (qrBranchId) {
      fetchServices(qrBranchId);
    }
  };

  const createQrTicket = async () => {
    if (createLock.current || !branches.some(b => b.id === branchId) || !services.some(s => s.id === serviceId)) return;
    createLock.current = true;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createQrTicket(branchId, serviceId, keyFor(`qr:${branchId}:${serviceId}`));
      requestKey.current = null;
      if (kiosk) {
        setKioskTicket(created);
      } else {
        addSavedTicketId(created.id, ownerScope);
        setTickets(prev => [created, ...prev]);
        setScreen('my');
      }
    } catch (reason: unknown) {
      setError(friendlyError(reason, 'Не удалось получить талон'));
    } finally {
      createLock.current = false;
      setCreating(false);
    }
  };

  const createAppointmentData = async () => {
    if (!branchId || !serviceId || !scheduledAtInput) return;
    if (createLock.current) return;
    let scheduledAt: Date;
    try { scheduledAt = new Date(parseMoscowDatetimeLocal(scheduledAtInput)); }
    catch { setError('Укажите корректное московское время'); return; }
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      setError('Выберите будущее время записи');
      return;
    }
    createLock.current = true;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createAppointment(
        branchId,
        serviceId,
        scheduledAt.toISOString(),
        keyFor(`appointment:${branchId}:${serviceId}:${scheduledAt.toISOString()}`)
      );
      requestKey.current = null;
      addSavedTicketId(created.ticket.id, ownerScope);
      setTickets(prev => [created.ticket, ...prev]);
      setAppointments(prev => ({ ...prev, [created.ticket.id]: created }));
      setScreen('my');
    } catch (reason: unknown) {
      setError(friendlyError(reason, 'Не удалось создать запись'));
    } finally {
      createLock.current = false;
      setCreating(false);
    }
  };

  const cancel = async (ticket: Ticket) => {
    if (cancelling || ticket.status !== 'SCHEDULED') return;
    setCancelling(true);
    try {
      const cancelled = await api.cancelAppointment(ticket.id);
      removeSavedTicketId(ticket.id, ownerScope);
      setTickets(prev => prev.map(t => t.id === ticket.id ? cancelled.ticket : t));
      setPositions(prev => { const next = { ...prev }; delete next[ticket.id]; return next; });
      setEtas(prev => { const next = { ...prev }; delete next[ticket.id]; return next; });
      stopPolling();
      pollAll();
    } catch (reason: unknown) {
      setError(friendlyError(reason, 'Не удалось отменить запись'));
    } finally {
      setCancelling(false);
    }
  };

  const arrive = async (ticket: Ticket) => {
    if (arriving || ticket.status !== 'SCHEDULED') return;
    setArriving(true);
    try {
      const arrived = await api.arriveAppointment(ticket.id);
      setArrivalAcknowledgedTicketIds(prev => {
        const next = new Set(prev);
        next.add(arrived.ticket.id);
        return next;
      });
      rememberArrival(arrived.ticket.id);
      stopPolling();
      pollAll();
    } catch (reason: unknown) {
      setError(friendlyError(reason, 'Не удалось подтвердить прибытие'));
    } finally {
      setArriving(false);
    }
  };

  const handleBranchSelect = (id: string) => {
    setServiceId('');
    sessionStorage.removeItem(STORAGE_SERVICE_KEY);
    sessionStorage.setItem(STORAGE_BRANCH_KEY, id);
    if (screen === 'booking') setBookingStep(1);
    if (screen === 'walkin') setWalkinStep(1);

    if (id === branchId) {
      fetchServices(id);
    } else {
      setServices([]);
      setBranchId(id);
    }
  };

  const handleRepeatTicket = (targetBranchId: string) => {
    setServiceId('');
    sessionStorage.removeItem(STORAGE_SERVICE_KEY);
    sessionStorage.setItem(STORAGE_BRANCH_KEY, targetBranchId);
    setWalkinStep(1);
    setScreen('walkin');

    if (targetBranchId === branchId) {
      fetchServices(targetBranchId);
    } else {
      setServices([]);
      setBranchId(targetBranchId);
    }
  };

  const handleServiceSelect = (id: string) => {
    setServiceId(id);
    sessionStorage.setItem(STORAGE_SERVICE_KEY, id);
    if (screen === 'booking') setBookingStep(2);
  };

  const resetKioskScreen = () => {
    if (!kiosk) return;
    if (kioskTicket) removeSavedTicketId(kioskTicket.id);
    setKioskTicket(null);
    setTickets([]);
    setServiceId('');
    sessionStorage.removeItem(STORAGE_SERVICE_KEY);
    setError(null);
    setScreen('walkin');
    setWalkinStep(1);
    if (qrBranchId) void fetchServices(qrBranchId);
  };

  useEffect(() => {
    if (!kiosk || !kioskTicket) return;
    const timer = window.setTimeout(resetKioskScreen, 30000);
    return () => window.clearTimeout(timer);
  }, [kiosk, kioskTicket]);

  const savedCount = tickets.length > 0
    ? tickets.filter(t => !terminalStatuses.has(t.status)).length
    : getSavedTicketIds(ownerScope).length;

  const renderHome = () => (
    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
      {/* Welcome Hero Banner */}
      <div className="bg-gradient-to-br from-[#003B73] to-[#054FA6] rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 space-y-1.5 sm:space-y-2">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <PochtaEmblem className="w-9 h-9 sm:w-10 sm:h-10 drop-shadow-sm shrink-0" bg="#FFFFFF" fg="#003B73" />
            <div>
              <div className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-blue-200 font-bold">
                Почта России · Сервис очередей
              </div>
              <h2 className="text-xl sm:text-3xl font-black tracking-tight">
                Добро пожаловать
              </h2>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-blue-100 max-w-md pt-1 leading-relaxed">
            Получите талон на обслуживание или выберите удобное время визита заранее, чтобы не ждать в зале.
          </p>
        </div>
      </div>

      {/* 3 Prominent Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* 1. Записаться онлайн */}
        <button
          type="button"
          onClick={() => { resetBooking(); setScreen('booking'); }}
          className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-white border border-[#D2D8E2] hover:border-[#054FA6] hover:shadow-md active:scale-[0.98] transition-all text-left group flex flex-row sm:flex-col items-center sm:items-start gap-3.5 sm:gap-0 cursor-pointer"
        >
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#054FA6] flex items-center justify-center sm:mb-4 group-hover:scale-105 transition-transform shadow-inner shrink-0">
            <CalendarClock size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm sm:text-base font-black text-slate-900 group-hover:text-[#054FA6] transition-colors mb-0.5 sm:mb-1">
              Записаться онлайн
            </h3>
            <p className="text-xs text-slate-500 leading-snug">
              Выберите время визита заранее, чтобы подойти к назначенному слоту
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-[#054FA6] shrink-0 sm:hidden transition-transform group-hover:translate-x-0.5" />
        </button>

        {/* 2. Взять талон */}
        <button
          type="button"
          onClick={() => { resetWalkin(); setScreen('walkin'); }}
          className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-white border border-[#D2D8E2] hover:border-[#003B73] hover:shadow-md active:scale-[0.98] transition-all text-left group flex flex-row sm:flex-col items-center sm:items-start gap-3.5 sm:gap-0 cursor-pointer"
        >
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-[#003B73] flex items-center justify-center sm:mb-4 group-hover:scale-105 transition-transform shadow-inner shrink-0">
            <TicketIcon size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm sm:text-base font-black text-slate-900 group-hover:text-[#003B73] transition-colors mb-0.5 sm:mb-1">
              Взять талон
            </h3>
            <p className="text-xs text-slate-500 leading-snug">
              Получите электронный номерок прямо сейчас, если вы уже в отделении
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-[#003B73] shrink-0 sm:hidden transition-transform group-hover:translate-x-0.5" />
        </button>

        {/* 3. Мои талоны */}
        <button
          type="button"
          onClick={() => setScreen('my')}
          className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-white border border-[#D2D8E2] hover:border-emerald-600 hover:shadow-md active:scale-[0.98] transition-all text-left group flex flex-row sm:flex-col items-center sm:items-start gap-3.5 sm:gap-0 relative cursor-pointer"
        >
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center sm:mb-4 group-hover:scale-105 transition-transform shadow-inner shrink-0">
            <ListChecks size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-slate-900 group-hover:text-emerald-700 transition-colors mb-0.5 sm:mb-1">
                Мои талоны
              </h3>
              {savedCount > 0 && (
                <span className="sm:hidden px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {savedCount}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 leading-snug">
              Текущие очереди, статус вызова к окну и история визита
            </p>
          </div>
          {savedCount > 0 && (
            <span className="hidden sm:inline absolute top-4 right-4 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              {savedCount} активных
            </span>
          )}
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-700 shrink-0 sm:hidden transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );

  const renderBooking = () => {
    const steps = ['Отделение', 'Услуга', 'Время'];

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="flex items-center justify-between border-b border-slate-200 pb-3">
          <button
            type="button"
            className="cx-back-btn"
            onClick={() => (bookingStep === 0 ? setScreen('home') : setBookingStep(b => b - 1))}
          >
            <ChevronLeft size={18} />
            <span>Назад</span>
          </button>
          <h2 className="text-lg font-black text-slate-900">Онлайн-запись</h2>
          <div className="w-12" />
        </header>

        <div className="space-y-4">
          <StepIndicator steps={steps} current={bookingStep} />
          {error && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
              {error}
            </div>
          )}

          {bookingStep === 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Выберите отделение</h3>
              {loading ? (
                <p className="text-xs text-slate-400 font-mono py-8 text-center animate-pulse">Загрузка отделений...</p>
              ) : branches.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p>Отделения не найдены или временно недоступны</p>
                  <button type="button" onClick={() => loadBranches()} className="mt-2 text-xs font-semibold text-[#003B73] underline">Повторить попытку</button>
                </div>
              ) : (
                branches.map(b => (
                  <BranchCard key={b.id} branch={b} selected={branchId === b.id} onSelect={() => handleBranchSelect(b.id)} />
                ))
              )}
            </div>
          )}

          {bookingStep === 1 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Выберите услугу</h3>
              {servicesLoading ? (
                <p className="text-xs text-slate-400 font-mono py-8 text-center animate-pulse">Загрузка услуг...</p>
              ) : services.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-xs text-slate-500">В этом отделении пока нет доступных услуг</p>
                  {branchId && (
                    <button
                      type="button"
                      onClick={() => fetchServices(branchId)}
                      className="text-xs text-[#054FA6] hover:underline font-medium"
                    >
                      Повторить загрузку
                    </button>
                  )}
                </div>
              ) : (
                services.map(s => (
                  <ServiceCard key={s.id} service={s} selected={serviceId === s.id} onSelect={() => handleServiceSelect(s.id)} />
                ))
              )}
            </div>
          )}

          {bookingStep === 2 && (
            <div className="space-y-4">
              <BranchWorkloadCard branch={branches.find(b => b.id === branchId)} />
              <div className="p-5 sm:p-6 rounded-3xl bg-white border border-[#D2D8E2] shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Укажите время визита</h3>
              <label className="block text-xs font-bold text-slate-700 space-y-1">
                <span>Дата и время (МСК)</span>
                <input
                  type="datetime-local"
                  value={scheduledAtInput}
                  min={localDateTimeValue(new Date(Date.now() + 60_000))}
                  onChange={e => setScheduledAtInput(e.target.value)}
                  disabled={creating}
                  aria-label="Дата и время (МСК)"
                  className="w-full px-3.5 py-3 text-base sm:text-xs font-mono rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#054FA6] min-h-[48px]"
                />
              </label>
              <button
                type="button"
                className="w-full min-h-[48px] py-3 bg-[#003B73] hover:bg-[#054FA6] active:bg-[#00274D] text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
                disabled={creating || !scheduledAtInput}
                onClick={createAppointmentData}
              >
                {creating ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Оформляем...</span>
                  </>
                ) : (
                  <span>Подтвердить запись</span>
                )}
              </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderWalkin = () => {
    const steps = ['Отделение', 'Услуга'];

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="flex items-center justify-between border-b border-slate-200 pb-3">
          {!kiosk ? (
            <button
              type="button"
              className="cx-back-btn"
              onClick={() => (walkinStep === 0 ? setScreen('home') : setWalkinStep(w => w - 1))}
            >
              <ChevronLeft size={18} />
              <span>Назад</span>
            </button>
          ) : <div className="w-12" />}
          <h2 className="text-lg font-black text-slate-900">Взять талон</h2>
          {!kiosk && getSavedTicketIds(ownerScope).length > 0 ? (
            <button
              type="button"
              onClick={() => setScreen('my')}
              className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-[#054FA6] text-xs font-bold hover:bg-blue-100 transition-colors"
            >
              Мои талоны
            </button>
          ) : (
            <div className="w-12" />
          )}
        </header>

        <div className="space-y-4">
          <StepIndicator steps={steps} current={walkinStep} />
          {error && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
              {error}
            </div>
          )}

          {walkinStep === 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Выберите отделение</h3>
              {loading ? (
                <p className="text-xs text-slate-400 font-mono py-8 text-center animate-pulse">Загрузка отделений...</p>
              ) : branches.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p>Отделения не найдены или временно недоступны</p>
                  <button type="button" onClick={() => loadBranches()} className="mt-2 text-xs font-semibold text-[#003B73] underline">Повторить попытку</button>
                </div>
              ) : (
                branches.map(b => (
                  <BranchCard key={b.id} branch={b} selected={branchId === b.id} onSelect={() => handleBranchSelect(b.id)} />
                ))
              )}
            </div>
          )}

          {walkinStep === 1 && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#003B73]" />
                <span>Отделение: <strong>{branches.find(b => b.id === branchId)?.name}</strong></span>
              </div>

              {!kiosk && <BranchWorkloadCard branch={branches.find(b => b.id === branchId)} />}

              <h3 className="text-sm font-bold text-slate-800">Выберите услугу</h3>
              {servicesLoading ? (
                <p className="text-xs text-slate-400 font-mono py-8 text-center animate-pulse">Загрузка услуг...</p>
              ) : services.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-xs text-slate-500">В этом отделении пока нет доступных услуг</p>
                  {branchId && (
                    <button
                      type="button"
                      onClick={() => fetchServices(branchId)}
                      className="text-xs text-[#054FA6] hover:underline font-medium"
                    >
                      Повторить загрузку
                    </button>
                  )}
                </div>
              ) : (
                <div className={kiosk ? 'kiosk-services-grid' : 'space-y-2.5'}>
                  {services.map(s => (
                    <ServiceCard key={s.id} service={s} selected={serviceId === s.id} onSelect={() => handleServiceSelect(s.id)} />
                  ))}
                </div>
              )}

              <div className="sticky bottom-3 sm:static z-20 pt-2 pb-1 bg-[#F8FAFC]/90 backdrop-blur-xs sm:bg-transparent">
                <button
                  type="button"
                  className="w-full min-h-[48px] py-3.5 bg-[#003B73] hover:bg-[#054FA6] active:bg-[#00274D] text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-lg active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  disabled={creating || !services.some(s => s.id === serviceId)}
                  onClick={createQrTicket}
                >
                  {creating ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      <span>Оформляем…</span>
                    </>
                  ) : (
                    <span>Получить талон</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderMy = () => {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="flex items-center justify-between border-b border-slate-200 pb-3">
          <button
            type="button"
            className="cx-back-btn"
            onClick={() => setScreen('home')}
          >
            <ChevronLeft size={18} />
            <span>Главная</span>
          </button>
          <h2 className="text-lg font-black text-slate-900">Мои талоны</h2>
          <div className="w-12" />
        </header>

        <div className="space-y-4">
          {error && <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">{error}</div>}
          {pollError && <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-[#054FA6] text-xs font-semibold">{pollError}</div>}

          {tickets.length === 0 ? (
            <div className="text-center py-16 px-4 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <TicketIcon size={32} />
              </div>
              <h3 className="text-base font-bold text-slate-800">У вас нет активных талонов</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Оформите талон или выберите предварительную запись на главной странице
              </p>
              <button
                type="button"
                onClick={() => setScreen('home')}
                className="px-5 py-2.5 bg-[#003B73] hover:bg-[#054FA6] text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-colors mt-2"
              >
                Оформить талон
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {tickets.map(ticket => {
                const position = positions[ticket.id];
                const appointment = appointments[ticket.id];
                const eta = etas[ticket.id];

                return (
                  <div key={ticket.id} className="cx-active-ticket">
                    {/* Branded Ticket Header */}
                    <div className="cx-ticket-header">
                      <span className="cx-ticket-num font-mono">{ticket.publicNumber}</span>
                      <StatusBadge status={ticket.status} />
                    </div>

                    {/* Details Body */}
                    <div className="cx-ticket-details">
                      <div className="cx-ticket-row">
                        <span>Услуга</span>
                        <strong>{services.find(s => s.id === ticket.serviceId)?.name || ticket.serviceId}</strong>
                      </div>
                      <div className="cx-ticket-row">
                        <span>Отделение</span>
                        <strong>{branches.find(b => b.id === ticket.branchId)?.name || 'Почта России'}</strong>
                      </div>
                      {appointment && (
                        <div className="cx-ticket-row">
                          <span>Время по записи</span>
                          <strong>{formatMoscowDateTime(appointment.scheduledAt)} МСК</strong>
                        </div>
                      )}
                      {ticket.status === 'CALLED' && ticket.window && (
                        <div className="cx-ticket-called-box">
                          Подойдите к окну <strong>№{ticket.window.number}</strong>
                        </div>
                      )}
                      {position?.ticketId === ticket.id && position.position !== null && position.position > 0 && (
                        <div className="cx-ticket-position">
                          <span className="cx-pos-label">Позиция в очереди</span>
                          <span className="cx-pos-val font-mono">{position.position}</span>
                        </div>
                      )}
                      {position?.reason === 'NOT_ELIGIBLE_YET' && (
                        <p className="text-xs text-slate-500 font-mono text-center">Время записи ещё не наступило</p>
                      )}
                      {position?.reason === 'NO_OPEN_COMPATIBLE_WINDOW' && (
                        <p className="text-xs text-slate-500 font-mono text-center">Ожидаем открытия подходящего окна</p>
                      )}
                      {!terminalStatuses.has(ticket.status) &&
                        eta?.ticketId === ticket.id &&
                        eta.ticketStatus === ticket.status &&
                        eta.reason === 'AVAILABLE' &&
                        eta.estimatedWaitSeconds !== null && (
                          <p className="cx-ticket-position font-mono text-xs font-bold text-[#054FA6] text-center block">
                            Ожидание примерно {Math.ceil(eta.estimatedWaitSeconds / 60)} мин
                            <ETASparkline eta={eta} />
                          </p>
                        )}
                      {!terminalStatuses.has(ticket.status) && (
                        <div className="pt-2 flex justify-center">
                          <BranchWorkloadCard
                            branch={branches.find(b => b.id === ticket.branchId)}
                            compact
                            overrideWaitMinutes={
                              eta?.ticketId === ticket.id && eta.estimatedWaitSeconds !== null
                                ? Math.ceil(eta.estimatedWaitSeconds / 60)
                                : undefined
                            }
                          />
                        </div>
                      )}
                    </div>

                    {/* Actions Footer */}
                    <div className="cx-ticket-actions">
                      {ticket.status === 'SCHEDULED' && ticket.source === 'APPOINTMENT' && (
                        arrivalAcknowledgedTicketIds.has(ticket.id) ? (
                          <div className="cx-ticket-alert cx-ticket-alert-success">
                            Ожидайте вызова, ваше прибытие отмечено
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="cx-btn cx-btn-primary cx-btn-block"
                            onClick={() => arrive(ticket)}
                            disabled={arriving}
                          >
                            {arriving ? 'Отмечаем...' : 'Я уже в отделении'}
                          </button>
                        )
                      )}
                      {ticket.status === 'SCHEDULED' && (
                        <button
                          type="button"
                          className="cx-btn cx-btn-danger cx-btn-block"
                          onClick={() => cancel(ticket)}
                          disabled={cancelling}
                        >
                          {cancelling ? 'Отменяем...' : 'Отменить запись'}
                        </button>
                      )}
                      {terminalStatuses.has(ticket.status) && (
                        <button
                          type="button"
                          className="cx-btn cx-btn-primary cx-btn-block"
                          onClick={() => handleRepeatTicket(ticket.branchId)}
                        >
                          Взять новый талон
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderKioskTicket = () => (
    <div className="cx-wizard kiosk-ticket-card mx-auto text-center" aria-live="polite">
      <div className="kiosk-ticket-card__top">
        <div className="kiosk-ticket-card__icon"><TicketIcon size={28} aria-hidden /></div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#054FA6]">Талон получен</p>
        <div className="cx-ticket-num kiosk-ticket-card__number font-mono">{kioskTicket?.publicNumber}</div>
        <p className="text-lg font-black text-slate-900">
          {services.find(service => service.id === kioskTicket?.serviceId)?.name || 'Выбранная услуга'}
        </p>
      </div>
      <div className="kiosk-ticket-card__message">
        <strong>Ожидайте вызова</strong>
        <span>Следите за номером талона на информационном табло.</span>
      </div>
      <button type="button" className="kiosk-ticket-card__button" onClick={resetKioskScreen}>
        На главный экран
      </button>
      <p className="mt-4 text-xs text-slate-400">Автоматический возврат к выбору услуги через 30 секунд</p>
    </div>
  );

  return (
    <div className="w-full">
      {kiosk && kioskTicket ? renderKioskTicket() : (
        <>
          {screen === 'booking' && renderBooking()}
          {screen === 'walkin' && renderWalkin()}
          {!kiosk && screen === 'my' && renderMy()}
          {!kiosk && screen === 'home' && renderHome()}
        </>
      )}
    </div>
  );
}
