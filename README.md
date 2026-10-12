# Ohayon Car Sharing

A website for sharing the Ohayon family cars. Drag on a calendar to reserve a car, get an email with pickup instructions before your turn, and keep everyone's insurance proof in one place.

## What it does

- **Login per family member.** Tap your avatar to log in. The first time, you add your **email** (where notifications go), an optional mobile number, and choose a password. New people join with **"I'm new"** using the family code.
- **4 calendars, one per car.** Pick a car at the top and **press and drag** over the time you need, like when2meet. On a phone, tap a slot, or press and hold, then drag. A booking can span several days.
- **Everyone has their own color.** Change yours in your profile; Sarah can change anyone's.
- **2-week booking window.** Anyone can book up to 14 days ahead. Anything further out is shaded on the calendar and becomes a **special request**. The request shows as *pending* until someone with approval power (Dad by default) approves it on the **Requests** page. Requests can include **proof** (photos or PDFs, such as a flight confirmation), which only the requester, approvers and Sarah can open. Approvers can give a reason when they decline. Everyone sees a history of their own requests, and a declined request can be **reapplied with proof** in one click.
- **Repeating events.** Set up something like *"School, Mon–Fri 7:30–3:30"*, pick the first and last day it runs, and it shows up every week in between. You can skip a single day (holidays, sick days). Repeating events from non-approvers also go through approval.
- **Car panel.** Next to the calendar is the selected car with its details and pickup instructions. Drag the photo to turn it. Press **Dance mode** and the whole screen dances: colors swirl, everything wiggles and cars rain down for 20 seconds (or until you press Stop or Escape). Cars show real photos: upload one per car in **Admin → Edit car → Upload photo**. Until then the car shows a "No photo yet" placeholder.
- **Light and dark mode.** Use the moon/sun button at the top; each device remembers its choice.
- **Email notifications** through Resend:
  - a **booking confirmation** when you reserve a car or a repeating event is confirmed
  - a **cancellation** notice when a booking is cancelled (including by an admin)
  - **pickup instructions** 24 hours and 1 hour before each reservation, using the instructions set per car in Admin
  - a **hand-off reminder** 30 minutes before your booking ends, if someone else has the same car within an hour after you, saying who's next and when (adjust with `HANDOFF_REMINDER_MINUTES` and `HANDOFF_GAP_MINUTES`)
  - approvers get an email for each new request, and requesters get one when it's approved or declined

  Anyone can switch these off in their profile.
- **Insurance tab.** Every family member can open each car's insurance proof (PDF or photo).
- **Admin dashboard (Sarah only).** Add, edit or remove cars (license plate, photo, color, interior, pickup instructions), upload insurance proof, add or remove family members, and choose **who can approve** requests. The dashboard is locked to Sarah: it's hidden for everyone else and the server refuses their admin requests. Admin access can't be given to anyone else.

Seeded on first run:

| People | Cars |
| --- | --- |
| Sarah (owner, admin), Dad (approver), Mom, Rebeccah | Tesla Model 3 (grey, 2023), G-Wagon (grey, red interior), Cadillac Escalade, Tesla Model Y (black) |

Photos, plates, years and insurance docs are left blank. Fill them in under **Admin → Garage**. Photos are stored in `data/`, not in Git.

## Running it

Requires Node 18.17+.

```bash
npm install
cp .env.example .env      # then edit it: FAMILY_CODE, JWT_SECRET, TZ, Resend settings
npm run dev               # http://localhost:5173 (API on :3001)
```

Production:

```bash
npm run build
npm start                 # serves the site and API on PORT (default 3001)
```

Run the scheduling tests with `npm test`.

### Email (Resend)

1. Create a free account at [resend.com](https://resend.com) and verify a domain you own.
2. Create an API key, then set these in `.env`:
   ```
   RESEND_API_KEY=re_...
   EMAIL_FROM=Ohayon Car Sharing <cars@yourdomain.com>
   ```
3. Restart, then use **Admin → Send me a test email**.

Until both are set, emails are printed in the server log instead of sent. If Resend is down or rejects a message, the error is logged and the app keeps working. The API key stays on the server: it is never sent to the browser or included in the built website.

### Forgot a password

Sarah can reset anyone else's password in **Admin → Family members → Reset password**. To reset any password, including Sarah's, from the computer running the app:

```bash
# stop the app first (Ctrl + C), then:
npm run reset-password -- Sarah
npm run dev
```

Then tap that person on the login screen and set a new password (they'll need the `FAMILY_CODE` from `.env`). Their bookings, settings and admin access stay the same.

## Where data lives

Everything is stored in `data/`: `db.json`, uploaded car photos and insurance documents. That folder and `.env` are **git-ignored**, so passwords, API keys, contact details and insurance files never end up on GitHub. Back up `data/` if you host this somewhere.

## Project layout

```
server/        Express API, JSON storage, scheduling rules, email notifications
client/src/    React app (Vite)
  pages/       Login, Calendar, Repeating, Requests, Insurance, Admin, Profile
  components/  WeekCalendar (drag-to-book grid), CarPlayground (car panel), CarPhoto, Icon
```
