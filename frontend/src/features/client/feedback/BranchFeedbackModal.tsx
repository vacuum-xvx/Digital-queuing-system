import React, { useState } from 'react';
import { Star, X, CheckCircle2, ThumbsUp } from 'lucide-react';
import { PochtaEmblem } from '../../../components/common/PochtaBrand';

interface BranchFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  branchName?: string;
  ticketNumber?: string;
  onSubmitSuccess?: () => void;
}

const FEEDBACK_TAGS = [
  '⚡ Быстрое окно',
  'Быстрое обслуживание',
  '😊 Вежливый оператор',
  'Вежливый оператор',
  'Чисто в зале',
  'Помогли упаковать',
  '❄️ Комфортный зал',
  '📦 Аккуратная посылка',
  '📱 Удобная электронная очередь',
  '✨ Чистота и порядок',
  '⏱️ Без задержек',
];

export const BranchFeedbackModal: React.FC<BranchFeedbackModalProps> = ({
  isOpen,
  onClose,
  branchName = 'Отделение Почты России',
  ticketNumber,
  onSubmitSuccess,
}) => {
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([
    '⚡ Быстрое окно',
    'Быстрое обслуживание',
    'Вежливый оператор',
  ]);
  const [comment, setComment] = useState<string>('');
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [showToast, setShowToast] = useState<boolean>(false);

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

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setShowToast(true);

    setTimeout(() => {
      setSubmitted(false);
      setShowToast(false);
      if (onSubmitSuccess) onSubmitSuccess();
      onClose();
    }, 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
    >
      <div className="relative w-full max-w-lg bg-[#F8F9FB] rounded-3xl shadow-2xl overflow-hidden border border-[#D4E0ED] text-[#0B3558] animate-in zoom-in-95 duration-200">
        {/* Floating Toast Notification */}
        {showToast && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-xl animate-in slide-in-from-top duration-300"
            role="status"
          >
            <CheckCircle2 size={16} className="text-white shrink-0" />
            <span>Отзыв успешно отправлен!</span>
          </div>
        )}

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-[#0B3558] hover:bg-slate-100 rounded-full transition-colors z-10"
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>

        {submitted ? (
          <div className="p-8 text-center space-y-4 bg-white m-3 rounded-2xl border border-[#D4E0ED] shadow-sm">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto border border-emerald-200">
              <CheckCircle2 size={36} />
            </div>
            <h3 className="text-xl font-black text-[#0B3558]">Спасибо за ваш отзыв!</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Ваша оценка помогает улучшать стандарты обслуживания и учитывается в расчете кармы и премировании операторов отделения.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
            {/* Header */}
            <div className="text-center space-y-1">
              <div className="inline-flex p-2.5 bg-blue-50 rounded-2xl mb-1 border border-[#D4E0ED]">
                <PochtaEmblem className="w-8 h-8" bg="#0055A5" fg="#FFFFFF" />
              </div>
              <h2 id="feedback-modal-title" className="text-lg font-black text-[#0B3558]">
                Как прошёл ваш визит?
              </h2>
              <p className="text-xs text-slate-500">
                {branchName} {ticketNumber ? `• Талон ${ticketNumber}` : ''}
              </p>
            </div>

            {/* 1–5 Golden Stars */}
            <div className="bg-white rounded-2xl p-4 border border-[#D4E0ED] shadow-sm text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Поставьте оценку от 1 до 5 звезд
              </span>
              <div className="flex justify-center items-center gap-2">
                {[1, 2, 3, 4, 5].map(star => {
                  const active = (hoverRating ?? rating) >= star;
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(null)}
                      className="p-1.5 text-slate-200 hover:scale-125 transition-transform cursor-pointer focus:outline-none"
                      aria-label={`Оценка ${star} из 5`}
                    >
                      <Star
                        size={34}
                        className={
                          active
                            ? 'fill-[#F59E0B] text-[#F59E0B] drop-shadow-sm'
                            : 'text-slate-300 hover:text-amber-300'
                        }
                      />
                    </button>
                  );
                })}
              </div>
              <p className="text-xs font-bold text-[#0055A5] mt-2">
                {rating === 5
                  ? 'Отлично! Всё прошло замечательно'
                  : rating === 4
                  ? 'Хорошо, понравилось'
                  : rating === 3
                  ? 'Нормально, но есть замечания'
                  : rating === 2
                  ? 'Плохо, были задержки'
                  : 'Очень плохо, требуется внимание'}
              </p>
            </div>

            {/* Quick Reaction Chips */}
            <div className="bg-white rounded-2xl p-4 border border-[#D4E0ED] shadow-sm space-y-2.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Быстрые впечатления
              </label>
              <div className="flex flex-wrap gap-2">
                {FEEDBACK_TAGS.map(tag => {
                  const selected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                        selected
                          ? 'bg-[#0055A5] text-white border-[#0055A5] shadow-sm scale-[1.02]'
                          : 'bg-[#F8F9FB] text-slate-600 border-[#D4E0ED] hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Comments Textarea */}
            <div className="bg-white rounded-2xl p-4 border border-[#D4E0ED] shadow-sm space-y-1.5">
              <label className="block text-xs font-bold text-[#0B3558]">
                Комментарий (необязательно)
              </label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Расскажите подробнее о впечатлениях..."
                rows={3}
                className="w-full p-3 rounded-xl border border-[#D4E0ED] bg-[#F8F9FB] text-xs text-[#0B3558] focus:bg-white focus:ring-2 focus:ring-[#0055A5] focus:border-transparent resize-none transition-all"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-3.5 px-4 rounded-xl bg-[#0055A5] hover:bg-[#004488] active:scale-[0.98] text-white font-bold text-xs uppercase tracking-wider shadow-md shadow-blue-900/10 transition-all flex items-center justify-center gap-2"
            >
              <ThumbsUp size={16} />
              <span>Отправить отзыв</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
