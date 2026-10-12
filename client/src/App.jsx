import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { Avatar, ToastProvider } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import RequestsPage from './pages/RequestsPage.jsx';
import RecurringPage from './pages/RecurringPage.jsx';
import InsurancePage from './pages/InsurancePage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';

const TABS = [
  { id: 'calendar', label: 'Calendar', icon: '📅' },
  { id: 'recurring', label: 'Repeating', icon: '🔁' },
  { id: 'requests', label: 'Requests', icon: '🙋' },
  { id: 'insurance', label: 'Insurance', icon: '🛡️' },
  { id: 'admin', label: 'Admin', icon: '⚙️', admin: true },
];

const readRoute = () => window.location.hash.replace('#/', '').replace('#', '') || 'calendar';

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  const [me, setMe] = useState(undefined);
  const [users, setUsers] = useState([]);
  const [cars, setCars] = useState([]);
  const [config, setConfig] = useState(null);
  const [pending, setPending] = useState(0);
  const [route, setRoute] = useState(readRoute());

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refresh = useCallback(async () => {
    const [u, c, cfg, req] = await Promise.all([
      api.get('/api/users'),
      api.get('/api/cars'),
      api.get('/api/config'),
      api.get('/api/requests'),
    ]);
    setUsers(u);
    setCars(c);
    setConfig(cfg);
    setPending([...req.reservations, ...req.series].filter((x) => x.status === 'pending').length);
  }, []);

  useEffect(() => {
    api
      .get('/api/me')
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (me) refresh();
  }, [me?.id, refresh]);

  if (me === undefined) return <div className="splash"><div className="spinner" /></div>;
  if (me === null) return <Login onLogin={setMe} />;
  if (!config) return <div className="splash"><div className="spinner" /></div>;

  const go = (r) => (window.location.hash = `#/${r}`);
  const logout = async () => {
    await api.post('/api/auth/logout');
    setMe(null);
  };
  const ctx = { me, setMe, users, cars, config, refresh, go };
  const tabs = TABS.filter((t) => !t.admin || me.isAdmin);
  const current = route === 'profile' || tabs.some((t) => t.id === route) ? route : 'calendar';

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/calendar">
          <span className="logo">🚗</span>
          <span>Family<b>Car</b>Share</span>
        </a>
        <nav className="tabs">
          {tabs.map((t) => (
            <a key={t.id} href={`#/${t.id}`} className={`tab ${current === t.id ? 'active' : ''}`}>
              <span className="tab-icon">{t.icon}</span>
              <span className="tab-label">{t.label}</span>
              {t.id === 'requests' && pending > 0 && <span className="badge">{pending}</span>}
            </a>
          ))}
        </nav>
        <div className="me">
          <a href="#/profile" className={`me-link ${current === 'profile' ? 'active' : ''}`}>
            <Avatar user={me} size={34} />
            <span className="me-name">{me.name}</span>
          </a>
          <button className="ghost small" onClick={logout}>Log out</button>
        </div>
      </header>

      <main className="page">
        {current === 'calendar' && <CalendarPage {...ctx} />}
        {current === 'recurring' && <RecurringPage {...ctx} />}
        {current === 'requests' && <RequestsPage {...ctx} />}
        {current === 'insurance' && <InsurancePage {...ctx} />}
        {current === 'admin' && <AdminPage {...ctx} />}
        {current === 'profile' && <ProfilePage {...ctx} />}
      </main>
    </div>
  );
}
