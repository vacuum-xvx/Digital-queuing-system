import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PochtaEmblem, PochtaWordmark } from '../../components/common/PochtaBrand';
import { useTVQueue } from '../../api/queries';
import { announceTicketCall, isSoundEnabled, setSoundEnabled } from '../../utils/postalVoice';
import { enqueueAnnouncement } from '../../utils/announcementQueue';
import { subscribeToTVCalls } from '../../utils/tvNotification';
import { Volume2, VolumeX, Moon, Sun, Maximize2, Minimize2 } from 'lucide-react';

/* ─────────────────────── types ─────────────────────── */
interface TVCall {
  windowId: number | string;
  windowName?: string;
  ticketNumber: string;
  serviceTitle: string;
  status?: string;
}

interface TVWaiting {
  number: string;
  serviceTitle: string;
}

/* ───────────────── Sber-style animated arrow ──────────────── */
function SberArrow({ className = '' }: { className?: string }) {
  return (
    <div className={`tv-sber-arrow ${className}`} aria-hidden="true">
      <svg width="84" height="48" viewBox="0 0 84 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Three directional chevrons with sequential glowing pulse */}
        <path
          className="tv-chevron tv-chevron-1"
          d="M8 8L28 24L8 40"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          className="tv-chevron tv-chevron-2"
          d="M30 8L50 24L30 40"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          className="tv-chevron tv-chevron-3"
          d="M52 8L72 24L52 40"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

/* ────────────── flash overlay for new call ──────────── */
function FlashOverlay({
  ticket,
  windowId,
  isDark = false,
}: {
  ticket: string;
  windowId: string | number;
  isDark?: boolean;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;

  const windowFormatted = String(windowId).startsWith('№') ? String(windowId) : `№ ${windowId}`;

  return (
    <div className={`tv-flash-overlay ${isDark ? 'tv-flash-overlay--dark' : ''}`} role="alert" aria-live="assertive">
      <div className="tv-flash-card">
        <div className="tv-flash-label">
          <span className="tv-flash-dot" />
          <span>Талон вызван!</span>
        </div>
        <div className="tv-flash-row">
          <div className="tv-flash-col">
            <span className="tv-flash-sublabel">ТАЛОН</span>
            <div className="tv-flash-ticket">{ticket}</div>
          </div>
          <SberArrow className="tv-flash-arrow" />
          <div className="tv-flash-col">
            <span className="tv-flash-sublabel">ПРОЙДИТЕ К ОКНУ</span>
            <div className="tv-flash-window">{windowFormatted}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════ MAIN TV BOARD ══════════════════════ */
export function TVBoard() {
  /* ── state ── */
  const [now, setNow] = useState(() => new Date());
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      if (p.get('branchId')) return p.get('branchId')!;
      const saved = localStorage.getItem('client_selected_branch_id') || localStorage.getItem('operator.branch');
      if (saved) return saved;
    }
    return '';
  });

  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tv_board_theme') === 'dark';
    }
    return false;
  });

  const [sound, setSound] = useState<boolean>(() => isSoundEnabled());
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [flash, setFlash] = useState<{ ticket: string; windowId: string | number } | null>(null);
  const flashKeyRef = useRef(0);

  /* ── clock ── */
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  /* ── fullscreen tracking ── */
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const toggleTheme = () => {
    setIsDark(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('tv_board_theme', next ? 'dark' : 'light');
      }
      return next;
    });
  };

  const toggleSound = () => {
    const next = !sound;
    setSoundEnabled(next);
    setSound(next);
  };

  /* ── branches ── */
  useEffect(() => {
    fetch('/api/v1/branches')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const list = d?.items || [];
        setBranches(list);
        if (!selectedBranchId && list.length > 0) setSelectedBranchId(list[0].id);
      })
      .catch(() => {});
  }, [selectedBranchId]);

  /* ── live data ── */
  const { data: tvData, isLoading, error } = useTVQueue(selectedBranchId, 2500);

  /* ── sound announcements & cross-tab calls ── */
  const lastAnnouncedRef = useRef<Map<number, string>>(new Map());
  const lastAnnouncedTimestampRef = useRef<Map<string, number>>(new Map());
  const isInitialRef = useRef(true);

  const triggerCallAnnouncement = (ticketNumber: string, windowId: number | string) => {
    const key = `${ticketNumber}-${windowId}`;
    const nowTs = Date.now();
    const last = lastAnnouncedTimestampRef.current.get(key) || 0;
    // Allow repeat calls after 1.5 seconds, but prevent instant duplicates (e.g. from broadcast + polling)
    if (nowTs - last < 1500) {
      return;
    }
    lastAnnouncedTimestampRef.current.set(key, nowTs);

    enqueueAnnouncement(() => announceTicketCall(ticketNumber, windowId));
    flashKeyRef.current += 1;
    setFlash({ ticket: ticketNumber, windowId });
  };

  /* ── listen to operator cross-tab calls (call-next, specific call, repeat call) ── */
  useEffect(() => {
    const unsubscribe = subscribeToTVCalls((ticketNumber, windowNumber) => {
      triggerCallAnnouncement(ticketNumber, windowNumber);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!tvData?.windows) return;
    const windows = tvData.windows as Array<{ number: number; currentTicketNumber?: string; currentTicketStatus?: string }>;

    if (isInitialRef.current) {
      windows.forEach(w => {
        if (w.currentTicketNumber) lastAnnouncedRef.current.set(w.number, w.currentTicketNumber);
      });
      isInitialRef.current = false;
      return;
    }

    windows.forEach(w => {
      if (w.currentTicketNumber) {
        const prev = lastAnnouncedRef.current.get(w.number);
        if (prev !== w.currentTicketNumber) {
          lastAnnouncedRef.current.set(w.number, w.currentTicketNumber);
          triggerCallAnnouncement(w.currentTicketNumber, w.number);
        }
      } else {
        lastAnnouncedRef.current.delete(w.number);
      }
    });
  }, [tvData]);

  // A call is relevant only while the ticket is CALLED. Remove the transient
  // full-screen card as soon as polling reports that service has started.
  useEffect(() => {
    if (!flash || !tvData?.windows) return;
    const callWindow = (tvData.windows as Array<{
      number: number;
      currentTicketNumber?: string;
      currentTicketStatus?: string;
    }>).find(w => String(w.number) === String(flash.windowId));
    if (
      !callWindow ||
      callWindow.currentTicketNumber !== flash.ticket ||
      callWindow.currentTicketStatus !== 'CALLED'
    ) {
      setFlash(null);
    }
  }, [flash, tvData]);

  /* ── enable sound on first click / touch (autoplay policy) ── */
  useEffect(() => {
    if (!isSoundEnabled()) setSoundEnabled(true);
    const enableOnce = () => {
      if (!isSoundEnabled()) setSoundEnabled(true);
      document.removeEventListener('click', enableOnce);
      document.removeEventListener('touchstart', enableOnce);
    };
    document.addEventListener('click', enableOnce);
    document.addEventListener('touchstart', enableOnce);
    return () => {
      document.removeEventListener('click', enableOnce);
      document.removeEventListener('touchstart', enableOnce);
    };
  }, []);

  /* ── derived data ── */
  const calls: TVCall[] = useMemo(() => {
    if (!tvData?.windows) return [];
    const list = (tvData.windows as Array<{
      number: number;
      currentTicketNumber?: string;
      currentTicketStatus?: string;
      status: string;
    }>)
      .filter(w => w.status !== 'CLOSED' && w.currentTicketStatus === 'CALLED' && !!w.currentTicketNumber)
      .map(w => ({
        windowId: w.number,
        windowName: `Окно ${w.number}`,
        ticketNumber: w.currentTicketNumber!,
        serviceTitle: 'Обслуживание',
        status: w.status,
      }));
    return list;
  }, [tvData]);

  const waiting: TVWaiting[] = useMemo(() => {
    if (!tvData?.queue) return [];
    const list = (tvData.queue as Array<{ publicNumber: string; serviceName?: string; status?: string }>)
      .filter(q => q.status === 'WAITING')
      .map(q => ({ number: q.publicNumber, serviceTitle: q.serviceName || 'Услуга почты' }));
    return list;
  }, [tvData]);

  const branchName = branches.find(b => b.id === selectedBranchId)?.name || 'Табло электронной очереди';

  const timeString = now.toLocaleTimeString('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const dateString = now.toLocaleDateString('ru-RU', {
    timeZone: 'Europe/Moscow',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  /* ═════════════════════ RENDER ═════════════════════ */
  return (
    <div className={`tv-root ${isDark ? 'tv-root--dark' : ''}`}>
      {/* ── FLASH OVERLAY ── */}
      {flash && (
        <FlashOverlay
          key={flashKeyRef.current}
          ticket={flash.ticket}
          windowId={flash.windowId}
          isDark={isDark}
        />
      )}

      {/* ── TOP BAR (Deep Navy with Postal Red bottom accent) ── */}
      <header className="tv-topbar">
        <div className="tv-topbar-left">
          <PochtaEmblem className="tv-emblem" bg="#1A34E8" fg="#FFFFFF" />
          <div className="tv-brand-block">
            <PochtaWordmark className="tv-wordmark" color="#FFFFFF" />
            <span className="tv-branch-name">{branchName}</span>
          </div>
        </div>

        <div className="tv-topbar-right">
          <div className="tv-status-badge" role="status" aria-live="polite">
            <span className="tv-status-dot" />
            <span>
              {error ? 'Нет связи · данные могут устареть' : isLoading ? 'Подключение…' : 'В реальном времени'}
            </span>
          </div>

          <div className="tv-datetime-block">
            <div className="tv-date">{dateString}</div>
            <div className="tv-clock">{timeString}</div>
          </div>

          <div className="tv-actions">
            <button
              type="button"
              onClick={toggleSound}
              className={`tv-icon-btn ${!sound ? 'tv-icon-btn--off' : ''}`}
              title={sound ? 'Звук включен (нажмите для отключения)' : 'Звук выключен (нажмите для включения)'}
              aria-label="Звуковое оповещение"
            >
              {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="tv-icon-btn"
              title={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
              aria-label="Переключение темы"
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="tv-icon-btn"
              title={isFullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}
              aria-label="Полноэкранный режим"
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── CONTENT ── */}
      <main className="tv-content">
        {/* LEFT: Active calls */}
        <section className="tv-calls-section" aria-label="Вызов к окну">
          <div className="tv-section-header">
            <span className="tv-section-dot tv-section-dot--blue" />
            <span className="tv-section-title">Пройдите к окну</span>
            <span className="tv-calls-count">{calls.length}</span>
          </div>

          <div className="tv-calls-grid">
            {calls.map(c => {
              const windowFormatted = String(c.windowId).startsWith('№') ? c.windowId : `№ ${c.windowId}`;
              return (
                <div key={`${c.windowId}-${c.ticketNumber}`} className="tv-call-card">
                  {/* Ticket Column */}
                  <div className="tv-call-ticket-col">
                    <div className="tv-call-label">ТАЛОН</div>
                    <div className="tv-call-ticket">{c.ticketNumber}</div>
                  </div>

                  {/* Sber-style Directional Animated Arrow */}
                  <SberArrow />

                  {/* Window Column */}
                  <div className="tv-call-window-col">
                    <div className="tv-call-label">ОКНО</div>
                    <div className="tv-call-window">{windowFormatted}</div>
                  </div>
                </div>
              );
            })}

            {calls.length === 0 && (
              <div className="tv-empty">
                <div className="tv-empty-text">
                  {isLoading ? 'Подключение к СУО…' : error ? 'Нет связи с системой очереди' : 'Сейчас никто не вызывается'}
                </div>
                <div className="tv-empty-sub">Ожидайте вызова вашего номера талона</div>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT: Waiting queue — responsive flex/grid, no scroll */}
        <section className="tv-waiting-section" aria-label="Ожидают в очереди">
          <div className="tv-section-header">
            <span className="tv-section-dot tv-section-dot--amber" />
            <span className="tv-section-title">Ожидают</span>
            <span className="tv-waiting-count">{waiting.length}</span>
          </div>

          <div className="tv-waiting-grid">
            {waiting.map((w, i) => (
              <div key={`${w.number}-${i}`} className="tv-waiting-chip">
                <span className="tv-waiting-num">{w.number}</span>
              </div>
            ))}
            {waiting.length === 0 && (
              <div className="tv-empty-small">
                {isLoading ? 'Загрузка очереди…' : error ? 'Данные временно недоступны' : 'Ожидающих нет'}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ── BOTTOM BAR ── */}
      <footer className="tv-bottombar">
        <div className="tv-bottombar-inner">
          <div className="tv-bottombar-left">
            <span className="tv-bottombar-brand">Электронная очередь • Почта России</span>
            <span className="tv-bottombar-tag">Pochta Modern Digital</span>
          </div>
          <div className="tv-bottombar-right">
            <span>Пожалуйста, дождитесь вызова вашего талона на табло и звукового сигнала</span>
          </div>
        </div>
      </footer>

      {/* ── STYLES (scoped) ── */}
      <style>{tvStyles}</style>
    </div>
  );
}

/* ═════════════════════ CSS ═════════════════════ */
const tvStyles = `
/* ═══════════════════════ THEME VARIABLES (POCHTA MODERN DIGITAL) ═══════════════════════ */
.tv-root {
  --tv-bg: #F0F4FF;
  --tv-surface: #FFFFFF;
  --tv-navy: #010E3E;
  --tv-primary: #1A34E8;
  --tv-primary-hover: #5975FF;
  --tv-primary-active: #1A32D1;
  --tv-red: #FF3A44;
  --tv-green: #2DA771;
  --tv-amber: #FF9C00;
  --tv-text: #010E3E;
  --tv-text-muted: #64748B;
  --tv-card-bg: #FFFFFF;
  --tv-card-border: #DFE1F4;
  --tv-header-bg: #010E3E;
  --tv-header-text: #FFFFFF;
  --tv-bottom-bg: #010E3E;
  --tv-bottom-text: #94A3B8;
  --tv-waiting-bg: #FFFFFF;
  --tv-waiting-chip-bg: #F8FAFC;
  --tv-waiting-chip-border: #DFE1F4;
  --tv-waiting-chip-first-bg: #EFF6FF;
  --tv-waiting-chip-first-border: #1A34E8;
  --tv-flash-bg: rgba(240, 244, 255, 0.95);
  --tv-flash-card-bg: #FFFFFF;
  --tv-arrow-color: #1A34E8;
  --tv-btn-bg: rgba(255, 255, 255, 0.12);
  --tv-btn-hover: rgba(255, 255, 255, 0.22);
  --tv-btn-text: #FFFFFF;

  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  background: var(--tv-bg);
  color: var(--tv-text);
  font-family: 'Golos Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
  user-select: none;
  cursor: default;
  transition: background-color 0.3s ease, color 0.3s ease;
}

/* ═══════════════════════ DARK MODE SUPPORT ═══════════════════════ */
.tv-root--dark {
  --tv-bg: #010E3E;
  --tv-surface: #071544;
  --tv-navy: #FFFFFF;
  --tv-primary: #3D55FF;
  --tv-primary-hover: #5975FF;
  --tv-primary-active: #1A32D1;
  --tv-text: #F8FAFC;
  --tv-text-muted: #94A3B8;
  --tv-card-bg: #071544;
  --tv-card-border: #1B2B65;
  --tv-header-bg: #040A26;
  --tv-header-text: #FFFFFF;
  --tv-bottom-bg: #040A26;
  --tv-bottom-text: #64748B;
  --tv-waiting-bg: #071544;
  --tv-waiting-chip-bg: #0C1A4D;
  --tv-waiting-chip-border: #1B2B65;
  --tv-waiting-chip-first-bg: #142870;
  --tv-waiting-chip-first-border: #3D55FF;
  --tv-flash-bg: rgba(1, 14, 62, 0.96);
  --tv-flash-card-bg: #071544;
  --tv-arrow-color: #5975FF;
  --tv-btn-bg: rgba(255, 255, 255, 0.1);
  --tv-btn-hover: rgba(255, 255, 255, 0.2);
  --tv-btn-text: #FFFFFF;
}

/* ═══════════════════════ TOP BAR ═══════════════════════ */
.tv-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.2vh 2.5vw;
  background: var(--tv-header-bg);
  border-bottom: 4px solid var(--tv-red);
  flex-shrink: 0;
  box-shadow: 0 4px 20px rgba(1, 14, 62, 0.15);
  color: var(--tv-header-text);
}
.tv-topbar-left {
  display: flex;
  align-items: center;
  gap: 1.4vw;
}
.tv-emblem {
  width: 5.5vh;
  height: 5.5vh;
  border-radius: 14px;
  filter: drop-shadow(0 4px 10px rgba(26, 52, 232, 0.35));
}
.tv-brand-block {
  display: flex;
  flex-direction: column;
  gap: 0.3vh;
}
.tv-wordmark {
  height: 3.2vh;
  width: auto;
}
.tv-branch-name {
  font-size: 1.5vh;
  color: #94A3B8;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.tv-topbar-right {
  display: flex;
  align-items: center;
  gap: 2vw;
}
.tv-status-badge {
  display: flex;
  align-items: center;
  gap: 0.6vw;
  font-size: 1.4vh;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--tv-green);
  text-transform: uppercase;
  background: rgba(45, 167, 113, 0.12);
  border: 1px solid rgba(45, 167, 113, 0.3);
  padding: 0.6vh 1.2vw;
  border-radius: 9999px;
}
.tv-status-dot {
  width: 1vh;
  height: 1vh;
  border-radius: 50%;
  background: var(--tv-green);
  box-shadow: 0 0 10px rgba(45, 167, 113, 0.8);
  animation: tv-pulse 2s ease-in-out infinite;
}
.tv-datetime-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.2vh;
}
.tv-date {
  font-size: 1.5vh;
  color: #94A3B8;
  font-weight: 500;
  text-transform: capitalize;
}
.tv-clock {
  font-size: 4.8vh;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  font-family: 'JetBrains Mono', 'SF Mono', Cascadia Code, monospace;
  letter-spacing: 0.04em;
  color: #FFFFFF;
  line-height: 1;
}

/* ── Topbar Actions (Sound, Theme, Fullscreen) ── */
.tv-actions {
  display: flex;
  align-items: center;
  gap: 0.6vw;
}
.tv-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.8vh;
  height: 4.8vh;
  border-radius: 1.2vh;
  background: var(--tv-btn-bg);
  color: var(--tv-btn-text);
  border: 1px solid rgba(255, 255, 255, 0.18);
  cursor: pointer;
  transition: all 0.2s ease;
}
.tv-icon-btn:hover {
  background: var(--tv-btn-hover);
  transform: translateY(-1px);
}
.tv-icon-btn:active {
  transform: translateY(0);
}
.tv-icon-btn--off {
  color: var(--tv-red);
  border-color: rgba(255, 58, 68, 0.4);
}

/* ═══════════════════════ MAIN CONTENT ═══════════════════════ */
.tv-content {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 32vw;
  gap: 1.8vw;
  padding: 2.2vh 2.2vw;
  min-height: 0;
  overflow: hidden;
}

/* ─── SECTION HEADERS ─── */
.tv-section-header {
  display: flex;
  align-items: center;
  gap: 0.8vw;
  margin-bottom: 1.8vh;
  padding-bottom: 1vh;
  border-bottom: 2px solid var(--tv-card-border);
}
.tv-section-dot {
  width: 1.3vh;
  height: 1.3vh;
  border-radius: 50%;
  flex-shrink: 0;
}
.tv-section-dot--blue {
  background: var(--tv-primary);
  box-shadow: 0 0 12px rgba(26, 52, 232, 0.6);
  animation: tv-pulse 2s ease-in-out infinite;
}
.tv-section-dot--amber {
  background: var(--tv-amber);
  box-shadow: 0 0 12px rgba(255, 156, 0, 0.6);
  animation: tv-pulse 2s ease-in-out infinite 0.5s;
}
.tv-section-title {
  font-size: 2.4vh;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--tv-text);
}
.tv-calls-count {
  background: var(--tv-primary);
  color: #FFFFFF;
  border-radius: 9999px;
  padding: 0.3vh 1.2vw;
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 1.7vh;
  font-weight: 800;
  margin-left: auto;
}
.tv-waiting-count {
  background: rgba(255, 156, 0, 0.15);
  color: #D97706;
  border-radius: 9999px;
  padding: 0.3vh 1.2vw;
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 1.7vh;
  font-weight: 800;
  margin-left: auto;
}

/* ═══════════════════════ CALL CARDS ═══════════════════════ */
.tv-calls-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.tv-calls-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2vh;
  flex: 1;
  align-content: start;
  overflow: hidden;
}
.tv-call-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.8vh 2.5vw;
  min-width: 0;
  container-type: inline-size;
  border-radius: 2.4vh;
  background: var(--tv-card-bg);
  border: 2.5px solid var(--tv-card-border);
  box-shadow: 0 8px 24px rgba(1, 14, 62, 0.05), 0 2px 6px rgba(1, 14, 62, 0.03);
  animation: tv-called-pulse 3s ease-in-out infinite;
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
}
.tv-call-card:hover {
  transform: scale(1.01);
  box-shadow: 0 12px 36px rgba(26, 52, 232, 0.15);
}

@keyframes tv-called-pulse {
  0%, 100% {
    border-color: var(--tv-card-border);
    box-shadow: 0 8px 24px rgba(1, 14, 62, 0.05), 0 0 0 1px rgba(26, 52, 232, 0.12);
  }
  50% {
    border-color: rgba(26, 52, 232, 0.65);
    box-shadow: 0 12px 36px rgba(26, 52, 232, 0.18), 0 0 0 3px rgba(26, 52, 232, 0.28);
  }
}

.tv-call-ticket-col,
.tv-call-window-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6vh;
}
.tv-call-label {
  font-size: 1.5vh;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--tv-text-muted);
}
.tv-call-ticket {
  font-size: min(7.5vh, 8.5cqi);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  font-family: 'JetBrains Mono', 'SF Mono', Cascadia Code, monospace;
  color: var(--tv-text);
  line-height: 1;
  letter-spacing: 0.02em;
}
.tv-call-window {
  font-size: min(7vh, 8cqi);
  white-space: nowrap;
  font-weight: 800;
  font-family: 'JetBrains Mono', 'SF Mono', Cascadia Code, monospace;
  color: #FFFFFF;
  line-height: 1;
  background: var(--tv-primary);
  border-radius: 1.8vh;
  padding: 0.9vh 2vw;
  box-shadow: 0 6px 20px rgba(26, 52, 232, 0.35);
  letter-spacing: 0.02em;
}

/* ═══════════════════════ SBER-STYLE ANIMATED ARROW ═══════════════════════ */
.tv-sber-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.5vw;
  color: var(--tv-arrow-color);
}
.tv-sber-arrow svg {
  width: 5.5vw;
  min-width: 64px;
  max-width: 96px;
  height: auto;
}

/* Sequential chevron animation with high-tech glowing pulse wave */
.tv-chevron {
  opacity: 0.18;
  animation: tv-sber-chevron 1.6s ease-in-out infinite;
}
.tv-chevron-1 {
  animation-delay: 0s;
}
.tv-chevron-2 {
  animation-delay: 0.22s;
}
.tv-chevron-3 {
  animation-delay: 0.44s;
}

@keyframes tv-sber-chevron {
  0% {
    opacity: 0.15;
    stroke-width: 4;
    filter: none;
  }
  32% {
    opacity: 1;
    stroke-width: 5.5;
    filter: drop-shadow(0 0 10px rgba(26, 52, 232, 0.75));
  }
  65% {
    opacity: 0.15;
    stroke-width: 4;
    filter: none;
  }
  100% {
    opacity: 0.15;
    stroke-width: 4;
    filter: none;
  }
}

/* ═══════════════════════ WAITING — CHIP GRID (no scroll) ═══════════════════════ */
.tv-waiting-section {
  display: flex;
  flex-direction: column;
  background: var(--tv-waiting-bg);
  border-radius: 2.4vh;
  padding: 2.2vh 1.5vw;
  border: 2.5px solid var(--tv-card-border);
  box-shadow: 0 8px 24px rgba(1, 14, 62, 0.05);
  min-height: 0;
  overflow: hidden;
}
.tv-waiting-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-content: start;
  gap: 1.2vh;
  overflow: hidden;
}
.tv-waiting-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.1vh 0.6vw;
  min-width: 0;
  background: var(--tv-waiting-chip-bg);
  border: 2px solid var(--tv-waiting-chip-border);
  border-radius: 1.5vh;
  animation: tv-chip-appear 0.4s ease-out backwards;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
}
.tv-waiting-chip:first-child {
  background: var(--tv-waiting-chip-first-bg);
  border-color: var(--tv-waiting-chip-first-border);
  box-shadow: 0 2px 10px rgba(26, 52, 232, 0.15);
}
.tv-waiting-num {
  font-size: 2.8vh;
  font-weight: 800;
  font-family: 'JetBrains Mono', 'SF Mono', Cascadia Code, monospace;
  color: var(--tv-text);
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ═══════════════════════ BOTTOM BAR ═══════════════════════ */
.tv-bottombar {
  flex-shrink: 0;
  background: var(--tv-bottom-bg);
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  padding: 1.2vh 2.5vw;
  color: var(--tv-bottom-text);
}
.tv-bottombar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 1.5vh;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.tv-bottombar-left {
  display: flex;
  align-items: center;
  gap: 1vw;
}
.tv-bottombar-brand {
  color: #FFFFFF;
  font-weight: 700;
}
.tv-bottombar-tag {
  color: var(--tv-primary-hover);
  font-size: 1.3vh;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: rgba(26, 52, 232, 0.2);
  padding: 0.2vh 0.8vw;
  border-radius: 6px;
}
.tv-bottombar-right {
  color: #CBD5E1;
}

/* ═══════════════════════ EMPTY STATES ═══════════════════════ */
.tv-empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1vh;
  padding: 8vh 2vw;
  color: var(--tv-text-muted);
}
.tv-empty-text {
  font-size: 3.2vh;
  font-weight: 700;
  color: var(--tv-text-muted);
}
.tv-empty-sub {
  font-size: 1.8vh;
  color: var(--tv-text-muted);
  opacity: 0.8;
}
.tv-empty-small {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 5vh 0;
  font-size: 2.2vh;
  color: var(--tv-text-muted);
  font-weight: 600;
}

/* ═══════════════════════ FLASH OVERLAY ═══════════════════════ */
.tv-flash-overlay {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tv-flash-bg);
  backdrop-filter: blur(28px);
  animation: tv-flash-in 0.35s cubic-bezier(0.16, 1, 0.3, 1), tv-flash-out 0.6s ease-in 3.9s forwards;
}
.tv-flash-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3.5vh;
  padding: 5vh 6vw;
  background: var(--tv-flash-card-bg);
  border: 3.5px solid var(--tv-primary);
  border-radius: 3.5vh;
  box-shadow: 0 25px 70px rgba(1, 14, 62, 0.25), 0 0 0 8px rgba(26, 52, 232, 0.25);
  animation: tv-flash-scale 0.45s cubic-bezier(0.16, 1, 0.3, 1), tv-flash-glow 2s ease-in-out infinite;
}
.tv-flash-label {
  display: flex;
  align-items: center;
  gap: 1vw;
  font-size: 3.2vh;
  font-weight: 800;
  color: var(--tv-red);
  text-transform: uppercase;
  letter-spacing: 0.16em;
}
.tv-flash-dot {
  width: 1.6vh;
  height: 1.6vh;
  border-radius: 50%;
  background: var(--tv-red);
  box-shadow: 0 0 12px rgba(255, 58, 68, 0.8);
  animation: tv-pulse 1.2s ease-in-out infinite;
}
.tv-flash-row {
  display: flex;
  align-items: center;
  gap: 3.5vw;
}
.tv-flash-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8vh;
}
.tv-flash-sublabel {
  font-size: 1.6vh;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--tv-text-muted);
}
.tv-flash-ticket {
  font-size: min(16vh, 15vw);
  font-weight: 800;
  font-family: 'JetBrains Mono', 'SF Mono', Cascadia Code, monospace;
  color: var(--tv-text);
  line-height: 1;
  letter-spacing: 0.02em;
}
.tv-flash-window {
  font-size: min(10vh, 9vw);
  font-weight: 800;
  font-family: 'JetBrains Mono', 'SF Mono', Cascadia Code, monospace;
  color: #FFFFFF;
  background: var(--tv-primary);
  border-radius: 2.5vh;
  padding: 1.2vh 3.5vw;
  box-shadow: 0 10px 30px rgba(26, 52, 232, 0.4);
  letter-spacing: 0.02em;
}
.tv-flash-arrow {
  color: var(--tv-primary);
  transform: scale(1.6);
  margin: 0 1vw;
}

/* ═══════════════════════ ANIMATIONS ═══════════════════════ */
@keyframes tv-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.85); }
}

@keyframes tv-flash-glow {
  0%, 100% {
    box-shadow: 0 25px 70px rgba(1, 14, 62, 0.25), 0 0 0 6px rgba(26, 52, 232, 0.25);
  }
  50% {
    box-shadow: 0 30px 90px rgba(26, 52, 232, 0.35), 0 0 0 14px rgba(26, 52, 232, 0.35);
  }
}

@keyframes tv-chip-appear {
  from { opacity: 0; transform: scale(0.88); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes tv-flash-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes tv-flash-out {
  from { opacity: 1; }
  to { opacity: 0; pointer-events: none; }
}
@keyframes tv-flash-scale {
  from { transform: scale(0.75); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* ═══════ RESPONSIVE: portrait/smaller screens fallback ═══════ */
@media (max-aspect-ratio: 4/3) {
  .tv-content {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }
  .tv-calls-grid {
    grid-template-columns: 1fr;
  }
}
`;
