const test = require('node:test');
const assert = require('node:assert/strict');
const { senhaValida, calcularValores } = require('../backend/logic');
const { criarConfirmacao, validarConfirmacao } = require('../backend/checkout');
const armazenamento = require('../js/carrinho-storage');
const { limitarTentativas } = require('../backend/limites');

test('tentativas excessivas retornam 429 e voltam a ser permitidas após a janela', () => {
  let instante = 1000;
  const limite = limitarTentativas(2, 60000, () => instante);
  let espera;
  const resposta = { setHeader: (_, valor) => { espera = valor; } };
  const chamar = ip => { let erro; limite({ ip }, resposta, e => { erro = e; }); return erro; };
  assert.equal(chamar('cliente-a'), undefined);
  assert.equal(chamar('cliente-a'), undefined);
  assert.equal(chamar('cliente-a').status, 429);
  assert.equal(espera, '60');
  assert.equal(chamar('cliente-b'), undefined);
  instante += 60000;
  assert.equal(chamar('cliente-a'), undefined);
});

test('limite da senha considera bytes UTF-8 e mantém o limite ASCII', () => {
  assert.equal(senhaValida('a'.repeat(72)), true);
  assert.equal(senhaValida('a'.repeat(73)), false);
  assert.equal(senhaValida('á'.repeat(36)), true);
  assert.equal(senhaValida('á'.repeat(36) + 'ABC'), false);
  assert.equal(senhaValida('1234567'), false);
  assert.equal(senhaValida(null), false);
  assert.equal(senhaValida('12345678', 12), false);
});

const produtos = [{ id: 1, nome: 'Produto', preco: '150.00', quantidade: 1 }];
const agora = 1800000000000;

test('confirmação aceita somente o resumo emitido para a compra e o usuário', () => {
  const valores = calcularValores(produtos);
  const token = criarConfirmacao(1, produtos, valores, agora);
  assert.doesNotThrow(() => validarConfirmacao(token, 1, produtos, valores, agora));
  assert.throws(() => validarConfirmacao(token, 2, produtos, valores, agora), { status: 409 });
  const alterados = [{ ...produtos[0], preco: '300.00' }];
  assert.throws(() => validarConfirmacao(token, 1, alterados, calcularValores(alterados), agora), { codigo: 'RESUMO_ALTERADO' });
  assert.throws(() => validarConfirmacao(token, 1, produtos, calcularValores(produtos, 'TECHNOVA5'), agora), { status: 409 });
});

test('confirmação expirada, ausente ou adulterada não autoriza compra', () => {
  const valores = calcularValores(produtos);
  const token = criarConfirmacao(1, produtos, valores, agora);
  assert.throws(() => validarConfirmacao(token, 1, produtos, valores, agora + 600000), { codigo: 'RESUMO_EXPIRADO' });
  assert.throws(() => validarConfirmacao(null, 1, produtos, valores, agora), { status: 400 });
  const adulterado = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
  assert.throws(() => validarConfirmacao(adulterado, 1, produtos, valores, agora), { status: 409 });
});

function memoria(conteudo = null) {
  return { getItem: () => conteudo, setItem: (_, valor) => { conteudo = valor; } };
}

test('carrinho preserva itens e cupom ao salvar e recarregar', () => {
  const local = memoria();
  const itens = [{ codigo: 1, quantidade: 2 }];
  assert.equal(armazenamento.salvar('carrinho', itens, 'technova5', local), true);
  assert.deepEqual(armazenamento.ler('carrinho', local), { versao: 1, itens, cupom: 'TECHNOVA5' });
});

test('carrinhos antigos são migrados e itens inválidos são descartados', () => {
  const local = memoria(JSON.stringify([null, { codigo: 1, quantidade: 2 }, { codigo: 1, quantidade: 3 }, { codigo: 2, quantidade: -1 }]));
  assert.deepEqual(armazenamento.ler('carrinho', local), { versao: 1, itens: [{ codigo: 1, quantidade: 2 }], cupom: null });
});

test('JSON inválido, formato incompatível ou armazenamento indisponível não quebram a loja', () => {
  const vazio = { versao: 1, itens: [], cupom: null };
  for (const valor of ['{', '{}', 'null', '42', '{"versao":2,"itens":[]}']) {
    assert.deepEqual(armazenamento.ler('carrinho', memoria(valor)), vazio);
  }
  const bloqueado = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.deepEqual(armazenamento.ler('carrinho', bloqueado), vazio);
  assert.equal(armazenamento.salvar('carrinho', [], null, bloqueado), false);
});
