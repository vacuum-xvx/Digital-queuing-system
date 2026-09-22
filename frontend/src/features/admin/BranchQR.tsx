import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Download,
  QrCode as QrIcon,
  ExternalLink,
  Printer,
  Copy,
  Check,
  Building2,
  Smartphone,
  Maximize2,
  X,
} from 'lucide-react';
import { PochtaEmblem, PochtaWordmark } from '../../components/common/PochtaBrand';

interface BranchQRProps {
  branchId: string;
  branchName?: string;
}

export function BranchQR({ branchId, branchName }: BranchQRProps) {
  const [qrImage, setQrImage] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);

  const base = import.meta.env.PUBLIC_APP_BASE_URL || window.location.origin;
  const qrUrl = `${base.replace(/\/$/, '')}/q/${encodeURIComponent(branchId)}`;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreenPreview(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    let active = true;
    if (!branchId) return;

    QRCode.toDataURL(qrUrl, {
      width: 480,
      margin: 1,
      color: { dark: '#003B73', light: '#FFFFFF' },
    })
      .then((dataUrl) => {
        if (active) setQrImage(dataUrl);
      })
      .catch((err) => {
        if (import.meta.env.DEV) console.error('Failed to generate branch QR:', err);
      });

    return () => {
      active = false;
    };
  }, [branchId, qrUrl]);

  const copyToClipboard = () => {
    navigator.clipboard?.writeText(qrUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="space-y-6">
      {/* Main Container */}
      <section className="bg-white rounded-3xl border border-[#D2D8E2] p-5 sm:p-7 shadow-sm space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-[#003B73] border border-blue-100 flex items-center justify-center shadow-xs">
              <QrIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">
                QR-код отделения для взятия талона
              </h2>
              <p className="text-xs text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span>{branchName || `ID: ${branchId}`}</span>
              </p>
            </div>
          </div>

          <div className="text-xs text-[#003B73] bg-blue-50 border border-blue-200 px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5">
            <Smartphone className="w-4 h-4" />
            <span>Электронная очередь со смартфона</span>
          </div>
        </div>

        {/* QR Display Card */}
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row items-center gap-8">
          {/* QR Code Graphic Box */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm shrink-0 flex flex-col items-center">
            {qrImage ? (
              <img
                src={qrImage}
                width="240"
                height="240"
                alt={`QR-код для отделения ${branchName || branchId}`}
                className="rounded-xl block"
              />
            ) : (
              <div className="w-[240px] h-[240px] bg-slate-50 rounded-xl flex items-center justify-center text-xs text-slate-400 font-mono animate-pulse">
                Генерация QR-кода…
              </div>
            )}
            <div className="mt-3 flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-[11px] font-bold text-slate-700">
              <span>{branchName || 'Отделение связи'}</span>
            </div>
          </div>

          {/* Details & Actions */}
          <div className="space-y-4 flex-1 text-xs">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#003B73] text-white uppercase font-mono">
                  Общий QR отделения
                </span>
                <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px]">
                  Активен
                </span>
              </div>
              <h3 className="text-base font-black text-slate-900">
                QR-код для страницы отделения
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Разместите QR-код на стойке или у входа. После сканирования клиент открывает страницу этого отделения и может воспользоваться доступными сценариями электронной очереди.
              </p>
            </div>

            {/* Direct Link */}
            <div className="space-y-1.5 pt-1">
              <span className="font-bold text-slate-500 font-mono text-[11px] uppercase block">
                Прямая ссылка для клиента:
              </span>
              <div className="p-2.5 rounded-xl bg-white border border-slate-200 font-mono break-all text-blue-700 flex items-center justify-between gap-2 shadow-2xs">
                <a
                  href={qrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline flex items-center gap-1.5 truncate text-xs"
                  title="Открыть ссылку в новой вкладке"
                >
                  <span className="truncate">{qrUrl}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg shrink-0 transition-colors"
                  title="Скопировать ссылку"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-200/70">
              {qrImage && (
                <a
                  href={qrImage}
                  download={`qr-branch-${branchId.slice(0, 8)}.png`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#003B73] hover:bg-[#054FA6] text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Скачать QR (PNG)</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => setFullscreenPreview(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#003B73] font-bold text-xs border border-blue-200 transition-colors shadow-2xs"
                title="Открыть макет листа А4 на весь экран"
              >
                <Maximize2 className="w-4 h-4" />
                <span>Плакат на весь экран (А4)</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs border border-slate-300 transition-colors shadow-2xs"
              >
                <Printer className="w-4 h-4" />
                <span>Распечатать лист А4</span>
              </button>

              <a
                href={qrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-blue-700 hover:bg-blue-50 font-semibold text-xs ml-auto transition-colors"
              >
                <span>Открыть окно взятия талона</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Fullscreen A4 Preview Modal on screen */}
      {fullscreenPreview && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-2 sm:p-6 overflow-y-auto">
          {/* Floating Control Bar */}
          <div className="w-full max-w-2xl flex items-center justify-between pb-3 px-2 text-white">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-sm">Плакат стойки • Формат А4 (210 × 297 мм)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#003B73] hover:bg-[#054FA6] text-white font-bold text-xs shadow-md transition-all active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>Печать (Ctrl+P)</span>
              </button>
              <button
                type="button"
                onClick={() => setFullscreenPreview(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Закрыть (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Scaled A4 Sheet for Screen */}
          <div className="w-full max-w-[650px] max-h-[88vh] aspect-[210/297] bg-white text-slate-900 rounded-2xl shadow-2xl border-4 border-[#003B73] p-8 sm:p-10 flex flex-col justify-between overflow-y-auto">
            {/* Top Brand Header */}
            <div className="w-full border-b-2 border-[#003B73] pb-4 flex items-center justify-between">
              <div className="flex items-center gap-3 text-left">
                <PochtaEmblem className="w-12 h-12 shrink-0" bg="#003B73" fg="#FFFFFF" />
                <div>
                  <PochtaWordmark className="h-5 w-auto" color="#003B73" />
                  <div className="text-xs text-slate-800 font-bold mt-0.5">
                    {branchName || 'Отделение почтовой связи'}
                  </div>
                </div>
              </div>
              <div className="text-right text-[11px] font-mono font-bold text-slate-400">
                ПОЧТА РОССИИ
              </div>
            </div>

            {/* Main Title */}
            <div className="space-y-1 text-center my-2">
              <h1 className="text-2xl sm:text-3xl font-black text-[#003B73] tracking-tight">
                Электронная очередь
              </h1>
              <p className="text-xs sm:text-sm font-bold text-slate-700">
                Отсканируйте QR-код камерой мобильного телефона
              </p>
            </div>

            {/* Large Clean QR Code with Postal Border */}
            {qrImage && (
              <div className="relative my-2 p-3 bg-white border-4 border-[#003B73] rounded-3xl shadow-sm mx-auto max-w-[260px]">
                <img
                  src={qrImage}
                  width="240"
                  height="240"
                  className="w-52 h-52 mx-auto block object-contain"
                  alt="QR-код для взятия талона"
                />
                <div className="mt-2 text-xs font-semibold text-slate-700 text-center">
                  Наведите камеру смартфона
                </div>
              </div>
            )}

            {/* Three numbered actions */}
            <div className="w-full grid grid-cols-3 gap-2.5 my-2 text-left">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="w-6 h-6 rounded-full bg-[#003B73] text-white font-black text-xs flex items-center justify-center mb-1.5">
                  1
                </div>
                <div className="font-bold text-xs text-slate-900 mb-0.5">
                  Камера
                </div>
                <p className="text-[10px] text-slate-600 leading-tight">
                  Наведите камеру на QR-код
                </p>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="w-6 h-6 rounded-full bg-[#003B73] text-white font-black text-xs flex items-center justify-center mb-1.5">
                  2
                </div>
                <div className="font-bold text-xs text-slate-900 mb-0.5">
                  Ссылка
                </div>
                <p className="text-[10px] text-slate-600 leading-tight">
                  Перейдите по ссылке на экране
                </p>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="w-6 h-6 rounded-full bg-[#003B73] text-white font-black text-xs flex items-center justify-center mb-1.5">
                  3
                </div>
                <div className="font-bold text-xs text-slate-900 mb-0.5">
                  Талон
                </div>
                <p className="text-[10px] text-slate-600 leading-tight">
                  Выберите услугу и ждите вызов
                </p>
              </div>
            </div>

            {/* Footer Metadata */}
            <div className="w-full border-t border-slate-200 pt-2.5 text-center text-xs text-slate-500 flex items-center justify-between">
              <span>{branchName || 'Отделение почтовой связи'}</span>
              <span>Цифровая очередь • Почта России</span>
            </div>
          </div>
        </div>
      )}

      {/* Printable poster: intentionally contains only the verified QR entry point. */}
      <div
        id="print-ticket-slip"
        className="hidden print:flex"
      >
        <div className="a4-sheet-card w-full text-center font-sans bg-white relative flex flex-col justify-between items-center">
          {/* Top Brand Header */}
          <div className="w-full border-b-2 border-[#003B73] pb-4 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3 text-left">
              <PochtaEmblem className="w-14 h-14 shrink-0" bg="#003B73" fg="#FFFFFF" />
              <div>
                <PochtaWordmark className="h-6 w-auto" color="#003B73" />
                <div className="text-sm text-slate-800 font-bold mt-0.5">
                  {branchName || 'Отделение почтовой связи'}
                </div>
              </div>
            </div>
            <div className="text-right text-xs font-mono font-bold text-slate-500">
              ПОЧТА РОССИИ
            </div>
          </div>

          {/* Main Title */}
          <div className="space-y-2 mb-4 text-center">
            <h1 className="text-4xl font-black text-[#003B73] tracking-tight">
              Электронная очередь
            </h1>
            <p className="text-lg font-bold text-slate-800">
              Отсканируйте QR-код камерой телефона
            </p>
          </div>

          {/* Large Clean QR Code with Postal Border */}
          {qrImage ? (
            <div className="relative my-4 p-4 bg-white border-4 border-[#003B73] rounded-3xl shadow-xs mx-auto">
              <img
                src={qrImage}
                width="320"
                height="320"
                className="w-80 h-80 mx-auto block"
                alt="QR-код для взятия талона"
              />
              <div className="mt-3 text-base font-bold text-slate-800">
                Откройте ссылку, которая появится на экране
              </div>
            </div>
          ) : null}

          {/* Three actions are deliberately factual and short. */}
          <div className="w-full grid grid-cols-3 gap-4 my-6 text-left">
            <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl">
              <div className="w-8 h-8 rounded-full bg-[#003B73] text-white font-black text-sm flex items-center justify-center mb-2">
                1
              </div>
              <div className="font-bold text-sm text-slate-900 mb-1">
                Наведите камеру
              </div>
              <p className="text-xs text-slate-600 leading-tight">
                Наведите камеру на QR-код
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl">
              <div className="w-8 h-8 rounded-full bg-[#003B73] text-white font-black text-sm flex items-center justify-center mb-2">
                2
              </div>
              <div className="font-bold text-sm text-slate-900 mb-1">
                Откройте страницу
              </div>
              <p className="text-xs text-slate-600 leading-tight">
                Нажмите на ссылку в уведомлении камеры
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl">
              <div className="w-8 h-8 rounded-full bg-[#003B73] text-white font-black text-sm flex items-center justify-center mb-2">
                3
              </div>
              <div className="font-bold text-sm text-slate-900 mb-1">
                Выберите действие
              </div>
              <p className="text-xs text-slate-600 leading-tight">
                Дальше следуйте подсказкам на странице
              </p>
            </div>
          </div>

          {/* Footer Metadata */}
          <div className="w-full border-t border-slate-200 pt-4 text-sm text-slate-600 flex items-center justify-between">
            <span>{branchName || 'Отделение почтовой связи'}</span>
            <span>Цифровая очередь нового поколения</span>
          </div>
        </div>
      </div>
    </div>
  );
}
