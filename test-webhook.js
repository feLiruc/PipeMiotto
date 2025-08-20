// test-webhook.js - Script para testar o sistema completo
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const WEBHOOK_URL = 'http://localhost:3000/webhook';

// Dados de teste simulating different webhook scenarios
const testWebhooks = [
  {
    name: 'Deal Created',
    data: {
      meta: {
        action: 'added',
        entity: 'deal',
        company_id: 13881612,
        timestamp: new Date().toISOString()
      },
      current: {
        id: 12345,
        title: 'Negócio de Teste',
        value: 5000,
        currency: 'BRL',
        status: 'open',
        user_id: 123,
        stage_id: 1
      }
    }
  },
  {
    name: 'Person Updated',
    data: {
      meta: {
        action: 'updated',
        entity: 'person',
        company_id: 23342970,
        timestamp: new Date().toISOString()
      },
      current: {
        id: 67890,
        name: 'João Silva',
        email: 'joao@teste.com',
        phone: '11999999999',
        organization_id: 111
      },
      previous: {
        id: 67890,
        name: 'João da Silva',
        email: 'joao@teste.com',
        phone: '11888888888',
        organization_id: 111
      }
    }
  },
  {
    name: 'Activity Added',
    data: {
      meta: {
        action: 'added',
        entity: 'activity',
        company_id: 13881612,
        timestamp: new Date().toISOString()
      },
      current: {
        id: 98765,
        subject: 'Ligação de Follow-up',
        type: 'call',
        due_date: '2024-12-20',
        deal_id: 12345,
        person_id: 67890,
        done: false
      }
    }
  }
];

class WebhookTester {
  constructor() {
    this.results = [];
  }

  async testWebhookEndpoint(webhook) {
    const startTime = Date.now();
    console.log(`📤 Enviando webhook: ${webhook.name}`);
    
    try {
      const response = await axios.post(WEBHOOK_URL, webhook.data, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      const endTime = Date.now();
      const result = {
        name: webhook.name,
        status: 'success',
        httpStatus: response.status,
        responseTime: endTime - startTime,
        responseData: response.data,
        timestamp: new Date().toISOString()
      };

      console.log(`✅ ${webhook.name}: ${response.status} em ${result.responseTime}ms`);
      if (response.data.webhookId) {
        console.log(`   📋 Webhook ID: ${response.data.webhookId}`);
        console.log(`   🚀 Método: ${response.data.deliveryMethod}`);
      }

      this.results.push(result);
      return result;
    } catch (error) {
      const endTime = Date.now();
      const result = {
        name: webhook.name,
        status: 'error',
        httpStatus: error.response?.status || 0,
        responseTime: endTime - startTime,
        error: error.message,
        responseData: error.response?.data,
        timestamp: new Date().toISOString()
      };

      console.log(`❌ ${webhook.name}: ${error.message}`);
      this.results.push(result);
      return result;
    }
  }

  async checkHealth() {
    console.log('🏥 Verificando saúde do sistema...');
    try {
      const response = await axios.get('http://localhost:3000/health', { timeout: 5000 });
      console.log(`✅ Health Check: ${response.status}`);
      console.log(`   Status geral: ${response.data.status}`);
      console.log(`   Kafka: ${response.data.services.kafka}`);
      console.log(`   Database: ${response.data.services.database}`);
      console.log(`   Filesystem: ${response.data.services.filesystem}`);
      return response.data;
    } catch (error) {
      console.log(`❌ Health Check falhou: ${error.message}`);
      return null;
    }
  }

  async getStats() {
    console.log('📊 Verificando estatísticas...');
    try {
      const response = await axios.get('http://localhost:3000/stats', { timeout: 5000 });
      console.log(`✅ Stats: ${response.status}`);
      console.log(`   Arquivos fallback pendentes: ${response.data.pendingFallbackFiles}`);
      console.log(`   Uptime: ${Math.round(response.data.uptime)}s`);
      console.log(`   Modo emergência: ${response.data.emergencyMode ? 'SIM' : 'NÃO'}`);
      return response.data;
    } catch (error) {
      console.log(`❌ Stats falhou: ${error.message}`);
      return null;
    }
  }

  async checkFallbackFiles() {
    const fallbackDir = path.join(__dirname, 'fallback-webhooks');
    try {
      const files = await fs.readdir(fallbackDir);
      const webhookFiles = files.filter(file => file.startsWith('webhook-') && file.endsWith('.json'));
      
      console.log(`📁 Arquivos fallback encontrados: ${webhookFiles.length}`);
      
      if (webhookFiles.length > 0) {
        console.log('   Arquivos:');
        for (const file of webhookFiles.slice(0, 5)) { // Mostrar apenas os primeiros 5
          console.log(`   - ${file}`);
        }
        if (webhookFiles.length > 5) {
          console.log(`   ... e mais ${webhookFiles.length - 5} arquivos`);
        }
      }
      
      return webhookFiles;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📁 Pasta fallback-webhooks não existe (isso é normal se não houver falhas)');
        return [];
      }
      console.log(`❌ Erro ao verificar fallbacks: ${error.message}`);
      return [];
    }
  }

