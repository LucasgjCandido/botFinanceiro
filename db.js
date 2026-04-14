const Database = require('better-sqlite3');
const db = new Database('financas.db');
 
db.exec(`
  CREATE TABLE IF NOT EXISTS gastos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo    TEXT UNIQUE,
    descricao TEXT NOT NULL,
    categoria TEXT NOT NULL,
    valor     REAL NOT NULL,
    data      TEXT DEFAULT (date('now', 'localtime'))
  )
`);
 
// Gera código tipo L001, L002, L003...
function gerarCodigo() {
  const row = db.prepare(`SELECT MAX(id) as ultimo FROM gastos`).get();
  const proximo = (row?.ultimo ?? 0) + 1;
  return 'L' + String(proximo).padStart(3, '0');
}
 
module.exports = { db, gerarCodigo };