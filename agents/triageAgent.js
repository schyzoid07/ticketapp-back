import { generateStructuredJSON } from '../services/gemini.js';

const SYSTEM_INSTRUCTION = `Eres un Agente de Triaje experto en soporte técnico de nivel empresarial dentro de una plataforma SaaS. Tu única tarea es analizar el ticket entrante de un usuario y clasificarlo de forma fría, objetiva y estrictamente precisa.

Debes devolver obligatoriamente un objeto JSON que se ajuste al esquema proporcionado, sin marcas de texto ni explicaciones adicionales fuera del JSON.

Reglas de Negocio para Prioridad:
- Prioridad 4 (Crítica): El sistema principal de la empresa está completamente caído, se detectan pérdidas financieras activas en curso o existe un bloqueo total de las credenciales de administración.
- Prioridad 3 (Alta): Una funcionalidad clave del software no responde, afectando la operación diaria, pero existen flujos de trabajo alternativos temporales.
- Prioridad 2 (Media): Consultas generales de uso, errores menores de interfaz (UI), fallos cosméticos o solicitudes de asistencia no urgentes.
- Prioridad 1 (Baja): Sugerencias de nuevas características (feature requests), comentarios, feedback general o felicitaciones.
- Prioridad 0 (Fuera de Scope - NO es soporte técnico): Esta es la prioridad más baja y se asigna EXCLUSIVAMENTE cuando el ticket NO guarda relación alguna con soporte técnico de la plataforma. Ejemplos: "escribe un programa en Python", "haz mi tarea universitaria", "recomiéndame una película", "explícame teoría de la relatividad". En estos casos siempre asignas categoría GENERAL_INQUIRY y prioridad 0.`;

const SCHEMA = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      enum: ['SOFTWARE_BUG', 'BILLING', 'ACCOUNT_ACCESS', 'FEATURE_REQUEST', 'GENERAL_INQUIRY'],
    },
    priority: {
      type: 'integer',
      minimum: 0,
      maximum: 4,
    },
    justification: {
      type: 'string',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['category', 'priority', 'justification', 'tags'],
};

export async function triageTicket(title, description) {
  const userMessage = `Analiza el siguiente ticket de soporte:\n\nTítulo: ${title}\n\nDescripción: ${description}`;

  return generateStructuredJSON(SYSTEM_INSTRUCTION, userMessage, SCHEMA);
}
