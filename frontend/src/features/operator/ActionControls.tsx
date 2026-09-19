import React from 'react';
import { Ticket } from '../../api/operator/types';
import { Play, Check, UserX, Volume2 } from 'lucide-react';

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
  onReturnToQueue,
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
          className="min-h-[50px] py-3 px-4 rounded-2xl bg-[#003B73] hover:bg-[#054FA6] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
          className="min-h-[50px] py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
          className="min-h-[42px] px-3 rounded-xl border border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-900 flex items-center justify-center gap-1.5 font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
            className="min-h-[42px] px-3 rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100 text-[#003B73] flex items-center justify-center gap-1.5 font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            title="Повторить звуковой гонг и голосовой вызов в зале"
          >
            <Volume2 className="w-4 h-4 text-[#003B73]" />
            <span>Повторить вызов</span>
          </button>
        )}

        {/* No Show Button */}
        <button
          type="button"
          id="btn-no-show"
          disabled={!isCalled || isPending}
          onClick={onNoShow}
          className="min-h-[42px] px-3 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-[#D92534] flex items-center justify-center gap-1.5 font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <UserX className="w-4 h-4 text-[#D92534]" />
          <span>Не явился</span>
        </button>
      </div>
    </div>
  );
};
