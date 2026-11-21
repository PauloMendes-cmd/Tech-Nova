const $ = seletor => document.querySelector(seletor);
const moeda = valor => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(valor));
const seguro = valor => String(valor ?? '').replace(/[&<>"']/g, caractere => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[caractere]);

async function api(url, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(url, {credentials:'same-origin', headers:{'Content-Type':'application/json'}, ...opcoes});
  } catch (erro) {
    throw new Error('Não foi possível conectar ao servidor.');
  }
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível carregar os pedidos.');
  return dados;
}

function renderizarPedidos(pedidos) {
  if (!pedidos.length) {
    $('#pedidos-lista').innerHTML = '<div class="cartao-pedido">Você ainda não realizou nenhuma compra. <a class="link-topo" href="index.html">Conhecer produtos</a></div>';
    return;
  }
  $('#pedidos-lista').innerHTML = pedidos.map(pedido => `
    <article class="cartao-pedido">
      <div class="cabecalho-pedido"><div><h2>Pedido #${seguro(pedido.id)}</h2><span>${new Date(pedido.data).toLocaleString('pt-BR')}</span></div><span class="status">${seguro(pedido.situacao)}</span></div>
      <div class="itens-pedido">${pedido.itens.map(item => `
        <div class="item-pedido-linha"><span>${Number(item.quantidade)}x ${seguro(item.nome)} — ${moeda(item.precoUnitario)} un.</span><span>${moeda(item.subtotal)}</span></div>
      `).join('')}</div>
      <div class="resumo-pedido">
        <div class="resumo-pedido-linha"><span>Subtotal</span><span>${moeda(pedido.subtotal)}</span></div>
        <div class="resumo-pedido-linha"><span>Desconto${pedido.cupom ? ' (cupom ' + seguro(pedido.cupom) + ')' : ''}</span><span>-${moeda(pedido.desconto)}</span></div>
        <div class="resumo-pedido-linha total"><span>Total</span><span>${moeda(pedido.total)}</span></div>
      </div>
    </article>
  `).join('');
}

async function iniciar() {
  $('#pedidos-sair').addEventListener('click', async () => {
    try { await api('/api/auth/logout',{method:'POST'}); window.location.href = 'index.html'; }
    catch(erro) { $('#pedidos-mensagem').textContent = erro.message; }
  });
  try {
    const dados = await api('/api/auth/me');
    if (!dados.usuario) {
      $('#pedidos-sair').hidden = true;
      $('#pedidos-mensagem').innerHTML = 'Faça login na <a class="link-topo" href="index.html">página inicial</a> para consultar seus pedidos.';
      return;
    }
    $('#nome-cliente').textContent = dados.usuario.nome;
    const pedidos = await api('/api/pedidos');
    renderizarPedidos(pedidos.pedidos);
  } catch (erro) {
    $('#pedidos-mensagem').textContent = erro.message;
    $('#pedidos-mensagem').classList.add('erro');
  }
}

iniciar();
