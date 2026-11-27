class Produto {
  constructor(codigo, nome, categoria, preco, estoque, imagem) {
    this.codigo = codigo;
    this.nome = nome;
    this.categoria = categoria;
    this.preco = preco;
    this.estoque = estoque;
    this.imagem = imagem;
  }

  estaDisponivel() {
    return this.estoque > 0;
  }

  estaComEstoqueBaixo(limiar) {
    return this.estaDisponivel() && this.estoque <= limiar;
  }

  obterCodigoFormatado() {
    return "TN-" + String(this.codigo).padStart(3, "0");
  }
}

class ItemCarrinho {
  constructor(produto, quantidade) {
    this.produto = produto;
    this.quantidade = quantidade;
  }

  calcularSubtotal() {
    return this.produto.preco * this.quantidade;
  }
}

class Carrinho {
  constructor() {
    this.itens = [];
    this.cupom = null;
  }

  aplicarCupom(codigo) {
    const codigoNormalizado = codigo.trim().toUpperCase();
    if (codigoNormalizado === "TECHNOVA5") {
      this.cupom = codigoNormalizado;
      return true;
    }
    return false;
  }

  adicionarProduto(produto, quantidade) {
    let itemExistente = null;

    for (let i = 0; i < this.itens.length; i++) {
      if (this.itens[i].produto.codigo === produto.codigo) {
        itemExistente = this.itens[i];
      }
    }

    if (itemExistente !== null) {
      const novaQuantidade = itemExistente.quantidade + quantidade;
      if (novaQuantidade > produto.estoque) {
        return false;
      }
      itemExistente.quantidade = novaQuantidade;
    } else {
      if (quantidade > produto.estoque) {
        return false;
      }
      this.itens.push(new ItemCarrinho(produto, quantidade));
    }
    return true;
  }

  removerProduto(codigo) {
    this.itens = this.itens.filter((item) => item.produto.codigo !== codigo);
  }

  alterarQuantidade(codigo, novaQuantidade) {
    for (let i = 0; i < this.itens.length; i++) {
      if (this.itens[i].produto.codigo === codigo) {
        if (novaQuantidade <= 0) {
          this.removerProduto(codigo);
          return true;
        }
        if (novaQuantidade > this.itens[i].produto.estoque) {
          return false;
        }
        this.itens[i].quantidade = novaQuantidade;
        return true;
      }
    }
    return false;
  }

  calcularQuantidadeTotal() {
    let total = 0;
    let i = 0;
    while (i < this.itens.length) {
      total += this.itens[i].quantidade;
      i++;
    }
    return total;
  }

  calcularSubtotal() {
    let subtotal = 0;
    for (const item of this.itens) {
      subtotal += item.calcularSubtotal();
    }
    return subtotal;
  }

  calcularDesconto() {
    const subtotalCentavos = Math.round(this.calcularSubtotal() * 100);
    let percentualDesconto = 0;

    if (subtotalCentavos >= 300000) {
      percentualDesconto += 10;
    }
    if (this.cupom === "TECHNOVA5") {
      percentualDesconto += 5;
    }

    return Math.round(subtotalCentavos * percentualDesconto / 100) / 100;
  }

  calcularTotal() {
    const subtotalCentavos = Math.round(this.calcularSubtotal() * 100);
    const descontoCentavos = Math.round(this.calcularDesconto() * 100);
    return (subtotalCentavos - descontoCentavos) / 100;
  }

  estaVazio() {
    return this.itens.length === 0;
  }

  limpar() {
    this.itens = [];
    this.cupom = null;
  }
}

let produtos = [];

const carrinho = new Carrinho();

let categoriaSelecionada = "Todos";
let termoBusca = "";
let criterioOrdenacao = "relevancia";
let temporizadorToast = null;
let usuarioAtual = null;
let autenticarParaComprar = false;
let limiarEstoque = 3;
let resumoCompra = null;
let preparandoResumo = false;
const CHAVE_ARMAZENAMENTO = "technova-carrinho";

function formatarMoeda(valor) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor));
}

