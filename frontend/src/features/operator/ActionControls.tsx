import React from 'react';
import { Ticket } from '../../api/operator/types';

interface ActionControlsProps {
  currentTicket: Ticket | null;
  isPending: boolean;
  onCallNext: () => void;
  onStartService: () => void;
  onCompleteService: () => void;
  onReturnTicket: () => void;
  onOpenRedirect: () => void;
}

export const ActionControls: React.FC<ActionControlsProps> = ({
  currentTicket,
  isPending,
  onCallNext,
  onStartService,
  onCompleteService,
  onReturnTicket,
  onOpenRedirect,
}) => {
  const isNoTicket = currentTicket === null;
  const isCalled = currentTicket?.status === 'CALLED';
  const isServing = currentTicket?.status === 'SERVING';

  // Strict Button Rules from Sprint #1 frozen contracts:
  // No ticket: Call Next: enabled, Start: disabled, Complete: disabled
  // CALLED:    Call Next: disabled, Start: enabled, Complete: disabled
  // SERVING:   Call Next: disabled, Start: disabled, Complete: enabled
  const canCallNext = isNoTicket && !isPending;
  const canStart = isCalled && !isPending;
  const canComplete = isServing && !isPending;

  const canReturnOrRedirect = (isCalled || isServing) && !isPending;

  return (
    <div className="action-buttons-group">
      <button
        type="button"
        id="btn-call-next"
        className="btn btn-primary"
        disabled={!canCallNext}
        onClick={onCallNext}
      >
        {isPending && isNoTicket ? <span className="spinner" /> : null}
        <span>Вызвать следующего</span>
      </button>

      <button
        type="button"
        id="btn-start-service"
        className="btn btn-warning"
        disabled={!canStart}
        onClick={onStartService}
      >
        {isPending && isCalled ? <span className="spinner" /> : null}
        <span>Начать обслуживание</span>
      </button>

      <button
        type="button"
        id="btn-complete-service"
        className="btn btn-success"
        disabled={!canComplete}
        onClick={onCompleteService}
      >
        {isPending && isServing ? <span className="spinner" /> : null}
        <span>Завершить обслуживание</span>
      </button>

      <button
        type="button"
        id="btn-return-ticket"
        className="btn btn-secondary"
        disabled={!canReturnOrRedirect}
        onClick={onReturnTicket}
      >
        <span>Вернуть в очередь</span>
      </button>

      <button
        type="button"
        id="btn-redirect-ticket"
        className="btn btn-secondary"
        disabled={!canReturnOrRedirect}
        onClick={onOpenRedirect}
      >
        <span>Перенаправить</span>
      </button>
    </div>
  );
};
