import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../../api/client/clientApi';
import { Branch, Service, Ticket, TicketStatus } from '../../api/client/types';
import './client.css';

const POLL_INTERVAL_MS = 2000;
const terminalStatuses = new Set<TicketStatus>(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

type QueueMode = 'qr' | 'appointment';

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

function toDatetimeLocalString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getQuickSlots(): { label: string; value: string }[] {
  const slots: { label: string; value: string }[] = [];
  const now = new Date();
  const ms = 1000 * 60 * 15;
  const start = new Date(Math.ceil(now.getTime() / ms) * ms);
  for (let i = 0; i < 4; i++) {
    const slotDate = new Date(start.getTime() + i * ms);
    slots.push({
      label: slotDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      value: toDatetimeLocalString(slotDate),
    });
  }
  return slots;
}

export function ClientWorkspace() {
  const [mode, setMode] = useState<QueueMode>('qr');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [branchId, setBranchId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingServices, setLoadingServices] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  const pollTimer = useRef<number | null>(null);
  const pollController = useRef<AbortController | null>(null);
  const createController = useRef<AbortController | null>(null);
  const cancelController = useRef<AbortController | null>(null);

  const quickSlots = useMemo(() => getQuickSlots(), [mode]);
  const minDateTime = useMemo(() => toDatetimeLocalString(new Date()), [mode]);

  useEffect(() => {
    const controller = new AbortController();
    api.listBranches(controller.signal)
      .then(setBranches)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Не удалось загрузить отделения');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingBranches(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setServices([]);
    setServiceId('');
    setError(null);
    if (!branchId) {
      setLoadingServices(false);
      return;
    }
    const controller = new AbortController();
    setLoadingServices(true);
    api.listServices(branchId, controller.signal)
      .then(setServices)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Не удалось загрузить услуги');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingServices(false);
      });
    return () => controller.abort();
  }, [branchId]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    pollTimer.current = null;
    pollController.current?.abort();
    pollController.current = null;
  }, []);

  const poll = useCallback((ticketId: string) => {
    pollController.current = new AbortController();
    api.getTicket(ticketId, pollController.current.signal)
      .then((nextTicket) => {
        setTicket(nextTicket);
        setPollError(null);
        if (!terminalStatuses.has(nextTicket.status)) {
          pollTimer.current = window.setTimeout(() => poll(ticketId), POLL_INTERVAL_MS);
        }
      })
      .catch((reason: unknown) => {
        if (pollController.current?.signal.aborted) return;
        setPollError(reason instanceof Error ? reason.message : 'Не удалось обновить состояние талона');
        pollTimer.current = window.setTimeout(() => poll(ticketId), POLL_INTERVAL_MS);
      });
  }, []);

  useEffect(() => () => {
    stopPolling();
    createController.current?.abort();
    createController.current = null;
    cancelController.current?.abort();
    cancelController.current = null;
  }, [stopPolling]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!branchId || !serviceId) return;

    if (mode === 'appointment') {
      if (!scheduledTime) {
        setError('Пожалуйста, выберите дату и время записи');
        return;
      }
      const slotDate = new Date(scheduledTime);
      if (isNaN(slotDate.getTime())) {
        setError('Некорректная дата и время записи');
        return;
      }
      if (slotDate.getTime() < Date.now() - 60000) {
        setError('Время записи должно быть в будущем');
        return;
      }
    }

    stopPolling();
    setCreating(true);
    setError(null);
    setPollError(null);
    const controller = new AbortController();
    createController.current = controller;

    try {
      let created: Ticket;
      if (mode === 'appointment') {
        const isoTime = new Date(scheduledTime).toISOString();
        created = await api.createAppointmentTicket(branchId, serviceId, isoTime, makeIdempotencyKey(), controller.signal);
      } else {
        created = await api.createQrTicket(branchId, serviceId, makeIdempotencyKey(), controller.signal);
      }
      setTicket(created);
      setScheduledTime('');
      if (!terminalStatuses.has(created.status)) {
        poll(created.id);
      }
    } catch (reason: unknown) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : 'Не удалось получить талон');
      }
    } finally {
      if (createController.current === controller) createController.current = null;
      setCreating(false);
    }
  };

  const handleCancelTicket = async () => {
    if (!ticket || cancelling) return;
    stopPolling();
    setCancelling(true);
    setError(null);
    const controller = new AbortController();
    cancelController.current = controller;

    try {
      const cancelledTicket = await api.cancelTicket(ticket.id, controller.signal);
      setTicket(cancelledTicket);
    } catch (reason: unknown) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : 'Не удалось отменить запись');
        if (!terminalStatuses.has(ticket.status)) {
          poll(ticket.id);
        }
      }
    } finally {
      if (cancelController.current === controller) cancelController.current = null;
      setCancelling(false);
    }
  };

  const selectedService = services.find((service) => service.id === ticket?.serviceId || service.id === serviceId);
  const isSubmitDisabled = creating || !branchId || !serviceId || (mode === 'appointment' && !scheduledTime);

  return (
    <section className="client-card" aria-labelledby="client-title">
      <h2 id="client-title">Получить талон</h2>
      {error && <p className="client-message client-error" role="alert">{error}</p>}

      {!ticket ? (
        <>
          <div className="client-mode-selector" role="group" aria-label="Режим получения талона">
            <button
              type="button"
              className={`client-mode-btn ${mode === 'qr' ? 'active' : ''}`}
              aria-pressed={mode === 'qr'}
              onClick={() => {
                setMode('qr');
                setError(null);
              }}
              disabled={creating}
            >
              Талон в отделении
            </button>
            <button
              type="button"
              className={`client-mode-btn ${mode === 'appointment' ? 'active' : ''}`}
              aria-pressed={mode === 'appointment'}
              onClick={() => {
                setMode('appointment');
                setError(null);
              }}
              disabled={creating}
            >
              Запись на время
            </button>
          </div>

          <form className="client-form" onSubmit={handleSubmit}>
            <label className="client-field" htmlFor="client-branch-select">
              Отделение
              <select
                id="client-branch-select"
                className="client-select"
                value={branchId}
                disabled={loadingBranches || creating}
                onChange={(event) => setBranchId(event.target.value)}
              >
                <option value="">
                  {loadingBranches ? 'Загрузка отделений...' : branches.length ? 'Выберите отделение' : 'Отделения не найдены'}
                </option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>

            {branchId && (
              <label className="client-field" htmlFor="client-service-select">
                Услуга
                <select
                  id="client-service-select"
                  className="client-select"
                  value={serviceId}
                  disabled={loadingServices || creating}
                  onChange={(event) => setServiceId(event.target.value)}
                >
                  <option value="">
                    {loadingServices ? 'Загрузка услуг...' : services.length ? 'Выберите услугу' : 'Услуги не найдены'}
                  </option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
                </select>
              </label>
            )}

            {mode === 'appointment' && (
              <div className="client-slots-section">
                <label className="client-field" htmlFor="client-datetime-input">
                  Дата и время записи
                  <input
                    id="client-datetime-input"
                    type="datetime-local"
                    className="client-input"
                    value={scheduledTime}
                    min={minDateTime}
                    step="900"
                    disabled={creating}
                    onChange={(event) => {
                      setScheduledTime(event.target.value);
                      setError(null);
                    }}
                    required
                  />
                </label>
                <div className="client-quick-slots" role="group" aria-label="Ближайшие слоты">
                  <span className="client-slots-label">Ближайшие слоты (15 мин):</span>
                  <div className="client-slot-pills">
                    {quickSlots.map((slot) => (
                      <button
                        key={slot.value}
                        type="button"
                        className={`client-slot-pill ${scheduledTime === slot.value ? 'selected' : ''}`}
                        onClick={() => {
                          setScheduledTime(slot.value);
                          setError(null);
                        }}
                        disabled={creating}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <button
              className="client-button"
              type="submit"
              disabled={isSubmitDisabled}
            >
              {mode === 'appointment'
                ? (creating ? 'Записываем...' : 'Записаться на время')
                : (creating ? 'Получаем талон...' : 'Получить талон')}
            </button>
          </form>
        </>
      ) : (
        <div className="client-ticket" aria-live="polite">
          <div className="client-ticket-number">{ticket.publicNumber}</div>
          <div>Услуга: {selectedService?.name || ticket.serviceId}</div>
          <div>Источник: {ticket.source}</div>
          {ticket.scheduledTime && (
            <div className="client-scheduled-time">
              Время записи: {new Date(ticket.scheduledTime).toLocaleString('ru-RU')}
            </div>
          )}
          <div className="client-status">{statusMessage(ticket)}</div>
          {ticket.status === 'CALLED' && ticket.window && <div>Окно №{ticket.window.number}</div>}
          {pollError && <div className="client-message client-error">Обновление: {pollError}</div>}

          {(ticket.status === 'SCHEDULED' || ticket.status === 'WAITING') && (
            <button
              className="client-button client-button-cancel"
              type="button"
              disabled={cancelling}
              onClick={handleCancelTicket}
            >
              {cancelling ? 'Отменяем запись...' : 'Отменить запись'}
            </button>
          )}

          {terminalStatuses.has(ticket.status) && (
            <button
              className="client-button client-retry"
              type="button"
              onClick={() => {
                stopPolling();
                setTicket(null);
                setError(null);
                setPollError(null);
              }}
            >
              Взять новый талон
            </button>
          )}
        </div>
      )}
    </section>
  );
}
