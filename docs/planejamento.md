# Planejamento: Aplicativo de Criação de Mapas para RPG

*Versão 1.1 (execução por Claude) · 19/11/2026 · Documento vivo, revisar ao fim de cada fase*

---

## Resumo executivo (as decisões em uma página)

| Tema | Recomendação | Por quê |
|---|---|---|
| **2D ou 3D** | **Começar em 2D (vista de cima), com elevação/“2.5D” e visualização 3D como fase posterior** | 2D entrega valor muito mais rápido, roda em qualquer máquina e é o que a maioria das mesas usa. O formato de dados já nasce preparado para altura, então o 3D vira uma “visão” extra, não uma reescrita. |
| **Plataforma** | **Web (navegador) primeiro**, empacotada como app desktop depois (Tauri) | Zero instalação, fácil de compartilhar e testar com jogadores. O mesmo código vira app desktop offline. |
| **Stack** | **TypeScript + PixiJS (renderização 2D WebGL/WebGPU) + React (interface) + Vite** · three.js na fase 3D | Ecossistema enorme, alto desempenho em 2D, e three.js usa o mesmo modelo de dados para o 3D. |
| **Armazenamento** | Local primeiro (IndexedDB + exportação de arquivo `.rpgmap`), nuvem opcional depois | Funciona offline, sem custo de servidor no MVP. |
| **MVP** | Editor de mapa com grid quadrado/hex, tiles, camadas, objetos/tokens, névoa de guerra simples e exportação PNG/JSON | Cobre o ciclo completo “criar → usar na mesa”. |
| **Quem executa** | **Claude desenvolve tudo** (código, assets, testes, PRs, deploy); John decide, testa jogando e aprova | Seção 7. |
| **Prazo estimado do MVP** | ~4 semanas, dependendo do tempo de aprovação | Detalhes no roadmap (seção 8). |

> Se você preferir trabalhar em uma engine de jogos (por já ter Godot instalado, por exemplo), a seção 5 mostra a alternativa com Godot e o que muda.

---

## 1. Visão e público-alvo

### 1.1 Visão
Uma ferramenta em que um mestre de RPG consiga **criar um mapa jogável em menos de 15 minutos**, com aparência bonita por padrão, e usá-lo direto na sessão (presencial em tela/TV ou online), sem precisar ser artista nem programador.

### 1.2 Princípios de produto
1. **Rápido antes de detalhado**: pintar terreno com pincel e autotile, não colocar tile por tile.
2. **Bonito por padrão**: um conjunto de assets próprio e coeso já incluso.
3. **Agnóstico de sistema**: funciona para qualquer RPG (fantasia, sci‑fi, horror). Nada de regras embutidas de um sistema específico.
4. **Seus dados são seus**: arquivo aberto e documentado, exportação sem bloqueio.
5. **Do editor à mesa**: o mesmo mapa serve para preparar (modo Mestre) e para jogar (modo Jogador).

### 1.3 Público-alvo (personas)
| Persona | Necessidade principal | Prioridade |
|---|---|---|
| **Mestre casual** (joga com amigos, pouco tempo de preparo) | Mapas de masmorra/cidade rápidos, imprimir ou mostrar na TV | Alta (foco do MVP) |
| **Mestre online** (joga por Discord/VTT) | Exportar imagem com grid alinhado para usar em mesas virtuais | Alta |
| **Criador de mundo** (worldbuilder) | Mapas de região/continente, hexcrawl, anotações | Média (fase 2) |
| **Criador de conteúdo** (vende aventuras/mapas) | Exportação em alta resolução, assets próprios | Baixa/futura |

### 1.4 Diferenciais a buscar (sem copiar produtos existentes)
O mercado já tem editores de masmorra, geradores de mundo e mesas virtuais. Para não ser “mais um clone”, o diferencial proposto é a **combinação**:
- **Edição + geração procedural no mesmo fluxo** (gerar uma masmorra e depois editar à mão, sem trocar de ferramenta).
- **Mapas em múltiplas escalas ligados entre si** (clicar numa cidade no mapa regional abre o mapa da cidade).
- **Camada de elevação desde o início**, que permite a visualização 3D mais tarde.
- **Identidade visual própria**: assets, interface e nome originais. Não usar arte, ícones, nomes ou layouts de outros produtos como referência direta.

