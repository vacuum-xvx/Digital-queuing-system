import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PochtaEmblem, PochtaWordmark } from '../../components/common/PochtaBrand';
import { useTVQueue } from '../../api/queries';
import { announceTicketCall, isSoundEnabled, setSoundEnabled } from '../../utils/postalVoice';
import { enqueueAnnouncement } from '../../utils/announcementQueue';

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

/* ───────────────── animated arrow SVG ──────────────── */
function AnimatedArrow() {
  return (
    <div className="tv-arrow-wrap">
      <svg width="64" height="40" viewBox="0 0 64 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="tv-arrow-svg">
        <path
          d="M4 20H52M52 20L38 6M52 20L38 34"
          stroke="url(#arrowGrad)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="arrowGrad" x1="4" y1="20" x2="52" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38BDF8" />
            <stop offset="1" stopColor="#FACC15" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

/* ────────────── flash overlay for new call ──────────── */
function FlashOverlay({ ticket, windowId }: { ticket: string; windowId: string | number }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div className="tv-flash-overlay">
      <div className="tv-flash-card">
        <div className="tv-flash-label">Талон вызван!</div>
        <div className="tv-flash-ticket">{ticket}</div>
        <AnimatedArrow />
        <div className="tv-flash-window">Окно {windowId}</div>
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
  const [flash, setFlash] = useState<{ ticket: string; windowId: string | number } | null>(null);
  const flashKeyRef = useRef(0);

  /* ── clock ── */
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  /* ── branches ── */
  useEffect(() => {
    fetch('/api/v1/branches')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const list = d?.items || [];
        setBranches(list);
        if (!selectedBranchId && list.length > 0) setSelectedBranchId(list[0].id);
      })
      .catch(() => {});
  }, [selectedBranchId]);

  /* ── live data ── */
  const { data: tvData } = useTVQueue(selectedBranchId, 2500);

  /* ── sound announcements ── */
  const lastAnnouncedRef = useRef<Map<number, string>>(new Map());
  const isInitialRef = useRef(true);

  useEffect(() => {
    if (!tvData?.windows) return;
    const windows = tvData.windows as Array<{ number: number; currentTicketNumber?: string }>;

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
          enqueueAnnouncement(() => announceTicketCall(w.currentTicketNumber!, w.number));
          // trigger flash
          flashKeyRef.current += 1;
          setFlash({ ticket: w.currentTicketNumber, windowId: w.number });
        }
      } else {
        lastAnnouncedRef.current.delete(w.number);
      }
    });
  }, [tvData]);

  /* ── enable sound on first click (autoplay policy) ── */
  useEffect(() => {
    const enableOnce = () => {
      if (!isSoundEnabled()) setSoundEnabled(true);
      document.removeEventListener('click', enableOnce);
    };
    document.addEventListener('click', enableOnce);
    return () => document.removeEventListener('click', enableOnce);
  }, []);

  /* ── derived data ── */
  const calls: TVCall[] = useMemo(() => {
    if (!tvData?.windows) return defaultCalls;
    const list = (tvData.windows as Array<{ number: number; currentTicketNumber?: string; status: string }>)
      .filter(w => w.status !== 'CLOSED' && !!w.currentTicketNumber)
      .map(w => ({
        windowId: w.number,
        windowName: `Окно ${w.number}`,
        ticketNumber: w.currentTicketNumber!,
        serviceTitle: 'Обслуживание',
        status: w.status,
      }));
    return list.length > 0 ? list : defaultCalls;
  }, [tvData]);

  const waiting: TVWaiting[] = useMemo(() => {
    if (!tvData?.queue) return defaultWaiting;
    const list = (tvData.queue as Array<{ publicNumber: string; serviceName?: string }>)
      .map(q => ({ number: q.publicNumber, serviceTitle: q.serviceName || 'Услуга почты' }));
    return list.length > 0 ? list : defaultWaiting;
  }, [tvData]);

  const branchName = branches.find(b => b.id === selectedBranchId)?.name || 'ОПС 390000 • Главпочтамт';

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
    <div className="tv-root">
      {/* ── FLASH OVERLAY ── */}
      {flash && <FlashOverlay key={flashKeyRef.current} ticket={flash.ticket} windowId={flash.windowId} />}

      {/* ── TOP BAR ── */}
      <header className="tv-topbar">
        <div className="tv-topbar-left">
          <PochtaEmblem className="tv-emblem" bg="#FFFFFF" fg="#003B73" />
          <div className="tv-brand-block">
            <PochtaWordmark className="tv-wordmark" color="#FFFFFF" />
            <span className="tv-branch-name">{branchName}</span>
          </div>
        </div>
        <div className="tv-topbar-right">
          <div className="tv-status-badge">
            <span className="tv-status-dot" />
            ОНЛАЙН
          </div>
          <div className="tv-date">{dateString}</div>
          <div className="tv-clock">{timeString}</div>
        </div>
      </header>

      {/* ── CONTENT ── */}
      <div className="tv-content">
        {/* LEFT: Active calls */}
        <section className="tv-calls-section">
          <div className="tv-section-header">
            <span className="tv-section-dot tv-section-dot--green" />
            <span>Пройдите к окну</span>
          </div>

          <div className="tv-calls-grid">
            {calls.map((c) => (
              <div key={`${c.windowId}-${c.ticketNumber}`} className="tv-call-card">
                {/* Ticket */}
                <div className="tv-call-ticket-col">
                  <div className="tv-call-label">ТАЛОН</div>
                  <div className="tv-call-ticket">{c.ticketNumber}</div>
                </div>

                {/* Arrow */}
                <AnimatedArrow />

                {/* Window */}
                <div className="tv-call-window-col">
                  <div className="tv-call-label">ОКНО</div>
                  <div className="tv-call-window">{c.windowId}</div>
                </div>
              </div>
            ))}

            {calls.length === 0 && (
              <div className="tv-empty">Нет активных вызовов</div>
            )}
          </div>
        </section>

        {/* RIGHT: Waiting queue */}
        <section className="tv-waiting-section">
          <div className="tv-section-header">
            <span className="tv-section-dot tv-section-dot--amber" />
            <span>Ожидают</span>
            <span className="tv-waiting-count">{waiting.length}</span>
          </div>

          <div className="tv-waiting-list">
            {waiting.map((w, i) => (
              <div key={`${w.number}-${i}`} className="tv-waiting-row">
                <span className="tv-waiting-pos">{i + 1}</span>
                <span className="tv-waiting-num">{w.number}</span>
                <span className="tv-waiting-svc">{w.serviceTitle}</span>
              </div>
            ))}
            {waiting.length === 0 && (
              <div className="tv-empty-small">Очередь пуста</div>
            )}
          </div>
        </section>
      </div>

      {/* ── BOTTOM BAR ── */}
      <footer className="tv-bottombar">
        <div className="tv-bottombar-inner">
          <span>Электронная очередь • Почта России</span>
          <span>Пожалуйста, дождитесь вызова вашего талона</span>
        </div>
      </footer>

      {/* ── STYLES (scoped) ── */}
      <style>{tvStyles}</style>
    </div>
  );
}

