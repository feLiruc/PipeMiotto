// debug-system.js
const { init, insertFullLog } = require('./db');
const kafkaService = require('./kafka');
require('dotenv').config();

async function debugSystem() {
  console.log('🔍 === DEBUG DO SISTEMA ===');
  
  try {
    // 1. Testar conexão com banco
    console.log('1. 🔌 Testando conexão com banco...');
    await init(false);
    console.log('✅ Banco OK');
    
    // 2. Testar inserção no banco
    console.log('2. 💾 Testando inserção no banco...');
    await insertFullLog('test', 'debug', { teste: 'debug' }, 'Teste');
    console.log('✅ Inserção OK');
    
    // 3. Testar conexão com Kafka
    console.log('3. 📡 Testando conexão com Kafka...');
    await kafkaService.connectProducer();
    console.log('✅ Kafka Producer OK');
    
    await kafkaService.connectConsumer();
    console.log('✅ Kafka Consumer OK');
    
    // 4. Enviar mensagem de teste
    console.log('4. 📤 Enviando mensagem de teste...');
    const testMessage = {
      data: { test_id: 999 },
      meta: {
        action: 'debug',
        entity: 'test',
        company_id: 13881612
      },
      processedAt: new Date().toISOString(),
      empresa: 'Debug',
      webhookId: `debug-${Date.now()}`
    };
    
    await kafkaService.sendMessage('webhook-events', testMessage);
    console.log('✅ Mensagem enviada');
    
    console.log('🎉 Todos os testes passaram!');
    console.log('🔍 Se o consumer não processar, o problema está no consumer.js');
    
  } catch (error) {
    console.error('❌ Erro no debug:', error);
  }
  
  await kafkaService.disconnect();
  process.exit(0);
}

debugSystem();
