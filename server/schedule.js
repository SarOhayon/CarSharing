// Pure scheduling helpers: expanding recurring series and detecting overlaps.

import { addDaysYmd, weekdayOf, ymdAt, zonedTime } from './tz.js';

const DAY = 24 * 60 * 60 * 1000;

// Every occurrence of a recurring series that overlaps [from, to). Days and
// times are in the family's time zone, so "8:00" stays 8:00 across daylight saving.
export function expandSeries(series, from, to) {
  const out = [];
  const firstDay = ymdAt(new Date(from.getTime() - DAY)); // catch overnight events from the day before
  for (let date = firstDay > series.startDate ? firstDay : series.startDate; date <= series.endDate; date = addDaysYmd(date, 1)) {
    if (zonedTime(date) >= to) break;
    if (!series.daysOfWeek.includes(weekdayOf(date))) continue;
    if (series.skipDates?.includes(date)) continue;
    const start = zonedTime(date, series.startTime);
    let end = zonedTime(date, series.endTime);
    if (end <= start) end = zonedTime(addDaysYmd(date, 1), series.endTime); // overnight
    if (end > from && start < to) {
      out.push({
        id: `${series.id}:${date}`,
        seriesId: series.id,
        date,
        carId: series.carId,
        userId: series.userId,
        title: series.title,
        note: series.note || '',
        status: series.status,
        start: start.toISOString(),
        end: end.toISOString(),
        recurring: true,
      });
    }
  }
  return out;
}

const active = (x) => x.status === 'approved' || x.status === 'pending';
const overlaps = (aStart, aEnd, bStart, bEnd) => new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);

// All bookings (one-off + recurring occurrences) on a car in a time range.
export function eventsFor(data, carId, from, to) {
  const singles = data.reservations
    .filter((r) => (!carId || r.carId === carId) && overlaps(r.start, r.end, from, to))
    .map((r) => ({ ...r, recurring: false }));
  const occurrences = data.series
    .filter((s) => !carId || s.carId === carId)
    .flatMap((s) => expandSeries(s, from, to));
  return [...singles, ...occurrences];
}

// First active booking on the car that collides with [start, end), if any.
export function findConflict(data, carId, start, end, { ignoreReservation, ignoreSeries } = {}) {
  return eventsFor(data, carId, new Date(start), new Date(end)).find(
    (e) =>
      active(e) &&
      (!ignoreReservation || e.id !== ignoreReservation) &&
      (!ignoreSeries || e.seriesId !== ignoreSeries) &&
      overlaps(e.start, e.end, start, end),
  );
}

// Checks every occurrence of a proposed series against existing bookings.
export function findSeriesConflict(data, series) {
  const from = zonedTime(series.startDate);
  const to = zonedTime(addDaysYmd(series.endDate, 2));
  for (const occ of expandSeries(series, from, to)) {
    const hit = findConflict(data, series.carId, occ.start, occ.end, { ignoreSeries: series.id });
    if (hit) return { occurrence: occ, conflict: hit };
  }
  return null;
}

// End of the last day anyone can book without approval (today + 14 days).
export function bookingWindowEnd(now = new Date()) {
  const days = Number(process.env.BOOKING_WINDOW_DAYS || 14);
  return new Date(zonedTime(addDaysYmd(ymdAt(now), days + 1)).getTime() - 1);
}
