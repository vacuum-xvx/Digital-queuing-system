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
  Sparkles,
} from 'lucide-react';

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
      width: 360,
      margin: 2,
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
                Быстрое взятие талона клиентом
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Разместите этот QR-код на входе или на информационных стойках отделения. При сканировании камерой любого смартфона клиент{' '}
                <strong className="text-slate-900">сразу попадает в окно взятия талона данного отделения</strong>, где выбирает нужную услугу и получает электронный талон без необходимости стоять в очереди к терминалу самообслуживания.
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

      {/* Printable Poster/Stand (window.print) */}
      <div
        id="print-ticket-slip"
        className="hidden print:block print:w-[380px] print:mx-auto print:p-8 print:text-center print:font-sans text-black"
      >
        <div className="text-xl font-black border-b-2 border-black pb-2 mb-3 tracking-wider">
          ПОЧТА РОССИИ
        </div>
        <div className="text-sm font-bold text-slate-900 mb-1">
          {branchName || 'Отделение почтовой связи'}
        </div>
        <div className="text-xs uppercase tracking-widest text-slate-600 mb-3">
          Электронная очередь
        </div>
        <div className="text-2xl font-black my-2 tracking-tight text-black">
          ВЗЯТЬ ТАЛОН СО СМАРТФОНА
        </div>

        {qrImage && (
          <div className="my-5">
            <img
              src={qrImage}
              className="mx-auto w-56 h-56 border-2 border-black p-2 rounded-lg"
              alt="QR-код для взятия талона"
            />
          </div>
        )}

        <div className="text-xs text-slate-700 font-semibold leading-snug mb-4">
          Наведите камеру смартфона на QR-код, чтобы выбрать услугу и получить электронный талон без ожидания у терминала
        </div>
        <div className="text-[10px] text-slate-500 font-mono border-t border-slate-300 pt-3">
          {branchName ? `${branchName} • ` : ''}ID: {branchId}
        </div>
      </div>
    </div>
  );
}
