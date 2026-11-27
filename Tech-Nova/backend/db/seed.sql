USE technova;

INSERT INTO categorias (id, nome) VALUES
  (1, 'Informática'), (2, 'Games'), (3, 'Acessórios')
ON DUPLICATE KEY UPDATE nome = VALUES(nome);

INSERT INTO produtos (id, nome, categoria_id, preco, estoque, imagem, ativo) VALUES
  (1, 'Notebook Gamer Pro', 1, 4500.00, 5, 'images/notebook.jpg', 1),
  (2, 'Mouse Gamer RGB', 1, 150.00, 20, 'images/mouse.jpg', 1),
  (3, 'Console X-Play', 2, 3000.00, 0, 'images/console.jpg', 1),
  (4, 'Controle Sem Fio', 2, 250.00, 15, 'images/controle.jpg', 1),
  (5, 'Headset Gamer', 3, 350.00, 10, 'images/headset.jpg', 1),
  (6, 'Cadeira Gamer', 3, 1200.00, 3, 'images/cadeira.jpg', 1)
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO movimentacoes_estoque (produto_id, usuario_id, tipo, quantidade, saldo_resultante, motivo)
SELECT p.id, NULL, 'ENTRADA', p.estoque, p.estoque, 'Estoque inicial do catálogo de demonstração'
FROM produtos p
WHERE p.id BETWEEN 1 AND 6 AND p.estoque > 0
  AND NOT EXISTS (SELECT 1 FROM movimentacoes_estoque m WHERE m.produto_id = p.id);
