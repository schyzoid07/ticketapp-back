import { z } from 'zod';

export const SafeTicketSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  user_name: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  priority: z.number().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  status: z.string().optional(),
  company_name: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type SafeTicket = z.infer<typeof SafeTicketSchema>;

export function sanitizeTicket(ticket: Record<string, unknown>): SafeTicket | null {
  if (!ticket) return null;
  const result = SafeTicketSchema.safeParse(ticket);
  return result.success ? result.data : null;
}

export function sanitizeTicketArray(tickets: Record<string, unknown>[]): SafeTicket[] {
  if (!tickets) return [];
  return tickets.map(sanitizeTicket).filter((t): t is SafeTicket => t !== null);
}
