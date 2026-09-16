import { useEffect, useState } from 'react';
import { checkHealth } from './api/health';
import { ClientPage } from './pages/ClientPage';
import { OperatorPage } from './pages/OperatorPage';
import { AdminPage } from './pages/AdminPage';

export function App() {
  const [health, setHealth] = useState<'Checking...' | 'Available' | 'Unavailable'>('Checking...');
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
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (path: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
      setCurrentPath(path);
    }
  };

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
