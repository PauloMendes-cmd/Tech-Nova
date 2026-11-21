const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularValores, validarItens, centavos } = require('../backend/logic');

test('compra abaixo de R$ 3.000 não recebe desconto automático', () => {
  assert.deepEqual(calcularValores([{preco:'250.00', quantidade:2}]), {
    subtotal:'500.00', desconto:'0.00', total:'500.00', cupom:null
  });
});

test('compra de R$ 3.000 recebe 10% de desconto', () => {
  const total = calcularValores([{preco:'3000.00', quantidade:1}]);
  assert.equal(total.desconto, '300.00');
  assert.equal(total.total, '2700.00');
});

test('cupom válido acumula 5 pontos percentuais com promoção automática', () => {
  const total = calcularValores([{preco:'4500.00', quantidade:1}], 'technova5');
  assert.equal(total.desconto, '675.00');
  assert.equal(total.total, '3825.00');
  assert.equal(total.cupom, 'TECHNOVA5');
});

test('cupom válido isolado concede 5%', () => {
  const total = calcularValores([{preco:'100.00', quantidade:1}], 'TECHNOVA5');
  assert.equal(total.total, '95.00');
});

test('cupom inválido é rejeitado no servidor', () => {
  assert.throws(() => calcularValores([{preco:'100.00', quantidade:1}], 'FAKE'), {status:400});
});

test('itens vazios são rejeitados', () => {
  assert.throws(() => validarItens([]), {status:400});
});

test('itens com quantidade negativa ou fracionária são rejeitados', () => {
  assert.throws(() => validarItens([{codigo:1, quantidade:-2}]), {status:400});
  assert.throws(() => validarItens([{codigo:1, quantidade:2.3}]), {status:400});
});

test('repetição do mesmo produto é rejeitada', () => {
  assert.throws(() => validarItens([{codigo:1, quantidade:1},{codigo:1, quantidade:2}]), {status:400});
});

test('itens válidos são ordenados por código para reduzir risco de deadlock', () => {
  assert.deepEqual(validarItens([{codigo:5, quantidade:2},{codigo:1, quantidade:1}]),
    [{codigo:1, quantidade:1},{codigo:5, quantidade:2}]);
});

test('preços decimais são convertidos para centavos', () => {
  assert.equal(centavos('29.99'), 2999);
});
