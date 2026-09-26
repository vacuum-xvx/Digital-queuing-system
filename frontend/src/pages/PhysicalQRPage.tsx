import React, { useEffect, useState } from 'react';
import { listBranches } from '../api/client/clientApi';
import { ClientWorkspace } from '../features/client/ClientWorkspace';
import { AlertCircle, MapPin, ArrowLeft, Maximize, Minimize } from 'lucide-react';

export function PhysicalQRPage({ branchId, kiosk = false }: { branchId: string; kiosk?: boolean }) {
  const [state, setState] = useState<'loading' | 'valid' | 'invalid' | 'error'>('loading');
  const [resetToken, setResetToken] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!kiosk) return;
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [kiosk]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  useEffect(() => {
    if (!kiosk) return;
    let timer = window.setTimeout(() => setResetToken((value) => value + 1), 120000);
    const resetIdleTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setResetToken((value) => value + 1), 120000);
    };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, resetIdleTimer));
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, resetIdleTimer));
    };
  }, [kiosk]);

  useEffect(() => {
    let active = true;
    setState('loading');
    listBranches()
      .then((items) => {
        if (active) setState(items.some((b) => b.id === branchId) ? 'valid' : 'invalid');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [branchId]);

  if (state === 'loading') {
    return (
      <div className={`min-h-[60vh] flex items-center justify-center p-4 ${kiosk ? 'kiosk-shell' : ''}`}>
        <div className="w-full max-w-md bg-white rounded-3xl border border-[#DFE1F4] p-8 sm:p-10 text-center shadow-xl shadow-[#010E3E]/0.05 space-y-4">
          <div className="relative w-12 h-12 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-3 border-[#1A34E8]/15" />
            <div className="w-12 h-12 rounded-full border-3 border-[#1A34E8] border-t-transparent animate-spin" />
          </div>
          <div className="space-y-1">
            <p role="status" className="text-base font-bold text-[#010E3E]">
              Проверяем отделение…
            </p>
            <p className="text-xs text-slate-500 font-medium">
              Подключение к системе Почты России
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (state !== 'valid') {
    return (
      <div className={`min-h-[65vh] flex items-center justify-center px-4 py-8 ${kiosk ? 'kiosk-shell' : ''}`}>
        <section className="w-full max-w-md bg-white rounded-3xl border border-[#DFE1F4] p-8 sm:p-10 text-center shadow-xl shadow-[#010E3E]/0.06 space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-red-50 text-[#FF3A44] flex items-center justify-center mx-auto border border-red-100 shadow-inner">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-black text-[#010E3E] tracking-tight">
              {state === 'invalid' ? 'Отделение не найдено' : 'Не удалось проверить отделение'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              QR-код содержит недействительный идентификатор или отделение временно недоступно. Талон не создан.
            </p>
          </div>
          <div className="pt-2">
            <a
              href="/"
              className="inline-flex items-center justify-center gap-2.5 min-h-[56px] px-6 py-3.5 rounded-2xl bg-[#1A34E8] hover:bg-[#5975FF] active:bg-[#1025B8] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-[#1A34E8]/25 active:scale-[0.98] select-none"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Выбрать отделение</span>
            </a>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`relative ${kiosk ? 'kiosk-shell' : ''}`}>
      {kiosk && (
        <button
          type="button"
          className="kiosk-fullscreen-toggle absolute right-4 top-4 z-30 inline-flex items-center gap-2.5 min-h-[52px] px-5 py-2.5 rounded-2xl bg-white/95 backdrop-blur-md border border-[#DFE1F4] text-[#010E3E] hover:text-[#1A34E8] hover:border-[#1A34E8]/40 shadow-sm shadow-[#010E3E]/5 active:scale-95 transition-all font-bold text-xs sm:text-sm select-none cursor-pointer"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'Перейти в полноэкранный режим'}
        >
          {isFullscreen ? <Minimize className="w-4 h-4 text-[#1A34E8]" /> : <Maximize className="w-4 h-4 text-[#1A34E8]" />}
          <span>{isFullscreen ? 'Свернуть' : 'Полный экран'}</span>
        </button>
      )}
      <ClientWorkspace key={branchId} qrBranchId={branchId} kiosk={kiosk} resetToken={resetToken} />
    </div>
  );
}
