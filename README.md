# 🕸️ Repo Visualizer & AI Code Auditor (`repo-visualizer`)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-emerald.svg)](#)
[![Agent Skill](https://img.shields.io/badge/Format-SKILL.md-purple.svg)](./SKILL.md)

**Elimine o problema da "caixa-preta" ao programar com Inteligência Artificial.**  
O `repo-visualizer` é uma **Skill Open Source para Agentes de IA** (Google Antigravity, Gemini CLI, Claude Code, Cursor, Windsurf, Cline) que transforma qualquer repositório de código em um **Centro de Comando Visual Interativo (`arch-dashboard.html`)** para auditoria humana, rastreamento de arquitetura e geração de documentação **arc42 em Markdown e PDF**.

---

## ✨ Funcionalidades Principais (6 Abas Interativas)

1. **🕸️ 1. Grafo Geral & Dependências**
   - Grafo interativo com **Drag & Drop** (nós arrastáveis), Pan & Zoom e filtros por camada (*Banco de Dados*, *Classes & Herança*, *Telas & Componentes UI*, *Funções & Imports*).
   - **Inspetor Lateral**: clique em qualquer elemento para ver o arquivo e linha exata, quem importa/usa aquele item e do que ele depende.

2. **🗄️ 2. Banco de Dados (Cartões + Diagrama Entidade-Relacionamento / DER)**
   - Extração automática para **Prisma** (`schema.prisma`), **SQL** (`.sql`), **Drizzle ORM**, **TypeORM / JPA / Hibernate / Entity Framework** e **SQLAlchemy**.
   - **Alternância de Visão (`Modo de Visão`)**: alterne entre *Visão em Cartões* e **Diagrama Entidade-Relacionamento (DER) Interativo** com notação Pé-de-Galinha (*Crow's Foot* `1:N`, `N:1`, `1:1`), badges `🔑 PK`, `🔗 FK`, `✦ UQ` e busca com **Zoom Automático / Foco Animado**.

3. **🧬 3. Classes, Herança & Encapsulamento (Cartões + Diagrama de Classes UML)**
   - Suporte para **TypeScript, JavaScript, Java, C# e Python**.
   - Mapeia `extends` (herança), `implements` (interfaces), composição e visibilidade de encapsulamento (`+ public`, `# protected`, `- private`).
   - **Alternância de Visão (`Modo de Visão`)**: alterne entre *Visão em Cartões* e **Diagrama de Classes UML Interativo** em 3 compartimentos (Estereótipo/Cabeçalho, Atributos e Métodos) + localizador de classe com **Zoom Automático / Foco Animado**.

4. **🧩 4. Mapa de Reuso de Componentes & Telas (UI)**
   - Identifica páginas/telas (`pages/`, `app/`, `screens/`, `views/`) vs. componentes reutilizáveis (`components/`, `ui/`, `shared/`) e mostra **quantas vezes e em quais telas cada componente `<Componente />` está sendo reutilizado**.

5. **📐 5. Editor de Documentação arc42 (`.md`) & Exportação Consolidada em PDF**
   - Compatível com a skill `generating-arc42`.
   - Editor **Markdown Split-Screen** com preview em tempo real e renderização de diagramas **Mermaid**.
   - **Seleção Múltipla com Checkboxes**: escolha quais capítulos `.md` deseja incluir e clique em **📚 Gerar PDF Consolidado (Selecionados)** ou **📦 Baixar `.md` Consolidado**.
   - **Salvamento Direto no Disco**: edite os arquivos `.md` no navegador e salve direto nos arquivos reais do projeto.

6. **🛡️ 6. Governança, Validação Humana & Alertas IA**
   - Checklist interativo de revisão humana sobre código gerado por IA + alertas automáticos (ex.: quebra de encapsulamento com excesso de atributos públicos, alto acoplamento ou componentes criados pela IA sem uso em nenhuma tela).

---

## 🚀 Como Instalar na sua IA

### Opção 1: Via `npx skills` (Recomendado — Funciona em múltiplos agentes)
```bash
npx skills add <seu-usuario>/repo-visualizer
```

### Opção 2: Via `git clone` direto na pasta de Skills da sua IA

- **Google Antigravity / Cursor / Windsurf / Agentes padrão `.agents`:**
  ```bash
  git clone https://github.com/<seu-usuario>/repo-visualizer.git ~/.agents/skills/repo-visualizer
  ```

- **Gemini CLI:**
  ```bash
  git clone https://github.com/<seu-usuario>/repo-visualizer.git ~/.gemini/skills/repo-visualizer
  ```

---

## 💻 Como Usar

### 1. Pedindo diretamente para a IA no Chat
Basta digitar no chat do seu agente:
> *"Use a skill repo-visualizer para analisar este repositório e gerar o dashboard visual"*

### 2. Executando via Terminal (Zero Dependências — Apenas Node.js)
```bash
# Gera .arch-visualizer/arch-dashboard.html e arch-data.json no repositório alvo
node ~/.agents/skills/repo-visualizer/scripts/analyze_repo.cjs /caminho/do/seu/projeto
```

### 3. Direto pelo Navegador (`🔄 Reanalisar Código` / `📂 Abrir Pasta`)
Mesmo abrindo o `arch-dashboard.html` diretamente via `file://`, você pode clicar em **`📂 Abrir Pasta`** ou **`🔄 Reanalisar Código`** no topo da tela para selecionar qualquer pasta do seu computador e analisá-la 100% dentro do navegador (via *File System Access API*)!

---

## 📄 Licença

Distribuído sob a licença **MIT**. Veja o arquivo [LICENSE](./LICENSE) para mais detalhes.
