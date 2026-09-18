import React, { useEffect, useState } from 'react';
import { changeUserRole, getMe, listUsers, User } from '../../api/authApi';
import { Users, RefreshCw, CheckCircle2, Shield } from 'lucide-react';

const roles: Record<string, string> = {
  client: 'Клиент',
  employee: 'Оператор',
  opc_chief: 'Начальник ОПС',
  terminal: 'Терминал',
};

export function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [chief, setChief] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadUsers = async () => {
    try {
      setError('');
      const items = await listUsers();
      setUsers(items);
    } catch {
      setError('Не удалось загрузить пользователей');
    }
  };

  useEffect(() => {
    let active = true;
    getMe()
      .then(async user => {
        if (!active || user?.role !== 'opc_chief') return;
        setChief(true);
        const items = await listUsers();
        if (active) setUsers(items);
      })
      .catch(() => {
        if (active) setError('Не удалось загрузить пользователей');
      });
    return () => {
      active = false;
    };
  }, []);

  if (!chief) return null;

  return (
    <section className="bg-white rounded-3xl border border-[#D2D8E2] p-5 sm:p-6 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <Users className="w-5 h-5 text-[#003B73]" />
          <div>
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              Управление доступом сотрудников (IAM)
            </h2>
            <p className="text-xs text-slate-500">
              Назначение ролей операторов и начальников отделений
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadUsers}
          disabled={pending}
          className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#003B73]" />
          <span>Обновить список</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
          {error}
        </div>
      )}

      {notice && (
        <div role="status" className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
          {notice}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[11px] rounded-t-xl">
            <tr>
              <th className="p-3">Email</th>
              <th className="p-3">Текущая роль</th>
              <th className="p-3 text-center">Терминал?</th>
              <th className="p-3 text-right">Назначить роль</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-3 font-semibold text-slate-900">{user.email}</td>
                <td className="p-3">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      user.role === 'opc_chief'
                        ? 'bg-[#D92534]/10 text-[#D92534] border border-[#D92534]/20'
                        : user.role === 'employee'
                        ? 'bg-[#003B73]/10 text-[#003B73] border border-[#003B73]/20'
                        : 'bg-slate-200 text-slate-600 border border-slate-300'
                    }`}
                  >
                    {roles[user.role] || user.role}
                  </span>
                </td>
                <td className="p-3 text-center">
                  {user.isTerminal ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  <form
                    onSubmit={async event => {
                      event.preventDefault();
                      const role = String(new FormData(event.currentTarget).get('role'));
                      setPending(true);
                      setError('');
                      setNotice('');
                      try {
                        await changeUserRole(user.id, role);
                        setNotice(`Роль пользователя ${user.email} обновлена`);
                        await loadUsers();
                      } catch {
                        setError('Не удалось изменить роль. Проверьте сессию и права доступа.');
                      } finally {
                        setPending(false);
                      }
                    }}
                    className="inline-flex items-center gap-2"
                  >
                    <select
                      name="role"
                      defaultValue={user.role}
                      disabled={pending || user.email === 'admin@pochta.local'}
                      className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs"
                    >
                      {Object.entries(roles).map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={pending || user.email === 'admin@pochta.local'}
                      className="px-3 py-1 bg-[#003B73] hover:bg-[#054FA6] text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
                    >
                      Сохранить роль
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
