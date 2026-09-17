import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../../api/client/clientApi';
import { Branch, Service, Ticket, TicketStatus } from '../../api/client/types';
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

function statusMessage(ticket: Ticket): string {
  switch (ticket.status) {
    case 'WAITING': return 'Ожидайте вызова';
    case 'CALLED': return 'ВАС ВЫЗЫВАЮТ';
    case 'SERVING': return 'Идёт обслуживание';
    case 'COMPLETED': return 'Обслуживание завершено';
    case 'CANCELLED': return 'Талон отменён';
    case 'NO_SHOW': return 'Вызов пропущен';
    case 'SCHEDULED': return 'Талон зарегистрирован';
  }
}

export function ClientWorkspace() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [branchId, setBranchId] = useState(() => sessionStorage.getItem(STORAGE_BRANCH_KEY) || '');
  const [serviceId, setServiceId] = useState(() => sessionStorage.getItem(STORAGE_SERVICE_KEY) || '');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingServices, setLoadingServices] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);
  const pollController = useRef<AbortController | null>(null);
  const createController = useRef<AbortController | null>(null);
  const pollGeneration = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    api.listBranches(controller.signal)
      .then(setBranches)
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить отделения'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingBranches(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!sessionStorage.getItem(STORAGE_SERVICE_KEY)) {
      setServices([]);
      setServiceId('');
    }
    setError(null);
    if (!branchId) {
      setLoadingServices(false);
      return;
    }
    sessionStorage.setItem(STORAGE_BRANCH_KEY, branchId);
    const controller = new AbortController();
    setLoadingServices(true);
    api.listServices(branchId, controller.signal)
      .then(setServices)
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
  }, []);

  const poll = useCallback((ticketId: string) => {
    const generation = pollGeneration.current;
    const controller = new AbortController();
    pollController.current = controller;
    api.getTicket(ticketId, controller.signal)
      .then((nextTicket) => {
        if (generation !== pollGeneration.current || controller.signal.aborted) return;
        setTicket(nextTicket);
        setPollError(null);
        if (!terminalStatuses.has(nextTicket.status)) {
          sessionStorage.setItem(STORAGE_TICKET_KEY, nextTicket.id);
          pollTimer.current = window.setTimeout(() => poll(ticketId), POLL_INTERVAL_MS);
        } else {
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
      setTicket(created);
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

  const selectedService = services.find((service) => service.id === ticket?.serviceId || service.id === serviceId);

  const resetTicket = () => {
    stopPolling();
    sessionStorage.removeItem(STORAGE_TICKET_KEY);
    setTicket(null);
    setError(null);
    setPollError(null);
  };

  return <section className="client-card" aria-labelledby="client-title">
    <h2 id="client-title">Получить талон</h2>
    {error && <p className="client-message client-error" role="alert">{error}</p>}
    <form className="client-form" onSubmit={createTicket}>
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
      {!ticket && <button className="client-button" type="submit" disabled={creating || !branchId || !serviceId}>{creating ? 'Получаем талон...' : 'Получить талон'}</button>}
    </form>
    {ticket && <div className="client-ticket" aria-live="polite">
      <div className="client-ticket-number">{ticket.publicNumber}</div>
      <div>Услуга: {selectedService?.name || ticket.serviceId}</div>
      <div>Источник: {ticket.source}</div>
      <div className="client-status">{statusMessage(ticket)}</div>
      {ticket.status === 'CALLED' && ticket.window && <div>Окно №{ticket.window.number}</div>}
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
