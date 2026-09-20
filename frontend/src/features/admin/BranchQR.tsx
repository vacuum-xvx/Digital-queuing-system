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
} from 'lucide-react';
import { PochtaEmblem, PochtaWordmark } from '../../components/common/PochtaBrand';

interface BranchQRProps {
  branchId: string;
  branchName?: string;
}

export function BranchQR({ branchId, branchName }: BranchQRProps) {
  const [qrImage, setQrImage] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const base = import.meta.env.PUBLIC_APP_BASE_URL || window.location.origin;
  const qrUrl = `${base.replace(/\/$/, '')}/q/${encodeURIComponent(branchId)}`;

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
        console.error('Failed to generate branch QR:', err);
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
                  <span>Скачать QR-код (PNG)</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs border border-slate-300 transition-colors shadow-2xs"
              >
                <Printer className="w-4 h-4" />
                <span>Распечатать плакат для стойки</span>
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

      {/* Printable poster: intentionally contains only the verified QR entry point. */}
      <div
        id="print-ticket-slip"
        className="hidden print:flex"
      >
        <div className="w-full max-w-[620px] mx-auto border-2 border-[#003B73] p-10 text-center font-sans bg-white relative flex flex-col items-center">
          {/* Top Brand Header */}
          <div className="w-full border-b-2 border-[#003B73] pb-4 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3 text-left">
              <PochtaEmblem className="w-12 h-12 shrink-0" bg="#003B73" fg="#FFFFFF" />
              <div>
                <PochtaWordmark className="h-5 w-auto" color="#003B73" />
                <div className="text-xs text-slate-800 font-bold mt-0.5">
                  {branchName || 'Отделение почтовой связи'}
                </div>
              </div>
            </div>

          </div>

          {/* Postal Red Accent Line */}
          <div className="w-full h-1 bg-[#D92534] mb-8"></div>

          {/* Main Title */}
          <div className="space-y-1 mb-5">
            <h1 className="text-3xl sm:text-4xl font-black text-[#003B73] tracking-tight">
              Электронная очередь
            </h1>
            <p className="text-base font-bold text-slate-800">
              Отсканируйте QR-код камерой телефона
            </p>
          </div>

          {/* Large Clean QR Code with Postal Border */}
          {qrImage ? (
            <div className="relative my-2 p-3 bg-white border-4 border-[#003B73] rounded-3xl shadow-xs">
              <img
                src={qrImage}
                width="260"
                height="260"
                className="w-72 h-72 mx-auto block"
                alt="QR-код для взятия талона"
              />
              <div className="mt-3 text-sm font-semibold text-slate-800">
                Откройте ссылку, которая появится на экране
              </div>
            </div>
          ) : null}

          {/* Three actions are deliberately factual and short. */}
          <div className="w-full grid grid-cols-3 gap-3 my-7 text-left">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
              <div className="w-7 h-7 rounded-full bg-[#003B73] text-white font-black text-xs flex items-center justify-center mb-2">
                1
              </div>
              <div className="font-bold text-xs text-slate-900 mb-1">
                Наведите камеру
              </div>
              <p className="text-[11px] text-slate-600 leading-tight">
                Наведите камеру на QR-код
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
              <div className="w-7 h-7 rounded-full bg-[#003B73] text-white font-black text-xs flex items-center justify-center mb-2">
                2
              </div>
              <div className="font-bold text-xs text-slate-900 mb-1">
                Откройте страницу
              </div>
              <p className="text-[11px] text-slate-600 leading-tight">
                Нажмите на ссылку в уведомлении камеры
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
              <div className="w-7 h-7 rounded-full bg-[#003B73] text-white font-black text-xs flex items-center justify-center mb-2">
                3
              </div>
              <div className="font-bold text-xs text-slate-900 mb-1">
                Выберите действие
              </div>
              <p className="text-[11px] text-slate-600 leading-tight">
                Дальше следуйте подсказкам на странице
              </p>
            </div>
          </div>

          {/* Footer Metadata */}
          <div className="w-full border-t border-slate-200 pt-4 text-sm text-slate-600">
            <span>{branchName || 'Отделение почтовой связи'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
