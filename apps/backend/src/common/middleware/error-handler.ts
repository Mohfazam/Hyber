import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors.js';
import { env } from '../../config/env.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        statusCode: err.statusCode,
      },
    });
    return;
  }

  console.error('Unhandled error:', err);

  res.status(500).json({
    error: {
      message: 'Internal server error',
      statusCode: 500,
      ...(env.NODE_ENV !== 'production' && {
        detail: err instanceof Error ? err.message : String(err),
      }),
    },
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      statusCode: 404,
    },
  });
}