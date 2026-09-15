// Prueba la conexión a MySQL con los datos de config.env. Se ejecuta desde backend/ (usa su mysql2).
const fs = require('fs'), path = require('path');
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '..', 'config.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/); if (m) env[m[1].trim()] = m[2].trim();
}
const mysql = require(path.join(__dirname, '..', 'backend', 'node_modules', 'mysql2', 'promise'));
(async () => {
  try {
    const c = await mysql.createConnection({ host: env.DB_HOST || '127.0.0.1', port: Number(env.DB_PORT || 3306), user: env.DB_USER || 'root', password: env.DB_PASSWORD || '' });
    const [[v]] = await c.query('SELECT VERSION() v');
    await c.query(`CREATE DATABASE IF NOT EXISTS \`${(env.DB_NAME || 'monitor_red').replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await c.end();
    console.log(`OK: MySQL ${v.v} en ${env.DB_HOST}:${env.DB_PORT}. Base de datos '${env.DB_NAME}' lista.`);
  } catch (e) {
    console.error(`ERROR al conectar a MySQL (${e.code || ''}): ${e.message}`);
    if (e.code === 'ER_ACCESS_DENIED_ERROR') console.error('  -> La contraseña de root no es correcta. Es la misma que usa en MySQL Workbench.');
    if (e.code === 'ECONNREFUSED') console.error('  -> MySQL no está iniciado. Abra "Servicios" de Windows e inicie MySQL84 (o el nombre de su instancia).');
    process.exit(1);
  }
})();
