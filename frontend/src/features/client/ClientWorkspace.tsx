import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../../api/client/clientApi';
import { getMe } from '../../api/authApi';
import { Appointment, Branch, Service, Ticket, TicketStatus, TicketSource, QueuePosition, TicketETA } from '../../api/client/types';
import { CalendarClock, Ticket as TicketIcon, ListChecks, ChevronLeft, ChevronRight, MapPin, Clock, Check, Sparkles, Building2, AlertCircle, CheckCircle2, Zap, QrCode } from 'lucide-react';
import {
  SolarBox, SolarLetter, SolarTicket, SolarClock, SolarBell, SolarQr, SolarOperator,
  Icon3DParcel, Icon3DLetter, Icon3DTicket, Icon3DClock, Icon3DBell
} from '../../components/common/PostalIcons';
import './client.css';
import './kiosk.css';
import { formatMoscowDateTime, parseMoscowDatetimeLocal, toMoscowDatetimeLocal } from '../../utils/time';
import { PochtaEmblem } from '../../components/common/PochtaBrand';
import { BranchWorkloadCard } from './BranchWorkloadCard';
import { Appointment24hPicker } from './Appointment24hPicker';
import { announceTicketCall } from '../../utils/postalVoice';
import { BranchMapModal } from './map/BranchMapModal';
import { MOSCOW_BRANCHES } from './map/branchLocations';
import { ArrivalSheet } from './arrival/ArrivalSheet';
import { LiveTicketBanner } from './ticket/LiveTicketBanner';
import { ClientProfileModal } from './profile/ClientProfileModal';
import { BranchFeedbackModal } from './feedback/BranchFeedbackModal';
import { PrivacyPolicyModal } from './legal/PrivacyPolicyModal';
import { MobileTabBar } from './navigation/MobileTabBar';
import { downloadICSFile, getGoogleCalendarUrl, getYandexCalendarUrl } from './calendar/calendarUtils';
import { Map, ShieldCheck, Star, Award, Compass, Calendar } from 'lucide-react';

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

function statusMessage(status: TicketStatus, source?: TicketSource): string {
  switch (status) {
    case 'WAITING': return 'Вы в очереди';
    case 'CALLED': return 'Вас вызывают';
    case 'SERVING': return 'Идёт обслуживание';
    case 'COMPLETED': return 'Обслуживание завершено';
    case 'CANCELLED': return source === 'APPOINTMENT' ? 'Запись отменена' : 'Талон отменён';
    case 'NO_SHOW': return 'Вы не подошли к окну';
    case 'SCHEDULED': return 'Запись подтверждена';
    default: return 'Статус обновляется';
  }
}

function friendlyError(error: unknown, fallback: string): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    if (error.message.includes('NO_OPEN_WINDOW')) return 'Нет свободных или открытых окон для выбранной услуги';
    if (error.message.includes('INVALID_TIME')) return 'Выбранное время уже недоступно. Выберите другое время.';
    if (error.message.includes('PAST_TIME')) return 'Нельзя записаться на прошедшее время';
    return error.message;
  }
  return fallback;
}

function StatusBadge({ status, source }: { status: TicketStatus; source?: TicketSource }) {
  return <span className={`cx-badge cx-badge-${status.toLowerCase()}`}>{statusMessage(status, source)}</span>;
}

function getBezierPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function ETASparkline({ eta }: { eta: TicketETA }) {
  const distribution = eta.distribution;
  const estimatedSeconds = eta.estimatedWaitSeconds ?? eta.weightedWaitSeconds ?? eta.medianSeconds ?? 0;
  const historySamples = distribution?.samples ?? [];
  // Новые/малозагруженные отделения могут не иметь истории обслуживания.
  // В этом случае не убираем график, а показываем короткий оценочный диапазон.
  const samples = historySamples.length > 0
    ? historySamples
    : [Math.max(0, estimatedSeconds * 0.85), estimatedSeconds, estimatedSeconds * 1.15];
  const min = Math.min(...samples);
  const range = Math.max(Math.max(...samples) - min, 1);
  const pts = samples.map((value, index) => ({
    x: (index / Math.max(samples.length - 1, 1)) * 100,
    y: 28 - ((value - min) / range) * 24,
  }));
  const pathD = getBezierPath(pts);
  return (
    <span
      className="cx-eta-chart"
      title={distribution
        ? `Среднее ${distribution.avg}с / Взвешенное ${distribution.weightedAvg}с / Медиана ${distribution.median}с`
        : 'Оценочный диапазон ожидания: история обслуживания пока недоступна'}
    >
      <svg viewBox="0 0 100 32" className="w-24 h-8 text-[#0055A5] overflow-visible" role="img" aria-label="Распределение времени обслуживания">
        <path d={pathD} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {distribution && distribution.p90 - distribution.median > 0.5 * distribution.median && (
        <span className="cx-eta-load text-[10px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
          Повышенная нагрузка
        </span>
      )}
    </span>
  );
}

