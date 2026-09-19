import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, QrCode as QrIcon, ExternalLink, RefreshCw } from 'lucide-react';
import { User } from '../../api/authApi';

export function AdminSelfQR({ user }: { user: User | null }) {
  const [image, setImage] = useState('');
  const [token, setToken] = useState('');
  const base = import.meta.env.PUBLIC_APP_BASE_URL || window.location.origin;

  // Build an admin-specific self-link carrying the user id + a freshness token.
  const url = `${base.replace(/\/$/, '')}/admin/link/${encodeURIComponent(user?.id ?? '')}?t=${token}`;

  useEffect(() => {
    setImage('');
    if (!user?.id) return;
    let active = true;
    QRCode.toDataURL(url, { width: 256, margin: 2, color: { dark: '#003B73', light: '#FFFFFF' } })
      .then(src => { if (active) setImage(src); })
      .catch(() => {});
    return () => { active = false; };
  }, [url, user?.id]);

  const generateNew = () => {
    // Produce a fresh token => a brand new link + QR on the next render.
    setToken(Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  };

  useEffect(() => {
    if (!token) generateNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) {
    return null;
  }

  return (
    <section className="bg-white rounded-3xl border border-[#D2D8E2] p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <QrIcon className="w-5 h-5 text-[#003B73]" />
          <h2 className="text-base font-black text-slate-900 tracking-tight">QR-ссылка для админа</h2>
        </div>
        <button
          type="button"
          onClick={generateNew}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors"
          title="Создать новую ссылку и QR-код"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Создать новый</span>
        </button>
      </div>

      <p className="text-xs text-slate-600">
        Персональная ссылка и QR-код для доступа к админ-панели. Сканируйте код или откройте ссылку, чтобы быстро перейти в свою учётную запись.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
        {image ? (
          <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm">
            <img
              src={image}
              width="220"
              height="220"
              alt="QR-код ссылки для админа"
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
            <span className="font-bold text-slate-500 font-mono text-[11px] uppercase">Ссылка на админа:</span>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono break-all text-blue-700 select-all">
              <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1.5">
                <span>{url}</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
            </div>
          </div>

          <div className="space-y-1">
            <span className="font-bold text-slate-500 font-mono text-[11px] uppercase">Аккаунт:</span>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-slate-800 break-all">
              <span>{user.email}</span>
              {user.role && (
                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#054FA6] border border-blue-200">
                  {user.role}
                </span>
              )}
            </div>
          </div>

          {image && (
            <a
              href={image}
              download={`admin-${user.id}-${token}.png`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#003B73] hover:bg-[#054FA6] text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Скачать QR-код</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
