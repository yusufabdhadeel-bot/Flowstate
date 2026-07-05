import twilio from 'twilio';

const isWhatsAppEnabled = process.env.ENABLE_WHATSAPP_NOTIFICATIONS === 'true';
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

const RATE_LIMIT_WINDOW_MS = 10_000; // basic rate limit per recipient
const rateLimitMap = new Map<string, number>();

function normalizePhoneNumber(phone: string): string | null {
  if (!phone) {
    return null;
  }

  const cleaned = phone.replace(/[^+\d]/g, '');
  if (!cleaned.startsWith('+')) {
    return null;
  }

  if (!/^\+\d{8,15}$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

function getTwilioClient() {
  if (!isWhatsAppEnabled) {
    return null;
  }

  if (!accountSid || !authToken || !whatsappNumber) {
    console.warn(
      'WhatsApp notification skipped: missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_WHATSAPP_NUMBER.'
    );
    return null;
  }

  return twilio(accountSid, authToken);
}

function canSendTo(phone: string): boolean {
  const now = Date.now();
  const lastSent = rateLimitMap.get(phone) ?? 0;
  if (now - lastSent < RATE_LIMIT_WINDOW_MS) {
    console.log(`WhatsApp rate limit active for ${phone}, skipping send.`);
    return false;
  }

  rateLimitMap.set(phone, now);
  return true;
}

function buildWhatsAppFrom(): string {
  const value = whatsappNumber ?? '';
  if (!value) {
    return 'whatsapp:+000000000000';
  }

  return value.startsWith('whatsapp:') ? value : `whatsapp:${value}`;
}

export async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
  try {
    if (!isWhatsAppEnabled) {
      console.log(`WhatsApp skipped for ${to} - notifications disabled`);
      return false;
    }

    const normalized = normalizePhoneNumber(to);
    if (!normalized) {
      console.warn(`WhatsApp skipped: invalid phone number ${to}`);
      return false;
    }

    if (!canSendTo(normalized)) {
      return false;
    }

    const client = getTwilioClient();
    if (!client) {
      return false;
    }

    const from = buildWhatsAppFrom();
    const whatsappTo = `whatsapp:${normalized}`;

    await client.messages.create({
      from,
      to: whatsappTo,
      body: message,
    });

    console.log(`WhatsApp sent to ${normalized}`);
    return true;
  } catch (error) {
    console.error(`WhatsApp failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

export async function sendMemoAssignedWhatsApp(managerPhone: string, memoTitle: string): Promise<void> {
  try {
    const message = `You have a new memo awaiting approval: ${memoTitle}`;
    await sendWhatsAppMessage(managerPhone, message);
  } catch (error) {
    console.error(`Failed to send memo assigned WhatsApp: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function sendMemoQueriedWhatsApp(
  creatorPhone: string,
  memoTitle: string,
  comment: string
): Promise<void> {
  try {
    const message = `Your memo has been queried: ${memoTitle}. Comment: ${comment}`;
    await sendWhatsAppMessage(creatorPhone, message);
  } catch (error) {
    console.error(`Failed to send memo queried WhatsApp: ${error instanceof Error ? error.message : String(error)}`);
  }
}
