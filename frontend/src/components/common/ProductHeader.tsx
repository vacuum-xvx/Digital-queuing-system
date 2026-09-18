import React, { useEffect, useState } from 'react';
import { BarChart3, Clock, Eye, UserPlus, UserX, Volume2, VolumeX } from 'lucide-react';
import { PochtaEmblem, PochtaWordmark } from './PochtaBrand';
import { getMe, logout, User } from '../../api/authApi';
import { ClientAuthModal } from '../../features/auth/ClientAuthModal';

interface ProductHeaderProps {
  currentPath: string;
}

export function ProductHeader({ currentPath }: ProductHeaderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isHighContrast, setIsHighContrast] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    let active = true;
    getMe()
      .then((user) => {
        if (active) setCurrentUser(user);
      })
      .catch(() => {
        // Guest user
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('ru-RU', {
          timeZone: 'Europe/Moscow',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      setCurrentUser(null);
    } catch {
      // ignore
    }
  };

  const toggleContrast = () => {
    setIsHighContrast((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('high-contrast');
      } else {
        document.documentElement.classList.remove('high-contrast');
      }
      return next;
    });
  };

  const isStaffArea = currentPath.startsWith('/operator') || currentPath.startsWith('/admin');

  return (
    <>
      <header className="bg-[#003B73] text-white shadow-lg sticky top-0 z-40">
        {/* Top Status & Brand Line */}
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10">
          {/* Brand Block */}
          <a href="/" className="flex items-center gap-3 select-none group transition-transform">
            <PochtaEmblem className="w-9 h-9 shrink-0 drop-shadow-md transition-transform group-hover:scale-105" bg="#003B73" fg="#FFFFFF" />
            <div className="flex flex-col">
              <PochtaWordmark className="h-4 sm:h-5 w-auto" color="#FFFFFF" />
              <div className="text-[11px] text-blue-200 flex items-center gap-1.5 mt-0.5 font-medium">
                <span className="font-mono">Главпочтамт · Электронная очередь</span>
              </div>
            </div>
          </a>

          {/* Quick Tools Panel */}
          <div className="flex items-center gap-2 text-xs font-mono">
            {/* Audio Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border transition-all ${
                soundEnabled
                  ? 'bg-white/15 border-white/30 text-white hover:bg-white/25'
                  : 'bg-black/20 border-white/15 text-blue-200 hover:bg-white/10'
              }`}
              title="Звуковое оповещение"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-[#86BBFF]" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
              <span className="font-bold hidden sm:inline">{soundEnabled ? 'Звук: ВКЛ' : 'Звук: ВЫКЛ'}</span>
            </button>

            {/* Accessibility Mode */}
            <button
              type="button"
              onClick={toggleContrast}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition-all ${
                isHighContrast
                  ? 'bg-[#FFE600] text-black border-black font-black'
                  : 'bg-black/25 border-white/15 text-blue-100 hover:bg-white/10'
              }`}
              title="Режим для слабовидящих"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Доступность</span>
            </button>

            {/* Moscow Clock */}
            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-lg border border-white/15 text-white font-bold">
              <Clock className="w-3.5 h-3.5 text-[#86BBFF]" />
              <span>{timeStr || 'МСК'}</span>
            </div>

            {/* Auth / Account Area */}
            <div className="flex items-center gap-2 border-l border-white/20 pl-2 ml-1">
              {currentUser ? (
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-bold text-white max-w-[120px] truncate">{currentUser.email.split('@')[0]}</span>
                    <span className="text-[9px] text-blue-200 font-mono uppercase">
                      {currentUser.role === 'opc_chief' ? 'Начальник ОПС' : currentUser.role === 'employee' ? 'Оператор' : 'Клиент'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="p-1.5 hover:bg-white/20 rounded-lg text-blue-100 transition-colors"
                    title="Выйти из учётной записи"
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                </div>
              ) : !isStaffArea ? (
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#003B73] hover:bg-blue-50 rounded-lg text-xs font-bold transition-colors shadow-sm"
                  title="Войти в личный кабинет клиента"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Личный кабинет</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Secondary Navigation (Staff Only) */}
        {isStaffArea && (
          <div className="max-w-7xl mx-auto px-4 py-1.5 flex items-center justify-between text-xs text-blue-100 font-medium border-t border-white/5">
            <nav aria-label="Разделы системы" className="flex items-center gap-4">
              <a
                href="/operator"
                className={`hover:text-white transition-colors pb-0.5 ${currentPath.startsWith('/operator') ? 'text-white font-bold border-b-2 border-white' : 'text-blue-200'}`}
              >
                Окно оператора
              </a>
              <span className="text-white/30">·</span>
              <a
                href="/admin"
                className={`hover:text-white transition-colors pb-0.5 ${currentPath.startsWith('/admin') ? 'text-white font-bold border-b-2 border-white' : 'text-blue-200'}`}
              >
                Панель начальника ОПС
              </a>
            </nav>

            <a
              href={`${window.location.protocol}//${window.location.hostname}:3001`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-blue-200 hover:text-white transition-colors font-semibold"
              title="Перейти в систему мониторинга Grafana (Метрики, Логи, Алерты)"
            >
              <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
              <span>Grafana (Метрики & Логи) ↗</span>
            </a>
          </div>
        )}

        {/* Thin Postal Red Line */}
        <div className="h-[2px] w-full bg-[#D92534]"></div>
      </header>

      <ClientAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onUserChanged={(user) => setCurrentUser(user)}
      />
    </>
  );
}
