import type { ErrorCode } from '@rythubazaar/shared';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (details: unknown) =>
    new AppError(400, 'VALIDATION_FAILED', 'Request validation failed', details),
  unauthenticated: () => new AppError(401, 'UNAUTHENTICATED', 'Authentication required'),
  forbidden: (message = 'You do not have permission to perform this action') =>
    new AppError(403, 'FORBIDDEN', message),
  notFound: (resource = 'Resource') => new AppError(404, 'NOT_FOUND', `${resource} not found`),
  invalidTransition: (from: string, to: string) =>
    new AppError(409, 'INVALID_TRANSITION', `Cannot change status from ${from} to ${to}`),
  conflict: (code: ErrorCode, message: string, details?: unknown) =>
    new AppError(409, code, message, details),
  unprocessable: (code: ErrorCode, message: string, details?: unknown) =>
    new AppError(422, code, message, details),
};
