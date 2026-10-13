import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath } from 'node:url';
import { Redis } from '@upstash/redis';

// Data lives in one of two places:
// - Upstash Redis, when its env vars are set (Vercel, where the disk is wiped)
// - a JSON file in DATA_DIR otherwise (your computer, Render)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const usingRedis = Boolean(redisUrl && redisToken);
const redis = usingRedis ? new Redis({ url: redisUrl, token: redisToken, automaticDeserialization: false }) : null;
const PREFIX = process.env.REDIS_KEY_PREFIX || 'carshare';
const DB_KEY = `${PREFIX}:db`;
const VERSION_KEY = `${PREFIX}:version`;

if (!usingRedis) fs.mkdirSync(DATA_DIR, { recursive: true });

export const id = () => crypto.randomUUID();

const empty = () => ({
  users: [],
  cars: [],
  reservations: [],
  series: [],
  files: {},
  sentReminders: {},
});

export class ConflictError extends Error {
  constructor() {
    super('Someone else just changed something — please try again.');
  }
}

// ---------- file backend: one copy in memory for the whole process ----------

let fileState;
const loadFile = () => ({ ...empty(), ...(fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {}) });

// ---------- redis backend: a fresh copy per request ----------

// Each request works on its own copy, kept here so concurrent requests never
// see each other's half-finished changes.
const als = new AsyncLocalStorage();

// Writes only if nobody else saved since this request loaded the data.
const CHECK_AND_SET = `
local current = redis.call('GET', KEYS[2]) or '0'
if current ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], tostring(tonumber(current) + 1))
return 1`;

async function loadRedis() {
  const [raw, version] = await redis.mget(DB_KEY, VERSION_KEY);
  return { state: { ...empty(), ...(raw ? JSON.parse(raw) : {}) }, version: String(version ?? '0') };
}

// ---------- shared API ----------

export function db() {
  if (!usingRedis) return (fileState ??= loadFile());
  const ctx = als.getStore();
  if (!ctx) throw new Error('db() used outside withDb()');
  return ctx.state;
}

export async function save() {
  if (!usingRedis) {
    // Write to a temp file first so a crash never leaves a half-written database.
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(fileState, null, 2));
    fs.renameSync(tmp, DB_FILE);
    return;
  }
  const ctx = als.getStore();
  const ok = await redis.eval(CHECK_AND_SET, [DB_KEY, VERSION_KEY], [ctx.version, JSON.stringify(ctx.state)]);
  if (!ok) throw new ConflictError();
  ctx.version = String(Number(ctx.version) + 1);
}

// Runs fn with the data loaded.
export async function withDb(fn) {
  if (!usingRedis) return fn();
  const ctx = await loadRedis();
  return als.run(ctx, fn);
}

// Captures the current request's data so a callback that loses the async
// context (like upload parsing) can get back into it.
export function bindDb() {
  const ctx = als.getStore();
  return ctx ? (cb) => als.run(ctx, cb) : (cb) => cb();
}

// Marks a one-time job (like a reminder email) as done. Returns false if it
// was already claimed, so two overlapping runs never send the same email.
export async function claimOnce(key, ttlDays = 30) {
  if (usingRedis) return (await redis.set(`${PREFIX}:sent:${key}`, '1', { nx: true, ex: ttlDays * 86400 })) === 'OK';
  const data = db();
  if (data.sentReminders[key]) return false;
  data.sentReminders[key] = new Date().toISOString();
  await save();
  return true;
}

export async function releaseClaim(key) {
  if (usingRedis) return redis.del(`${PREFIX}:sent:${key}`);
  delete db().sentReminders[key];
  await save();
}

// File backend only: forget claims older than 30 days (Redis expires them itself).
export async function pruneClaims(now = new Date()) {
  if (usingRedis) return;
  const data = db();
  const cutoff = now.getTime() - 30 * 86400_000;
  let changed = false;
  for (const [k, v] of Object.entries(data.sentReminders)) {
    if (new Date(v).getTime() < cutoff) {
      delete data.sentReminders[k];
      changed = true;
    }
  }
  if (changed) await save();
}