---

## 2. Funcionalidades

### 2.1 MVP (versão 0.1)
**Mapa e grid**
- Criar mapa com tamanho em células; grid **quadrado** e **hexagonal** (pointy/flat).
- Mostrar/ocultar grid, ajustar cor/opacidade, unidade de escala (ex.: 1 célula = 1,5 m).
- Zoom e pan suaves (roda do mouse, arrastar, atalhos).

**Pintura de terreno**
- Pincel, borracha, balde (preenchimento), retângulo.
- **Autotile** (bordas que se ajustam automaticamente entre grama/terra/água).
- Paredes e portas desenhadas por arestas (para masmorras).

**Camadas**
- Camadas fixas no MVP: Terreno, Paredes, Objetos, Tokens, Anotações, Névoa.
- Visibilidade e bloqueio por camada.

**Objetos e tokens**
- Biblioteca de objetos (árvores, móveis, baús...) com arrastar e soltar.
- Rotação, escala, snap no grid (opcional).
- Tokens simples (círculo com imagem/cor e nome).

**Névoa de guerra (simples)**
- Mestre revela/oculta áreas com pincel.
- Modo Jogador mostra só o revelado.

**Arquivo e exportação**
- Salvar automático local; abrir/salvar arquivo `.rpgmap` (JSON compactado).
- Exportar **PNG** (com ou sem grid, resolução por pixels-por-célula, útil para mesas virtuais).
- Desfazer/refazer ilimitado.

**Assets**
- Pacote inicial próprio: ~6 terrenos com autotile, ~60 objetos, ~10 tokens genéricos.

### 2.2 Versão 0.2 a 0.5 (pós‑MVP)
- **Geração procedural**: masmorras (salas + corredores), cavernas (autômato celular), regiões (ruído para relevo, rios, biomas). Sempre com **semente** reproduzível e resultado editável.
- **Camadas livres** (criar, renomear, reordenar, opacidade, modos de mistura).
- **Iluminação e visão dinâmica**: fontes de luz, linha de visão dos tokens calculada pelas paredes.
- **Névoa automática** baseada na visão dos tokens.
- **Medição** (régua, áreas de efeito: cone, círculo, linha).
- **Anotações e marcadores** com texto (notas do mestre ocultas aos jogadores).
- **Mapas ligados** (portais entre mapas, mapa-múndi → cidade → taverna).
- **Importação de assets do usuário** (PNG/WebP, com fatiamento de tilesets).
- **Exportação**: PDF para impressão em páginas A4 com marcas de corte, exportação em formato compatível com mesas virtuais populares (via formato JSON documentado de paredes/luzes, quando houver formato aberto).
- **Modo apresentação** (segunda janela/TV para jogadores).

### 2.3 Futuro (1.0+)
- **Visualização 3D** do mapa (extrusão de paredes, elevação do terreno, câmera orbital).
- **Edição em 3D** (posicionar objetos 3D, terreno com altura).
- **Colaboração em tempo real** (vários editores, ou mestre + jogadores numa sessão).
- **Nuvem e compartilhamento** por link.
- **Marketplace/comunidade** de assets e mapas.
- **Assistente por IA** (ex.: “gerar taverna de dois andares”) como recurso opcional.
- **App mobile/tablet** para visualização na mesa.

---

## 3. 2D vs 3D

| Critério | 2D (vista de cima) | 3D |
|---|---|---|
| Tempo até o MVP | **Curto** (3–4 meses) | Longo (8–12+ meses) |
| Facilidade para o usuário | **Alta**: pintar é intuitivo | Média/baixa: câmera e posicionamento 3D são mais difíceis |
| Custo de assets | **Baixo**: sprites/tiles | Alto: modelos, texturas, otimização |
| Desempenho | Roda bem em qualquer PC/navegador | Exige GPU melhor; mapas grandes pedem LOD/otimização |
| Uso na mesa (imprimir, TV, VTT) | **Ideal**: exportação direta em imagem | Precisa renderizar para 2D de qualquer jeito |
| Impacto visual | Bom, depende da arte | **Muito alto** |
| Diferenciação | Mercado mais cheio | Menos concorrência, mas público menor |

