import { MouseEvent, ReactNode, useEffect, useState } from 'react';
import { checkHealth } from './api/health';
import { ClientPage } from './pages/ClientPage';
import { OperatorPage } from './pages/OperatorPage';
import { AdminPage } from './pages/AdminPage';

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

  const routes: Array<{ path: string; label: string; page: ReactNode }> = [
    { path: '/', label: 'Client', page: <ClientPage /> },
    { path: '/operator', label: 'Operator', page: <OperatorPage /> },
    { path: '/admin', label: 'Admin', page: <AdminPage /> },
  ];
  const isKnownPath = routes.some((route) => route.path === currentPath);

  return (
    <main>
      <h1>Electronic Queue MVP</h1>
      <p role="status">Backend: {health}</p>
      <nav aria-label="Applications">
        {routes.map((route, index) => <span key={route.path}>
          {index > 0 && ' | '}
          <a href={route.path} onClick={(event) => navigate(route.path, event)}>{route.label}</a>
        </span>)}
      </nav>
      {isKnownPath ? routes.map((route) => (
        <div key={route.path} hidden={route.path !== currentPath}>
          {route.page}
        </div>
      )) : <h2>Page not found</h2>}
    </main>
  );
}
