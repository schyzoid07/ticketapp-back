import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import webhookRouter from './routes/webhook.js';

const app = express();
const port = process.env.PORT ?? 8080;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'ticket-agent-api' });
});

app.use('/api/webhooks', webhookRouter);

app.listen(port, () => {
  console.log(`API de agentes escuchando en puerto ${port}`);
});
