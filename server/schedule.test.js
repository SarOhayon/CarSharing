import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandSeries, findConflict, findSeriesConflict } from './schedule.js';
import { zonedTime, TIMEZONE } from './tz.js';

// A wall-clock time in the family's zone, e.g. at(2026, 9, 3, 10) = Sep 3 10:00.
const pad = (n) => String(n).padStart(2, '0');
const at = (y, m, d, h = 0) => zonedTime(`${y}-${pad(m)}-${pad(d)}`, `${pad(h)}:00`);

const school = {
  id: 's1', carId: 'car', userId: 'u1', title: 'School', status: 'approved',
  daysOfWeek: [1, 3], startTime: '08:00', endTime: '15:00', startDate: '2026-09-01', endDate: '2026-12-20', skipDates: ['2026-09-07'],
};

test('expands a series only on chosen weekdays within the period', () => {
  const occ = expandSeries(school, at(2026, 9, 1), at(2026, 9, 15));
  assert.deepEqual(occ.map((o) => o.date), ['2026-09-02', '2026-09-09', '2026-09-14']); // 7th skipped
  assert.equal(occ[0].start, at(2026, 9, 2, 8).toISOString());
  assert.equal(expandSeries(school, at(2027, 1, 1), at(2027, 1, 30)).length, 0);
});

test('detects clashes between single bookings and series occurrences', () => {
  const data = {
    reservations: [{ id: 'r1', carId: 'car', userId: 'u2', start: at(2026, 9, 3, 10).toISOString(), end: at(2026, 9, 3, 12).toISOString(), status: 'approved' }],
    series: [school],
  };
  assert.ok(findConflict(data, 'car', at(2026, 9, 3, 11), at(2026, 9, 3, 13)));
  assert.ok(findConflict(data, 'car', at(2026, 9, 2, 14), at(2026, 9, 2, 16)));
  assert.equal(findConflict(data, 'car', at(2026, 9, 3, 12), at(2026, 9, 3, 13)), undefined);
  assert.equal(findConflict(data, 'other', at(2026, 9, 3, 11), at(2026, 9, 3, 13)), undefined);
  assert.equal(findConflict(data, 'car', at(2026, 9, 3, 11), at(2026, 9, 3, 13), { ignoreReservation: 'r1' }), undefined);
  data.reservations[0].status = 'denied';
  assert.equal(findConflict(data, 'car', at(2026, 9, 3, 11), at(2026, 9, 3, 13)), undefined);
});

test('a new series is checked against every week', () => {
  const data = { reservations: [{ id: 'r', carId: 'car', userId: 'u2', start: at(2026, 11, 18, 9).toISOString(), end: at(2026, 11, 18, 10).toISOString(), status: 'pending' }], series: [] };
  assert.ok(findSeriesConflict(data, school));
  assert.equal(findSeriesConflict(data, { ...school, daysOfWeek: [2] }), null);
});

test('repeating events use the family time zone, across daylight saving', () => {
  // US clocks fall back on Nov 1, 2026.
  if (TIMEZONE !== 'America/New_York') return;
  const s = { ...school, daysOfWeek: [5, 1], startDate: '2026-10-30', endDate: '2026-11-02', skipDates: [] };
  const occ = expandSeries(s, new Date('2026-10-29T00:00:00Z'), new Date('2026-11-04T00:00:00Z'));
  assert.deepEqual(occ.map((o) => o.start), ['2026-10-30T12:00:00.000Z', '2026-11-02T13:00:00.000Z']);
});

test('overnight repeating events end the next morning', () => {
  if (TIMEZONE !== 'America/New_York') return;
  const s = { ...school, daysOfWeek: [6], startTime: '22:00', endTime: '06:00', startDate: '2026-10-31', endDate: '2026-10-31', skipDates: [] };
  const [o] = expandSeries(s, new Date('2026-10-31T00:00:00Z'), new Date('2026-11-02T00:00:00Z'));
  assert.equal(o.start, '2026-11-01T02:00:00.000Z'); // 22:00 EDT
  assert.equal(o.end, '2026-11-01T11:00:00.000Z'); // 06:00 EST, after the clocks went back
});
