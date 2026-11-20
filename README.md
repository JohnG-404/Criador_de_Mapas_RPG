# Atlas Board

Atlas Board é um editor de mapas para RPG de mesa, no navegador. Primeiro em 2D (grid quadrado e hexagonal), com uma vista 3D do mesmo mapa.

O planejamento completo está em [docs/planejamento.md](docs/planejamento.md).

## Rodando localmente

Requer Node.js 22+.

```bash
npm install
npm run dev        # abre o editor em http://localhost:5173
npm test           # testes de lógica (Vitest)
npm run test:e2e   # testes no navegador (Playwright)
npm run build      # gera a versão final em dist/
```

### Controles

| Ação | Como |
|---|---|
| Pintar | Botão esquerdo com Pincel (B), Borracha (E) ou Balde (G) |
| Escolher terreno | Painel à esquerda ou teclas 1 a 4 |
| Tamanho do pincel | Controle deslizante ou `[` e `]` |
| Paredes | Parede (W): arraste entre cantos de células; com Shift cria uma sala |
| Portas | Porta (D): clique numa borda de célula; clicar de novo volta a ser parede |
| Apagar parede ou porta | Alt + clique com Parede ou Porta |
| Objetos | Objeto (O): escolha no painel e clique; Shift solta sem encaixe |
| Tokens | Token (T): clique numa célula; nome e cor no painel com Selecionar |
| Selecionar | Selecionar (V): clique e arraste para mover; R gira (Shift+R ao contrário), `[` `]` mudam o tamanho, Delete apaga, Esc solta |
| Abrir e fechar portas | Selecionar (V): clique na porta |
| Personagens de jogador | Selecione um token e marque "Personagem de jogador": o que ele enxerga é revelado na névoa (paredes e portas fechadas bloqueiam) |
| Régua | Régua (M): arraste de uma célula a outra; Esc apaga |
| Mapas ligados | Painel **Mapas da campanha**: **+ Adicionar mapa** cria outro mapa na mesma campanha. Clicar num mapa da lista abre só para você (os jogadores continuam onde estão); **Levar os jogadores para este mapa** muda a janela e a sala online deles |
| Passagens | Passagem (`P`): clique numa célula para criar uma escada, porta ou portal que leva a outro mapa. No painel escolha o destino (ou **+ Novo mapa…**, que já cria a passagem de volta) e use **Atravessar**: o mestre, a janela dos jogadores e a sala online vão para o outro mapa, enquadrando a passagem de volta, e os personagens de jogador vão junto. Só o mestre vê o marcador. A campanha inteira fica num `.rpgmap` só (com um mapa, o arquivo é igual ao de antes) |
| Notas do mestre | Nota (A): clique no mapa e escreva; só o mestre vê |
| Camadas | Painel Camadas: olho oculta, cadeado trava |
| Névoa de guerra | Névoa (N): Cobrir ou Revelar com o pincel, Alt inverte; botões Cobrir tudo e Revelar tudo |
| Salvar / abrir | Botões Salvar e Abrir (Ctrl+S / Ctrl+O), arquivo `.rpgmap`. O mapa também é salvo sozinho no navegador |
| Exportar | Botão **Exportar**: imagem PNG, arquivo de mesa virtual `.dd2vtt` (Universal VTT, com paredes, portas e luzes, abre no Foundry, Roll20, Owlbear Rodeo e outros) ou PDF em escala real dividido em folhas A4 (imprima em 100%) |
| Relevo | Ferramenta Relevo (`L`): subir, baixar, aplainar e suavizar com o pincel (`Alt` inverte subir e baixar). Aparece sombreado no 2D e com altura de verdade no 3D |
| Modelos de token | Ferramenta Token (`T`): personagens e inimigos prontos de D&D 5e (criaturas do SRD 5.1) e de horror investigativo, com retrato, tamanho e ficha (PV, CA ou Defesa, Sanidade). Dano e cura rápidos no painel |
| Sala online | Botão **Sala online**: abre uma sala e gera um link. Os jogadores abrem o link em qualquer computador ou celular e veem o mapa ao vivo, com a névoa opaca. Notas do mestre e inimigos escondidos pela névoa não são enviados. Usa o Realtime do Supabase |
| Nuvem | Botão **Nuvem**: salva o mapa no Supabase e gera um link para abrir e continuar em outro computador. Não precisa de conta; a chave do mapa vai no link, depois do `#`, e a lista de mapas fica no navegador. Limite de 8 MB por mapa. A tabela e as funções estão em `supabase/migrations` |
| Ver em 3D | Botão **Ver em 3D**: paredes com altura (baixa, média ou alta), portas, objetos em volume, água afundada e tokens como miniaturas. Arraste para girar, botão direito move, roda aproxima. `Esc` ou **Voltar ao 2D** fecha |
| Imagem própria | Ferramenta Objeto (`O`) e **Importar imagem…** (PNG, WebP ou JPEG). A imagem fica guardada dentro do arquivo `.rpgmap` |
| Enquadrar os jogadores | Mostrar esta área: a janela dos jogadores passa a mostrar o que você está vendo |
| Gerar mapa | Botão Gerar: masmorra (só grid quadrado), caverna ou região, a partir de uma semente. Substitui terreno, paredes e objetos (os tokens ficam) e dá para desfazer |
| Mostrar aos jogadores | Janela dos jogadores: abre uma janela só com o mapa e a névoa opaca, atualizada a cada edição (arraste para outro monitor ou TV) |
| Desfazer / refazer | Ctrl+Z / Ctrl+Shift+Z (ou Ctrl+Y) |
| Mover o mapa | Botão direito ou do meio, Espaço + arrastar, ferramenta Mover (H) ou setas |
| Zoom | Roda do mouse, pinça no trackpad, `+` e `-`; `0` enquadra o mapa |

## Estrutura

```
src/core/     modelo e lógica pura (grid quadrado e hex, câmera, documento em chunks,
              histórico de desfazer, pincel e balde), sem dependência de renderização
src/editor/   controlador do editor: estado, ferramentas e gestos
src/render/   desenho do mapa com PixiJS
src/ui/       interface em React
e2e/          testes no navegador
assets/       texturas e objetos (estilo escolhido: realista diurno)
docs/         planejamento e propostas de estilo
tools/        scripts auxiliares (ex.: gerar as propostas de estilo)
```

## Prévia online (GitHub Pages)

A cada push na `main`, o workflow `Deploy da prévia` publica o editor em https://johng-404.github.io/Criador_de_Mapas_RPG/.