function escaparHtml(valor) {
  return String(valor).replace(/[&<>"']/g, caractere => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[caractere]);
}

async function chamarApi(caminho, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(caminho, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...opcoes
    });
  } catch (erro) {
    throw new Error("Não foi possível conectar ao servidor.");
  }
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = new Error(dados.erro || "Não foi possível concluir a operação.");
    erro.status = resposta.status;
    erro.codigo = dados.codigo;
    throw erro;
  }
  return dados;
}

function obterIniciais(nome) {
  const palavras = nome.split(" ");
  let iniciais = "";
  for (let i = 0; i < palavras.length && i < 2; i++) {
    iniciais += palavras[i].charAt(0);
  }
  return iniciais.toUpperCase();
}

function mostrarToast(mensagem, tipo = "sucesso") {
  const toast = document.getElementById("toast");
  toast.textContent = mensagem;
  toast.className = "toast toast-" + tipo + " visivel";

  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => {
    toast.classList.remove("visivel");
  }, 2600);
}

function animarBadge() {
  const badge = document.getElementById("contador-carrinho");
  badge.classList.remove("bump");
  void badge.offsetWidth;
  badge.classList.add("bump");
}

function obterCategorias() {
  const categorias = ["Todos"];
  for (const produto of produtos) {
    if (!categorias.includes(produto.categoria)) {
      categorias.push(produto.categoria);
    }
  }
  return categorias;
}

function renderizarCategorias() {
  const container = document.getElementById("lista-categorias");
  container.innerHTML = "";
  const categorias = obterCategorias();

  for (const categoria of categorias) {
    const botao = document.createElement("button");
    botao.className = "botao-categoria" + (categoria === categoriaSelecionada ? " ativo" : "");
    botao.textContent = categoria;
    botao.addEventListener("click", () => {
      categoriaSelecionada = categoria;
      renderizarCategorias();
      renderizarProdutos();
    });
    container.appendChild(botao);
  }
}

function filtrarProdutos() {
  const resultado = [];

  for (let i = 0; i < produtos.length; i++) {
    const produto = produtos[i];
    const combinaCategoria = categoriaSelecionada === "Todos" || produto.categoria === categoriaSelecionada;
    const combinaBusca = produto.nome.toLowerCase().includes(termoBusca.toLowerCase());

    if (combinaCategoria && combinaBusca) {
      resultado.push(produto);
    }
  }

  return resultado;
}

function ordenarProdutos(lista) {
  const copia = [...lista];

  if (criterioOrdenacao === "menor-preco") {
    copia.sort((a, b) => a.preco - b.preco);
  } else if (criterioOrdenacao === "maior-preco") {
    copia.sort((a, b) => b.preco - a.preco);
  } else if (criterioOrdenacao === "nome") {
    copia.sort((a, b) => a.nome.localeCompare(b.nome));
  }

  return copia;
}

function criarCardProduto(produto, indice) {
  const card = document.createElement("div");
  card.className = "card-produto";
  card.style.animationDelay = (indice * 60) + "ms";

  const disponivel = produto.estaDisponivel();
  const estoqueBaixo = produto.estaComEstoqueBaixo(limiarEstoque);
  const codigoFormatado = produto.obterCodigoFormatado();

  card.innerHTML = `
    <div class="card-imagem-wrap" data-iniciais="${escaparHtml(obterIniciais(produto.nome))}">
      <img class="card-imagem" src="${escaparHtml(produto.imagem)}" alt="${escaparHtml(produto.nome)}" loading="lazy" />
      <span class="card-sku">${codigoFormatado}</span>
      ${!disponivel ? '<span class="card-selo-indisponivel">Esgotado</span>' : ""}
      ${estoqueBaixo ? `<span class="card-selo-baixo">Últimas ${produto.estoque}!</span>` : ""}
    </div>
    <div class="card-info">
      <span class="card-categoria">${escaparHtml(produto.categoria)}</span>
      <span class="card-nome">${escaparHtml(produto.nome)}</span>
      <span class="card-preco">${formatarMoeda(produto.preco)}</span>
      <span class="card-estoque ${disponivel ? "" : "indisponivel"}">
        ${disponivel ? produto.estoque + " em estoque" : "Indisponível"}
      </span>
      <button class="botao-adicionar" ${disponivel ? "" : "disabled"}>
        ${disponivel ? "Adicionar ao carrinho" : "Indisponível"}
      </button>
    </div>
  `;

  const imagem = card.querySelector(".card-imagem");
  imagem.addEventListener("load", () => imagem.classList.add("carregada"));
  imagem.addEventListener("error", () => {
    card.querySelector(".card-imagem-wrap").classList.add("sem-imagem");
    imagem.remove();
  });

  const botao = card.querySelector(".botao-adicionar");
  if (disponivel) {
    botao.addEventListener("click", () => adicionarAoCarrinho(produto.codigo));
  }

  return card;
}

