// stats-dashboard.js
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class StatsDashboard {
  constructor() {
    this.fallbackDir = path.join(__dirname, 'fallback-webhooks');
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }

  async getWebhookStats() {
    try {
      const queries = {
        total: 'SELECT COUNT(*) as count FROM webhook_full_log',
        today: `SELECT COUNT(*) as count FROM webhook_full_log 
                WHERE DATE(created_at) = CURDATE()`,
        last24h: `SELECT COUNT(*) as count FROM webhook_full_log 
                  WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
        byAction: `SELECT 
                    JSON_EXTRACT(webhook_data, '$.meta.action') as action,
                    COUNT(*) as count 
                   FROM webhook_full_log 
                   WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                   GROUP BY action 
                   ORDER BY count DESC 
                   LIMIT 10`,
        hourlyToday: `SELECT 
                       HOUR(created_at) as hour,
                       COUNT(*) as count 
                      FROM webhook_full_log 
                      WHERE DATE(created_at) = CURDATE()
                      GROUP BY HOUR(created_at)
                      ORDER BY hour`,
        successRate: `SELECT 
                       delivery_status,
                       COUNT(*) as count 
                      FROM webhook_full_log 
                      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                      GROUP BY delivery_status`,
        avgProcessingTime: `SELECT 
                             AVG(processing_time_ms) as avg_time,
                             MIN(processing_time_ms) as min_time,
                             MAX(processing_time_ms) as max_time
                            FROM webhook_full_log 
                            WHERE processing_time_ms IS NOT NULL 
                            AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
      };

      const results = {};
      for (const [key, query] of Object.entries(queries)) {
        const [rows] = await this.pool.query(query);
        results[key] = rows;
      }

      return results;
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas:', error.message);
      return null;
    }
  }

  getFallbackStats() {
    try {
      if (!fs.existsSync(this.fallbackDir)) {
        return {
          totalFiles: 0,
          oldestFile: null,
          newestFile: null,
          totalSize: 0
        };
      }

      const files = fs.readdirSync(this.fallbackDir)
        .filter(file => file.startsWith('webhook-') && file.endsWith('.json'))
        .map(file => {
          const filePath = path.join(this.fallbackDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            created: stats.birthtime,
            size: stats.size
          };
        });

      if (files.length === 0) {
        return {
          totalFiles: 0,
          oldestFile: null,
          newestFile: null,
          totalSize: 0
        };
      }

      files.sort((a, b) => a.created - b.created);

      return {
        totalFiles: files.length,
        oldestFile: files[0],
        newestFile: files[files.length - 1],
        totalSize: files.reduce((sum, file) => sum + file.size, 0)
      };
    } catch (error) {
      console.error('❌ Erro ao verificar fallbacks:', error.message);
      return null;
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async generateDashboard() {
    console.log('📊 === DASHBOARD DE ESTATÍSTICAS ===');
    console.log(`📅 ${new Date().toLocaleString('pt-BR')}`);
    console.log();

    // Estatísticas do banco
    const dbStats = await this.getWebhookStats();
    if (!dbStats) {
      console.log('❌ Não foi possível carregar estatísticas do banco');
      return;
    }

    console.log('🗄️  ESTATÍSTICAS DO BANCO DE DADOS');
    console.log(`   📈 Total de webhooks: ${dbStats.total[0]?.count || 0}`);
    console.log(`   📅 Hoje: ${dbStats.today[0]?.count || 0}`);
    console.log(`   🕐 Últimas 24h: ${dbStats.last24h[0]?.count || 0}`);
    console.log();

    // Taxa de sucesso
    if (dbStats.successRate && dbStats.successRate.length > 0) {
      console.log('✅ TAXA DE ENTREGA (24h)');
      let total = 0;
      let successful = 0;
      
      dbStats.successRate.forEach(row => {
        const count = parseInt(row.count);
        total += count;
        if (row.delivery_status === 'delivered') {
          successful += count;
        }
        console.log(`   ${row.delivery_status}: ${count}`);
      });

      const successRate = total > 0 ? ((successful / total) * 100).toFixed(1) : 0;
      console.log(`   🎯 Taxa de sucesso: ${successRate}%`);
      console.log();
    }

    // Tempo de processamento
    if (dbStats.avgProcessingTime && dbStats.avgProcessingTime[0]) {
      const timing = dbStats.avgProcessingTime[0];
      console.log('⏱️  TEMPO DE PROCESSAMENTO (24h)');
      console.log(`   📊 Médio: ${Math.round(timing.avg_time || 0)}ms`);
      console.log(`   ⚡ Mínimo: ${timing.min_time || 0}ms`);
      console.log(`   🐌 Máximo: ${timing.max_time || 0}ms`);
      console.log();
    }

    // Ações mais frequentes
    if (dbStats.byAction && dbStats.byAction.length > 0) {
      console.log('🎬 AÇÕES MAIS FREQUENTES (24h)');
      dbStats.byAction.forEach(row => {
        const action = row.action ? row.action.replace(/"/g, '') : 'unknown';
        console.log(`   ${action}: ${row.count}`);
      });
      console.log();
    }

    // Distribuição por hora
    if (dbStats.hourlyToday && dbStats.hourlyToday.length > 0) {
      console.log('📈 DISTRIBUIÇÃO POR HORA (hoje)');
      const maxCount = Math.max(...dbStats.hourlyToday.map(row => row.count));
      
      dbStats.hourlyToday.forEach(row => {
        const bar = '█'.repeat(Math.ceil((row.count / maxCount) * 20));
        console.log(`   ${String(row.hour).padStart(2, '0')}h: ${bar} (${row.count})`);
      });
      console.log();
    }

    // Estatísticas de fallback
    const fallbackStats = this.getFallbackStats();
    if (fallbackStats) {
      console.log('📁 ARQUIVOS FALLBACK');
      console.log(`   📊 Total: ${fallbackStats.totalFiles}`);
      console.log(`   💾 Tamanho: ${this.formatBytes(fallbackStats.totalSize)}`);
      
      if (fallbackStats.oldestFile) {
        console.log(`   ⏰ Mais antigo: ${fallbackStats.oldestFile.created.toLocaleString('pt-BR')}`);
      }
      
      if (fallbackStats.newestFile) {
        console.log(`   🆕 Mais recente: ${fallbackStats.newestFile.created.toLocaleString('pt-BR')}`);
      }
      console.log();
    }

    // Recomendações
    console.log('💡 RECOMENDAÇÕES');
    
    const totalFallbacks = fallbackStats?.totalFiles || 0;
    const last24h = dbStats.last24h[0]?.count || 0;
    
    if (totalFallbacks > 0) {
      console.log(`   ⚠️  ${totalFallbacks} arquivos fallback pendentes - Execute reprocessamento`);
    }
    
    if (last24h === 0) {
      console.log('   📊 Nenhum webhook nas últimas 24h - Verifique se o sistema está recebendo dados');
    }
    
    const successRate = dbStats.successRate?.find(r => r.delivery_status === 'delivered');
    const totalDeliveries = dbStats.successRate?.reduce((sum, r) => sum + parseInt(r.count), 0) || 0;
    
    if (totalDeliveries > 0 && successRate) {
      const rate = (parseInt(successRate.count) / totalDeliveries) * 100;
      if (rate < 95) {
        console.log(`   🔴 Taxa de sucesso baixa (${rate.toFixed(1)}%) - Investigue falhas`);
      }
    }
    
    if (totalFallbacks === 0 && last24h > 0) {
      console.log('   ✅ Sistema funcionando perfeitamente!');
    }

    console.log();
    console.log('🔧 COMANDOS ÚTEIS:');
    console.log('   node health-monitor.js       # Verificar saúde do sistema');
    console.log('   node fallback-processor.js   # Reprocessar fallbacks');
    console.log('   ./manage.sh status           # Status dos processos');
  }

  async close() {
    await this.pool.end();
  }
}

// Se executado diretamente
if (require.main === module) {
  const dashboard = new StatsDashboard();
  dashboard.generateDashboard()
    .then(() => dashboard.close())
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Erro no dashboard:', error.message);
      process.exit(1);
    });
}

module.exports = StatsDashboard;
