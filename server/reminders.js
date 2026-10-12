import { db, save } from './db.js';
import { eventsFor } from './schedule.js';
import { notify } from './notify.js';

// Hand-off emails go out this long before a booking ends...
const HANDOFF_MINUTES = Number(process.env.HANDOFF_REMINDER_MINUTES || 30);
// ...when someone else's booking on the same car starts within this long after it.
const HANDOFF_GAP_MINUTES = Number(process.env.HANDOFF_GAP_MINUTES || 60);

const offsets = () =>
  (process.env.REMINDER_OFFSETS_MINUTES || '1440,60')
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

export async function runReminders(now = new Date()) {
  const data = db();
  const offs = offsets();
  if (!offs.length) return;
  const horizon = new Date(now.getTime() + offs[offs.length - 1] * 60_000);
  let changed = false;

  for (const ev of eventsFor(data, null, now, horizon)) {
    if (ev.status !== 'approved') continue;
    const start = new Date(ev.start);
    if (start <= now) continue;
    const user = data.users.find((u) => u.id === ev.userId);
    const car = data.cars.find((c) => c.id === ev.carId);
    if (!user || !car || !user.email || user.emailOptIn === false) continue;

    // Pickup-instruction emails. Only the tightest reminder that is due gets sent; any earlier, larger
    // reminders that were missed (e.g. server was down) are skipped.
    const minutesLeft = (start - now) / 60_000;
    const due = offs.find((o) => minutesLeft <= o);
    if (due === undefined) continue;
    const key = `${ev.id}@${ev.start}@${due}`;
    if (data.sentReminders[key]) continue;

    const res = await notify.pickupReminder(user, car, ev, minutesLeft);
    if (res.ok) {
      for (const o of offs) if (o >= due) data.sentReminders[`${ev.id}@${ev.start}@${o}`] = now.toISOString();
      changed = true;
    }
  }

  if (await runHandoffs(data, now)) changed = true;

  // Forget reminders older than 30 days.
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  for (const [k, v] of Object.entries(data.sentReminders)) {
    if (new Date(v).getTime() < cutoff) {
      delete data.sentReminders[k];
      changed = true;
    }
  }
  if (changed) save();
}

// Emails whoever has a car that someone else booked right after them, so
// they know to bring it back on time.
async function runHandoffs(data, now) {
  if (HANDOFF_MINUTES <= 0) return false;
  let changed = false;
  const soon = new Date(now.getTime() + HANDOFF_MINUTES * 60_000);
  const ending = eventsFor(data, null, now, soon).filter(
    (ev) => ev.status === 'approved' && new Date(ev.end) > now && new Date(ev.end) <= soon,
  );

  for (const ev of ending) {
    const key = `handoff:${ev.id}@${ev.end}`;
    if (data.sentReminders[key]) continue;
    const end = new Date(ev.end);
    const next = eventsFor(data, ev.carId, end, new Date(end.getTime() + HANDOFF_GAP_MINUTES * 60_000))
      .filter((n) => n.status === 'approved' && n.userId !== ev.userId && new Date(n.start) >= end)
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    if (!next) continue;

    const user = data.users.find((u) => u.id === ev.userId);
    const nextUser = data.users.find((u) => u.id === next.userId);
    const car = data.cars.find((c) => c.id === ev.carId);
    if (!user || !nextUser || !car || !user.email || user.emailOptIn === false) continue;

    const res = await notify.handoffReminder(user, car, ev, next, nextUser, (end - now) / 60_000);
    if (res.ok) {
      data.sentReminders[key] = now.toISOString();
      changed = true;
    }
  }
  return changed;
}

export function startReminderLoop() {
  const tick = () => runReminders().catch((err) => console.error('[reminders]', err));
  tick();
  return setInterval(tick, 60_000);
}
