# Guia de Auditoria Visual e Integração arc42 (`repo-visualizer`)

Este documento descreve o formato de dados do `arch-data.json` e as regras de extração utilizadas pelo motor da skill `repo-visualizer`.

## 1. Camadas Rastreadas

1. **Banco de Dados (`category: "database"`)**
   - **Prisma (`schema.prisma`)**: Extrai `model`, campos escalares, `@id`, `@unique`, `@default` e `@relation` (`1:1`, `1:N`, `N:N`).
   - **SQL (`*.sql`)**: Extrai `CREATE TABLE`, tipos de colunas, `PRIMARY KEY` e `FOREIGN KEY (...) REFERENCES ...`.
   - **TypeORM / JPA / Hibernate / C# EF**: Extrai classes decoradas com `@Entity`, `@Table`, `@Column`, `@PrimaryGeneratedColumn`, `@OneToMany`, `@ManyToOne`, `@ManyToMany`, `@OneToOne`, e propriedades `DbSet<T>`.
   - **Drizzle ORM**: Extrai `pgTable`, `mysqlTable`, `sqliteTable` e referências `.references(() => ...)`.
   - **SQLAlchemy (Python)**: Extrai classes herdando de `Base`/`Model`, `__tablename__`, `Column`, `ForeignKey` e `relationship`.

2. **Classes, Interfaces & OOP (`category: "class" | "interface" | "enum"`)**
   - **Linguagens**: TypeScript (`.ts`, `.tsx`), JavaScript (`.js`, `.jsx`), Java (`.java`), C# (`.cs`), Python (`.py`).
   - **Relacionamentos**:
     - `extends`: Herança entre classes/interfaces.
     - `implements`: Implementação de contrato/interface.
     - `composes`: Composição / agregação (atributos tipados com outras classes do projeto).
   - **Encapsulamento**:
     - Mapeia métodos e atributos com visibilidade `public` (`+`), `private` (`-`) e `protected` (`#`).

3. **Componentes UI & Telas (`category: "screen" | "component"`)**
   - **Telas / Páginas (`screen`)**: Arquivos localizados em `pages/`, `app/`, `views/`, `screens/` ou terminados em `Page.tsx`, `Screen.tsx`, `View.tsx`.
   - **Componentes Reutilizáveis (`component`)**: Componentes React/JSX/TSX declarados em `components/`, `ui/`, `shared/`, `widgets/` ou exportados como funções PascalCase que retornam JSX.
   - **Arestas `renders`**: Ligam uma Tela (ou Componente Pai) aos Componentes Filhos utilizados (`<Botao />`, `<Modal />`), contabilizando o índice de reuso.

4. **Módulos, Funções & Imports (`category: "module" | "function"`)**
   - Rastreia funções exportadas (`export function`, `export const`, `public static`, `def`) e onde são importadas (`import ... from`, `require`, `using`).

## 2. Integração com a Skill `generating-arc42`

O dashboard possui a aba **"Documentação arc42 & PDF"** que carrega automaticamente todos os arquivos Markdown em:
- `doc/architecture/*.md`
- `doc/architecture/08_crosscutting_concepts/*.md`
- `doc/architecture/09_architecture_decision_records/*.md`
- Arquivos `.md` da raiz e pastas de documentação do projeto.

### Fluxo Recomendado com `generating-arc42`:
1. Use a skill `generating-arc42` para gerar ou atualizar os capítulos em `doc/architecture/` a partir do código-fonte.
2. Execute `node scripts/analyze_repo.cjs <repo>` da skill `repo-visualizer`.
3. Abra o Dashboard Interativo na aba **Documentação arc42 & PDF** para:
   - Revisar e editar os capítulos `.md` lado a lado com preview em tempo real (incluindo diagramas Mermaid coloridos segundo a convenção arc42).
   - Preencher os `TODO:` deixados para validação humana.
   - Salvar diretamente no repositório (via `serve_dashboard.cjs`) ou baixar o `.md`.
   - Exportar qualquer capítulo ou o caderno completo de arquitetura em **PDF formatado**.
