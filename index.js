// index.js
const express = require('express');
const { init, insertEvent, insertFullLog } = require('./db');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/webhook', async (req, res) => {
  const { event, current, meta } = req.body;

  if (event === 'ping') {
    console.log('📡 Ping recebido');
    return res.status(200).send('pong');
  }

  const expectedToken = process.env.WEBHOOK_TOKEN;
  const receivedToken = req.headers['x-pipedrive-webhook-token'];

  if (expectedToken && receivedToken !== expectedToken) {
    return res.status(403).send('❌ Token inválido');
  }

  if (!event || !current) {
    return res.status(400).send('❌ Dados incompletos');
  }

  try {
    const empresasMap = {
      123456: 'Empresa A',
      789012: 'Empresa B'
    };
    const empresaNome = empresasMap[meta?.company_id] || 'Desconhecida';

    const entity = event.split('.')[1];
    const table = `webhook_${entity}s`;

    await insertFullLog(event, entity, req.body, empresaNome);
    await insertEvent(table, event, current, empresaNome);

    res.send(`✅ Webhook '${event}' inserido em '${table}'`);
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Erro interno');
  }
});

init().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 API ouvindo na porta ${PORT}`);
  });
});
