// index.js - Webhook API com garantia 100% de entrega
const express = require('express');
const { init } = require('./db');
const kafkaService = require('./kafka');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Verificar se está em modo emergência
const isEmergencyMode = process.argv.includes('--emergency-mode');

if (isEmergencyMode) {
  console.log('🆘 MODO EMERGÊNCIA ATIVADO - Webhooks serão salvos apenas em arquivos');
}

app.post('/webhook', async (req, res) => {
  const startTime = Date.now();
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

  // Enriquecer dados com informações adicionais
  const enrichedData = {
    ...fullData,
    processedAt: new Date().toISOString(),
    empresa: empresaNome,
    webhookId: `${entity}-${action}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    receivedAt: new Date().toISOString(),
    processingStartTime: startTime
  };

  // SISTEMA DE GARANTIA 100%: Múltiplas tentativas de entrega
  let delivered = false;
  let lastError = null;
  let deliveryMethod = null;

  // Em modo emergência, vai direto para arquivo
  if (isEmergencyMode) {
    try {
      await saveToFallbackFile(enrichedData);
      delivered = true;
      deliveryMethod = 'emergency-file';
      console.log('🆘 Modo emergência: webhook salvo em arquivo');
    } catch (error) {
      lastError = error;
      console.error('💥 Falha crítica no modo emergência:', error.message);
    }
  } else {
    // Tentativa 1: Kafka (método preferido)
    try {
      await kafkaService.sendMessage('webhook-events', enrichedData);
      console.log(`✅ Webhook '${action}' enviado para Kafka com sucesso`);
      delivered = true;
      deliveryMethod = 'kafka';
    } catch (kafkaError) {
      console.error('⚠️ Kafka falhou, tentando alternativas:', kafkaError.message);
      lastError = kafkaError;
    }

    // Tentativa 2: Salvar direto no banco (fallback primário)
    if (!delivered) {
      try {
        const { insertFullLog } = require('./db');
        const processingTime = Date.now() - startTime;
        await insertFullLog(action, entity, enrichedData, empresaNome, 'direct-db', processingTime);
        console.log('📝 Fallback primário: dados salvos diretamente no banco');
        delivered = true;
        deliveryMethod = 'direct-db';
      } catch (dbError) {
        console.error('⚠️ Banco direto falhou, usando fallback final:', dbError.message);
        lastError = dbError;
      }
    }

    // Tentativa 3: Arquivo local (fallback final)
    if (!delivered) {
      try {
        await saveToFallbackFile(enrichedData);
        console.log(`💾 Fallback final: webhook salvo em arquivo: ${enrichedData.webhookId}`);
        delivered = true;
        deliveryMethod = 'fallback-file';
      } catch (fileError) {
        console.error('💥 Todos os fallbacks falharam:', fileError.message);
        lastError = fileError;
      }
    }
  }

  // Calcular tempo de processamento
  const processingTime = Date.now() - startTime;

  // Responder baseado no resultado
  if (delivered) {
    const response = {
      status: 'accepted',
      webhookId: enrichedData.webhookId,
      deliveryMethod: deliveryMethod,
      processingTime: processingTime,
      message: `Webhook '${action}' recebido e garantido para processamento`
    };

    console.log(`✅ Webhook processado com sucesso via ${deliveryMethod} em ${processingTime}ms`);
    res.status(202).json(response);
  } else {
    console.error(`💀 FALHA CRÍTICA: Webhook ${enrichedData.webhookId} não pôde ser salvo em lugar nenhum!`);
    
    const errorResponse = {
      status: 'error',
      webhookId: enrichedData.webhookId,
      error: lastError?.message || 'Falha desconhecida',
      processingTime: processingTime,
      message: 'Erro crítico: webhook não pôde ser processado'
    };

    res.status(500).json(errorResponse);
  }
});

// Função auxiliar para salvar em arquivo fallback
async function saveToFallbackFile(data) {
  const fs = require('fs').promises;
  const path = require('path');
  const fallbackDir = path.join(__dirname, 'fallback-webhooks');
  
  // Criar diretório se não existir
  try {
    await fs.access(fallbackDir);
  } catch {
    await fs.mkdir(fallbackDir, { recursive: true });
  }
  
  const filename = `webhook-${data.webhookId}.json`;
  const filepath = path.join(fallbackDir, filename);
  
  const fileData = {
    ...data,
    savedToFileAt: new Date().toISOString(),
    fallbackReason: 'kafka-and-db-failed'
  };
  
  await fs.writeFile(filepath, JSON.stringify(fileData, null, 2));
}

// Endpoint de health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    emergencyMode: isEmergencyMode,
    services: {}
  };

  // Verificar Kafka (se não estiver em modo emergência)
  if (!isEmergencyMode) {
    try {
      // Teste simples de conectividade
      await kafkaService.connectProducer();
      health.services.kafka = 'ok';
    } catch (error) {
      health.services.kafka = 'error';
      health.status = 'degraded';
    }

    // Verificar banco
    try {
      const { testConnection } = require('./db');
      await testConnection();
      health.services.database = 'ok';
    } catch (error) {
      health.services.database = 'error';
      health.status = 'degraded';
    }
  } else {
    health.services.kafka = 'disabled-emergency';
    health.services.database = 'disabled-emergency';
  }

  // Verificar sistema de arquivos
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const testDir = path.join(__dirname, 'fallback-webhooks');
    await fs.access(testDir).catch(() => fs.mkdir(testDir, { recursive: true }));
    health.services.filesystem = 'ok';
  } catch (error) {
    health.services.filesystem = 'error';
    health.status = 'error';
  }

  const statusCode = health.status === 'ok' ? 200 : 
                    health.status === 'degraded' ? 206 : 500;

  res.status(statusCode).json(health);
});

// Endpoint para estatísticas rápidas
app.get('/stats', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const fallbackDir = path.join(__dirname, 'fallback-webhooks');
    
    let fallbackCount = 0;
    try {
      const files = await fs.readdir(fallbackDir);
      fallbackCount = files.filter(file => file.startsWith('webhook-') && file.endsWith('.json')).length;
    } catch {
      // Diretório não existe ainda
    }

    const stats = {
      timestamp: new Date().toISOString(),
      emergencyMode: isEmergencyMode,
      pendingFallbackFiles: fallbackCount,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`🔄 Recebido sinal ${signal}, encerrando aplicação...`);
  
  if (!isEmergencyMode) {
    try {
      await kafkaService.disconnect();
      console.log('✅ Kafka desconectado');
    } catch (error) {
      console.error('⚠️ Erro ao desconectar Kafka:', error.message);
    }
  }
  
  console.log('👋 Aplicação encerrada graciosamente');
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('💥 Erro não capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Promise rejeitada não tratada:', reason);
  console.error('   Promise:', promise);
});

// Inicialização
const args = process.argv.slice(2);
const shouldClean = args.includes('--clean');

if (isEmergencyMode) {
  console.log('🆘 Iniciando em modo emergência - apenas arquivos fallback');
  app.listen(PORT, () => {
    console.log(`🚀 API em modo emergência ouvindo na porta ${PORT}`);
    console.log(`📁 Fallbacks serão salvos em: ${__dirname}/fallback-webhooks/`);
  });
} else {
  init(shouldClean).then(() => {
    console.log('⚙️ Inicialização do banco de dados concluída');
    app.listen(PORT, () => {
      console.log(`🚀 API ouvindo na porta ${PORT}`);
      console.log(`📡 Kafka configurado para: ${process.env.KAFKA_BROKER || 'localhost:9092'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`📊 Stats: http://localhost:${PORT}/stats`);
      console.log(`💡 Para modo emergência use: --emergency-mode`);
    });
  }).catch(error => {
    console.error('💥 Erro na inicialização:', error);
    process.exit(1);
  });
}
