function erroHttp(status, mensagem) {
  const erro = new Error(mensagem);
  erro.status = status;
  return erro;
}

function centavos(valor) {
  return Math.round(Number(valor) * 100);
}

function reais(valorEmCentavos) {
  return (valorEmCentavos / 100).toFixed(2);
}

function calcularValores(itens, cupom = null) {
  let subtotalCentavos = 0;
  for (const item of itens) {
    subtotalCentavos += centavos(item.preco) * item.quantidade;
  }
  const codigo = typeof cupom === 'string' ? cupom.trim().toUpperCase() : '';
  if (codigo && codigo !== 'TECHNOVA5') {
    throw erroHttp(400, 'Cupom inválido.');
  }
  const percentual = (subtotalCentavos >= 300000 ? 10 : 0) + (codigo === 'TECHNOVA5' ? 5 : 0);
  const descontoCentavos = Math.round(subtotalCentavos * percentual / 100);
  return {
    subtotal: reais(subtotalCentavos),
    desconto: reais(descontoCentavos),
    total: reais(subtotalCentavos - descontoCentavos),
    cupom: codigo || null
  };
}

function validarItens(itens) {
  if (!Array.isArray(itens) || itens.length === 0 || itens.length > 100) {
    throw erroHttp(400, 'O pedido precisa ter ao menos um produto válido.');
  }
  const vistos = new Set();
  return itens.map(item => {
    const codigo = Number(item?.codigo);
    const quantidade = Number(item?.quantidade);
    if (!Number.isSafeInteger(codigo) || codigo <= 0 || !Number.isSafeInteger(quantidade) || quantidade <= 0 || quantidade > 10000 || vistos.has(codigo)) {
      throw erroHttp(400, 'Itens ou quantidades inválidos no carrinho.');
    }
    vistos.add(codigo);
    return { codigo, quantidade };
  }).sort((a, b) => a.codigo - b.codigo);
}

module.exports = { erroHttp, centavos, reais, calcularValores, validarItens };