/* ─────────────── DEFAULT / DEMO DATA ─────────────── */
const defaultCalls: TVCall[] = [
  { windowId: 1, ticketNumber: 'А042', serviceTitle: 'Получение', status: 'SERVING' },
  { windowId: 2, ticketNumber: 'П015', serviceTitle: 'Финансы',   status: 'CALLED' },
  { windowId: 3, ticketNumber: 'О031', serviceTitle: 'Отправка',  status: 'SERVING' },
  { windowId: 4, ticketNumber: 'Б008', serviceTitle: 'Подписка',  status: 'CALLED' },
];

const defaultWaiting: TVWaiting[] = [
  { number: 'А043', serviceTitle: 'Получение писем и посылок' },
  { number: 'О032', serviceTitle: 'Отправка посылок' },
  { number: 'П016', serviceTitle: 'Финансовые операции' },
  { number: 'А044', serviceTitle: 'Получение писем и посылок' },
  { number: 'Т008', serviceTitle: 'Товары и открытки' },
  { number: 'А045', serviceTitle: 'Получение писем и посылок' },
  { number: 'О033', serviceTitle: 'Отправка 1 класс' },
];

/* ═════════════════════ CSS ═════════════════════ */
const tvStyles = `
/* ═══════════════════════ TV ROOT ═══════════════════════ */
.tv-root {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  background: linear-gradient(165deg, #001D3D 0%, #003566 40%, #001D3D 100%);
  color: #FFFFFF;
  font-family: 'Golos Text', 'PT Sans', system-ui, sans-serif;
  overflow: hidden;
  user-select: none;
  cursor: default;
}

/* ═══════════════════════ TOP BAR ═══════════════════════ */
.tv-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1vh 2.5vw;
  background: rgba(0, 29, 61, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 3px solid #D92534;
  flex-shrink: 0;
}
.tv-topbar-left {
  display: flex;
  align-items: center;
  gap: 1.2vw;
}
.tv-emblem {
  width: 5vh;
  height: 5vh;
  border-radius: 12px;
  filter: drop-shadow(0 0 8px rgba(255,255,255,0.3));
}
.tv-brand-block {
  display: flex;
  flex-direction: column;
  gap: 0.3vh;
}
.tv-wordmark {
  height: 2.8vh;
  width: auto;
}
.tv-branch-name {
  font-size: 1.5vh;
  color: #86BBFF;
  font-weight: 600;
  letter-spacing: 0.03em;
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
  gap: 0.5vw;
  font-size: 1.4vh;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #4ADE80;
  text-transform: uppercase;
}
.tv-status-dot {
  width: 1vh;
  height: 1vh;
  border-radius: 50%;
  background: #4ADE80;
  box-shadow: 0 0 8px #4ADE80, 0 0 20px rgba(74,222,128,0.4);
  animation: tv-pulse 2s ease-in-out infinite;
}
.tv-date {
  font-size: 1.6vh;
  color: #94A3B8;
  font-weight: 500;
  text-transform: capitalize;
}
.tv-clock {
  font-size: 4vh;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  color: #FFFFFF;
  text-shadow: 0 0 20px rgba(56,189,248,0.4);
}

/* ═══════════════════════ CONTENT ═══════════════════════ */
.tv-content {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 28vw;
  gap: 1.5vw;
  padding: 1.5vh 2vw;
  min-height: 0;
  overflow: hidden;
}

/* ─── SECTION HEADERS ─── */
.tv-section-header {
  display: flex;
  align-items: center;
  gap: 0.8vw;
  font-size: 2.2vh;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #CBD5E1;
  margin-bottom: 1.5vh;
  padding-bottom: 1vh;
  border-bottom: 2px solid rgba(255,255,255,0.08);
}
.tv-section-dot {
  width: 1.2vh;
  height: 1.2vh;
  border-radius: 50%;
}
.tv-section-dot--green {
  background: #4ADE80;
  box-shadow: 0 0 10px rgba(74,222,128,0.5);
  animation: tv-pulse 2s ease-in-out infinite;
}
.tv-section-dot--amber {
  background: #FBBF24;
  box-shadow: 0 0 10px rgba(251,191,36,0.5);
  animation: tv-pulse 2s ease-in-out infinite 0.5s;
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
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5vh;
  flex: 1;
  align-content: start;
  overflow: hidden;
}
.tv-call-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2vh 2vw;
  border-radius: 2vh;
  background: linear-gradient(135deg, rgba(5,79,166,0.45) 0%, rgba(0,59,115,0.55) 100%);
  border: 2px solid rgba(56,189,248,0.2);
  box-shadow: 0 0 30px rgba(5,79,166,0.2), inset 0 1px 0 rgba(255,255,255,0.06);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  animation: tv-card-appear 0.6s ease-out backwards;
}
.tv-call-card:hover {
  transform: scale(1.01);
  box-shadow: 0 0 40px rgba(56,189,248,0.25), inset 0 1px 0 rgba(255,255,255,0.1);
}
.tv-call-ticket-col,
.tv-call-window-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5vh;
}
.tv-call-label {
  font-size: 1.4vh;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: #64A5D6;
}
.tv-call-ticket {
  font-size: 6.5vh;
  font-weight: 900;
  font-family: 'Golos Text', monospace;
  color: #FFFFFF;
  text-shadow: 0 0 30px rgba(56,189,248,0.5);
  line-height: 1;
  letter-spacing: 0.02em;
}
.tv-call-window {
  font-size: 6.5vh;
  font-weight: 900;
  font-family: 'Golos Text', monospace;
  color: #FACC15;
  text-shadow: 0 0 20px rgba(250,204,21,0.4);
  line-height: 1;
  background: linear-gradient(135deg, rgba(250,204,21,0.15) 0%, rgba(250,204,21,0.05) 100%);
  border-radius: 1.5vh;
  padding: 0.8vh 1.5vw;
  border: 2px solid rgba(250,204,21,0.3);
}

/* ═══════════════════════ ANIMATED ARROW ═══════════════════════ */
.tv-arrow-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.5vw;
  animation: tv-arrow-bounce 1.6s ease-in-out infinite;
}
.tv-arrow-svg {
  width: 5vw;
  height: auto;
  filter: drop-shadow(0 0 8px rgba(56,189,248,0.5));
}

/* ═══════════════════════ WAITING LIST ═══════════════════════ */
.tv-waiting-section {
  display: flex;
  flex-direction: column;
  background: rgba(0, 29, 61, 0.5);
  border-radius: 2vh;
  padding: 2vh 1.5vw;
  border: 1px solid rgba(255,255,255,0.06);
  min-height: 0;
  overflow: hidden;
}
.tv-waiting-count {
  background: rgba(251,191,36,0.2);
  color: #FBBF24;
  border-radius: 1vh;
  padding: 0.3vh 1vw;
  font-variant-numeric: tabular-nums;
  font-size: 1.8vh;
  margin-left: auto;
}
.tv-waiting-list {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.tv-waiting-list::-webkit-scrollbar { display: none; }

.tv-waiting-row {
  display: grid;
  grid-template-columns: 4vh 1fr 1fr;
  gap: 1vw;
  align-items: center;
  padding: 1.2vh 1vw;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  transition: background 0.2s;
  animation: tv-row-slide 0.4s ease-out backwards;
}
.tv-waiting-row:nth-child(even) {
  background: rgba(255,255,255,0.02);
}
.tv-waiting-row:first-child {
  background: rgba(56,189,248,0.08);
  border-radius: 1vh;
}
.tv-waiting-pos {
  font-size: 1.6vh;
  font-weight: 700;
  color: #64748B;
  text-align: center;
}
.tv-waiting-num {
  font-size: 3vh;
  font-weight: 900;
  font-family: 'Golos Text', monospace;
  color: #E2E8F0;
  letter-spacing: 0.02em;
}
.tv-waiting-svc {
  font-size: 1.5vh;
  color: #64748B;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ═══════════════════════ BOTTOM BAR ═══════════════════════ */
.tv-bottombar {
  flex-shrink: 0;
  background: rgba(0, 29, 61, 0.9);
  border-top: 2px solid rgba(255,255,255,0.06);
  padding: 1vh 2.5vw;
}
.tv-bottombar-inner {
  display: flex;
  justify-content: space-between;
  font-size: 1.4vh;
  color: #475569;
  font-weight: 600;
  letter-spacing: 0.05em;
}

/* ═══════════════════════ EMPTY STATES ═══════════════════════ */
.tv-empty {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3vh;
  color: #475569;
  font-weight: 600;
}
.tv-empty-small {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4vh 0;
  font-size: 2vh;
  color: #475569;
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
  background: rgba(0, 13, 30, 0.85);
  backdrop-filter: blur(20px);
  animation: tv-flash-in 0.4s ease-out, tv-flash-out 0.6s ease-in 3.9s forwards;
}
.tv-flash-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3vh;
  animation: tv-flash-scale 0.5s ease-out;
}
.tv-flash-label {
  font-size: 4vh;
  font-weight: 800;
  color: #4ADE80;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  text-shadow: 0 0 30px rgba(74,222,128,0.6);
}
.tv-flash-ticket {
  font-size: 18vh;
  font-weight: 900;
  font-family: 'Golos Text', monospace;
  color: #FFFFFF;
  text-shadow: 0 0 60px rgba(56,189,248,0.6);
  line-height: 1;
}
.tv-flash-window {
  font-size: 10vh;
  font-weight: 900;
  color: #FACC15;
  text-shadow: 0 0 40px rgba(250,204,21,0.5);
  background: rgba(250,204,21,0.1);
  border: 3px solid rgba(250,204,21,0.3);
  border-radius: 3vh;
  padding: 1vh 4vw;
}

/* ═══════════════════════ ANIMATIONS ═══════════════════════ */
@keyframes tv-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

@keyframes tv-arrow-bounce {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(0.8vw); }
}

@keyframes tv-card-appear {
  from { opacity: 0; transform: translateY(2vh); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes tv-row-slide {
  from { opacity: 0; transform: translateX(2vw); }
  to { opacity: 1; transform: translateX(0); }
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
  from { transform: scale(0.7); opacity: 0; }
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