function renderizarProdutos() {
  const lista = document.getElementById("lista-produtos");
  const mensagemBusca = document.getElementById("mensagem-busca");
  lista.innerHTML = "";

  const produtosFiltrados = ordenarProdutos(filtrarProdutos());

  if (produtosFiltrados.length === 0) {
    mensagemBusca.textContent = "Nenhum produto encontrado para essa busca.";
    mensagemBusca.classList.add("visivel");
    return;
  }

  mensagemBusca.textContent = "";
  mensagemBusca.classList.remove("visivel");

  for (let i = 0; i < produtosFiltrados.length; i++) {
    lista.appendChild(criarCardProduto(produtosFiltrados[i], i));
  }
}

const adicionarAoCarrinho = (codigo) => {
  const produto = produtos.find((p) => p.codigo === codigo);
  if (!produto || !produto.estaDisponivel()) {
    return;
  }
  const sucesso = carrinho.adicionarProduto(produto, 1);
  if (!sucesso) {
    mostrarToast("Quantidade máxima em estoque atingida.", "erro");
    return;
  }
  mostrarToast(produto.nome + " adicionado ao carrinho.");
  atualizarInterfaceCarrinho();
};

const aumentarQuantidade = (codigo) => {
  const item = carrinho.itens.find((i) => i.produto.codigo === codigo);
  if (!item) return;
  const sucesso = carrinho.alterarQuantidade(codigo, item.quantidade + 1);
  if (!sucesso) {
    mostrarToast("Estoque insuficiente para aumentar a quantidade.", "erro");
    return;
  }
  atualizarInterfaceCarrinho();
};

const diminuirQuantidade = (codigo) => {
  const item = carrinho.itens.find((i) => i.produto.codigo === codigo);
  if (!item) return;
  carrinho.alterarQuantidade(codigo, item.quantidade - 1);
  atualizarInterfaceCarrinho();
};

function removerDoCarrinho(codigo) {
  carrinho.removerProduto(codigo);
  atualizarInterfaceCarrinho();
}

function renderizarItensCarrinho() {
  const container = document.getElementById("itens-carrinho");
  container.innerHTML = "";

  if (carrinho.estaVazio()) {
    container.innerHTML = `
      <div class="carrinho-vazio">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="19" cy="21" r="1"></circle>
          <path d="M2 3h2l2.4 12.2a2 2 0 0 0 2 1.8h9.2a2 2 0 0 0 2-1.6L22 8H6"></path>
        </svg>
        <strong>Seu carrinho está vazio.</strong>
        <span>Adicione produtos para continuar.</span>
      </div>
    `;
    return;
  }

  for (const item of carrinho.itens) {
    const linha = document.createElement("div");
    linha.className = "item-carrinho";
    linha.innerHTML = `
      <div class="item-info">
        <div class="item-nome">${escaparHtml(item.produto.nome)}</div>
        <div class="item-preco">${formatarMoeda(item.produto.preco)} un. · Subtotal: ${formatarMoeda(item.calcularSubtotal())}</div>
      </div>
      <div class="item-controles">
        <button class="botao-diminuir">-</button>
        <span>${item.quantidade}</span>
        <button class="botao-aumentar">+</button>
        <button class="item-remover">🗑️</button>
      </div>
    `;

    linha.querySelector(".botao-aumentar").addEventListener("click", () => aumentarQuantidade(item.produto.codigo));
    linha.querySelector(".botao-diminuir").addEventListener("click", () => diminuirQuantidade(item.produto.codigo));
    linha.querySelector(".item-remover").addEventListener("click", () => removerDoCarrinho(item.produto.codigo));

    container.appendChild(linha);
  }
}

