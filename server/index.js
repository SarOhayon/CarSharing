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
import { db, save, id, DATA_DIR, UPLOAD_DIR } from './db.js';
import { seed } from './seed.js';
import { eventsFor, findConflict, findSeriesConflict, bookingWindowEnd } from './schedule.js';
import { sendSms, smsConfigured, normalizePhone } from './sms.js';
import { startReminderLoop } from './reminders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);

function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, '.jwt-secret');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8');
}
const SECRET = jwtSecret();
const FAMILY_CODE = process.env.FAMILY_CODE || 'family';
if (!process.env.FAMILY_CODE) console.warn('[warn] FAMILY_CODE not set — using "family". Set it in .env.');

seed();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

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
  isAdmin: !!u.isAdmin,
  canApprove: !!u.canApprove,
  smsOptIn: u.smsOptIn !== false,
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
const requireAdmin = (req, _res, next) => (req.user.isAdmin ? next() : next(new HttpError(403, 'Admins only')));
const requireApprover = (req, _res, next) =>
  req.user.canApprove ? next() : next(new HttpError(403, 'You can’t approve requests'));

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');
const isColor = (s) => /^#[0-9a-f]{6}$/i.test(s || '');

function validateContact({ email, phone }, selfId) {
  if (!isEmail(email)) fail(400, 'Please enter a valid email');
  const p = normalizePhone(phone);
  if (p.replace(/\D/g, '').length < 10) fail(400, 'Please enter a valid mobile number');
  const taken = db().users.find((u) => u.id !== selfId && u.email.toLowerCase() === email.toLowerCase());
  if (taken) fail(400, 'That email is already used by another family member');
  return { email: email.trim(), phone: p };
}

const fmt = (iso) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

async function notify(user, body) {
  if (user?.phone && user.smsOptIn !== false) await sendSms(user.phone, body);
}
const notifyApprovers = (body, exceptId) =>
  Promise.all(db().users.filter((u) => u.canApprove && u.id !== exceptId).map((u) => notify(u, body)));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${id()}${path.extname(file.originalname).toLowerCase().slice(0, 8)}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\//.test(file.mimetype) || file.mimetype === 'application/pdf';
    cb(ok ? null : new HttpError(400, 'Only images and PDFs are allowed'), ok);
  },
});
const removeUpload = (url) => {
  if (!url?.startsWith('/uploads/')) return;
  fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true }, () => {});
};

// ---------- auth ----------

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
    save();
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
      isAdmin: false,
      canApprove: false,
      smsOptIn: true,
      createdAt: new Date().toISOString(),
    };
    data.users.push(user);
    save();
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
    const { name, color, smsOptIn, password } = req.body;
    if (req.body.email !== undefined || req.body.phone !== undefined)
      Object.assign(u, validateContact({ email: req.body.email ?? u.email, phone: req.body.phone ?? u.phone }, u.id));
    if (name?.trim()) u.name = name.trim();
    if (isColor(color)) u.color = color;
    if (typeof smsOptIn === 'boolean') u.smsOptIn = smsOptIn;
    if (password) {
      if (password.length < 6) fail(400, 'Password must be at least 6 characters');
      u.passwordHash = await bcrypt.hash(password, 10);
    }
    save();
    res.json(publicUser(u));
  }),
);

// Everything below requires a logged-in family member.
app.use('/api', requireAuth);
app.use('/uploads', requireAuth, express.static(UPLOAD_DIR, { maxAge: '1h' }));

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
  wrap(async (req, res) => {
    const data = db();
    const { carId, note = '', request = false } = req.body;
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
    const r = {
      id: id(),
      carId,
      userId: req.user.id,
      start: start.toISOString(),
      end: end.toISOString(),
      note: String(note).slice(0, 300),
      status,
      special: outside,
      createdAt: new Date().toISOString(),
    };
    data.reservations.push(r);
    save();
    if (status === 'pending')
      await notifyApprovers(`🙋 ${req.user.name} requested the ${car.name}: ${fmt(r.start)} → ${fmt(r.end)}. Approve it in the app.`, req.user.id);
    res.json(r);
  }),
);

