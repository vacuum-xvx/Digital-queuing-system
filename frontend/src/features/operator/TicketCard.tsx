import React from 'react';
import { Ticket, OperatorWindow } from '../../api/operator/types';

interface TicketCardProps {
  ticket: Ticket | null;
  selectedWindow: OperatorWindow;
}

function getTicketSourceLabel(source: Ticket['source']): string {
  switch (source) {
    case 'QR':
      return 'QR';
    case 'APPOINTMENT':
      return 'Предварительная запись';
    case 'LIVE':
      return 'Живая очередь';
    default:
      return source;
  }
}

function getTicketStatusLabel(status: Ticket['status']): string {
  const labels: Record<Ticket['status'], string> = {
    SCHEDULED: 'Запись подтверждена', WAITING: 'Вы в очереди', CALLED: 'Вас вызывают',
    SERVING: 'Идёт обслуживание', COMPLETED: 'Обслуживание завершено', CANCELLED: 'Запись отменена', NO_SHOW: 'Вы не подошли к окну',
  };
  return labels[status];
}

export const TicketCard: React.FC<TicketCardProps> = ({ ticket, selectedWindow }) => {
  if (!ticket) {
    return (
      <div className="empty-ticket-state">
        <h3>Нет активного талона</h3>
        <p>
          Окно №{selectedWindow.number} свободно. Нажмите кнопку «Вызвать следующего», чтобы
          пригласить клиента из очереди.
        </p>
      </div>
    );
  }

  const isCalled = ticket.status === 'CALLED';
  const isServing = ticket.status === 'SERVING';
  const sourceLabel = getTicketSourceLabel(ticket.source);
  const sourceClass =
    ticket.source === 'APPOINTMENT'
      ? 'badge-source-appointment'
      : ticket.source === 'LIVE'
      ? 'badge-source-live'
      : 'badge-source-qr';

  return (
    <div className={`ticket-card ${isCalled ? 'called' : ''} ${isServing ? 'serving' : ''}`}>
      <div className="ticket-header-meta">
        <span className={`ticket-source-badge ${sourceClass}`}>
          Источник: {sourceLabel}
        </span>
        <span
          className={`ticket-status-badge ${
            isCalled ? 'called' : isServing ? 'serving' : ''
          }`}
        >
          {getTicketStatusLabel(ticket.status)}
        </span>
      </div>

      <div className="ticket-number">{ticket.publicNumber}</div>

      <div className="ticket-details">
        <div>
          Назначено: <strong>Окно №{ticket.window?.number ?? selectedWindow.number}</strong>
        </div>
        {ticket.calledAt && (
          <div style={{ marginTop: '4px' }}>
            Время вызова: {new Date(ticket.calledAt).toLocaleTimeString()}
          </div>
        )}
        {ticket.serviceStartedAt && (
          <div style={{ marginTop: '4px' }}>
            Начало обслуживания: {new Date(ticket.serviceStartedAt).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
};