function atualizarBarraDesconto() {
  const meta = 3000;
  const subtotal = carrinho.calcularSubtotal();
  const progresso = Math.min((subtotal / meta) * 100, 100);
  const barra = document.getElementById("barra-desconto-preenchimento");
  const mensagem = document.getElementById("mensagem-desconto");

  barra.style.width = progresso + "%";

  if (subtotal >= meta) {
    mensagem.textContent = "Desconto de 10% aplicado no subtotal!";
    mensagem.classList.add("atingido");
  } else {
    mensagem.textContent = "Faltam " + formatarMoeda(meta - subtotal) + " para o desconto de 10%.";
    mensagem.classList.remove("atingido");
  }
}

function salvarCarrinho() {
  const dados = [];
  for (const item of carrinho.itens) {
    dados.push({ codigo: item.produto.codigo, quantidade: item.quantidade });
  }
  ArmazenamentoCarrinho.salvar(CHAVE_ARMAZENAMENTO, dados, carrinho.cupom);
}

function restaurarCarrinho() {
  const dadosSalvos = ArmazenamentoCarrinho.ler(CHAVE_ARMAZENAMENTO);
  for (const itemSalvo of dadosSalvos.itens) {
    const produto = produtos.find((p) => p.codigo === itemSalvo.codigo);
    if (produto) {
      const solicitada = Number(itemSalvo.quantidade);
      const quantidadePossivel = Math.min(solicitada, produto.estoque);
      if (Number.isSafeInteger(quantidadePossivel) && quantidadePossivel > 0) {
        carrinho.adicionarProduto(produto, quantidadePossivel);
      }
    }
  }
  if (!carrinho.estaVazio() && dadosSalvos.cupom) carrinho.aplicarCupom(dadosSalvos.cupom);
}

function aplicarCupom() {
  const campo = document.getElementById("campo-cupom");
  const codigo = campo.value;

  if (carrinho.estaVazio()) {
    mostrarToast("Adicione produtos antes de aplicar um cupom.", "erro");
    return;
  }

  const sucesso = carrinho.aplicarCupom(codigo);
  if (sucesso) {
    mostrarToast("Cupom aplicado: 5% de desconto extra.");
    campo.value = "";
    atualizarInterfaceCarrinho();
  } else {
    mostrarToast("Cupom inválido.", "erro");
  }
}

function atualizarResumoCarrinho() {
  document.getElementById("qtd-itens").textContent = carrinho.calcularQuantidadeTotal();
  document.getElementById("valor-subtotal").textContent = formatarMoeda(carrinho.calcularSubtotal());
  document.getElementById("valor-desconto").textContent = formatarMoeda(carrinho.calcularDesconto());
  document.getElementById("valor-total").textContent = formatarMoeda(carrinho.calcularTotal());
  document.getElementById("contador-carrinho").textContent = carrinho.calcularQuantidadeTotal();
  animarBadge();
  atualizarBarraDesconto();
  salvarCarrinho();

  const botaoFinalizar = document.getElementById("botao-finalizar");
  botaoFinalizar.disabled = carrinho.estaVazio() || preparandoResumo;
}

function atualizarInterfaceCarrinho() {
  renderizarItensCarrinho();
  atualizarResumoCarrinho();
  renderizarProdutos();
}

function finalizarCompra() {
  if (carrinho.estaVazio()) {
    mostrarToast("Carrinho vazio: adicione produtos antes de finalizar.", "erro");
    return;
  }
  if (!usuarioAtual) {
    autenticarParaComprar = true;
    mostrarToast("Faça login para confirmar sua compra.", "erro");
    abrirAutenticacao();
    return;
  }
  abrirConfirmacao();
}

