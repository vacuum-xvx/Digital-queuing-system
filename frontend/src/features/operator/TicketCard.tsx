import React from 'react';
import { formatMoscowTime } from '../../utils/time';
import { Ticket, OperatorWindow } from '../../api/operator/types';
import { Service } from '../../api/client/types';
import {
  SolarTicket,
  SolarQr,
  SolarClock,
  SolarBell,
  SolarBox,
  SolarOperator,
  Icon3DTicket,
} from '../../components/common/PostalIcons';
import { Calendar } from 'lucide-react';

interface TicketCardProps {
  ticket: Ticket | null;
  selectedWindow: OperatorWindow;
  services?: Service[];
}

function getTicketSourceConfig(source: Ticket['source']): { label: string; icon: React.ReactNode; badgeClass: string } {
  switch (source) {
    case 'APPOINTMENT':
      return {
        label: 'Предварительная запись',
        icon: <Calendar className="w-3.5 h-3.5 shrink-0 text-[#1A34E8]" />,
        badgeClass: 'bg-indigo-50 text-indigo-950 border-indigo-200 shadow-2xs font-bold',
      };
    case 'QR':
      return {
        label: 'QR-код (смартфон)',
        icon: <SolarQr size={15} variant="duotone" color="#1A34E8" secondaryColor="#5975FF" className="shrink-0" />,
        badgeClass: 'bg-blue-50 text-[#1A34E8] border-blue-200 shadow-2xs font-bold',
      };
    case 'LIVE':
      return {
        label: 'Живая очередь (терминал)',
        icon: <SolarTicket size={15} variant="duotone" color="#B45309" secondaryColor="#F59E0B" className="shrink-0" />,
        badgeClass: 'bg-amber-50 text-amber-950 border-amber-300 shadow-2xs font-bold',
      };
    default:
      return {
        label: source || 'Живая очередь',
        icon: <SolarTicket size={15} variant="duotone" color="#475569" className="shrink-0" />,
        badgeClass: 'bg-slate-100 text-slate-800 border-slate-300 font-bold',
      };
  }
}

function getTicketStatusConfig(status: Ticket['status']): { label: string; badgeClass: string; icon?: React.ReactNode } {
  switch (status) {
    case 'SCHEDULED':
      return {
        label: 'Запись подтверждена',
        badgeClass: 'bg-blue-50 text-blue-900 border-blue-200 font-bold',
      };
    case 'WAITING':
      return {
        label: 'В очереди',
        badgeClass: 'bg-slate-100 text-slate-800 border-slate-300 font-bold',
      };
    case 'CALLED':
      return {
        label: 'Вас вызывают',
        badgeClass: 'bg-amber-50 text-amber-950 border-amber-300 ring-1 ring-amber-400/50 font-bold shadow-2xs',
        icon: <SolarBell size={13} variant="duotone" color="#C2410C" secondaryColor="#FB923C" className="animate-bounce" />,
      };
    case 'SERVING':
      return {
        label: 'В обслуживании',
        badgeClass: 'bg-emerald-50 text-emerald-950 border-emerald-300 ring-1 ring-emerald-400/50 font-bold shadow-2xs',
        icon: <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />,
      };
    case 'COMPLETED':
      return {
        label: 'Обслуживание завершено',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold',
      };
    case 'CANCELLED':
      return {
        label: 'Запись отменена',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200 font-bold',
      };
    case 'NO_SHOW':
      return {
        label: 'Не явился',
        badgeClass: 'bg-rose-50 text-rose-900 border-rose-300 font-bold',
      };
    default:
      return {
        label: status,
        badgeClass: 'bg-slate-100 text-slate-800 border-slate-300 font-bold',
      };
  }
}

export const TicketCard: React.FC<TicketCardProps> = ({ ticket, selectedWindow, services }) => {
  if (!ticket) {
    return (
      <div className="text-center py-10 px-4 space-y-3 bg-gradient-to-b from-slate-50/80 to-blue-50/20 rounded-3xl border border-dashed border-slate-200/90 shadow-2xs">
        <div className="w-16 h-16 rounded-2xl bg-white border border-blue-100/80 flex items-center justify-center mx-auto shadow-sm">
          <Icon3DTicket size={44} className="drop-shadow-xs" />
        </div>
        <h3 className="text-sm font-black text-[#010E3E] tracking-tight">Нет активного талона</h3>
        <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
          Окно №{selectedWindow.number} свободно. Нажмите кнопку «Вызвать следующего», чтобы
          пригласить клиента из очереди.
        </p>
      </div>
    );
  }

  const isCalled = ticket.status === 'CALLED';
  const isServing = ticket.status === 'SERVING';
  const sourceConfig = getTicketSourceConfig(ticket.source);
  const statusConfig = getTicketStatusConfig(ticket.status);

  // Тип услуги: сначала каталог услуг отделения, затем услуги выбранного окна
  const serviceName =
    services?.find(s => s.id === ticket.serviceId)?.name ||
    selectedWindow.services.find(s => s.id === ticket.serviceId)?.name ||
    'Услуга не указана';

  return (
    <div
      className={`p-5 sm:p-6 rounded-3xl bg-white border shadow-sm space-y-4 transition-all duration-200 ${
        isCalled
          ? 'border-amber-300 ring-2 ring-amber-400/20 shadow-amber-500/5'
          : isServing
          ? 'border-emerald-300 ring-2 ring-emerald-400/20 shadow-emerald-500/5'
          : 'border-slate-200/90'
      }`}
    >
      {/* Meta Top Line */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`px-2.5 py-1 rounded-xl text-[11px] font-bold font-mono border flex items-center gap-1.5 transition-colors ${sourceConfig.badgeClass}`}>
            {sourceConfig.icon}
            <span>{sourceConfig.label}</span>
          </span>
          <span className={`px-2.5 py-1 rounded-xl text-[11px] font-bold font-mono border flex items-center gap-1.5 transition-colors ${statusConfig.badgeClass}`}>
            {statusConfig.icon}
            <span>{statusConfig.label}</span>
          </span>
        </div>

        <div className="text-xs font-mono text-[#010E3E] font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200">
          <SolarOperator size={14} variant="duotone" color="#010E3E" secondaryColor="#1A34E8" />
          <span>Окно <strong>№{ticket.window?.number ?? selectedWindow.number}</strong></span>
        </div>
      </div>

      {/* Main Ticket Number */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">
            Талон клиента
          </div>
          <div className="ticket-number text-5xl sm:text-6xl font-black font-mono text-[#1A34E8] tracking-tight my-1 select-all drop-shadow-xs">
            {ticket.publicNumber}
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-xl w-fit mt-1">
            <SolarBox size={14} variant="duotone" color="#1A34E8" secondaryColor="#5975FF" className="shrink-0" />
            <span>{serviceName}</span>
          </div>
        </div>

        <div className="space-y-1.5 text-xs font-mono sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 text-slate-600">
          {ticket.calledAt && (
            <div className="flex items-center sm:justify-end gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-950 font-bold">
              <SolarBell size={14} variant="duotone" color="#D97706" secondaryColor="#F59E0B" className="shrink-0" />
              <span>Вызов: <strong className="font-black">{formatMoscowTime(ticket.calledAt)}</strong></span>
            </div>
          )}
          {ticket.serviceStartedAt && (
            <div className="flex items-center sm:justify-end gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-emerald-950 font-bold">
              <SolarClock size={14} variant="duotone" color="#059669" secondaryColor="#34D399" className="shrink-0" />
              <span>Приём: <strong className="font-black">{formatMoscowTime(ticket.serviceStartedAt)}</strong></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
