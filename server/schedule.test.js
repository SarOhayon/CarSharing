import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandSeries, findConflict, findSeriesConflict } from './schedule.js';

const school = {
  id: 's1', carId: 'car', userId: 'u1', title: 'School', status: 'approved',
  daysOfWeek: [1, 3], startTime: '08:00', endTime: '15:00', startDate: '2026-09-01', endDate: '2026-12-20', skipDates: ['2026-09-07'],
};

test('expands a series only on chosen weekdays within the period', () => {
  const occ = expandSeries(school, new Date(2026, 8, 1), new Date(2026, 8, 15));
  assert.deepEqual(occ.map((o) => o.date), ['2026-09-02', '2026-09-09', '2026-09-14']); // 7th skipped
  assert.equal(new Date(occ[0].start).getHours(), 8);
  assert.equal(expandSeries(school, new Date(2027, 0, 1), new Date(2027, 0, 30)).length, 0);
});

test('detects clashes between single bookings and series occurrences', () => {
  const data = {
    reservations: [{ id: 'r1', carId: 'car', userId: 'u2', start: new Date(2026, 8, 3, 10).toISOString(), end: new Date(2026, 8, 3, 12).toISOString(), status: 'approved' }],
    series: [school],
  };
  assert.ok(findConflict(data, 'car', new Date(2026, 8, 3, 11), new Date(2026, 8, 3, 13)));
  assert.ok(findConflict(data, 'car', new Date(2026, 8, 2, 14), new Date(2026, 8, 2, 16)));
  assert.equal(findConflict(data, 'car', new Date(2026, 8, 3, 12), new Date(2026, 8, 3, 13)), undefined);
  assert.equal(findConflict(data, 'other', new Date(2026, 8, 3, 11), new Date(2026, 8, 3, 13)), undefined);
  assert.equal(findConflict(data, 'car', new Date(2026, 8, 3, 11), new Date(2026, 8, 3, 13), { ignoreReservation: 'r1' }), undefined);
  data.reservations[0].status = 'denied';
  assert.equal(findConflict(data, 'car', new Date(2026, 8, 3, 11), new Date(2026, 8, 3, 13)), undefined);
});

test('a new series is checked against every week', () => {
  const data = { reservations: [{ id: 'r', carId: 'car', userId: 'u2', start: new Date(2026, 10, 18, 9).toISOString(), end: new Date(2026, 10, 18, 10).toISOString(), status: 'pending' }], series: [] };
  assert.ok(findSeriesConflict(data, school));
  assert.equal(findSeriesConflict(data, { ...school, daysOfWeek: [2] }), null);
});
