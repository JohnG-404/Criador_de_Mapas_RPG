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
src/desktop.ts  integração com o app de desktop (só é usada dentro do app)
src-tauri/    app de desktop (Tauri 2): janela, ícones e instaladores
e2e/          testes no navegador
assets/       texturas e objetos (estilo escolhido: realista diurno)
docs/         planejamento e propostas de estilo
tools/        scripts auxiliares (ex.: gerar as propostas de estilo)
```

## Prévia online (GitHub Pages)

A cada push na `main`, o workflow `Deploy da prévia` publica o editor em https://johng-404.github.io/Criador_de_Mapas_RPG/.

## App de desktop (Windows, Linux e macOS)

O mesmo editor também roda como app instalado, feito com [Tauri 2](https://tauri.app). No Windows ele usa o WebView2 que já vem no sistema, então o instalador é pequeno (poucos MB) e o 3D usa a placa de vídeo normalmente.

O que muda no app:

- **Salvar e Exportar** abrem a janela "Salvar como" do sistema.
- **Janela dos jogadores** abre como uma janela própria do app, que dá para arrastar para outro monitor ou TV. `F11` liga e desliga a tela cheia.
- **Arquivos `.rpgmap`** ficam associados ao app: dois cliques num mapa abrem o Atlas Board com ele.
- **Links de sala online e de nuvem** apontam para a versão web, para os jogadores abrirem no navegador.
- O salvamento automático continua funcionando, guardado no próprio app.

### Baixar os instaladores

O workflow `App de desktop` gera os instaladores a cada push na `main` (e em PRs que mexem no app). Em **Actions → App de desktop → a execução mais recente → Artifacts**:

- `atlas-board-windows`: `Atlas Board_x.y.z_x64-setup.exe` (recomendado) e o `.msi`
- `atlas-board-linux`: `.AppImage`, `.deb` e `.rpm`
- `atlas-board-macos`: `.dmg` universal (Intel e Apple Silicon)

Os instaladores não têm assinatura digital, então o Windows SmartScreen pode avisar na primeira vez ("Mais informações → Executar assim mesmo"). No macOS, abra com o botão direito → Abrir.

Enviar uma tag `v*` (por exemplo `v0.5.0`) cria um **rascunho** de release com os instaladores, que só fica público quando alguém publica pelo GitHub.

### Rodar o app localmente

Requer Node.js 22+ e [Rust](https://rustup.rs) (no Linux, também as bibliotecas do WebKitGTK; veja os [pré-requisitos do Tauri](https://tauri.app/start/prerequisites/)).

```bash
npm run desktop:dev     # abre o app em modo de desenvolvimento
npm run desktop:build   # gera os instaladores em src-tauri/target/release/bundle/
```
