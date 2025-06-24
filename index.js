// index.js
const express = require('express');
const { init, insertEvent, insertFullLog } = require('./db');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/webhook', async (req, res) => {

  console.log('🔔 Recebendo webhook...');
  console.log('📦 Dados recebidos:', JSON.stringify(req.body, null, 2));
  
  const { event, current, meta } = req.body;

  if (event === 'ping') {
    console.log('📡 Ping recebido');
    return res.status(200).send('pong');
  }

  const expectedToken = process.env.WEBHOOK_TOKEN;
  const receivedToken = req.headers['x-pipedrive-webhook-token'];

  console.log('🔗 Tratamento do webhook...');
  console.log(`🧾 Evento recebido: ${event}`);
  console.log(`🔐 Token recebido: ${receivedToken}`);
  console.log(`🔍 Token esperado: ${expectedToken}`);

  try {
    const action = event.split('.')[0]; // Ex: "create", "change", "delete"
    const entity = event.split('.')[1]; // Ex: "deal", "activity", etc.
    const table = `webhook_${entity}s`;

    console.log(`🧩 Ação: ${action}, Entidade: ${entity}, Tabela: ${table}`);

    const empresasMap = {
      13881612: 'Matriz',
      789012: 'Empresa B'
    };

    const empresaNome = empresasMap[meta?.company_id] || 'Desconhecida';

    console.log(`🏢 Empresa identificada: ${empresaNome}`);
    console.log('📦 Dados recebidos:', JSON.stringify(req.body, null, 2));

    // Log the full payload
    await insertFullLog(event, entity, req.body, empresaNome);
    console.log('📝 Log completo inserido com sucesso');

    if (action === 'delete') {
      console.log('❌ Evento de exclusão detectado');
      await insertEvent(table, event, { ...current, deleted: true }, empresaNome);
      console.log('🗑️ Registro marcado como deletado');
    } else {
      console.log('🆕 Evento de criação/atualização detectado');
      await insertEvent(table, event, current, empresaNome);
      console.log('✅ Registro inserido/atualizado com sucesso');
    }

    res.send(`✅ Webhook '${event}' processado com sucesso.`);
  } catch (err) {
    console.error('🔥 Erro ao processar webhook:', err);
    res.status(500).send('❌ Erro interno');
  }
});

init().then(() => {
  console.log('⚙️ Inicialização do banco de dados concluída');
  app.listen(PORT, () => {
    console.log(`🚀 API ouvindo na porta ${PORT}`);
  });
});
