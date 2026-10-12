import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Avatar, Empty, useToast } from '../components/ui.jsx';
import { DAY_NAMES, ymd } from '../util.js';

// Handy presets so a school semester takes two taps.
function presets() {
  const now = new Date();
  const y = now.getFullYear();
  const fall = now.getMonth() >= 6 ? y : y - 1;
  return [
    { label: `Fall semester (Sep–Dec ${fall})`, startDate: `${fall}-09-01`, endDate: `${fall}-12-20` },
    { label: `Spring semester (Jan–May ${fall + 1})`, startDate: `${fall + 1}-01-08`, endDate: `${fall + 1}-05-31` },
    { label: `Summer (Jun–Aug ${fall + 1})`, startDate: `${fall + 1}-06-01`, endDate: `${fall + 1}-08-31` },
  ];
}

const time12 = (t) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};

export default function RecurringPage({ me, users, cars, refresh }) {
  const toast = useToast();
  const [series, setSeries] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: 'School',
    carId: cars[0]?.id,
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: '07:30',
    endTime: '15:30',
    startDate: ymd(new Date()),
    endDate: presets()[0].endDate,
    note: '',
  });
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = () => api.get('/api/series').then(setSeries).catch((e) => toast(e.message, 'bad'));
  useEffect(() => {
    load();
  }, []);

  const toggleDay = (d) =>
    setForm({ ...form, daysOfWeek: form.daysOfWeek.includes(d) ? form.daysOfWeek.filter((x) => x !== d) : [...form.daysOfWeek, d] });

  const weeks = Math.max(0, Math.round((new Date(form.endDate) - new Date(form.startDate)) / (7 * 864e5)));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await api.post('/api/series', form);
      toast(s.status === 'pending' ? 'Sent for approval 🙋' : 'Repeating event added to the calendar 🔁');
      load();
      refresh();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s) => {
    if (!confirm(`Remove “${s.title}” and all its days from the calendar?`)) return;
    try {
      await api.del(`/api/series/${s.id}`);
      toast('Removed');
      load();
      refresh();
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const today = ymd(new Date());
  const visible = series.filter((s) => s.status !== 'denied').sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div className="two-col">
      <form className="card pad stack" onSubmit={submit}>
        <div>
          <div className="eyebrow">New repeating event</div>
          <h2>Put it on autopilot 🔁</h2>
          <p className="muted">Great for school, practice or work. It fills in every week until the end date.</p>
        </div>

        <div className="row">
          <label>
            What is it?
            <input value={form.title} onChange={set('title')} placeholder="School" required maxLength={60} />
          </label>
          <label>
            Car
            <select value={form.carId} onChange={set('carId')}>
              {cars.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <span className="label">Every</span>
          <div className="day-toggle">
            {DAY_NAMES.map((d, i) => (
              <button type="button" key={d} className={form.daysOfWeek.includes(i) ? 'on' : ''} onClick={() => toggleDay(i)}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="row">
          <label>
            From
            <input type="time" step="1800" value={form.startTime} onChange={set('startTime')} required />
          </label>
          <label>
            Until
            <input type="time" step="1800" value={form.endTime} onChange={set('endTime')} required />
          </label>
        </div>

        <div>
          <span className="label">Event period</span>
          <div className="chips">
            {presets().map((p) => (
              <button
                type="button"
                key={p.label}
                className={`chip ${form.endDate === p.endDate ? 'on' : ''}`}
                onClick={() => setForm({ ...form, startDate: p.startDate < today ? today : p.startDate, endDate: p.endDate })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <label>
            Starts
            <input type="date" value={form.startDate} onChange={set('startDate')} required />
          </label>
          <label>
            Ends
            <input type="date" value={form.endDate} min={form.startDate} onChange={set('endDate')} required />
          </label>
        </div>

        <label>
          Note <span className="hint">optional</span>
          <input value={form.note} onChange={set('note')} maxLength={300} />
        </label>

        <div className="notice">
          {form.daysOfWeek.length
            ? `${[...form.daysOfWeek].sort().map((d) => DAY_NAMES[d]).join(', ')} · ${time12(form.startTime)}–${time12(form.endTime)} · about ${weeks} week${weeks === 1 ? '' : 's'}`
            : 'Pick at least one day'}
          {!me.canApprove && <div className="small muted">Repeating events go to an approver before they’re confirmed.</div>}
        </div>

        <button className="primary big" disabled={busy}>Add to calendar</button>
      </form>

      <section className="card pad">
        <h2>Repeating events</h2>
        {visible.length === 0 && <Empty icon="🔁" title="Nothing repeating yet">School runs and weekly practices will show up here.</Empty>}
        <div className="list">
          {visible.map((s) => {
            const u = userById[s.userId];
            const car = cars.find((c) => c.id === s.carId);
            const ended = s.endDate < today;
            return (
              <div key={s.id} className={`list-item ${ended ? 'faded' : ''}`} style={{ '--c': u?.color }}>
                <Avatar user={u} size={36} />
                <div className="grow">
                  <strong>{s.title}</strong> <span className="muted">· {car?.name}</span>
                  <div className="small muted">
                    {s.daysOfWeek.map((d) => DAY_NAMES[d]).join(', ')} · {time12(s.startTime)}–{time12(s.endTime)} · {s.startDate} → {s.endDate}
                    {s.skipDates?.length ? ` · ${s.skipDates.length} skipped` : ''}
                  </div>
                </div>
                {s.status === 'pending' && <span className="pill warn">pending</span>}
                {ended && <span className="pill">ended</span>}
                {(s.userId === me.id || me.isAdmin) && (
                  <button className="icon-btn" onClick={() => remove(s)} title="Remove">🗑</button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
