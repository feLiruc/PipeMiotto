// kafka.js
const { Kafka } = require('kafkajs');
require('dotenv').config();

const kafka = Kafka({
  clientId: 'pipemiotto-webhook',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

const producer = kafka.producer({
  maxInFlightRequests: 1,
  idempotent: true,
  transactionTimeout: 30000
});

const consumer = kafka.consumer({
  groupId: 'webhook-processor',
  sessionTimeout: 30000,
  heartbeatInterval: 3000
});

class KafkaService {
  constructor() {
    this.isProducerConnected = false;
    this.isConsumerConnected = false;
  }

  async connectProducer() {
    if (!this.isProducerConnected) {
      await producer.connect();
      this.isProducerConnected = true;
      console.log('📡 Kafka Producer conectado');
    }
  }

  async connectConsumer() {
    if (!this.isConsumerConnected) {
      await consumer.connect();
      this.isConsumerConnected = true;
      console.log('📡 Kafka Consumer conectado');
    }
  }

  async sendMessage(topic, message) {
    try {
      await this.connectProducer();
      
      const messageKey = `${message.meta?.entity || 'unknown'}-${message.meta?.company_id || 'unknown'}`;
      
      await producer.send({
        topic,
        messages: [{
          key: messageKey,
          value: JSON.stringify(message),
          timestamp: Date.now().toString(),
          headers: {
            'content-type': 'application/json',
            'entity': message.meta?.entity || 'unknown',
            'action': message.meta?.action || 'unknown',
            'company_id': (message.meta?.company_id || 'unknown').toString()
          }
        }]
      });

      console.log(`📤 Mensagem enviada para tópico '${topic}' com key: ${messageKey}`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem para Kafka:', error);
      throw error;
    }
  }

  async subscribeToTopic(topic, messageHandler) {
    try {
      await this.connectConsumer();
      await consumer.subscribe({ topic, fromBeginning: false });
      
      console.log(`🔔 Inscrito no tópico: ${topic}`);
      
      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const messageValue = JSON.parse(message.value.toString());
            const messageKey = message.key?.toString();
            const headers = message.headers || {};
            
            console.log(`📨 Mensagem recebida do tópico '${topic}' - Key: ${messageKey}`);
            
            await messageHandler({
              topic,
              partition,
              key: messageKey,
              value: messageValue,
              headers,
              timestamp: message.timestamp
            });
            
          } catch (error) {
            console.error('❌ Erro ao processar mensagem:', error);
            // Aqui você pode implementar lógica para reenviar para DLQ
            await this.sendToDLQ(topic, message, error);
          }
        }
      });
    } catch (error) {
      console.error('❌ Erro ao conectar consumer:', error);
      throw error;
    }
  }

  async sendToDLQ(originalTopic, message, error) {
    try {
      const dlqTopic = `${originalTopic}-dlq`;
      const dlqMessage = {
        originalTopic,
        originalMessage: JSON.parse(message.value.toString()),
        error: error.message,
        timestamp: new Date().toISOString(),
        retryCount: 0
      };

      await this.sendMessage(dlqTopic, dlqMessage);
      console.log(`💀 Mensagem enviada para DLQ: ${dlqTopic}`);
    } catch (dlqError) {
      console.error('❌ Erro ao enviar para DLQ:', dlqError);
    }
  }

  async disconnect() {
    try {
      if (this.isProducerConnected) {
        await producer.disconnect();
        this.isProducerConnected = false;
        console.log('📡 Kafka Producer desconectado');
      }
      
      if (this.isConsumerConnected) {
        await consumer.disconnect();
        this.isConsumerConnected = false;
        console.log('📡 Kafka Consumer desconectado');
      }
    } catch (error) {
      console.error('❌ Erro ao desconectar Kafka:', error);
    }
  }
}

module.exports = new KafkaService();