  async runLoadTest(count = 10, delay = 100) {
    console.log(`🚀 Executando teste de carga: ${count} webhooks com delay de ${delay}ms`);
    
    const promises = [];
    for (let i = 0; i < count; i++) {
      const webhook = {
        name: `Load Test ${i + 1}`,
        data: {
          meta: {
            action: 'added',
            entity: 'test',
            company_id: 13881612,
            timestamp: new Date().toISOString(),
            testIndex: i + 1
          },
          current: {
            id: 1000 + i,
            title: `Item de Teste ${i + 1}`,
            value: Math.floor(Math.random() * 10000)
          }
        }
      };

      // Esperar delay antes de enviar
      await new Promise(resolve => setTimeout(resolve, delay));
      promises.push(this.testWebhookEndpoint(webhook));
    }

    const results = await Promise.all(promises);
    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;
    
    console.log(`📈 Resultado do teste de carga:`);
    console.log(`   ✅ Sucessos: ${successful}/${count} (${(successful/count*100).toFixed(1)}%)`);
    console.log(`   ❌ Falhas: ${failed}/${count} (${(failed/count*100).toFixed(1)}%)`);
    
    return results;
  }

  async generateReport() {
    const reportData = {
      timestamp: new Date().toISOString(),
      totalTests: this.results.length,
      successful: this.results.filter(r => r.status === 'success').length,
      failed: this.results.filter(r => r.status === 'error').length,
      averageResponseTime: this.results.reduce((sum, r) => sum + r.responseTime, 0) / this.results.length,
      results: this.results
    };

    const reportPath = path.join(__dirname, `webhook-test-report-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
    
    console.log(`📄 Relatório salvo em: ${reportPath}`);
    return reportData;
  }

  printSummary() {
    console.log('\n📊 === RESUMO DOS TESTES ===');
    console.log(`   Total de testes: ${this.results.length}`);
    console.log(`   ✅ Sucessos: ${this.results.filter(r => r.status === 'success').length}`);
    console.log(`   ❌ Falhas: ${this.results.filter(r => r.status === 'error').length}`);
    
    if (this.results.length > 0) {
      const avgTime = this.results.reduce((sum, r) => sum + r.responseTime, 0) / this.results.length;
      console.log(`   ⏱️ Tempo médio: ${Math.round(avgTime)}ms`);
    }
  }
}

// Função principal
async function main() {
  const tester = new WebhookTester();

  console.log('🧪 === TESTE COMPLETO DO SISTEMA WEBHOOK ===');
  console.log(`🕐 Iniciado em: ${new Date().toLocaleString('pt-BR')}`);
  console.log();

  // 1. Verificar se a API está rodando
  const health = await tester.checkHealth();
  if (!health) {
    console.log('❌ API não está respondendo. Certifique-se de que está rodando com:');
    console.log('   ./manage.sh start');
    process.exit(1);
  }
  console.log();

  // 2. Obter estatísticas iniciais
  await tester.getStats();
  console.log();

  // 3. Verificar arquivos fallback antes dos testes
  console.log('📁 Estado inicial dos fallbacks:');
  await tester.checkFallbackFiles();
  console.log();

  // 4. Executar testes básicos
  console.log('🎯 Executando testes básicos...');
  for (const webhook of testWebhooks) {
    await tester.testWebhookEndpoint(webhook);
    await new Promise(resolve => setTimeout(resolve, 200)); // Pequena pausa entre testes
  }
  console.log();

  // 5. Teste de carga opcional
  const args = process.argv.slice(2);
  if (args.includes('--load-test')) {
    const count = parseInt(args[args.indexOf('--load-test') + 1]) || 10;
    await tester.runLoadTest(count, 50);
    console.log();
  }

  // 6. Verificar arquivos fallback após os testes
  console.log('📁 Estado final dos fallbacks:');
  await tester.checkFallbackFiles();
  console.log();

  // 7. Verificar saúde final
  console.log('🏥 Verificação final:');
  await tester.checkHealth();
  console.log();

  // 8. Estatísticas finais
  await tester.getStats();
  console.log();

  // 9. Gerar relatório
  tester.printSummary();
  await tester.generateReport();

  console.log();
  console.log('✅ Testes concluídos!');
  console.log('💡 Comandos úteis:');
  console.log('   ./manage.sh health    # Verificar saúde detalhada');
  console.log('   ./manage.sh stats     # Dashboard de estatísticas');
  console.log('   ./manage.sh logs      # Ver logs em tempo real');
}

// Verificar argumentos
if (process.argv.includes('--help')) {
  console.log('📖 Testador de Webhooks');
  console.log('');
  console.log('Uso:');
  console.log('  node test-webhook.js                    # Testes básicos');
  console.log('  node test-webhook.js --load-test 50     # Teste de carga com 50 webhooks');
  console.log('  node test-webhook.js --help             # Esta ajuda');
  console.log('');
  process.exit(0);
}

// Executar testes
main().catch(error => {
  console.error('💥 Erro durante os testes:', error.message);
  process.exit(1);
});
