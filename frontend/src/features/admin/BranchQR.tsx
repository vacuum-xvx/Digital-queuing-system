import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, QrCode as QrIcon, ExternalLink } from 'lucide-react';

export function BranchQR({ branchId }: { branchId: string }) {
  const [image, setImage] = useState('');
  const base = import.meta.env.PUBLIC_APP_BASE_URL || window.location.origin;
  const url = `${base.replace(/\/$/, '')}/q/${encodeURIComponent(branchId)}`;

  useEffect(() => {
    let active = true;
    setImage('');
    QRCode.toDataURL(url, { width: 256, margin: 2, color: { dark: '#003B73', light: '#FFFFFF' } })
      .then(src => { if (active) setImage(src); })
      .catch(() => {});
    return () => { active = false; };
  }, [url]);

  return (
    <section className="bg-white rounded-3xl border border-[#D2D8E2] p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
        <QrIcon className="w-5 h-5 text-[#003B73]" />
        <h2 className="text-base font-black text-slate-900 tracking-tight">QR-код отделения</h2>
      </div>

      <p className="text-xs text-slate-600">
        Откройте ссылку или отсканируйте код для регистрации в очереди. Талон выдаётся после выбора услуги и подтверждения.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
        {image ? (
          <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm">
            <img
              src={image}
              width="220"
              height="220"
              alt="QR-код для получения талона в этом отделении"
              className="rounded-xl block"
            />
          </div>
        ) : (
          <div className="w-[220px] h-[220px] bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center text-xs text-slate-400 font-mono animate-pulse">
            Генерация QR-кода…
          </div>
        )}

        <div className="space-y-3 text-xs flex-1">
          <div className="space-y-1">
            <span className="font-bold text-slate-500 font-mono text-[11px] uppercase">Прямая ссылка для клиента:</span>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono break-all text-blue-700 select-all">
              <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1.5">
                <span>{url}</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
            </div>
          </div>

          {image && (
            <a
              href={image}
              download={`branch-${branchId}.png`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#003B73] hover:bg-[#054FA6] text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Скачать QR-код для печати</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
