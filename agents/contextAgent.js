import { generateStructuredJSON } from '../services/gemini.js';

const SYSTEM_INSTRUCTION = `Eres un Analista de Contexto de Clientes Histórico. Tu rol no es interactuar con el usuario, sino proveer inteligencia interna al técnico de soporte humano antes de que este redacte su respuesta.
Recibirás el ticket actual junto con un arreglo JSON conteniendo los últimos 3 a 5 tickets cerrados o abiertos de ese mismo usuario dentro de la misma organización.

Debes generar un JSON estructurado que evalúe si el problema es reincidente, el nivel de frustración estimado del cliente (basado en la acumulación de casos sin resolver) y un resumen ejecutivo estricto de máximo 3 líneas. No asumas ni inventes datos que no estén explícitamente registrados en la data provista.`;

const SCHEMA = {
  type: 'object',
  properties: {
    is_recurring_issue: {
      type: 'boolean',
    },
    customer_sentiment: {
      type: 'string',
      enum: ['FRUSTRATED', 'NEUTRAL', 'PATIENT'],
    },
    historical_summary: {
      type: 'string',
    },
  },
  required: ['is_recurring_issue', 'customer_sentiment', 'historical_summary'],
};

export async function analyzeContext(currentTicket, historyTickets) {
  const userMessage = `Ticket actual:\nTítulo: ${currentTicket.title}\nDescripción: ${currentTicket.description}\n\nHistorial de tickets del usuario:\n${JSON.stringify(historyTickets, null, 2)}`;

  return generateStructuredJSON(SYSTEM_INSTRUCTION, userMessage, SCHEMA);
}
