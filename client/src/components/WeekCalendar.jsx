import { useEffect, useMemo, useRef, useState } from 'react';
import { DAY_MS, SLOT_MIN, SLOTS_PER_DAY, addDays, fmtTime, onColor, slotLabel, startOfDay } from '../util.js';

const SLOT_H = 22;

// when2meet-style grid: press on a free slot, drag to the end of the time you
// need (across days too), let go to book.
export default function WeekCalendar({ weekStart, events, users, me, windowEnd, onSelect, onEventClick }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const scroller = useRef(null);
  const [drag, setDrag] = useState(null); // { a, b } slot indexes in the week
  const [now, setNow] = useState(new Date());
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Start scrolled to 7am.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * 2 * SLOT_H - 8;
  }, []);

  // Built from the calendar day so daylight-saving weeks still line up.
  const slotTime = (idx) => {
    const day = days[Math.min(Math.floor(idx / SLOTS_PER_DAY), 6)];
    const extraDays = Math.floor(idx / SLOTS_PER_DAY) - 6;
    const base = extraDays > 0 ? addDays(day, extraDays) : day;
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, (idx % SLOTS_PER_DAY) * SLOT_MIN);
  };
  const busy = useMemo(() => {
    const set = new Set();
    const spans = events.map((ev) => [new Date(ev.start), new Date(ev.end)]);
    for (let i = 0; i < SLOTS_PER_DAY * 7; i++) {
      const a = slotTime(i);
      const b = slotTime(i + 1);
      if (spans.some(([s, e]) => s < b && a < e)) set.add(i);
    }
    return set;
  }, [events, days]);

  const isPast = (idx) => slotTime(idx + 1) <= now;
  const isBeyond = (idx) => slotTime(idx) >= windowEnd;

  const slotFromPoint = (x, y) => {
    const node = document.elementFromPoint(x, y)?.closest('[data-slot]');
    return node ? Number(node.dataset.slot) : null;
  };

  const range = drag ? [Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)] : null;
  const rangeHitsBusy = range ? Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i).some((i) => busy.has(i)) : false;

  // Mouse: press and drag. Touch: tap for a 30-min slot, or press-and-hold
  // then drag (a quick swipe still scrolls the calendar).
  const press = useRef(null);
  const cols = useRef(null);
  const dragging = useRef(false);
  dragging.current = !!drag;

  useEffect(() => {
    const node = cols.current;
    const block = (e) => dragging.current && e.preventDefault();
    node?.addEventListener('touchmove', block, { passive: false });
    return () => node?.removeEventListener('touchmove', block);
  }, []);

  const canStart = (idx) => idx !== null && !isPast(idx) && !busy.has(idx);

  const onDown = (e) => {
    const idx = slotFromPoint(e.clientX, e.clientY);
    if (!canStart(idx)) return;
    if (e.pointerType === 'touch') {
      const p = { x: e.clientX, y: e.clientY, idx, active: false };
      p.timer = setTimeout(() => {
        p.active = true;
        navigator.vibrate?.(12);
        setDrag({ a: idx, b: idx });
      }, 280);
      press.current = p;
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ a: idx, b: idx });
  };
  const onMove = (e) => {
    const p = press.current;
    if (p && !p.active && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) {
      clearTimeout(p.timer);
      press.current = null;
    }
    if (!drag) return;
    const idx = slotFromPoint(e.clientX, e.clientY);
    if (idx !== null && idx !== drag.b && !isPast(idx)) setDrag({ ...drag, b: idx });
    // Auto-scroll when dragging near the edges.
    const box = scroller.current.getBoundingClientRect();
    if (e.clientY < box.top + 30) scroller.current.scrollTop -= 12;
    else if (e.clientY > box.bottom - 30) scroller.current.scrollTop += 12;
  };
  const onUp = () => {
    const p = press.current;
    press.current = null;
    if (p && !p.active) {
      clearTimeout(p.timer);
      onSelect({ start: slotTime(p.idx), end: slotTime(p.idx + 1) });
      return;
    }
    if (!drag) return;
    const [a, b] = range;
    setDrag(null);
    if (rangeHitsBusy) return;
    onSelect({ start: slotTime(a), end: slotTime(b + 1) });
  };
  const onCancel = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
    setDrag(null);
  };

  // Split events into per-day blocks for rendering.
  const blocks = useMemo(() => {
    const out = [];
    for (const ev of events) {
      const s = new Date(ev.start);
      const e = new Date(ev.end);
      days.forEach((day, di) => {
        const dayEnd = new Date(day.getTime() + DAY_MS);
        if (e <= day || s >= dayEnd) return;
        const from = s > day ? s : day;
        const to = e < dayEnd ? e : dayEnd;
        out.push({
          ev,
          di,
          top: ((from - day) / 60_000 / SLOT_MIN) * SLOT_H,
          height: Math.max(((to - from) / 60_000 / SLOT_MIN) * SLOT_H, SLOT_H * 0.8),
          continues: e > dayEnd,
          continued: s < day,
        });
      });
    }
    return out;
  }, [events, days]);

  const nowOffset = (now - startOfDay(now)) / 60_000 / SLOT_MIN;
  const todayIdx = days.findIndex((d) => d.getTime() === startOfDay(now).getTime());
  const meColor = me.color;

  return (
    <div className="week">
      <div className="week-head">
        <div className="gutter" />
        {days.map((d, i) => {
          const isToday = i === todayIdx;
          const beyond = d >= windowEnd;
          return (
            <div key={i} className={`day-head ${isToday ? 'today' : ''} ${beyond ? 'beyond' : ''}`}>
              <span className="dow">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              <span className="dom">{d.getDate()}</span>
            </div>
          );
        })}
      </div>

      <div className="week-body" ref={scroller}>
        <div className="week-grid" style={{ '--slot-h': `${SLOT_H}px`, '--me': meColor }}>
          <div className="gutter">
            {Array.from({ length: SLOTS_PER_DAY }, (_, i) => (
              <div key={i} className="time-label">{slotLabel(i)}</div>
            ))}
          </div>

          <div className="cols" ref={cols} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}>
            {days.map((day, di) => (
              <div key={di} className={`col ${di === todayIdx ? 'today' : ''}`}>
                {Array.from({ length: SLOTS_PER_DAY }, (_, si) => {
                  const idx = di * SLOTS_PER_DAY + si;
                  const selected = range && idx >= range[0] && idx <= range[1];
                  const cls = [
                    'slot',
                    si % 2 ? 'half' : 'hour',
                    isPast(idx) ? 'past' : '',
                    isBeyond(idx) ? 'beyond' : '',
                    selected ? (rangeHitsBusy ? 'sel bad' : 'sel') : '',
                  ].join(' ');
                  return <div key={si} data-slot={idx} className={cls} />;
                })}

                {blocks
                  .filter((b) => b.di === di)
                  .map((b) => {
                    const u = userById[b.ev.userId];
                    const color = u?.color || '#94a3b8';
                    return (
                      <button
                        key={`${b.ev.id}-${di}`}
                        className={`event ${b.ev.status} ${b.ev.recurring ? 'recurring' : ''} ${b.ev.userId === me.id ? 'mine' : ''} ${b.continues ? 'continues' : ''} ${b.continued ? 'continued' : ''}`}
                        style={{ top: b.top, height: b.height, '--c': color, '--on': onColor(color) }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => onEventClick(b.ev)}
                      >
                        <span className="ev-name">
                          {b.ev.recurring && '↻ '}
                          {b.ev.recurring ? b.ev.title : u?.name || 'Someone'}
                          {b.ev.status === 'pending' && ' · pending'}
                        </span>
                        {b.height > SLOT_H * 1.5 && (
                          <span className="ev-time">
                            {b.continued ? '…' : fmtTime(b.ev.start)} – {b.continues ? '…' : fmtTime(b.ev.end)}
                            {b.ev.recurring && u ? ` · ${u.name}` : ''}
                          </span>
                        )}
                      </button>
                    );
                  })}

                {di === todayIdx && <div className="now-line" style={{ top: nowOffset * SLOT_H }} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {range && (
        <div className="drag-tip">
          {fmtTime(slotTime(range[0]))} – {fmtTime(slotTime(range[1] + 1))}
          {rangeHitsBusy ? ' · overlaps a booking' : slotTime(range[1] + 1) > windowEnd ? ' · needs approval' : ''}
        </div>
      )}
    </div>
  );
}
