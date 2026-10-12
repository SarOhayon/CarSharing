# 🚗 Family Car Share

A friendly website for sharing the family cars. Drag on a calendar to reserve a car, get a text before your turn, and keep everyone's insurance proof in one place.

## What it does

- **Login per family member.** Tap your avatar to log in. The first time, you add your **email and mobile number** (used for text reminders) and choose a password. New people join with **"I'm new"** using the family code.
- **4 calendars, one per car.** Pick a car at the top and **press and drag** over the time you need, like when2meet. On a phone, tap a slot, or press and hold, then drag. A booking can span several days.
- **Everyone has their own color.** Change yours in your profile; admins can change anyone's.
- **2-week booking window.** Anyone can book up to 14 days ahead. Anything further out is shaded on the calendar and becomes a **special request**. The request shows as *pending* until someone with approval power (Dad by default) approves it on the **Requests** page.
- **Repeating events.** Set up something like *"School, Mon–Fri 7:30–3:30, Sep–Dec"* once and it shows up every week for the whole period. Use the semester presets, or skip a single day (holidays, sick days). Repeating events from non-approvers also go through approval.
- **Car toy.** Next to the calendar you can drag, fling, spin, rotate and flip the car. Double-click it to flip it, or scroll over it to spin it. Upload a real photo in Admin and you can play with that instead.
- **Text reminders** go out 24 hours and 1 hour before each reservation, through Twilio. Approvers also get a text when a new request arrives, and requesters get one when their request is approved or declined.
- **Insurance tab.** Every family member can open each car's insurance proof (PDF or photo).
- **Admin dashboard.** Add, edit or remove cars (license plate, photo, color, interior), upload insurance proof, add or remove family members, and choose **who can approve** requests and who is an admin.

Seeded on first run:

| People | Cars |
| --- | --- |
| Sarah (admin), Dad (admin + approver), Mom, Rebeccah | Tesla Model 3 (grey, 2023), G-Wagon (grey, red interior), Cadillac Escalade, Tesla Model Y (black) |

Plates, years and insurance docs are left blank. Fill them in under **Admin → Garage**.

## Running it

Requires Node 18.17+.

```bash
npm install
cp .env.example .env      # then edit it: FAMILY_CODE, JWT_SECRET, TZ, Twilio keys
npm run dev               # http://localhost:5173 (API on :3001)
```

Production:

```bash
npm run build
npm start                 # serves the site and API on PORT (default 3001)
```

Run the scheduling tests with `npm test`.

### Text messages (Twilio)

1. Create a Twilio account and buy a phone number.
2. Put `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` in `.env`.
3. Restart, then use **Admin → Send me a test text**.

Until Twilio is set up, texts are printed in the server log instead of sent.

## Where data lives

Everything is stored in `data/`: `db.json`, uploaded car photos and insurance documents. That folder and `.env` are **git-ignored**, so passwords, phone numbers and insurance files never end up on GitHub. Back up `data/` if you host this somewhere.

## Project layout

```
server/        Express API, JSON storage, scheduling rules, SMS reminders
client/src/    React app (Vite)
  pages/       Login, Calendar, Repeating, Requests, Insurance, Admin, Profile
  components/  WeekCalendar (drag-to-book grid), CarPlayground (the car toy), CarArt
```
