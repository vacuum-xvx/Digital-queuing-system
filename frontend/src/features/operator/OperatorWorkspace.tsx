import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ShieldAlert, Clock, Volume2, Check, UserX, RotateCcw,
  UserPlus, ArrowRightLeft, AlertTriangle, CheckSquare, Square
} from 'lucide-react';
import * as api from '../../api/operator/operatorApi';
import { OperatorWindow, Ticket } from '../../api/operator/types';
import { SERVICES } from '../../PochtaDemo'; // Assuming SERVICES is exported from PochtaDemo

export function OperatorWorkspace({ branchId, currentUser, logout, setActiveTab }: { branchId: string, currentUser: any, logout: any, setActiveTab: any }) {
  const [windows, setWindows] = useState<OperatorWindow[]>([]);
  const [operatorWindowId, setOperatorWindowId] = useState<string>('1');
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operatorElapsedSeconds, setOperatorElapsedSeconds] = useState(0);

  // Poll for current ticket
  useEffect(() => {
    let timer: number;
    let unmounted = false;
    
    async function load() {
      if (unmounted) return;
      try {
        const wlist = await api.listWindows(branchId);
        if (!unmounted) setWindows(wlist);
        
        const current = await api.getCurrentTicket(operatorWindowId);
        if (!unmounted) setCurrentTicket(current);
      } catch (e: any) {
        if (!unmounted) setError(e.message);
      } finally {
        if (!unmounted) timer = window.setTimeout(load, 2000);
      }
    }
    
    load();
    return () => {
      unmounted = true;
      clearTimeout(timer);
    };
  }, [branchId, operatorWindowId]);

  // Timer for elapsed seconds
  useEffect(() => {
    setOperatorElapsedSeconds(0);
    if (!currentTicket || currentTicket.status === 'COMPLETED' || currentTicket.status === 'NO_SHOW') return;
    
    const interval = setInterval(() => {
      setOperatorElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [currentTicket?.id]);

  const operatorSelectedWindow = useMemo<OperatorWindow>(() => {
    return windows.find(w => w.id === operatorWindowId) || {
      id: operatorWindowId,
      number: parseInt(operatorWindowId, 10),
      status: 'OPEN',
      services: [],
    };
  }, [windows, operatorWindowId]);

  const handleCallNext = async () => {
    try {
      const ticket = await api.callNext(operatorWindowId);
      setCurrentTicket(ticket);
    } catch (e: any) {
      alert(`Не удалось вызвать: ${e.message}`);
    }
  };

  const handleFinish = async () => {
    if (!currentTicket) return;
    try {
      await api.completeService(currentTicket.id);
      setCurrentTicket(null);
    } catch (e: any) {
      alert(`Ошибка: ${e.message}`);
    }
  };

  const handleNoShow = async () => {
    if (!currentTicket) return;
    try {
      await api.markNoShow(currentTicket.id);
      setCurrentTicket(null);
    } catch (e: any) {
      alert(`Ошибка: ${e.message}`);
    }
  };
  
  const handleStartService = async () => {
    if (!currentTicket) return;
    try {
      await api.startService(currentTicket.id);
    } catch (e: any) {
      alert(`Ошибка: ${e.message}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-[#D2D8E2] p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#003B73] text-white font-mono font-black text-xl flex items-center justify-center shadow-md">
              № {operatorWindowId}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-base text-slate-900">Окно {operatorSelectedWindow.number}</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border ${operatorSelectedWindow.status === 'OPEN' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-200 text-slate-700 border-slate-300'}`}>
                  {operatorSelectedWindow.status === 'OPEN' ? 'СМЕНА АКТИВНА' : 'ОКНО ЗАКРЫТО'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Оператор: <strong className="text-slate-800">{currentUser?.email ?? 'Оператор'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-500 font-bold hidden sm:inline">Выбор окна:</span>
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              {['1', '2', '3'].map(wid => (
                <button
                  key={wid}
                  type="button"
                  onClick={() => setOperatorWindowId(wid)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${operatorWindowId === wid ? 'bg-[#003B73] text-white shadow-sm' : 'text-slate-700 hover:bg-white'}`}
                >
                  № {wid}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-3xl border border-[#D2D8E2] p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-500 font-bold">
                Текущий клиент у стойки Окна № {operatorWindowId}
              </div>
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-800 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                <Clock className="w-4 h-4 text-[#003B73]" />
                <span>{Math.floor(operatorElapsedSeconds / 60).toString().padStart(2, '0')}:{(operatorElapsedSeconds % 60).toString().padStart(2, '0')}</span>
              </div>
            </div>

            {currentTicket ? (
              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono uppercase text-[#003B73] font-bold">Талон клиента</div>
                    <div className="text-5xl sm:text-6xl font-black font-mono text-[#003B73] tracking-tight my-1">
                      {currentTicket.publicNumber || currentTicket.id.slice(-4)}
                    </div>
                    <div className="text-xs font-semibold text-slate-700">
                      {SERVICES.find((s: any) => s.id === currentTicket.serviceId)?.title || 'Почтовые услуги'}
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs font-mono sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
                    <div>
                      <span className="text-slate-500 font-sans">Источник:</span>
                      <span className="font-bold text-[#054FA6] ml-1">{currentTicket.source}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-sans">Статус:</span>
                      <span className="font-bold text-emerald-700 ml-1">{currentTicket.status}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleCallNext}
                    className="min-h-[50px] py-3 px-4 rounded-2xl border-2 border-[#003B73] text-[#003B73] hover:bg-blue-50 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                  >
                    <Volume2 className="w-4 h-4 text-emerald-600" />
                    <span>Вызвать след.</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleFinish}
                    className="min-h-[50px] py-3 px-4 rounded-2xl bg-[#003B73] hover:bg-[#002d58] active:bg-[#001f3f] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all"
                  >
                    <Check className="w-5 h-5" />
                    <span>Завершить приём</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={handleStartService}
                    className="min-h-[42px] p-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 flex items-center justify-center gap-1.5 font-bold"
                  >
                    <span>Начать обслуж.</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleNoShow}
                    className="min-h-[42px] p-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 flex items-center justify-center gap-1.5 font-bold"
                  >
                    <UserX className="w-4 h-4 text-amber-700" />
                    <span>Не явился (NO_SHOW)</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 space-y-3">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <UserX className="w-8 h-8" />
                </div>
                <div className="text-sm font-bold text-slate-800">Нет активного клиента у Окна № {operatorWindowId}</div>
                <button
                  type="button"
                  onClick={handleCallNext}
                  className="min-h-[48px] px-6 rounded-2xl bg-[#003B73] text-white font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 shadow-md hover:bg-[#002d58]"
                >
                  <Volume2 className="w-4 h-4 text-emerald-300" />
                  <span>Вызвать клиента</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