function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      role="alert"
      className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center justify-between gap-2 shadow-sm animate-fade-in"
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
        <span className="cx-message-text">{message}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-red-400 hover:text-red-700 p-1 rounded-lg hover:bg-red-100 transition-colors shrink-0 leading-none font-bold"
        aria-label="Закрыть ошибку"
      >
        ✕
      </button>
    </div>
  );
}

function NoticeBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      role="status"
      className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-2 shadow-sm animate-fade-in"
    >
      <div className="flex items-center gap-2 min-w-0">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-emerald-500 hover:text-emerald-800 p-1 rounded-lg hover:bg-emerald-100 transition-colors shrink-0 leading-none font-bold"
        aria-label="Закрыть уведомление"
      >
        ✕
      </button>
    </div>
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
          {branch.address ? <span className="cx-choice-meta text-xs"><MapPin size={13} aria-hidden className="shrink-0" /> <span className="cx-message-text">{branch.address}</span></span> : null}
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

function getServiceIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('посыл') || lower.includes('ems') || lower.includes('отправк') || lower.includes('груз')) {
    return <SolarBox size={22} className="text-[#1A34E8]" />;
  }
  if (lower.includes('письм') || lower.includes('открыт') || lower.includes('корреспонд') || lower.includes('газет')) {
    return <SolarLetter size={22} className="text-[#1A34E8]" />;
  }
  if (lower.includes('перевод') || lower.includes('платеж') || lower.includes('пенси') || lower.includes('выплат')) {
    return <SolarTicket size={22} className="text-[#FF9C00]" />;
  }
  return <SolarTicket size={22} className="text-[#1A34E8]" />;
}

