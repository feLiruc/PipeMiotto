// consumer.js
const { insertEvent, insertFullLog, init } = require('./db');
const kafkaService = require('./kafka');
require('dotenv').config();

class WebhookProcessor {
  constructor() {
    this.retryAttempts = new Map();
    this.maxRetries = 3;
  }

  async processWebhookMessage(messageData) {
    const { value: fullData, key, headers } = messageData;
    const { data, previous, meta, empresa, webhookId } = fullData;

    console.log(`🔄 Processando webhook ID: ${webhookId}`);
    console.log(`📋 Entidade: ${meta.entity}, Ação: ${meta.action}, Empresa: ${empresa}`);

    const action = meta.action;
    const entity = meta.entity;
    const table = `webhook_${entity}`;

    try {
      // Log completo sempre
      await insertFullLog(action, entity, fullData, empresa);
      console.log(`📝 Log completo inserido para webhook ID: ${webhookId}`);

      // Processar dados específicos (comentado no seu código original, mas deixo aqui caso queira usar)
      if (data || previous) {
        const mergedData = { ...data, ...previous, ...meta };
        
        if (action === 'delete') {
          console.log(`❌ Evento de exclusão detectado para: ${webhookId}`);
          await insertEvent(table, action, { ...mergedData, deleted: true }, empresa);
          console.log(`🗑️ Registro marcado como deletado: ${webhookId}`);
        } else {
          console.log(`🆕 Evento de criação/atualização detectado: ${webhookId}`);
          await insertEvent(table, action, mergedData, empresa);
          console.log(`✅ Registro inserido/atualizado: ${webhookId}`);
        }
      }

      // Limpar contador de retry se processamento foi bem-sucedido
      this.retryAttempts.delete(webhookId);
      console.log(`✅ Webhook ${webhookId} processado com sucesso`);

    } catch (error) {
      console.error(`💥 Erro ao processar webhook ${webhookId}:`, error);
      
      // Implementar retry logic
      const currentRetries = this.retryAttempts.get(webhookId) || 0;
      
      if (currentRetries < this.maxRetries) {
        this.retryAttempts.set(webhookId, currentRetries + 1);
        console.log(`🔄 Tentativa ${currentRetries + 1}/${this.maxRetries} para webhook ${webhookId}`);
        
        // Reenviar para o final da fila após um delay
        setTimeout(async () => {
          try {
            await kafkaService.sendMessage('webhook-events', fullData);
            console.log(`🔄 Webhook ${webhookId} reenviado para fila`);
          } catch (retryError) {
            console.error(`❌ Erro ao reenviar webhook ${webhookId}:`, retryError);
          }
        }, 5000 * (currentRetries + 1)); // Backoff exponencial
        
      } else {
        console.error(`💀 Webhook ${webhookId} falhou após ${this.maxRetries} tentativas, enviando para DLQ`);
        this.retryAttempts.delete(webhookId);
        
        // Enviar para Dead Letter Queue
        await kafkaService.sendToDLQ('webhook-events', { value: JSON.stringify(fullData) }, error);
      }
      
      throw error; // Re-throw para que o Kafka saiba que houve erro
    }
  }

  async start() {
    console.log('🚀 Iniciando consumer de webhooks...');
    
    try {
      await init(false); // Inicializar banco de dados
      console.log('💾 Banco de dados inicializado');
      
      // Processar mensagens do tópico principal
      await kafkaService.subscribeToTopic('webhook-events', this.processWebhookMessage.bind(this));
      
      console.log('🔔 Consumer iniciado e aguardando mensagens...');
      
    } catch (error) {
      console.error('💥 Erro ao iniciar consumer:', error);
      process.exit(1);
    }
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Encerrando consumer...');
  await kafkaService.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Encerrando consumer...');
  await kafkaService.disconnect();
  process.exit(0);
});

// Iniciar o processor
const processor = new WebhookProcessor();
processor.start().catch(error => {
  console.error('💥 Erro fatal no consumer:', error);
  process.exit(1);
});
