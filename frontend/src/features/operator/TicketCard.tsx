import React from 'react';
import { Ticket, OperatorWindow } from '../../api/operator/types';

interface TicketCardProps {
  ticket: Ticket | null;
  selectedWindow: OperatorWindow;
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

  return (
    <div className={`ticket-card ${isCalled ? 'called' : ''} ${isServing ? 'serving' : ''}`}>
      <div className="ticket-header-meta">
        <span className="ticket-source-badge">Источник: {ticket.source}</span>
        <span
          className={`ticket-status-badge ${
            isCalled ? 'called' : isServing ? 'serving' : ''
          }`}
        >
          {isCalled ? 'ВЫЗВАН (CALLED)' : isServing ? 'ОБСЛУЖИВАЕТСЯ (SERVING)' : ticket.status}
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