function ServiceCard({ service, selected, onSelect }: { service: Service; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={`cx-choice active:scale-[0.99] transition-all flex flex-row items-center gap-3.5${selected ? ' cx-choice-selected border-[#1A34E8] bg-[#F0F4FF]/50' : 'hover:border-[#1A34E8]/50'}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-[#1A34E8]/10' : 'bg-slate-100'}`}>
        {getServiceIcon(service.name)}
      </div>
      <div className="flex items-center justify-between gap-3 w-full min-w-0">
        <div className="flex-1 min-w-0 text-left">
          <span className="cx-choice-title text-sm sm:text-base font-bold block text-slate-900">{service.name}</span>
          <span className="cx-choice-meta text-xs text-slate-500">Обслуживание в порядке электронной очереди</span>
        </div>
        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${selected ? 'bg-[#1A34E8] border-[#1A34E8] text-white' : 'border-slate-300 bg-white'}`}>
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
    const urlServiceId = new URLSearchParams(window.location.search).get('serviceId');
    if (urlServiceId) return urlServiceId;
    const v = sessionStorage.getItem(STORAGE_SERVICE_KEY);
    return v && v !== 'undefined' && v !== 'null' ? v : '';
  });
  const [scheduledAtInput, setScheduledAtInput] = useState('');
  const [bookingStep, setBookingStep] = useState(0);
  const [walkinStep, setWalkinStep] = useState(qrBranchId ? 1 : 0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [notice]);

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
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [arrivalAcknowledgedTicketIds, setArrivalAcknowledgedTicketIds] = useState<Set<string>>(new Set());

  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [arriving, setArriving] = useState(false);

  // Modern Feature Modals State
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isArrivalOpen, setIsArrivalOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [feedbackTicket, setFeedbackTicket] = useState<Ticket | null>(null);

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
        const urlParams = new URLSearchParams(window.location.search);
        const urlServiceId = urlParams.get('serviceId');
        const urlServiceCode = urlParams.get('service');
        if (urlServiceId && slist.some(s => s.id === urlServiceId)) {
          setServiceId(urlServiceId);
        } else if (urlServiceCode) {
          const found = slist.find(s => s.code?.toUpperCase() === urlServiceCode.toUpperCase());
          if (found) setServiceId(found.id);
        }
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
      setTicketsLoading(false);
      setPollError(null);
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
      if (generation === pollGeneration.current) setTicketsLoading(false);
      if (generation === pollGeneration.current && getSavedTicketIds(scope).length > 0) {
        pollTimer.current = window.setTimeout(pollAll, POLL_INTERVAL_MS);
      }
    });
  }, []);

  useEffect(() => {
    if (screen === 'my') {
      stopPolling();
      setTicketsLoading(true);
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

      const finalTicket = created.ticket;

      addSavedTicketId(finalTicket.id, ownerScope);
      setTickets(prev => [finalTicket, ...prev]);
      setAppointments(prev => ({ ...prev, [finalTicket.id]: created }));
      setScreen('my');
    } catch (reason: unknown) {
      setError(friendlyError(reason, 'Не удалось создать запись'));
    } finally {
      createLock.current = false;
      setCreating(false);
    }
  };

  const cancel = async (ticket: Ticket) => {
    if (cancelling || (ticket.status !== 'SCHEDULED' && ticket.status !== 'WAITING')) return;
    const isAppointment = ticket.source === 'APPOINTMENT' && ticket.status === 'SCHEDULED';
    const confirmMessage = isAppointment
      ? 'Вы уверены, что хотите отменить предварительную запись?'
      : 'Вы уверены, что хотите отказаться от талона и покинуть очередь?';
    if (!window.confirm(confirmMessage)) return;

    setCancelling(true);
    try {
      let cancelledTicket: Ticket;
      if (isAppointment) {
        const res = await api.cancelAppointment(ticket.id);
        cancelledTicket = res.ticket;
      } else {
        cancelledTicket = await api.cancelTicket(ticket.id);
      }
      removeSavedTicketId(ticket.id, ownerScope);
      setTickets(prev => prev.map(t => t.id === ticket.id ? cancelledTicket : t));
      setPositions(prev => { const next = { ...prev }; delete next[ticket.id]; return next; });
      setEtas(prev => { const next = { ...prev }; delete next[ticket.id]; return next; });
      stopPolling();
      pollAll();
    } catch (reason: unknown) {
      setError(friendlyError(reason, isAppointment ? 'Не удалось отменить запись' : 'Не удалось отказаться от талона'));
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

  const handleSelectBranchFromMap = (targetId: string) => {
    const realBranch = branches.find(b => b.id === targetId);
    if (realBranch) {
      handleBranchSelect(realBranch.id);
    } else if (branches.length > 0) {
      handleBranchSelect(branches[0].id);
    }
  };

  const handleArrivalTicket = async (chosenServiceId: string) => {
    const targetBranchId = branchId || branches[0]?.id;
    if (!targetBranchId) return;
    try {
      setCreating(true);
      const created = await api.createQrTicket(
        targetBranchId,
        chosenServiceId,
        keyFor(`arrival:${targetBranchId}:${chosenServiceId}:${Date.now()}`)
      );
      addSavedTicketId(created.id, ownerScope);
      setTickets(prev => [created, ...prev]);
      setScreen('my');
    } catch (err: unknown) {
      setError(friendlyError(err, 'Не удалось взять талон'));
    } finally {
      setCreating(false);
    }
  };

  const resetKioskScreen = () => {
    if (!kiosk) return;
    if (kioskTicket) removeSavedTicketId(kioskTicket.id, ownerScope);
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

  const renderHome = () => {
    const activeBannerTicket = tickets.find(t => t.status === 'CALLED')
      || tickets.find(t => t.status === 'WAITING')
      || tickets.find(t => t.status === 'SERVING');

    return (
      <div className="w-full space-y-5 pb-20 sm:pb-8">
        {/* Dynamic Live Ticket Banner when client has active waiting or called ticket */}
        {activeBannerTicket && (
          <LiveTicketBanner
            ticket={activeBannerTicket}
            serviceName={services.find(s => s.id === activeBannerTicket.serviceId)?.name}
            branchName={branches.find(b => b.id === activeBannerTicket.branchId)?.name}
            position={positions[activeBannerTicket.id]}
            eta={etas[activeBannerTicket.id]}
            onOpenDetails={() => setScreen('my')}
            onCancelTicket={activeBannerTicket.status === 'WAITING' ? () => cancel(activeBannerTicket) : undefined}
          />
        )}

        {/* Clean Flat Header & Quick Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0B3558]">
              Электронная очередь
            </h1>
            <p className="text-xs sm:text-sm text-[#476788] mt-0.5">
              Цифровой сервис Почты России нового поколения
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMapOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#D4E0ED] hover:border-[#0055A5] text-[#0B3558] hover:text-[#0055A5] text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <Map size={15} className="text-[#0055A5] stroke-[1.75]" />
              <span>Где быстрее (Карта)</span>
            </button>
            <button
              type="button"
              onClick={() => setIsArrivalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 hover:border-emerald-600 text-emerald-800 text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <MapPin size={15} className="text-emerald-600 stroke-[1.75]" />
              <span>Я на почте</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
            </button>
            <button
              type="button"
              onClick={() => setIsProfileOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 hover:border-amber-400 text-amber-900 text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <Star size={15} className="text-amber-500 fill-amber-500 stroke-[1.75]" />
              <span>Карма 4.97 ★</span>
            </button>
            <button
              type="button"
              onClick={() => setIsFeedbackOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#D4E0ED] hover:border-[#0055A5] text-[#0B3558] text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <span>Отзывы</span>
            </button>
          </div>
        </div>

        {/* Smart Queue Optimization Banner («Где быстрее») */}
        <div className="p-4 sm:p-4.5 rounded-2xl bg-[#F0F5FA] border border-[#D4E0ED] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-[0_2px_8px_rgba(11,53,88,0.03)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0055A5] text-white flex items-center justify-center shrink-0 shadow-sm">
              <Zap size={20} className="stroke-[2]" />
            </div>
            <div>
              <span className="font-bold text-[#0B3558] text-sm block sm:inline">
                В отделении на ул. Покровка вы освободитесь на 31 минуту раньше!
              </span>
              <span className="text-[#476788] sm:ml-2 text-xs block sm:inline">
                (Очередь 2 чел. • Идти 7 мин)
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsMapOpen(true)}
            className="px-4 py-2 rounded-xl bg-white border border-[#D4E0ED] hover:border-[#0055A5] text-[#0055A5] font-bold text-xs whitespace-nowrap shadow-xs transition-all cursor-pointer self-start sm:self-auto"
          >
            Поехать туда →
          </button>
        </div>

        {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
        {notice && <NoticeBanner message={notice} onClose={() => setNotice(null)} />}

        {/* 3 Primary Flat Action Cards (Flat Design, NO 3D) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {/* 1. Взять талон (Сейчас) */}
          <button
            type="button"
            onClick={() => { resetWalkin(); setScreen('walkin'); }}
            className="p-5 sm:p-6 rounded-2xl bg-white border border-[#D4E0ED] hover:border-[#0055A5] hover:shadow-[0_8px_24px_rgba(11,53,88,0.08)] active:scale-[0.99] transition-all text-left flex flex-col justify-between cursor-pointer group relative min-h-[170px]"
          >
            <div>
              <div className="flex items-start justify-between w-full mb-3.5">
                <div className="w-12 h-12 rounded-xl bg-[#EDF4FC] border border-[#D4E0ED] flex items-center justify-center text-[#0055A5] group-hover:bg-[#0055A5] group-hover:text-white transition-all">
                  <TicketIcon size={24} className="stroke-[1.75]" />
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-[#0055A5] border border-blue-200">
                  Сейчас
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-[#0B3558] group-hover:text-[#0055A5] transition-colors">
                Взять талон
              </h3>
              <p className="text-xs text-[#476788] mt-1.5 leading-relaxed">
                Получите виртуальный номерок прямо сейчас без очереди к сенсорному терминалу
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#F0F5FA] flex items-center justify-between text-xs font-bold text-[#0055A5]">
              <span>Получить талон</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </button>

          {/* 2. Записаться (Ко времени) */}
          <button
            type="button"
            onClick={() => { resetBooking(); setScreen('booking'); }}
            className="p-5 sm:p-6 rounded-2xl bg-white border border-[#D4E0ED] hover:border-[#0055A5] hover:shadow-[0_8px_24px_rgba(11,53,88,0.08)] active:scale-[0.99] transition-all text-left flex flex-col justify-between cursor-pointer group relative min-h-[170px]"
          >
            <div>
              <div className="flex items-start justify-between w-full mb-3.5">
                <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 group-hover:bg-purple-700 group-hover:text-white transition-all">
                  <Calendar size={24} className="stroke-[1.75]" />
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  Запись
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-[#0B3558] group-hover:text-[#0055A5] transition-colors">
                Записаться
              </h3>
              <p className="text-xs text-[#476788] mt-1.5 leading-relaxed">
                Выберите услугу, удобный день и 15-минутный слот обслуживания заранее
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#F0F5FA] flex items-center justify-between text-xs font-bold text-purple-700">
              <span>Выбрать время</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </button>

          {/* 3. Мои талоны */}
          <button
            type="button"
            onClick={() => setScreen('my')}
            className="p-5 sm:p-6 rounded-2xl bg-white border border-[#D4E0ED] hover:border-emerald-600 hover:shadow-[0_8px_24px_rgba(11,53,88,0.08)] active:scale-[0.99] transition-all text-left flex flex-col justify-between cursor-pointer group relative min-h-[170px]"
          >
            <div>
              <div className="flex items-start justify-between w-full mb-3.5">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                  <QrCode size={24} className="stroke-[1.75]" />
                </div>
                {savedCount > 0 ? (
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    {savedCount} активных
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    История
                  </span>
                )}
              </div>
              <h3 className="text-base sm:text-lg font-bold text-[#0B3558] group-hover:text-emerald-700 transition-colors">
                Мои талоны
              </h3>
              <p className="text-xs text-[#476788] mt-1.5 leading-relaxed">
                Штрихкод, статус очереди, вызов к окну оператора и история визитов
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#F0F5FA] flex items-center justify-between text-xs font-bold text-emerald-700">
              <span>Смотреть талоны</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </button>
        </div>

        {/* Selected Branch Overview & Live Workload Profile */}
        {(branches.find(b => b.id === branchId) || branches[0]) && (
          <div className="bg-white rounded-2xl border border-[#D4E0ED] p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#F0F5FA]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EDF4FC] border border-[#D4E0ED] flex items-center justify-center text-[#0055A5] shrink-0">
                  <Building2 size={20} className="stroke-[1.75]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-[#0055A5] bg-[#EDF4FC] px-2 py-0.5 rounded">
                      ОПС {(branches.find(b => b.id === branchId) || branches[0])?.code || '390000'}
                    </span>
                    <span className="text-xs text-[#476788]">
                      {(branches.find(b => b.id === branchId) || branches[0])?.address}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-[#0B3558] mt-0.5">
                    {(branches.find(b => b.id === branchId) || branches[0])?.name}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMapOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-white border border-[#D4E0ED] hover:border-[#0055A5] text-[#0055A5] text-xs font-bold transition-all cursor-pointer self-start sm:self-auto"
              >
                Выбрать на карте →
              </button>
            </div>

            <BranchWorkloadCard branch={branches.find(b => b.id === branchId) || branches[0]} />
          </div>
        )}

        {/* 152-ФЗ compliance footer */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 border-t border-slate-200">
          <button
            type="button"
            onClick={() => setIsPrivacyOpen(true)}
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-[#0055A5] font-medium transition-colors cursor-pointer"
          >
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Соответствие 152-ФЗ «О персональных данных»</span>
          </button>
          <span>Шифрование сессии • ГОСТ</span>
        </div>
      </div>
    );
  };

  const renderBooking = () => {
    const steps = ['Отделение', 'Услуга', 'Время'];

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="flex items-center justify-between pb-1">
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
          {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

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
              <p className="cx-selection-summary">
                <Building2 size={18} aria-hidden />
                {branches.find(b => b.id === branchId)?.name || 'Выбранное отделение'}
              </p>
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
              <div className="cx-selection-summary">
                <Building2 size={18} aria-hidden />
                <div>
                  <strong>{branches.find(b => b.id === branchId)?.name}</strong>
                  <p>{services.find(s => s.id === serviceId)?.name}</p>
                  <p>Дата и время указаны по Москве (МСК)</p>
                </div>
              </div>
              <BranchWorkloadCard branch={branches.find(b => b.id === branchId)} />
              <div className="p-4 sm:p-6 rounded-3xl bg-white border border-[#D2D8E2] shadow-sm space-y-4 max-w-full min-w-0 overflow-hidden">
              <Appointment24hPicker
                value={scheduledAtInput}
                onChange={setScheduledAtInput}
                disabled={creating}
                workHours={branches.find(b => b.id === branchId)?.workHours}
              />
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
        <header className="flex items-center justify-between pb-1">
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
          {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
          {notice && <NoticeBanner message={notice} onClose={() => setNotice(null)} />}

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
        <header className="flex items-center justify-between pb-1">
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
          {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
          {notice && <NoticeBanner message={notice} onClose={() => setNotice(null)} />}
          {pollError && <div role="status" className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-[#054FA6] text-xs font-semibold">{pollError}</div>}

          {ticketsLoading && tickets.length === 0 ? (
            <div className="cx-request-state" role="status">Загружаем ваши талоны…</div>
          ) : pollError && tickets.length === 0 ? (
            <div className="cx-request-state" role="status">Восстанавливаем соединение. Ваши талоны сохранены, повторная загрузка выполняется автоматически.</div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-16 px-4 bg-white rounded-3xl border border-[#DFE1F4] shadow-sm space-y-3">
              <div className="flex justify-center mb-1">
                <Icon3DTicket size={64} />
              </div>
              <h3 className="text-base font-bold text-slate-800">У вас нет активных талонов</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Оформите талон или выберите предварительную запись на главной странице
              </p>
              <button
                type="button"
                onClick={() => setScreen('home')}
                className="px-6 py-3 bg-[#1A34E8] hover:bg-[#5975FF] text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition-colors mt-2"
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
                    <div className="cx-ticket-header" aria-live="polite" aria-atomic="true">
                      <span className="cx-ticket-num font-mono">{ticket.publicNumber}</span>
                      <StatusBadge status={ticket.status} source={ticket.source} />
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
                        <>
                          <div className="cx-ticket-row">
                            <span>Время по записи</span>
                            <strong>{formatMoscowDateTime(appointment.scheduledAt)} МСК</strong>
                          </div>
                          <div className="pt-2 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => downloadICSFile(
                                appointment.scheduledAt,
                                branches.find(b => b.id === ticket.branchId)?.name || 'Почта России',
                                services.find(s => s.id === ticket.serviceId)?.name || 'Почтовые услуги',
                                ticket.publicNumber
                              )}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1A34E8] text-[11px] font-bold transition-colors cursor-pointer border border-blue-200"
                            >
                              <Calendar size={13} />
                              <span>Скачать .ics</span>
                            </button>
                            <a
                              href={getGoogleCalendarUrl(
                                appointment.scheduledAt,
                                branches.find(b => b.id === ticket.branchId)?.name || 'Почта России',
                                services.find(s => s.id === ticket.serviceId)?.name || 'Почтовые услуги',
                                ticket.publicNumber
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-colors border border-slate-200"
                            >
                              <span>+ Google Календарь</span>
                            </a>
                            <a
                              href={getYandexCalendarUrl(
                                appointment.scheduledAt,
                                branches.find(b => b.id === ticket.branchId)?.name || 'Почта России',
                                services.find(s => s.id === ticket.serviceId)?.name || 'Почтовые услуги',
                                ticket.publicNumber
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-colors border border-slate-200"
                            >
                              <span>+ Яндекс</span>
                            </a>
                          </div>
                        </>
                      )}
                      {ticket.status === 'CALLED' && ticket.window && (
                        <div className="cx-ticket-called-box flex flex-col items-center justify-center gap-1.5 py-4">
                          <div className="flex items-center gap-2">
                            <Icon3DBell size={36} />
                            <span className="text-lg font-black text-[#010E3E]">Вас вызывают!</span>
                          </div>
                          <div>
                            Подойдите к окну <strong className="text-2xl font-black text-[#1A34E8] font-mono">№{ticket.window.number}</strong>
                          </div>
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
                          <div className="cx-ticket-position cx-ticket-eta font-mono text-xs font-bold text-[#054FA6]">
                            <span className="cx-eta-label">Ожидание примерно{' '}<span className="cx-eta-duration">{Math.ceil(eta.estimatedWaitSeconds / 60)} мин</span></span>
                            <ETASparkline eta={eta} />
                          </div>
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
                        (ticket.arrivedAt || arrivalAcknowledgedTicketIds.has(ticket.id)) ? (
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
                      {(ticket.status === 'SCHEDULED' || ticket.status === 'WAITING') && (
                        <button
                          type="button"
                          className="cx-btn cx-btn-danger cx-btn-block"
                          onClick={() => cancel(ticket)}
                          disabled={cancelling}
                        >
                          {cancelling
                            ? 'Отменяем...'
                            : (ticket.status === 'SCHEDULED' ? 'Отменить запись' : 'Отказаться от талона')}
                        </button>
                      )}
                      {terminalStatuses.has(ticket.status) && (
                        <>
                          <button
                            type="button"
                            className="cx-btn cx-btn-primary cx-btn-block"
                            onClick={() => handleRepeatTicket(ticket.branchId)}
                          >
                            Взять новый талон
                          </button>
                          <button
                            type="button"
                            className="w-full mt-2 py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                            onClick={() => {
                              setFeedbackTicket(ticket);
                              setIsFeedbackOpen(true);
                            }}
                          >
                            <Star size={14} className="fill-amber-500 text-amber-500" />
                            <span>Оценить визит и обслуживание</span>
                          </button>
                        </>
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
    <div className={kiosk ? 'w-full' : 'cx-client-flow w-full'}>
      {kiosk && kioskTicket ? renderKioskTicket() : (
        <>
          {screen === 'booking' && renderBooking()}
          {screen === 'walkin' && renderWalkin()}
          {!kiosk && screen === 'my' && renderMy()}
          {!kiosk && screen === 'home' && renderHome()}

          {!kiosk && (
            <>
              {/* Mobile Bottom Tab Bar (fixed on mobile viewport) */}
              <MobileTabBar
                currentScreen={screen}
                activeTicketsCount={savedCount}
                onNavigateHome={() => setScreen('home')}
                onNavigateBooking={() => { resetBooking(); setScreen('booking'); }}
                onNavigateWalkin={() => { resetWalkin(); setScreen('walkin'); }}
                onNavigateMy={() => setScreen('my')}
                onOpenMap={() => setIsMapOpen(true)}
                onOpenProfile={() => setIsProfileOpen(true)}
              />

              {/* 1. Branch Map & Smart Route Modal */}
              <BranchMapModal
                isOpen={isMapOpen}
                onClose={() => setIsMapOpen(false)}
                selectedBranchId={branchId || MOSCOW_BRANCHES[0].id}
                onSelectBranch={handleSelectBranchFromMap}
              />

              {/* 2. Arrival Bottom Sheet (Яндекс Заправки style) */}
              <ArrivalSheet
                isOpen={isArrivalOpen}
                onClose={() => setIsArrivalOpen(false)}
                branch={branches.find(b => b.id === branchId) || branches[0] || null}
                services={services}
                onTakeTicket={handleArrivalTicket}
                isLoading={creating}
              />

              {/* 3. Client Profile & Reliability Karma Modal */}
              <ClientProfileModal
                isOpen={isProfileOpen}
                onClose={() => setIsProfileOpen(false)}
                tickets={tickets}
                branches={branches}
                services={services}
                onOpenTicket={() => setScreen('my')}
              />

              {/* 4. Branch Feedback & Review Modal (WB style) */}
              <BranchFeedbackModal
                isOpen={isFeedbackOpen}
                onClose={() => {
                  setIsFeedbackOpen(false);
                  setFeedbackTicket(null);
                }}
                branchName={branches.find(b => b.id === (feedbackTicket?.branchId || branchId))?.name || 'Почта России'}
                ticketNumber={feedbackTicket?.publicNumber}
              />

              {/* 5. 152-ФЗ Privacy Policy Modal */}
              <PrivacyPolicyModal
                isOpen={isPrivacyOpen}
                onClose={() => setIsPrivacyOpen(false)}
                onClearData={() => {
                  sessionStorage.clear();
                  localStorage.clear();
                  window.location.reload();
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
