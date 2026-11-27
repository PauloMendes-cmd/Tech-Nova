const { erroHttp } = require('./logic');

function limitarTentativas(maximo, janelaMs = 15 * 60 * 1000, agora = Date.now) {
  const tentativas = new Map();
  let proximaLimpeza = 0;
  return (req, res, next) => {
    const instante = agora();
    if (instante >= proximaLimpeza) {
      for (const [chave, registro] of tentativas) {
        if (registro.expiraEm <= instante) tentativas.delete(chave);
      }
      proximaLimpeza = instante + janelaMs;
    }
    const chave = req.ip;
    let registro = tentativas.get(chave);
    if (!registro || registro.expiraEm <= instante) {
      registro = { quantidade: 0, expiraEm: instante + janelaMs };
      tentativas.set(chave, registro);
    }
    registro.quantidade++;
    if (registro.quantidade > maximo) {
      res.setHeader('Retry-After', String(Math.ceil((registro.expiraEm - instante) / 1000)));
      return next(erroHttp(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'));
    }
    next();
  };
}

module.exports = { limitarTentativas };
