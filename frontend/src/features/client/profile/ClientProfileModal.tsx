import React, { useState } from 'react';
import { Ticket, Branch, Service } from '../../../api/client/types';
import {
  X,
  Award,
  ShieldCheck,
  Clock,
  Volume2,
  Smartphone,
  ChevronRight,
  TrendingUp,
  CheckCircle2,
} from 'lucide-react';
import { PochtaEmblem } from '../../../components/common/PochtaBrand';
import { formatMoscowDateTime } from '../../../utils/time';

interface ClientProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  tickets: Ticket[];
  branches: Branch[];
  services: Service[];
  onOpenTicket: (ticket: Ticket) => void;
}

export const ClientProfileModal: React.FC<ClientProfileModalProps> = ({
  isOpen,
  onClose,
  tickets,
  branches,
  services,
  onOpenTicket,
}) => {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [geoEnabled, setGeoEnabled] = useState(true);

  // ESC key listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return { label: 'Обслужен', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'CANCELLED':
      case 'NO_SHOW':
        return { label: 'Отменен', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
      case 'CALLED':
      case 'SERVING':
      case 'WAITING':
      default:
        return { label: 'В очереди', cls: 'bg-blue-50 text-[#0055A5] border-blue-200' };
    }
  };

  const sortedTickets = [...tickets]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div className="relative w-full max-w-xl max-h-[90vh] bg-[#F8F9FB] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-[#D4E0ED] text-[#0B3558]">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-white border-b border-[#D4E0ED] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-[#D4E0ED] flex items-center justify-center shrink-0">
              <PochtaEmblem className="w-7 h-7" bg="#0055A5" fg="#FFFFFF" />
            </div>
            <div>
              <h2 id="profile-modal-title" className="text-lg font-black leading-tight text-[#0B3558]">
                Личный кабинет клиента
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Цифровая очередь • Идентификатор устройства
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-[#0B3558] hover:bg-slate-100 rounded-full transition-colors"
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Karma & Reliability Card */}
          <div className="bg-white rounded-2xl p-5 border border-[#D4E0ED] shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#0055A5] block">
                  Индекс ответственности
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <h3 className="text-3xl font-black text-[#0B3558] tracking-tight">
                    4.97 ★
                  </h3>
                  <span className="text-sm font-bold text-slate-400">/ 5.0</span>
                  <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    99% Надежность
                  </span>
                </div>
              </div>

              {/* Badges List */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1 shadow-sm">
                  <Award size={13} className="text-amber-600" />
                  <span>Золотой статус</span>
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-[#0055A5] border border-blue-200 flex items-center gap-1 shadow-sm">
                  <Clock size={13} className="text-[#0055A5]" />
                  <span>Пунктуальный посетитель</span>
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1 shadow-sm">
                  <ShieldCheck size={13} className="text-emerald-600" />
                  <span>Цифровой верифицирован</span>
                </span>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-2.5 pt-3 border-t border-[#D4E0ED] text-center">
              <div className="bg-[#F8F9FB] p-2.5 rounded-xl border border-[#D4E0ED]">
                <span className="text-[11px] text-slate-500 block">Визитов вовремя</span>
                <strong className="text-base font-black text-emerald-600 font-mono">18 / 18</strong>
              </div>
              <div className="bg-[#F8F9FB] p-2.5 rounded-xl border border-[#D4E0ED]">
                <span className="text-[11px] text-slate-500 block">Неявок</span>
                <strong className="text-base font-black text-[#0B3558] font-mono">0</strong>
              </div>
              <div className="bg-[#F8F9FB] p-2.5 rounded-xl border border-[#D4E0ED]">
                <span className="text-[11px] text-slate-500 block">Операторы</span>
                <strong className="text-base font-black text-amber-600 font-mono">★ 5.0</strong>
              </div>
            </div>

            {/* Growth factors list */}
            <div className="bg-[#F8F9FB] rounded-xl p-3.5 border border-[#D4E0ED] space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#0B3558]">
                <TrendingUp size={15} className="text-emerald-600" />
                <span>Факторы роста кармы и рейтинга:</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-600">
                <li className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-[#D4E0ED]">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                    <span>Пришел вовремя</span>
                  </span>
                  <span className="font-mono font-bold text-emerald-600 text-[11px]">(+0.05)</span>
                </li>
                <li className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-[#D4E0ED]">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                    <span>Оператор отметил вежливость</span>
                  </span>
                  <span className="font-mono font-bold text-emerald-600 text-[11px]">(+0.02)</span>
                </li>
                <li className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-[#D4E0ED]">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                    <span>Заблаговременная отмена вместо неявки</span>
                  </span>
                  <span className="font-mono font-bold text-emerald-600 text-[11px]">(+0.03)</span>
                </li>
              </ul>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              ✨ Высокий рейтинг надёжности защищает вас от сброса бронирования и обеспечивает справедливый приоритет в случае задержек окон.
            </p>
          </div>

          {/* Quick Preferences */}
          <div className="bg-white rounded-2xl p-5 border border-[#D4E0ED] shadow-sm space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Настройки оповещений и сенсоров
            </h4>
            <div className="space-y-2">
              <label className="flex items-center justify-between p-3 rounded-xl bg-[#F8F9FB] border border-[#D4E0ED] cursor-pointer hover:bg-slate-100 transition-colors">
                <div className="flex items-center gap-2.5">
                  <Volume2 size={16} className="text-slate-600" />
                  <span className="text-xs font-bold text-[#0B3558]">Звуковой сигнал при вызове</span>
                </div>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={e => setSoundEnabled(e.target.checked)}
                  className="rounded text-[#0055A5] focus:ring-[#0055A5] w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-[#F8F9FB] border border-[#D4E0ED] cursor-pointer hover:bg-slate-100 transition-colors">
                <div className="flex items-center gap-2.5">
                  <Smartphone size={16} className="text-slate-600" />
                  <span className="text-xs font-bold text-[#0B3558]">Вибрация (Тактильный отклик)</span>
                </div>
                <input
                  type="checkbox"
                  checked={hapticEnabled}
                  onChange={e => setHapticEnabled(e.target.checked)}
                  className="rounded text-[#0055A5] focus:ring-[#0055A5] w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-[#F8F9FB] border border-[#D4E0ED] cursor-pointer hover:bg-slate-100 transition-colors">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck size={16} className="text-slate-600" />
                  <span className="text-xs font-bold text-[#0B3558]">
                    Автоматическое прибытие по гео (152-ФЗ)
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={geoEnabled}
                  onChange={e => setGeoEnabled(e.target.checked)}
                  className="rounded text-[#0055A5] focus:ring-[#0055A5] w-4 h-4 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Ticket History */}
          <div className="bg-white rounded-2xl p-5 border border-[#D4E0ED] shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                История последних талонов ({sortedTickets.length})
              </h4>
            </div>

            {sortedTickets.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center bg-[#F8F9FB] rounded-xl border border-[#D4E0ED]">
                История пуста. Ваши полученные талоны будут отображаться здесь.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {sortedTickets.map(t => {
                  const sName = services.find(s => s.id === t.serviceId)?.name || 'Почтовые услуги';
                  const bName = branches.find(b => b.id === t.branchId)?.name || 'Отделение Почты России';
                  const dateStr = formatMoscowDateTime(t.createdAt);
                  const statusInfo = getStatusInfo(t.status);

                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        onOpenTicket(t);
                        onClose();
                      }}
                      className="p-3 rounded-xl border border-[#D4E0ED] bg-[#F8F9FB] hover:border-[#0055A5] hover:bg-blue-50/40 transition-all flex items-center justify-between cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono font-black text-sm text-[#0B3558] group-hover:text-[#0055A5] px-2 py-1 rounded bg-white border border-[#D4E0ED]">
                          {t.publicNumber}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#0B3558] truncate">{sName}</p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 truncate">
                            <span>{dateStr}</span>
                            <span>•</span>
                            <span className="truncate">{bName}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.cls}`}
                        >
                          {statusInfo.label}
                        </span>
                        <ChevronRight
                          size={14}
                          className="text-slate-400 group-hover:translate-x-0.5 transition-transform"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-[#D4E0ED] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0B3558] font-bold text-xs uppercase tracking-wider transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
