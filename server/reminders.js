import { db, withDb, claimOnce, releaseClaim, pruneClaims } from './db.js';
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

// Sends whatever reminder emails are due. Runs every minute on a normal
// server, or whenever /api/cron/reminders is pinged (Vercel). Each email is
// claimed before sending, so overlapping runs never send the same one twice.
export async function runReminders(now = new Date()) {
  const data = db();
  const offs = offsets();
  let sent = 0;

  if (offs.length) {
    const horizon = new Date(now.getTime() + offs[offs.length - 1] * 60_000);
    for (const ev of eventsFor(data, null, now, horizon)) {
      if (ev.status !== 'approved') continue;
      const start = new Date(ev.start);
      if (start <= now) continue;
      const user = data.users.find((u) => u.id === ev.userId);
      const car = data.cars.find((c) => c.id === ev.carId);
      if (!user || !car || !user.email || user.emailOptIn === false) continue;

      // Pickup-instruction emails. Only the tightest reminder that is due gets
      // sent; earlier ones that were missed (e.g. the server was down) are skipped.
      const minutesLeft = (start - now) / 60_000;
      const due = offs.find((o) => minutesLeft <= o);
      if (due === undefined) continue;
      if (await sendOnce(`${ev.id}@${ev.start}@${due}`, () => notify.pickupReminder(user, car, ev, minutesLeft))) sent++;
    }
  }

  sent += await runHandoffs(data, now);
  await pruneClaims(now);
  return sent;
}

async function sendOnce(key, send) {
  if (!(await claimOnce(key))) return false;
  const res = await send();
  if (!res.ok) await releaseClaim(key); // try again next run
  return res.ok;
}

// Emails whoever has a car that someone else booked right after them, so
// they know to bring it back on time.
async function runHandoffs(data, now) {
  if (HANDOFF_MINUTES <= 0) return 0;
  let sent = 0;
  const soon = new Date(now.getTime() + HANDOFF_MINUTES * 60_000);
  const ending = eventsFor(data, null, now, soon).filter(
    (ev) => ev.status === 'approved' && new Date(ev.end) > now && new Date(ev.end) <= soon,
  );

  for (const ev of ending) {
    const end = new Date(ev.end);
    const next = eventsFor(data, ev.carId, end, new Date(end.getTime() + HANDOFF_GAP_MINUTES * 60_000))
      .filter((n) => n.status === 'approved' && n.userId !== ev.userId && new Date(n.start) >= end)
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    if (!next) continue;

    const user = data.users.find((u) => u.id === ev.userId);
    const nextUser = data.users.find((u) => u.id === next.userId);
    const car = data.cars.find((c) => c.id === ev.carId);
    if (!user || !nextUser || !car || !user.email || user.emailOptIn === false) continue;

    const minutesLeft = (end - now) / 60_000;
    if (await sendOnce(`handoff:${ev.id}@${ev.end}`, () => notify.handoffReminder(user, car, ev, next, nextUser, minutesLeft))) sent++;
  }
  return sent;
}

export function startReminderLoop() {
  const tick = () => withDb(() => runReminders()).catch((err) => console.error('[reminders]', err));
  tick();
  return setInterval(tick, 60_000);
}
