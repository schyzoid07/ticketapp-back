import { supabase } from './supabase';
import { env } from './env';

interface AlertConfig {
  email_enabled?: boolean;
  email_recipients?: string[];
  telegram_token?: string;
  telegram_chat_id?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function sendPriorityAlert(ticket: Record<string, unknown>): Promise<void> {
  const companyId = ticket.company_id as string;

  const { data: company } = await supabase
    .from('companies')
    .select('name, alerts')
    .eq('id', companyId)
    .single();

  if (!company) return;

  const alerts = (company.alerts || {}) as AlertConfig;
  if (!alerts.email_enabled && !alerts.telegram_token) return;

  const priority = ticket.priority as number;
  if (priority !== 4) return;

  const title = (ticket.title as string) || 'Sin título';
  const description = (ticket.description as string) || '';
  const userName = (ticket.user_name as string) || 'Cliente';
  const ticketId = ticket.id as string;
  const companyName = (ticket.company_name as string) || company.name;
  const frontendUrl = env.CORS_ORIGINS.split(',')[0]?.trim() || 'http://localhost:3001';
  const ticketUrl = `${frontendUrl}/tickets/${ticketId}`;

  // Email alert
  if (alerts.email_enabled && alerts.email_recipients?.length) {
    const subject = `🚨 Crítico — ${title}`;
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f4; padding: 32px 16px; margin: 0;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center">
<table style="max-width: 480px; width: 100%; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
  <tr>
    <td style="background: linear-gradient(135deg, #dc2626, #b91c1c); padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; font-size: 18px; margin: 0;">🚨 Ticket Crítico</h1>
    </td>
  </tr>
  <tr>
    <td style="padding: 24px;">
      <p style="font-size: 14px; color: #292524; margin: 0 0 16px 0;"><strong>${escapeHtml(companyName)}</strong> ha recibido un ticket de prioridad <strong style="color: #dc2626;">CRÍTICA</strong>.</p>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <p style="font-size: 12px; color: #991b1b; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(title)}</p>
        <p style="font-size: 13px; color: #7f1d1d; margin: 0 0 8px 0;"><strong>Cliente:</strong> ${escapeHtml(userName)}</p>
        <p style="font-size: 13px; color: #7f1d1d; margin: 0; white-space: pre-wrap;">${escapeHtml(description)}</p>
      </div>
      <a href="${escapeHtml(ticketUrl)}" style="display: inline-block; background: linear-gradient(135deg, #dc2626, #b91c1c); color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600;">Ver ticket →</a>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
          to: alerts.email_recipients,
          subject,
          html,
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error(`Resend respondió ${response.status}: ${body}`);
      }
    } catch (err) {
      console.error('Error enviando alerta email:', err);
    }
  }

  // Telegram alert
  if (alerts.telegram_token && alerts.telegram_chat_id) {
    const text = `🚨 <b>Ticket Crítico</b>
<b>Empresa:</b> ${escapeHtml(companyName)}
<b>Cliente:</b> ${escapeHtml(userName)}
<b>Título:</b> ${escapeHtml(title)}
<b>Descripción:</b> ${escapeHtml(description.slice(0, 300))}
<a href="${escapeHtml(ticketUrl)}">Ver ticket</a>`;

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${alerts.telegram_token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: alerts.telegram_chat_id,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        },
      );
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error(`Telegram respondió ${response.status}: ${body}`);
      }
    } catch (err) {
      console.error('Error enviando alerta Telegram:', err);
    }
  }
}
