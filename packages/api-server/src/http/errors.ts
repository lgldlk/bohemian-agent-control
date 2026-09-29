import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../log';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'error',
  ) {
    super(message);
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function errorMiddleware(log: Logger) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ success: false, error: err.message, code: err.code });
      return;
    }
    if (typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.too.large') {
      res.status(413).json({ success: false, error: '文件过大，无法导入', code: 'file_too_large' });
      return;
    }
    log.error('unhandled', err);
    res.status(500).json({ success: false, error: 'internal error', code: 'internal' });
  };
}
