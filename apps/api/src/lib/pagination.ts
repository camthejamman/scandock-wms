import { z } from 'zod';

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type PageQuery = z.infer<typeof pageQuery>;

export function paged<T>(data: T[], total: number, p: PageQuery) {
  return { data, total, page: p.page, pageSize: p.pageSize };
}
