// index.js
const express = require('express');
const { init } = require('./db');
const kafkaService = require('./kafka');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/webhook', async (req, res) => {
  console.log('🔔 Recebendo webhook...');
  console.log('📦 Dados recebidos:', JSON.stringify(req.body, null, 2));

  const fullData = req.body;
  const { meta } = fullData;

  // Validações básicas
  if (!meta || !meta.action || !meta.entity) {
    console.error('❌ Meta dados inválidos ou ausentes:', meta);
    return res.status(400).send('❌ Meta dados inválidos ou ausentes');
  }

  const action = meta.action;
  const entity = meta.entity;

  console.log(`🧩 Ação: ${action}, Entidade: ${entity}`);

  const empresasMap = {
    13881612: 'Matriz',
    23342970: 'Itapema'
  };

  const empresaNome = empresasMap[meta.company_id] || 'Itapema';
  console.log(`🏢 Empresa identificada: ${empresaNome}`);

  try {
    // Enriquecer dados com informações adicionais
    const enrichedData = {
      ...fullData,
      processedAt: new Date().toISOString(),
      empresa: empresaNome,
      webhookId: `${entity}-${action}-${Date.now()}`
    };

    // Enviar para Kafka ao invés de processar diretamente
    await kafkaService.sendMessage('webhook-events', enrichedData);
    
    console.log(`✅ Webhook '${action}' enviado para fila com sucesso`);
    res.status(202).send(`✅ Webhook '${action}' recebido e enfileirado para processamento.`);
    
  } catch (error) {
    console.error('� Erro ao enviar webhook para fila:', error);
    
    // Fallback: tentar salvar diretamente no banco se Kafka falhar
    try {
      const { insertFullLog } = require('./db');
      await insertFullLog(action, entity, fullData, empresaNome);
      console.log('📝 Fallback: dados salvos diretamente no banco');
      res.status(200).send(`⚠️ Webhook processado via fallback.`);
    } catch (fallbackError) {
      console.error('� Erro no fallback também:', fallbackError);
      res.status(500).send('❌ Erro interno');
    }
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Encerrando aplicação...');
  await kafkaService.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Encerrando aplicação...');
  await kafkaService.disconnect();
  process.exit(0);
});

const args = process.argv.slice(2);
const shouldClean = args.includes('--clean');

init(shouldClean).then(() => {
  console.log('⚙️ Inicialização do banco de dados concluída');
  app.listen(PORT, () => {
    console.log(`🚀 API ouvindo na porta ${PORT}`);
    console.log(`📡 Kafka configurado para: ${process.env.KAFKA_BROKER || 'localhost:9092'}`);
  });
});
