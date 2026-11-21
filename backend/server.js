require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const { erroHttp, calcularValores, validarItens, centavos, reais } = require('./logic');

const app = express();
const raiz = path.resolve(__dirname, '..');
const DIAS_SESSAO = 7;
const COOKIE = 'technova_session';
const LIMIAR_ESTOQUE = 3;

app.disable('x-powered-by');
app.use(express.json({ limit: '24kb' }));
app.use('/css', express.static(path.join(raiz, 'css')));
app.use('/js', express.static(path.join(raiz, 'js')));
app.use('/images', express.static(path.join(raiz, 'images')));

const rota = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const responderUsuario = usuario => usuario ? {
  id: Number(usuario.id), nome: usuario.nome, email: usuario.email, perfil: usuario.perfil
} : null;
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

function tokenDoCookie(req) {
  const pares = (req.headers.cookie || '').split(';');
  const par = pares.find(item => item.trim().startsWith(COOKIE + '='));
  const token = par?.split('=').slice(1).join('=').trim();
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function cookieSessao(res, token, apagar = false) {
  const itens = [`${COOKIE}=${apagar ? '' : token}`, 'HttpOnly', 'SameSite=Lax', 'Path=/'];
  if (apagar) itens.push('Max-Age=0');
  else itens.push(`Max-Age=${DIAS_SESSAO * 86400}`);
  if (process.env.NODE_ENV === 'production') itens.push('Secure');
  res.setHeader('Set-Cookie', itens.join('; '));
}

async function abrirSessao(res, usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.execute(
    'INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
    [hashToken(token), usuarioId]
  );
  cookieSessao(res, token);
}

const carregarUsuario = rota(async (req, res, next) => {
  req.usuario = null;
  const token = tokenDoCookie(req);
  if (token) {
    const [linhas] = await pool.execute(
      `SELECT u.id, u.nome, u.email, u.perfil FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = ? AND s.expira_em > NOW() LIMIT 1`,
      [hashToken(token)]
    );
    req.usuario = linhas[0] || null;
  }
  next();
});

function exigirLogin(req, res, next) {
  if (!req.usuario) return next(erroHttp(401, 'Faça login para continuar.'));
  next();
}

function exigirAdmin(req, res, next) {
  if (!req.usuario) return next(erroHttp(401, 'Faça login para continuar.'));
  if (req.usuario.perfil !== 'admin') return next(erroHttp(403, 'Acesso restrito ao administrador.'));
  next();
}

function validarProduto(dados, novo = false) {
  dados = dados && typeof dados === 'object' ? dados : {};
  const nome = String(dados.nome || '').trim();
  const categoriaId = Number(dados.categoriaId);
  const preco = Number(dados.preco);
  const imagem = String(dados.imagem || '').trim();
  const estoqueInicial = Number(dados.estoqueInicial ?? 0);
  if (nome.length < 2 || nome.length > 150 || !Number.isSafeInteger(categoriaId) || categoriaId < 1) {
    throw erroHttp(400, 'Nome ou categoria inválidos.');
  }
  if (!Number.isFinite(preco) || preco <= 0 || preco > 99999999 || Math.abs(Math.round(preco * 100) - preco * 100) > 0.000001) {
    throw erroHttp(400, 'Informe um preço válido com até duas casas decimais.');
  }
  const imagemLocal = /^images\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(imagem);
  let imagemRemota = false;
  try { imagemRemota = new URL(imagem).protocol === 'https:'; } catch (_) {}
  if (imagem.length > 500 || (!imagemLocal && !imagemRemota)) {
    throw erroHttp(400, 'Use uma imagem local (images/arquivo.jpg) ou uma URL HTTPS.');
  }
  if (novo && (!Number.isSafeInteger(estoqueInicial) || estoqueInicial < 0 || estoqueInicial > 1000000)) {
    throw erroHttp(400, 'Estoque inicial inválido.');
  }
  return { nome, categoriaId, preco: reais(centavos(preco)), imagem, estoqueInicial };
}

const selectProduto = `SELECT p.id AS codigo, p.nome, p.categoria_id AS categoriaId,
  c.nome AS categoria, p.preco, p.estoque, p.imagem, p.ativo
  FROM produtos p JOIN categorias c ON c.id = p.categoria_id`;

app.get('/api/health', rota(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
}));

app.use('/api', carregarUsuario);

app.get('/api/auth/me', (req, res) => res.json({ usuario: responderUsuario(req.usuario) }));

