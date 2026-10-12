import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import WeekCalendar from '../components/WeekCalendar.jsx';
import CarPlayground from '../components/CarPlayground.jsx';
import CarArt from '../components/CarArt.jsx';
import { Avatar, Modal, useToast } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { addDays, fmtDay, fmtDuration, fmtRange, startOfWeek } from '../util.js';

const toLocalInput = (d) => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
};

export default function CarCalendarPage({ me, users, cars, config, refresh }) {
  const toast = useToast();
  const [carId, setCarId] = useState(() => localStorage.getItem('carId') || cars[0]?.id);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [events, setEvents] = useState([]);
  const [mine, setMine] = useState([]);
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  const car = cars.find((c) => c.id === carId) || cars[0];
  const windowEnd = useMemo(() => new Date(config.windowEnd), [config.windowEnd]);
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const approvers = users.filter((u) => u.canApprove).map((u) => u.name);

  useEffect(() => {
    if (car) localStorage.setItem('carId', car.id);
  }, [car?.id]);

  const load = useCallback(async () => {
    if (!car) return;
    const from = weekStart.toISOString();
    const to = addDays(weekStart, 7).toISOString();
    const now = new Date();
    const [week, upcoming] = await Promise.all([
      api.get(`/api/events?carId=${car.id}&from=${from}&to=${to}`),
      api.get(`/api/events?from=${now.toISOString()}&to=${addDays(now, 21).toISOString()}`),
    ]);
    setEvents(week);
    setMine(upcoming.filter((e) => e.userId === me.id).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6));
  }, [car?.id, weekStart, me.id]);

  useEffect(() => {
    load().catch((e) => toast(e.message, 'bad'));
  }, [load]);

  const book = async (asRequest) => {
    setBusy(true);
    try {
      const r = await api.post('/api/reservations', {
        carId: car.id,
        start: new Date(draft.start).toISOString(),
        end: new Date(draft.end).toISOString(),
        note: draft.note,
        request: asRequest,
      });
      toast(r.status === 'pending' ? 'Request sent for approval' : `Booked the ${car.name}`);
      setDraft(null);
      load();
      refresh();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (ev) => {
    try {
      if (ev.recurring) await api.del(`/api/series/${ev.seriesId}`);
      else await api.del(`/api/reservations/${ev.id}`);
      toast(ev.recurring ? 'Repeating event removed' : 'Reservation cancelled');
      setSelected(null);
      load();
      refresh();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  const skip = async (ev) => {
    try {
      await api.post(`/api/series/${ev.seriesId}/skip`, { date: ev.date });
      toast(`Skipped ${fmtDay(ev.start)}`);
      setSelected(null);
      load();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  if (!car) return <div className="card pad">No cars yet — an admin can add one in the Admin tab.</div>;

  const draftBeyond = draft && new Date(draft.end) > windowEnd;
  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const thisWeek = startOfWeek(new Date()).getTime() === weekStart.getTime();
  const canEdit = (ev) => ev.userId === me.id || me.isAdmin;

  return (
    <div className="calendar-page">
      <div className="car-tabs">
        {cars.map((c) => (
          <button key={c.id} className={`car-tab ${c.id === car.id ? 'active' : ''}`} onClick={() => setCarId(c.id)}>
            <div className="car-thumb">
              {c.photo ? <img src={c.photo} alt="" /> : <CarArt style={c.style} paint={c.paint} interior={c.interior} />}
            </div>
            <div className="car-tab-text">
              <strong>{c.name}</strong>
              <span>{c.plate || [c.color, c.year].filter(Boolean).join(' · ') || ' '}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="calendar-layout">
        <section className="card calendar-card">
          <div className="cal-toolbar">
            <div className="week-nav">
              <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week"><Icon name="chevronLeft" /></button>
              <button className={`chip ${thisWeek ? 'on' : ''}`} onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
              <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week"><Icon name="chevronRight" /></button>
              <h2>{weekLabel}</h2>
            </div>
            <div className="legend">
              {users.map((u) => (
                <span key={u.id} className="legend-item">
                  <i style={{ background: u.color }} />
                  {u.name}
                </span>
              ))}
            </div>
          </div>
          <div className="cal-hint">
            <span>
              <span className="mouse-only">Press and drag over</span>
              <span className="touch-only">Tap, or press-and-hold then drag over</span> the time you need on the <b>{car.name}</b>.
            </span>
            <span className="muted">
              Up to {config.bookingWindowDays} days ahead · further out becomes a <a href="#/requests">special request</a>
            </span>
          </div>
          <WeekCalendar
            weekStart={weekStart}
            events={events}
            users={users}
            me={me}
            windowEnd={windowEnd}
            onSelect={({ start, end }) => setDraft({ start: toLocalInput(start), end: toLocalInput(end), note: '' })}
            onEventClick={setSelected}
          />
        </section>

        <aside className="side">
          <CarPlayground car={car} />
          <div className="card upcoming">
            <h3>Your next drives</h3>
            {mine.length === 0 && <p className="muted">Nothing booked in the next 3 weeks.</p>}
            {mine.map((e) => {
              const c = cars.find((x) => x.id === e.carId);
              return (
                <button
                  key={e.id}
                  className="upcoming-item"
                  onClick={() => {
                    setCarId(e.carId);
                    setWeekStart(startOfWeek(new Date(e.start)));
                  }}
                >
                  <span className="dot" style={{ background: me.color }} />
                  <span>
                    <strong>{e.recurring && <Icon name="repeat" size={13} className="inline-icon" />}{e.recurring ? e.title : c?.name}</strong>
                    <small>{e.recurring ? `${c?.name} · ` : ''}{fmtRange(e.start, e.end)}</small>
                  </span>
                  {e.status === 'pending' && <span className="pill warn">pending</span>}
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      {draft && (
        <Modal
          title={draftBeyond && !me.canApprove ? 'Special request' : `Reserve the ${car.name}`}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button className="ghost" onClick={() => setDraft(null)}>Cancel</button>
              {draftBeyond && !me.canApprove ? (
                <button className="primary" disabled={busy} onClick={() => book(true)}>Send request</button>
              ) : (
                <button className="primary" disabled={busy} onClick={() => book(false)}>Reserve it</button>
              )}
            </>
          }
        >
          <div className="draft-summary" style={{ '--c': me.color }}>
            <Avatar user={me} size={40} />
            <div>
              <strong>{fmtRange(draft.start, draft.end)}</strong>
              <span className="muted">{fmtDuration(draft.start, draft.end)} · {car.name}</span>
            </div>
          </div>
          <div className="row">
            <label>
              From
              <input type="datetime-local" step="1800" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
            </label>
            <label>
              Until
              <input type="datetime-local" step="1800" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
            </label>
          </div>
          <label>
            Note <span className="hint">optional</span>
            <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Where are you headed?" maxLength={300} />
          </label>
          {draftBeyond && !me.canApprove && (
            <div className="notice warn">
              This is more than {config.bookingWindowDays} days away, so it goes to {approvers.join(' or ') || 'an approver'} for approval.
              It will show on the calendar as <b>pending</b> until then.
            </div>
          )}
          {me.email && me.emailOptIn && <p className="muted small with-icon"><Icon name="mail" size={14} /> We’ll email {me.email} a confirmation and pickup instructions.</p>}
        </Modal>
      )}

      {selected && (
        <Modal
          title={selected.recurring ? `Repeating: ${selected.title}` : 'Reservation'}
          onClose={() => setSelected(null)}
          footer={
            canEdit(selected) ? (
              <>
                {selected.recurring && <button className="ghost" onClick={() => skip(selected)}>Skip just this day</button>}
                <button className="danger" onClick={() => cancel(selected)}>
                  {selected.recurring ? 'Delete whole series' : 'Cancel reservation'}
                </button>
              </>
            ) : (
              <button className="ghost" onClick={() => setSelected(null)}>Close</button>
            )
          }
        >
          <div className="draft-summary" style={{ '--c': userById[selected.userId]?.color }}>
            <Avatar user={userById[selected.userId]} size={40} />
            <div>
              <strong>{userById[selected.userId]?.name || 'Someone'} · {cars.find((c) => c.id === selected.carId)?.name}</strong>
              <span className="muted">{fmtRange(selected.start, selected.end)}</span>
            </div>
          </div>
          {selected.status === 'pending' && <div className="notice warn">Waiting for approval.</div>}
          {selected.note && <p>“{selected.note}”</p>}
          {selected.recurring && <p className="muted small">Part of a repeating event. Manage it in the Repeating tab.</p>}
        </Modal>
      )}
    </div>
  );
}
