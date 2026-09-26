import React from 'react';
import { Ticket } from '../../api/operator/types';
import { Play, Check, UserX, Volume2 } from 'lucide-react';
import { SolarBell } from '../../components/common/PostalIcons';

interface ActionControlsProps {
  currentTicket: Ticket | null;
  isPending: boolean;
  onCallNext: () => void;
  onStartService: () => void;
  onCompleteService: () => void;
  onNoShow: () => void;
  onRepeatCall?: () => void;
  onReturnToQueue?: () => void;
}

export const ActionControls: React.FC<ActionControlsProps> = ({
  currentTicket,
  isPending,
  onCallNext,
  onStartService,
  onCompleteService,
  onNoShow,
  onRepeatCall,
}) => {
  const isNoTicket = currentTicket === null;
  const isCalled = currentTicket?.status === 'CALLED';
  const isServing = currentTicket?.status === 'SERVING';

  const canCallNext = isNoTicket && !isPending;
  const canStart = isCalled && !isPending;
  const canComplete = isServing && !isPending;

  return (
    <div className="space-y-3 w-full">
      {/* Primary Action Button Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Call Next Button */}
        <button
          type="button"
          id="btn-call-next"
          disabled={!canCallNext}
          onClick={onCallNext}
          className="min-h-[50px] py-3 px-4 rounded-2xl bg-[#1A34E8] hover:bg-[#010E3E] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-[#1A34E8]/20 transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer"
        >
          <Volume2 className="w-4 h-4 text-emerald-300" />
          <span>Вызвать следующего</span>
        </button>

        {/* Complete Service Button */}
        <button
          type="button"
          id="btn-complete-service"
          disabled={!canComplete}
          onClick={onCompleteService}
          className="min-h-[50px] py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer"
        >
          <Check className="w-5 h-5" />
          <span>Завершить обслуживание</span>
        </button>
      </div>

      {/* Secondary Actions (Start service, Repeat Call, No-Show) */}
      <div className={`grid grid-cols-1 ${isCalled && onRepeatCall ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-2 text-xs font-semibold`}>
        {/* Start Service Button */}
        <button
          type="button"
          id="btn-start-service"
          disabled={!canStart}
          onClick={onStartService}
          className="min-h-[42px] px-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 flex items-center justify-center gap-1.5 font-bold transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer"
        >
          <Play className="w-4 h-4 text-amber-700" />
          <span>Начать обслуживание</span>
        </button>

        {/* Repeat Call Button (Voice & Chime) */}
        {isCalled && onRepeatCall && (
          <button
            type="button"
            id="btn-repeat-call"
            disabled={isPending}
            onClick={onRepeatCall}
            className="min-h-[42px] px-3 rounded-xl border border-[#1A34E8]/30 bg-blue-50 hover:bg-blue-100 text-[#1A34E8] flex items-center justify-center gap-1.5 font-bold transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer"
            title="Повторить звуковой гонг и голосовой вызов в зале"
          >
            <SolarBell size={16} variant="duotone" color="#1A34E8" secondaryColor="#5975FF" />
            <span>Повторить вызов</span>
          </button>
        )}

        {/* No Show Button */}
        <button
          type="button"
          id="btn-no-show"
          disabled={!isCalled || isPending}
          onClick={onNoShow}
          className="min-h-[42px] px-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 flex items-center justify-center gap-1.5 font-bold transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer"
        >
          <UserX className="w-4 h-4 text-rose-600" />
          <span>Не явился</span>
        </button>
      </div>
    </div>
  );
};