### Recomendação
**2D primeiro, com o modelo de dados já preparado para 3D.** Concretamente:
1. Toda célula já guarda `elevation` (altura) desde a versão 0.1, mesmo que no início isso só altere sombreamento.
2. Paredes são guardadas como **segmentos** (não como pixels), o que permite extrudá-las em 3D depois.
3. Objetos guardam um `assetId` que, no futuro, pode ter uma versão 2D (sprite) e uma 3D (modelo glTF).

Assim, a fase 3D é uma **nova visualização sobre os mesmos dados**, não um novo aplicativo.

---

## 4. Plataforma alvo

**Recomendação: navegador (web app) primeiro, desktop via Tauri em seguida.**
- Web: ninguém precisa instalar nada; você manda um link para o grupo testar.
- PWA permite uso offline e “instalar” pelo navegador.
- Tauri gera um executável leve para Windows/macOS/Linux com o mesmo código, com acesso direto a arquivos.
- Mobile fica para visualização (modo Jogador) numa fase futura; edição completa em celular não é prioridade.

---

## 5. Opções de stack

| Opção | Prós | Contras | Indicada se... |
|---|---|---|---|
| **A. Web: TypeScript + PixiJS + React** (recomendada) | Excelente desempenho 2D (WebGL/WebGPU), UI rica e fácil com React, deploy trivial, enorme quantidade de bibliotecas | Você constrói o editor do zero (ferramentas, undo, etc.) | Quer web, compartilhamento fácil e caminho para colaboração online |
| **B. Web: Canvas 2D puro** | Simples, sem dependências | Fica lento com mapas grandes e muitos objetos | Protótipo muito pequeno |
| **C. Web: three.js (ou Babylon.js) desde o início** | 3D nativo, pode fazer 2D ortográfico | Mais complexo para 2D, curva maior | Quer 3D como produto principal desde já |
| **D. Godot 4** | Engine gratuita e aberta; TileMap, câmera, export para desktop/web/mobile; ótimo para 2D **e** 3D | UI de editor customizada é mais trabalhosa que em React; export web mais pesado; menos bibliotecas web (colaboração, nuvem) | Prefere ambiente de engine, quer desktop primeiro e 3D cedo |
| **E. Unity** | Muito poderosa em 3D, Asset Store | Licenciamento/termos mudaram ao longo dos anos; builds web pesados; exagero para editor 2D | Já domina Unity e quer foco forte em 3D |

### Recomendação de stack (Opção A)
- **Linguagem:** TypeScript
- **Renderização 2D:** PixiJS v8 (WebGL, com WebGPU quando disponível); `pixi-viewport` para zoom/pan
- **Interface:** React + Zustand (estado) + uma biblioteca de componentes leve (ex.: Radix UI) + Tailwind
- **Build:** Vite; testes com Vitest e Playwright
- **Persistência local:** IndexedDB (via Dexie)
- **Geração procedural:** `simplex-noise`, gerador pseudoaleatório com semente (ex.: implementação própria de mulberry32/xoshiro)
- **Desktop:** Tauri 2
- **3D (fase futura):** three.js lendo o mesmo modelo de dados
- **Colaboração (futuro):** Yjs (CRDT) sobre WebSocket; backend opcional com Supabase (auth, storage, banco)

**Alternativa com Godot:** se você quiser ficar em Godot, o plano funciona igual. Troque PixiJS/React por TileMapLayer + nós Control, use Resources/JSON para o formato de arquivo, e o 3D fica mais fácil (GridMap/MeshLibrary). O custo é uma interface de editor menos flexível e menos caminho pronto para web/colaboração.

---

## 6. Arquitetura

### 6.1 Visão em camadas
```
┌────────────────────────────────────────────┐
│ UI (React): barras, painéis, diálogos      │
├────────────────────────────────────────────┤
│ Ferramentas (Tool system): pincel, balde,  │
│ parede, seleção, névoa, régua...           │
├────────────────────────────────────────────┤
│ Comandos (Command pattern) → Undo/Redo     │
├────────────────────────────────────────────┤
│ Documento (modelo de dados puro, TS)       │  ← fonte da verdade, sem dependência de render
├──────────────┬─────────────────────────────┤
│ Renderer 2D  │ Renderer 3D (futuro)        │  ← leem o documento, nunca o alteram
│ (PixiJS)     │ (three.js)                  │
├──────────────┴─────────────────────────────┤
│ Persistência: IndexedDB · arquivo .rpgmap  │
│ Exportadores: PNG · PDF · JSON · VTT       │
│ Geradores procedurais (Web Workers)        │
└────────────────────────────────────────────┘
```

