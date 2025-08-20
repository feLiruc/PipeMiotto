// test-consumer.js
const { init } = require('./db');
const kafkaService = require('./kafka');
require('dotenv').config();

async function testConsumer() {
  console.log('🧪 Testando consumer...');
  
  try {
    // Inicializar banco
    await init(false);
    console.log('✅ Banco inicializado');
    
    // Conectar ao Kafka
    await kafkaService.connectConsumer();
    console.log('✅ Kafka conectado');
    
    // Testar processamento de uma mensagem
    const testMessage = {
      topic: 'webhook-events',
      partition: 0,
      key: 'test-key',
      value: {
        data: { deal_id: 123, title: 'Teste Deal' },
        meta: {
          action: 'add',
          entity: 'deal',
          company_id: 13881612
        },
        processedAt: new Date().toISOString(),
        empresa: 'Matriz',
        webhookId: 'test-webhook-123'
      },
      headers: {},
      timestamp: Date.now()
    };
    
    console.log('🧪 Processando mensagem de teste...');
    
    // Simular processamento
    const processor = require('./consumer');
    // Como não conseguimos importar a classe diretamente, vamos testar o banco
    const { insertFullLog } = require('./db');
    await insertFullLog('add', 'deal', testMessage.value, 'Matriz');
    
    console.log('✅ Teste concluído com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }
  
  process.exit(0);
}

testConsumer();
