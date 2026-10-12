// Sends text messages through Twilio's REST API. If Twilio isn't configured
// the message is only logged, so the app still works locally.

export const smsConfigured = () =>
  Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);

export function normalizePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits ? `+${digits}` : '';
}

export async function sendSms(to, body) {
  const phone = normalizePhone(to);
  if (!phone) return { ok: false, error: 'No phone number' };
  if (!smsConfigured()) {
    console.log(`[sms:disabled] to ${phone}: ${body}`);
    return { ok: true, simulated: true };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: phone, From: process.env.TWILIO_FROM_NUMBER, Body: body }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[sms] Twilio error ${res.status}: ${text}`);
      return { ok: false, error: `Twilio error ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('[sms] send failed', err);
    return { ok: false, error: err.message };
  }
}
