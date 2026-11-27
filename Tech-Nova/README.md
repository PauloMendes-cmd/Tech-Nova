# TechNova Store — N2 | Programação para Web

E-commerce acadêmico desenvolvido pelo Grupo 8, com frontend HTML/CSS/JavaScript, API Node.js/Express e banco de dados relacional MySQL 8.

## Integrantes — Grupo 8

- Paulo Vitor Lucena Mendes
- Jayme Bernardino da Silva Neto
- Valter Junio Lopes Xavier
- Isaac Barbosa da Silva
- João Pedro Carneiro Ibiapino
- Vinicius da Silva Alves

A interface preserva a identidade visual da N1. A N2 substitui as simulações de compra e estoque por operações reais e persistentes na API e no banco.

## Requisitos

- Node.js 20 ou mais recente
- MySQL 8 com serviço iniciado
- npm

## Instalação no Windows

1. Clone o repositório com `git clone https://github.com/PauloMendes-cmd/Tech-Nova.git` (ou extraia o ZIP em uma pasta no computador) e entre na pasta do projeto.
2. Abra o MySQL Workbench e conecte ao servidor MySQL 8.
3. Execute, nesta ordem, `backend/db/schema.sql` e `backend/db/seed.sql`.
4. Abra a pasta raiz do projeto no VS Code e abra o terminal PowerShell.
5. Execute `npm install`.
6. Copie `.env.example` para `.env` na **raiz** do projeto e configure `DB_USER`, `DB_PASSWORD`, `DB_HOST` e `DB_NAME` conforme o MySQL local. As contas de demonstração já vêm preenchidas. O arquivo `.env` não deve ser enviado ao GitHub.
7. Execute `npm run create:demo` para cadastrar no banco as contas de demonstração (administrador e cliente).
8. Execute `npm start`. O frontend (HTML, CSS e JavaScript) é servido pelo próprio Express, então esse único comando inicia frontend e backend.
9. Acesse **http://localhost:3000** no navegador.

Exemplo de comandos PowerShell:

```powershell
git clone https://github.com/PauloMendes-cmd/Tech-Nova.git
cd Tech-Nova
Copy-Item .env.example .env
npm install
npm run create:demo
npm start
```

O comando `npm run create:admin` cria apenas a conta de administrador, caso seja necessário.

## Credenciais de demonstração

Contas criadas pelo comando `npm run create:demo`, **exclusivas do ambiente de avaliação**. Não são credenciais reais e não dão acesso a nenhum outro sistema.

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | `admin@technova.demo` | `TechNova@Admin2026` |
| Cliente | `cliente@technova.demo` | `TechNova@Cliente2026` |

O painel administrativo fica em **http://localhost:3000/admin.html** e só abre para a conta de administrador. Novos clientes também podem ser criados pelo cadastro público da loja, que nunca cria administradores.

Não é suficiente abrir `index.html` diretamente: todas as funções da N2 dependem do backend e do MySQL em execução.

## Funcionalidades

**Público**

- Catálogo de seis produtos iniciais, com busca, categorias, ordenação, disponibilidade e imagens, carregados da API.
- Carrinho que pode ser utilizado antes do login, com itens e cupom preservados no `localStorage` durante a autenticação e ao recarregar a página. Dados antigos ou inválidos são tratados sem impedir o catálogo.
- Alteração de quantidades, remoção, somatório de itens e desconto de 10% a partir de R$ 3.000.
- Cupom de demonstração `TECHNOVA5` para mais 5 pontos percentuais de desconto.
- Cadastro de cliente, login e logout, com senha protegida por bcrypt e sessão persistida no MySQL.
- Finalização em duas etapas: resumo calculado no servidor (itens, quantidades, subtotal, desconto e valor final) e, depois, confirmação do pedido. O resumo tem validade de dez minutos e é vinculado ao usuário e aos dados da compra. Se preços ou valores mudarem, é necessário revisar e confirmar novamente.
- Compra autenticada, cálculo dos valores no servidor, verificação do estoque, registro de itens e pedido, e baixa do estoque em **uma transação**.
- Validação dos formulários de login e cadastro no navegador (nome completo, e-mail, tamanho da senha e confirmação) e, de novo, no servidor.
- Histórico de compras do cliente, com preços históricos, data, itens e total.
- Senhas com pelo menos oito caracteres e no máximo 72 bytes UTF-8, evitando o truncamento do bcrypt em senhas com acentos. O mesmo limite em bytes vale para os scripts de criação de contas.
- Datas interpretadas em UTC nas conexões MySQL e convertidas para o fuso do navegador na exibição.
- Limite por endereço IP de 30 tentativas de login e 20 cadastros a cada 15 minutos, com HTTP 429 e `Retry-After` quando excedido. O contador é local ao processo; uma implantação com múltiplas instâncias deve usar um armazenamento compartilhado para o limite.

