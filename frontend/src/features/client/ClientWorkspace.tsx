import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../../api/client/clientApi';
import { Appointment, Branch, Service, Ticket, TicketStatus, QueuePosition } from '../../api/client/types';
import { CalendarClock, Ticket as TicketIcon, ListChecks, ChevronLeft, MapPin, Clock, Check } from 'lucide-react';
import './client.css';

const POLL_INTERVAL_MS = 2000;
const terminalStatuses = new Set<TicketStatus>(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

const STORAGE_BRANCH_KEY = 'client_selected_branch_id';
const STORAGE_SERVICE_KEY = 'client_selected_service_id';
const STORAGE_TICKETS_KEY = 'client_active_ticket_ids';

type ClientScreen = 'home' | 'booking' | 'walkin' | 'my';

function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localDateTimeValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function statusMessage(status: TicketStatus): string {
  switch (status) {
    case 'WAITING': return 'Вы в очереди';
    case 'CALLED': return 'Вас вызывают';
    case 'SERVING': return 'Идёт обслуживание';
    case 'COMPLETED': return 'Обслуживание завершено';
    case 'CANCELLED': return 'Отменена';
    case 'NO_SHOW': return 'Неявка';
    case 'SCHEDULED': return 'Запись подтверждена';
    default: return 'Статус обновляется';
  }
}

function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`cx-badge cx-badge-${status.toLowerCase()}`}>{statusMessage(status)}</span>;
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
    <button type="button" className={`cx-choice${selected ? ' cx-choice-selected' : ''}`} aria-pressed={selected} onClick={onSelect}>
      <span className="cx-choice-title">{branch.name}</span>
      {branch.address ? <span className="cx-choice-meta"><MapPin size={14} aria-hidden /> {branch.address}</span> : null}
      {branch.workHours ? <span className="cx-choice-meta"><Clock size={14} aria-hidden /> {branch.workHours}</span> : null}
    </button>
  );
}

function ServiceCard({ service, selected, onSelect }: { service: Service; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`cx-choice${selected ? ' cx-choice-selected' : ''}`} aria-pressed={selected} onClick={onSelect}>
      <span className="cx-choice-title">{service.name}</span>
      <span className="cx-choice-meta">Обслуживание в порядке общей очереди</span>
    </button>
  );
}

