import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Avatar, ColorPicker } from '../components/ui.jsx';
import CarArt from '../components/CarArt.jsx';
import Icon from '../components/Icon.jsx';
import { PALETTE } from '../util.js';

export default function Login({ onLogin }) {
  const [family, setFamily] = useState([]);
  const [who, setWho] = useState(null); // a family member, or 'new'
  const [form, setForm] = useState({ password: '', email: '', phone: '', familyCode: '', name: '', color: PALETTE[4] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/family').then(setFamily).catch(() => setError('Can’t reach the server'));
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target ? e.target.value : e });
  const pick = (m) => {
    setWho(m);
    setError('');
    setForm({ ...form, password: '' });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let user;
      if (who === 'new') user = await api.post('/api/auth/register', form);
      else if (who.claimed) user = await api.post('/api/auth/login', { userId: who.id, password: form.password });
      else user = await api.post('/api/auth/claim', { ...form, userId: who.id });
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setup = who === 'new' || (who && !who.claimed);

  return (
    <div className="login">
      <div className="login-hero">
        <div className="hero-cars">
          <CarArt style="boxy" paint="#6b7075" interior="Red" />
          <CarArt style="sedan" paint="#7c8188" />
        </div>
        <h1>
          Ohayon <b>Car Sharing</b>
        </h1>
        <p>Drag to reserve. Get an email with pickup instructions before it’s your turn. No more “who has the car?”</p>
      </div>

      <div className="login-card card">
        {!who && (
          <>
            <h2>Who’s driving?</h2>
            <p className="muted">Tap your name to log in.</p>
            <div className="family-grid">
              {family.map((m) => (
                <button key={m.id} className="family-pick" onClick={() => pick(m)}>
                  <Avatar user={m} size={64} />
                  <span>{m.name}</span>
                  {!m.claimed && <em>set up</em>}
                </button>
              ))}
              <button className="family-pick add" onClick={() => pick('new')}>
                <span className="avatar plus" style={{ width: 64, height: 64 }}><Icon name="plus" size={26} /></span>
                <span>I’m new</span>
              </button>
            </div>
            {error && <div className="error">{error}</div>}
          </>
        )}

        {who && (
          <form onSubmit={submit} className="stack">
            <button type="button" className="link back" onClick={() => setWho(null)}><Icon name="arrowLeft" size={15} /> Back</button>
            {who !== 'new' ? (
              <div className="who">
                <Avatar user={who} size={56} />
                <div>
                  <h2>Hi {who.name}!</h2>
                  <p className="muted">{who.claimed ? 'Enter your password.' : 'Let’s set up your profile so we can email you booking confirmations and pickup instructions.'}</p>
                </div>
              </div>
            ) : (
              <>
                <h2>Join the family</h2>
                <p className="muted">Add your details so we can email you about your reservations.</p>
                <label>
                  Your name
                  <input value={form.name} onChange={set('name')} placeholder="e.g. Grandma" required autoFocus />
                </label>
                <label>
                  Your color
                  <ColorPicker value={form.color} onChange={set('color')} palette={PALETTE} />
                </label>
              </>
            )}

            {setup && (
              <>
                <label>
                  Email <span className="hint">for booking emails</span>
                  <input type="email" value={form.email} onChange={set('email')} placeholder="you@email.com" required autoComplete="email" />
                </label>
                <label>
                  Mobile number <span className="hint">optional</span>
                  <input type="tel" value={form.phone} onChange={set('phone')} placeholder="(555) 123-4567" autoComplete="tel" />
                </label>
                <label>
                  Family code <span className="hint">ask Sarah</span>
                  <input value={form.familyCode} onChange={set('familyCode')} required />
                </label>
              </>
            )}

            <label>
              {setup ? 'Choose a password' : 'Password'}
              <input
                type="password"
                value={form.password}
                onChange={set('password')}
                required
                minLength={setup ? 6 : undefined}
                autoFocus={who !== 'new'}
                autoComplete={setup ? 'new-password' : 'current-password'}
              />
            </label>

            {error && <div className="error">{error}</div>}
            <button className="primary big" disabled={busy}>
              {busy ? 'One sec…' : setup ? 'Create my profile' : 'Log in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
