import React from 'react';
import { X, ShieldCheck, Lock, MapPin, Trash2, CheckCircle2 } from 'lucide-react';
import { PochtaEmblem } from '../../../components/common/PochtaBrand';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClearData?: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({
  isOpen,
  onClose,
  onClearData,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-modal-title"
    >
      <div className="relative w-full max-w-xl max-h-[88vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-[#DFE1F4]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/30 rounded-2xl border border-blue-500/30">
              <ShieldCheck className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 id="privacy-modal-title" className="text-base font-black text-white">
                Защита данных и 152-ФЗ
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Политика конфиденциальности электронной очереди
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-slate-700 text-xs leading-relaxed">
          
          <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200/80 space-y-2">
            <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
              <Lock size={16} className="text-[#1A34E8]" />
              <span>Соответствие стандартам безопасности РФ</span>
            </div>
            <p className="text-blue-800/80">
              Сервис функционирует в строгом соответствии с Федеральным законом № 152-ФЗ «О персональных данных» и требованиями ФСТЭК России.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-black text-[#010E3E]">
              1. Использование геолокации («Яндекс Заправки» стиль)
            </h3>
            <p>
              Координаты пользователя запрашиваются браузером исключительно для вычисления расстояния до ближайшего отделения Почты России. Геолокация обрабатывается на вашем устройстве, не передаётся третьим лицам и не сохраняется в постоянных журналах сервера.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-black text-[#010E3E]">
              2. Принцип минимизации данных
            </h3>
            <p>
              Для получения талона электронной очереди и записи на приём не требуется ввод паспортных данных. Идентификация сессии осуществляется по криптографическому токену устройства и временному номеру талона.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-black text-[#010E3E]">
              3. Прозрачность рейтинга надёжности (Карма)
            </h3>
            <p>
              Индекс надёжности формируется автоматически на основе фактов своевременного прибытия к назначенному времени или заблаговременной отмены талона. Он защищает добросовестных клиентов от сбоев очередей и бот-атак.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-black text-[#010E3E]">
              4. Удаление локальных данных
            </h3>
            <p>
              Вы можете в любой момент сбросить сохранённые талоны и историю визитов на текущем устройстве:
            </p>
            {onClearData && (
              <button
                type="button"
                onClick={() => {
                  onClearData();
                  onClose();
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 font-bold text-xs border border-red-200 transition-colors"
              >
                <Trash2 size={14} />
                <span>Очистить историю талонов на этом устройстве</span>
              </button>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-[#DFE1F4] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-[#1A34E8] hover:bg-[#5975FF] text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-md"
          >
            Понятно
          </button>
        </div>

      </div>
    </div>
  );
};
