// Every email the app sends, in one place. All sends are best-effort: a
// failure is logged by sendEmail and never breaks the request that caused it.
import { db } from './db.js';
import { renderEmail, sendEmail } from './email.js';
import { fmt, fmtTime } from './tz.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];


const wantsEmail = (user) => Boolean(user?.email) && user.emailOptIn !== false;

async function send(user, subject, content, { force = false } = {}) {
  if (!user?.email || (!force && !wantsEmail(user))) return { ok: false, skipped: true };
  return sendEmail({ to: user.email, subject, ...renderEmail(content) });
}

const carRows = (car) => [
  ['Car', car.name],
  ['Plate', car.plate],
];

const pickupRows = (car) => [
  ['Pickup', car.pickupInstructions || 'No pickup instructions yet — check with whoever had it last.'],
  ['Insurance', car.insurance?.length ? 'Proof is on the Insurance tab in the app.' : null],
];

const seriesWhen = (s) => `${s.daysOfWeek.map((d) => DAYS[d]).join(', ')} · ${s.startTime}–${s.endTime}`;

export const notify = {
  bookingConfirmed(user, car, r) {
    return send(user, `Booked: ${car.name} · ${fmt(r.start)}`, {
      heading: `You’ve got the ${car.name}`,
      intro: 'Your reservation is confirmed.',
      rows: [...carRows(car), ['From', fmt(r.start)], ['Until', fmt(r.end)], ['Note', r.note], ...pickupRows(car)],
    });
  },

  requestReceived(user, car, r) {
    return send(user, `Request sent: ${car.name} · ${fmt(r.start)}`, {
      heading: 'Your request is waiting for approval',
      intro: 'This is more than two weeks out, so an approver needs to OK it. We’ll email you when they decide.',
      rows: [...carRows(car), ['From', fmt(r.start)], ['Until', fmt(r.end)], ['Note', r.note]],
    });
  },

  seriesConfirmed(user, car, s) {
    return send(user, `Repeating booking confirmed: ${s.title}`, {
      heading: `“${s.title}” is on the calendar`,
      intro: `The ${car.name} is yours every week for this event.`,
      rows: [...carRows(car), ['When', seriesWhen(s)], ['Period', `${s.startDate} → ${s.endDate}`], ...pickupRows(car)],
    });
  },

  // `kind` is 'reservation' or 'series'. `by` is who cancelled it.
  cancelled(user, car, item, kind, by) {
    const byOther = by && by.id !== user.id;
    const what = kind === 'series' ? `“${item.title}” (${seriesWhen(item)})` : `${fmt(item.start)} – ${fmt(item.end)}`;
    return send(user, `Cancelled: ${car.name} · ${kind === 'series' ? item.title : fmt(item.start)}`, {
      heading: kind === 'series' ? 'Repeating booking removed' : 'Reservation cancelled',
      intro: byOther ? `${by.name} cancelled your booking on the ${car.name}.` : `Your booking on the ${car.name} has been cancelled.`,
      rows: [...carRows(car), ['Booking', what]],
      footer: 'The time is free again for anyone in the family to book.',
    });
  },

  pickupReminder(user, car, ev, minutesLeft) {
    const when = minutesLeft >= 90 ? `in about ${Math.round(minutesLeft / 60)} hours` : `in ${Math.round(minutesLeft)} minutes`;
    return send(user, `Pickup ${when}: ${car.name}`, {
      heading: `Your ${car.name} pickup is ${when}`,
      intro: ev.recurring ? `Reminder for “${ev.title}”. Here’s how to get the car.` : 'Here’s how to get the car.',
      rows: [...carRows(car), ['From', fmt(ev.start)], ['Until', fmt(ev.end)], ...pickupRows(car)],
    });
  },

  handoffReminder(user, car, ev, next, nextUser, minutesLeft) {
    return send(user, `${nextUser.name} has the ${car.name} next, at ${fmtTime(next.start)}`, {
      heading: `Please bring the ${car.name} back by ${fmtTime(ev.end)}`,
      intro: `Your booking ends in ${Math.max(1, Math.round(minutesLeft))} minutes, and ${nextUser.name} has the car right after you.`,
      rows: [
        ...carRows(car),
        ['Your booking ends', fmt(ev.end)],
        [`${nextUser.name}’s booking starts`, fmt(next.start)],
        ['Where to leave it', car.pickupInstructions],
      ],
      footer: 'Running late? Let them know so they can plan around it.',
    });
  },

  decision(user, car, item, kind, approve, approver) {
    const what = kind === 'series' ? `“${item.title}” (${seriesWhen(item)}, ${item.startDate} → ${item.endDate})` : `${fmt(item.start)} – ${fmt(item.end)}`;
    return send(user, `${approve ? 'Approved' : 'Not approved'}: ${car.name}`, {
      heading: approve ? 'Your request was approved' : 'Your request wasn’t approved',
      intro: approve
        ? `${approver.name} approved your request — it’s confirmed.`
        : `${approver.name} declined your request.${kind === 'reservation' ? ' You can reapply with proof from the Requests page.' : ''}`,
      rows: [...carRows(car), ['Booking', what], [approve ? 'Note' : 'Reason', item.decisionNote], ...(approve ? pickupRows(car) : [])],
    });
  },

  approversNewRequest(requester, car, item, kind) {
    const what = kind === 'series' ? `Repeating “${item.title}” · ${seriesWhen(item)} · ${item.startDate} → ${item.endDate}` : `${fmt(item.start)} – ${fmt(item.end)}`;
    const approvers = db().users.filter((u) => u.canApprove && u.id !== requester.id);
    return Promise.all(
      approvers.map((a) =>
        send(a, `${item.reapplyOf ? 'Reapplied' : 'New request'} from ${requester.name}: ${car.name}`, {
          heading: item.reapplyOf ? `${requester.name} reapplied and needs your OK` : `${requester.name} needs your OK`,
          intro: 'Approve or decline it on the Requests page.',
          rows: [
            ...carRows(car),
            ['Booking', what],
            ['Note', item.note],
            ['Proof', item.proof?.length ? `${item.proof.length} file${item.proof.length > 1 ? 's' : ''} attached — open them in the app` : null],
          ],
        }),
      ),
    );
  },

  test(user) {
    return send(
      user,
      'Test email from Ohayon Car Sharing',
      { heading: 'Email is working', intro: 'You’ll get booking confirmations, cancellations and pickup instructions at this address.' },
      { force: true },
    );
  },
};
