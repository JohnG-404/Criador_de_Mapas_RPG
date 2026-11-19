# Atlas Board

Atlas Board é um editor de mapas para RPG de mesa, no navegador. Primeiro em 2D (grid quadrado e hexagonal), com visualização 3D planejada para uma fase futura.

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
| Camadas | Painel Camadas: olho oculta, cadeado trava |
| Névoa de guerra | Névoa (N): Cobrir ou Revelar com o pincel, Alt inverte; botões Cobrir tudo e Revelar tudo |
| Salvar / abrir | Botões Salvar e Abrir (Ctrl+S / Ctrl+O), arquivo `.rpgmap`. O mapa também é salvo sozinho no navegador |
| Exportar imagem | Exportar PNG (mapa inteiro, sem névoa, com o grid se ele estiver ligado) |
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
