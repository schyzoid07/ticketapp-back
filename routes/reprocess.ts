import { Router, type Response } from 'express';
import { z } from 'zod';
import { supabase } from '../services/supabase';
import { triageTicket } from '../agents/triageAgent';
import { analyzeContext } from '../agents/contextAgent';
import { suggestResponse } from '../agents/responseAgent';
import { sanitizeTicket, sanitizeTicketArray } from '../services/sanitize';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const ReprocessSchema = z.object({
  ticket_id: z.string().uuid(),
});

router.post('/', requireAuth, requireRole('owner', 'admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = ReprocessSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.issues });
      return;
    }

    const { ticket_id } = parsed.data;
    console.log(`Reprocesando ticket ${ticket_id} con pipeline completo`);

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticket_id)
      .single();

    if (ticketError || !ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' });
      return;
    }

    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      res.status(400).json({ error: 'No se puede reprocesar un ticket resuelto o cerrado' });
      return;
    }

    // Verify the ticket belongs to the user's company
    if (ticket.company_id !== req.user!.company_id) {
      res.status(403).json({ error: 'No tienes permiso para reprocesar este ticket' });
      return;
    }

    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', ticket.company_id)
      .single();

    const enrichedTicket = { ...ticket, company_name: company?.name || null };

    // Triage
    console.log('Ejecutando TriageAgent...');
    let triageResult: Record<string, unknown>;
    let triageTokens = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };
    try {
      const triageResponse = await triageTicket(ticket.title, ticket.description);
      triageResult = triageResponse.result as unknown as Record<string, unknown>;
      triageTokens = triageResponse.tokens;
    } catch (err) {
      console.error('Error en TriageAgent:', err);
      triageResult = {
        category: ticket.category || 'GENERAL_INQUIRY',
        priority: ticket.priority ?? 2,
        tags: ticket.tags || ['pending-manual'],
        justification: 'IA no disponible.',
      };
    }

    // History
    const { data: historyTickets } = await supabase
      .from('tickets')
      .select('*')
      .eq('user_id', ticket.user_id)
      .eq('company_id', ticket.company_id)
      .neq('id', ticket.id)
      .order('created_at', { ascending: false })
      .limit(5);

    // Context
    console.log('Ejecutando ContextAgent...');
    const safeTicket = sanitizeTicket(enrichedTicket as unknown as Record<string, unknown>);
    const safeHistory = sanitizeTicketArray((historyTickets || []) as unknown as Record<string, unknown>[]);
    let contextResult: Record<string, unknown>;
    let contextTokens = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };
    try {
      const contextResponse = await analyzeContext(
        { title: safeTicket?.title ?? '', description: safeTicket?.description ?? '' },
        safeHistory,
      );
      contextResult = contextResponse.result as unknown as Record<string, unknown>;
      contextTokens = contextResponse.tokens;
    } catch (err) {
      console.error('Error en ContextAgent:', err);
      contextResult = {
        is_recurring_issue: false,
        customer_sentiment: 'NEUTRAL',
        historical_summary: 'IA no disponible.',
      };
    }

    // Response
    let suggestedResponse = null;
    let responseTokens = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };
    if (triageResult && (triageResult.priority as number) > 0) {
      console.log('Ejecutando ResponseAgent...');
      try {
        const responseResult = await suggestResponse(
          {
            title: safeTicket?.title ?? ticket.title,
            description: safeTicket?.description ?? ticket.description,
            priority: triageResult.priority as number,
            category: triageResult.category as string,
            company_name: safeTicket?.company_name,
          },
          contextResult,
          ticket.user_name || null,
        );
        suggestedResponse = responseResult.text;
        responseTokens = responseResult.tokens;
      } catch (err) {
        console.error('Error en ResponseAgent:', err);
      }
    }

    // Build update
    const tokenUsage = {
      triage: triageTokens,
      context: contextTokens,
      response: responseTokens,
      total: {
        promptTokens: triageTokens.promptTokens + contextTokens.promptTokens + responseTokens.promptTokens,
        candidatesTokens: triageTokens.candidatesTokens + contextTokens.candidatesTokens + responseTokens.candidatesTokens,
        totalTokens: triageTokens.totalTokens + contextTokens.totalTokens + responseTokens.totalTokens,
      },
    };

    const updateData: Record<string, unknown> = {
      category: triageResult.category,
      priority: triageResult.priority,
      tags: triageResult.tags,
      ai_context: contextResult,
      ai_token_usage: tokenUsage,
      ai_mode: 'complete',
      status: triageResult.priority === 0 ? 'CLOSED' : 'OPEN',
      updated_at: new Date().toISOString(),
    };
    if (suggestedResponse) {
      updateData.ai_suggested_response = suggestedResponse;
    }

    const { error: updateError } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', ticket.id);

    if (updateError) {
      console.error('Error al actualizar ticket:', updateError);
      res.status(500).json({ error: 'Error al actualizar ticket' });
      return;
    }

    console.log(`Ticket ${ticket.id} reprocesado exitosamente`);
    res.json({ success: true, ticketId: ticket.id });
  } catch (error) {
    console.error('Error en reprocess pipeline:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

export default router;
