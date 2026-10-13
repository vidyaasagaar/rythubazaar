import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { AppError } from '../lib/errors';
import { ah, ok } from '../lib/http';
import { requirePermission } from '../middleware/auth';
import type { AppDeps } from '../context';

/** Detect the real image type from magic bytes; the client-supplied MIME type is not trusted. */
function sniffImage(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'png';
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'webp';
  return null;
}

export function uploadDir(deps: AppDeps) {
  return path.resolve(process.cwd(), deps.env.UPLOAD_DIR);
}

export function uploadsRouter(deps: AppDeps) {
  const r = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Math.round(deps.env.MAX_UPLOAD_MB * 1024 * 1024), files: 1 },
  });

  r.post(
    '/image',
    requirePermission('uploads:create'),
    upload.single('file'),
    ah(async (req, res) => {
      const file = req.file;
      if (!file) throw new AppError(400, 'VALIDATION_FAILED', 'Attach an image in the "file" field');
      const ext = sniffImage(file.buffer);
      if (!ext) throw new AppError(415, 'UNSUPPORTED_FILE', 'Only JPG, PNG or WebP images are accepted');
      const name = `${randomBytes(12).toString('hex')}.${ext}`;
      const dir = uploadDir(deps);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, name), file.buffer, { flag: 'wx' });
      ok(res, { path: `/uploads/${name}`, bytes: file.size }, 201);
    }),
  );

  return r;
}