### 6.2 Decisões-chave
- **Documento separado da renderização.** O modelo é TypeScript puro e testável. Os renderers só observam mudanças. Isso viabiliza 3D, exportação e testes sem tela.
- **Toda alteração é um Comando** (`apply`/`revert`). Dá undo/redo de graça e, no futuro, vira a base para sincronizar colaboração.
- **Mapa dividido em chunks** (ex.: 32×32 células). Cada chunk vira uma textura cacheada; só redesenha o que mudou. Permite mapas grandes (ex.: 1000×1000).
- **Geração procedural em Web Worker** para não travar a interface.
- **Sistema de coordenadas abstrato** (`GridSystem` com implementações `SquareGrid` e `HexGrid`), para que ferramentas não saibam qual grid está em uso. Para hex, usar coordenadas axiais/cúbicas.
- **Assets referenciados por ID**, com um manifesto de pacote de assets (permite trocar o tema visual e importar pacotes do usuário).

### 6.3 Formato de dados (`.rpgmap`)
Arquivo ZIP contendo `map.json` + pasta `assets/` (apenas assets personalizados embutidos). Exemplo simplificado de `map.json`:

```json
{
  "format": "rpgmap",
  "version": 1,
  "meta": {
    "id": "b1f3…",
    "name": "Cripta do Rei Esquecido",
    "createdAt": "2026-11-19T20:00:00Z",
    "units": { "cellSize": 1.5, "unit": "m" }
  },
  "grid": { "type": "hex", "orientation": "pointy", "width": 60, "height": 40 },
  "assetPacks": ["core-fantasy@1.0.0"],
  "layers": [
    {
      "id": "terrain", "kind": "tile", "visible": true,
      "chunkSize": 32,
      "chunks": {
        "0,0": { "tiles": "<RLE base64 dos IDs de terreno>", "elevation": "<RLE base64>" }
      }
    },
    {
      "id": "walls", "kind": "edges",
      "segments": [
        { "a": [10, 4], "b": [18, 4], "type": "stone", "blocksSight": true },
        { "a": [14, 4], "b": [15, 4], "type": "door", "state": "closed" }
      ]
    },
    {
      "id": "objects", "kind": "objects",
      "items": [
        { "id": "o1", "asset": "core-fantasy/chest_01", "x": 12.5, "y": 6.5, "rot": 90, "scale": 1, "z": 0 }
      ]
    },
    {
      "id": "tokens", "kind": "tokens",
      "items": [{ "id": "t1", "name": "Goblin", "x": 20, "y": 9, "size": 1, "color": "#6a9a3a" }]
    },
    { "id": "notes", "kind": "annotations", "items": [{ "x": 15, "y": 5, "text": "Armadilha", "gmOnly": true }] },
    { "id": "fog", "kind": "fog", "revealed": "<RLE base64 bitmap>" }
  ],
  "lights": [],
  "links": [{ "x": 30, "y": 2, "targetMap": "cidade-alta", "label": "Saída para a cidade" }],
  "generator": { "type": "dungeon", "seed": 48213, "params": { "rooms": 12 } }
}
```

Regras do formato:
- Campo `version` obrigatório + **migrações** automáticas ao abrir arquivos antigos.
- Dados grandes (tiles, névoa) em RLE/base64 por chunk para manter o arquivo pequeno.
- Coordenadas em **unidades de célula** (não pixels), independentes da resolução.
- Publicar um **JSON Schema** do formato para validação e para terceiros.

---

## 7. Modelo de execução: Claude faz o processo inteiro

Neste plano, **Claude é quem desenvolve**: escreve o código, cria os assets, testa, corrige, abre os pull requests e publica. Você atua como **dono do produto**: decide, testa jogando e aprova. Nada vai para produção (site público) sem a sua aprovação.

### 7.1 Quem faz o quê

