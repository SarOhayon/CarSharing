import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Avatar, Empty, useToast } from '../components/ui.jsx';
import { DAY_NAMES, fmtRange } from '../util.js';

export default function RequestsPage({ me, users, cars, config, refresh, go }) {
  const toast = useToast();
  const [data, setData] = useState({ reservations: [], series: [] });
  const [form, setForm] = useState({ carId: cars[0]?.id, start: '', end: '', note: '' });
  const [busy, setBusy] = useState(false);
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const carById = useMemo(() => Object.fromEntries(cars.map((c) => [c.id, c])), [cars]);
  const approvers = users.filter((u) => u.canApprove);

  const load = () => api.get('/api/requests').then(setData).catch((e) => toast(e.message, 'bad'));
  useEffect(() => {
    load();
  }, []);

  const items = [
    ...data.reservations.map((r) => ({ ...r, kind: 'reservations' })),
    ...data.series.filter((s) => s.status !== 'approved' || s.decidedBy).map((s) => ({ ...s, kind: 'series' })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = items.filter((x) => x.status === 'pending');
  const decided = items.filter((x) => x.status !== 'pending').slice(0, 20);

  const decide = async (item, approve) => {
    try {
      await api.post(`/api/requests/${item.kind}/${item.id}/decision`, { approve });
      toast(approve ? 'Approved ✅' : 'Declined');
      load();
      refresh();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/reservations', {
        carId: form.carId,
        start: new Date(form.start).toISOString(),
        end: new Date(form.end).toISOString(),
        note: form.note,
        request: true,
      });
      toast('Request sent 🙋');
      setForm({ ...form, start: '', end: '', note: '' });
      load();
      refresh();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const describe = (x) =>
    x.kind === 'series'
      ? `↻ ${x.title} · ${x.daysOfWeek.map((d) => DAY_NAMES[d]).join(', ')} ${x.startTime}–${x.endTime} · ${x.startDate} → ${x.endDate}`
      : fmtRange(x.start, x.end);

  const Row = ({ x, actions }) => {
    const u = userById[x.userId];
    return (
      <div className="list-item" style={{ '--c': u?.color }}>
        <Avatar user={u} size={38} />
        <div className="grow">
          <strong>{u?.name || 'Someone'}</strong> <span className="muted">· {carById[x.carId]?.name}</span>
          <div className="small">{describe(x)}</div>
          {x.note && <div className="small muted">“{x.note}”</div>}
          {x.decidedBy && (
            <div className="small muted">
              {x.status === 'approved' ? 'Approved' : 'Declined'} by {userById[x.decidedBy]?.name || 'someone'}
            </div>
          )}
        </div>
        {actions || <span className={`pill ${x.status === 'approved' ? 'ok' : x.status === 'denied' ? 'bad' : 'warn'}`}>{x.status === 'denied' ? 'declined' : x.status}</span>}
      </div>
    );
  };

  return (
    <div className="two-col">
      <form className="card pad stack" onSubmit={submit}>
        <div>
          <div className="eyebrow">Special request</div>
          <h2>Need a car way ahead? 🗓️</h2>
          <p className="muted">
            Regular bookings open {config.bookingWindowDays} days ahead. For anything further out, send a request —{' '}
            {approvers.map((a) => a.name).join(' or ') || 'an approver'} will approve it.
          </p>
        </div>
        <label>
          Car
          <select value={form.carId} onChange={(e) => setForm({ ...form, carId: e.target.value })}>
            {cars.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <div className="row">
          <label>
            From
            <input type="datetime-local" step="1800" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} required />
          </label>
          <label>
            Until
            <input type="datetime-local" step="1800" value={form.end} min={form.start} onChange={(e) => setForm({ ...form, end: e.target.value })} required />
          </label>
        </div>
        <label>
          Why / where? <span className="hint">helps it get approved</span>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Road trip to Grandma's" maxLength={300} />
        </label>
        <button className="primary big" disabled={busy}>Send request</button>
        <p className="small muted">
          Tip: you can also just drag on the <a href="#/calendar" onClick={() => go('calendar')}>calendar</a> past the 2-week line.
        </p>
      </form>

      <section className="stack">
        <div className="card pad">
          <h2>
            Waiting for approval {pending.length > 0 && <span className="badge">{pending.length}</span>}
          </h2>
          {!me.canApprove && <p className="muted small">Only {approvers.map((a) => a.name).join(', ') || 'approvers'} can approve these.</p>}
          {pending.length === 0 && <Empty icon="🎉" title="All caught up">No requests waiting.</Empty>}
          <div className="list">
            {pending.map((x) => (
              <Row
                key={x.id}
                x={x}
                actions={
                  me.canApprove ? (
                    <div className="actions">
                      <button className="ghost small" onClick={() => decide(x, false)}>Decline</button>
                      <button className="primary small" onClick={() => decide(x, true)}>Approve</button>
                    </div>
                  ) : x.userId === me.id ? (
                    <button
                      className="ghost small"
                      onClick={async () => {
                        await api.del(x.kind === 'series' ? `/api/series/${x.id}` : `/api/reservations/${x.id}`);
                        load();
                        refresh();
                      }}
                    >
                      Withdraw
                    </button>
                  ) : (
                    <span className="pill warn">pending</span>
                  )
                }
              />
            ))}
          </div>
        </div>

        {decided.length > 0 && (
          <div className="card pad">
            <h3>Recent decisions</h3>
            <div className="list">
              {decided.map((x) => (
                <Row key={x.id} x={x} />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
