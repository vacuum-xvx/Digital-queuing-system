import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../../api/client/clientApi';
import { Appointment, Branch, Service, Ticket, TicketStatus, QueuePosition } from '../../api/client/types';
import './client.css';

const POLL_INTERVAL_MS = 2000;
const terminalStatuses = new Set<TicketStatus>(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

const STORAGE_BRANCH_KEY = 'client_selected_branch_id';
const STORAGE_SERVICE_KEY = 'client_selected_service_id';
const STORAGE_TICKET_KEY = 'client_active_ticket_id';

function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localDateTimeValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function statusMessage(ticket: Ticket): string {
  switch (ticket.status) {
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

export function ClientWorkspace() {
  const [mode, setMode] = useState<'QR' | 'APPOINTMENT'>('QR');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [branchId, setBranchId] = useState(() => sessionStorage.getItem(STORAGE_BRANCH_KEY) || '');
  const [serviceId, setServiceId] = useState(() => sessionStorage.getItem(STORAGE_SERVICE_KEY) || '');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [scheduledAtInput, setScheduledAtInput] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingServices, setLoadingServices] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [arrivalAcknowledgedTicketId, setArrivalAcknowledgedTicketId] = useState<string | null>(null);
  const [position, setPosition] = useState<QueuePosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);
  const pollController = useRef<AbortController | null>(null);
  const createController = useRef<AbortController | null>(null);
  const pollGeneration = useRef(0);
  const pollingTicketId = useRef<string | null>(null);
  const previousBranchRef = useRef(branchId);
  const activeTicketIdRef = useRef<string | null>(null);

  const setActiveTicket = useCallback((nextTicket: Ticket | null) => {
    const nextId = nextTicket?.id ?? null;
    if (activeTicketIdRef.current !== nextId) setPosition(null);
    activeTicketIdRef.current = nextId;
    setTicket(nextTicket);
  }, []);

  const arrivalStorageKey = (ticketId: string) => `client-arrived:${ticketId}`;
  const hasArrivalAcknowledgement = (ticketId: string): boolean => {
    try { return sessionStorage.getItem(arrivalStorageKey(ticketId)) === '1'; } catch { return false; }
  };
  const rememberArrival = (ticketId: string) => {
    try { sessionStorage.setItem(arrivalStorageKey(ticketId), '1'); } catch { /* optional UX memory */ }
  };

  useEffect(() => {
    const controller = new AbortController();
    api.listBranches(controller.signal)
      .then(setBranches)
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить отделения'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingBranches(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const branchChanged = previousBranchRef.current !== branchId;
    previousBranchRef.current = branchId;
    setServices([]);
    if (branchChanged) setServiceId('');
    setError(null);
    if (!branchId) {
      setLoadingServices(false);
      return;
    }
    sessionStorage.setItem(STORAGE_BRANCH_KEY, branchId);
    const controller = new AbortController();
    setLoadingServices(true);
    api.listServices(branchId, controller.signal)
      .then((items) => {
        setServices(items);
        setServiceId((current) => items.some((service) => service.id === current) ? current : '');
      })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить услуги'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingServices(false); });
    return () => controller.abort();
  }, [branchId]);

  useEffect(() => {
    if (serviceId) {
      sessionStorage.setItem(STORAGE_SERVICE_KEY, serviceId);
    } else {
      sessionStorage.removeItem(STORAGE_SERVICE_KEY);
    }
  }, [serviceId]);

  const stopPolling = useCallback(() => {
    pollGeneration.current += 1;
    if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    pollTimer.current = null;
    pollController.current?.abort();
    pollController.current = null;
    pollingTicketId.current = null;
  }, []);

  const poll = useCallback((ticketId: string) => {
    const generation = pollGeneration.current;
    pollingTicketId.current = ticketId;
    const controller = new AbortController();
    pollController.current = controller;
    api.getTicket(ticketId, controller.signal)
      .then(async (nextTicket) => {
        if (generation !== pollGeneration.current || controller.signal.aborted) return;
        setActiveTicket(nextTicket);
        if (nextTicket.source === 'APPOINTMENT' && nextTicket.status === 'SCHEDULED') {
          setArrivalAcknowledgedTicketId(hasArrivalAcknowledgement(nextTicket.id) ? nextTicket.id : null);
        } else {
          setArrivalAcknowledgedTicketId(null);
        }
        setPollError(null);
        if (!terminalStatuses.has(nextTicket.status)) {
          try {
            const nextPosition = await api.getQueuePosition(nextTicket.id, controller.signal);
            if (generation !== pollGeneration.current || pollingTicketId.current !== ticketId || activeTicketIdRef.current !== ticketId || controller.signal.aborted) return;
            if (nextPosition.ticketId !== ticketId) return;
            setPosition(nextPosition);
          } catch { /* position is supplementary */ }
          sessionStorage.setItem(STORAGE_TICKET_KEY, nextTicket.id);
          pollTimer.current = window.setTimeout(() => poll(ticketId), POLL_INTERVAL_MS);
        } else {
          if (generation !== pollGeneration.current || pollingTicketId.current !== ticketId || activeTicketIdRef.current !== ticketId) return;
          setPosition(null);
          pollTimer.current = null;
          if (pollController.current === controller) pollController.current = null;
          sessionStorage.removeItem(STORAGE_TICKET_KEY);
        }
      })
      .catch((reason: unknown) => {
        if (generation !== pollGeneration.current || controller.signal.aborted) return;
        setPollError(reason instanceof Error ? reason.message : 'Не удалось обновить состояние талона');
        pollTimer.current = window.setTimeout(() => poll(ticketId), POLL_INTERVAL_MS);
      });
  }, []);

  useEffect(() => {
    const savedTicketId = sessionStorage.getItem(STORAGE_TICKET_KEY);
    if (savedTicketId) {
      poll(savedTicketId);
    }
    return () => {
      stopPolling();
      createController.current?.abort();
      createController.current = null;
    };
  }, [poll, stopPolling]);

  const createTicket = async (event: FormEvent) => {
    event.preventDefault();
    if (!branchId || !serviceId) return;
    stopPolling();
    sessionStorage.removeItem(STORAGE_TICKET_KEY);
    setCreating(true);
    setError(null);
    setPollError(null);
    const controller = new AbortController();
    createController.current = controller;
    try {
      const created = await api.createQrTicket(branchId, serviceId, makeIdempotencyKey(), controller.signal);
      setActiveTicket(created);
      setArrivalAcknowledgedTicketId(null);
      setPosition(null);
      if (!terminalStatuses.has(created.status)) {
        sessionStorage.setItem(STORAGE_TICKET_KEY, created.id);
        poll(created.id);
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось получить талон');
    } finally {
      if (createController.current === controller) createController.current = null;
      setCreating(false);
    }
  };

  const createAppointment = async (event: FormEvent) => {
    event.preventDefault();
    if (creating || !branchId || !serviceId || !scheduledAtInput) return;
    const scheduledAt = new Date(scheduledAtInput);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      setError('Выберите будущее время записи');
      return;
    }
    stopPolling();
    sessionStorage.removeItem(STORAGE_TICKET_KEY);
    setCreating(true);
    setError(null);
    setPollError(null);
    const controller = new AbortController();
    createController.current = controller;
    try {
      const created = await api.createAppointment(
        branchId,
        serviceId,
        scheduledAt.toISOString(),
        makeIdempotencyKey(),
        controller.signal,
      );
      setAppointment(created);
      setActiveTicket(created.ticket);
      setArrivalAcknowledgedTicketId(null);
      setPosition(null);
      if (!terminalStatuses.has(created.ticket.status)) {
        sessionStorage.setItem(STORAGE_TICKET_KEY, created.ticket.id);
        poll(created.ticket.id);
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось создать запись');
    } finally {
      if (createController.current === controller) createController.current = null;
      setCreating(false);
    }
  };

  const cancel = async () => {
    if (!ticket || cancelling || ticket.status !== 'SCHEDULED') return;
    setCancelling(true);
    setError(null);
    try {
      const cancelled = await api.cancelAppointment(ticket.id);
      setAppointment(cancelled);
      setActiveTicket(cancelled.ticket);
      setPosition(null);
      stopPolling();
      sessionStorage.removeItem(STORAGE_TICKET_KEY);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отменить запись');
    } finally {
      setCancelling(false);
    }
  };

  const arrive = async () => {
    if (!ticket || arriving || ticket.status !== 'SCHEDULED') return;
    setArriving(true); setError(null);
    try {
      const arrived = await api.arriveAppointment(ticket.id);
      setAppointment(arrived); setActiveTicket(arrived.ticket);
      setArrivalAcknowledgedTicketId(arrived.ticket.id);
      rememberArrival(arrived.ticket.id);
      setError('Прибытие подтверждено');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось подтвердить прибытие');
    } finally { setArriving(false); }
  };

  const selectedService = services.find((service) => service.id === ticket?.serviceId || service.id === serviceId);

  const resetTicket = () => {
    stopPolling();
    sessionStorage.removeItem(STORAGE_TICKET_KEY);
    setActiveTicket(null);
    setAppointment(null);
    setArrivalAcknowledgedTicketId(null);
    setPosition(null);
    setError(null);
    setPollError(null);
  };

  return <section className="client-card" aria-labelledby="client-title">
    <h2 id="client-title">Получить талон</h2>
    <div className="client-mode-switch" role="group" aria-label="Режим обслуживания">
      <button type="button" className={`client-mode-button${mode === 'QR' ? ' client-mode-button-active' : ''}`} onClick={() => !ticket && setMode('QR')} disabled={creating || Boolean(ticket)}>В отделении / QR</button>
      <button type="button" className={`client-mode-button${mode === 'APPOINTMENT' ? ' client-mode-button-active' : ''}`} onClick={() => !ticket && setMode('APPOINTMENT')} disabled={creating || Boolean(ticket)}>Предварительная запись</button>
    </div>
    {error && <p className="client-message client-error" role="alert">{error}</p>}
    <form className="client-form" onSubmit={mode === 'QR' ? createTicket : createAppointment}>
      <label className="client-field">Отделение
        <select className="client-select" value={branchId} disabled={loadingBranches || creating} onChange={(event) => setBranchId(event.target.value)}>
          <option value="">{loadingBranches ? 'Загрузка отделений...' : branches.length ? 'Выберите отделение' : 'Отделения не найдены'}</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </label>
      {branchId && <label className="client-field">Услуга
        <select className="client-select" value={serviceId} disabled={loadingServices || creating} onChange={(event) => setServiceId(event.target.value)}>
          <option value="">{loadingServices ? 'Загрузка услуг...' : services.length ? 'Выберите услугу' : 'Услуги не найдены'}</option>
          {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
        </select>
      </label>}
      {mode === 'APPOINTMENT' && !ticket && <label className="client-field">Дата и время
        <input className="client-input" type="datetime-local" value={scheduledAtInput} min={localDateTimeValue(new Date(Date.now() + 60_000))} disabled={creating} onChange={(event) => setScheduledAtInput(event.target.value)} required />
      </label>}
      {!ticket && <button className="client-button" type="submit" disabled={creating || !branchId || !serviceId || (mode === 'APPOINTMENT' && !scheduledAtInput)}>{creating ? (mode === 'QR' ? 'Получаем талон...' : 'Создаём запись...') : (mode === 'QR' ? 'Получить талон' : 'Записаться')}</button>}
    </form>
    {ticket && <div className="client-ticket" aria-live="polite">
      <div className="client-ticket-number">{ticket.publicNumber}</div>
      <div>Услуга: {selectedService?.name || ticket.serviceId}</div>
      <div>Источник: {ticket.source === 'QR' ? 'QR' : ticket.source === 'APPOINTMENT' ? 'Предварительная запись' : 'Живая очередь'}</div>
      {appointment && <div>Время записи: {new Date(appointment.scheduledAt).toLocaleString()}</div>}
      {appointment && <div>Статус: {statusMessage(ticket)}</div>}
      <div className="client-status">{statusMessage(ticket)}</div>
      {ticket.status === 'CALLED' && ticket.window && <div>Окно №{ticket.window.number}</div>}
      {position?.ticketId === ticket.id && position.reason === 'AVAILABLE' && position.position !== null && <div className="client-position">Текущая позиция: {position.position}<small> Порядок вызова может измениться.</small></div>}
      {position?.ticketId === ticket.id && position.reason === 'NOT_ELIGIBLE_YET' && <div className="client-message">Запись ещё не доступна для вызова.</div>}
      {position?.ticketId === ticket.id && position.reason === 'NO_OPEN_COMPATIBLE_WINDOW' && <div className="client-message">Сейчас нет свободного подходящего окна.</div>}
      {position?.ticketId === ticket.id && position.reason === 'NOT_QUEUED' && <div className="client-message">Талон сейчас не участвует в очереди.</div>}
      {ticket.status === 'SCHEDULED' && ticket.source === 'APPOINTMENT' && (arrivalAcknowledgedTicketId === ticket.id ? <div className="client-message">Прибытие отмечено</div> : <button type="button" className="client-button" onClick={arrive} disabled={arriving}>{arriving ? 'Подтверждаем…' : 'Я в отделении'}</button>)}
      {ticket.status === 'SCHEDULED' && <button type="button" className="client-button client-cancel-button" onClick={cancel} disabled={cancelling}>{cancelling ? 'Отменяем...' : 'Отменить запись'}</button>}
      {pollError && <div className="client-message client-error">Обновление: {pollError}</div>}
      {terminalStatuses.has(ticket.status) && (
        <button
          type="button"
          className="client-button"
          style={{ marginTop: '12px' }}
          onClick={resetTicket}
        >
          Взять новый талон
        </button>
      )}
    </div>}
  </section>;
}
