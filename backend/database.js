require('dotenv').config();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'pixelvault.db');
let db = null;

async function initDB() {
  if (db) return db;
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now'))
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS image_history (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    original_filename TEXT NOT NULL,
    encrypted_filename TEXT,
    method TEXT NOT NULL,
    params TEXT,
    operation TEXT NOT NULL,
    file_size INTEGER,
    dimensions TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );`);

  _saveDB();
  console.log('✅ Database initialized');
  return db;
}

function _saveDB() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) { const row = stmt.getAsObject(); stmt.free(); return row; }
  stmt.free();
  return null;
}

function run(sql, params = []) {
  db.run(sql, params);
  // FIX: get last insert ID immediately after run(), before _saveDB()
  const idRow = get('SELECT last_insert_rowid() as id');
  const lastId = idRow ? idRow.id : null;
  _saveDB();
  return lastId;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

module.exports = { initDB, run, get, all };
