import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pipeline } from 'node:stream/promises';
import { db, save, id, withDb, bindDb, ConflictError, usingRedis, DATA_DIR } from './db.js';
import { storeFile, readFile, removeFile, MAX_UPLOAD_MB, StorageMissingError } from './files.js';
import { seed } from './seed.js';
import { eventsFor, findConflict, findSeriesConflict, bookingWindowEnd } from './schedule.js';
import { emailConfigured } from './email.js';
import { notify } from './notify.js';
import { runReminders } from './reminders.js';
import { fmt, todayYmd } from './tz.js';

// The web app itself. server/index.js runs it as a normal server (your
// computer, Render); api/index.js hands it to Vercel.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  // Hosts like Vercel can't keep a generated secret on disk.
  if (usingRedis || process.env.VERCEL) throw new Error('Set the JWT_SECRET environment variable');
  const file = path.join(DATA_DIR, '.jwt-secret');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8');
}
const SECRET = jwtSecret();
const FAMILY_CODE = process.env.FAMILY_CODE || 'family';
if (!process.env.FAMILY_CODE) console.warn('[warn] FAMILY_CODE not set — using "family". Set it in .env.');

const app = express();
// Hosting platforms put the app behind an HTTPS proxy.
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Load this request's data (fresh from Redis on Vercel), filling in the
// family and the cars the very first time.
app.use((_req, _res, next) =>
  withDb(async () => {
    await seed();
    next();
  }),
);

// ---------- helpers ----------

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, message, code) => {
  throw new HttpError(status, message, code);
};
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  color: u.color,
  email: u.email,
  phone: u.phone,
  isAdmin: !!u.isOwner, // only Sarah, the owner, can use the admin dashboard
  canApprove: !!u.canApprove,
  emailOptIn: u.emailOptIn !== false,
  claimed: !!u.passwordHash,
});

function setSession(res, user) {
  const token = jwt.sign({ sub: user.id }, SECRET, { expiresIn: '60d' });
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 24 * 60 * 60 * 1000,
  });
}

function requireAuth(req, _res, next) {
  try {
    const { sub } = jwt.verify(req.cookies.session || '', SECRET);
    const user = db().users.find((u) => u.id === sub);
    if (!user) fail(401, 'Please log in');
    req.user = user;
    next();
  } catch (err) {
    next(err instanceof HttpError ? err : new HttpError(401, 'Please log in'));
  }
}
const requireAdmin = (req, _res, next) => (req.user.isOwner ? next() : next(new HttpError(403, 'Only Sarah can open the admin dashboard')));
const requireApprover = (req, _res, next) =>
  req.user.canApprove ? next() : next(new HttpError(403, 'You can’t approve requests'));

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');
const isColor = (s) => /^#[0-9a-f]{6}$/i.test(s || '');

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  if (!digits || digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

// Email is required (it's where notifications go); phone is optional.
function validateContact({ email, phone }, selfId) {
  if (!isEmail(email)) fail(400, 'Please enter a valid email');
  const p = normalizePhone(phone);
  if (p && p.replace(/\D/g, '').length < 10) fail(400, 'That phone number looks too short');
  const taken = db().users.find((u) => u.id !== selfId && u.email.toLowerCase() === email.toLowerCase());
  if (taken) fail(400, 'That email is already used by another family member');
  return { email: email.trim(), phone: p };
}


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\//.test(file.mimetype) || file.mimetype === 'application/pdf';
    cb(ok ? null : new HttpError(400, 'Only images and PDFs are allowed'), ok);
  },
});
// Upload parsing loses track of the request's data; this puts it back.
const parse = (mw) => (req, res, next) => {
  const reenter = bindDb();
  mw(req, res, (err) => reenter(() => next(err)));
};

