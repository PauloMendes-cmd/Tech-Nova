require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db');

async function main() {
  const nome = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const senha = process.env.ADMIN_PASSWORD;
  if (!nome || !email || !senha || senha.length < 12 || senha === 'defina-uma-senha-forte-aqui') {
    throw new Error('Configure ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD com pelo menos 12 caracteres no .env.');
  }
  const hash = await bcrypt.hash(senha, 12);
  await pool.execute(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, 'admin')
     ON DUPLICATE KEY UPDATE nome = VALUES(nome), senha_hash = VALUES(senha_hash), perfil = 'admin'`,
    [nome, email, hash]
  );
  console.log('Administrador de demonstração configurado:', email);
}

main().catch(erro => { console.error(erro.message); process.exitCode = 1; }).finally(() => pool.end());
