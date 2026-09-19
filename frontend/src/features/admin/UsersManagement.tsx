import React, { useEffect, useState, useMemo } from 'react';
import { changeUserRole, getMe, listUsers, User } from '../../api/authApi';
import { Users, RefreshCw, CheckCircle2, Shield, Search, X, Filter } from 'lucide-react';

const roles: Record<string, string> = {
  client: 'Клиент',
  employee: 'Оператор',
  opc_chief: 'Начальник ОПС',
  terminal: 'Терминал',
};

type RoleFilter = 'ALL' | 'opc_chief' | 'employee' | 'client' | 'terminal';

export function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [chief, setChief] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');

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

  // Фильтрация пользователей по поисковому запросу и выбранной роли
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter(user => {
      // Фильтр по роли/терминалу
      if (roleFilter === 'terminal') {
        if (!user.isTerminal) return false;
      } else if (roleFilter !== 'ALL') {
        if (user.role !== roleFilter) return false;
      }

      // Поиск по строке
      if (!q) return true;
      const emailMatch = user.email.toLowerCase().includes(q);
      const roleRuMatch = (roles[user.role] || user.role).toLowerCase().includes(q);
      const roleCodeMatch = user.role.toLowerCase().includes(q);
      const terminalMatch = user.isTerminal && 'терминал'.includes(q);

      return emailMatch || roleRuMatch || roleCodeMatch || terminalMatch;
    });
  }, [users, searchQuery, roleFilter]);

  // Подсчет количества пользователей по группам
  const counts = useMemo(() => {
    return {
      all: users.length,
      opc_chief: users.filter(u => u.role === 'opc_chief').length,
      employee: users.filter(u => u.role === 'employee').length,
      client: users.filter(u => u.role === 'client').length,
      terminal: users.filter(u => u.isTerminal).length,
    };
  }, [users]);

  if (!chief) return null;

  return (
    <section className="bg-white rounded-3xl border border-[#D2D8E2] p-5 sm:p-6 shadow-sm space-y-4">
      {/* Шапка раздела */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <Users className="w-5 h-5 text-[#003B73]" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-slate-900 tracking-tight">
                Управление доступом сотрудников (IAM)
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-50 text-[#003B73] border border-blue-100">
                {users.length} всего
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Поиск, фильтрация и назначение ролей операторов и начальников отделений
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadUsers}
          disabled={pending}
          className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#003B73] ${pending ? 'animate-spin' : ''}`} />
          <span>Обновить список</span>
        </button>
      </div>

      {/* Панель поиска и фильтрации */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Поле поиска */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Поиск по email, роли (клиент, оператор) или терминалу..."
              className="w-full pl-9.5 pr-9 py-2 rounded-xl border border-slate-300 text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#003B73] focus:border-transparent bg-slate-50/50 hover:bg-white transition-colors"
              aria-label="Поиск по пользователям"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                title="Очистить поиск"
                aria-label="Очистить поиск"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Индикатор результатов */}
          {searchQuery && (
            <span className="text-xs font-medium text-slate-500 self-center px-1">
              Найдено: <strong className="text-slate-900 font-mono">{filteredUsers.length}</strong> из{' '}
              <span className="font-mono">{users.length}</span>
            </span>
          )}
        </div>

        {/* Быстрые фильтры по ролям */}
        <div className="flex flex-wrap items-center gap-1.5 select-none pt-0.5">
          <button
            type="button"
            onClick={() => setRoleFilter('ALL')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              roleFilter === 'ALL'
                ? 'bg-[#003B73] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Все</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${roleFilter === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRoleFilter('employee')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              roleFilter === 'employee'
                ? 'bg-[#003B73] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Операторы</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${roleFilter === 'employee' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {counts.employee}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRoleFilter('opc_chief')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              roleFilter === 'opc_chief'
                ? 'bg-[#D92534] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Начальники ОПС</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${roleFilter === 'opc_chief' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {counts.opc_chief}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRoleFilter('client')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              roleFilter === 'client'
                ? 'bg-[#003B73] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Клиенты</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${roleFilter === 'client' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {counts.client}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRoleFilter('terminal')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              roleFilter === 'terminal'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Терминалы</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${roleFilter === 'terminal' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {counts.terminal}
            </span>
          </button>
        </div>
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
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Search className="w-8 h-8 text-slate-300" />
                    <p className="text-xs font-bold text-slate-700">
                      Пользователи не найдены
                    </p>
                    <p className="text-[11px] text-slate-400 max-w-sm">
                      {searchQuery
                        ? `По запросу «${searchQuery}» совпадений не обнаружено`
                        : 'В выбранной категории нет пользователей'}
                    </p>
                    {(searchQuery || roleFilter !== 'ALL') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setRoleFilter('ALL');
                        }}
                        className="mt-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                      >
                        Сбросить фильтры
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredUsers.map(user => (
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
