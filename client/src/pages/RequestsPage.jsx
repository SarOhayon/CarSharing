import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Avatar, Empty, Modal, useToast } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { ProofLinks, ProofPicker, requestFormData } from '../components/ProofPicker.jsx';
import { DAY_NAMES, fmtRange, toLocalInput } from '../util.js';

const blankForm = (cars) => ({ carId: cars[0]?.id, start: '', end: '', note: '' });

const statusPill = (x, reapplied) => {
  if (x.status === 'denied') return <span className="pill bad">{reapplied ? 'declined · reapplied' : 'declined'}</span>;
  return <span className={`pill ${x.status === 'approved' ? 'ok' : 'warn'}`}>{x.status}</span>;
};

export default function RequestsPage({ me, users, cars, config, refresh, go }) {
  const toast = useToast();
  const formRef = useRef(null);
  const [data, setData] = useState({ reservations: [], series: [] });
  const [form, setForm] = useState(() => blankForm(cars));
  const [files, setFiles] = useState([]);
  const [reapply, setReapply] = useState(null); // the declined request being reapplied for
  const [declining, setDeclining] = useState(null);
  const [reason, setReason] = useState('');
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
  const mine = items.filter((x) => x.userId === me.id);
  const reappliedIds = new Set(data.reservations.map((r) => r.reapplyOf).filter(Boolean));

  const decide = async (item, approve, note = '') => {
    try {
      await api.post(`/api/requests/${item.kind}/${item.id}/decision`, { approve, reason: note });
      toast(approve ? 'Approved' : 'Declined');
      setDeclining(null);
      load();
      refresh();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  const startReapply = (x) => {
    const future = new Date(x.start) > new Date();
    setReapply(x);
    setFiles([]);
    setForm({
      carId: x.carId,
      start: future ? toLocalInput(x.start) : '',
      end: future ? toLocalInput(x.end) : '',
      note: x.note || '',
    });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const cancelReapply = () => {
    setReapply(null);
    setFiles([]);
    setForm(blankForm(cars));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/reservations', requestFormData({ ...form, files, reapplyOf: reapply?.id }));
      toast(reapply ? 'Reapplied — sent for approval' : 'Request sent');
      cancelReapply();
      load();
      refresh();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (x) => {
    try {
      await api.del(x.kind === 'series' ? `/api/series/${x.id}` : `/api/reservations/${x.id}`);
      load();
      refresh();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  const describe = (x) =>
    x.kind === 'series'
      ? `Repeating “${x.title}” · ${x.daysOfWeek.map((d) => DAY_NAMES[d]).join(', ')} ${x.startTime}–${x.endTime} · ${x.startDate} → ${x.endDate}`
      : fmtRange(x.start, x.end);

  const Details = ({ x }) => (
    <>
      <div className="small">{describe(x)}</div>
      {x.note && <div className="small muted">“{x.note}”</div>}
      <ProofLinks item={x} />
      {x.reapplyOf && <div className="small muted">Reapplied after an earlier request was declined</div>}
      {x.decidedBy && (
        <div className={`small ${x.status === 'denied' ? 'decision-note' : 'muted'}`}>
          {x.status === 'approved' ? 'Approved' : 'Declined'} by {userById[x.decidedBy]?.name || 'someone'}
          {x.decisionNote && <>: “{x.decisionNote}”</>}
        </div>
      )}
    </>
  );

  return (
    <div className="two-col">
      <form className="card pad stack" onSubmit={submit} ref={formRef}>
        <div>
          <div className="eyebrow">{reapply ? 'Reapply' : 'Special request'}</div>
          <h2>{reapply ? 'Try again with proof' : 'Need a car way ahead?'}</h2>
          <p className="muted">
            Regular bookings open {config.bookingWindowDays} days ahead. For anything further out, or anything that needs an OK, send a
            request. It stays pending until {approvers.map((a) => a.name).join(' or ') || 'an approver'} approves it.
          </p>
        </div>

        {reapply && (
          <div className="notice warn">
            <strong>Reapplying for your declined request</strong>
            <div className="small">
              {carById[reapply.carId]?.name} · {fmtRange(reapply.start, reapply.end)}
            </div>
            {reapply.decisionNote && <div className="small">Reason given: “{reapply.decisionNote}”</div>}
            {new Date(reapply.start) <= new Date() && <div className="small">Those dates have passed, so pick new ones.</div>}
            <button type="button" className="link small" onClick={cancelReapply}>Cancel reapplying</button>
          </div>
        )}

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
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Road trip to Grandma's" maxLength={500} />
        </label>
        <ProofPicker files={files} onChange={setFiles} onError={(m) => toast(m, 'bad')} />
        <button className="primary big" disabled={busy}>{busy ? 'Sending…' : reapply ? 'Reapply' : 'Send request'}</button>
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
          {pending.length === 0 && <Empty icon="check" title="All caught up">No requests waiting.</Empty>}
          <div className="list">
            {pending.map((x) => {
              const u = userById[x.userId];
              return (
                <div key={x.id} className="list-item" style={{ '--c': u?.color }}>
                  <Avatar user={u} size={38} />
                  <div className="grow">
                    <strong>{u?.name || 'Someone'}</strong> <span className="muted">· {carById[x.carId]?.name}</span>
                    <Details x={x} />
                  </div>
                  {me.canApprove ? (
                    <div className="actions">
                      <button className="ghost small" onClick={() => { setReason(''); setDeclining(x); }}>Decline</button>
                      <button className="primary small" onClick={() => decide(x, true)}>Approve</button>
                    </div>
                  ) : x.userId === me.id ? (
                    <button className="ghost small" onClick={() => withdraw(x)}>Withdraw</button>
                  ) : (
                    <span className="pill warn">pending</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card pad">
          <h2>Your requests</h2>
          <p className="muted small">Everything you’ve asked for, newest first. Declined requests can be sent again with proof.</p>
          {mine.length === 0 && <Empty icon="inbox" title="No requests yet">Requests you send show up here.</Empty>}
          <div className="list">
            {mine.map((x) => {
              const canReapply = x.kind === 'reservations' && x.status === 'denied' && !reappliedIds.has(x.id);
              return (
                <div key={x.id} className={`list-item ${x.status === 'denied' ? 'denied' : ''}`} style={{ '--c': me.color }}>
                  <div className="grow">
                    <strong>{carById[x.carId]?.name || 'Car removed'}</strong>{' '}
                    <span className="muted small">· asked {new Date(x.createdAt).toLocaleDateString()}</span>
                    <Details x={x} />
                  </div>
                  <div className="stack-tight">
                    {statusPill(x, reappliedIds.has(x.id))}
                    {canReapply && (
                      <button className="primary small" onClick={() => startReapply(x)}>
                        <Icon name="paperclip" size={13} /> Reapply with proof
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {me.canApprove && decided.length > 0 && (
          <div className="card pad">
            <h3>Recent decisions</h3>
            <div className="list">
              {decided.map((x) => {
                const u = userById[x.userId];
                return (
                  <div key={x.id} className="list-item" style={{ '--c': u?.color }}>
                    <Avatar user={u} size={38} />
                    <div className="grow">
                      <strong>{u?.name || 'Someone'}</strong> <span className="muted">· {carById[x.carId]?.name}</span>
                      <Details x={x} />
                    </div>
                    {statusPill(x, reappliedIds.has(x.id))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {declining && (
        <Modal
          title={`Decline ${userById[declining.userId]?.name || 'this'}’s request?`}
          onClose={() => setDeclining(null)}
          footer={
            <>
              <button className="ghost" onClick={() => setDeclining(null)}>Cancel</button>
              <button className="danger" onClick={() => decide(declining, false, reason)}>Decline</button>
            </>
          }
        >
          <p className="muted small">
            {carById[declining.carId]?.name} · {describe(declining)}
          </p>
          <label>
            Reason <span className="hint">optional — they’ll see it and can reapply with proof</span>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Please attach your flight confirmation" autoFocus />
          </label>
        </Modal>
      )}
    </div>
  );
}
