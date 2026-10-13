import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { put, get, del } from '@vercel/blob';
import { DATA_DIR, id } from './db.js';

// Uploaded files (car photos, insurance documents, request proof) live in
// Vercel Blob when it's connected, otherwise in DATA_DIR on disk. Either way
// the browser only ever sees /api/files/<id>, which checks who's logged in.

export const usingBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const access = process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';
const BLOB_PREFIX = 'blob:';

// Vercel rejects request bodies over 4.5 MB, so uploads there are capped lower.
export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || (process.env.VERCEL ? 4 : 15));

const ext = (name) => path.extname(name || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);

export class StorageMissingError extends Error {
  constructor() {
    super('File uploads need a Vercel Blob store — connect one under Storage in your Vercel project');
  }
}

// Returns a storage key for the saved bytes.
export async function storeFile(buffer, name, mime) {
  if (!usingBlob && process.env.VERCEL) throw new StorageMissingError(); // Vercel's disk is wiped between visits
  const fname = `${id()}${ext(name)}`;
  if (usingBlob) {
    const blob = await put(`files/${fname}`, buffer, { access, contentType: mime, addRandomSuffix: true });
    return `${BLOB_PREFIX}${blob.url}`;
  }
  const dir = path.join(DATA_DIR, 'files');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fname), buffer);
  return `files/${fname}`;
}

// Returns a readable stream, or null if the file is gone.
export async function readFile(key) {
  if (key.startsWith(BLOB_PREFIX)) {
    const result = await get(key.slice(BLOB_PREFIX.length), { access });
    return result ? Readable.fromWeb(result.stream) : null;
  }
  // Keys are paths inside DATA_DIR (older files live in uploads/ or proofs/).
  const full = path.join(DATA_DIR, path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, ''));
  if (!full.startsWith(DATA_DIR) || !fs.existsSync(full)) return null;
  return fs.createReadStream(full);
}

export async function removeFile(key) {
  try {
    if (key.startsWith(BLOB_PREFIX)) await del(key.slice(BLOB_PREFIX.length));
    else fs.rmSync(path.join(DATA_DIR, path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '')), { force: true });
  } catch (err) {
    console.error('[files] could not delete', key, err.message);
  }
}