| Atividade | Claude | Você (John) |
|---|---|---|
| Arquitetura, código, testes automatizados | ✅ Faz tudo | — |
| Assets visuais (tiles, objetos, ícones, interface) | ✅ Cria em SVG/procedural e exporta PNG | Aprova o estilo visual (1 vez, na fase 0) |
| Verificação visual | ✅ Roda o app num navegador automatizado e tira capturas de tela a cada entrega | Olha as capturas e o link de prévia |
| Pull requests e correções de revisão | ✅ Abre, corrige CI, responde comentários | Aprova e faz o merge (ou autoriza Claude a fazer) |
| Publicação (deploy) | ✅ Configura GitHub Pages / Tauri | Autoriza a primeira publicação pública |
| Testes com jogadores reais | Prepara roteiro e formulário | Joga uma sessão e conta o que achou |
| Decisões de produto (nome, prioridades, modelo de negócio) | Recomenda opções | Decide |

### 7.2 O que você precisa fazer uma única vez (setup, ~15 min)
1. **Criar o repositório no GitHub** (vazio, ex.: `mapas-rpg`) e me avisar o nome. Eu não consigo criar repositórios por aqui, mas depois de criado eu o conecto e faço todo o resto.
2. Garantir que o **app Claude do GitHub** está instalado nesse repositório ([Connect GitHub](https://claude.ai/connect-github)).
3. Escolher o nome do produto entre as opções que eu vou propor (ou dar o seu).

### 7.3 Ciclo de trabalho de cada entrega
1. Claude pega o próximo item do roadmap e cria uma branch.
2. Implementa com testes (Vitest para lógica, Playwright para a interface).
3. Roda o app, tira capturas de tela e grava uma prévia.
4. Abre um pull request com resumo, capturas e o que testar.
5. Corrige sozinho falhas de CI e comentários de revisão.
6. Você aprova o merge; o site de prévia é atualizado automaticamente.
7. A cada fase concluída, Claude atualiza este documento e o checklist.

Você pode acompanhar tudo pelo projeto, e pedir mudanças a qualquer momento por mensagem.

## 8. Roadmap por fases (executado por Claude)

As durações abaixo assumem Claude trabalhando nas sessões do projeto e **você respondendo em até 1 dia** às aprovações. O gargalo deixa de ser escrever código e passa a ser o tempo de revisão e de teste com jogadores. Cada fase termina com um link de prévia jogável.

| Fase | Duração estimada | Claude entrega | Você faz | Critério de pronto |
|---|---|---|---|---|
| **0. Fundação** | 2–3 dias | Esqueleto Vite+TS+React+PixiJS, CI, deploy de prévia no GitHub Pages, grid com zoom/pan, 3 propostas de estilo visual e de nome | Cria o repositório, escolhe estilo e nome | Link de prévia abrindo um grid 200×200 a 60 fps |
| **1. Núcleo do editor** | ~1 semana | Modelo de documento, chunks, pincel/borracha/balde, undo/redo, grid hex | Testa pintar um mapa (10 min) | Mapa 100×100 pintado com undo, sem travar |
| **2. Conteúdo do mapa** | ~1 semana | Autotile, paredes e portas, biblioteca de objetos, tokens, camadas, pacote de assets inicial | Monta uma masmorra e dá retorno | Masmorra completa feita só com o editor |
| **3. Uso na mesa (MVP 0.1)** | ~1 semana | Névoa manual, modo Jogador, salvar/abrir `.rpgmap`, autosave, exportação PNG | **Joga uma sessão real** com o mapa | Sessão jogada sem bloqueios graves |
| **4. Procedural** | ~1 semana | Geradores de masmorra, caverna e região com semente, resultado editável | Gera e edita alguns mapas | Gerar + editar em < 5 min |
| **5. Mesa avançada** | ~1,5 semana | Camadas livres, luz e visão dinâmica, névoa automática, régua/áreas, anotações, modo apresentação | Joga uma sessão usando a TV | Sessão inteira no app |
| **6. Ecossistema (beta 0.5)** | ~1,5 semana | Importação de assets, mapas ligados, PDF, exportação para VTT, app desktop (Tauri) | Autoriza o beta público | Beta publicado |
| **7. 3D (visualização)** | ~2 semanas | Renderer three.js com elevação, paredes extrudadas, objetos 3D simples, câmera orbital | Avalia o visual 3D | Qualquer mapa 2D visível em 3D |
| **8. Online (1.0)** | ~3 semanas | Contas e nuvem (Supabase), compartilhamento por link, colaboração em tempo real (Yjs) | Aprova custos e termos de uso; autoriza o lançamento | 1.0 publicada |

**Linha do tempo aproximada:** MVP em ~4 semanas · beta em ~8 semanas · 3D em ~10 semanas · 1.0 em ~13–14 semanas. Se as aprovações demorarem mais, o prazo cresce na mesma proporção.

### 8.1 Pontos em que vou parar e pedir sua aprovação
- Escolha do estilo visual e do nome (fase 0).
- Cada merge na branch principal (a menos que você me autorize a fazer merge sozinho).
- Primeira publicação pública (beta) e qualquer coisa que gere custo (domínio, nuvem, banco de dados).
- Mudanças que alterem o objetivo do produto ou a ordem das fases.

### 8.2 Limites honestos
- **Teste com jogadores reais** não dá para automatizar: o retorno de uma mesa de verdade é o que mais orienta as fases 3 a 5.
- **Arte**: os assets que eu crio serão limpos e coesos (estilo vetorial/estilizado), mas não substituem um ilustrador para um visual “pintado à mão”. Se quiser esse nível, dá para contratar arte depois e trocar o pacote sem mexer no código.
- **Contas e pagamentos** (domínio, Supabase, lojas de apps) precisam ser criados por você no seu nome.

### 8.3 Próximo passo
Crie o repositório vazio no GitHub e me mande o nome. Assim que ele existir, eu começo a fase 0 e te mando o primeiro link de prévia.

---

## 9. Riscos e mitigação

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| **Arte/assets** com qualidade abaixo do esperado | Média | Alto | Claude cria um pacote próprio em SVG, com estilo aprovado por você na fase 0; o pacote é trocável sem mexer no código |
| **Escopo crescer** (querer 3D e online cedo demais) | Alta | Alto | Respeitar a ordem das fases; lista “não agora”; cada fase com critério de pronto |
| **Desempenho** em mapas grandes | Média | Alto | Chunks + cache de texturas desde a fase 1; teste de carga com 1000×1000 no CI |
| **Parecer cópia** de produtos existentes | Média | Alto | Nome, interface, ícones e arte originais; não usar capturas de outros apps como referência de layout; não importar formatos proprietários sem documentação aberta |
| **Direitos de assets** (licenças de terceiros) | Média | Alto | Registrar licença de cada asset no manifesto; preferir arte própria ou CC0 |
| **Formato de arquivo mudar** e quebrar mapas antigos | Média | Médio | Versionamento + migrações + testes com arquivos de exemplo de cada versão |
| **Visão dinâmica/luz** complexa | Média | Médio | Implementar com algoritmo de visibilidade por segmentos (raycast 2D) em Worker; aceitar versão simples primeiro |
| **Transição para 3D** mais cara que o previsto | Média | Médio | Elevação e paredes vetoriais desde o início; spike técnico de 1 semana antes da fase 7 |
| **Aprovações demoradas** travam o ritmo | Média | Médio | Entregas pequenas e fáceis de revisar; opção de autorizar Claude a fazer merge quando o CI passar |
| **Retorno de jogadores** insuficiente | Média | Alto | Roteiro de teste curto preparado por Claude; testar ao fim das fases 3 e 5 |

---

## 10. Métricas de sucesso

- Tempo até o primeiro mapa jogável: **< 15 min** (meta MVP).
- 60 fps em mapa de 200×200 com 500 objetos num notebook comum.
- 70% dos testadores usam o mapa numa sessão real após criá-lo.
- Zero perda de dados (autosave + recuperação) relatada no beta.

---

## 11. Decisões tomadas neste plano (e como mudar)

| Decisão | Escolha atual | Quando reconsiderar |
|---|---|---|
| Dimensão | 2D primeiro, 3D como fase 7 | Se o principal objetivo for impacto visual 3D, adiantar a fase 7 e considerar Godot |
| Plataforma | Web + desktop (Tauri) | Se o público for majoritariamente mobile |
| Stack | TypeScript + PixiJS + React | Como Claude desenvolve, a stack web é a mais rápida de testar e publicar automaticamente; Godot continua possível |
| Modelo de negócio | Não definido (sugestão: núcleo gratuito, pacotes de assets e nuvem pagos) | Antes do beta público |
