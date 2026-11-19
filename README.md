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

Controles da fase 0: arraste para mover, roda do mouse (ou pinça no trackpad) para zoom, `+`/`-` para zoom, `0` para enquadrar o mapa e setas para mover.

## Estrutura

```
src/core/     modelo e lógica pura (grid, câmera), sem dependência de renderização
src/render/   desenho do mapa com PixiJS
src/ui/       interface em React
e2e/          testes no navegador
docs/         planejamento e propostas de estilo
tools/        scripts auxiliares (ex.: gerar as propostas de estilo)
```

## Prévia online (GitHub Pages)

A cada push na `main`, o workflow `Deploy da prévia` publica o editor em https://johng-404.github.io/Criador_de_Mapas_RPG/. É preciso ativar uma vez: Settings → Pages → Source: **GitHub Actions**.
