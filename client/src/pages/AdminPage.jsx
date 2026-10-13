import { useEffect, useState } from 'react';
import { api } from '../api.js';
import CarPhoto from '../components/CarPhoto.jsx';
import { Avatar, ColorPicker, Modal, useToast } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { PALETTE, prepareUpload } from '../util.js';

const blankCar = { name: '', make: '', model: '', year: '', color: '', interior: '', plate: '', notes: '', pickupInstructions: '' };

export default function AdminPage({ me, users, cars, refresh }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null); // car object or 'new'
  const [email, setEmail] = useState(null);
  const [newMember, setNewMember] = useState({ name: '', color: PALETTE[6] });

  useEffect(() => {
    api.get('/api/admin/email').then(setEmail).catch(() => {});
  }, []);

  const run = async (fn, ok) => {
    try {
      await fn();
      if (ok) toast(ok);
      await refresh();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  const updateUser = (u, patch, ok) => run(() => api.patch(`/api/admin/users/${u.id}`, patch), ok);

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Behind the scenes</div>
        <h1 className="page-title">Admin dashboard</h1>
      </div>

      <div className="stats">
        <div className="stat card"><span>{cars.length}</span>cars</div>
        <div className="stat card"><span>{users.length}</span>family members</div>
        <div className="stat card"><span>{users.filter((u) => u.canApprove).length}</span>can approve</div>
        <div className={`stat card ${email?.configured ? '' : 'warn'}`}>
          <span>{email?.configured ? 'On' : 'Off'}</span>email notifications
        </div>
      </div>

      <section className="card pad">
        <div className="section-head">
          <h2>Garage</h2>
          <button className="primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> Add car</button>
        </div>
        <div className="admin-cars">
          {cars.map((c) => (
            <div key={c.id} className="admin-car">
              <div className="car-thumb big"><CarPhoto car={c} /></div>
              <div className="grow">
                <strong>{c.name}</strong>
                <div className="small muted">{[c.year, c.make, c.model].filter(Boolean).join(' ')} · {c.color}{c.interior ? ` / ${c.interior} interior` : ''}</div>
                <div className="small">
                  <span className="plate">{c.plate || 'NO PLATE'}</span>{' '}
                  <span className={`pill ${c.insurance.length ? 'ok' : 'warn'}`}>{c.insurance.length ? `${c.insurance.length} insurance doc${c.insurance.length > 1 ? 's' : ''}` : 'no insurance proof'}</span>
                </div>
              </div>
              <button className="ghost small" onClick={() => setEditing(c)}>Edit</button>
            </div>
          ))}
        </div>
      </section>

      <section className="card pad">
        <div className="section-head">
          <h2>Family members</h2>
        </div>
        <p className="muted small">
          “Can approve” decides who gets to OK special requests and repeating events. Approvers get an email when a new request comes in.
          Only you can open this dashboard.
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Contact</th>
                <th>Can approve</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="member">
                      <label className="avatar-color" title="Change color">
                        <Avatar user={u} size={34} />
                        <input type="color" value={u.color} onChange={(e) => updateUser(u, { color: e.target.value })} />
                      </label>
                      <div>
                        <strong>{u.name}</strong>
                        {u.isAdmin && <div className="pill">owner</div>}
                        {!u.claimed && <div className="pill warn">not set up yet</div>}
                      </div>
                    </div>
                  </td>
                  <td className="small">
                    {u.email || <span className="muted">no email</span>}
                    <br />
                    {u.phone || <span className="muted">no phone</span>}
                  </td>
                  <td>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={u.canApprove}
                        onChange={(e) => updateUser(u, { canApprove: e.target.checked }, e.target.checked ? `${u.name} can now approve requests` : null)}
                      />
                      <span className="track" />
                    </label>
                  </td>
                  <td className="right nowrap">
                    {u.claimed && u.id !== me.id && (
                      <button
                        className="ghost small"
                        onClick={() => confirm(`Reset ${u.name}'s password? They'll set it up again from the login screen.`) && updateUser(u, { resetPassword: true }, 'Password reset')}
                      >
                        Reset password
                      </button>
                    )}
                    {u.id !== me.id && (
                      <button
                        className="icon-btn"
                        title="Remove"
                        aria-label={`Remove ${u.name}`}
                        onClick={() =>
                          confirm(`Remove ${u.name} and all their reservations?`) && run(() => api.del(`/api/admin/users/${u.id}`), `${u.name} removed`)
                        }
                      >
                        <Icon name="trash" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form
          className="add-member"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api.post('/api/admin/users', newMember), `${newMember.name} added — they can set up their profile from the login page`).then(() =>
              setNewMember({ name: '', color: PALETTE[(PALETTE.indexOf(newMember.color) + 1) % PALETTE.length] }),
            );
          }}
        >
          <input value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} placeholder="New member's name" required />
          <ColorPicker value={newMember.color} onChange={(color) => setNewMember({ ...newMember, color })} palette={PALETTE.slice(0, 8)} />
          <button className="primary">Add member</button>
        </form>
      </section>

      <section className="card pad">
        <h2>Email notifications</h2>
        {email?.configured ? (
          <p className="muted">
            Resend is connected. Members get booking confirmations, cancellation notices, and pickup instructions 24 hours and 1 hour before
            each reservation.
          </p>
        ) : (
          <div className="notice warn">
            Emails are switched off. Add <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> to the server’s <code>.env</code> file to turn them
            on. Until then, messages are only printed in the server log.
          </div>
        )}
        <button className="ghost" onClick={() => run(() => api.post('/api/admin/email/test'), `Test email sent to ${me.email}`)}>
          Send me a test email
        </button>
      </section>

      {editing && <CarEditor car={editing === 'new' ? null : editing} onClose={() => setEditing(null)} refresh={refresh} toast={toast} />}
    </div>
  );
}

