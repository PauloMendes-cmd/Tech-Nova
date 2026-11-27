const crypto = require('node:crypto');
const { erroHttp, centavos } = require('./logic');

const chave = crypto.randomBytes(32);
const VALIDADE_RESUMO = 10 * 60 * 1000;

function assinatura(usuarioId, produtos, valores, expiraEm) {
  const conteudo = JSON.stringify({
    usuarioId: String(usuarioId),
    itens: produtos.map(p => [p.id, p.quantidade, centavos(p.preco), p.nome]),
    subtotal: valores.subtotal, desconto: valores.desconto, total: valores.total,
    cupom: valores.cupom, expiraEm
  });
  return crypto.createHmac('sha256', chave).update(conteudo).digest('hex');
}

function criarConfirmacao(usuarioId, produtos, valores, agora = Date.now()) {
  const expiraEm = agora + VALIDADE_RESUMO;
  return `${expiraEm}.${assinatura(usuarioId, produtos, valores, expiraEm)}`;
}

function validarConfirmacao(token, usuarioId, produtos, valores, agora = Date.now()) {
  if (typeof token !== 'string' || !/^\d{13}\.[a-f0-9]{64}$/.test(token)) {
    throw erroHttp(400, 'Abra o resumo da compra antes de confirmar o pedido.');
  }
  const [prazo, hash] = token.split('.');
  const expiraEm = Number(prazo);
  if (expiraEm <= agora || expiraEm > agora + VALIDADE_RESUMO) {
    const erro = erroHttp(409, 'O resumo expirou. Revise os valores e confirme novamente.');
    erro.codigo = 'RESUMO_EXPIRADO';
    throw erro;
  }
  const esperado = assinatura(usuarioId, produtos, valores, expiraEm);
  if (!crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(esperado, 'hex'))) {
    const erro = erroHttp(409, 'Os dados da compra mudaram. Revise o novo resumo e confirme novamente.');
    erro.codigo = 'RESUMO_ALTERADO';
    throw erro;
  }
}

module.exports = { criarConfirmacao, validarConfirmacao };
