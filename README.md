# TicketSupport API — Backend de Agentes IA

API de orquestación multi-agente para un sistema de soporte técnico SaaS. Procesa tickets automáticamente usando un pipeline de 3 agentes de IA basados en Google Gemini 2.5 Flash.

## Stack

- **Runtime**: Node.js + Express 5 (ESM + TypeScript)
- **IA**: Google Gemini 2.5 Flash via `@google/genai`
- **Base de datos**: Supabase (PostgreSQL) con `@supabase/supabase-js`
- **Validación**: Zod (env, request bodies, output de IA)
- **Arquitectura**: Pipeline secuencial de agentes, evento-driven via webhooks

## Flujo de Datos

```
Cliente → Formulario web → Supabase INSERT → Webhook → API
  → TriageAgent (clasifica categoría, prioridad 0-4, tags)
  → Consulta historial del usuario en Supabase
  → ContextAgent (analiza reincidencia, sentimiento del cliente)
  → ResponseAgent (redacta respuesta sugerida en Markdown)
  → Supabase UPDATE (guarda todo y cambia estado a OPEN/CLOSED)
  → Realtime actualiza el dashboard del agente humano
```

## Setup Local

### Requisitos

- Node.js 20+
- **pnpm** (reemplaza a npm, evitar vulnerabilidades)
- Una cuenta en [Supabase](https://supabase.com) (plan gratuito)
- Una API key de [Google AI Studio](https://aistudio.google.com) (gratuita)

### Pasos

```bash
git clone https://github.com/schyzoid07/ticketapp-back.git
cd ticketapp-back
pnpm install
```

> **Nota**: Este proyecto usa **pnpm** en lugar de npm por seguridad (vulnerabilidades conocidas en npm). Si clonas el repo, asegúrate de tener pnpm instalado (`npm install -g pnpm`).

Crea un archivo `.env` basado en `.env.example`:

```env
PORT=8080
SUPABASE_URL=tu_supabase_url
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
GEMINI_API_KEY=tu_gemini_api_key
WEBHOOK_SECRET=un_secreto_personalizado
CORS_ORIGINS=http://localhost:3001,https://ticketapp-front.vercel.app
```

Ejecuta las migraciones SQL contra tu proyecto Supabase (desde el dashboard SQL Editor):

1. `supabase/migrations/00001_initial_schema.sql` — Tablas companies, users, tickets
2. `supabase/migrations/00002_add_replies.sql` — Sistema de respuestas
3. `supabase/migrations/00003_multi_tenant_setup.sql` — RLS, slugs, email
4. `supabase/migrations/00006_in_progress_status.sql` — Columna assigned_at, estado IN_PROGRESS

Luego inicia el servidor:

```bash
pnpm dev
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Health check |
| POST | `/api/webhooks/process-ticket` | Webhook para Supabase Database Webhook |
| POST | `/api/webhooks/test-process` | Prueba manual del pipeline (requiere body con `ticket`) |

## Agentes IA

### TriageAgent
Clasifica el ticket en categorías (`SOFTWARE_BUG`, `BILLING`, `ACCOUNT_ACCESS`, `FEATURE_REQUEST`, `GENERAL_INQUIRY`), asigna prioridad (0=Fuera de scope, 1=Baja, 2=Media, 3=Alta, 4=Crítica), genera tags y justificación.

### ContextAgent
Consulta el historial del usuario (últimos 5 tickets) y determina si el problema es reincidente, el sentimiento del cliente (FRUSTRATED/NEUTRAL/PATIENT) y un resumen ejecutivo.

### ResponseAgent
Redacta una respuesta sugerida en Markdown usando toda la información disponible. Respeta el idioma del ticket original y rechaza solicitudes fuera del scope de soporte técnico.

## Seguridad

- **Validación Zod**: Variables de entorno, request bodies y outputs de IA validados con esquemas Zod
- **Rate limiting**: IP-based para clientes no autenticados
- **CORS whitelist**: Solo orígenes permitidos via `CORS_ORIGINS`
- **Sanitización**: Datos sensibles eliminados antes de enviar a agentes IA
- **Webhook secret**: Validación de origen en cada webhook

## Limitaciones Free Tier

- **Gemini 2.5 Flash**: 5 requests por minuto, cuota diaria limitada. Latencia variable.
- **Supabase Free**: 500 MB de base de datos, 2 GB de ancho de banda, 50,000 filas, 200 conexiones Realtime concurrentes.
- **Sin email transactional**: No se envía confirmación al cliente ni notificaciones.
- **Render free**: El servicio se duerme tras 15 min de inactividad.
- **Scope safety**: Tickets fuera del contexto de soporte técnico se detectan y cierran automáticamente (prioridad 0).

## Pruebas Realizadas

- Pipeline de agentes probado con tickets de ejemplo (fallo de acceso, facturación duplicada)
- Webhook endpoint validado con evento INSERT simulado
- Scope safety verificado con solicitudes fuera de contexto
- Integración con Supabase (insert, consulta historial, update) funcional
- Rate limiting de Gemini verificado (límite de 5 req/min confirmado)
- Sanitización de datos sensibles verificada
- Validación Zod de variables de entorno y request bodies
