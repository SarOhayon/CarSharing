import app from './app.js';
import { usingRedis } from './db.js';
import { usingBlob } from './files.js';
import { emailConfigured } from './email.js';
import { startReminderLoop } from './reminders.js';
import { TIMEZONE } from './tz.js';

// Runs the app as an always-on server (your computer, Render). On Vercel,
// api/index.js is used instead.
const PORT = Number(process.env.PORT || 3001);

app.listen(PORT, () => {
  console.log(`Ohayon Car Sharing API on http://localhost:${PORT}`);
  console.log(`   Data: ${usingRedis ? 'Upstash Redis' : 'data/db.json'} · Files: ${usingBlob ? 'Vercel Blob' : 'data/'} · Time zone: ${TIMEZONE}`);
  console.log(`   Email: ${emailConfigured() ? 'Resend enabled' : 'not configured (emails are logged here)'}`);
  startReminderLoop();
});