// Uploaded files are listed in data.files and served from /api/files/<id>.
async function saveUpload(file, extra = {}) {
  const fid = id();
  const key = await storeFile(file.buffer, file.originalname, file.mimetype);
  db().files[fid] = { key, name: file.originalname.slice(0, 120), mime: file.mimetype, size: file.size, createdAt: new Date().toISOString(), ...extra };
  return fid;
}
const fileUrl = (fid) => `/api/files/${fid}`;
const fileIdFrom = (url) => (url?.startsWith('/api/files/') ? url.slice('/api/files/'.length) : null);
// Removes a file from the list and returns its storage key, so the bytes can
// be deleted once the change is saved.
function forgetFile(fid) {
  const f = fid && db().files[fid];
  if (!f) return [];
  delete db().files[fid];
  return [f.key];
}
const forgetProofs = (r) => (r?.proof || []).flatMap((p) => forgetFile(p.id));
const deleteStored = (keys) => Promise.all(keys.map(removeFile));

// ---------- auth ----------

// Lets the host check the app is up.
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Sends due reminder emails. A normal server does this every minute by
// itself; on Vercel a scheduler (GitHub Actions) calls this with CRON_SECRET.
app.get('/api/cron/reminders', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.get('authorization') !== `Bearer ${secret}`) fail(401, 'Not allowed');
  res.json({ ok: true, sent: await runReminders() });
});

// Shown on the login screen so people can tap their own avatar.
app.get('/api/family', (_req, res) => {
  res.json(db().users.map((u) => ({ id: u.id, name: u.name, color: u.color, claimed: !!u.passwordHash })));
});

app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const { userId, email, password } = req.body;
    const user = db().users.find(
      (u) => (userId && u.id === userId) || (email && u.email.toLowerCase() === String(email).toLowerCase()),
    );
    if (!user?.passwordHash || !(await bcrypt.compare(password || '', user.passwordHash)))
      fail(401, 'Wrong password — try again');
    setSession(res, user);
    res.json(publicUser(user));
  }),
);

// First-time setup for a family member who was added by an admin.
app.post(
  '/api/auth/claim',
  wrap(async (req, res) => {
    const { userId, familyCode, password } = req.body;
    if (familyCode !== FAMILY_CODE) fail(403, 'That family code isn’t right');
    const user = db().users.find((u) => u.id === userId);
    if (!user) fail(404, 'Family member not found');
    if (user.passwordHash) fail(400, 'This profile is already set up — log in instead');
    if ((password || '').length < 6) fail(400, 'Password must be at least 6 characters');
    Object.assign(user, validateContact(req.body, user.id), { passwordHash: await bcrypt.hash(password, 10) });
    await save();
    setSession(res, user);
    res.json(publicUser(user));
  }),
);

app.post(
  '/api/auth/register',
  wrap(async (req, res) => {
    const { name, color, familyCode, password } = req.body;
    if (familyCode !== FAMILY_CODE) fail(403, 'That family code isn’t right');
    if (!name?.trim()) fail(400, 'Please enter your name');
    if ((password || '').length < 6) fail(400, 'Password must be at least 6 characters');
    const data = db();
    if (data.users.some((u) => u.name.toLowerCase() === name.trim().toLowerCase()))
      fail(400, 'Someone with that name already exists — tap your avatar to log in');
    const user = {
      id: id(),
      name: name.trim(),
      color: isColor(color) ? color : '#10b981',
      ...validateContact(req.body),
      passwordHash: await bcrypt.hash(password, 10),
      canApprove: false,
      emailOptIn: true,
      createdAt: new Date().toISOString(),
    };
    data.users.push(user);
    await save();
    setSession(res, user);
    res.json(publicUser(user));
  }),
);

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => res.json(publicUser(req.user)));

app.patch(
  '/api/me',
  requireAuth,
  wrap(async (req, res) => {
    const u = req.user;
    const { name, color, emailOptIn, password } = req.body;
    if (req.body.email !== undefined || req.body.phone !== undefined)
      Object.assign(u, validateContact({ email: req.body.email ?? u.email, phone: req.body.phone ?? u.phone }, u.id));
    if (name?.trim()) u.name = name.trim();
    if (isColor(color)) u.color = color;
    if (typeof emailOptIn === 'boolean') u.emailOptIn = emailOptIn;
    if (password) {
      if (password.length < 6) fail(400, 'Password must be at least 6 characters');
      u.passwordHash = await bcrypt.hash(password, 10);
    }
    await save();
    res.json(publicUser(u));
  }),
);

