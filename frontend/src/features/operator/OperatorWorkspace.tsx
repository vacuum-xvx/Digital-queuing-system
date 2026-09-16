import React, { useEffect, useState, useCallback } from 'react';
import {
  Branch,
  OperatorWindow,
  Ticket,
  OperatorApiError,
  WindowService,
} from '../../api/operator/types';
import * as api from '../../api/operator/operatorApi';
import { BranchSelector } from './BranchSelector';
import { WindowSelector } from './WindowSelector';
import { TicketCard } from './TicketCard';
import { ActionControls } from './ActionControls';
import './operator.css';

const STORAGE_BRANCH_KEY = 'operator_selected_branch_id';
const STORAGE_WINDOW_KEY = 'operator_selected_window_id';

interface NoticeState {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  retryAction?: () => void;
  demoAction?: () => void;
}

export const OperatorWorkspace: React.FC = () => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    () => sessionStorage.getItem(STORAGE_BRANCH_KEY) || ''
  );

  const [windows, setWindows] = useState<OperatorWindow[]>([]);
  const [selectedWindow, setSelectedWindow] = useState<OperatorWindow | null>(null);
  const [branchServices, setBranchServices] = useState<WindowService[]>([]);

  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);

  const [isLiveModalOpen, setIsLiveModalOpen] = useState<boolean>(false);
  const [selectedLiveServiceId, setSelectedLiveServiceId] = useState<string>('');

  const [isRedirectModalOpen, setIsRedirectModalOpen] = useState<boolean>(false);
  const [selectedRedirectServiceId, setSelectedRedirectServiceId] = useState<string>('');

  const [isLoadingBranches, setIsLoadingBranches] = useState<boolean>(false);
  const [isLoadingWindows, setIsLoadingWindows] = useState<boolean>(false);
  const [isLoadingTicket, setIsLoadingTicket] = useState<boolean>(false);
  const [isActionPending, setIsActionPending] = useState<boolean>(false);

  const [notice, setNotice] = useState<NoticeState | null>(null);

  // 1. Load branches on initial mount
  useEffect(() => {
    let active = true;
    setIsLoadingBranches(true);
    api
      .listBranches()
      .then((items) => {
        if (!active) return;
        setBranches(items);
      })
      .catch((err) => {
        if (!active) return;
        const isBackend404 = err instanceof OperatorApiError && err.status === 404;
        setNotice({
          type: 'warning',
          message: isBackend404
            ? 'Сервер запущен, но HTTP-эндпоинт /api/v1/branches еще не реализован бэкендом (HTTP 404). Включите демо-режим для проверки UI.'
            : err instanceof OperatorApiError
            ? `Ошибка загрузки отделений: ${err.message}`
            : 'Не удалось загрузить список отделений',
          retryAction: () => window.location.reload(),
          demoAction: () => {
            const url = new URL(window.location.href);
            url.searchParams.set('mock', '1');
            window.location.href = url.toString();
          },
        });
      })
      .finally(() => {
        if (active) setIsLoadingBranches(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // 2. Load windows and branch services when selectedBranchId changes
  useEffect(() => {
    if (!selectedBranchId) {
      setWindows([]);
      setSelectedWindow(null);
      setCurrentTicket(null);
      setBranchServices([]);
      sessionStorage.removeItem(STORAGE_WINDOW_KEY);
      return;
    }

    let active = true;
    setIsLoadingWindows(true);
    setNotice(null);

    // Load branch services for live queue / redirection
    api
      .listBranchServices(selectedBranchId)
      .then((items) => {
        if (!active) return;
        setBranchServices(items);
      })
      .catch(() => {
        // Graceful fallback to window-level services
      });

    api
      .listWindows(selectedBranchId)
      .then((items) => {
        if (!active) return;
        setWindows(items);

        // Try restoring previously selected window if available
        const savedWindowId = sessionStorage.getItem(STORAGE_WINDOW_KEY);
        if (savedWindowId) {
          const matched = items.find((w) => w.id === savedWindowId);
          if (matched) {
            setSelectedWindow(matched);
          }
        }
      })
      .catch((err) => {
        if (!active) return;
        setNotice({
          type: 'error',
          message:
            err instanceof OperatorApiError
              ? `Ошибка загрузки окон: ${err.message}`
              : 'Не удалось загрузить окна отделения',
        });
      })
      .finally(() => {
        if (active) setIsLoadingWindows(false);
      });

    return () => {
      active = false;
    };
  }, [selectedBranchId]);

  // 3. Restore current ticket whenever selectedWindow changes
  const restoreCurrentTicket = useCallback(async (windowId: string) => {
    setIsLoadingTicket(true);
    try {
      const ticket = await api.getCurrentTicket(windowId);
      setCurrentTicket(ticket);
    } catch (err) {
      if (err instanceof OperatorApiError && err.code === 'NOT_FOUND') {
        setNotice({
          type: 'error',
          message: 'Выбранное окно не найдено на сервере',
        });
        setSelectedWindow(null);
        setCurrentTicket(null);
        sessionStorage.removeItem(STORAGE_WINDOW_KEY);
      } else {
        setNotice({
          type: 'error',
          message:
            err instanceof OperatorApiError
              ? `Ошибка получения текущего талона: ${err.message}`
              : 'Не удалось связаться с сервером при получении талона',
          retryAction: () => restoreCurrentTicket(windowId),
        });
      }
    } finally {
      setIsLoadingTicket(false);
    }
  }, []);

  useEffect(() => {
    if (selectedWindow) {
      restoreCurrentTicket(selectedWindow.id);
    } else {
      setCurrentTicket(null);
    }
  }, [selectedWindow, restoreCurrentTicket]);

  // Handle branch selection change
  const handleSelectBranch = (branchId: string) => {
    setSelectedBranchId(branchId);
    sessionStorage.setItem(STORAGE_BRANCH_KEY, branchId);
    // Reset window selection and stale ticket
    setSelectedWindow(null);
    setCurrentTicket(null);
    sessionStorage.removeItem(STORAGE_WINDOW_KEY);
    setNotice(null);
  };

  // Handle window selection change
  const handleSelectWindow = (win: OperatorWindow) => {
    setSelectedWindow(win);
    sessionStorage.setItem(STORAGE_WINDOW_KEY, win.id);
    setNotice(null);
  };

  // Action 1: Call Next
  const handleCallNext = async () => {
    if (!selectedWindow) return;
    setIsActionPending(true);
    setNotice(null);

    try {
      const ticket = await api.callNext(selectedWindow.id);
      setCurrentTicket(ticket);
    } catch (err) {
      if (err instanceof OperatorApiError) {
        if (err.code === 'NO_ELIGIBLE_TICKETS') {
          setNotice({
            type: 'info',
            message: 'Для услуг этого окна сейчас нет подходящих клиентов.',
          });
        } else if (err.code === 'WINDOW_BUSY') {
          setNotice({
            type: 'warning',
            message: 'У этого окна уже есть активный клиент. Синхронизируем...',
          });
          await restoreCurrentTicket(selectedWindow.id);
        } else if (err.code === 'INVALID_TICKET_STATE') {
          setNotice({
            type: 'warning',
            message: 'Недопустимое состояние талона на сервере. Синхронизируем...',
          });
          await restoreCurrentTicket(selectedWindow.id);
        } else {
          setNotice({
            type: 'error',
            message: `Ошибка вызова: ${err.message}`,
          });
        }
      } else {
        // Network error: DO NOT erase known currentTicket!
        setNotice({
          type: 'error',
          message: 'Не удалось связаться с сервером.',
          retryAction: handleCallNext,
        });
      }
    } finally {
      setIsActionPending(false);
    }
  };

  // Action 2: Start Service
  const handleStartService = async () => {
    if (!currentTicket || !selectedWindow) return;
    setIsActionPending(true);
    setNotice(null);

    try {
      const updatedTicket = await api.startService(currentTicket.id);
      setCurrentTicket(updatedTicket);
    } catch (err) {
      if (err instanceof OperatorApiError) {
        if (err.code === 'INVALID_TICKET_STATE' || err.code === 'WINDOW_BUSY') {
          setNotice({
            type: 'warning',
            message: 'Состояние талона изменилось. Выполняем синхронизацию...',
          });
          await restoreCurrentTicket(selectedWindow.id);
        } else {
          setNotice({
            type: 'error',
            message: `Ошибка начала обслуживания: ${err.message}`,
          });
        }
      } else {
        // Network error: DO NOT erase known ticket!
        setNotice({
          type: 'error',
          message: 'Не удалось связаться с сервером.',
          retryAction: handleStartService,
        });
      }
    } finally {
      setIsActionPending(false);
    }
  };

  // Action 3: Complete Service
  const handleCompleteService = async () => {
    if (!currentTicket || !selectedWindow) return;
    setIsActionPending(true);
    setNotice(null);

    try {
      const completedTicket = await api.completeService(currentTicket.id);
      // Briefly show completed notice, then clear active ticket
      setNotice({
        type: 'success',
        message: `Талон ${completedTicket.publicNumber} успешно обслужен.`,
      });
      setCurrentTicket(null);
    } catch (err) {
      if (err instanceof OperatorApiError) {
        if (err.code === 'INVALID_TICKET_STATE') {
          setNotice({
            type: 'warning',
            message: 'Недопустимое состояние талона на сервере. Синхронизируем...',
          });
          await restoreCurrentTicket(selectedWindow.id);
        } else {
          setNotice({
            type: 'error',
            message: `Ошибка завершения обслуживания: ${err.message}`,
          });
        }
      } else {
        // Network error: DO NOT erase known ticket!
        setNotice({
          type: 'error',
          message: 'Не удалось связаться с сервером.',
          retryAction: handleCompleteService,
        });
      }
    } finally {
      setIsActionPending(false);
    }
  };

  // Action 4: Create Live Queue Ticket
  const executeCreateLiveTicket = async (serviceId: string) => {
    if (!selectedWindow || !selectedBranchId) return;
    setIsActionPending(true);
    setNotice(null);

    const idempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `live-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      const created = await api.createLiveTicket(
        selectedWindow.id,
        selectedBranchId,
        serviceId,
        idempotencyKey
      );
      setIsLiveModalOpen(false);
      setNotice({
        type: 'success',
        message: `Талон живой очереди ${created.publicNumber} успешно добавлен в очередь.`,
      });
    } catch (err) {
      if (err instanceof OperatorApiError) {
        setNotice({
          type: 'error',
          message: `Ошибка создания талона: ${err.message}`,
        });
      } else {
        setNotice({
          type: 'error',
          message: 'Не удалось связаться с сервером при создании талона.',
        });
      }
    } finally {
      setIsActionPending(false);
    }
  };

  const handleCreateLiveClick = () => {
    if (!selectedWindow) return;
    const services =
      selectedWindow.services.length > 0 ? selectedWindow.services : branchServices;

    if (services.length === 0) {
      setNotice({
        type: 'warning',
        message: 'Для данного окна не настроены услуги.',
      });
      return;
    }

    if (services.length === 1) {
      executeCreateLiveTicket(services[0].id);
    } else {
      setSelectedLiveServiceId(services[0].id);
      setIsLiveModalOpen(true);
    }
  };

  // Action 5: Return Ticket to Queue
  const handleReturnTicket = async () => {
    if (!currentTicket || !selectedWindow) return;
    setIsActionPending(true);
    setNotice(null);

    try {
      const ticketNumber = currentTicket.publicNumber;
      await api.returnTicket(currentTicket.id, selectedWindow.id);
      setCurrentTicket(null);
      setNotice({
        type: 'success',
        message: `Талон ${ticketNumber} возвращён в очередь.`,
      });
    } catch (err) {
      if (err instanceof OperatorApiError) {
        if (err.code === 'INVALID_TICKET_STATE' || err.code === 'NOT_FOUND') {
          setNotice({
            type: 'warning',
            message: 'Состояние талона изменилось на сервере. Синхронизируем...',
          });
          await restoreCurrentTicket(selectedWindow.id);
        } else {
          setNotice({
            type: 'error',
            message: `Ошибка возврата талона: ${err.message}`,
          });
        }
      } else {
        setNotice({
          type: 'error',
          message: 'Не удалось связаться с сервером.',
          retryAction: handleReturnTicket,
        });
      }
    } finally {
      setIsActionPending(false);
    }
  };

  // Action 6: Redirect Ticket
  const handleOpenRedirect = () => {
    if (!currentTicket || !selectedWindow) return;
    const services = branchServices.length > 0 ? branchServices : selectedWindow.services;
    if (services.length === 0) {
      setNotice({
        type: 'warning',
        message: 'Нет доступных услуг для перенаправления.',
      });
      return;
    }
    const defaultService = services.find((s) => s.id !== currentTicket.serviceId) || services[0];
    setSelectedRedirectServiceId(defaultService.id);
    setIsRedirectModalOpen(true);
  };

  const handleConfirmRedirect = async () => {
    if (!currentTicket || !selectedWindow || !selectedRedirectServiceId) return;
    setIsActionPending(true);
    setNotice(null);

    try {
      await api.redirectTicket(currentTicket.id, selectedWindow.id, selectedRedirectServiceId);
      setCurrentTicket(null);
      setIsRedirectModalOpen(false);
      setNotice({
        type: 'success',
        message: 'Талон успешно перенаправлен.',
      });
    } catch (err) {
      if (err instanceof OperatorApiError) {
        if (err.code === 'INVALID_TICKET_STATE' || err.code === 'NOT_FOUND') {
          setNotice({
            type: 'warning',
            message: 'Состояние талона изменилось на сервере. Синхронизируем...',
          });
          setIsRedirectModalOpen(false);
          await restoreCurrentTicket(selectedWindow.id);
        } else {
          setNotice({
            type: 'error',
            message: `Ошибка перенаправления талона: ${err.message}`,
          });
        }
      } else {
        setNotice({
          type: 'error',
          message: 'Не удалось связаться с сервером при перенаправлении.',
        });
      }
    } finally {
      setIsActionPending(false);
    }
  };

  return (
    <div className="operator-container">
      <header className="operator-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Рабочее место оператора</h1>
          <p>Электронная очередь ПочтаТех — Управление обслуживанием клиентов</p>
        </div>
        <div>
          {api.isMockEnabled() ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="window-badge badge-open" style={{ padding: '6px 12px', fontSize: '12px' }}>
                ● Демо-режим активен
              </span>
              <button
                type="button"
                className="btn btn-retry"
                style={{ padding: '6px 12px', fontSize: '12px' }}
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.delete('mock');
                  window.location.href = url.toString();
                }}
              >
                К реальному серверу
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              style={{ minWidth: 'auto', padding: '8px 16px', fontSize: '13px' }}
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set('mock', '1');
                window.location.href = url.toString();
              }}
            >
              Включить демо-режим
            </button>
          )}
        </div>
      </header>

      {/* Notice / Alert Banners */}
      {notice && (
        <div
          role="alert"
          className={`alert-box ${
            notice.type === 'info'
              ? 'alert-info'
              : notice.type === 'warning'
              ? 'alert-warning'
              : notice.type === 'success'
              ? 'alert-success'
              : 'alert-error'
          }`}
        >
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <span>{notice.message}</span>
            {notice.demoAction && (
              <button
                type="button"
                className="btn btn-primary"
                style={{ minWidth: 'auto', padding: '6px 14px', fontSize: '13px' }}
                onClick={notice.demoAction}
              >
                Включить демо-режим
              </button>
            )}
            {notice.retryAction && (
              <button
                type="button"
                className="btn btn-retry"
                style={{ padding: '6px 14px', fontSize: '13px' }}
                onClick={notice.retryAction}
              >
                Повторить
              </button>
            )}
          </div>
          <button
            type="button"
            className="alert-close-btn"
            onClick={() => setNotice(null)}
            aria-label="Закрыть уведомление"
          >
            ×
          </button>
        </div>
      )}

      <div className="operator-grid">
        {/* Left column: Selection panels */}
        <aside className="operator-sidebar">
          <BranchSelector
            branches={branches}
            selectedBranchId={selectedBranchId}
            isLoading={isLoadingBranches}
            onSelectBranch={handleSelectBranch}
          />

          <WindowSelector
            windows={windows}
            selectedWindowId={selectedWindow?.id ?? null}
            isLoading={isLoadingWindows}
            branchSelected={Boolean(selectedBranchId)}
            onSelectWindow={handleSelectWindow}
          />
        </aside>

        {/* Right column: Main Workspace */}
        <main className="operator-main-workspace">
          {!selectedWindow ? (
            <div className="empty-ticket-state">
              <h3>Окно не выбрано</h3>
              <p>Пожалуйста, выберите отделение и рабочее окно в левой панели.</p>
            </div>
          ) : (
            <>
              {/* Window Status Bar */}
              <div className="current-window-bar">
                <div>
                  <h2 className="current-window-title">
                    Окно №{selectedWindow.number}
                  </h2>
                  <p className="current-window-subtitle">
                    Статус: <strong>{selectedWindow.status}</strong> | Услуги:{' '}
                    {selectedWindow.services.map((s) => s.name).join(', ') || 'Все'}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    type="button"
                    id="btn-create-live-ticket"
                    className="btn btn-create-live"
                    disabled={isActionPending}
                    onClick={handleCreateLiveClick}
                  >
                    + Выдать талон (Живая очередь)
                  </button>
                  <span className="window-badge badge-open">АКТИВНО</span>
                </div>
              </div>

              {/* Active Ticket Card or Empty State */}
              {isLoadingTicket ? (
                <div className="empty-ticket-state">
                  <p>Загрузка статуса окна...</p>
                </div>
              ) : (
                <TicketCard
                  ticket={currentTicket}
                  selectedWindow={selectedWindow}
                />
              )}

              {/* Action Buttons with strict state logic */}
              <ActionControls
                currentTicket={currentTicket}
                isPending={isActionPending || isLoadingTicket}
                onCallNext={handleCallNext}
                onStartService={handleStartService}
                onCompleteService={handleCompleteService}
                onReturnTicket={handleReturnTicket}
                onOpenRedirect={handleOpenRedirect}
              />
            </>
          )}
        </main>
      </div>

      {/* Live Queue Ticket Modal (when multiple services) */}
      {isLiveModalOpen && (
        <div
          className="operator-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="live-modal-title"
        >
          <div className="operator-modal">
            <div className="operator-modal-header">
              <h3 id="live-modal-title">Выдача талона живой очереди</h3>
              <button
                type="button"
                className="operator-modal-close"
                onClick={() => setIsLiveModalOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="operator-modal-body">
              <p>Выберите услугу для оформления талона в Окно №{selectedWindow?.number}:</p>
              <div className="operator-modal-field">
                <label htmlFor="select-live-service">Услуга:</label>
                <select
                  id="select-live-service"
                  className="operator-select"
                  value={selectedLiveServiceId}
                  onChange={(e) => setSelectedLiveServiceId(e.target.value)}
                >
                  {(selectedWindow && selectedWindow.services.length > 0
                    ? selectedWindow.services
                    : branchServices
                  ).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="operator-modal-actions">
              <button
                type="button"
                id="btn-cancel-create-live"
                className="btn btn-secondary"
                onClick={() => setIsLiveModalOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                id="btn-confirm-create-live"
                className="btn btn-primary"
                disabled={!selectedLiveServiceId || isActionPending}
                onClick={() => executeCreateLiveTicket(selectedLiveServiceId)}
              >
                {isActionPending ? <span className="spinner" /> : null}
                <span>Выдать талон</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Redirection Modal */}
      {isRedirectModalOpen && (
        <div
          className="operator-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="redirect-modal-title"
        >
          <div className="operator-modal">
            <div className="operator-modal-header">
              <h3 id="redirect-modal-title">
                Перенаправление талона {currentTicket?.publicNumber}
              </h3>
              <button
                type="button"
                className="operator-modal-close"
                onClick={() => setIsRedirectModalOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="operator-modal-body">
              <p>Выберите целевую услугу отделения для перенаправления талона:</p>
              <div className="operator-modal-field">
                <label htmlFor="select-redirect-service">Целевая услуга:</label>
                <select
                  id="select-redirect-service"
                  className="operator-select"
                  value={selectedRedirectServiceId}
                  onChange={(e) => setSelectedRedirectServiceId(e.target.value)}
                >
                  {(branchServices.length > 0
                    ? branchServices
                    : selectedWindow?.services || []
                  ).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="operator-modal-actions">
              <button
                type="button"
                id="btn-cancel-redirect"
                className="btn btn-secondary"
                onClick={() => setIsRedirectModalOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                id="btn-confirm-redirect"
                className="btn btn-primary"
                disabled={!selectedRedirectServiceId || isActionPending}
                onClick={handleConfirmRedirect}
              >
                {isActionPending ? <span className="spinner" /> : null}
                <span>Перенаправить</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