// Storage helpers for multiple tickets
function getSavedTicketIds(): string[] {
  try {
    const val = sessionStorage.getItem(STORAGE_TICKETS_KEY);
    if (!val) return [];
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function addSavedTicketId(id: string) {
  const ids = getSavedTicketIds();
  if (!ids.includes(id)) {
    sessionStorage.setItem(STORAGE_TICKETS_KEY, JSON.stringify([...ids, id]));
  }
}

function removeSavedTicketId(id: string) {
  const ids = getSavedTicketIds();
  const newIds = ids.filter(i => i !== id);
  if (newIds.length === 0) {
    sessionStorage.removeItem(STORAGE_TICKETS_KEY);
  } else {
    sessionStorage.setItem(STORAGE_TICKETS_KEY, JSON.stringify(newIds));
  }
}

export function ClientWorkspace() {
  const user = null;
  const authChecking = false;
  const openAuthScreen = (screen: string) => {};
  
  const [screen, setScreen] = useState<ClientScreen>('home');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  
  // Wizards state
  const [branchId, setBranchId] = useState(() => {
    const v = sessionStorage.getItem(STORAGE_BRANCH_KEY);
    return v && v !== 'undefined' && v !== 'null' ? v : '';
  });
  const [serviceId, setServiceId] = useState(() => {
    const v = sessionStorage.getItem(STORAGE_SERVICE_KEY);
    return v && v !== 'undefined' && v !== 'null' ? v : '';
  });
  const [scheduledAtInput, setScheduledAtInput] = useState('');
  const [bookingStep, setBookingStep] = useState(0);
  const [walkinStep, setWalkinStep] = useState(0);
  
  // Data state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Tickets state
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [appointments, setAppointments] = useState<Record<string, Appointment>>({});
  const [positions, setPositions] = useState<Record<string, QueuePosition>>({});
  const [pollError, setPollError] = useState<string | null>(null);
  const [arrivalAcknowledgedTicketIds, setArrivalAcknowledgedTicketIds] = useState<Set<string>>(new Set());
  
  // Action state
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [arriving, setArriving] = useState(false);

  // Refs for polling
  const pollTimer = useRef<number | null>(null);
  const pollGeneration = useRef(0);

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

  useEffect(() => {
    let unmounted = false;
    async function load() {
      if (unmounted) return;
      try {
        setLoading(true);
        const blist = await api.listBranches();
        if (!unmounted) {
          setBranches(blist);
        }
      } catch (err: any) {
        if (!unmounted) setError(friendlyError(err, 'Не удалось загрузить данные'));
      } finally {
        if (!unmounted) setLoading(false);
      }
    }
    load();
    return () => { unmounted = true; };
  }, []);

  useEffect(() => {
    if (!branchId) {
      setServices([]);
      return;
    }
    let unmounted = false;
    async function loadServices() {
      try {
        const slist = await api.listServices(branchId);
        if (!unmounted) {
          setServices(slist);
        }
      } catch (err: any) {
        if (!unmounted) setError(friendlyError(err, 'Не удалось загрузить услуги'));
      }
    }
    loadServices();
    return () => { unmounted = true; };
  }, [branchId]);

  // Handle URL actions (e.g. from Demo Hub)
  useEffect(() => {
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
    const ids = getSavedTicketIds();
    
    if (ids.length === 0) {
      setTickets([]);
      setAppointments({});
      setPositions({});
      return;
    }

    const fetchedTickets: Ticket[] = [];
    const fetchedPositions: Record<string, QueuePosition> = {};

    Promise.allSettled(ids.map(async id => {
      try {
        const nextTicket = await api.getTicket(id);
        if (generation !== pollGeneration.current) return;
        
        fetchedTickets.push(nextTicket);

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
          try {
            const pos = await api.getQueuePosition(nextTicket.id);
            if (generation !== pollGeneration.current) return;
            fetchedPositions[id] = pos;
          } catch { /* supplementary */ }
        } else {
          // It's terminal, keep it in the view temporarily but remove from storage so it won't be fetched on reload
          removeSavedTicketId(id);
        }
      } catch (err: any) {
        // if ticket not found, remove from storage
        if (err.status === 404 || err.message === 'NOT_FOUND') {
           removeSavedTicketId(id);
        }
      }
    })).then(() => {
      if (generation !== pollGeneration.current) return;
      setTickets(fetchedTickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setPositions(fetchedPositions);
      setPollError(null);
    }).catch(reason => {
      if (generation !== pollGeneration.current) return;
      setPollError(friendlyError(reason, 'Не удалось обновить талоны'));
    }).finally(() => {
      if (generation === pollGeneration.current && getSavedTicketIds().length > 0) {
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

  const resetBooking = () => {
    setBookingStep(0);
    setScheduledAtInput('');
    setError(null);
  };
  
  const resetWalkin = () => {
    setWalkinStep(0);
    setError(null);
  };

  const createQrTicket = async () => {
    if (!branchId || !serviceId) return;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createQrTicket(branchId, serviceId, makeIdempotencyKey());
      addSavedTicketId(created.id);
      setTickets(prev => [created, ...prev]);
      setScreen('my');
    } catch (reason: unknown) {
      setError(friendlyError(reason, 'Не удалось получить талон'));
    } finally {
      setCreating(false);
    }
  };

  const createAppointmentData = async () => {
    if (!branchId || !serviceId || !scheduledAtInput) return;
    const scheduledAt = new Date(scheduledAtInput);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      setError('Выберите будущее время записи');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await api.createAppointment(
        branchId,
        serviceId,
        scheduledAt.toISOString(),
        makeIdempotencyKey()
      );
      addSavedTicketId(created.ticket.id);
      setTickets(prev => [created.ticket, ...prev]);
      setAppointments(prev => ({ ...prev, [created.ticket.id]: created }));
      setScreen('my');
    } catch (reason: unknown) {
      setError(friendlyError(reason, 'Не удалось создать запись'));
    } finally {
      setCreating(false);
    }
  };

  const cancel = async (ticket: Ticket) => {
    if (cancelling || ticket.status !== 'SCHEDULED') return;
    setCancelling(true);
    try {
      await api.cancelAppointment(ticket.id);
      removeSavedTicketId(ticket.id);
      // Immediately refresh list
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
      pollAll();
    } catch (reason: unknown) {
      setError(friendlyError(reason, 'Не удалось подтвердить прибытие'));
    } finally {
      setArriving(false);
    }
  };

  const handleBranchSelect = (id: string) => {
    setBranchId(id);
    sessionStorage.setItem(STORAGE_BRANCH_KEY, id);
    if (screen === 'booking') setBookingStep(1);
    if (screen === 'walkin') setWalkinStep(1);
  };
  
  const handleServiceSelect = (id: string) => {
    setServiceId(id);
    sessionStorage.setItem(STORAGE_SERVICE_KEY, id);
    if (screen === 'booking') setBookingStep(2);
    if (screen === 'walkin') {
      createQrTicket();
    }
  };

  const renderHome = () => (
    <div className="cx-home">
      <header className="cx-header">
        <div className="cx-header-user">
          <div className="cx-avatar">{'П'}</div>
          <div>
            <h2>{'Почта России'}</h2>
            <p>Добро пожаловать</p>
          </div>
        </div>
      </header>

      <div className="cx-home-cards">
        <button className="cx-home-card cx-home-card-primary" onClick={() => { resetBooking(); setScreen('booking'); }}>
          <div className="cx-home-card-icon"><CalendarClock size={28} /></div>
          <div className="cx-home-card-content">
            <h3>Записаться онлайн</h3>
            <p>Выберите время визита заранее, чтобы не ждать в очереди</p>
          </div>
        </button>
        <button className="cx-home-card cx-home-card-secondary" onClick={() => { resetWalkin(); setScreen('walkin'); }}>
          <div className="cx-home-card-icon"><TicketIcon size={28} /></div>
          <div className="cx-home-card-content">
            <h3>Взять талон</h3>
            <p>Получите номерок прямо сейчас, если вы уже в отделении</p>
          </div>
        </button>
        <button className="cx-home-card cx-home-card-tertiary" onClick={() => {
          setScreen('my');
        }}>
          <div className="cx-home-card-icon"><ListChecks size={28} /></div>
          <div className="cx-home-card-content">
            <h3>Мои талоны</h3>
            <p>Текущие очереди, история визитов и статус</p>
          </div>
        </button>
      </div>
    </div>
  );

  const renderBooking = () => {
    const steps = ['Отделение', 'Услуга', 'Время'];

    return (
      <div className="cx-wizard">
        <header className="cx-wizard-header">
          <button className="cx-back-btn" onClick={() => bookingStep === 0 ? setScreen('home') : setBookingStep(b => b - 1)}>
            <ChevronLeft size={24} /> Назад
          </button>
          <h2>Онлайн-запись</h2>
        </header>
        <div className="cx-wizard-content">
          <StepIndicator steps={steps} current={bookingStep} />
          {error && <div className="cx-error-box">{error}</div>}
          
          {bookingStep === 0 && (
            <div className="cx-choices">
              <h3>Выберите отделение</h3>
              {loading ? <p>Загрузка...</p> : branches.map(b => (
                <BranchCard key={b.id} branch={b} selected={branchId === b.id} onSelect={() => handleBranchSelect(b.id)} />
              ))}
            </div>
          )}
          
          {bookingStep === 1 && (
            <div className="cx-choices">
              <h3>Выберите услугу</h3>
              {services.length === 0 ? <p>В этом отделении пока нет услуг</p> : services.map(s => (
                <ServiceCard key={s.id} service={s} selected={serviceId === s.id} onSelect={() => handleServiceSelect(s.id)} />
              ))}
            </div>
          )}
          
          {bookingStep === 2 && (
            <div className="cx-form-step">
              <h3>Укажите время визита</h3>
              <label className="cx-field">
                <span>Дата и время</span>
                <input 
                  type="datetime-local" 
                  value={scheduledAtInput} 
                  min={localDateTimeValue(new Date(Date.now() + 60_000))} 
                  onChange={e => setScheduledAtInput(e.target.value)} 
                  disabled={creating}
                  className="cx-input"
                />
              </label>
              <button 
                className="cx-btn cx-btn-primary" 
                disabled={creating || !scheduledAtInput} 
                onClick={createAppointmentData}
              >
                {creating ? 'Оформляем...' : 'Подтвердить запись'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderWalkin = () => {
    const steps = ['Отделение', 'Услуга'];

    return (
      <div className="cx-wizard">
        <header className="cx-wizard-header">
          <button className="cx-back-btn" onClick={() => walkinStep === 0 ? setScreen('home') : setWalkinStep(w => w - 1)}>
            <ChevronLeft size={24} /> Назад
          </button>
          <h2>Взять талон</h2>
        </header>
        <div className="cx-wizard-content">
          <StepIndicator steps={steps} current={walkinStep} />
          {error && <div className="cx-error-box">{error}</div>}
          
          {walkinStep === 0 && (
            <div className="cx-choices">
              <h3>Выберите отделение</h3>
              {loading ? <p>Загрузка...</p> : branches.map(b => (
                <BranchCard key={b.id} branch={b} selected={branchId === b.id} onSelect={() => handleBranchSelect(b.id)} />
              ))}
            </div>
          )}
          
          {walkinStep === 1 && (
            <div className="cx-choices">
              <h3>Выберите услугу</h3>
              {services.length === 0 ? <p>В этом отделении пока нет услуг</p> : services.map(s => (
                <ServiceCard key={s.id} service={s} selected={serviceId === s.id} onSelect={() => handleServiceSelect(s.id)} />
              ))}
            </div>
          )}
        </div>
        {creating && <div className="cx-loading-overlay">Оформляем талон...</div>}
      </div>
    );
  };

  const renderMy = () => {
    return (
      <div className="cx-my">
        <header className="cx-wizard-header">
          <button className="cx-back-btn" onClick={() => setScreen('home')}>
            <ChevronLeft size={24} /> Назад
          </button>
          <h2>Мои талоны</h2>
        </header>
        <div className="cx-my-content">
          {error && <div className="cx-error-box">{error}</div>}
          {pollError && <div className="cx-error-box">{pollError}</div>}
          
          {tickets.length === 0 ? (
            <div className="cx-empty-state">
              <div className="cx-empty-icon"><TicketIcon size={48} /></div>
              <h3>У вас нет активных талонов</h3>
              <p>Оформите талон на главной странице</p>
            </div>
          ) : (
            <div className="cx-tickets-list">
              {tickets.map(ticket => {
                const position = positions[ticket.id];
                const appointment = appointments[ticket.id];
                
                return (
                  <div key={ticket.id} className="cx-active-ticket">
                    <div className="cx-ticket-header">
                      <span className="cx-ticket-num">{ticket.publicNumber}</span>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <div className="cx-ticket-details">
                      <div className="cx-ticket-row">
                        <span>Услуга</span>
                        <strong>{services.find(s => s.id === ticket.serviceId)?.name || ticket.serviceId}</strong>
                      </div>
                      <div className="cx-ticket-row">
                        <span>Отделение</span>
                        <strong>{branches.find(b => b.id === ticket.branchId)?.name || 'Неизвестно'}</strong>
                      </div>
                      {appointment && (
                        <div className="cx-ticket-row">
                          <span>Время по записи</span>
                          <strong>{new Date(appointment.scheduledAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</strong>
                        </div>
                      )}
                      {ticket.status === 'CALLED' && ticket.window && (
                        <div className="cx-ticket-called-box">
                          Подойдите к окну <strong>№{ticket.window.number}</strong>
                        </div>
                      )}
                      {position?.ticketId === ticket.id && position.position !== null && position.position > 0 && (
                        <div className="cx-ticket-position">
                          <span className="cx-pos-label">Перед вами</span>
                          <span className="cx-pos-val">{position.position} чел.</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="cx-ticket-actions">
                      {ticket.status === 'SCHEDULED' && ticket.source === 'APPOINTMENT' && (
                        arrivalAcknowledgedTicketIds.has(ticket.id) ? (
                          <div className="cx-ticket-alert cx-ticket-alert-success">Ожидайте вызова, ваше прибытие отмечено</div>
                        ) : (
                          <button className="cx-btn cx-btn-primary cx-btn-block" onClick={() => arrive(ticket)} disabled={arriving}>
                            {arriving ? 'Отмечаем...' : 'Я уже в отделении'}
                          </button>
                        )
                      )}
                      {ticket.status === 'SCHEDULED' && (
                        <button className="cx-btn cx-btn-danger cx-btn-block" onClick={() => cancel(ticket)} disabled={cancelling}>
                          {cancelling ? 'Отменяем...' : 'Отменить запись'}
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

  if (screen === 'booking') return renderBooking();
  if (screen === 'walkin') return renderWalkin();
  if (screen === 'my') return renderMy();
  return renderHome();
}
