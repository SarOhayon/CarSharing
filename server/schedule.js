// Pure scheduling helpers: expanding recurring series and detecting overlaps.

const DAY = 24 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function atLocal(dateStr, time) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

// Every occurrence of a recurring series that overlaps [from, to).
export function expandSeries(series, from, to) {
  const out = [];
  const first = atLocal(series.startDate, '00:00');
  const last = atLocal(series.endDate, '23:59');
  const begin = new Date(Math.max(first.getTime(), from.getTime() - DAY));
  begin.setHours(0, 0, 0, 0);
  for (let day = begin; day <= last && day < to; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    if (!series.daysOfWeek.includes(day.getDay())) continue;
    const date = ymd(day);
    if (series.skipDates?.includes(date)) continue;
    const start = atLocal(date, series.startTime);
    let end = atLocal(date, series.endTime);
    if (end <= start) end = new Date(end.getTime() + DAY); // overnight
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
  const from = atLocal(series.startDate, '00:00');
  const to = new Date(atLocal(series.endDate, '23:59').getTime() + DAY);
  for (const occ of expandSeries(series, from, to)) {
    const hit = findConflict(data, series.carId, occ.start, occ.end, { ignoreSeries: series.id });
    if (hit) return { occurrence: occ, conflict: hit };
  }
  return null;
}

export function bookingWindowEnd(now = new Date()) {
  const days = Number(process.env.BOOKING_WINDOW_DAYS || 14);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() + days);
  return end;
}
