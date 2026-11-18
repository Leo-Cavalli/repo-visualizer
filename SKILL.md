---
name: repo-visualizer
description: >-
  Gera um Dashboard Local Interativo (HTML/JS) para auditoria visual de código,
  rastreamento de arquitetura, diagramas de banco de dados (SQL, Prisma, TypeORM,
  Drizzle, SQLAlchemy), hierarquia de classes OOP (herança, interfaces,
  encapsulamento em TS/JS, Java, C#, Python), grafo de importações de funções,
  mapa de reuso de componentes de UI por tela (React/Next.js) e editor integrado
  de documentação arc42 (.md) com exportação para PDF. Use sempre que o usuário
  pedir para visualizar o repositório, auditar código gerado por IA, mapear
  arquitetura, ver reuso de componentes, ou editar/exportar documentação arc42.
---

# Repo Visualizer & AI Code Auditor (`repo-visualizer`)

Esta skill transforma qualquer repositório em um **Centro de Comando Visual Interativo** (`arch-dashboard.html`), permitindo que o desenvolvedor humano audite, rastreie e valide o código gerado por IA, além de editar documentação arquitetural **arc42** em Markdown e exportá-la em **PDF**.

---

## Quando usar esta Skill

Ative esta skill quando o usuário solicitar:
- "Mostre visualmente como está o código deste repositório"
- "Gere o dashboard / diagrama do banco de dados, classes ou componentes"
- "Quero auditar o que a IA criou / onde cada componente ou função está sendo usado"
- "Mostre as relações de herança, encapsulamento e imports do projeto"
- "Abra o editor visual de documentação arc42 / exportar arquitetura em PDF"

---

## Estrutura da Skill

```text
repo-visualizer/
├── SKILL.md                        # Instruções operacionais desta skill
├── scripts/
│   ├── analyze_repo.cjs            # Motor de extração estática (DB, OOP, Imports, UI, arc42) + gerador do Dashboard HTML
│   └── serve_dashboard.cjs         # Servidor local opcional para salvar edições .md direto no disco
└── references/
    └── architecture-audit-guide.md # Guia de enriquecimento semântico e integração com generating-arc42
```

---

## Passo a Passo de Execução

### Passo 1: Executar o Analisador Estático e Gerar o Dashboard
Execute o script `analyze_repo.cjs` passando o diretório raiz do repositório alvo:

```powershell
node "<caminho-da-skill>/scripts/analyze_repo.cjs" "<caminho-do-repositorio>"
```

O script irá:
1. Escanear recursivamente o repositório (ignorando `node_modules`, `.git`, `dist`, `build`, `.next`, `target`, `bin`, `obj`).
2. Extrair automaticamente:
   - **Banco de Dados & ORMs**: Tabelas, colunas, tipos, PK/FK e relações (`1:1`, `1:N`, `N:N`) de arquivos `.prisma`, `.sql`, TypeORM/JPA/EntityFramework (`@Entity`, `DbSet`), Drizzle (`pgTable`, `mysqlTable`, `sqliteTable`) e SQLAlchemy.
   - **Classes, Interfaces & OOP**: Classes, interfaces, enums, relações de herança (`extends`), implementação (`implements`), composição e **encapsulamento** (`public`, `private`, `protected` para métodos e atributos) em TypeScript/JavaScript, Java, C# e Python.
   - **Grafo de Importações & Funções**: Onde funções e módulos são declarados e onde são importados/chamados.
   - **Reuso de Componentes UI em Telas**: Identifica páginas/telas (`pages/`, `app/`, `screens/`, `views/`) vs. componentes reutilizáveis (`components/`, `ui/`, `widgets/`) e rastreia em quais telas cada componente `<Componente />` é renderizado.
   - **Documentação arc42 & Markdown**: Carrega todos os capítulos de `doc/architecture/*.md` (compatível com a skill `generating-arc42`) ou inicializa templates base arc42 para edição.
3. Gerar na pasta `.arch-visualizer/` do repositório:
   - `arch-data.json`: Grafo completo e estruturado.
   - `arch-dashboard.html`: Aplicativo web interativo autocontido (funciona abrindo direto no navegador ou via servidor local).

### Passo 2: Enriquecimento Semântico pela IA (Auditoria Assistida)
Após rodar `analyze_repo.cjs`, leia o resumo impresso no terminal (ou inspecione `.arch-visualizer/arch-data.json`).
Se o usuário pediu uma auditoria detalhada ou atualização da documentação arc42:
1. Verifique alertas arquiteturais detectados (ex.: acoplamento excessivo, classes sem encapsulamento adequado, componentes órfãos ou duplicados).
2. Caso o projeto ainda não possua documentação em `doc/architecture/`, você pode usar a skill `generating-arc42` em conjunto ou atualizar os arquivos `.md` e reexecutar `analyze_repo.cjs` para que apareçam prontos no Editor Markdown/PDF do Dashboard.

### Passo 3: Iniciar o Servidor Local (Opcional, Recomendado para Edição `.md`)
Para permitir que o usuário edite arquivos `.md` (arc42) na interface web e salve diretamente no disco (além de exportar para PDF), inicie o servidor local:

```powershell
node "<caminho-da-skill>/scripts/serve_dashboard.cjs" "<caminho-do-repositorio>" 4242
```

Em seguida, informe ao usuário o link clicável para o arquivo `.arch-visualizer/arch-dashboard.html` e/ou a URL `http://localhost:4242`.
