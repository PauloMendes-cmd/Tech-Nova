(function (raiz) {
  function normalizar(dados) {
    const vazio = { versao: 1, itens: [], cupom: null };
    const origem = Array.isArray(dados) ? { versao: 1, itens: dados } : dados;
    if (!origem || origem.versao !== 1 || !Array.isArray(origem.itens) || origem.itens.length > 100) return vazio;
    const vistos = new Set();
    const itens = origem.itens.filter(item => {
      if (!item || !Number.isSafeInteger(item.codigo) || item.codigo < 1 ||
          !Number.isSafeInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > 10000 || vistos.has(item.codigo)) return false;
      vistos.add(item.codigo);
      return true;
    }).map(item => ({ codigo: item.codigo, quantidade: item.quantidade }));
    const codigo = typeof origem.cupom === 'string' ? origem.cupom.trim().toUpperCase() : '';
    return { versao: 1, itens, cupom: itens.length && codigo === 'TECHNOVA5' ? codigo : null };
  }

  function ler(chave, armazenamento) {
    try {
      return normalizar(JSON.parse((armazenamento || raiz.localStorage).getItem(chave)));
    } catch (_) { return normalizar(null); }
  }

  function salvar(chave, itens, cupom, armazenamento) {
    try {
      (armazenamento || raiz.localStorage).setItem(chave, JSON.stringify(normalizar({ versao: 1, itens, cupom })));
      return true;
    } catch (_) { return false; }
  }

  const api = { ler, salvar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.ArmazenamentoCarrinho = api;
})(globalThis);
