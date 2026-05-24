import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { triageTicket } from '../agents/triageAgent.js';
import { analyzeContext } from '../agents/contextAgent.js';
import { suggestResponse } from '../agents/responseAgent.js';

const router = Router();

router.post('/process-ticket', async (req, res) => {
  try {
    const secret = req.headers['x-webhook-secret'];
    if (secret !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const { type, table, record } = req.body;

    if (type !== 'INSERT' || table !== 'tickets') {
      return res.status(400).json({ error: 'Evento no soportado' });
    }

    const ticket = record;
    console.log(`Procesando ticket ${ticket.id}: "${ticket.title}"`);

    // Paso 1: TriageAgent
    console.log('Ejecutando TriageAgent...');
    const triageResult = await triageTicket(ticket.title, ticket.description);
    console.log('Triage completado:', triageResult);

    // Paso 2: Consultar historial del usuario
    console.log('Consultando historial del usuario...');
    const { data: historyTickets, error: historyError } = await supabase
      .from('tickets')
      .select('*')
      .eq('user_id', ticket.user_id)
      .eq('company_id', ticket.company_id)
      .neq('id', ticket.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (historyError) {
      console.error('Error al consultar historial:', historyError);
    }

    // Paso 3: ContextAgent
    console.log('Ejecutando ContextAgent...');
    const contextResult = await analyzeContext(ticket, historyTickets || []);
    console.log('Contexto analizado:', contextResult);

    // Paso 4: ResponseAgent
    const userName = ticket.user_name || null;
    console.log('Ejecutando ResponseAgent...');
    const suggestedResponse = await suggestResponse(ticket, contextResult, userName);

    // Paso 5: Actualizar ticket en Supabase
    console.log('Actualizando ticket en Supabase...');
    const { error: updateError } = await supabase
      .from('tickets')
      .update({
        category: triageResult.category,
        priority: triageResult.priority,
        tags: triageResult.tags,
        ai_context: contextResult,
        ai_suggested_response: suggestedResponse,
        status: 'OPEN',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticket.id);

    if (updateError) {
      console.error('Error al actualizar ticket:', updateError);
      return res.status(500).json({ error: 'Error al actualizar ticket' });
    }

    console.log(`Ticket ${ticket.id} procesado exitosamente`);
    res.json({ success: true, ticketId: ticket.id });
  } catch (error) {
    console.error('Error en pipeline de agentes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint de prueba para disparar el pipeline manualmente
router.post('/test-process', async (req, res) => {
  try {
    const { ticket } = req.body;
    if (!ticket) {
      return res.status(400).json({ error: 'Se requiere un ticket en el body' });
    }

    const triageResult = await triageTicket(ticket.title, ticket.description);
    const contextResult = await analyzeContext(ticket, ticket.history || []);
    const suggestedResponse = await suggestResponse(ticket, contextResult, ticket.user_name);

    res.json({
      triage: triageResult,
      context: contextResult,
      response: suggestedResponse,
    });
  } catch (error) {
    console.error('Error en test pipeline:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
