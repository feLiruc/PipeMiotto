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

  const { data, previous, meta } = req.body;

  if (!meta || !meta.action || !meta.entity) {
    console.error('❌ Meta dados inválidos ou ausentes:', meta);
    return res.status(400).send('❌ Meta dados inválidos ou ausentes');
  }

  const action = meta.action; // Ex: "change", "add", "delete"
  const entity = meta.entity; // Ex: "activity", "deal", etc.
  const table = `webhook_${entity}`;

  console.log(`🧩 Ação: ${action}, Entidade: ${entity}, Tabela: ${table}`);

  const empresasMap = {
    13881612: 'Matriz',
    789012: 'Empresa B'
  };

  const empresaNome = empresasMap[meta.company_id] || 'Desconhecida';

  console.log(`🏢 Empresa identificada: ${empresaNome}`);

  try {
    // Merge all fields from data, previous, and meta into a single object
    const mergedData = { ...data, ...previous, ...meta };

    // Log the full payload
    await insertFullLog(action, entity, mergedData, empresaNome);
    console.log('📝 Log completo inserido com sucesso');

    if (action === 'delete') {
      console.log('❌ Evento de exclusão detectado');
      await insertEvent(table, action, { ...mergedData, deleted: true }, empresaNome);
      console.log('🗑️ Registro marcado como deletado');
    } else {
      console.log('🆕 Evento de criação/atualização detectado');
      await insertEvent(table, action, mergedData, empresaNome);
      console.log('✅ Registro inserido/atualizado com sucesso');
    }

    res.send(`✅ Webhook '${action}' processado com sucesso.`);
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
