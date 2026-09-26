import React from 'react';
import { Ticket, QueuePosition, TicketETA } from '../../../api/client/types';
import { Ticket as TicketIcon, Bell, Clock, Users, ChevronRight, CheckCircle2 } from 'lucide-react';

interface LiveTicketBannerProps {
  ticket: Ticket;
  serviceName?: string;
  branchName?: string;
  position?: QueuePosition | null;
  eta?: TicketETA | null;
  onOpenDetails: () => void;
  onCancelTicket?: () => void;
}

function getPeopleAheadWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'человек';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'человека';
  return 'человек';
}

export const LiveTicketBanner: React.FC<LiveTicketBannerProps> = ({
  ticket,
  serviceName = 'Почтовые услуги',
  branchName = 'Отделение Почты России',
  position,
  eta,
  onOpenDetails,
  onCancelTicket,
}) => {
  const isCalled = ticket.status === 'CALLED';
  const isServing = ticket.status === 'SERVING';
  const waitMinutes = eta?.estimatedWaitSeconds ? Math.ceil(eta.estimatedWaitSeconds / 60) : null;
  const peopleAhead =
    position?.position !== null && position?.position !== undefined && position.position > 0
      ? position.position - 1
      : null;

  const windowNum = ticket.window?.number ?? 4;
  const preparationHint =
    peopleAhead !== null && peopleAhead <= 2
      ? `Готовьтесь, окно №${windowNum} освобождается`
      : 'Ожидайте вызова на табло';

  return (
    <div
      className={`sticky bottom-16 sm:bottom-4 z-30 w-full rounded-2xl p-3.5 sm:p-4 shadow-xl border transition-all duration-300 ${
        isCalled || isServing
          ? 'bg-[#059669] text-white border-emerald-400/80 shadow-emerald-950/20'
          : 'bg-[#0B3558] text-white border-[#0055A5]/40 shadow-blue-950/25'
      }`}
      role="region"
      aria-label="Активный талон в очереди"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: Icon & Sleek Status Ticker */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`p-2.5 rounded-xl shrink-0 flex items-center justify-center ${
              isCalled
                ? 'bg-white/20 text-yellow-300 animate-bounce'
                : isServing
                ? 'bg-white/20 text-white'
                : 'bg-[#0055A5] text-white'
            }`}
          >
            {isCalled ? (
              <Bell size={22} className="stroke-[2.2]" />
            ) : isServing ? (
              <CheckCircle2 size={22} className="stroke-[2.2]" />
            ) : (
              <TicketIcon size={22} className="stroke-[2.2]" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            {/* Status Pills */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className={`text-[10px] font-mono uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                  isCalled
                    ? 'bg-yellow-400 text-slate-900 animate-pulse'
                    : isServing
                    ? 'bg-white/20 text-white'
                    : 'bg-[#006BFF] text-white'
                }`}
              >
                {isCalled ? '🔔 ВАС ВЫЗЫВАЮТ!' : isServing ? 'ИДЕТ ОБСЛУЖИВАНИЕ' : 'В ОЧЕРЕДИ'}
              </span>
              <span className="text-[11px] text-white/70 truncate hidden md:inline">
                {serviceName} • {branchName}
              </span>
            </div>

            {/* Sleek Flat Banner Info Line */}
            <div className="text-xs sm:text-sm text-white/95 leading-snug flex items-center gap-1.5 flex-wrap">
              <span>Ваш талон</span>
              <span className="font-mono font-black text-white px-1.5 py-0.5 rounded bg-white/10 text-sm sm:text-base tracking-tight">
                {ticket.publicNumber}
              </span>

              {isCalled && ticket.status === 'CALLED' && ticket.window && (
                <>
                  <span className="text-white/50">•</span>
                  <span className="font-bold text-yellow-300 text-sm sm:text-base">
                    Окно №{ticket.window.number}
                  </span>
                  <span className="text-white/50">•</span>
                  <span className="font-bold text-white">Пройдите к окну!</span>
                </>
              )}

              {isServing && ticket.window && (
                <>
                  <span className="text-white/50">•</span>
                  <span className="font-bold text-white">
                    Окно №{ticket.window.number}
                  </span>
                  <span className="text-white/50">•</span>
                  <span className="text-white/80">Идет прием</span>
                </>
              )}

              {!isCalled && !isServing && (
                <>
                  <span className="text-white/50">•</span>
                  <span>
                    Перед вами:{' '}
                    <strong className="font-mono font-bold text-white">
                      {peopleAhead !== null
                        ? peopleAhead
                        : position?.position != null && position.position > 0
                        ? position.position - 1
                        : 0}
                    </strong>{' '}
                    {getPeopleAheadWord(
                      peopleAhead ?? (position?.position != null ? Math.max(0, position.position - 1) : 0)
                    )}
                    {waitMinutes !== null && waitMinutes > 0 && ` (~${waitMinutes} мин)`}
                  </span>
                  <span className="text-white/50 hidden sm:inline">•</span>
                  <span className="text-blue-100 hidden sm:inline">{preparationHint}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0 justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-white/10">
          {onCancelTicket && !isCalled && !isServing && (
            <button
              type="button"
              onClick={onCancelTicket}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-xs text-white/90 font-medium transition-colors"
              title="Отказаться от талона"
            >
              Отказаться
            </button>
          )}

          <button
            type="button"
            onClick={onOpenDetails}
            className={`px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 active:scale-95 transition-all shadow-sm ${
              isCalled
                ? 'bg-white text-[#059669] hover:bg-emerald-50'
                : 'bg-[#006BFF] text-white hover:bg-[#0055A5]'
            }`}
          >
            <span>{isCalled ? 'К окну!' : 'Открыть талон'}</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
