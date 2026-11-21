require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db');

async function salvarUsuario(nome, email, senha, perfil) {
  if (!nome || !email || !senha || senha.length < 8) {
    throw new Error('Configure nome, e-mail e senha (mínimo de 8 caracteres) das contas de demonstração no .env.');
  }
  const hash = await bcrypt.hash(senha, 12);
  await pool.execute(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE nome = VALUES(nome), senha_hash = VALUES(senha_hash), perfil = VALUES(perfil)`,
    [nome, email.trim().toLowerCase(), hash, perfil]
  );
  console.log(`Conta ${perfil} configurada:`, email.trim().toLowerCase());
}

async function main() {
  await salvarUsuario(process.env.ADMIN_NAME, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, 'admin');
  await salvarUsuario(process.env.CLIENTE_NAME, process.env.CLIENTE_EMAIL, process.env.CLIENTE_PASSWORD, 'cliente');
}

main().catch(erro => { console.error(erro.message); process.exitCode = 1; }).finally(() => pool.end());
