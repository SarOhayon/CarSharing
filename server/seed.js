import { db, save, id } from './db.js';

const FAMILY = [
// Sarah is the owner: the only person who can open the admin dashboard.
  { name: 'Sarah', color: '#8b5cf6', isOwner: true, canApprove: false },
  { name: 'Dad', color: '#0ea5e9', canApprove: true },
  { name: 'Mom', color: '#f43f5e', canApprove: false },
  { name: 'Rebeccah', color: '#f59e0b', canApprove: false },
];

const CARS = [
  { name: 'Tesla Model 3', make: 'Tesla', model: 'Model 3', year: 2023, color: 'Grey', paint: '#4b4e56', interior: 'Black', style: 'sedan' },
  { name: 'G-Wagon', make: 'Mercedes-Benz', model: 'G-Class', year: null, color: 'Grey', paint: '#6b7075', interior: 'Red', style: 'boxy' },
  { name: 'Cadillac Escalade', make: 'Cadillac', model: 'Escalade', year: null, color: 'Black', paint: '#22252b', interior: 'Black', style: 'suv' },
  { name: 'Tesla Model Y', make: 'Tesla', model: 'Model Y', year: null, color: 'Black', paint: '#16181d', interior: 'Black', style: 'crossover' },
];

// Seeds the family and the garage on first run. Family members start without a
// password or email; they "claim" their profile from the login page.
export function seed() {
  const data = db();
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
  // The Model 3 was first drawn a lighter grey than the real car; match it
  // unless someone already picked a different paint in Admin.
  for (const c of data.cars) if (c.name === 'Tesla Model 3' && c.paint === '#7c8188') c.paint = '#4b4e56';
  save();
}
