import { MouseEvent, ReactNode, useEffect, useState } from 'react';
import { checkHealth } from './api/health';
import { ClientPage } from './pages/ClientPage';
import { OperatorPage } from './pages/OperatorPage';
import { AdminPage } from './pages/AdminPage';
import PochtaDemo from './PochtaDemo';

export function App() {
  const [health, setHealth] = useState<'Checking...' | 'Available' | 'Unavailable'>('Checking...');
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname);

  useEffect(() => {
    const onLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', onLocationChange);
    return () => window.removeEventListener('popstate', onLocationChange);
  }, []);

  const navigate = (to: string, event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (window.location.pathname !== to) {
      window.history.pushState({}, '', to);
      setCurrentPath(to);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    checkHealth(controller.signal)
      .then(() => { if (active) setHealth('Available'); })
      .catch(() => { if (active) setHealth('Unavailable'); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, []);

  const DemoEntry = ({ role }: { role: string }) => <section><h2>{role}</h2><p>Демонстрационный вход без production-аутентификации.</p><a href={role === 'Оператор' ? '/operator' : '/admin'} onClick={(e) => navigate(role === 'Оператор' ? '/operator' : '/admin', e)}>Продолжить в демо-режиме</a></section>;

  if (currentPath === '/demo') {
    return <PochtaDemo />;
  }
  const routes: Array<{ path: string; label: string; page: ReactNode }> = [
    { path: '/', label: 'Client', page: <ClientPage /> },
    { path: '/operator/login', label: 'Operator login', page: <DemoEntry role="Оператор" /> },
    { path: '/operator', label: 'Operator', page: <OperatorPage /> },
    { path: '/admin/login', label: 'Admin login', page: <DemoEntry role="Администратор" /> },
    { path: '/admin', label: 'Admin', page: <AdminPage /> },
    { path: '/demo', label: 'Demo', page: <section><h2>Демо-режим</h2><p>Выберите рабочее место.</p><a href="/operator" onClick={(e) => navigate('/operator', e)}>Оператор</a>{' · '}<a href="/admin" onClick={(e) => navigate('/admin', e)}>Администратор</a></section> },
  ];
  const isKnownPath = routes.some((route) => route.path === currentPath);

  const activeRoute = routes.find((route) => route.path === currentPath);
  if (!isKnownPath || !activeRoute) return <main><h2>Page not found</h2></main>;

  return (
    <main>
      {currentPath === '/' ? activeRoute.page : (
        <>
          <p role="status">Backend: {health}</p>
          {currentPath === '/demo' && <nav aria-label="Applications"><a href="/" onClick={(event) => navigate('/', event)}>Клиент</a>{' · '}<a href="/operator" onClick={(event) => navigate('/operator', event)}>Оператор</a>{' · '}<a href="/admin" onClick={(event) => navigate('/admin', event)}>Администратор</a></nav>}
          {activeRoute.page}
        </>
      )}
    </main>
  );
}
