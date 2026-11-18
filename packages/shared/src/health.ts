import { z } from 'zod';

export const dependencyStatusSchema = z.enum(['up', 'down']);

export const healthReportSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.record(z.string(), dependencyStatusSchema),
});

export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;
export type HealthReport = z.infer<typeof healthReportSchema>;
