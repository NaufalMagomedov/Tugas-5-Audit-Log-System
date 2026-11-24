import { z } from 'zod';
import { ValidationError } from '../errors/ValidationError.ts';

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Gunakan format tanggal YYYY-MM-DD.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;
    const [year, month, day] = value.split('-').map(Number);
    return (
      date.getFullYear() === year &&
      date.getMonth() + 1 === month &&
      date.getDate() === day
    );
  }, 'Tanggal tidak valid.');

export const auditLogQuerySchema = z
  .object({
    page: z.coerce
      .number()
      .int({ message: 'Page harus berupa integer.' })
      .min(1, { message: 'Page minimal bernilai 1.' })
      .default(1),
    pageSize: z.coerce
      .number()
      .int({ message: 'PageSize harus berupa integer.' })
      .min(1, { message: 'PageSize minimal bernilai 1.' })
      .max(100, { message: 'PageSize maksimal bernilai 100.' })
      .default(20),
    action: z.string().trim().max(50, { message: 'Action maksimal 50 karakter.' }).optional(),
    targetTable: z.string().trim().max(50, { message: 'TargetTable maksimal 50 karakter.' }).optional(),
    targetId: z.coerce
      .number()
      .int({ message: 'TargetId harus berupa integer.' })
      .positive({ message: 'TargetId harus bilangan bulat positif.' })
      .optional(),
    userId: z.coerce
      .number()
      .int({ message: 'UserId harus berupa integer.' })
      .positive({ message: 'UserId harus bilangan bulat positif.' })
      .optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
  .strict()
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    {
      message: 'Tanggal awal tidak boleh melewati tanggal akhir.',
      path: ['from'],
    },
  );

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const auditLogParamsSchema = z.object({
  id: z.coerce
    .number()
    .int({ message: 'ID audit harus berupa integer.' })
    .positive({ message: 'ID audit harus bilangan bulat positif.' }),
});

export type AuditLogParams = z.infer<typeof auditLogParamsSchema>;

export function parseAuditLogQuery(raw: unknown): AuditLogQuery {
  const result = auditLogQuerySchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.length > 0 ? String(issue.path[0]) : 'query',
      message: issue.message,
    }));

    throw new ValidationError(details, 'Parameter filter audit tidak valid.');
  }

  return result.data;
}

export function parseAuditLogId(raw: unknown): number {
  const result = auditLogParamsSchema.safeParse({ id: raw });

  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.length > 0 ? String(issue.path[0]) : 'id',
      message: issue.message,
    }));

    throw new ValidationError(details, 'ID audit log tidak valid.');
  }

  return result.data.id;
}