app.delete('/api/reservations/:id', (req, res) => {
  const data = db();
  const r = data.reservations.find((x) => x.id === req.params.id);
  if (!r) fail(404, 'Reservation not found');
  if (r.userId !== req.user.id && !req.user.isAdmin) fail(403, 'You can only cancel your own reservations');
  data.reservations = data.reservations.filter((x) => x.id !== r.id);
  save();
  res.json({ ok: true });
});

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
    save();
    if (s.status === 'pending')
      await notifyApprovers(`🔁 ${req.user.name} requested a repeating “${s.title}” on the ${car.name} (${startDate} → ${endDate}).`, req.user.id);
    res.json(s);
  }),
);

app.delete('/api/series/:id', (req, res) => {
  const data = db();
  const s = data.series.find((x) => x.id === req.params.id);
  if (!s) fail(404, 'Not found');
  if (s.userId !== req.user.id && !req.user.isAdmin) fail(403, 'You can only remove your own events');
  data.series = data.series.filter((x) => x.id !== s.id);
  save();
  res.json({ ok: true });
});

// Skip a single day of a series (holiday, sick day...).
app.post('/api/series/:id/skip', (req, res) => {
  const data = db();
  const s = data.series.find((x) => x.id === req.params.id);
  if (!s) fail(404, 'Not found');
  if (s.userId !== req.user.id && !req.user.isAdmin) fail(403, 'You can only change your own events');
  if (!DATE_RE.test(req.body.date)) fail(400, 'Bad date');
  s.skipDates = [...new Set([...(s.skipDates || []), req.body.date])];
  save();
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
    save();
    const car = data.cars.find((c) => c.id === item.carId);
    const owner = data.users.find((u) => u.id === item.userId);
    const what = req.params.kind === 'series' ? `“${item.title}” repeating booking` : `request for ${fmt(item.start)}`;
    await notify(owner, `${approve ? '✅ Approved' : '❌ Not approved'}: your ${what} on the ${car?.name} (${req.user.name}).`);
    res.json(item);
  }),
);

// ---------- admin ----------

const admin = express.Router();
admin.use(requireAdmin);

const carFields = (body) => {
  const out = {};
  for (const k of ['name', 'make', 'model', 'color', 'interior', 'plate', 'notes', 'style'])
    if (body[k] !== undefined) out[k] = String(body[k]).trim().slice(0, 120);
  if (body.year !== undefined) out.year = body.year ? Number(body.year) || null : null;
  if (body.paint !== undefined && isColor(body.paint)) out.paint = body.paint;
  if (out.plate) out.plate = out.plate.toUpperCase();
  return out;
};

admin.post('/cars', upload.single('photo'), (req, res) => {
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
    style: 'sedan',
    paint: '#7c8188',
    ...fields,
    photo: req.file ? `/uploads/${req.file.filename}` : null,
    insurance: [],
    createdAt: new Date().toISOString(),
  };
  db().cars.push(car);
  save();
  res.json(car);
});

admin.patch('/cars/:id', upload.single('photo'), (req, res) => {
  const car = db().cars.find((c) => c.id === req.params.id);
  if (!car) fail(404, 'Car not found');
  Object.assign(car, carFields(req.body));
  if (req.file) {
    removeUpload(car.photo);
    car.photo = `/uploads/${req.file.filename}`;
  } else if (req.body.removePhoto === 'true') {
    removeUpload(car.photo);
    car.photo = null;
  }
  save();
  res.json(car);
});

admin.delete('/cars/:id', (req, res) => {
  const data = db();
  const car = data.cars.find((c) => c.id === req.params.id);
  if (!car) fail(404, 'Car not found');
  removeUpload(car.photo);
  car.insurance.forEach((d) => removeUpload(d.url));
  data.cars = data.cars.filter((c) => c.id !== car.id);
  data.reservations = data.reservations.filter((r) => r.carId !== car.id);
  data.series = data.series.filter((s) => s.carId !== car.id);
  save();
  res.json({ ok: true });
});