async function abrirConfirmacao() {
  if (preparandoResumo || carrinho.estaVazio()) return;
  preparandoResumo = true;
  document.getElementById("botao-finalizar").disabled = true;
  try {
    const itens = carrinho.itens.map(item => ({ codigo: item.produto.codigo, quantidade: item.quantidade }));
    const dados = await chamarApi("/api/pedidos/resumo", {
      method: "POST", body: JSON.stringify({ itens, cupom: carrinho.cupom })
    });
    resumoCompra = dados;
    let linhas = "";
    for (const item of dados.itens) {
      linhas += `<div class="confirmacao-linha"><span>${item.quantidade}x ${escaparHtml(item.nome)}</span>` +
        `<span>${formatarMoeda(item.subtotal)}</span></div>`;
    }
    const quantidade = dados.itens.reduce((total, item) => total + item.quantidade, 0);
    document.getElementById("resumo-confirmacao").innerHTML = linhas +
      `<div class="confirmacao-linha"><span>Itens</span><span>${quantidade}</span></div>` +
      `<div class="confirmacao-linha"><span>Subtotal</span><span>${formatarMoeda(dados.subtotal)}</span></div>` +
      `<div class="confirmacao-linha"><span>Desconto</span><span>${formatarMoeda(dados.desconto)}</span></div>` +
      `<div class="confirmacao-linha confirmacao-total"><span>Valor final</span><span>${formatarMoeda(dados.total)}</span></div>`;
    fecharCarrinho();
    document.getElementById("modal-confirmacao").classList.add("visivel");
    document.getElementById("botao-confirmar-pedido").focus();
  } catch (erro) {
    mostrarToast(erro.message, "erro");
    if (erro.status === 401) {
      usuarioAtual = null;
      atualizarCabecalho();
      autenticarParaComprar = true;
      abrirAutenticacao();
    } else if (erro.status === 409) {
      await carregarProdutos();
    }
  } finally {
    preparandoResumo = false;
    document.getElementById("botao-finalizar").disabled = carrinho.estaVazio();
  }
}

function fecharConfirmacao() {
  document.getElementById("modal-confirmacao").classList.remove("visivel");
  resumoCompra = null;
}

async function confirmarPedido() {
  if (carrinho.estaVazio() || !resumoCompra) {
    fecharConfirmacao();
    mostrarToast("Abra o resumo da compra antes de confirmar.", "erro");
    return;
  }
  const botao = document.getElementById("botao-confirmar-pedido");
  botao.disabled = true;
  botao.textContent = "Confirmando pedido...";
  const resumo = resumoCompra;
  try {
    const itens = resumo.itens.map(item => ({ codigo: item.codigo, quantidade: item.quantidade }));
    const dados = await chamarApi("/api/pedidos", {
      method: "POST", body: JSON.stringify({ itens, cupom: resumo.cupom, confirmacao: resumo.confirmacao })
    });
    const linhas = resumo.itens.map(item =>
      `<p>${item.quantidade}x ${escaparHtml(item.nome)}</p>`).join("");
    document.getElementById("resumo-final").innerHTML =
      `<p><strong>Pedido #${escaparHtml(dados.numeroPedido)}</strong></p>${linhas}` +
      `<p>Subtotal: ${formatarMoeda(dados.subtotal)}</p>` +
      `<p>Desconto: ${formatarMoeda(dados.desconto)}</p>` +
      `<p><strong>Total: ${formatarMoeda(dados.total)}</strong></p>` +
      `<p>O pedido e a baixa do estoque foram registrados no banco.</p>`;
    carrinho.limpar();
    atualizarInterfaceCarrinho();
    fecharConfirmacao();
    fecharCarrinho();
    document.getElementById("modal-sucesso").classList.add("visivel");
    await carregarProdutos();
  } catch (erro) {
    fecharConfirmacao();
    mostrarToast(erro.message, "erro");
    if (erro.status === 401) {
      usuarioAtual = null;
      atualizarCabecalho();
      autenticarParaComprar = true;
      abrirAutenticacao();
    } else if (erro.codigo === "RESUMO_ALTERADO" || erro.codigo === "RESUMO_EXPIRADO") {
      await carregarProdutos();
      await abrirConfirmacao();
      mostrarToast(erro.message, "erro");
    } else {
      abrirCarrinho();
      if (erro.status === 409) await carregarProdutos();
    }
  } finally {
    botao.textContent = "Confirmar pedido";
    botao.disabled = false;
  }
}

