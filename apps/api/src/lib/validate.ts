import type { z } from 'zod';
import { AppError } from './errors.js';

/** Parse with a zod schema; a failure becomes a 400 VALIDATION_ERROR with per-field details. */
export function parse<T>(schema: z.ZodType<T>, data: unknown, what = 'request'): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Invalid ${what}`,
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}
