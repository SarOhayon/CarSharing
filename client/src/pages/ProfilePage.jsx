import { useState } from 'react';
import { api } from '../api.js';
import { Avatar, ColorPicker, useToast } from '../components/ui.jsx';
import { PALETTE } from '../util.js';

export default function ProfilePage({ me, setMe, refresh }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: me.name, email: me.email, phone: me.phone, color: me.color, emailOptIn: me.emailOptIn, password: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e?.target ? e.target.value : e });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...form };
      if (!body.password) delete body.password;
      const u = await api.patch('/api/me', body);
      setMe(u);
      setForm({ ...form, password: '' });
      refresh();
      toast('Saved ✨');
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card pad stack narrow" onSubmit={save}>
      <div className="who">
        <Avatar user={{ ...me, color: form.color, name: form.name || me.name }} size={64} />
        <div>
          <h2>Your profile</h2>
          <p className="muted">
            {me.isAdmin && 'Admin · '}
            {me.canApprove && 'Can approve requests'}
          </p>
        </div>
      </div>
      <label>
        Name
        <input value={form.name} onChange={set('name')} required />
      </label>
      <label>
        Your calendar color
        <ColorPicker value={form.color} onChange={set('color')} palette={PALETTE} />
      </label>
      <div className="row">
        <label>
          Email
          <input type="email" value={form.email} onChange={set('email')} required />
        </label>
        <label>
          Mobile number <span className="hint">optional</span>
          <input type="tel" value={form.phone} onChange={set('phone')} />
        </label>
      </div>
      <label className="switch">
        <input type="checkbox" checked={form.emailOptIn} onChange={(e) => setForm({ ...form, emailOptIn: e.target.checked })} />
        <span className="track" />
        Email me booking confirmations, cancellations and pickup instructions
      </label>
      <label>
        New password <span className="hint">leave blank to keep</span>
        <input type="password" value={form.password} onChange={set('password')} minLength={6} autoComplete="new-password" />
      </label>
      <button className="primary big" disabled={busy}>Save</button>
    </form>
  );
}