app.post('/api/auth/cadastro', rota(async (req, res) => {
  const nome = String(req.body?.nome || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const senha = req.body?.senha;
  const confirmarSenha = req.body?.confirmarSenha;
  if (nome.length < 3 || nome.length > 120) throw erroHttp(400, 'Informe seu nome completo.');
  if (nome.split(/\s+/).length < 2) throw erroHttp(400, 'Informe nome e sobrenome.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) throw erroHttp(400, 'E-mail inválido.');
  if (typeof senha !== 'string' || senha.length < 8 || senha.length > 72) throw erroHttp(400, 'Use uma senha de 8 a 72 caracteres.');
  if (senha !== confirmarSenha) throw erroHttp(400, 'A confirmação da senha não confere.');
  const hash = await bcrypt.hash(senha, 12);
  try {
    const [resultado] = await pool.execute(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, 'cliente')`,
      [nome, email, hash]
    );
    await abrirSessao(res, resultado.insertId);
    res.status(201).json({ usuario: { id: resultado.insertId, nome, email, perfil: 'cliente' } });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') throw erroHttp(409, 'Este e-mail já está cadastrado.');
    throw erro;
  }
}));

app.post('/api/auth/login', rota(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const senha = req.body?.senha;
  if (typeof senha !== 'string' || !email) throw erroHttp(400, 'Informe e-mail e senha.');
  const [usuarios] = await pool.execute('SELECT * FROM usuarios WHERE email = ? LIMIT 1', [email]);
  const usuario = usuarios[0];
  if (!usuario || !(await bcrypt.compare(senha, usuario.senha_hash))) {
    throw erroHttp(401, 'E-mail ou senha incorretos.');
  }
  await abrirSessao(res, usuario.id);
  res.json({ usuario: responderUsuario(usuario) });
}));

app.post('/api/auth/logout', rota(async (req, res) => {
  const token = tokenDoCookie(req);
  if (token) await pool.execute('DELETE FROM sessoes WHERE token_hash = ?', [hashToken(token)]);
  cookieSessao(res, '', true);
  res.json({ mensagem: 'Sessão encerrada.' });
}));

app.get('/api/categorias', rota(async (req, res) => {
  const [linhas] = await pool.query('SELECT id, nome FROM categorias ORDER BY id');
  res.json({ categorias: linhas });
}));

app.get('/api/produtos', rota(async (req, res) => {
  const [linhas] = await pool.query(`${selectProduto} WHERE p.ativo = TRUE ORDER BY p.id`);
  res.json({ produtos: linhas, limiarEstoque: LIMIAR_ESTOQUE });
}));

async function consultarPedidos(sql, params) {
  const [pedidos] = await pool.execute(sql, params);
  if (!pedidos.length) return [];
  const ids = pedidos.map(p => p.id);
  const marcadores = ids.map(() => '?').join(', ');
  const [itens] = await pool.query(
    `SELECT pedido_id AS pedidoId, produto_id AS produtoId, nome_produto AS nome,
      quantidade, preco_unitario AS precoUnitario, subtotal
     FROM itens_pedido WHERE pedido_id IN (${marcadores}) ORDER BY id`, ids
  );
  return pedidos.map(pedido => ({
    ...pedido,
    itens: itens.filter(item => String(item.pedidoId) === String(pedido.id))
  }));
}

app.get('/api/pedidos', exigirLogin, rota(async (req, res) => {
  const pedidos = await consultarPedidos(
    `SELECT id, criado_em AS data, subtotal, desconto, total, situacao, cupom
     FROM pedidos WHERE usuario_id = ? ORDER BY criado_em DESC`, [req.usuario.id]
  );
  res.json({ pedidos });
}));

app.get('/api/pedidos/:id', exigirLogin, rota(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw erroHttp(400, 'Pedido inválido.');
  const pedidos = await consultarPedidos(
    `SELECT id, usuario_id AS usuarioId, criado_em AS data, subtotal, desconto, total, situacao, cupom
     FROM pedidos WHERE id = ?`, [id]
  );
  if (!pedidos.length) throw erroHttp(404, 'Pedido não encontrado.');
  const { usuarioId, ...pedido } = pedidos[0];
  if (Number(usuarioId) !== Number(req.usuario.id) && req.usuario.perfil !== 'admin') {
    throw erroHttp(403, 'Você não tem permissão para consultar este pedido.');
  }
  res.json({ pedido });
}));

app.post('/api/pedidos', exigirLogin, rota(async (req, res) => {
  const itens = validarItens(req.body?.itens);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const produtos = [];
    for (const item of itens) {
      const [linhas] = await conn.execute(
        'SELECT id, nome, preco, estoque, ativo FROM produtos WHERE id = ? FOR UPDATE',
        [item.codigo]
      );
      const produto = linhas[0];
      if (!produto || !produto.ativo) throw erroHttp(409, `O produto ${item.codigo} não está disponível.`);
      if (produto.estoque < item.quantidade) throw erroHttp(409, `Estoque insuficiente para ${produto.nome}. Disponível: ${produto.estoque}.`);
      produtos.push({ ...produto, quantidade: item.quantidade });
    }
    const valores = calcularValores(produtos, req.body?.cupom);
    const [resultado] = await conn.execute(
      `INSERT INTO pedidos (usuario_id, subtotal, desconto, total, cupom) VALUES (?, ?, ?, ?, ?)`,
      [req.usuario.id, valores.subtotal, valores.desconto, valores.total, valores.cupom]
    );
    for (const produto of produtos) {
      const saldo = produto.estoque - produto.quantidade;
      await conn.execute(
        `INSERT INTO itens_pedido (pedido_id, produto_id, nome_produto, quantidade, preco_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [resultado.insertId, produto.id, produto.nome, produto.quantidade, produto.preco,
          reais(centavos(produto.preco) * produto.quantidade)]
      );
      await conn.execute('UPDATE produtos SET estoque = ? WHERE id = ?', [saldo, produto.id]);
      await conn.execute(
        `INSERT INTO movimentacoes_estoque (produto_id, usuario_id, pedido_id, tipo, quantidade, saldo_resultante, motivo)
         VALUES (?, ?, ?, 'SAIDA', ?, ?, ?)`,
        [produto.id, req.usuario.id, resultado.insertId, -produto.quantidade, saldo, 'Venda registrada no pedido']
      );
    }
    await conn.commit();
    res.status(201).json({ mensagem: 'Pedido confirmado.', numeroPedido: resultado.insertId, ...valores });
  } catch (erro) {
    await conn.rollback();
    throw erro;
  } finally {
    conn.release();
  }
}));

app.get('/api/admin/resumo', exigirAdmin, rota(async (req, res) => {
  const [[dados]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM produtos WHERE ativo = TRUE) AS produtos,
      (SELECT COUNT(*) FROM produtos WHERE ativo = TRUE AND estoque > 0 AND estoque <= ${LIMIAR_ESTOQUE}) AS estoqueBaixo,
      (SELECT COUNT(*) FROM produtos WHERE ativo = TRUE AND estoque = 0) AS esgotados,
      (SELECT COUNT(*) FROM pedidos) AS pedidos`
  );
  res.json({ resumo: { ...dados, limiarEstoque: LIMIAR_ESTOQUE } });
}));

app.get('/api/admin/produtos', exigirAdmin, rota(async (req, res) => {
  const [produtos] = await pool.query(`${selectProduto} ORDER BY p.id`);
  res.json({ produtos });
}));

app.post('/api/admin/produtos', exigirAdmin, rota(async (req, res) => {
  const dados = validarProduto(req.body, true);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [resultado] = await conn.execute(
      'INSERT INTO produtos (nome, categoria_id, preco, estoque, imagem) VALUES (?, ?, ?, ?, ?)',
      [dados.nome, dados.categoriaId, dados.preco, dados.estoqueInicial, dados.imagem]
    );
    if (dados.estoqueInicial > 0) {
      await conn.execute(
        `INSERT INTO movimentacoes_estoque (produto_id, usuario_id, tipo, quantidade, saldo_resultante, motivo)
         VALUES (?, ?, 'ENTRADA', ?, ?, 'Estoque inicial do cadastro')`,
        [resultado.insertId, req.usuario.id, dados.estoqueInicial, dados.estoqueInicial]
      );
    }
    await conn.commit();
    res.status(201).json({ mensagem: 'Produto cadastrado.', codigo: resultado.insertId });
  } catch (erro) {
    await conn.rollback();
    throw erro;
  } finally {
    conn.release();
  }
}));

app.put('/api/admin/produtos/:id', exigirAdmin, rota(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw erroHttp(400, 'Produto inválido.');
  const dados = validarProduto(req.body);
  const ativo = req.body?.ativo === false ? 0 : 1;
  const [resultado] = await pool.execute(
    `UPDATE produtos SET nome = ?, categoria_id = ?, preco = ?, imagem = ?, ativo = ? WHERE id = ?`,
    [dados.nome, dados.categoriaId, dados.preco, dados.imagem, ativo, id]
  );
  if (!resultado.affectedRows) throw erroHttp(404, 'Produto não encontrado.');
  res.json({ mensagem: 'Produto atualizado.' });
}));

app.delete('/api/admin/produtos/:id', exigirAdmin, rota(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw erroHttp(400, 'Produto inválido.');
  const [resultado] = await pool.execute('UPDATE produtos SET ativo = FALSE WHERE id = ?', [id]);
  if (!resultado.affectedRows) throw erroHttp(404, 'Produto não encontrado.');
  res.json({ mensagem: 'Produto desativado sem apagar o histórico.' });
}));

app.post('/api/admin/estoque', exigirAdmin, rota(async (req, res) => {
  const id = Number(req.body?.produtoId);
  const tipo = String(req.body?.tipo || '').toUpperCase();
  const quantidade = Number(req.body?.quantidade);
  const novoEstoque = Number(req.body?.novoEstoque);
  const motivo = String(req.body?.motivo || '').trim();
  if (!Number.isSafeInteger(id) || id < 1 || !['ENTRADA', 'SAIDA', 'AJUSTE'].includes(tipo)) {
    throw erroHttp(400, 'Produto ou tipo de movimentação inválido.');
  }
  if (motivo.length < 3 || motivo.length > 255) throw erroHttp(400, 'Informe o motivo da movimentação.');
  if (tipo !== 'AJUSTE' && (!Number.isSafeInteger(quantidade) || quantidade <= 0 || quantidade > 1000000)) {
    throw erroHttp(400, 'Informe uma quantidade positiva válida.');
  }
  if (tipo === 'AJUSTE' && (req.body?.novoEstoque == null || req.body?.novoEstoque === '' || !Number.isSafeInteger(novoEstoque) || novoEstoque < 0 || novoEstoque > 1000000)) {
    throw erroHttp(400, 'Informe o novo saldo de estoque.');
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [linhas] = await conn.execute('SELECT id, estoque FROM produtos WHERE id = ? FOR UPDATE', [id]);
    if (!linhas.length) throw erroHttp(404, 'Produto não encontrado.');
    const anterior = linhas[0].estoque;
    const saldo = tipo === 'AJUSTE' ? novoEstoque : anterior + (tipo === 'ENTRADA' ? quantidade : -quantidade);
    if (saldo < 0 || saldo > 1000000) throw erroHttp(409, 'A movimentação resultaria em estoque inválido.');
    const diferenca = saldo - anterior;
    if (diferenca === 0) throw erroHttp(400, 'Não houve alteração no estoque.');
    await conn.execute('UPDATE produtos SET estoque = ? WHERE id = ?', [saldo, id]);
    await conn.execute(
      `INSERT INTO movimentacoes_estoque (produto_id, usuario_id, tipo, quantidade, saldo_resultante, motivo)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, req.usuario.id, tipo, diferenca, saldo, motivo]
    );
    await conn.commit();
    res.status(201).json({ mensagem: 'Estoque atualizado.', saldo });
  } catch (erro) {
    await conn.rollback();
    throw erro;
  } finally {
    conn.release();
  }
}));

