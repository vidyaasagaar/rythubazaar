import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
}

/** Consistent error envelope. Never leaks stack traces or provider internals to clients. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let appErr: AppError;
  if (err instanceof AppError) {
    appErr = err;
  } else if (err instanceof multer.MulterError) {
    appErr =
      err.code === 'LIMIT_FILE_SIZE'
        ? new AppError(413, 'PAYLOAD_TOO_LARGE', 'File is too large')
        : new AppError(400, 'VALIDATION_FAILED', 'Invalid upload');
  } else if (
    (err as { type?: string })?.type === 'entity.too.large' ||
    (err as { status?: number })?.status === 413
  ) {
    appErr = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  } else if ((err as { type?: string })?.type === 'entity.parse.failed') {
    appErr = new AppError(400, 'VALIDATION_FAILED', 'Malformed JSON body');
  } else if (
    err instanceof mongoose.Error.MongooseServerSelectionError ||
    (err as { name?: string })?.name === 'MongoNetworkError' ||
    (err as { name?: string })?.name === 'MongoNotConnectedError' ||
    /buffering timed out|not connected|Topology is closed/i.test(String((err as Error)?.message))
  ) {
    appErr = new AppError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable. No changes were made.');
  } else {
    appErr = new AppError(500, 'INTERNAL_ERROR', 'Unexpected server error. No changes were confirmed.');
  }

  const logPayload = { err, requestId: req.id, code: appErr.code, path: req.originalUrl, method: req.method };
  if (appErr.status >= 500) logger.error(logPayload, 'Request failed');
  else logger.info({ requestId: req.id, code: appErr.code, path: req.originalUrl }, 'Request rejected');

  res.status(appErr.status).json({
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.details !== undefined ? { details: appErr.details } : {}),
      requestId: req.id,
    },
  });
}
