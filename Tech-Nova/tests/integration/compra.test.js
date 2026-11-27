const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

test('API, permissões, confirmação, transações e datas em MySQL', async t => {
  const nomeBanco = `technova_${Date.now()}_${process.pid}_test`;
  const conexao = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true
  });
  let servidor, pool;
  try {
    for (const arquivo of ['schema.sql', 'seed.sql']) {
      const sql = fs.readFileSync(path.join(__dirname, '../../backend/db', arquivo), 'utf8');
      await conexao.query(sql.replaceAll('technova', nomeBanco));
    }
    await conexao.query(`USE ${nomeBanco}`);
    Object.assign(process.env, { DB_NAME: nomeBanco, NODE_ENV: 'test' });
    const app = require('../../backend/server');
    pool = require('../../backend/db');
    servidor = app.listen(0, '127.0.0.1');
    await new Promise(resolve => servidor.once('listening', resolve));
    const base = `http://127.0.0.1:${servidor.address().port}`;
    async function api(rota, { cookie, dados, metodo = dados ? 'POST' : 'GET' } = {}) {
      const r = await fetch(base + rota, {
        method: metodo, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: dados ? JSON.stringify(dados) : undefined
      });
      return { status: r.status, corpo: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0], espera: r.headers.get('retry-after') };
    }
    const senha = 'Teste#Senha2026';
    const hash = await bcrypt.hash(senha, 12);
    for (const [email, perfil] of [['cliente@teste.local', 'cliente'], ['outro@teste.local', 'cliente'], ['admin@teste.local', 'admin']]) {
      await conexao.execute('INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES(?,?,?,?)', ['Pessoa Teste', email, hash, perfil]);
    }
    const login = async email => (await api('/api/auth/login', { dados: { email, senha } })).cookie;
    const cliente = await login('cliente@teste.local');
    const outro = await login('outro@teste.local');
    const admin = await login('admin@teste.local');
    const itens = [{ codigo: 2, quantidade: 1 }];
    async function resumo(cookie = cliente, lista = itens) {
      const r = await api('/api/pedidos/resumo', { cookie, dados: { itens: lista } });
      assert.equal(r.status, 200);
      return { itens: lista, confirmacao: r.corpo.confirmacao };
    }
    await t.test('banco interpreta datas em UTC e responde com o instante correto', async () => {
      const [[r]] = await pool.query('SELECT @@session.time_zone fuso');
      assert.equal(r.fuso, '+00:00');
      const r2 = await api('/api/admin/movimentacoes', { cookie: admin });
      const movimento = r2.corpo.movimentacoes[0];
      const [[sql]] = await conexao.execute('SELECT UNIX_TIMESTAMP(criado_em) epoch FROM movimentacoes_estoque WHERE id=?', [movimento.id]);
      assert.equal(Date.parse(movimento.data) / 1000, Number(sql.epoch));
    });
    await t.test('senha acima de 72 bytes é rejeitada no cadastro e no login', async () => {
      const longa = 'á'.repeat(36) + 'ABC';
      assert.equal((await api('/api/auth/cadastro', { dados: { nome: 'Pessoa Unicode', email: 'unicode@teste.local', senha: longa, confirmarSenha: longa } })).status, 400);
      assert.equal((await api('/api/auth/login', { dados: { email: 'cliente@teste.local', senha: longa } })).status, 400);
    });
    await t.test('catálogo público e permissões 401/403', async () => {
      assert.equal((await api('/api/produtos')).corpo.produtos.length, 6);
      assert.equal((await api('/api/pedidos/resumo', { dados: { itens } })).status, 401);
      assert.equal((await api('/api/admin/produtos', { cookie: cliente })).status, 403);
      const r = await api('/api/auth/cadastro', { dados: { nome: 'Cliente Novo', email: 'novo@teste.local', senha, confirmarSenha: senha, perfil: 'admin' } });
      assert.equal(r.status, 201);
      assert.equal(r.corpo.usuario.perfil, 'cliente');
    });
    await t.test('preço alterado exige novo resumo e não grava pedido parcial', async () => {
      const dados = await resumo();
      await conexao.query('UPDATE produtos SET preco=300 WHERE id=2');
      const r = await api('/api/pedidos', { cookie: cliente, dados });
      assert.equal(r.status, 409);
      assert.equal(r.corpo.codigo, 'RESUMO_ALTERADO');
      const [[contagem]] = await conexao.query('SELECT COUNT(*) n FROM pedidos');
      assert.equal(contagem.n, 0);
      const [[p]] = await conexao.query('SELECT estoque FROM produtos WHERE id=2');
      assert.equal(p.estoque, 20);
    });
    let pedido;
    await t.test('confirmação válida usa valores do banco e preserva histórico', async () => {
      const dados = await resumo();
      const r = await api('/api/pedidos', { cookie: cliente, dados: { ...dados, preco: 0.01, total: 0.01 } });
      assert.equal(r.status, 201);
      assert.equal(r.corpo.total, '300.00');
      pedido = r.corpo.numeroPedido;
      assert.equal((await api('/api/pedidos/' + pedido, { cookie: outro })).status, 403);
      assert.equal((await api('/api/pedidos/' + pedido, { cookie: cliente })).status, 200);
      assert.equal((await api('/api/pedidos/' + pedido, { cookie: admin })).status, 200);
      await conexao.query('UPDATE produtos SET preco=400 WHERE id=2');
      const [[item]] = await conexao.execute('SELECT preco_unitario FROM itens_pedido WHERE pedido_id=?', [pedido]);
      assert.equal(item.preco_unitario, '300.00');
    });
    await t.test('resumo de outro usuário e confirmação ausente são rejeitados', async () => {
      const dados = await resumo();
      assert.equal((await api('/api/pedidos', { cookie: outro, dados })).status, 409);
      assert.equal((await api('/api/pedidos', { cookie: cliente, dados: { itens } })).status, 400);
    });
    await t.test('falha na gravação desfaz pedido, itens, estoque e movimentação', async () => {
      const dados = await resumo();
      const sql = 'SELECT (SELECT COUNT(*) FROM pedidos) pedidos,(SELECT COUNT(*) FROM itens_pedido) itens,(SELECT COUNT(*) FROM movimentacoes_estoque) movimentos,(SELECT estoque FROM produtos WHERE id=2) estoque';
      const [[antes]] = await conexao.query(sql);
      await conexao.query("CREATE TRIGGER falha_teste BEFORE INSERT ON itens_pedido FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='falha induzida pelo teste'");
      try { assert.equal((await api('/api/pedidos', { cookie: cliente, dados })).status, 500); }
      finally { await conexao.query('DROP TRIGGER falha_teste'); }
      const [[depois]] = await conexao.query(sql);
      assert.deepEqual(depois, antes);
    });
    await t.test('duas compras simultâneas da última unidade não geram estoque negativo', async () => {
      await conexao.query('UPDATE produtos SET estoque=1 WHERE id=1');
      const lista = [{ codigo: 1, quantidade: 1 }];
      const [a, b] = await Promise.all([resumo(cliente, lista), resumo(outro, lista)]);
      const r = await Promise.all([api('/api/pedidos', { cookie: cliente, dados: a }), api('/api/pedidos', { cookie: outro, dados: b })]);
      assert.deepEqual(r.map(x => x.status).sort(), [201, 409]);
      const [[p]] = await conexao.query('SELECT estoque FROM produtos WHERE id=1');
      assert.equal(p.estoque, 0);
    });
    await t.test('itens inválidos, cupom inválido e esgotados são rejeitados', async () => {
      for (const lista of [[], [{ codigo: 2, quantidade: -1 }], [{ codigo: 2, quantidade: 1 }, { codigo: 2, quantidade: 1 }]]) {
        assert.equal((await api('/api/pedidos/resumo', { cookie: cliente, dados: { itens: lista } })).status, 400);
      }
      assert.equal((await api('/api/pedidos/resumo', { cookie: cliente, dados: { itens, cupom: 'FALSO' } })).status, 400);
      assert.equal((await api('/api/pedidos/resumo', { cookie: cliente, dados: { itens: [{ codigo: 3, quantidade: 1 }] } })).status, 409);
    });
    await t.test('excesso de tentativas de login retorna 429 com prazo de espera', async () => {
      let ultima;
      for (let i = 0; i < 31; i++) ultima = await api('/api/auth/login', { dados: { email: 'inexistente@teste.local', senha: 'Teste#Incorreta' } });
      assert.equal(ultima.status, 429);
      assert.ok(Number(ultima.espera) > 0);
    });
    await t.test('logout invalida a sessão', async () => {
      assert.equal((await api('/api/auth/logout', { cookie: cliente, metodo: 'POST' })).status, 200);
      assert.equal((await api('/api/pedidos', { cookie: cliente })).status, 401);
    });
  } finally {
    if (servidor) await new Promise(resolve => servidor.close(resolve));
    if (pool) await pool.end();
    await conexao.query(`DROP DATABASE IF EXISTS ${nomeBanco}`);
    await conexao.end();
  }
});
