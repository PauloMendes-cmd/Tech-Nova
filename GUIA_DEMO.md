# Guia rápido da apresentação — TechNova N2

## Sequência para demonstrar

1. Mostrar o catálogo vindo do MySQL e procurar um produto pelo nome.
2. Adicionar itens e alterar quantidades no carrinho; experimentar o limite de estoque.
3. Aplicar a promoção de 10% acima de R$ 3.000 e, se desejar, o cupom `TECHNOVA5`.
4. Tentar finalizar sem login e demonstrar que o carrinho é preservado.
5. Criar um cliente (testar também senha diferente da confirmação), fazer login e clicar em Finalizar compra.
6. Mostrar o resumo de confirmação, confirmar o pedido e mostrar o número gerado.
7. Abrir o histórico do cliente.
8. Entrar como admin (`admin@technova.demo`) e mostrar os indicadores e a listagem de produtos, com os selos Baixo e Esgotado.
9. Cadastrar ou editar produto e fazer uma entrada de estoque.
10. Mostrar a movimentação da venda no histórico e confirmar que o estoque baixou.
11. Demonstrar que cliente não acessa `/api/admin/produtos` (HTTP 403).
12. Demonstrar que cliente não lê pedido de outro usuário: abrir `/api/pedidos/ID` com o número de um pedido alheio (HTTP 403).

## Explicações importantes

**O que mudou da N1 para a N2?** Na N1 os produtos eram uma lista fixa no JS e o pedido aparecia apenas na tela. Na N2 os produtos são consultados da API, a conta é armazenada no MySQL e cada compra gera um registro persistente.

**Como o frontend conversa com o backend?** A função `chamarApi` usa `fetch` com JSON. O Express recebe as requisições, valida os dados e faz consultas ao MySQL.

**O que são as classes?** `Produto` representa cada item do catálogo e sabe dizer se está disponível, se está com estoque baixo e qual é seu código formatado; `ItemCarrinho` associa produto e quantidade e calcula o subtotal da linha; `Carrinho` reúne os itens e calcula quantidade, subtotal, desconto e total. A baixa de estoque não existe nas classes do navegador porque quem baixa o estoque é o servidor.

**Onde estão for e while?** Há `for` na construção de categorias, na filtragem e renderização dos produtos, no resumo de confirmação e nos cálculos do carrinho; no servidor, `for...of` percorre os itens dentro da transação do pedido. O `while` está em `Carrinho.calcularQuantidadeTotal`: percorre os itens do carrinho somando as quantidades, com condição de parada em `this.itens.length`, então termina sempre e não trava a interface.

**Por que a confirmação antes de gravar?** O botão Finalizar compra só valida (carrinho vazio, login) e abre o resumo. Somente o botão Confirmar pedido chama a API.

**Por que o backend recalcula o valor?** O navegador pode ser manipulado. O servidor usa o preço real salvo no banco para impedir compras com valores adulterados.

**Por que transação?** O backend bloqueia as linhas de produtos com `FOR UPDATE` e, dentro de uma transação, insere o pedido, os itens e as movimentações e baixa o estoque. Se ocorrer um erro, executa `ROLLBACK`.

**Como funciona login?** A senha não é armazenada em texto puro; ela é transformada em hash com bcrypt. O servidor cria um token aleatório de sessão e grava apenas seu hash no MySQL. O navegador recebe um cookie `HttpOnly`.

**Como o cliente é impedido de ver pedido alheio?** A listagem filtra por `usuario_id` da sessão, e a rota `GET /api/pedidos/:id` devolve 403 se o pedido pertence a outro usuário (o administrador pode consultar qualquer um).

**Como diferenciar cliente de administrador?** A tabela `usuarios` possui o campo `perfil`. As rotas `/api/admin/*` verificam esse perfil no servidor, e não só na interface.

**Como manter os preços históricos?** `itens_pedido` grava o preço unitário no momento da compra. Alterar o preço cadastrado depois não altera pedidos anteriores.

## Antes da apresentação

Abra o MySQL, execute `schema.sql` e `seed.sql`, rode `npm install`, copie `.env.example` para `.env` (ajustando a senha do MySQL), execute `npm run create:demo` e `npm start`. Confirme que `http://localhost:3000/api/health` responde `{"status":"ok"}`. Execute o roteiro acima em uma máquina previamente configurada, inclusive a compra feita com duas abas para o estoque restante.

Contas de demonstração: `admin@technova.demo` / `TechNova@Admin2026` e `cliente@technova.demo` / `TechNova@Cliente2026`.