app.get('/api/admin/movimentacoes', exigirAdmin, rota(async (req, res) => {
  const [movimentacoes] = await pool.query(
    `SELECT m.id, m.criado_em AS data, p.nome AS produto, m.tipo, m.quantidade,
       m.saldo_resultante AS saldo, m.motivo, u.nome AS responsavel, m.pedido_id AS pedidoId
     FROM movimentacoes_estoque m
     JOIN produtos p ON p.id = m.produto_id
     LEFT JOIN usuarios u ON u.id = m.usuario_id
     ORDER BY m.id DESC LIMIT 200`
  );
  res.json({ movimentacoes });
}));

app.get('/api/admin/pedidos', exigirAdmin, rota(async (req, res) => {
  const pedidos = await consultarPedidos(
    `SELECT p.id, p.criado_em AS data, p.subtotal, p.desconto, p.total, p.situacao,
       p.cupom, u.nome AS cliente, u.email
     FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id ORDER BY p.id DESC`, []
  );
  res.json({ pedidos });
}));

app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(raiz, 'index.html')));
app.get('/pedidos.html', (req, res) => res.sendFile(path.join(raiz, 'pedidos.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(raiz, 'admin.html')));
app.use('/api', (req, res, next) => next(erroHttp(404, 'Rota da API não encontrada.')));
app.use((erro, req, res, next) => {
  if (res.headersSent) return next(erro);
  if (erro.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ erro: 'Categoria ou referência inexistente.' });
  if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Já existe um registro com estes dados.' });
  if (erro.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
  if (erro.status) return res.status(erro.status).json({ erro: erro.message });
  console.error('Erro interno:', erro);
  res.status(500).json({ erro: 'Falha interna. Tente novamente.' });
});

if (require.main === module) {
  const porta = Number(process.env.PORT || 3000);
  pool.query('SELECT 1').then(() => {
    app.listen(porta, () => console.log(`TechNova em http://localhost:${porta}`));
  }).catch(erro => {
    console.error('Não foi possível conectar ao MySQL:', erro.message);
    process.exitCode = 1;
    pool.end();
  });
}

module.exports = app;
