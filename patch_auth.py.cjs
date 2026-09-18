const fs = require('fs');

const file = 'frontend/src/PochtaDemo.tsx';
let d = fs.readFileSync(file, 'utf8');

/* ---- 1. authMode по умолчанию = 'register' (только регистрация в демо) ---- */
const oldAuthMode = "const [authMode, setAuthMode] = useState<'login'|'register'>('login');";
if (!d.includes(oldAuthMode)) throw new Error('anchor authMode line not found');
d = d.replace(oldAuthMode, "const [authMode, setAuthMode] = useState<'login'|'register'>('register');");

/* ---- 2. роутинг activeTab по ролям ---- */
// Заменяем блок: currentPath → activeTab (L442–454), добавляем роль-роутинг.
const oldRouting = `  // Навигационные вкладки
  let activeTab = 'hub';
  if (currentPath === '/demo/client') {
    // В зависимости от того, есть ли у клиента талон, показываем разные экраны
    activeTab = 'client-booking'; // по умолчанию, ниже мы переопределим если нужно
  } else if (currentPath === '/demo/operator') {
    activeTab = 'operator';
  } else if (currentPath === '/demo/admin') {
    activeTab = 'admin';
  } else if (currentPath === '/demo/tv') {
    activeTab = 'tv';
  } else if (currentPath === '/demo/terminal') {
    activeTab = 'kiosk';
  }`;
const newRouting = `  // Роутинг: путь → вкладка, но ФОРСИРОВАННО по роли текущего пользователя.
  //  - client   → /demo/client  (мои талоны + терминал выдачи)
  //  - employee → /demo/operator (рабочее место оператора)
  //  - opc_chief / admin → /demo/admin (админка)
  //  - terminal → /demo/terminal (терминал киоска)
  let activeTab: string;
  if (!currentUser) {
    // Неавторизованный пользователь: всегда на страницу регистрации/входа.
    // (modalAuthForcer внизу открывает модалку регистрации автоматически.)
    activeTab = '/demo' === currentPath || currentPath === '/demo/client' || currentPath === '/demo' ? 'hub' : 'hub';
  } else if (currentUser.role === 'client') {
    if (currentPath === '/demo/admin') activeTab = 'admin';
    else activeTab = 'client-booking';
  } else if (currentUser.role === 'employee') {
    activeTab = currentPath === '/demo/admin' ? 'admin' : 'operator';
  } else if (currentUser.role === 'opc_chief' || currentUser.role === 'terminal') {
    activeTab = 'admin';
  } else {
    // fallback по пути
    activeTab = 'hub';
    if (currentPath === '/demo/client') activeTab = 'client-booking';
    else if (currentPath === '/demo/operator') activeTab = 'operator';
    else if (currentPath === '/demo/admin') activeTab = 'admin';
    else if (currentPath === '/demo/tv') activeTab = 'tv';
    else if (currentPath === '/demo/terminal') activeTab = 'kiosk';
  }`;
if (!d.includes(oldRouting)) throw new Error('anchor routing block not found');
d = d.replace(oldRouting, newRouting);

/* ---- 3. Автоматически открывать модалку на регистрацию для неавторизованного ---- */
// Вставим новый useEffect сразу после блока getMe (L571–577).
const oldGetMeBlock = `  useEffect(() => {
    getMe().then(user => {
      setCurrentUser(user);
    }).catch(() => {
      setCurrentUser(null);
    });
  }, []);`;
if (!d.includes(oldGetMeBlock)) throw new Error('anchor getMe useEffect not found');
const newGetMeBlock = `  // При монтировании пробуем восстановить сессию. Если юзер не вошёл —
  // принудительно открываем модалку регистрации (в демо все новые юзеры регистрируются).
  const [hasCheckedSession, setHasCheckedSession] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getMe().then(user => {
      if (!cancelled) {
        setCurrentUser(user);
        setHasCheckedSession(true);
        if (!user) {
          // Неавторизован → показываем регистрацию.
          setAuthMode('register');
          setIsAuthModalOpen(true);
        }
      }
    }).catch(() => {
      if (!cancelled) {
        setCurrentUser(null);
        setHasCheckedSession(true);
        setAuthMode('register');
        setIsAuthModalOpen(true);
      }
    });
    return () => { cancelled = true; };
  }, []);`;
d = d.replace(oldGetMeBlock, newGetMeBlock);

/* ---- 4. setAuthMode('login') в хедере заменить на setAuthMode('register') ---- */
d = d.replace("onClick={() => { setAuthMode('login'); setIsAuthModalOpen(true); }}", "onClick={() => { setAuthMode('register'); setIsAuthModalOpen(true); }}");

fs.writeFileSync(file, d, 'utf8');
console.log('patched auth/routing in PochtaDemo.tsx');
