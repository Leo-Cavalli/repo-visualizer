# 🗺️ Repo Visualizer & AI Code Auditor (`repo-visualizer` v1.2.0)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Version: 1.2.0](https://img.shields.io/badge/Version-1.2.0-cyan.svg)](./package.json)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-emerald.svg)](#)
[![C4 Model + arc42](https://img.shields.io/badge/Architecture-C4_Model_%2B_arc42-amber.svg)](./references/c4-model-knowledge-base.md)
[![Agent Skill](https://img.shields.io/badge/Format-SKILL.md-purple.svg)](./SKILL.md)

**Elimine o problema da "caixa-preta" ao programar com Inteligência Artificial.**  
O `repo-visualizer` é uma **Skill Open Source para Agentes de IA** (Google Antigravity, Gemini CLI, Claude Code, Cursor, Windsurf, Cline) que transforma qualquer repositório de código em um **Centro de Comando Visual Interativo (`arch-dashboard.html`)** para auditoria humana, geração automática de **Diagramas C4 (Níveis C1 → C2 → C3 → C4)**, diagramas **DER** e **UML**, e editor integrado de documentação **arc42 em Markdown e PDF**.

---

## 🆕 Novidades das Versões 1.1.0 e 1.2.0

- **⚡ Motor de Análise Incremental com `@arch:status` (`pending` / `modified` $\rightarrow$ `read`) + Hash SHA-256 (v1.2.0):**
  - Integração bidirecional com a skill [`repo-builder`](https://github.com/Leo-Cavalli/repo-builder): arquivos já marcados como `@arch:status read` (e cujo hash SHA-256 não mudou) são **reaproveitados direto do cache em `0ms`** sem re-parsing!
  - Quando novos elementos (`pending`) ou alterações/novas conexões (`modified`) são detectados, o `repo-visualizer` reanalisa **apenas os arquivos alterados**, atualiza o `arch-data.json` e **marca automaticamente a tag no código-fonte como `@arch:status read`** (use `--no-mark-read` para desativar a escrita da tag ou `--force` para forçar varredura completa).
  - No Dashboard, o topo exibe o contador `⚡ Cache: X lidos / Y atua.` e os cards recém-atualizados recebem o selo visual **`🆕 NOVO`** / **`✏️ MOD`**.
- **🗺️ Gerador Interativo de Diagramas C4 (Simon Brown C4 Model):**
  - Navegação *Drill-Down* estilo "Google Maps do Código" (`C1 Contexto` $\rightarrow$ `C2 Contêineres` $\rightarrow$ `C3 Componentes em Camadas` $\rightarrow$ `C4 Código UML / DER`) com duplo-clique em qualquer elemento ou via *breadcrumbs*.
  - **Layout C3 Desemaranhado em Camadas Arquiteturais (*Topological Tiers + Barycenter Sorting*):** separa automaticamente o **Frontend (`Web Application [Container Boundary]`)** e o **Backend (`Domain & Services [Container Boundary]`)** em camadas hierárquicas (*Telas $\rightarrow$ Componentes UI $\rightarrow$ Serviços/Utilitários $\rightarrow$ Interfaces/Classes Base $\rightarrow$ Banco de Dados Externo*) com setas curvas de Bézier conectadas borda-a-borda.
  - **Integração C4 $\rightarrow$ arc42 com 1 Clique (`📐 Enviar C4 para arc42`):** injeta automaticamente os diagramas **C4 Nível 1** (no Capítulo 03 do arc42) e **C4 Nível 2** (no Capítulo 05 do arc42) em formato Mermaid editável.
- **⤢ Caixas de Fronteira Tracejadas Redimensionáveis e Móveis (`[Boundary]`):**
  - **Todas** as caixas de linha tracejada da ferramenta (`[Enterprise Scope]`, `[System Boundary]`, `[Container Boundary]`, `[Data Boundary]` no DER e `[Code Boundary]` no UML) possuem **8 alças interativas de redimensionamento** (4 cantos + 4 laterais) e **barra de cabeçalho arrastável** para você ajustar o tamanho e a posição das fronteiras livremente com o mouse.
- **⚡ Arquitetura Modular Leve (100% compatível com `file://` sem CORS):**
  - O template monolítico foi substituído por módulos independentes e ultra-rápidos (`arch-dashboard.html`, `styles.css`, `arch-data.js`, `svg-engine.js`, `c4-engine.js`, `browser-scanner.js` e `app.js`).
- **🤝 Integração Nativa com a Skill [`repo-builder`](https://github.com/Leo-Cavalli/repo-builder) (Protocolo `@arch`):**
  - Suporte nativo em $O(1)$ para leitura das tags arquiteturais `@arch:*` inseridas pela IA em tempo de escrita, economizando até **90% de tokens** e eliminando qualquer ambiguidade nos diagramas C4.

---

## 🤝 Integração Simbiótica com a Skill [`repo-builder`](https://github.com/Leo-Cavalli/repo-builder)

O `repo-visualizer` funciona em qualquer repositório legado sem precisar alterar uma única linha de código. Porém, quando utilizado em conjunto com a skill companheira **[`repo-builder`](https://github.com/Leo-Cavalli/repo-builder)**, ambos formam um ciclo completo de **Escrita + Auditoria Visual (*Write-Time + Read-Time*)**:

1. **Enquanto a IA escreve o código (`repo-builder`):**
   - Ela insere anotações ultra-leves `@arch:*` nos comentários nativos da linguagem (JSDoc/TSDoc, Docstrings, Prisma `///` ou SQL `--`) acima de classes, telas, componentes UI, funções e tabelas:
     ```typescript
     /**
      * @arch:container Domain & Application Services (Backend) [TypeScript / OOP]
      * @arch:role adapter
      * @arch:tier 3
      * @arch:external Stripe Payment Gateway [REST API / Webhooks]
      * @arch:desc Processa cobranças de cartão e valida webhooks de pagamento via Stripe.
      */
     export class StripeGatewayAdapter extends BaseEntity implements IPaymentGateway { ... }
     ```
2. **Quando você abre o `repo-visualizer`:**
   - **Zero Adivinhação:** O analisador (`analyze_repo.cjs` e `browser-scanner.js`) lê as tags `@arch:*` prioritariamente, posicionando cada componente exatamente no **Contêiner (C2)** e na **Camada Topológica (C3)** declarados.
   - **Sistemas Externos Reais no C1 e C2:** Qualquer `@arch:external` declarado no código vira automaticamente um nó de **Sistema Externo** conectado com seu protocolo real nos diagramas de Contexto (C1) e Contêineres (C2).
   - **Descrições de Negócio Reais:** O texto de `@arch:desc` aparece diretamente dentro das caixas do Diagrama C4, no Inspetor Lateral e nas tabelas da documentação **arc42 (Aba 5)**.

> 💡 **Instale a dupla completa:**
> ```bash
> npx skills add Leo-Cavalli/repo-builder
> npx skills add Leo-Cavalli/repo-visualizer
> ```

---

## ✨ Funcionalidades Principais (6 Abas Interativas)

1. **🗺️ 1. Arquitetura C4 (C1 / C2 / C3) & Grafo Geral**
   - **Visões C4 Nível 1 (Contexto), Nível 2 (Contêineres) e Nível 3 (Componentes):** notação oficial do C4 Model (`[Type: Technology]`, descrições autoexplicativas com quebra inteligente de palavras, fronteiras tracejadas redimensionáveis e setas rotuladas com protocolo/tecnologia).
   - **Drill-Down Interativo (Duplo-Clique):** dê duplo-clique no Sistema (C1) para abrir os Contêineres (C2); dê duplo-clique em um Contêiner (C2) para abrir seus Componentes (C3); dê duplo-clique em uma Classe (C3) ou Banco (C2/C3) para descer direto ao **Nível C4** (Diagrama de Classes UML na Aba 3 ou Diagrama DER na Aba 2).
   - **Grafo Geral Completo:** visão tradicional de todas as conexões do repositório com filtros rápidos por camada e inspetor lateral detalhado.

2. **🗄️ 2. Banco de Dados (Cartões + Diagrama Entidade-Relacionamento / DER — C4 Nível 4)**
   - Extração automática para **Prisma** (`schema.prisma`), **SQL** (`.sql`), **Drizzle ORM**, **TypeORM / JPA / Hibernate / Entity Framework** e **SQLAlchemy**.
   - **Alternância de Visão (`Modo de Visão`)**: alterne entre *Visão em Cartões* e **Diagrama Entidade-Relacionamento (DER) Interativo** com notação Pé-de-Galinha (*Crow's Foot* `1:N`, `N:1`, `1:1`), badges `🔑 PK`, `🔗 FK`, `✦ UQ`, fronteira `[Data Boundary]` redimensionável e busca com **Zoom Automático / Foco Animado**.

3. **🧬 3. Classes, Herança & Encapsulamento (Cartões + Diagrama de Classes UML — C4 Nível 4)**
   - Suporte para **TypeScript, JavaScript, Java, C# e Python**.
   - Mapeia `extends` (herança), `implements` (interfaces), composição e visibilidade de encapsulamento (`+ public`, `# protected`, `- private`).
   - **Alternância de Visão (`Modo de Visão`)**: alterne entre *Visão em Cartões* e **Diagrama de Classes UML Interativo** em 3 compartimentos (Estereótipo/Cabeçalho, Atributos e Métodos), fronteira `[Code Boundary]` redimensionável e localizador de classe com **Zoom Automático / Foco Animado**.

4. **🧩 4. Mapa de Reuso de Componentes & Telas (UI)**
   - Identifica páginas/telas (`pages/`, `app/`, `screens/`, `views/`) vs. componentes reutilizáveis (`components/`, `ui/`, `shared/`) e mostra **quantas vezes e em quais telas cada componente `<Componente />` está sendo reutilizado**.

5. **📐 5. Editor de Documentação arc42 (`.md`) & Exportação Consolidada em PDF**
   - Compatível com a skill `generating-arc42` e integrado ao gerador **C4 Model**.
   - Editor **Markdown Split-Screen** com preview em tempo real e renderização de diagramas **Mermaid**.
   - **Seleção Múltipla com Checkboxes**: escolha quais capítulos `.md` deseja incluir e clique em **📚 Gerar PDF Consolidado (Selecionados)** ou **📦 Baixar `.md` Consolidado**.
   - **Salvamento Direto no Disco**: edite os arquivos `.md` no navegador e salve direto nos arquivos reais do projeto.

6. **🛡️ 6. Governança, Validação Humana & Alertas IA**
   - Checklist interativo de revisão humana sobre código gerado por IA + alertas automáticos (ex.: quebra de encapsulamento com excesso de atributos públicos, alto acoplamento ou componentes criados pela IA sem uso em nenhuma tela).

---

## 📂 Estrutura Modular da Skill

```text
repo-visualizer/
├── SKILL.md                                 # Instruções para o Agente de IA
├── README.md                                # Documentação Open Source
├── LICENSE                                  # Licença MIT
├── package.json                             # Metadados e scripts CLI (v1.1.0)
├── scripts/
│   ├── analyze_repo.cjs                     # Analisador estático e gerador modular (.arch-visualizer/)
│   └── serve_dashboard.cjs                  # Servidor HTTP local opcional para Live Reload
├── resources/
│   ├── dashboard-template.html              # Estrutura HTML limpa e leve (272 linhas)
│   ├── styles.css                           # Estilos, animações, paleta C4 e regras de impressão PDF
│   ├── svg-engine.js                        # Motor unificado SVG (Pan, Zoom, Drag, Bézier e Bordas Redimensionáveis)
│   ├── c4-engine.js                         # Gerador C4 Model (C1 -> C2 -> C3 -> C4) e exportador Mermaid arc42
│   ├── browser-scanner.js                   # Scanner local via File System Access API direto no navegador
│   └── app.js                               # Controlador principal das 6 abas interativas
└── references/
    ├── architecture-audit-guide.md          # Guia de auditoria visual de código IA
    └── c4-model-knowledge-base.md           # Base de conhecimento oficial sobre C4 Model + arc42
```

---

## 🚀 Como Instalar na sua IA

### Opção 1: Via `npx skills` (Recomendado — Funciona em múltiplos agentes)
```bash
npx skills add Leo-Cavalli/repo-visualizer
```

### Opção 2: Via `git clone` direto na pasta de Skills da sua IA

- **Google Antigravity / Cursor / Windsurf / Agentes padrão `.agents`:**
  ```bash
  git clone https://github.com/Leo-Cavalli/repo-visualizer.git ~/.agents/skills/repo-visualizer
  ```

- **Gemini CLI:**
  ```bash
  git clone https://github.com/Leo-Cavalli/repo-visualizer.git ~/.gemini/skills/repo-visualizer
  ```

---

## 💻 Como Usar

### 1. Pedindo diretamente para a IA no Chat
Basta digitar no chat do seu agente:
> *"Use a skill repo-visualizer para analisar este repositório e gerar o dashboard visual"*

### 2. Executando via Terminal (Zero Dependências — Apenas Node.js)
```bash
# Gera a pasta .arch-visualizer/ com arch-dashboard.html e todos os módulos JS/CSS no repositório alvo
node ~/.agents/skills/repo-visualizer/scripts/analyze_repo.cjs /caminho/do/seu/projeto
```

### 3. Direto pelo Navegador (`🔄 Reanalisar Código` / `📂 Abrir Pasta`)
Mesmo abrindo o `arch-dashboard.html` diretamente via `file://` (duplo-clique no arquivo), você pode clicar em **`📂 Abrir Pasta`** ou **`🔄 Reanalisar Código`** no topo da tela para selecionar qualquer pasta do seu computador e analisá-la 100% dentro do navegador (via *File System Access API*)!

---

## 📄 Licença

Distribuído sob a licença **MIT**. Veja o arquivo [LICENSE](./LICENSE) para mais detalhes.
