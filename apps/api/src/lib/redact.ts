/** Redaction helpers for exports, audit views and support-level access. */

export function maskPhone(phone?: string | null): string | undefined {
  if (!phone) return phone ?? undefined;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `${digits.slice(0, 2)}${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-2)}`;
}

export function maskEmail(email?: string | null): string | undefined {
  if (!email) return email ?? undefined;
  const [user, domain] = email.split('@');
  if (!domain || !user) return '***';
  return `${user[0]}***@${domain}`;
}

export function maskName(name?: string | null): string | undefined {
  if (!name) return name ?? undefined;
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0]}.`)
    .join(' ');
}

const PHONE_IN_TEXT = /(?<!\d)[6-9]\d{9}(?!\d)/g;
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Scrub phone numbers and emails out of free text (e.g. spoken transcripts). */
export function scrubText(text: string): string {
  return text
    .replace(PHONE_IN_TEXT, (m) => maskPhone(m) ?? '')
    .replace(EMAIL_IN_TEXT, (m) => maskEmail(m) ?? '');
}

const DROP_KEYS = new Set(['passwordHash', 'callTokenHash', 'sessionVersion', 'line1', 'pincode', '__v']);
const PHONE_KEYS = new Set(['phone', 'agentPhone']);
const EMAIL_KEYS = new Set(['email']);
const NAME_KEYS = new Set(['recipientName', 'customerName', 'agentName']);

/** Deep-redact an object for export. Returns a new plain value. */
export function redactDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    if (typeof (value as { toHexString?: () => string }).toHexString === 'function') {
      return (value as { toHexString: () => string }).toHexString();
    }
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (DROP_KEYS.has(key)) continue;
      if (PHONE_KEYS.has(key) && typeof v === 'string') out[key] = maskPhone(v);
      else if (EMAIL_KEYS.has(key) && typeof v === 'string') out[key] = maskEmail(v);
      else if (NAME_KEYS.has(key) && typeof v === 'string') out[key] = maskName(v);
      else out[key] = redactDeep(v);
    }
    return out;
  }
  if (typeof value === 'string') return scrubText(value);
  return value;
}
