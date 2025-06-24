// db.js
const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
const DB_NAME = process.env.DB_NAME;

let pool;

async function connectToDatabase() {
  pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  console.log(`🔌 Conectado ao banco '${DB_NAME}'`);
}

async function ensureTable(table, columns) {
  const seen = new Set();
  const filtered = columns.filter(([key]) => key !== 'id' && !seen.has(key) && seen.add(key));
  const cols = filtered.map(([key, type]) => `\`${key}\` ${type}`).join(', ');
  const sql = `CREATE TABLE IF NOT EXISTS \`${table}\` (id INT AUTO_INCREMENT PRIMARY KEY, ${cols})`;
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
  const keys = Object.keys(data);
  for (const key of keys) {
    await ensureColumn(table, key);
  }
  await ensureColumn(table, 'empresa');
  await ensureColumn(table, 'event');

  const columns = ['event', ...keys, 'empresa'];
  const placeholders = columns.map(() => '?').join(', ');
  const values = [event, ...keys.map(k => JSON.stringify(data[k])), empresa];

  const sql = `INSERT INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`;
  await pool.query(sql, values);
  console.log(`✅ Evento '${event}' inserido na tabela '${table}'`);
}

async function init() {
  await connectToDatabase();
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
