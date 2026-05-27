import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { supabase } from '../services/supabase';
import { triageTicket } from '../agents/triageAgent';
import { analyzeContext } from '../agents/contextAgent';
import { suggestResponse } from '../agents/responseAgent';
import { sanitizeTicket, sanitizeTicketArray } from '../services/sanitize';
import { env } from '../services/env';

const router = Router();

const WebhookPayloadSchema = z.object({
  type: z.literal('INSERT'),
  table: z.literal('tickets'),
  record: z.record(z.string(), z.unknown()),
});

router.post('/process-ticket', async (req: Request, res: Response) => {
  try {
    const secret = req.headers['x-webhook-secret'];
    if (secret !== env.WEBHOOK_SECRET) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const parsed = WebhookPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.issues });
      return;
    }

    const ticket = parsed.data.record;
    console.log(`Procesando ticket ${ticket.id}: "${ticket.title}"`);

    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', ticket.company_id as string)
      .single();
    ticket.company_name = company?.name || null;

    console.log('Ejecutando TriageAgent...');
    const triageResult = await triageTicket(ticket.title as string, ticket.description as string);
    console.log('Triage completado:', triageResult);

    console.log('Consultando historial del usuario...');
    const { data: historyTickets, error: historyError } = await supabase
      .from('tickets')
      .select('*')
      .eq('user_id', ticket.user_id as string)
      .eq('company_id', ticket.company_id as string)
      .neq('id', ticket.id as string)
      .order('created_at', { ascending: false })
      .limit(5);

    if (historyError) {
      console.error('Error al consultar historial:', historyError);
    }

    console.log('Ejecutando ContextAgent...');
    const safeTicket = sanitizeTicket(ticket as Record<string, unknown>);
    const safeHistory = sanitizeTicketArray((historyTickets || []) as Record<string, unknown>[]);
    const contextResult = await analyzeContext(
      { title: safeTicket?.title ?? '', description: safeTicket?.description ?? '' },
      safeHistory,
    );
    console.log('Contexto analizado:', contextResult);

    let suggestedResponse = null;
    if (triageResult.priority > 0) {
      const userName = (ticket.user_name as string) || null;
      console.log('Ejecutando ResponseAgent...');
      suggestedResponse = await suggestResponse(
        {
          title: safeTicket?.title ?? ticket.title as string,
          description: safeTicket?.description ?? ticket.description as string,
          priority: triageResult.priority,
          category: triageResult.category,
          company_name: safeTicket?.company_name,
        },
        contextResult as unknown as Record<string, unknown>,
        userName,
      );
    } else {
      console.log('Ticket fuera de scope, omitiendo ResponseAgent');
    }

    console.log('Actualizando ticket en Supabase...');
    const updateData: Record<string, unknown> = {
      category: triageResult.category,
      priority: triageResult.priority,
      tags: triageResult.tags,
      ai_context: contextResult,
      status: triageResult.priority === 0 ? 'CLOSED' : 'OPEN',
      updated_at: new Date().toISOString(),
    };
    if (suggestedResponse) {
      updateData.ai_suggested_response = suggestedResponse;
    }

    const { error: updateError } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', ticket.id as string);

    if (updateError) {
      console.error('Error al actualizar ticket:', updateError);
      res.status(500).json({ error: 'Error al actualizar ticket' });
      return;
    }

    console.log(`Ticket ${ticket.id} procesado exitosamente`);
    res.json({ success: true, ticketId: ticket.id });
  } catch (error) {
    console.error('Error en pipeline de agentes:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

const TestTicketSchema = z.object({
  ticket: z.object({
    title: z.string(),
    description: z.string(),
    user_name: z.string().optional(),
    company_id: z.string().optional(),
    history: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
});

router.post('/test-process', async (req: Request, res: Response) => {
  try {
    const parsed = TestTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Ticket inválido', details: parsed.error.issues });
      return;
    }

    const { ticket } = parsed.data;

    if (ticket.company_id) {
      const { data: company } = await supabase
        .from('companies')
        .select('name')
        .eq('id', ticket.company_id)
        .single();
      (ticket as Record<string, unknown>).company_name = company?.name || null;
    }

    const triageResult = await triageTicket(ticket.title, ticket.description);
    const safeTicket = sanitizeTicket(ticket as unknown as Record<string, unknown>);
    const safeHistory = sanitizeTicketArray((ticket.history || []) as Record<string, unknown>[]);
    const contextResult = await analyzeContext(
      { title: safeTicket?.title ?? '', description: safeTicket?.description ?? '' },
      safeHistory,
    );
    const suggestedResponse = await suggestResponse(
      {
        title: safeTicket?.title ?? ticket.title,
        description: safeTicket?.description ?? ticket.description,
        priority: triageResult.priority,
        category: triageResult.category,
        company_name: safeTicket?.company_name,
      },
      contextResult as unknown as Record<string, unknown>,
      ticket.user_name || null,
    );

    res.json({
      triage: triageResult,
      context: contextResult,
      response: suggestedResponse,
    });
  } catch (error) {
    console.error('Error en test pipeline:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

export default router;