function abrirCarrinho() {
  document.getElementById("painel-carrinho").classList.add("aberto");
  document.getElementById("overlay").classList.add("visivel");
}

function fecharCarrinho() {
  document.getElementById("painel-carrinho").classList.remove("aberto");
  document.getElementById("overlay").classList.remove("visivel");
}

function atualizarCabecalho() {
  const botao = document.getElementById("botao-conta");
  const rotulo = document.getElementById("nome-usuario");
  const linkPedidos = document.getElementById("link-pedidos");
  const linkAdmin = document.getElementById("link-admin");
  const botaoSair = document.getElementById("botao-sair");
  rotulo.textContent = usuarioAtual ? usuarioAtual.nome.split(" ")[0] : "";
  botao.textContent = usuarioAtual ? "Minha conta" : "Entrar / cadastrar";
  linkPedidos.hidden = !usuarioAtual;
  linkAdmin.hidden = usuarioAtual?.perfil !== "admin";
  botaoSair.hidden = !usuarioAtual;
}

function abrirAutenticacao() {
  if (usuarioAtual) {
    window.location.href = "pedidos.html";
    return;
  }
  fecharCarrinho();
  document.getElementById("modal-autenticacao").classList.add("visivel");
}

function validarFormularioAutenticacao(payload, cadastro) {
  if (cadastro) {
    const partesNome = payload.nome.split(/\s+/).filter(parte => parte.length > 0);
    if (partesNome.length < 2) {
      return "Informe seu nome completo (nome e sobrenome).";
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return "Informe um e-mail válido.";
  }
  if (payload.senha.length < 8) {
    return "A senha deve ter pelo menos 8 caracteres.";
  }
  if (new TextEncoder().encode(payload.senha).length > 72) {
    return "A senha é longa demais. Use até 72 bytes UTF-8; letras acentuadas podem ocupar mais de um byte.";
  }
  if (cadastro && payload.senha !== payload.confirmarSenha) {
    return "A confirmação da senha não confere.";
  }
  return null;
}

function alternarAutenticacao(modo) {
  const cadastro = modo === "cadastro";
  document.getElementById("auth-senha").autocomplete = cadastro ? "new-password" : "current-password";
  document.getElementById("campos-cadastro").hidden = !cadastro;
  document.getElementById("campo-confirmar").hidden = !cadastro;
  document.getElementById("auth-nome").required = cadastro;
  document.getElementById("auth-confirma").required = cadastro;
  document.getElementById("tab-login").classList.toggle("ativo", !cadastro);
  document.getElementById("tab-cadastro").classList.toggle("ativo", cadastro);
  document.getElementById("titulo-autenticacao").textContent = cadastro ? "Criar conta" : "Entrar na TechNova";
  document.getElementById("enviar-autenticacao").textContent = cadastro ? "Cadastrar" : "Entrar";
  document.getElementById("form-autenticacao").dataset.modo = modo;
}

async function enviarAutenticacao(evento) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const cadastro = form.dataset.modo === "cadastro";
  const payload = {
    email: document.getElementById("auth-email").value.trim(),
    senha: document.getElementById("auth-senha").value
  };
  if (cadastro) {
    payload.nome = document.getElementById("auth-nome").value.trim();
    payload.confirmarSenha = document.getElementById("auth-confirma").value;
  }
  const problema = validarFormularioAutenticacao(payload, cadastro);
  if (problema) {
    mostrarToast(problema, "erro");
    return;
  }
  const botao = document.getElementById("enviar-autenticacao");
  botao.disabled = true;
  try {
    const dados = await chamarApi(cadastro ? "/api/auth/cadastro" : "/api/auth/login", {
      method: "POST", body: JSON.stringify(payload)
    });
    usuarioAtual = dados.usuario;
    atualizarCabecalho();
    document.getElementById("modal-autenticacao").classList.remove("visivel");
    form.reset();
    mostrarToast(autenticarParaComprar ? "Login feito. Confira o carrinho e finalize a compra." : "Acesso realizado com sucesso.");
    if (autenticarParaComprar) abrirCarrinho();
    autenticarParaComprar = false;
  } catch (erro) {
    mostrarToast(erro.message, "erro");
  } finally {
    botao.disabled = false;
  }
}

