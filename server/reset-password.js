// Clears a family member's password so they can set a new one from the login
// screen. Run with the app stopped:  npm run reset-password -- Sarah
import 'dotenv/config';
import net from 'node:net';
import { db, save } from './db.js';

const name = process.argv.slice(2).join(' ').trim();
const port = Number(process.env.PORT || 3001);

// The running app keeps the database in memory and would overwrite this
// change on its next save, so refuse while it's up.
const appRunning = () =>
  new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
  });

const users = db().users;
if (!name) {
  console.log('Usage: npm run reset-password -- <name>');
  console.log(`Family members: ${users.map((u) => u.name).join(', ')}`);
  process.exit(1);
}

const user = users.find((u) => u.name.toLowerCase() === name.toLowerCase());
if (!user) {
  console.log(`No family member called "${name}". Family members: ${users.map((u) => u.name).join(', ')}`);
  process.exit(1);
}

if (await appRunning()) {
  console.log('The app is still running. Stop it first (Ctrl + C in its terminal), then run this again.');
  process.exit(1);
}

user.passwordHash = null;
save();
console.log(`Done. ${user.name}'s password is cleared.`);
console.log(`Start the app (npm run dev), tap ${user.name} on the login screen and set a new password.`);
console.log('You will need the FAMILY_CODE from your .env file.');
