import React, { useState } from 'react';
import { Service, Branch } from '../../../api/client/types';
import {
  MapPin,
  X,
  CheckCircle2,
  Sparkles,
  Clock,
  Users,
  ArrowRight,
  Ticket,
  Box,
  Mail,
} from 'lucide-react';
import { PochtaEmblem } from '../../../components/common/PochtaBrand';

interface ArrivalSheetProps {
  isOpen: boolean;
  onClose: () => void;
  branch: Branch | null;
  services: Service[];
  onTakeTicket: (serviceId: string) => Promise<void>;
  isLoading?: boolean;
}

export const ArrivalSheet: React.FC<ArrivalSheetProps> = ({
  isOpen,
  onClose,
  branch,
  services,
  onTakeTicket,
  isLoading = false,
}) => {
  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    services[0]?.id || ''
  );

  if (!isOpen) return null;

  const handleConfirm = async () => {
    const sId = selectedServiceId || services[0]?.id;
    if (sId) {
      await onTakeTicket(sId);
      onClose();
    }
  };

  const branchCode = (branch as any)?.code || '390000';
  const branchAddress = branch?.address || 'ул. Ленина, 24';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-md transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="arrival-sheet-title"
    >
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Bottom Sheet Modal Container (Authentic Yandex Refuel / Яндекс Заправки style) */}
      <div className="relative w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 sm:p-7 z-10 border border-[#D4E0ED] animate-in slide-in-from-bottom duration-300">
        {/* Top Drag Pill */}
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-[#476788] hover:text-[#0B3558] hover:bg-slate-100 rounded-full transition-colors"
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>

        {/* Header: Pochta Emblem + Geolocation detection */}
        <div className="flex items-start gap-4">
          <div className="p-3 bg-[#EDF4FC] rounded-2xl border border-[#D4E0ED] shrink-0">
            <PochtaEmblem className="w-9 h-9" bg="#0055A5" fg="#FFFFFF" />
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              <span>Вы на месте (радар: 15 м)</span>
            </div>
            <h3
              id="arrival-sheet-title"
              className="text-xl font-black text-[#0B3558] leading-tight"
            >
              {branch?.name || 'Отделение Почты России'}
            </h3>
            <p className="text-xs text-[#476788] flex items-center gap-1 mt-0.5">
              <MapPin size={12} className="text-[#0055A5] shrink-0" />
              <span className="truncate">{branchAddress}</span>
            </p>
          </div>
        </div>

        {/* Yandex Refuel Branch Badge */}
        <div className="mt-3.5 p-3 rounded-2xl bg-[#EDF4FC] border border-[#CADBEF] flex items-center gap-2.5 text-xs text-[#0B3558]">
          <MapPin size={16} className="text-[#0055A5] shrink-0" />
          <span className="font-semibold leading-relaxed">
            Вы в отделении {branchCode} ({branchAddress}). Взять талон без очереди к терминалу?
          </span>
        </div>

        {/* Branch Live Metrics Banner (Flat vector style) */}
        <div className="mt-3.5 p-3.5 bg-[#F8FAFC] rounded-2xl border border-[#D4E0ED] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-amber-500 shrink-0" />
            <div>
              <span className="text-[#476788] text-[11px] block">Ожидание в зале</span>
              <strong className="text-[#0B3558] font-bold">~3–5 минут</strong>
            </div>
          </div>
          <div className="h-6 w-px bg-[#D4E0ED]" />
          <div className="flex items-center gap-2">
            <Users size={16} className="text-[#0055A5] shrink-0" />
            <div>
              <span className="text-[#476788] text-[11px] block">Работает окон</span>
              <strong className="text-[#0B3558] font-bold">4 окна</strong>
            </div>
          </div>
          <div className="h-6 w-px bg-[#D4E0ED]" />
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-emerald-500 shrink-0" />
            <div>
              <span className="text-[#476788] text-[11px] block">Терминал</span>
              <strong className="text-emerald-700 font-bold">Без очереди</strong>
            </div>
          </div>
        </div>

        {/* Service Selector Chips */}
        <div className="mt-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-[#476788] mb-2">
            Выберите услугу для быстрого талона:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
            {services.map(svc => {
              const isSelected =
                (selectedServiceId || services[0]?.id) === svc.id;
              const isParcel =
                svc.name.toLowerCase().includes('посыл') ||
                svc.name.toLowerCase().includes('отправлен');

              return (
                <button
                  key={svc.id}
                  type="button"
                  onClick={() => setSelectedServiceId(svc.id)}
                  className={`p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#EDF4FC] border-[#0055A5] ring-2 ring-[#0055A5]/20 shadow-sm'
                      : 'bg-white border-[#D4E0ED] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`p-1.5 rounded-lg shrink-0 ${
                        isSelected
                          ? 'bg-[#0055A5] text-white'
                          : 'bg-slate-100 text-[#476788]'
                      }`}
                    >
                      {isParcel ? <Box size={16} /> : <Mail size={16} />}
                    </div>
                    <span
                      className={`text-xs font-bold truncate ${
                        isSelected ? 'text-[#0B3558]' : 'text-slate-700'
                      }`}
                    >
                      {svc.name}
                    </span>
                  </div>
                  {isSelected && (
                    <CheckCircle2
                      size={16}
                      className="text-[#0055A5] shrink-0"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 1-Tap Action Button (Яндекс Заправки style with Signal Blue #0055A5 / #006BFF) */}
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading || services.length === 0}
            style={{ backgroundColor: '#0055A5', color: '#ffffff' }}
            className="w-full py-4 px-6 rounded-2xl bg-[#0055A5] hover:bg-[#004282] active:scale-[0.98] text-white font-black text-base flex items-center justify-center gap-3 shadow-xl shadow-blue-800/25 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Ticket size={22} className="text-white shrink-0" />
            <div className="flex flex-col items-center">
              <span className="text-base font-black tracking-wide text-white">
                {isLoading ? 'Оформляем талон...' : 'Получить талон в 1 клик'}
              </span>
              <span className="text-[11px] font-medium text-blue-100 opacity-90">
                Взять талон без терминала к оператору
              </span>
            </div>
            <ArrowRight size={18} className="text-white/80 shrink-0" />
          </button>

          <p className="text-[11px] text-center text-[#476788]">
            Вам не нужно стоять к сенсорному экрану. Номер появится прямо на вашем экране и на табло зала.
          </p>
        </div>
      </div>
    </div>
  );
};
