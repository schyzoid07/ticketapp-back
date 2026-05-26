const SENSITIVE_FIELDS = [
  'email',
  'user_id',
  'company_id',
  'assigned_to',
  'ai_context',
  'ai_suggested_response',
  'resolution',
];

const ALLOWED_FIELDS = [
  'id',
  'title',
  'description',
  'user_name',
  'category',
  'priority',
  'tags',
  'status',
  'company_name',
  'created_at',
  'updated_at',
];

export function sanitizeTicket(ticket) {
  if (!ticket) return null;
  const safe = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in ticket) {
      safe[key] = ticket[key];
    }
  }
  return safe;
}

export function sanitizeTicketArray(tickets) {
  if (!tickets) return [];
  return tickets.map(sanitizeTicket).filter(Boolean);
}