admin.post('/cars/:id/insurance', upload.single('file'), (req, res) => {
  const car = db().cars.find((c) => c.id === req.params.id);
  if (!car) fail(404, 'Car not found');
  if (!req.file) fail(400, 'Choose a file to upload');
  const doc = {
    id: id(),
    name: (req.body.name || req.file.originalname).slice(0, 120),
    url: `/uploads/${req.file.filename}`,
    mime: req.file.mimetype,
    expires: DATE_RE.test(req.body.expires || '') ? req.body.expires : null,
    uploadedAt: new Date().toISOString(),
  };
  car.insurance.push(doc);
  save();
  res.json(car);
});

admin.delete('/cars/:id/insurance/:docId', (req, res) => {
  const car = db().cars.find((c) => c.id === req.params.id);
  if (!car) fail(404, 'Car not found');
  const doc = car.insurance.find((d) => d.id === req.params.docId);
  if (doc) removeUpload(doc.url);
  car.insurance = car.insurance.filter((d) => d.id !== req.params.docId);
  save();
  res.json(car);
});

admin.post('/users', (req, res) => {
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
    isAdmin: false,
    canApprove: false,
    smsOptIn: true,
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  save();
  res.json(publicUser(user));
});

admin.patch('/users/:id', (req, res) => {
  const data = db();
  const user = data.users.find((u) => u.id === req.params.id);
  if (!user) fail(404, 'User not found');
  const { isAdmin, canApprove, color, name, resetPassword } = req.body;
  if (typeof isAdmin === 'boolean') {
    if (!isAdmin && user.isAdmin && data.users.filter((u) => u.isAdmin).length === 1) fail(400, 'Keep at least one admin');
    user.isAdmin = isAdmin;
  }
  if (typeof canApprove === 'boolean') {
    if (!canApprove && user.canApprove && data.users.filter((u) => u.canApprove).length === 1)
      fail(400, 'Keep at least one person who can approve requests');
    user.canApprove = canApprove;
  }
  if (isColor(color)) user.color = color;
  if (name?.trim()) user.name = name.trim();
  if (resetPassword) user.passwordHash = null; // they'll set it up again from the login screen
  save();
  res.json(publicUser(user));
});

admin.delete('/users/:id', (req, res) => {
  const data = db();
  if (req.params.id === req.user.id) fail(400, 'You can’t remove yourself');
  const user = data.users.find((u) => u.id === req.params.id);
  if (!user) fail(404, 'User not found');
  if (user.isAdmin && data.users.filter((u) => u.isAdmin).length === 1) fail(400, 'Keep at least one admin');
  if (user.canApprove && data.users.filter((u) => u.canApprove).length === 1)
    fail(400, 'Give someone else approval power first');
  data.users = data.users.filter((u) => u.id !== user.id);
  data.reservations = data.reservations.filter((r) => r.userId !== user.id);
  data.series = data.series.filter((s) => s.userId !== user.id);
  save();
  res.json({ ok: true });
});

admin.get('/sms', (_req, res) => res.json({ configured: smsConfigured() }));
admin.post(
  '/sms/test',
  wrap(async (req, res) => {
    if (!req.user.phone) fail(400, 'Add your phone number in your profile first');
    const r = await sendSms(req.user.phone, '👋 Test text from Family Car Share. Reminders are working!');
    if (!r.ok) fail(502, r.error || 'Could not send');
    res.json(r);
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
  if (err instanceof multer.MulterError) err = new HttpError(400, err.message);
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message, code: err.code });
});

app.listen(PORT, () => {
  console.log(`🚗 Family Car Share API on http://localhost:${PORT}`);
  console.log(`   SMS: ${smsConfigured() ? 'Twilio enabled' : 'not configured (texts are logged here)'}`);
  startReminderLoop();
});