async function sairDaConta() {
  try {
    await chamarApi("/api/auth/logout", { method: "POST" });
    usuarioAtual = null;
    atualizarCabecalho();
    mostrarToast("Sessão encerrada.");
  } catch (erro) {
    mostrarToast(erro.message, "erro");
  }
}

async function carregarProdutos(inicial = false) {
  try {
    const dados = await chamarApi("/api/produtos");
    limiarEstoque = Number(dados.limiarEstoque) || limiarEstoque;
    produtos = dados.produtos.map(produto => new Produto(
      produto.codigo, produto.nome, produto.categoria, Number(produto.preco),
      Number(produto.estoque), produto.imagem
    ));
    if (inicial) restaurarCarrinho();
    else {
      carrinho.itens = carrinho.itens.flatMap(item => {
        const atual = produtos.find(p => p.codigo === item.produto.codigo);
        if (!atual || !atual.estaDisponivel()) return [];
        item.produto = atual;
        item.quantidade = Math.min(item.quantidade, atual.estoque);
        return [item];
      });
    }
    const blocoContagem = document.getElementById("numero-produtos");
    if (blocoContagem) blocoContagem.textContent = produtos.length;
    renderizarCategorias();
    atualizarInterfaceCarrinho();
    return true;
  } catch (erro) {
    document.getElementById("mensagem-busca").textContent = erro.message + " Verifique se o backend está em execução.";
    document.getElementById("mensagem-busca").classList.add("visivel");
    return false;
  }
}

function configurarEventos() {
  document.getElementById("botao-carrinho").addEventListener("click", abrirCarrinho);
  document.getElementById("fechar-carrinho").addEventListener("click", fecharCarrinho);
  document.getElementById("overlay").addEventListener("click", fecharCarrinho);
  document.getElementById("botao-finalizar").addEventListener("click", finalizarCompra);
  document.getElementById("botao-confirmar-pedido").addEventListener("click", confirmarPedido);
  document.getElementById("botao-voltar-carrinho").addEventListener("click", () => {
    fecharConfirmacao();
    abrirCarrinho();
  });
  document.getElementById("fechar-modal").addEventListener("click", () => {
    document.getElementById("modal-sucesso").classList.remove("visivel");
  });
  document.getElementById("campo-busca").addEventListener("input", evento => {
    termoBusca = evento.target.value;
    renderizarProdutos();
  });
  document.getElementById("ordenar-produtos").addEventListener("change", evento => {
    criterioOrdenacao = evento.target.value;
    renderizarProdutos();
  });
  document.getElementById("botao-cupom").addEventListener("click", aplicarCupom);
  document.getElementById("campo-cupom").addEventListener("keydown", evento => {
    if (evento.key === "Enter") aplicarCupom();
  });
  document.getElementById("botao-conta").addEventListener("click", abrirAutenticacao);
  document.getElementById("botao-sair").addEventListener("click", sairDaConta);
  document.getElementById("fechar-autenticacao").addEventListener("click", () => {
    document.getElementById("modal-autenticacao").classList.remove("visivel");
  });
  document.getElementById("tab-login").addEventListener("click", () => alternarAutenticacao("login"));
  document.getElementById("tab-cadastro").addEventListener("click", () => alternarAutenticacao("cadastro"));
  document.getElementById("form-autenticacao").addEventListener("submit", enviarAutenticacao);
}

async function iniciar() {
  configurarEventos();
  alternarAutenticacao("login");
  try {
    const dados = await chamarApi("/api/auth/me");
    usuarioAtual = dados.usuario;
  } catch (erro) {
    mostrarToast("Não foi possível consultar sua sessão.", "erro");
  }
  atualizarCabecalho();
  await carregarProdutos(true);
}

iniciar();
