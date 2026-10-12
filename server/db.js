import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const id = () => crypto.randomUUID();

const empty = () => ({
  users: [],
  cars: [],
  reservations: [],
  series: [],
  sentReminders: {},
});

let state;

export function load() {
  if (state) return state;
  if (fs.existsSync(DB_FILE)) {
    state = { ...empty(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  } else {
    state = empty();
  }
  return state;
}

// Writes go to a temp file first so a crash never leaves a half-written database.
export function save() {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export const db = () => load();
