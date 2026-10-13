import { db, save, id } from './db.js';

// Sarah is the owner: the only person who can open the admin dashboard.
const FAMILY = [
  { name: 'Sarah', color: '#8b5cf6', isOwner: true, canApprove: false },
  { name: 'Dad', color: '#0ea5e9', canApprove: true },
  { name: 'Mom', color: '#f43f5e', canApprove: false },
  { name: 'Rebeccah', color: '#f59e0b', canApprove: false },
];

const CARS = [
  { name: 'Tesla Model 3', make: 'Tesla', model: 'Model 3', year: 2023, color: 'Grey', interior: 'Black' },
  { name: 'G-Wagon', make: 'Mercedes-Benz', model: 'G-Class', year: null, color: 'Grey', interior: 'Red' },
  { name: 'Cadillac Escalade', make: 'Cadillac', model: 'Escalade', year: null, color: 'Black', interior: 'Black' },
  { name: 'Tesla Model Y', make: 'Tesla', model: 'Model Y', year: null, color: 'Black', interior: 'Black' },
];

const guessMime = (name) =>
  ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic', '.pdf': 'application/pdf' })[
    (name.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase()
  ] || 'application/octet-stream';

// Files used to be served straight from /uploads and proof from their own
// folder; register them in data.files so everything goes through /api/files.
function migrateFiles(data) {
  const register = (key, name, mime, extra = {}) => {
    const fid = id();
    data.files[fid] = { key, name, mime: mime || guessMime(name), createdAt: new Date().toISOString(), ...extra };
    return fid;
  };
  for (const car of data.cars) {
    if (car.photo?.startsWith('/uploads/')) {
      const file = car.photo.split('/').pop();
      car.photo = `/api/files/${register(`uploads/${file}`, file)}`;
    }
    for (const doc of car.insurance || []) {
      if (doc.url?.startsWith('/uploads/')) {
        const file = doc.url.split('/').pop();
        doc.url = `/api/files/${register(`uploads/${file}`, doc.name || file, doc.mime)}`;
      }
    }
  }
  for (const r of data.reservations) {
    r.proof = (r.proof || []).map((p) =>
      p.file ? { id: register(`proofs/${p.file}`, p.name, p.mime, { proofOf: r.id }), name: p.name, mime: p.mime } : p,
    );
  }
}

// Seeds the family and the garage on first run, and upgrades data saved by
// older versions. Family members start without a password or email; they
// "claim" their profile from the login page. Saves only if something changed.
export async function seed() {
  const data = db();
  const before = JSON.stringify(data);
  if (data.users.length === 0) {
    data.users = FAMILY.map((u) => ({
      id: id(),
      ...u,
      email: '',
      phone: '',
      passwordHash: null,
      emailOptIn: true,
      createdAt: new Date().toISOString(),
    }));
  }
  if (data.cars.length === 0) {
    data.cars = CARS.map((c) => ({
      id: id(),
      ...c,
      plate: '',
      photo: null,
      insurance: [],
      notes: '',
      pickupInstructions: '',
      createdAt: new Date().toISOString(),
    }));
  }
  // Databases created before email notifications used an SMS opt-in flag.
  for (const u of data.users) {
    if (u.emailOptIn === undefined) u.emailOptIn = u.smsOptIn !== false;
    delete u.smsOptIn;
  }
  // Databases created before the admin lock had an assignable isAdmin flag.
  // Admin is now owner-only: make Sarah the owner and drop everyone else's access.
  if (!data.users.some((u) => u.isOwner)) {
    const sarah = data.users.find((u) => u.name.trim().toLowerCase() === 'sarah');
    if (sarah) sarah.isOwner = true;
  }
  for (const u of data.users) delete u.isAdmin;
  migrateFiles(data);
  if (JSON.stringify(data) !== before) await save();
}
