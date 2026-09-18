import React from 'react';
import { formatMoscowTime } from '../../utils/time';
import { Ticket, OperatorWindow } from '../../api/operator/types';
import { UserX, Clock, Tag } from 'lucide-react';

interface TicketCardProps {
  ticket: Ticket | null;
  selectedWindow: OperatorWindow;
}

function getTicketSourceLabel(source: Ticket['source']): string {
  switch (source) {
    case 'QR':
      return 'QR-код';
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
    SCHEDULED: 'Запись подтверждена',
    WAITING: 'В очереди',
    CALLED: 'Вас вызывают',
    SERVING: 'В обслуживании',
    COMPLETED: 'Обслуживание завершено',
    CANCELLED: 'Запись отменена',
    NO_SHOW: 'Не явился',
  };
  return labels[status] || status;
}

export const TicketCard: React.FC<TicketCardProps> = ({ ticket, selectedWindow }) => {
  if (!ticket) {
    return (
      <div className="text-center py-10 px-4 space-y-3 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400 shadow-inner">
          <UserX className="w-7 h-7" />
        </div>
        <h3 className="text-sm font-black text-slate-800 tracking-tight">Нет активного талона</h3>
        <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
          Окно №{selectedWindow.number} свободно. Нажмите кнопку «Вызвать следующего», чтобы
          пригласить клиента из очереди.
        </p>
      </div>
    );
  }

  const isCalled = ticket.status === 'CALLED';
  const isServing = ticket.status === 'SERVING';
  const sourceLabel = getTicketSourceLabel(ticket.source);

  return (
    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm space-y-4">
      {/* Meta Top Line */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono bg-blue-50 text-[#054FA6] border border-blue-200 flex items-center gap-1">
            <Tag className="w-3 h-3" /> {sourceLabel}
          </span>
          <span
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono border ${
              isCalled
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : isServing
                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                : 'bg-slate-200 text-slate-800 border-slate-300'
            }`}
          >
            {getTicketStatusLabel(ticket.status)}
          </span>
        </div>

        <div className="text-xs font-mono text-slate-600 font-bold">
          Окно <strong>№{ticket.window?.number ?? selectedWindow.number}</strong>
        </div>
      </div>

      {/* Main Ticket Number */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
            Талон клиента
          </div>
          <div className="ticket-number text-5xl sm:text-6xl font-black font-mono text-[#003B73] tracking-tight my-1">
            {ticket.publicNumber}
          </div>
          <div className="text-xs font-semibold text-slate-700">
            {(ticket as any).service?.name || 'Почтовые услуги'}
          </div>
        </div>

        <div className="space-y-1.5 text-xs font-mono sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 text-slate-600">
          {ticket.calledAt && (
            <div className="flex items-center sm:justify-end gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Вызов: <strong>{formatMoscowTime(ticket.calledAt)}</strong></span>
            </div>
          )}
          {ticket.serviceStartedAt && (
            <div className="flex items-center sm:justify-end gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Приём: <strong>{formatMoscowTime(ticket.serviceStartedAt)}</strong></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
