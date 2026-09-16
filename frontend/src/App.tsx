import { useEffect, useState, MouseEvent } from 'react';
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

  const pages: Record<string, React.ReactNode> = {
    '/': <ClientPage />,
    '/operator': <OperatorPage />,
    '/admin': <AdminPage />,
  };

  return (
    <main>
      <h1>Electronic Queue MVP</h1>
      <p role="status">Backend: {health}</p>
      <nav aria-label="Applications">
        <a href="/" onClick={(e) => navigate('/', e)}>Client</a>
        {' | '}
        <a href="/operator" onClick={(e) => navigate('/operator', e)}>Operator</a>
        {' | '}
        <a href="/admin" onClick={(e) => navigate('/admin', e)}>Admin</a>
      </nav>
      {pages[currentPath] ?? <h2>Page not found</h2>}
    </main>
  );
}
