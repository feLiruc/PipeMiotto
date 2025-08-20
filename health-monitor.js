// health-monitor.js
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class HealthMonitor {
  constructor() {
    this.fallbackDir = path.join(__dirname, 'fallback-webhooks');
    this.kafkaService = require('./kafka');
  }

  async checkDatabase() {
    try {
      const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
      });

      const [rows] = await pool.query('SELECT COUNT(*) as count FROM webhook_full_log');
      await pool.end();

      return {
        status: 'OK',
        totalRecords: rows[0].count,
        message: 'Banco de dados funcionando'
      };
    } catch (error) {
      return {
        status: 'ERROR',
        error: error.message,
        message: 'Falha na conexão com banco'
      };
    }
  }

  async checkKafka() {
    try {
      await this.kafkaService.connectProducer();
      
      // Enviar mensagem de teste
      const testMessage = {
        meta: { action: 'health-check', entity: 'system' },
        timestamp: new Date().toISOString(),
        webhookId: `health-check-${Date.now()}`
      };
      
      await this.kafkaService.sendMessage('webhook-events', testMessage);
      
      return {
        status: 'OK',
        message: 'Kafka funcionando'
      };
    } catch (error) {
      return {
        status: 'ERROR',
        error: error.message,
        message: 'Falha na conexão com Kafka'
      };
    }
  }

  checkFallbackFiles() {
    try {
      if (!fs.existsSync(this.fallbackDir)) {
        return {
          status: 'OK',
          pendingFiles: 0,
          message: 'Nenhum arquivo fallback pendente'
        };
      }

      const files = fs.readdirSync(this.fallbackDir)
        .filter(file => file.startsWith('webhook-') && file.endsWith('.json'));

      return {
        status: files.length > 0 ? 'WARNING' : 'OK',
        pendingFiles: files.length,
        message: files.length > 0 ? 
          `${files.length} arquivos fallback pendentes` : 
          'Nenhum arquivo fallback pendente'
      };
    } catch (error) {
      return {
        status: 'ERROR',
        error: error.message,
        message: 'Erro ao verificar arquivos fallback'
      };
    }
  }

  async checkDLQ() {
    try {
      const { Kafka } = require('kafkajs');
      const kafka = new Kafka({
        clientId: 'health-check',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
      });

      const admin = kafka.admin();
      await admin.connect();

      const metadata = await admin.fetchTopicMetadata({ topics: ['webhook-events-dlq'] });
      await admin.disconnect();

      return {
        status: 'OK',
        message: 'DLQ acessível',
        topic: 'webhook-events-dlq'
      };
    } catch (error) {
      return {
        status: 'ERROR',
        error: error.message,
        message: 'Falha ao verificar DLQ'
      };
    }
  }

  async generateReport() {
    console.log('🏥 === RELATÓRIO DE SAÚDE DO SISTEMA ===');
    console.log(`📅 ${new Date().toISOString()}`);
    console.log();

    const checks = {
      database: await this.checkDatabase(),
      kafka: await this.checkKafka(),
      fallbackFiles: this.checkFallbackFiles(),
      dlq: await this.checkDLQ()
    };

    // Exibir resultados
    Object.entries(checks).forEach(([service, result]) => {
      const emoji = result.status === 'OK' ? '✅' : 
                   result.status === 'WARNING' ? '⚠️' : '❌';
      
      console.log(`${emoji} ${service.toUpperCase()}: ${result.message}`);
      
      if (result.totalRecords !== undefined) {
        console.log(`   📊 Total de registros: ${result.totalRecords}`);
      }
      
      if (result.pendingFiles !== undefined && result.pendingFiles > 0) {
        console.log(`   📁 Arquivos pendentes: ${result.pendingFiles}`);
      }
      
      if (result.error) {
        console.log(`   💥 Erro: ${result.error}`);
      }
      
      console.log();
    });

    // Verificar integridade geral
    const hasErrors = Object.values(checks).some(c => c.status === 'ERROR');
    const hasWarnings = Object.values(checks).some(c => c.status === 'WARNING');

    if (hasErrors) {
      console.log('🚨 SISTEMA COM PROBLEMAS CRÍTICOS!');
      console.log('   Ação necessária para garantir 100% de entrega');
    } else if (hasWarnings) {
      console.log('⚠️ SISTEMA COM AVISOS');
      console.log('   Recomenda-se executar reprocessamento');
    } else {
      console.log('🎉 SISTEMA SAUDÁVEL');
      console.log('   Todos os componentes funcionando corretamente');
    }

    console.log();
    console.log('🔧 COMANDOS ÚTEIS:');
    console.log('   node fallback-processor.js  # Reprocessar fallbacks');
    console.log('   ./reset-consumer.sh         # Resetar consumer group');
    console.log('   ./manage.sh logs            # Ver logs em tempo real');

    await this.kafkaService.disconnect();
    return checks;
  }
}

// Se executado diretamente
if (require.main === module) {
  const monitor = new HealthMonitor();
  monitor.generateReport().then(() => process.exit(0));
}

module.exports = HealthMonitor;
