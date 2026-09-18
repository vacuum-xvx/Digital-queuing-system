import React, { useEffect, useState } from 'react';
import { listBranches } from '../api/client/clientApi';
import { ClientWorkspace } from '../features/client/ClientWorkspace';
import { AlertCircle, MapPin, ArrowLeft } from 'lucide-react';

export function PhysicalQRPage({ branchId }: { branchId: string }) {
  const [state, setState] = useState<'loading' | 'valid' | 'invalid' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    setState('loading');
    listBranches()
      .then((items) => {
        if (active) setState(items.some((b) => b.id === branchId) ? 'valid' : 'invalid');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [branchId]);

  if (state === 'loading') {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center space-y-3 font-mono text-xs text-slate-500">
        <div className="w-8 h-8 rounded-full border-2 border-[#003B73] border-t-transparent animate-spin mx-auto" />
        <p role="status">Проверяем отделение…</p>
      </div>
    );
  }

  if (state !== 'valid') {
    return (
      <div className="max-w-md mx-auto my-12 px-4">
        <section className="bg-white rounded-3xl border border-[#D2D8E2] p-8 text-center shadow-sm space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-50 text-[#D92534] flex items-center justify-center mx-auto border border-red-100 shadow-inner">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            {state === 'invalid' ? 'Отделение не найдено' : 'Не удалось проверить отделение'}
          </h1>
          <p className="text-xs text-slate-600">
            QR-код содержит недействительный идентификатор или отделение временно недоступно. Талон не создан.
          </p>
          <div className="pt-2">
            <a
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#003B73] hover:bg-[#054FA6] text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Выбрать отделение</span>
            </a>
          </div>
        </section>
      </div>
    );
  }

  return <ClientWorkspace key={branchId} qrBranchId={branchId} />;
}
