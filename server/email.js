// Sends email through Resend's REST API. Keys are read from the server's
// environment only and never leave this module. If Resend isn't configured,
// or a send fails, the message is logged instead and nothing throws.

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Lays out a simple branded email. `rows` are [label, value] pairs; all values
// are escaped, so user-entered notes and names are safe to pass in.
export function renderEmail({ heading, intro, rows = [], footer }) {
  const appUrl = process.env.APP_URL;
  const text = [
    heading,
    '',
    intro,
    '',
    ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    footer ? `\n${footer}` : '',
    appUrl ? `\nOpen Ohayon Car Sharing: ${appUrl}` : '',
  ].join('\n');

  const rowHtml = rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td>` +
        `<td style="padding:6px 0;font-size:14px;color:#0f172a;white-space:pre-line">${escapeHtml(v)}</td></tr>`,
    )
    .join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f7f6f5;font-family:Inter,Segoe UI,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:24px">
  <div style="font-weight:700;font-size:16px;color:#b91c1c;margin-bottom:12px">Ohayon Car Sharing</div>
  <div style="background:#fff;border:1px solid #e6e8f0;border-radius:16px;padding:24px">
    <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a">${escapeHtml(heading)}</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.5">${escapeHtml(intro)}</p>
    ${rowHtml ? `<table style="border-collapse:collapse;width:100%">${rowHtml}</table>` : ''}
    ${footer ? `<p style="margin:16px 0 0;font-size:14px;color:#334155">${escapeHtml(footer)}</p>` : ''}
    ${appUrl ? `<p style="margin:20px 0 0"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">Open the calendar</a></p>` : ''}
  </div>
</div></body></html>`;
  return { text, html };
}

export async function sendEmail({ to, subject, text, html }) {
  if (!to) return { ok: false, error: 'No email address' };
  if (!emailConfigured()) {
    console.log(`[email:disabled] to ${to} — ${subject}\n${text}\n`);
    return { ok: true, simulated: true };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[email] Resend error ${res.status} sending "${subject}" to ${to}: ${body.slice(0, 300)}`);
      return { ok: false, error: `Email service error (${res.status})` };
    }
    return { ok: true };
  } catch (err) {
    console.error(`[email] send failed for "${subject}" to ${to}:`, err.message);
    return { ok: false, error: 'Could not reach the email service' };
  }
}
