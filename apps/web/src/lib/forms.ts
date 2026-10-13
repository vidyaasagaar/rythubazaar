import type { UiKey, Vars } from '@rythubazaar/shared';
import type { ZodError } from 'zod';
import { ApiError } from './api';

type T = (key: UiKey, vars?: Vars) => string;

/** Translated message for an invalid field (server/zod messages are English-only). */
export function fieldMessage(t: T, path: string): string {
  const leaf = path.split('.').pop() ?? path;
  if (leaf === 'email') return t('form.invalidEmail');
  if (leaf === 'phone') return t('form.invalidPhone');
  if (leaf === 'password') return t('auth.passwordHint');
  if (leaf === 'pincode') return t('form.invalidPincode');
  return t('form.invalidField');
}

export function zodFieldErrors(t: T, error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (!out[path]) out[path] = fieldMessage(t, path);
  }
  return out;
}

export function apiFieldErrors(t: T, err: unknown): Record<string, string> {
  if (!(err instanceof ApiError)) return {};
  return Object.fromEntries(Object.keys(err.fieldErrors()).map((p) => [p, fieldMessage(t, p)]));
}
