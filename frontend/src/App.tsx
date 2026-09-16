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
  const pages: Record<string, React.ReactNode> = {
    '/': <ClientPage />, '/operator': <OperatorPage />, '/admin': <AdminPage />,
  };
  return (
    <main>
      <h1>Electronic Queue MVP</h1>
      <p role="status">Backend: {health}</p>
      <nav aria-label="Applications">
        <a href="/">Client</a>{' | '}<a href="/operator">Operator</a>{' | '}<a href="/admin">Admin</a>
      </nav>
      {pages[window.location.pathname] ?? <h2>Page not found</h2>}
    </main>
  );
}
