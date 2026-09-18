import React, { FormEvent, ReactNode, useEffect, useState } from 'react';
import { getMe, login, logout, User } from '../../api/authApi';
import { PochtaEmblem } from '../../components/common/PochtaBrand';
import { ShieldAlert, UserCheck, Lock } from 'lucide-react';

export function AuthBoundary({ children, area, loginPage }: { children: ReactNode; area: 'operator' | 'admin'; loginPage: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getMe().then(value => { if (active) setUser(value); })
      .catch(() => { if (active) setError('Не удалось проверить сессию. Обновите страницу.'); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setPending(true); setError('');
    try {
      await login(String(fields.get('email')), String(fields.get('password')));
      setUser(await getMe());
    } catch {
      setError('Не удалось войти. Проверьте почту, пароль и соединение с сервером.');
    } finally { setPending(false); }
  }

  async function signOut() {
    setPending(true); setError('');
    try { await logout(); setUser(null); }
    catch { setError('Не удалось выйти. Повторите попытку.'); }
    finally { setPending(false); }
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p role="status" className="font-mono text-xs text-slate-500 font-bold animate-pulse">Проверяем сессию…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[500px] px-4 py-8">
        <section className="bg-white rounded-3xl border border-[#D2D8E2] p-6 sm:p-8 max-w-md w-full shadow-lg space-y-6">
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <PochtaEmblem className="w-12 h-12 drop-shadow-md" bg="#003B73" fg="#FFFFFF" />
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              {area === 'operator' ? 'Вход оператора' : 'Вход администратора'}
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Единая система управления очередью Почты России
            </p>
          </div>

          {error && (
            <div role="alert" className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4 text-xs font-semibold text-slate-700">
            <div>
              <label className="block mb-1.5 font-bold">
                Электронная почта
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  disabled={pending}
                  placeholder="operator@pochta.local"
                  className="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#054FA6] focus:border-transparent transition-all"
                />
              </label>
            </div>

            <div>
              <label className="block mb-1.5 font-bold">
                Пароль
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  disabled={pending}
                  placeholder="••••••••"
                  className="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#054FA6] focus:border-transparent transition-all"
                />
              </label>
            </div>

            <button
              disabled={pending}
              className="w-full min-h-[46px] py-3 bg-[#003B73] hover:bg-[#054FA6] text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors shadow-md disabled:opacity-50 mt-2"
            >
              {pending ? 'Входим…' : 'Войти'}
            </button>
          </form>
        </section>
      </div>
    );
  }

  const allowed = user.role === 'employee' || user.role === 'opc_chief';

  return (
    <div className="space-y-4">
      {/* User Session Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-sm text-xs">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-emerald-600" />
          <span className="font-mono text-slate-800">
            <strong>{user.email}</strong> ·{' '}
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#054FA6] border border-blue-200">
              {user.role === 'opc_chief' ? 'Начальник ОПС' : user.role === 'employee' ? 'Оператор' : 'Клиент'}
            </span>
          </span>
        </div>
        <button
          onClick={signOut}
          disabled={pending}
          className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold transition-colors"
        >
          Выйти
        </button>
      </div>

      {error && <p role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">{error}</p>}

      {!allowed ? (
        <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-sm space-y-3">
          <ShieldAlert className="w-12 h-12 text-[#D92534] mx-auto mb-2" />
          <p role="alert" className="text-sm font-bold text-slate-800">У вашей учётной записи нет доступа к этому рабочему месту.</p>
          <p className="text-xs text-slate-500">Обратитесь к администратору ОПС или войдите под учётной записью сотрудника.</p>
        </div>
      ) : loginPage ? (
        <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-sm space-y-4 max-w-md mx-auto">
          <h2 className="text-lg font-black text-slate-900">Успешная авторизация</h2>
          <p className="text-xs text-slate-600">Сессия активна. Вы можете перейти в рабочую зону.</p>
          <a
            href={`/${area}`}
            className="inline-flex items-center justify-center min-h-[44px] px-6 py-2.5 bg-[#003B73] hover:bg-[#054FA6] text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors shadow-md"
          >
            Открыть рабочее место
          </a>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
