const $ = seletor => document.querySelector(seletor);
const moeda = valor => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(valor));
const dataFormatada = valor => new Date(valor).toLocaleString('pt-BR');
const seguro = valor => String(valor ?? '').replace(/[&<>"']/g, caractere => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[caractere]);
let catalogo = [];
let categorias = [];
let pedidos = [];
let limiarEstoque = 3;

async function api(url, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(url, { credentials:'same-origin', headers:{ 'Content-Type':'application/json' }, ...opcoes });
  } catch (erro) {
    throw new Error('Não foi possível conectar ao servidor.');
  }
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(corpo.erro || 'Operação não concluída.');
  return corpo;
}

function mensagem(texto, erro = false) {
  const elemento = $('#admin-mensagem');
  elemento.textContent = texto;
  elemento.classList.toggle('erro', erro);
}

function classificarEstoque(quantidade) {
  if (quantidade === 0) return { classe: 'esgotado', rotulo: 'Esgotado' };
  if (quantidade <= limiarEstoque) return { classe: 'baixo', rotulo: 'Baixo' };
  return null;
}

function atualizarResumo(resumo) {
  limiarEstoque = Number(resumo.limiarEstoque) || limiarEstoque;
  $('#admin-indicadores').innerHTML = [
    ['Produtos ativos',resumo.produtos],['Estoque baixo (até ' + limiarEstoque + ' un.)',resumo.estoqueBaixo],
    ['Esgotados',resumo.esgotados],['Pedidos',resumo.pedidos]
  ].map(([rotulo,valor]) => `<div class="indicador"><strong>${seguro(valor)}</strong><span>${seguro(rotulo)}</span></div>`).join('');
}

function atualizarCategorias() {
  const select = $('#produto-categoria');
  select.innerHTML = categorias.map(c => `<option value="${Number(c.id)}">${seguro(c.nome)}</option>`).join('');
}

function montarSelecaoEstoque() {
  const anterior = $('#estoque-produto').value;
  $('#estoque-produto').innerHTML = catalogo.map(p =>
    `<option value="${Number(p.codigo)}">#${Number(p.codigo)} ${seguro(p.nome)} (${Number(p.estoque)} un.)</option>`
  ).join('');
  if (catalogo.some(p => String(p.codigo) === anterior)) $('#estoque-produto').value = anterior;
}

function renderizarProdutos() {
  const tbody = $('#tabela-produtos');
  tbody.innerHTML = '';
  for (const produto of catalogo) {
    const linha = document.createElement('tr');
    const alerta = produto.ativo ? classificarEstoque(Number(produto.estoque)) : null;
    const selo = alerta ? `<span class="status alerta-estoque ${alerta.classe}">${alerta.rotulo}</span>` : '';
    linha.innerHTML = `<td>#${Number(produto.codigo)}</td><td>${seguro(produto.nome)}</td>` +
      `<td>${seguro(produto.categoria)}</td><td>${moeda(produto.preco)}</td><td>${Number(produto.estoque)}${selo}</td>` +
      `<td><span class="status ${produto.ativo ? '' : 'inativo'}">${produto.ativo ? 'Ativo':'Desativado'}</span></td>` +
      `<td><button class="botao-tabela editar" type="button">Editar</button>` +
      (produto.ativo ? '<button class="botao-tabela perigo desativar" type="button">Desativar</button>' : '') + '</td>';
    linha.querySelector('.editar').addEventListener('click', () => editarProduto(produto));
    linha.querySelector('.desativar')?.addEventListener('click', () => desativarProduto(produto));
    tbody.appendChild(linha);
  }
  montarSelecaoEstoque();
}

function limparFormularioProduto() {
  $('#form-produto').reset();
  $('#produto-codigo').value = '';
  $('#rotulo-estoque-inicial').hidden = false;
  $('#rotulo-produto-ativo').hidden = true;
  $('#produto-estoque').required = true;
  $('#botao-salvar-produto').textContent = 'Cadastrar produto';
  $('#cancelar-edicao').hidden = true;
}

function editarProduto(produto) {
  $('#produto-codigo').value = produto.codigo;
  $('#produto-nome').value = produto.nome;
  $('#produto-categoria').value = produto.categoriaId;
  $('#produto-preco').value = produto.preco;
  $('#produto-imagem').value = produto.imagem;
  $('#produto-ativo').checked = Boolean(produto.ativo);
  $('#rotulo-estoque-inicial').hidden = true;
  $('#rotulo-produto-ativo').hidden = false;
  $('#produto-estoque').required = false;
  $('#botao-salvar-produto').textContent = 'Salvar alterações';
  $('#cancelar-edicao').hidden = false;
  $('#form-produto').scrollIntoView({ behavior:'smooth', block:'center' });
}

async function salvarProduto(evento) {
  evento.preventDefault();
  const codigo = $('#produto-codigo').value;
  const corpo = {
    nome: $('#produto-nome').value,
    categoriaId: Number($('#produto-categoria').value),
    preco: Number($('#produto-preco').value),
    imagem: $('#produto-imagem').value,
    ...(codigo ? { ativo: $('#produto-ativo').checked } : { estoqueInicial: Number($('#produto-estoque').value) })
  };
  try {
    const retorno = await api(codigo ? `/api/admin/produtos/${codigo}` : '/api/admin/produtos', {
      method:codigo ? 'PUT' : 'POST', body: JSON.stringify(corpo)
    });
    mensagem(retorno.mensagem);
    limparFormularioProduto();
    await recarregar();
  } catch (erro) { mensagem(erro.message, true); }
}

async function desativarProduto(produto) {
  if (!window.confirm(`Desativar ${produto.nome}? Seus pedidos anteriores serão preservados.`)) return;
  try {
    const retorno = await api(`/api/admin/produtos/${produto.codigo}`, { method:'DELETE' });
    mensagem(retorno.mensagem);
    await recarregar();
  } catch (erro) { mensagem(erro.message, true); }
}

function atualizarCampoEstoque() {
  const ajuste = $('#estoque-tipo').value === 'AJUSTE';
  $('#rotulo-quantidade').textContent = ajuste ? 'Novo saldo de estoque' : 'Quantidade';
  $('#estoque-quantidade').min = ajuste ? '0' : '1';
}

async function movimentarEstoque(evento) {
  evento.preventDefault();
  const tipo = $('#estoque-tipo').value;
  const corpo = {
    produtoId:Number($('#estoque-produto').value), tipo,
    motivo:$('#estoque-motivo').value,
    ...(tipo === 'AJUSTE' ? {novoEstoque:Number($('#estoque-quantidade').value)} : {quantidade:Number($('#estoque-quantidade').value)})
  };
  try {
    const retorno = await api('/api/admin/estoque', {method:'POST', body:JSON.stringify(corpo)});
    mensagem(retorno.mensagem + ' Saldo atual: ' + retorno.saldo);
    $('#estoque-quantidade').value = '';
    $('#estoque-motivo').value = '';
    await recarregar();
  } catch (erro) { mensagem(erro.message, true); }
}

function renderizarMovimentacoes(movimentacoes) {
  $('#tabela-movimentacoes').innerHTML = movimentacoes.length ? movimentacoes.map(m =>
    `<tr><td>${dataFormatada(m.data)}</td><td>${seguro(m.produto)}</td><td>${seguro(m.tipo)}</td>` +
    `<td>${m.quantidade > 0 ? '+' : ''}${Number(m.quantidade)}</td><td>${Number(m.saldo)}</td>` +
    `<td>${seguro(m.responsavel || 'Sistema')}</td><td>${seguro(m.motivo)}${m.pedidoId ? ` (#${seguro(m.pedidoId)})` : ''}</td></tr>`
  ).join('') : '<tr><td colspan="7">Nenhuma movimentação registrada.</td></tr>';
}

function renderizarPedidos(lista) {
  const tbody = $('#tabela-pedidos');
  tbody.innerHTML = '';
  for (const pedido of lista) {
    const linha = document.createElement('tr');
    linha.innerHTML = `<td>#${seguro(pedido.id)}</td><td>${seguro(pedido.cliente)}<br><small>${seguro(pedido.email)}</small></td>` +
      `<td>${dataFormatada(pedido.data)}</td><td>${moeda(pedido.total)}</td>` +
      `<td><span class="status">${seguro(pedido.situacao)}</span></td><td><button class="botao-tabela detalhes">Ver itens</button></td>`;
    const detalhes = document.createElement('tr');
    detalhes.hidden = true;
    detalhes.innerHTML = `<td colspan="6">${pedido.itens.map(i =>
      `<div>${Number(i.quantidade)}x ${seguro(i.nome)} — ${moeda(i.precoUnitario)} un. = ${moeda(i.subtotal)}</div>`
    ).join('')}<div>Subtotal: ${moeda(pedido.subtotal)} | Desconto: ${moeda(pedido.desconto)} | Total: ${moeda(pedido.total)}</div></td>`;
    linha.querySelector('.detalhes').addEventListener('click', () => {
      detalhes.hidden = !detalhes.hidden;
    });
    tbody.append(linha, detalhes);
  }
  if (!lista.length) tbody.innerHTML = '<tr><td colspan="6">Ainda não existem pedidos.</td></tr>';
}

async function recarregar() {
  const [resumo, produtos, movimentos, pedidosResposta] = await Promise.all([
    api('/api/admin/resumo'), api('/api/admin/produtos'),
    api('/api/admin/movimentacoes'), api('/api/admin/pedidos')
  ]);
  catalogo = produtos.produtos;
  pedidos = pedidosResposta.pedidos;
  atualizarResumo(resumo.resumo);
  renderizarProdutos();
  renderizarMovimentacoes(movimentos.movimentacoes);
  renderizarPedidos(pedidos);
}

async function iniciar() {
  $('#form-produto').addEventListener('submit', salvarProduto);
  $('#cancelar-edicao').addEventListener('click', limparFormularioProduto);
  $('#form-estoque').addEventListener('submit', movimentarEstoque);
  $('#estoque-tipo').addEventListener('change', atualizarCampoEstoque);
  $('#admin-sair').addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', {method:'POST'});
      window.location.href = 'index.html';
    } catch (erro) { mensagem(erro.message, true); }
  });
  try {
    const resposta = await api('/api/auth/me');
    if (!resposta.usuario || resposta.usuario.perfil !== 'admin') {
      mensagem('Acesso restrito. Entre com uma conta de administrador na página inicial.', true);
      $('#admin-sair').hidden = true;
      return;
    }
    $('#admin-usuario').textContent = resposta.usuario.nome;
    categorias = (await api('/api/categorias')).categorias;
    atualizarCategorias();
    await recarregar();
    $('#admin-conteudo').hidden = false;
  } catch (erro) { mensagem(erro.message, true); }
}

iniciar();
