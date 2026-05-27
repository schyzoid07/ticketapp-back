import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import webhookRouter from './routes/webhook';
import reprocessRouter from './routes/reprocess';
import { env } from './services/env';

const app = express();
const port = env.PORT;

const allowedOrigins = env.CORS_ORIGINS.split(',').map(s => s.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origen no permitido: ${origin}`));
    }
  },
}));

app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un minuto.' },
});

app.use('/api/', apiLimiter);

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'ticket-agent-api' });
});

app.use('/api/webhooks', webhookRouter);
app.use('/api/tickets/reprocess', reprocessRouter);

app.listen(port, () => {
  console.log(`API de agentes escuchando en puerto ${port}`);
});
