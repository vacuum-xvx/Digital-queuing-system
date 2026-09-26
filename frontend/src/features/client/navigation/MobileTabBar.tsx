import React from 'react';
import { Home, Map, Ticket as TicketIcon, Calendar, User, PlusCircle } from 'lucide-react';
import { SolarTicket, SolarClock } from '../../../components/common/PostalIcons';

interface MobileTabBarProps {
  currentScreen: 'home' | 'booking' | 'walkin' | 'my';
  activeTicketsCount: number;
  onNavigateHome: () => void;
  onNavigateBooking: () => void;
  onNavigateWalkin: () => void;
  onNavigateMy: () => void;
  onOpenMap: () => void;
  onOpenProfile: () => void;
}

export const MobileTabBar: React.FC<MobileTabBarProps> = ({
  currentScreen,
  activeTicketsCount,
  onNavigateHome,
  onNavigateBooking,
  onNavigateWalkin,
  onNavigateMy,
  onOpenMap,
  onOpenProfile,
}) => {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-[#D4E0ED] sm:hidden shadow-[0_-4px_20px_rgba(11,53,88,0.06)] px-2 py-1.5"
      role="navigation"
      aria-label="Мобильное меню"
    >
      <div className="grid grid-cols-5 items-center justify-around">
        
        {/* 1. Главная */}
        <button
          type="button"
          onClick={onNavigateHome}
          className={`flex flex-col items-center justify-center py-1 transition-colors ${
            currentScreen === 'home' ? 'text-[#0055A5]' : 'text-[#476788] hover:text-[#0B3558]'
          }`}
        >
          <Home size={20} className={currentScreen === 'home' ? 'stroke-[2.5]' : 'stroke-2'} />
          <span className="text-[10px] font-bold mt-1">Главная</span>
        </button>

        {/* 2. Карта (Где быстрее) */}
        <button
          type="button"
          onClick={onOpenMap}
          className="flex flex-col items-center justify-center py-1 text-[#476788] hover:text-[#0B3558] transition-colors"
        >
          <Map size={20} className="stroke-2" />
          <span className="text-[10px] font-bold mt-1">Карта</span>
        </button>

        {/* 3. Central Action: Талон / Мои талоны */}
        <button
          type="button"
          onClick={() => {
            if (activeTicketsCount > 0) {
              onNavigateMy();
            } else {
              onNavigateWalkin();
            }
          }}
          className="flex flex-col items-center justify-center -mt-3 group"
        >
          <div className="w-12 h-12 rounded-full bg-[#0055A5] text-white flex items-center justify-center shadow-lg shadow-blue-800/30 group-active:scale-95 transition-transform relative">
            <TicketIcon size={22} className="stroke-[2.2]" />
            {activeTicketsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#FC3F1D] text-white text-[10px] font-mono font-bold flex items-center justify-center border-2 border-white animate-pulse">
                {activeTicketsCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold text-[#0B3558] mt-0.5">
            {activeTicketsCount > 0 ? 'Талоны' : 'Взять'}
          </span>
        </button>

        {/* 4. Запись */}
        <button
          type="button"
          onClick={onNavigateBooking}
          className={`flex flex-col items-center justify-center py-1 transition-colors ${
            currentScreen === 'booking' ? 'text-[#0055A5]' : 'text-[#476788] hover:text-[#0B3558]'
          }`}
        >
          <Calendar size={20} className={currentScreen === 'booking' ? 'stroke-[2.5]' : 'stroke-2'} />
          <span className="text-[10px] font-bold mt-1">Запись</span>
        </button>

        {/* 5. Личный Кабинет / Профиль */}
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex flex-col items-center justify-center py-1 text-[#476788] hover:text-[#0B3558] transition-colors"
        >
          <User size={20} className="stroke-2" />
          <span className="text-[10px] font-bold mt-1">Кабинет</span>
        </button>

      </div>
    </nav>
  );
};
