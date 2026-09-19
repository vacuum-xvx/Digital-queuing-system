import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Users, ChevronLeft, Search, Volume2, VolumeX, Sparkles, Building2 } from 'lucide-react';
import { PochtaEmblem } from '../../components/common/PochtaBrand';
import { useTVQueue } from '../../api/queries';
import { announceTicketCall, playPostalChime, isSoundEnabled, setSoundEnabled } from '../../utils/postalVoice';
import { enqueueAnnouncement } from '../../utils/announcementQueue';

export interface BoardActiveCall {
  windowId: number | string;
  windowName?: string;
  ticketNumber: string;
  serviceTitle: string;
  estimatedMinutes: number;
  status?: 'CALLED' | 'SERVING' | string;
  startedAt?: string | Date;
}

export interface BoardWaitingTicket {
  id: string;
  number: string;
  serviceTitle: string;
  position: number;
  estimatedWaitMinutes: number;
}

interface ClientQueueBoardProps {
  branchId?: string;
  branchName?: string;
  activeCalls?: BoardActiveCall[];
  waitingQueue?: BoardWaitingTicket[];
  onBack?: () => void;
  myTicketNumber?: string;
}

export function ClientQueueBoard({
  branchId: propBranchId,
  branchName: propBranchName,
  activeCalls,
  waitingQueue,
  onBack,
  myTicketNumber,
}: ClientQueueBoardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'serving' | 'waiting'>('all');
  const [now, setNow] = useState<Date>(() => new Date());
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    if (propBranchId) return propBranchId;
    if (typeof window !== 'undefined') {
      const urlBranch = new URLSearchParams(window.location.search).get('branchId');
      if (urlBranch) return urlBranch;
      const saved = localStorage.getItem('client_selected_branch_id') || localStorage.getItem('operator.branch');
      if (saved) return saved;
    }
    return '';
  });

  const [soundOn, setSoundOn] = useState<boolean>(() => isSoundEnabled());

  useEffect(() => {
    const onSoundChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ enabled: boolean }>;
      if (typeof customEvent.detail?.enabled === 'boolean') {
        setSoundOn(customEvent.detail.enabled);
      }
    };
    window.addEventListener('pochta:sound', onSoundChange);
    return () => window.removeEventListener('pochta:sound', onSoundChange);
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };

  const handleTestSound = () => {
    setSoundEnabled(true);
    setSoundOn(true);
    void playPostalChime(0.30).then(() => {
      void announceTicketCall('А001', 1);
    });
  };

  // Загружаем список отделений для авто-выбора или переключения
  useEffect(() => {
    fetch('/api/v1/branches')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        const list = data?.items || [];
        setBranches(list);
        if (!selectedBranchId && list.length > 0) {
          setSelectedBranchId(list[0].id);
        }
      })
      .catch(() => {});
  }, [selectedBranchId]);

  // Опрос реального TV-табло отделения
  const { data: tvData } = useTVQueue(selectedBranchId, 2500);

  // Слежение за изменением вызванных талонов в окнах для воспроизведения гонга и диктора
  const lastAnnouncedWindowTicketsRef = useRef<Map<number, string>>(new Map());
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    if (!tvData?.windows) return;
    const windows = tvData.windows as Array<{ number: number; currentTicketNumber?: string }>;

    if (isInitialLoadRef.current) {
      windows.forEach(w => {
        if (w.currentTicketNumber) {
          lastAnnouncedWindowTicketsRef.current.set(w.number, w.currentTicketNumber);
        }
      });
      isInitialLoadRef.current = false;
      return;
    }

    windows.forEach(w => {
      if (w.currentTicketNumber) {
        const prev = lastAnnouncedWindowTicketsRef.current.get(w.number);
        if (prev !== w.currentTicketNumber) {
          lastAnnouncedWindowTicketsRef.current.set(w.number, w.currentTicketNumber);
          enqueueAnnouncement(() => announceTicketCall(w.currentTicketNumber!, w.number));
        }
      } else {
        lastAnnouncedWindowTicketsRef.current.delete(w.number);
      }
    });
  }, [tvData]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Примерные/дефолтные данные табло, если не переданы извне и нет связи с бэкендом
  const defaultCalls: BoardActiveCall[] = useMemo(() => [
    {
      windowId: 1,
      windowName: 'Окно 1',
      ticketNumber: 'А042',
      serviceTitle: 'Получение писем и посылок',
      estimatedMinutes: 3,
      status: 'SERVING',
    },
    {
      windowId: 2,
      windowName: 'Окно 2',
      ticketNumber: 'П015',
      serviceTitle: 'Финансовые операции и переводы',
      estimatedMinutes: 5,
      status: 'CALLED',
    },
    {
      windowId: 3,
      windowName: 'Окно 3',
      ticketNumber: 'О031',
      serviceTitle: 'Отправка посылок и 1 класс',
      estimatedMinutes: 4,
      status: 'SERVING',
    },
  ], []);

  const defaultWaiting: BoardWaitingTicket[] = useMemo(() => [
    { id: 'w1', number: 'А043', serviceTitle: 'Получение писем и посылок', position: 1, estimatedWaitMinutes: 2 },
    { id: 'w2', number: 'О032', serviceTitle: 'Отправка посылок и 1 класс', position: 2, estimatedWaitMinutes: 5 },
    { id: 'w3', number: 'П016', serviceTitle: 'Финансовые операции', position: 3, estimatedWaitMinutes: 8 },
    { id: 'w4', number: 'А044', serviceTitle: 'Получение писем и посылок', position: 4, estimatedWaitMinutes: 11 },
    { id: 'w5', number: 'Т008', serviceTitle: 'Товары и открытки', position: 5, estimatedWaitMinutes: 14 },
  ], []);

  // Данные из реального бэкенда
  const liveCalls: BoardActiveCall[] | null = useMemo(() => {
    if (!tvData?.windows) return null;
    return (tvData.windows as Array<{ number: number; currentTicketNumber?: string; status: string }>)
      .filter(w => w.status !== 'CLOSED' && !!w.currentTicketNumber)
      .map(w => ({
        windowId: w.number,
        windowName: `Окно ${w.number}`,
        ticketNumber: w.currentTicketNumber!,
        serviceTitle: 'Обслуживание клиента',
        estimatedMinutes: 3,
        status: w.status,
      }));
  }, [tvData]);

  const liveWaiting: BoardWaitingTicket[] | null = useMemo(() => {
    if (!tvData?.queue) return null;
    return (tvData.queue as Array<{ publicNumber: string; serviceName?: string }>)
      .map((q, idx) => ({
        id: `${q.publicNumber}-${idx}`,
        number: q.publicNumber,
        serviceTitle: q.serviceName || 'Услуга почты',
        position: idx + 1,
        estimatedWaitMinutes: (idx + 1) * 3,
      }));
  }, [tvData]);

  const effectiveCalls = activeCalls !== undefined ? activeCalls : (liveCalls !== null ? liveCalls : defaultCalls);
  const effectiveWaiting = waitingQueue !== undefined ? waitingQueue : (liveWaiting !== null ? liveWaiting : defaultWaiting);

  const currentBranchName = propBranchName ||
    branches.find(b => b.id === selectedBranchId)?.name ||
    'ОПС 390000 • Главпочтамт';

  // Фильтрация по поиску
  const filteredCalls = useMemo(() => {
    if (!searchQuery.trim()) return effectiveCalls;
    const q = searchQuery.toLowerCase().trim();
    return effectiveCalls.filter(c =>
      c.ticketNumber.toLowerCase().includes(q) ||
      String(c.windowId).includes(q) ||
      c.serviceTitle.toLowerCase().includes(q)
    );
  }, [effectiveCalls, searchQuery]);

  const filteredWaiting = useMemo(() => {
    if (!searchQuery.trim()) return effectiveWaiting;
    const q = searchQuery.toLowerCase().trim();
    return effectiveWaiting.filter(w =>
      w.number.toLowerCase().includes(q) ||
      w.serviceTitle.toLowerCase().includes(q)
    );
  }, [effectiveWaiting, searchQuery]);

  const timeString = now.toLocaleTimeString('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Шапка табло */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#DCE3EC] shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors"
                title="Назад"
                aria-label="Назад"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <PochtaEmblem className="w-9 h-9 shrink-0" bg="#003B73" fg="#FFFFFF" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-[#003B73] tracking-tight">
                  Табло вызова талонов
                </h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-50 text-[#054FA6] border border-blue-200">
                  Онлайн
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {branches.length > 1 ? (
                  <select
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 font-medium focus:ring-1 focus:ring-[#003B73]"
                    aria-label="Выбрать отделение"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-slate-500 font-medium">
                    {currentBranchName}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Кнопка управления и проверки звука */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleSound}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  soundOn
                    ? 'bg-blue-50 text-[#003B73] border-blue-200 hover:bg-blue-100'
                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                }`}
                title={soundOn ? 'Звук и диктор включены' : 'Звук выключен'}
              >
                {soundOn ? <Volume2 className="w-4 h-4 text-[#003B73]" /> : <VolumeX className="w-4 h-4" />}
                <span className="hidden sm:inline">{soundOn ? 'Звук: ВКЛ' : 'Звук: ВЫКЛ'}</span>
              </button>

              <button
                type="button"
                onClick={handleTestSound}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                title="Проверить гонг и диктора"
              >
                Тест звука
              </button>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-mono font-bold text-xs">
              <Clock className="w-3.5 h-3.5 text-[#003B73]" />
              <span>{timeString} МСК</span>
            </div>
          </div>
        </div>

        {/* Быстрый поиск талона и фильтры */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Найти номер своего талона (например, А042)..."
              style={{ paddingLeft: '2.5rem', paddingRight: '1rem' }}
              className="w-full py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#054FA6] focus:border-transparent"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Табы фильтров */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeFilter === 'all'
                  ? 'bg-white text-[#003B73] shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Все ({effectiveCalls.length + effectiveWaiting.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('serving')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeFilter === 'serving'
                  ? 'bg-white text-[#003B73] shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              К окнам ({effectiveCalls.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('waiting')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeFilter === 'waiting'
                  ? 'bg-white text-[#003B73] shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              В очереди ({effectiveWaiting.length})
            </button>
          </div>
        </div>
      </div>

      {/* СЕКЦИЯ 1: ТАЛОН — ОКНО (СНИЗУ ПРИМЕРНО ЗА СКОЛЬКО ОБСЛУЖАТ) */}
      {(activeFilter === 'all' || activeFilter === 'serving') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Сейчас вызывают к окнам ({filteredCalls.length})</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Обновляется автоматически</span>
          </div>

          {filteredCalls.length === 0 ? (
            <div className="p-8 bg-white rounded-2xl border border-slate-200 text-center text-slate-500 text-xs">
              Нет активных вызовов к окнам
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredCalls.map((call) => {
                const isMy = myTicketNumber && call.ticketNumber.toUpperCase() === myTicketNumber.toUpperCase();
                return (
                  <div
                    key={`${call.windowId}-${call.ticketNumber}`}
                    className={`rounded-2xl p-4 bg-white border-2 transition-all shadow-sm flex flex-col justify-between ${
                      isMy
                        ? 'border-[#003B73] ring-4 ring-blue-500/15 bg-blue-50/20'
                        : 'border-[#DCE3EC] hover:border-[#054FA6]'
                    }`}
                  >
                    {/* Верхняя часть: ТАЛОН — ОКНО */}
                    <div>
                      {isMy && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 mb-2 rounded-md bg-blue-100 text-[#003B73] text-[10px] font-bold uppercase">
                          <Sparkles className="w-3 h-3" />
                          <span>Ваш талон!</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        {/* Талон */}
                        <div>
                          <div className="text-[10px] font-mono uppercase text-slate-400 font-bold tracking-wider">
                            Талон
                          </div>
                          <div className="text-3xl font-black font-mono text-[#003B73] tracking-tight mt-0.5">
                            {call.ticketNumber}
                          </div>
                        </div>

                        {/* Стрелка */}
                        <div className="text-xl text-[#054FA6] font-bold px-1">
                          ➔
                        </div>

                        {/* Окно */}
                        <div className="text-right">
                          <div className="text-[10px] font-mono uppercase text-slate-400 font-bold tracking-wider">
                            Окно
                          </div>
                          <div className="mt-0.5">
                            <span className="inline-block bg-[#003B73] text-white px-3 py-1 rounded-xl text-lg sm:text-xl font-black font-mono shadow-sm">
                              № {call.windowId}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-xs font-semibold text-slate-700 mt-2 line-clamp-1">
                        {call.serviceTitle}
                      </div>
                    </div>

                    {/* Снизу примерно за сколько обслужат */}
                    <div className="mt-3 pt-1 flex items-center text-xs">
                      <div className="flex items-center gap-1.5 font-medium text-emerald-800 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-lg">
                        <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>
                          Примерно обслужат за: <strong>~ {call.estimatedMinutes} мин</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* СЕКЦИЯ 2: СЛЕДУЮЩИЕ В ОЧЕРЕДИ */}
      {(activeFilter === 'all' || activeFilter === 'waiting') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
              <Users className="w-3.5 h-3.5 text-amber-600" />
              <span>Ожидают в очереди ({filteredWaiting.length})</span>
            </div>
          </div>

          {filteredWaiting.length === 0 ? (
            <div className="p-6 bg-white rounded-2xl border border-slate-200 text-center text-slate-500 text-xs">
              Очередь ожидания пуста
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredWaiting.map((item) => {
                const isMy = myTicketNumber && item.number.toUpperCase() === myTicketNumber.toUpperCase();
                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl bg-white border transition-all flex items-center justify-between gap-3 ${
                      isMy
                        ? 'border-[#003B73] bg-blue-50/30 ring-2 ring-blue-400/20'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 font-mono font-bold text-xs flex items-center justify-center">
                        #{item.position}
                      </div>
                      <div>
                        <div className="text-base font-black font-mono text-slate-900">
                          {item.number}
                        </div>
                        <div className="text-[11px] text-slate-500 line-clamp-1">
                          {item.serviceTitle}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-md">
                        ~ {item.estimatedWaitMinutes} мин
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 font-medium">
                        ожидание
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