function CarEditor({ car, onClose, refresh, toast }) {
  const [form, setForm] = useState(car ? { ...blankCar, ...car, year: car.year || '' } : blankCar);
  const [photo, setPhoto] = useState(null);
  const [doc, setDoc] = useState({ file: null, name: '', expires: '' });
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(car);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      for (const k of Object.keys(blankCar)) fd.append(k, form[k] ?? '');
      if (photo) fd.append('photo', await prepareUpload(photo));
      const saved = car
        ? await api.patch(`/api/admin/cars/${car.id}`, fd)
        : await api.post('/api/admin/cars', fd);
      setCurrent(saved);
      await refresh();
      toast(car ? 'Car updated' : `${saved.name} added to the garage`);
      if (!car) onClose();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const uploadDoc = async () => {
    if (!doc.file) return toast('Choose a file first', 'bad');
    const fd = new FormData();
    fd.append('file', await prepareUpload(doc.file));
    fd.append('name', doc.name || doc.file.name);
    fd.append('expires', doc.expires);
    try {
      setCurrent(await api.post(`/api/admin/cars/${current.id}/insurance`, fd));
      setDoc({ file: null, name: '', expires: '' });
      await refresh();
      toast('Insurance proof uploaded — everyone can see it now');
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const removeDoc = async (d) => {
    try {
      setCurrent(await api.del(`/api/admin/cars/${current.id}/insurance/${d.id}`));
      await refresh();
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const removeCar = async () => {
    if (!confirm(`Delete the ${car.name}? This also removes all of its reservations.`)) return;
    try {
      await api.del(`/api/admin/cars/${car.id}`);
      await refresh();
      toast('Car removed');
      onClose();
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const preview = photo ? URL.createObjectURL(photo) : current?.photo;

  return (
    <Modal title={car ? `Edit ${car.name}` : 'Add a car'} onClose={onClose} wide>
      <form className="stack" onSubmit={save}>
        <div className="car-editor">
          <div className="car-preview">
            <CarPhoto car={{ name: form.name, photo: preview }} />
            <label className="ghost small file-btn">
              {preview ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0] || null)} />
            </label>
          </div>
          <div className="stack grow">
            <label>
              Nickname
              <input value={form.name} onChange={set('name')} placeholder="e.g. The G-Wagon" required />
            </label>
            <div className="row">
              <label>Make<input value={form.make} onChange={set('make')} /></label>
              <label>Model<input value={form.model} onChange={set('model')} /></label>
              <label>Year<input type="number" min="1950" max="2100" value={form.year} onChange={set('year')} /></label>
            </div>
            <div className="row">
              <label>License plate<input value={form.plate} onChange={set('plate')} className="mono" placeholder="ABC 1234" /></label>
              <label>Color<input value={form.color} onChange={set('color')} placeholder="Grey" /></label>
              <label>Interior<input value={form.interior} onChange={set('interior')} placeholder="Red" /></label>
            </div>
          </div>
        </div>
        <label>
          Pickup instructions <span className="hint">included in confirmation and reminder emails</span>
          <textarea
            rows={3}
            value={form.pickupInstructions}
            onChange={set('pickupInstructions')}
            maxLength={1000}
            placeholder="Parked in the garage, left side. Key card is in the kitchen drawer. Plug it back in when you return."
          />
        </label>
        <label>Notes<input value={form.notes} onChange={set('notes')} placeholder="Charging cable is in the frunk" /></label>
        <div className="actions">
          {car && <button type="button" className="danger" onClick={removeCar}>Delete car</button>}
          <span className="grow" />
          <button type="button" className="ghost" onClick={onClose}>Close</button>
          <button className="primary" disabled={busy}>{car ? 'Save changes' : 'Add car'}</button>
        </div>
      </form>

      {current && (
        <div className="stack insurance-upload">
          <h3>Insurance proof</h3>
          <p className="muted small">Uploaded files are visible to the whole family on the Insurance tab.</p>
          {current.insurance.map((d) => (
            <div key={d.id} className="doc">
              <span className="doc-icon"><Icon name={d.mime === 'application/pdf' ? 'file' : 'image'} size={20} /></span>
              <a className="grow" href={d.url} target="_blank" rel="noreferrer">
                {d.name}
                {d.expires && <small className="muted"> · expires {d.expires}</small>}
              </a>
              <button className="icon-btn" onClick={() => removeDoc(d)} title="Delete" aria-label="Delete"><Icon name="trash" /></button>
            </div>
          ))}
          <div className="row end">
            <label className="file-input">
              File (PDF or photo)
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setDoc({ ...doc, file: e.target.files[0] || null })} />
            </label>
            <label>Label<input value={doc.name} onChange={(e) => setDoc({ ...doc, name: e.target.value })} placeholder="2026 insurance card" /></label>
            <label>Expires<input type="date" value={doc.expires} onChange={(e) => setDoc({ ...doc, expires: e.target.value })} /></label>
            <button type="button" className="primary" onClick={uploadDoc}>Upload</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

