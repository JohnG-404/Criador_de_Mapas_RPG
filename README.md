# Criador de Mapas RPG

Editor de mapas para RPG de mesa, no navegador. Primeiro em 2D (grid quadrado e hexagonal), com visualização 3D planejada para uma fase futura.

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

O workflow `Deploy da prévia` publica a pasta `dist/` no GitHub Pages. Para usar:
1. Settings → Pages → Source: **GitHub Actions**. (Em repositório privado, o GitHub Pages exige plano pago; em repositório público é gratuito.)
2. Actions → Deploy da prévia → Run workflow. Depois de ativado, o gatilho pode passar a ser automático a cada push na `main`.
