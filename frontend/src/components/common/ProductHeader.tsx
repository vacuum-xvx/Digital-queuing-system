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
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isA11y, setIsA11y] = useState(() => {
    try {
      return localStorage.getItem('pochta_a11y') === 'true';
    } catch {
      return false;
    }
  });
  const [a11yOpen, setA11yOpen] = useState(false);
  const [scale, setScale] = useState(() => Number(localStorage.getItem('pochta_a11y_scale') || (isA11y ? '115' : '100')));
  const [contrast, setContrast] = useState(() => localStorage.getItem('pochta_a11y_contrast') === 'true');
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem('pochta_a11y_motion') === 'true');
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    if (isA11y) {
      document.documentElement.classList.add('a11y-mode');
      try {
        localStorage.setItem('pochta_a11y', 'true');
      } catch {}
    } else {
      document.documentElement.classList.remove('a11y-mode');
      try {
        localStorage.removeItem('pochta_a11y');
      } catch {}
    }
  }, [isA11y]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${scale}%`;
    localStorage.setItem('pochta_a11y_scale', String(scale));
  }, [scale]);

  useEffect(() => {
    document.documentElement.classList.toggle('a11y-contrast', isA11y && contrast);
    localStorage.setItem('pochta_a11y_contrast', String(contrast));
  }, [contrast, isA11y]);

  useEffect(() => {
    document.documentElement.toggleAttribute('data-reduced-motion', reducedMotion);
    localStorage.setItem('pochta_a11y_motion', String(reducedMotion));
  }, [reducedMotion]);

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
      // Уведомляем AuthBoundary, чтобы на /operator и /admin сразу
      // показалась форма входа без перезагрузки страницы.
      window.dispatchEvent(new CustomEvent('pochta:logout'));
      // Клиентские экраны должны сбросить «мои талоны» на анонимного владельца.
      window.dispatchEvent(new CustomEvent('pochta:auth'));
    } catch {
      // ignore
    }
  };

  const isStaffArea = currentPath.startsWith('/operator') || currentPath.startsWith('/admin');

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-[#FFE600] focus:text-black focus:px-4 focus:py-2">К содержимому</a>
      <header className="main-product-header bg-[#003B73] text-white shadow-lg sticky top-0 z-40">
        {/* Top Status & Brand Line */}
        <div className="max-w-7xl mx-auto px-2.5 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-1.5 sm:gap-2 border-b border-white/10">
          {/* Brand Block */}
          <a href="/" className="flex items-center gap-2 sm:gap-3 select-none group transition-transform shrink-0">
            <PochtaEmblem className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 drop-shadow-md transition-transform group-hover:scale-105" bg="#003B73" fg="#FFFFFF" />
            <div className="flex flex-col">
              <PochtaWordmark className="h-3 sm:h-5 w-auto" color="#FFFFFF" />
              <div className="text-[10px] sm:text-[11px] text-blue-200 hidden xs:flex items-center gap-1.5 mt-0.5 font-medium">
                <span className="font-mono">Электронная очередь</span>
              </div>
            </div>
          </a>

          {/* Quick Tools Panel */}
          <div className="flex items-center gap-1 sm:gap-2 text-xs font-mono shrink-0">
            {/* Audio Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled((v) => !v)}
              className="cx-header-btn h-8 w-8 sm:w-auto sm:min-w-[104px] sm:px-2.5 sm:gap-1.5"
              title="Звуковое оповещение"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-[#86BBFF]" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
              <span className="font-bold text-white hidden sm:inline whitespace-nowrap">{soundEnabled ? 'Звук: ВКЛ' : 'Звук: ВЫКЛ'}</span>
            </button>

            {/* Accessibility Button */}
            <button
              type="button"
              onClick={() => { setIsA11y((prev) => !prev); setA11yOpen((prev) => !prev); }}
              aria-pressed={isA11y}
              aria-expanded={a11yOpen}
              aria-controls="a11y-settings"
              className={`cx-header-btn h-8 w-8 sm:w-auto sm:min-w-[104px] sm:px-2.5 sm:gap-1.5 ${
                isA11y ? '!bg-[#FFE600] !text-black !border-[#FFE600] font-bold shadow-md' : ''
              }`}
              title={isA11y ? 'Версия для слабовидящих: включена (нажмите для выключения)' : 'Включить версию для слабовидящих'}
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="font-bold hidden sm:inline whitespace-nowrap">Доступность</span>
            </button>

            {a11yOpen && (
              <div id="a11y-settings" role="region" aria-label="Настройки доступности" className="absolute right-4 top-14 z-50 w-64 rounded-2xl border border-white/20 bg-[#003B73] p-4 text-left text-xs text-white shadow-xl">
                <label className="mb-3 block">
                  <span className="mb-1 block font-bold">Масштаб: {scale}%</span>
                  <select value={scale} onChange={(event) => setScale(Number(event.target.value))} className="w-full bg-white text-slate-900 rounded-lg px-2 py-1" aria-label="Масштаб интерфейса">
                    {[100, 115, 130, 150].map((value) => <option key={value} value={value}>{value}%</option>)}
                  </select>
                </label>
                <label className="mb-2 flex items-center gap-2"><input type="checkbox" checked={contrast} onChange={(event) => setContrast(event.target.checked)} aria-label="Высокая контрастность" /> Высокая контрастность</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} aria-label="Уменьшить анимацию" /> Уменьшить анимацию</label>
              </div>
            )}

            {/* Moscow Clock */}
            <div className="flex items-center justify-center gap-1 h-8 px-1.5 sm:px-2.5 sm:min-w-[104px] rounded-lg border transition-all bg-white/15 border-white/30 text-white hover:bg-white/25">
              <Clock className="w-3.5 h-3.5 text-[#86BBFF] shrink-0" />
              <span className="font-bold text-white tabular-nums text-[11px] sm:text-xs whitespace-nowrap sm:hidden">{timeStr ? timeStr.slice(0, 5) : 'МСК'}</span>
              <span className="font-bold text-white tabular-nums whitespace-nowrap hidden sm:inline">{timeStr || 'МСК'}</span>
            </div>

            {/* Auth / Account Area */}
            <div className="flex items-center gap-1.5 sm:gap-2 border-l border-white/20 pl-1.5 sm:pl-2 ml-0.5">
              {currentUser ? (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-bold text-white max-w-[70px] sm:max-w-[120px] truncate">{currentUser.email.split('@')[0]}</span>
                    <span className="text-[9px] text-blue-200 font-mono uppercase hidden xs:inline">
                      {currentUser.role === 'opc_chief' ? 'Начальник' : currentUser.role === 'employee' ? 'Оператор' : 'Клиент'}
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
                  className="cx-auth-btn h-8 px-2 sm:px-3 text-xs shadow-sm whitespace-nowrap"
                  title="Войти в личный кабинет клиента"
                >
                  <UserPlus className="w-3.5 h-3.5 text-[#003B73] shrink-0" />
                  <span className="text-[#003B73] font-bold hidden sm:inline">Личный кабинет</span>
                  <span className="text-[#003B73] font-bold sm:hidden text-[11px]">Войти</span>
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
              {currentUser?.role === 'opc_chief' && (
                <>
                  <span className="text-white/30">·</span>
                  <a
                    href="/admin"
                    className={`hover:text-white transition-colors pb-0.5 ${currentPath.startsWith('/admin') ? 'text-white font-bold border-b-2 border-white' : 'text-blue-200'}`}
                  >
                    Панель начальника ОПС
                  </a>
                </>
              )}
            </nav>

            <a
              href="/grafana/"
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
        onUserChanged={(user) => {
          setCurrentUser(user);
          // Сообщаем клиентским экранам, что сменился владелец талонов.
          window.dispatchEvent(new CustomEvent('pochta:auth'));
        }}
      />
    </>
  );
}
