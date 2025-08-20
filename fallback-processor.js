// fallback-processor.js
const { insertFullLog, init } = require('./db');
const kafkaService = require('./kafka');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class FallbackProcessor {
  constructor() {
    this.fallbackDir = path.join(__dirname, 'fallback-webhooks');
    this.processedDir = path.join(__dirname, 'fallback-webhooks', 'processed');
    this.failedDir = path.join(__dirname, 'fallback-webhooks', 'failed');
  }

  async init() {
    // Garantir que diretórios existem
    [this.fallbackDir, this.processedDir, this.failedDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    await init(false);
    console.log('💾 Fallback Processor inicializado');
  }

  async processFallbackFiles() {
    console.log('🔄 Iniciando processamento de arquivos fallback...');

    const files = fs.readdirSync(this.fallbackDir)
      .filter(file => file.startsWith('webhook-') && file.endsWith('.json'));

    if (files.length === 0) {
      console.log('✅ Nenhum arquivo fallback para processar');
      return;
    }

    console.log(`📁 Encontrados ${files.length} arquivos fallback para processar`);

    for (const file of files) {
      await this.processFile(file);
    }
  }

  async processFile(filename) {
    const filePath = path.join(this.fallbackDir, filename);
    
    try {
      console.log(`🔄 Processando arquivo: ${filename}`);
      
      const content = fs.readFileSync(filePath, 'utf8');
      const webhookData = JSON.parse(content);
      
      const { meta, empresa } = webhookData;
      
      // Tentar processar novamente
      let processed = false;
      
      // Tentativa 1: Kafka
      try {
        await kafkaService.sendMessage('webhook-events', webhookData);
        console.log(`✅ ${filename}: Enviado para Kafka com sucesso`);
        processed = true;
      } catch (kafkaError) {
        console.log(`⚠️ ${filename}: Kafka falhou, tentando banco direto`);
        
        // Tentativa 2: Banco direto
        try {
          await insertFullLog(meta.action, meta.entity, webhookData, empresa);
          console.log(`✅ ${filename}: Salvo no banco com sucesso`);
          processed = true;
        } catch (dbError) {
          console.error(`❌ ${filename}: Falhou no banco também:`, dbError.message);
        }
      }
      
      // Mover arquivo baseado no resultado
      if (processed) {
        const newPath = path.join(this.processedDir, filename);
        fs.renameSync(filePath, newPath);
        console.log(`📦 ${filename}: Movido para pasta 'processed'`);
      } else {
        const newPath = path.join(this.failedDir, filename);
        fs.renameSync(filePath, newPath);
        console.error(`💀 ${filename}: Movido para pasta 'failed'`);
      }
      
    } catch (error) {
      console.error(`💥 Erro ao processar ${filename}:`, error.message);
      
      // Mover para failed se houver erro de parsing
      const newPath = path.join(this.failedDir, filename);
      fs.renameSync(filePath, newPath);
    }
  }

  async processDLQ() {
    console.log('🔄 Processando mensagens da DLQ...');
    
    try {
      await kafkaService.connectConsumer();
      
      // Criar consumer temporário para DLQ
      const { Kafka } = require('kafkajs');
      const kafka = new Kafka({
        clientId: 'dlq-processor',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
      });
      
      const dlqConsumer = kafka.consumer({
        groupId: 'dlq-processor-' + Date.now(),
        sessionTimeout: 30000
      });
      
      await dlqConsumer.connect();
      await dlqConsumer.subscribe({ topic: 'webhook-events-dlq', fromBeginning: true });
      
      let processedCount = 0;
      let reprocessedCount = 0;
      
      await dlqConsumer.run({
        eachMessage: async ({ message }) => {
          try {
            const dlqData = JSON.parse(message.value.toString());
            const originalMessage = dlqData.originalMessage;
            
            console.log(`🔄 Reprocessando DLQ: ${originalMessage.webhookId}`);
            
            // Tentar reprocessar
            try {
              await insertFullLog(
                originalMessage.meta.action,
                originalMessage.meta.entity,
                originalMessage,
                originalMessage.empresa
              );
              
              console.log(`✅ DLQ reprocessada: ${originalMessage.webhookId}`);
              reprocessedCount++;
            } catch (reprocessError) {
              console.error(`❌ Falha ao reprocessar DLQ: ${originalMessage.webhookId}`, reprocessError.message);
            }
            
            processedCount++;
          } catch (parseError) {
            console.error('❌ Erro ao processar mensagem DLQ:', parseError.message);
          }
        }
      });
      
      // Aguardar um tempo para processar mensagens
      setTimeout(async () => {
        await dlqConsumer.disconnect();
        console.log(`✅ DLQ processada: ${reprocessedCount}/${processedCount} mensagens reprocessadas`);
      }, 10000);
      
    } catch (error) {
      console.error('💥 Erro ao processar DLQ:', error);
    }
  }

  async start() {
    console.log('🚀 Iniciando Fallback Processor...');
    
    try {
      await this.init();
      
      // Processar arquivos fallback
      await this.processFallbackFiles();
      
      // Processar DLQ
      await this.processDLQ();
      
      console.log('✅ Processamento de fallback concluído');
      
    } catch (error) {
      console.error('💥 Erro no Fallback Processor:', error);
    } finally {
      await kafkaService.disconnect();
      process.exit(0);
    }
  }
}

// Se executado diretamente
if (require.main === module) {
  const processor = new FallbackProcessor();
  processor.start();
}

module.exports = FallbackProcessor;
