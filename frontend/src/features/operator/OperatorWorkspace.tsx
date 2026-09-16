import React, { useEffect, useState, useCallback } from 'react';
import {
  Branch,
  OperatorWindow,
  Ticket,
  OperatorApiError,
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

  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);

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

  // 2. Load windows when selectedBranchId changes
  useEffect(() => {
    if (!selectedBranchId) {
      setWindows([]);
      setSelectedWindow(null);
      setCurrentTicket(null);
      sessionStorage.removeItem(STORAGE_WINDOW_KEY);
      return;
    }

    let active = true;
    setIsLoadingWindows(true);
    setNotice(null);

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
                <div>
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
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
};
