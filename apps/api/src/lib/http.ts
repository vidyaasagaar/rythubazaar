import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { Errors } from './errors';

/** Wrap async handlers so rejections reach the error middleware (Express 4). */
export function ah<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req as Req, res, next).catch(next);
  };
}

export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw Errors.validation(
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
    );
  }
  return result.data;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export function pageMeta(page: number, pageSize: number, total: number): PageMeta {
  return { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function ok<T>(res: Response, data: T, status = 200, meta?: PageMeta): void {
  res.status(status).json(meta ? { data, meta } : { data });
}

export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function dateRange(from?: string, to?: string): { $gte?: Date; $lt?: Date } | undefined {
  if (!from && !to) return undefined;
  const range: { $gte?: Date; $lt?: Date } = {};
  if (from) range.$gte = new Date(`${from}T00:00:00.000Z`);
  if (to) {
    const end = new Date(`${to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    range.$lt = end;
  }
  return range;
}