// Everything below requires a logged-in family member.
app.use('/api', requireAuth);

// Car photos, insurance documents and request proof. Proof can only be opened
// by the person who asked, approvers and the owner.
app.get('/api/files/:id', async (req, res) => {
  const data = db();
  const f = data.files[req.params.id];
  if (!f) fail(404, 'File not found');
  if (f.proofOf) {
    const r = data.reservations.find((x) => x.id === f.proofOf);
    if (r?.userId !== req.user.id && !req.user.canApprove && !req.user.isOwner) fail(403, 'You can’t view this file');
  }
  const stream = await readFile(f.key);
  if (!stream) fail(404, 'File not found');
  res.type(f.mime);
  res.setHeader('Content-Disposition', `inline; filename="${f.name.replace(/[^\w.\- ]/g, '_')}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  await pipeline(stream, res);
});

app.get('/api/config', (_req, res) =>
  res.json({ bookingWindowDays: Number(process.env.BOOKING_WINDOW_DAYS || 14), windowEnd: bookingWindowEnd().toISOString() }),
);
app.get('/api/users', (_req, res) => res.json(db().users.map(publicUser)));
app.get('/api/cars', (_req, res) => res.json(db().cars));

// ---------- calendar ----------

app.get('/api/events', (req, res) => {
  const from = new Date(req.query.from);
  const to = new Date(req.query.to);
  if (isNaN(from) || isNaN(to)) fail(400, 'from/to are required');
  res.json(eventsFor(db(), req.query.carId || null, from, to).filter((e) => e.status !== 'denied'));
});

app.post(
  '/api/reservations',
  parse(upload.array('proof', 5)),
  wrap((req, res) => createReservation(req, res)),
);

async function createReservation(req, res) {
  const data = db();
  const { carId, note = '' } = req.body;
  const request = req.body.request === true || req.body.request === 'true';
  const start = new Date(req.body.start);
  const end = new Date(req.body.end);
  const car = data.cars.find((c) => c.id === carId);
  if (!car) fail(400, 'Pick a car');
  if (isNaN(start) || isNaN(end) || end <= start) fail(400, 'That time range doesn’t look right');
  if (start < new Date(Date.now() - 30 * 60_000)) fail(400, 'You can’t book in the past');

  const conflict = findConflict(data, carId, start, end);
  if (conflict) {
    const who = data.users.find((u) => u.id === conflict.userId)?.name || 'Someone';
    fail(409, `${who} already has the ${car.name} then (${fmt(conflict.start)})`);
  }

  const outside = end > bookingWindowEnd();
  let status = 'approved';
  if (outside && !req.user.canApprove) {
    if (!request) fail(400, 'That’s more than 2 weeks out — send it as a special request instead', 'OUTSIDE_WINDOW');
    status = 'pending';
  }
  // Reapplying after a decline links the new request to the old one.
  let reapplyOf = null;
  if (req.body.reapplyOf) {
    const prev = data.reservations.find((x) => x.id === req.body.reapplyOf);
    if (!prev || prev.userId !== req.user.id || prev.status !== 'denied') fail(400, 'You can only reapply for your own declined requests');
    if (data.reservations.some((x) => x.reapplyOf === prev.id)) fail(400, 'You already reapplied for that request');
    reapplyOf = prev.id;
  }

  const r = {
    id: id(),
    carId,
    userId: req.user.id,
    start: start.toISOString(),
    end: end.toISOString(),
    note: String(note).slice(0, 500),
    status,
    special: outside,
    proof: [],
    reapplyOf,
    createdAt: new Date().toISOString(),
  };
  for (const f of req.files || []) {
    const fid = await saveUpload(f, { proofOf: r.id, uploadedBy: req.user.id });
    r.proof.push({ id: fid, name: data.files[fid].name, mime: f.mimetype });
  }
  data.reservations.push(r);
  try {
    await save();
  } catch (err) {
    await deleteStored(forgetProofs(r)); // don't leave stored files nobody can reach
    throw err;
  }
  if (status === 'pending') {
    await notify.requestReceived(req.user, car, r);
    await notify.approversNewRequest(req.user, car, r, 'reservation');
  } else {
    await notify.bookingConfirmed(req.user, car, r);
  }
  res.json(r);
}

// Tells the owner their booking was cancelled, unless it had already ended
// or was a request that never got approved.
async function notifyCancelled(item, kind, by) {
  const data = db();
  const owner = data.users.find((u) => u.id === item.userId);
  const car = data.cars.find((c) => c.id === item.carId);
  const over = kind === 'series' ? item.endDate < todayYmd() : new Date(item.end) < new Date();
  if (owner && car && item.status !== 'denied' && !over) await notify.cancelled(owner, car, item, kind, by);
}

app.delete(
  '/api/reservations/:id',
  wrap(async (req, res) => {
    const data = db();
    const r = data.reservations.find((x) => x.id === req.params.id);
    if (!r) fail(404, 'Reservation not found');
    if (r.userId !== req.user.id && !req.user.isOwner) fail(403, 'You can only cancel your own reservations');
    data.reservations = data.reservations.filter((x) => x.id !== r.id);
    const keys = forgetProofs(r);
    await save();
    await deleteStored(keys);
    await notifyCancelled(r, 'reservation', req.user);
    res.json({ ok: true });
  }),
);

// ---------- recurring series ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

app.get('/api/series', (_req, res) => res.json(db().series));

app.post(
  '/api/series',
  wrap(async (req, res) => {
    const data = db();
    const { carId, title, daysOfWeek, startTime, endTime, startDate, endDate, note = '' } = req.body;
    const car = data.cars.find((c) => c.id === carId);
    if (!car) fail(400, 'Pick a car');
    if (!title?.trim()) fail(400, 'Give it a name, like “School”');
    if (!Array.isArray(daysOfWeek) || !daysOfWeek.length || daysOfWeek.some((d) => d < 0 || d > 6))
      fail(400, 'Pick at least one day of the week');
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime) || startTime === endTime) fail(400, 'Check the times');
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate) || endDate < startDate) fail(400, 'Check the dates');

    const s = {
      id: id(),
      carId,
      userId: req.user.id,
      title: title.trim().slice(0, 60),
      note: String(note).slice(0, 300),
      daysOfWeek: [...new Set(daysOfWeek.map(Number))].sort(),
      startTime,
      endTime,
      startDate,
      endDate,
      skipDates: [],
      status: req.user.canApprove ? 'approved' : 'pending',
      createdAt: new Date().toISOString(),
    };
    const clash = findSeriesConflict(data, s);
    if (clash) {
      const who = data.users.find((u) => u.id === clash.conflict.userId)?.name || 'Someone';
      fail(409, `Clashes with ${who}’s booking on ${fmt(clash.occurrence.start)}`);
    }
    data.series.push(s);
    await save();
    if (s.status === 'pending') await notify.approversNewRequest(req.user, car, s, 'series');
    else await notify.seriesConfirmed(req.user, car, s);
    res.json(s);
  }),
);

app.delete(
  '/api/series/:id',
  wrap(async (req, res) => {
    const data = db();
    const s = data.series.find((x) => x.id === req.params.id);
    if (!s) fail(404, 'Not found');
    if (s.userId !== req.user.id && !req.user.isOwner) fail(403, 'You can only remove your own events');
    data.series = data.series.filter((x) => x.id !== s.id);
    await save();
    await notifyCancelled(s, 'series', req.user);
    res.json({ ok: true });
  }),
);

// Skip a single day of a series (holiday, sick day...).
app.post('/api/series/:id/skip', async (req, res) => {
  const data = db();
  const s = data.series.find((x) => x.id === req.params.id);
  if (!s) fail(404, 'Not found');
  if (s.userId !== req.user.id && !req.user.isOwner) fail(403, 'You can only change your own events');
  if (!DATE_RE.test(req.body.date)) fail(400, 'Bad date');
  s.skipDates = [...new Set([...(s.skipDates || []), req.body.date])];
  await save();
  res.json(s);
});

// ---------- special requests ----------

app.get('/api/requests', (_req, res) => {
  const data = db();
  const sortDesc = (a, b) => b.createdAt.localeCompare(a.createdAt);
  res.json({
    reservations: data.reservations.filter((r) => r.special || r.status !== 'approved').sort(sortDesc),
    series: [...data.series].sort(sortDesc),
  });
});

app.post(
  '/api/requests/:kind/:id/decision',
  requireApprover,
  wrap(async (req, res) => {
    const data = db();
    const list = req.params.kind === 'series' ? data.series : data.reservations;
    const item = list.find((x) => x.id === req.params.id);
    if (!item) fail(404, 'Request not found');
    const approve = !!req.body.approve;
    const reason = String(req.body.reason || '').trim().slice(0, 500);
    if (approve) {
      const clash =
        req.params.kind === 'series'
          ? findSeriesConflict(data, item)
          : findConflict(data, item.carId, item.start, item.end, { ignoreReservation: item.id }) && {};
      if (clash) fail(409, 'This now clashes with another booking — deny it or ask them to pick another time');
    }
    item.status = approve ? 'approved' : 'denied';
    item.decidedBy = req.user.id;
    item.decidedAt = new Date().toISOString();
    item.decisionNote = reason;
    await save();
    const car = data.cars.find((c) => c.id === item.carId);
    const owner = data.users.find((u) => u.id === item.userId);
    if (owner && car) await notify.decision(owner, car, item, req.params.kind === 'series' ? 'series' : 'reservation', approve, req.user);
    res.json(item);
  }),
);

// ---------- admin ----------

const admin = express.Router();
admin.use(requireAdmin);

const carFields = (body) => {
  const out = {};
  for (const k of ['name', 'make', 'model', 'color', 'interior', 'plate', 'notes'])
    if (body[k] !== undefined) out[k] = String(body[k]).trim().slice(0, 120);
  if (body.pickupInstructions !== undefined) out.pickupInstructions = String(body.pickupInstructions).trim().slice(0, 1000);
  if (body.year !== undefined) out.year = body.year ? Number(body.year) || null : null;
  if (out.plate) out.plate = out.plate.toUpperCase();
  return out;
};

admin.post('/cars', parse(upload.single('photo')), async (req, res) => {
  const fields = carFields(req.body);
  if (!fields.name) fail(400, 'Give the car a name');
  const car = {
    id: id(),
    make: '',
    model: '',
    year: null,
    color: '',
    interior: '',
    plate: '',
    notes: '',
    pickupInstructions: '',
    ...fields,
    photo: req.file ? fileUrl(await saveUpload(req.file)) : null,
    insurance: [],
    createdAt: new Date().toISOString(),
  };
  db().cars.push(car);
  await save();
  res.json(car);
});

admin.patch('/cars/:id', parse(upload.single('photo')), async (req, res) => {
  const car = db().cars.find((c) => c.id === req.params.id);
  if (!car) fail(404, 'Car not found');
  Object.assign(car, carFields(req.body));
  let old = [];
  if (req.file || req.body.removePhoto === 'true') {
    old = forgetFile(fileIdFrom(car.photo));
    car.photo = req.file ? fileUrl(await saveUpload(req.file)) : null;
  }
  await save();
  await deleteStored(old);
  res.json(car);
});

admin.delete('/cars/:id', async (req, res) => {
  const data = db();
  const car = data.cars.find((c) => c.id === req.params.id);
  if (!car) fail(404, 'Car not found');
  const keys = [
    ...forgetFile(fileIdFrom(car.photo)),
    ...car.insurance.flatMap((d) => forgetFile(fileIdFrom(d.url))),
    ...data.reservations.filter((r) => r.carId === car.id).flatMap(forgetProofs),
  ];
  data.cars = data.cars.filter((c) => c.id !== car.id);
  data.reservations = data.reservations.filter((r) => r.carId !== car.id);
  data.series = data.series.filter((s) => s.carId !== car.id);
  await save();
  await deleteStored(keys);
  res.json({ ok: true });
});

admin.post('/cars/:id/insurance', parse(upload.single('file')), async (req, res) => {
  const car = db().cars.find((c) => c.id === req.params.id);
  if (!car) fail(404, 'Car not found');
  if (!req.file) fail(400, 'Choose a file to upload');
  const doc = {
    id: id(),
    name: (req.body.name || req.file.originalname).slice(0, 120),
    url: fileUrl(await saveUpload(req.file)),
    mime: req.file.mimetype,
    expires: DATE_RE.test(req.body.expires || '') ? req.body.expires : null,
    uploadedAt: new Date().toISOString(),
  };
  car.insurance.push(doc);
  await save();
  res.json(car);
});

admin.delete('/cars/:id/insurance/:docId', async (req, res) => {
  const car = db().cars.find((c) => c.id === req.params.id);
  if (!car) fail(404, 'Car not found');
  const doc = car.insurance.find((d) => d.id === req.params.docId);
  const keys = forgetFile(fileIdFrom(doc?.url));
  car.insurance = car.insurance.filter((d) => d.id !== req.params.docId);
  await save();
  await deleteStored(keys);
  res.json(car);
});

admin.post('/users', async (req, res) => {
  const data = db();
  const name = req.body.name?.trim();
  if (!name) fail(400, 'Enter a name');
  if (data.users.some((u) => u.name.toLowerCase() === name.toLowerCase())) fail(400, 'That name is taken');
  const user = {
    id: id(),
    name,
    color: isColor(req.body.color) ? req.body.color : '#10b981',
    email: '',
    phone: '',
    passwordHash: null,
    canApprove: false,
    emailOptIn: true,
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  await save();
  res.json(publicUser(user));
});

admin.patch('/users/:id', async (req, res) => {
  const data = db();
  const user = data.users.find((u) => u.id === req.params.id);
  if (!user) fail(404, 'User not found');
  // Admin access isn't assignable: it always belongs to the owner (Sarah).
  const { canApprove, color, name, resetPassword } = req.body;
  if (typeof canApprove === 'boolean') {
    if (!canApprove && user.canApprove && data.users.filter((u) => u.canApprove).length === 1)
      fail(400, 'Keep at least one person who can approve requests');
    user.canApprove = canApprove;
  }
  if (isColor(color)) user.color = color;
  if (name?.trim()) user.name = name.trim();
  if (resetPassword) user.passwordHash = null; // they'll set it up again from the login screen
  await save();
  res.json(publicUser(user));
});

admin.delete('/users/:id', async (req, res) => {
  const data = db();
  if (req.params.id === req.user.id) fail(400, 'You can’t remove yourself');
  const user = data.users.find((u) => u.id === req.params.id);
  if (!user) fail(404, 'User not found');
  if (user.isOwner) fail(400, 'The owner can’t be removed');
  if (user.canApprove && data.users.filter((u) => u.canApprove).length === 1)
    fail(400, 'Give someone else approval power first');
  const keys = data.reservations.filter((r) => r.userId === user.id).flatMap(forgetProofs);
  data.users = data.users.filter((u) => u.id !== user.id);
  data.reservations = data.reservations.filter((r) => r.userId !== user.id);
  data.series = data.series.filter((s) => s.userId !== user.id);
  await save();
  await deleteStored(keys);
  res.json({ ok: true });
});

// Only says whether email is set up — never returns the key or sender.
admin.get('/email', (_req, res) => res.json({ configured: emailConfigured() }));
admin.post(
  '/email/test',
  wrap(async (req, res) => {
    if (!req.user.email) fail(400, 'Add your email in your profile first');
    const r = await notify.test(req.user);
    if (!r.ok) fail(502, r.error || 'Could not send');
    res.json({ ok: true, simulated: !!r.simulated });
  }),
);

app.use('/api/admin', admin);

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

// ---------- static client (production) ----------

const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/(api|uploads)\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  if (err instanceof ConflictError) err = new HttpError(409, err.message);
  if (err instanceof StorageMissingError) err = new HttpError(503, err.message);
  if (err instanceof multer.MulterError)
    err = new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? `That file is too big (max ${MAX_UPLOAD_MB} MB)` : err.message);
  const status = err.status || 500;
  if (status >= 500 && !(err instanceof HttpError)) console.error(err);
  // Our own HttpErrors carry safe, user-facing messages; anything else is hidden.
  res.status(status).json({ error: err instanceof HttpError ? err.message : 'Something went wrong', code: err.code });
});

export default app;
