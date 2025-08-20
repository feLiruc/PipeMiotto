// db.js
const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
const DB_NAME = process.env.DB_NAME;

let pool;

async function connectToDatabase() {
  try {
    pool = await mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      acquireTimeout: 60000,
      timeout: 60000,
      reconnect: true
    });
    
    // Testar conexão
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    
    console.log(`🔌 Conectado ao banco '${DB_NAME}'`);
  } catch (error) {
    console.error('❌ Erro ao conectar no banco de dados:', error);
    console.error('🔍 Verifique suas configurações no arquivo .env');
    throw error;
  }
}


async function dropTablesOnce() {
  const tables = ['webhook_activities', 'webhook_deals', 'webhook_organizations', 'webhook_persons', 'webhook_activity', 'webhook_deal', 'webhook_full_log', 'webhook_person', 'webhook_organization'];
  for (const table of tables) {
    try {
      await pool.query(`DROP TABLE IF EXISTS \`${table}\``);
      console.log(`🗑️ Tabela '${table}' deletada com sucesso.`);
    } catch (err) {
      console.error(`❌ Erro ao deletar tabela '${table}':`, err.message);
    }
  }
}


async function ensureTable(table, columns) {
  const seen = new Set();
  const filtered = columns.filter(([key]) => !seen.has(key) && seen.add(key));
  const cols = filtered.map(([key, type]) => `\`${key}\` ${type}`).join(', ');
  
  const sql = `CREATE TABLE IF NOT EXISTS \`${table}\` (auto_id INT AUTO_INCREMENT PRIMARY KEY, ${cols})`;

  await pool.query(sql);
  console.log(`🛠️ Tabela '${table}' verificada/criada.`);
}

async function ensureColumn(table, column) {
  const [rows] = await pool.query(`
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = ? AND COLUMN_NAME = ? AND TABLE_SCHEMA = ?
  `, [table, column, DB_NAME]);

  if (rows.length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` TEXT`);
    console.log(`➕ Coluna '${column}' adicionada na tabela '${table}'`);
  }
}

async function insertFullLog(event, entity, fullPayload, empresa) {
  const sql = `
    INSERT INTO webhook_full_log (event, entity, payload, empresa)
    VALUES (?, ?, ?, ?)
  `;
  await pool.query(sql, [event, entity, JSON.stringify(fullPayload), empresa]);
  console.log(`📝 Evento '${event}' logado na full_log.`);
}

async function insertEvent(table, event, data, empresa) {
  const tableConfig = config.tables[table];
  if (!tableConfig) {
    console.error(`❌ Configuração para a tabela '${table}' não encontrada.`);
    return;
  }

  const allowedColumns = Object.keys(tableConfig.columns);
  const filteredData = Object.keys(data)
    .filter(key => allowedColumns.includes(key))
    .reduce((obj, key) => {
      obj[key] = data[key];
      return obj;
    }, {});

  for (const key of Object.keys(filteredData)) {
    await ensureColumn(table, key);
  }
  await ensureColumn(table, 'empresa');
  await ensureColumn(table, 'event');

  const columns = ['event', ...Object.keys(filteredData), 'empresa'];
  const placeholders = columns.map(() => '?').join(', ');
  const values = [event, ...Object.values(filteredData).map(value => JSON.stringify(value)), empresa];

  const sql = `INSERT INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`;
  await pool.query(sql, values);
  console.log(`✅ Evento '${event}' inserido na tabela '${table}'`);
}

async function init(shouldClean) {
  await connectToDatabase();
  if (shouldClean) {
    await dropTablesOnce();
  }
  for (const [table, def] of Object.entries(config.tables)) {
    const columns = Object.entries(def.columns);
    await ensureTable(table, columns);
  }
  console.log('✅ Inicialização concluída.');
}

module.exports = {
  init,
  insertEvent,
  insertFullLog
};