**Administrador**

- Painel de indicadores: quantidade de produtos ativos, estoque baixo (1 a 3 unidades, critério definido no servidor), esgotados e pedidos.
- Tabela de produtos com sinalização de saldo **Baixo** e **Esgotado**.
- Cadastro, edição e desativação de produtos sem apagar pedidos antigos.
- Entradas, saídas e ajustes administrativos de estoque, todos com justificativa e histórico.
- Histórico com variação, saldo final e responsável, inclusive baixas realizadas por vendas.
- Consulta a todos os pedidos e seus itens.

A compra não integra pagamento real, conforme o enunciado. Um pedido confirmado é registrado como `Concluído`.

## Estrutura

```text
Tech-Nova/
├── index.html
├── admin.html
├── pedidos.html
├── css/
│   ├── style.css
│   └── painel.css
├── js/
│   ├── script.js
│   ├── admin.js
│   └── pedidos.js
├── images/
├── backend/
│   ├── server.js
│   ├── db.js
│   ├── logic.js
│   ├── db/schema.sql
│   ├── db/seed.sql
│   └── scripts/
│       ├── create-admin.js
│       └── create-demo.js
├── tests/regras.test.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Rotas da API

| Método | Rota | Acesso | Função |
|---|---|---|---|
| GET | `/api/health` | Público | Verificar conexão com o banco |
| GET | `/api/produtos` | Público | Consultar catálogo |
| GET | `/api/categorias` | Público | Consultar categorias |
| POST | `/api/auth/cadastro` | Público | Criar conta de cliente |
| POST | `/api/auth/login` | Público | Login |
| POST | `/api/auth/logout` | Público | Logout |
| GET | `/api/auth/me` | Público | Identificar sessão |
| GET | `/api/pedidos` | Logado | Meus pedidos |
| GET | `/api/pedidos/:id` | Logado | Consultar um pedido (dono ou admin; outro cliente recebe 403) |
| POST | `/api/pedidos/resumo` | Logado | Obter valores atuais e confirmação assinada do resumo |
| POST | `/api/pedidos` | Logado | Finalizar compra |
| GET | `/api/admin/resumo` | Admin | Indicadores |
| GET | `/api/admin/produtos` | Admin | Listar produtos |
| POST | `/api/admin/produtos` | Admin | Cadastrar produto |
| PUT | `/api/admin/produtos/:id` | Admin | Editar ou reativar produto |
| DELETE | `/api/admin/produtos/:id` | Admin | Desativar produto |
| POST | `/api/admin/estoque` | Admin | Movimentar estoque |
| GET | `/api/admin/movimentacoes` | Admin | Histórico de estoque |
| GET | `/api/admin/pedidos` | Admin | Todos os pedidos |

As rotas restritas verificam a sessão e o perfil no backend. A API não aceita preço ou total calculado no navegador como referência para a compra. Os dados são enviados/recebidos em JSON, com autenticação por cookie `HttpOnly`.

Para comprar pela API, envie `{ itens: [{ codigo, quantidade }], cupom }` a `POST /api/pedidos/resumo`. Apresente os valores retornados ao cliente e envie os mesmos itens e cupom, junto do campo `confirmacao` retornado, a `POST /api/pedidos`. Campos de preço e total enviados pelo cliente não determinam os valores da compra. Resumo alterado ou expirado retorna HTTP 409 e exige nova revisão. O resumo não reserva estoque. Sua assinatura vale no processo do servidor que a emitiu; reiniciar o servidor exige gerar um novo resumo. Uma implantação com múltiplas instâncias deve compartilhar a chave de assinatura antes de distribuir requisições entre elas.

O banco possui sete tabelas: `usuarios`, `categorias`, `produtos`, `pedidos`, `itens_pedido`, `movimentacoes_estoque` e `sessoes`.

## Testes

`npm test` executa os testes automatizados de desconto, cupom, itens, limites da senha, assinatura e expiração do resumo, persistência do carrinho e recuperação de dados locais inválidos.

`npm run test:integration` verifica a API com MySQL 8: autenticação, permissões, datas, mudança de preço, histórico, rollback e disputa pela última unidade. Informe `DB_HOST`, `DB_PORT`, `DB_USER` e `DB_PASSWORD` por variáveis de ambiente. O usuário do banco precisa poder criar e remover o banco temporário exclusivo de cada execução; os testes não usam `DB_NAME` nem apagam o banco da loja.

Exemplo no PowerShell, usando um servidor MySQL de testes:

```powershell
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '3306'
$env:DB_USER = 'root'
$env:DB_PASSWORD = 'senha-do-servidor-de-testes'
npm run test:integration
```

O workflow `.github/workflows/testes.yml` executa a suíte unitária e a integração com MySQL em Node.js 20 e 24 a cada push e pull request.

Roteiro de verificação manual (integração com MySQL e navegador):

1. Navegar pelo catálogo e buscar produto inexistente.
2. Adicionar itens e alterar quantidades, inclusive tentar ultrapassar o estoque.
3. Tentar finalizar uma compra sem estar logado: deverá solicitar autenticação e preservar o carrinho.
4. Criar uma conta e confirmar a compra, depois visualizar o pedido no histórico.
5. Conferir o pedido, os itens, a baixa de estoque e o registro da movimentação no MySQL.
6. Testar desconto automático e cupom, comparando com o pedido salvo no banco.
7. Entrar como admin, cadastrar e editar um produto.
8. Registrar entrada, saída e ajuste, conferir saldo e histórico.
9. Tentar acessar `/api/admin/produtos` usando conta de cliente: deve retornar HTTP 403.
10. Tentar comprar quantidade maior que o estoque: deve retornar HTTP 409 sem criar pedido parcial.
11. Abrir duas sessões e tentar comprar simultaneamente o estoque restante: apenas a compra que obtiver o saldo deve ser concluída.
12. Desativar um produto e confirmar que ele desaparece do catálogo, sem excluir o histórico de pedidos.
13. Logado como cliente, abrir `/api/pedidos/ID` com o número de um pedido de outro usuário: deve retornar HTTP 403. Com o número de um pedido próprio, retorna o pedido; com um número inexistente, HTTP 404.
14. No painel, conferir os selos **Baixo** e **Esgotado** na coluna de estoque.
15. Aplicar o cupom e recarregar a loja: itens, cupom e total devem permanecer iguais, enquanto os produtos continuarem disponíveis pelos mesmos preços.
16. Abrir o resumo de compra, alterar o preço com outra sessão de administrador e confirmar: nenhum pedido deve ser criado nessa tentativa. O novo resumo deve aparecer e exigir outro clique em Confirmar pedido.
17. Em tela pequena e carrinho com vários produtos, rolar o modal e acessar Confirmar pedido e Voltar ao carrinho.

## Apresentação

A apresentação revisada fica em `docs/TechNova-N2-apresentacao.pdf`. Mantém as 13 páginas e inclui o resumo recalculado no servidor, a persistência do cupom, as sete tabelas e o link do repositório.

## Observações para apresentação

- **POO:** `Produto`, `ItemCarrinho` e `Carrinho` em `js/script.js`.
- **for:** percorre o catálogo e os itens do carrinho.
- **while:** calcula a quantidade total no carrinho.
- **arrow functions:** presentes nos eventos e nas funções de manipulação do carrinho.
- **DOM:** os produtos e o carrinho são renderizados dinamicamente.
- **Transação:** `backend/server.js` cria o pedido, seus itens e movimentações e atualiza o estoque com bloqueio `FOR UPDATE` e `COMMIT` ou `ROLLBACK`.
- **Persistência:** todas as alterações de produtos, usuários, pedidos e estoque acontecem no MySQL.

O código foi deixado sem comentários explicativos nos arquivos de implementação, conforme exigido para a apresentação.
