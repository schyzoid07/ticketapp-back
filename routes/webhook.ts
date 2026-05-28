import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { supabase } from '../services/supabase';
import { triageTicket } from '../agents/triageAgent';
import { analyzeContext } from '../agents/contextAgent';
import { suggestResponse } from '../agents/responseAgent';
import { sanitizeTicket, sanitizeTicketArray } from '../services/sanitize';
import { env } from '../services/env';
import { getCompanyPlan, getCompanyMonthlyTokenUsage } from '../services/plan-limiter';
import { checkCompanyRateLimit, getPlanRateLimit } from '../services/rate-limiter';

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
    const aiMode = (ticket.ai_mode as string) || 'minimal';
    console.log(`Procesando ticket ${ticket.id}: "${ticket.title}" [modo: ${aiMode}]`);

    const { data: company } = await supabase
      .from('companies')
      .select('name, plan')
      .eq('id', ticket.company_id as string)
      .single();
    ticket.company_name = company?.name || null;

    // Check plan-based rate limit and token limit
    const companyPlan = (company?.plan as 'basic' | 'complete') || 'basic';
    const rateLimit = getPlanRateLimit(companyPlan);
    const rateCheck = checkCompanyRateLimit(ticket.company_id as string, rateLimit);
    if (!rateCheck.allowed) {
      console.log(`Company ${ticket.company_id} excedió rate limit (${rateLimit}/min). Marcando ticket sin IA.`);
      await supabase
        .from('tickets')
        .update({
          status: 'OPEN',
          category: 'GENERAL_INQUIRY' as string,
          priority: (ticket.priority as number) ?? 2,
          tags: ['rate-limit-exceeded'],
          updated_at: new Date().toISOString(),
        })
        .eq('id', ticket.id as string);
      res.json({ success: true, ticketId: ticket.id, note: 'rate-limit-exceeded' });
      return;
    }

    const tokenUsageCheck = await getCompanyMonthlyTokenUsage(ticket.company_id as string, companyPlan);
    if (tokenUsageCheck.used >= tokenUsageCheck.limit) {
      console.log(`Company ${ticket.company_id} excedió límite de tokens (${tokenUsageCheck.used}/${tokenUsageCheck.limit}). Marcando ticket sin IA.`);
      await supabase
        .from('tickets')
        .update({
          status: 'OPEN',
          category: 'GENERAL_INQUIRY' as string,
          priority: (ticket.priority as number) ?? 2,
          tags: ['token-limit-exceeded'],
          updated_at: new Date().toISOString(),
        })
        .eq('id', ticket.id as string);
      res.json({ success: true, ticketId: ticket.id, note: 'token-limit-exceeded' });
      return;
    }

    console.log('Ejecutando TriageAgent...');
    let triageResult: Record<string, unknown>;
    let triageTokens = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };
    try {
      const triageResponse = await triageTicket(ticket.title as string, ticket.description as string);
      triageResult = triageResponse.result as unknown as Record<string, unknown>;
      triageTokens = triageResponse.tokens;
      console.log('Triage completado:', triageResult);
    } catch (err) {
      console.error('Error en TriageAgent, usando fallback:', err);
      triageResult = {
        category: 'GENERAL_INQUIRY',
        priority: 2,
        tags: ['pending-manual'],
        justification: 'IA no disponible en este momento. Asignación manual requerida.',
      };
    }

    let contextResult: Record<string, unknown> | null = null;
    let contextTokens = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };
    let suggestedResponse = null;
    let responseTokens = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };

    if (aiMode === 'complete') {
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
      try {
        const contextResponse = await analyzeContext(
          { title: safeTicket?.title ?? '', description: safeTicket?.description ?? '' },
          safeHistory,
        );
        contextResult = contextResponse.result as unknown as Record<string, unknown>;
        contextTokens = contextResponse.tokens;
        console.log('Contexto analizado:', contextResult);
      } catch (err) {
        console.error('Error en ContextAgent, usando fallback:', err);
        contextResult = {
          is_recurring_issue: false,
          customer_sentiment: 'NEUTRAL',
          historical_summary: 'IA no disponible en este momento. Revise el historial manualmente.',
        };
      }

      if (triageResult && (triageResult.priority as number) > 0) {
        const userName = (ticket.user_name as string) || null;
        const safeTicket = sanitizeTicket(ticket as Record<string, unknown>);
        console.log('Ejecutando ResponseAgent...');
        try {
          const responseResult = await suggestResponse(
            {
              title: safeTicket?.title ?? ticket.title as string,
              description: safeTicket?.description ?? ticket.description as string,
              priority: triageResult.priority as number,
              category: triageResult.category as string,
              company_name: safeTicket?.company_name,
            },
            contextResult,
            userName,
          );
          suggestedResponse = responseResult.text;
          responseTokens = responseResult.tokens;
        } catch (err) {
          console.error('Error en ResponseAgent, usando fallback:', err);
          suggestedResponse = 'No se pudo generar una sugerencia automática de respuesta. Redacte la respuesta manualmente.';
        }
      } else {
        console.log('Ticket fuera de scope, omitiendo ResponseAgent');
      }
    } else {
      console.log('Modo minimal: omitiendo ContextAgent y ResponseAgent');
    }

    console.log('Actualizando ticket en Supabase...');
    const tokenUsage = contextTokens.totalTokens > 0 || responseTokens.totalTokens > 0
      ? {
          triage: triageTokens,
          context: contextTokens,
          response: responseTokens,
          total: {
            promptTokens: triageTokens.promptTokens + contextTokens.promptTokens + responseTokens.promptTokens,
            candidatesTokens: triageTokens.candidatesTokens + contextTokens.candidatesTokens + responseTokens.candidatesTokens,
            totalTokens: triageTokens.totalTokens + contextTokens.totalTokens + responseTokens.totalTokens,
          },
        }
      : {
          triage: triageTokens,
          total: {
            promptTokens: triageTokens.promptTokens,
            candidatesTokens: triageTokens.candidatesTokens,
            totalTokens: triageTokens.totalTokens,
          },
        };

    const updateData: Record<string, unknown> = {
      category: triageResult.category,
      priority: triageResult.priority,
      tags: triageResult.tags,
      ai_token_usage: tokenUsage,
      ai_mode: aiMode,
      status: triageResult.priority === 0 ? 'CLOSED' : 'OPEN',
      updated_at: new Date().toISOString(),
    };
    if (contextResult) {
      updateData.ai_context = contextResult;
    }
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

    // Fire internal n8n webhook (todos los tickets procesados)
    if (env.INTERNAL_WEBHOOK_URL) {
      const n8nPayload = {
        event: 'ticket.processed',
        company_id: ticket.company_id,
        company_name: company?.name || null,
        ticket: {
          id: ticket.id,
          title: ticket.title,
          user_name: ticket.user_name,
          category: triageResult.category,
          priority: triageResult.priority,
          tags: triageResult.tags,
          status: triageResult.priority === 0 ? 'CLOSED' : 'OPEN',
        },
        token_usage: tokenUsage,
        processed_at: new Date().toISOString(),
      };

      fetch(env.INTERNAL_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(n8nPayload),
      }).catch((err: unknown) => console.error('Error al enviar a n8n:', err));
    }

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

    const triageResponse = await triageTicket(ticket.title, ticket.description);
    const safeTicket = sanitizeTicket(ticket as unknown as Record<string, unknown>);
    const safeHistory = sanitizeTicketArray((ticket.history || []) as Record<string, unknown>[]);
    const contextResponse = await analyzeContext(
      { title: safeTicket?.title ?? '', description: safeTicket?.description ?? '' },
      safeHistory,
    );
    const responseResult = await suggestResponse(
      {
        title: safeTicket?.title ?? ticket.title,
        description: safeTicket?.description ?? ticket.description,
        priority: triageResponse.result.priority,
        category: triageResponse.result.category,
        company_name: safeTicket?.company_name,
      },
      contextResponse.result as unknown as Record<string, unknown>,
      ticket.user_name || null,
    );

    const tokenUsage = {
      triage: triageResponse.tokens,
      context: contextResponse.tokens,
      response: responseResult.tokens,
      total: {
        promptTokens: triageResponse.tokens.promptTokens + contextResponse.tokens.promptTokens + responseResult.tokens.promptTokens,
        candidatesTokens: triageResponse.tokens.candidatesTokens + contextResponse.tokens.candidatesTokens + responseResult.tokens.candidatesTokens,
        totalTokens: triageResponse.tokens.totalTokens + contextResponse.tokens.totalTokens + responseResult.tokens.totalTokens,
      },
    };

    res.json({
      triage: triageResponse.result,
      context: contextResponse.result,
      response: responseResult.text,
      token_usage: tokenUsage,
    });
  } catch (error) {
    console.error('Error en test pipeline:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

export default router;
