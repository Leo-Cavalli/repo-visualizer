#!/usr/bin/env node
/**
 * Repo Visualizer & AI Code Auditor - Static Analyzer & Graph Builder
 * Supports:
 * - TypeScript / JavaScript (React, Next.js, Node.js)
 * - Databases & ORMs (Prisma, SQL, TypeORM, Drizzle, JPA/Hibernate, Entity Framework, SQLAlchemy)
 * - OOP Languages (TypeScript, JavaScript, Java, C#, Python) -> Classes, Interfaces, Inheritance, Encapsulation
 * - UI Component Reuse across Screens/Pages
 * - arc42 Architecture Documentation (.md) loading & bootstrapping
 */

const fs = require('fs');
const path = require('path');

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage',
  '.arch-visualizer', '.venv', 'venv', '__pycache__', 'target', 'bin', 'obj',
  '.idea', '.vscode', '.gradle'
]);

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.java', '.cs', '.py', '.prisma', '.sql', '.md'
]);

function walkDir(dir, baseDir = dir, fileList = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return fileList;
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      walkDir(fullPath, baseDir, fileList);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (CODE_EXTENSIONS.has(ext)) {
        fileList.push({ fullPath, relPath, ext, name: entry.name });
      }
    }
  }
  return fileList;
}

function getLineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

function analyzeRepository(repoRoot) {
  const absRoot = path.resolve(repoRoot);
  const files = walkDir(absRoot);

  const nodesMap = new Map();
  const edges = [];
  const markdownDocs = [];
  const findings = [];

  function addNode(node) {
    if (!nodesMap.has(node.id)) {
      nodesMap.set(node.id, {
        ...node,
        metrics: { inDegree: 0, outDegree: 0, reuseCount: 0, ...(node.metrics || {}) }
      });
    } else {
      const existing = nodesMap.get(node.id);
      nodesMap.set(node.id, {
        ...existing,
        ...node,
        details: { ...(existing.details || {}), ...(node.details || {}) }
      });
    }
    return nodesMap.get(node.id);
  }

  function addEdge(source, target, type, label = '', meta = {}) {
    if (!source || !target || source === target) return;
    const key = `${source}-->${target}[${type}:${label}]`;
    if (!edges.some(e => e.key === key)) {
      edges.push({ key, source, target, type, label, meta });
    }
  }

  // Lookup maps for cross-file resolution
  const symbolToNodeId = new Map(); // SymbolName -> nodeId
  const fileToModuleNodeId = new Map(); // relPath -> nodeId

  // 1. First pass: parse Database schemas (.prisma, .sql) and Markdown files (.md)
  for (const file of files) {
    let content = '';
    try {
      content = fs.readFileSync(file.fullPath, 'utf8');
    } catch (e) {
      continue;
    }

    if (file.ext === '.md') {
      const isArc42 = file.relPath.includes('doc/architecture') || file.relPath.includes('arc42');
      markdownDocs.push({
        id: `doc:${file.relPath}`,
        title: file.name.replace(/\.md$/i, ''),
        path: file.relPath,
        category: isArc42 ? 'arc42' : 'project-doc',
        content
      });
      continue;
    }

    if (file.ext === '.prisma') {
      parsePrismaSchema(content, file, addNode, addEdge, symbolToNodeId);
      continue;
    }

    if (file.ext === '.sql') {
      parseSqlSchema(content, file, addNode, addEdge, symbolToNodeId);
      continue;
    }
  }

  // 2. Second pass: parse code files (.ts, .tsx, .js, .jsx, .java, .cs, .py)
  const codeFiles = files.filter(f => !['.md', '.prisma', '.sql'].includes(f.ext));

  for (const file of codeFiles) {
    let content = '';
    try {
      content = fs.readFileSync(file.fullPath, 'utf8');
    } catch (e) {
      continue;
    }

    const isScreen = /(^|\/)(pages|app|screens|views)\//i.test(file.relPath) ||
      /(Page|Screen|View)\.(tsx|jsx|ts|js)$/i.test(file.name);
    const isComponentDir = /(^|\/)(components|ui|widgets|shared)\//i.test(file.relPath);

    // Module node for every code file
    const moduleNodeId = `mod:${file.relPath}`;
    fileToModuleNodeId.set(file.relPath, moduleNodeId);

    // Parse Drizzle / TypeORM / SQLAlchemy / Entity Framework tables in code
    parseCodeORMs(content, file, addNode, addEdge, symbolToNodeId);

    // Parse Classes, Interfaces, Enums & Encapsulation
    parseClassesAndOOP(content, file, addNode, addEdge, symbolToNodeId);

    // Parse Exported Functions & React Components / Screens
    parseFunctionsAndUI(content, file, isScreen, isComponentDir, addNode, addEdge, symbolToNodeId, moduleNodeId);
  }

  // 3. Third pass: resolve imports, function calls, OOP inheritance/composition & JSX component usage
  for (const file of codeFiles) {
    let content = '';
    try {
      content = fs.readFileSync(file.fullPath, 'utf8');
    } catch (e) {
      continue;
    }

    resolveRelationships(content, file, codeFiles, nodesMap, addNode, addEdge, symbolToNodeId, fileToModuleNodeId);
  }

  // 4. Calculate node degrees, component reuse metrics & audit findings
  for (const edge of edges) {
    const src = nodesMap.get(edge.source);
    const tgt = nodesMap.get(edge.target);
    if (src) src.metrics.outDegree = (src.metrics.outDegree || 0) + 1;
    if (tgt) {
      tgt.metrics.inDegree = (tgt.metrics.inDegree || 0) + 1;
      if (edge.type === 'renders' || edge.type === 'imports' || edge.type === 'calls') {
        tgt.metrics.reuseCount = (tgt.metrics.reuseCount || 0) + 1;
      }
    }
  }

  // Generate automated AI Code Audit findings
  for (const node of nodesMap.values()) {
    if (node.category === 'class') {
      const members = (node.details && node.details.members) || [];
      const publicFields = members.filter(m => m.kind === 'field' && m.visibility === 'public');
      if (publicFields.length >= 3) {
        findings.push({
          severity: 'warning',
          category: 'Encapsulamento OOP',
          target: node.label,
          file: node.file,
          line: node.line,
          message: `A classe '${node.label}' expõe ${publicFields.length} atributos públicos diretamente. Considere encapsular com private/protected e métodos de domínio.`
        });
      }
      if (node.metrics.outDegree > 8) {
        findings.push({
          severity: 'warning',
          category: 'Alto Acoplamento',
          target: node.label,
          file: node.file,
          line: node.line,
          message: `A classe '${node.label}' depende de ${node.metrics.outDegree} outros elementos. Avalie aplicar Inversão de Dependência (SOLID) ou dividir responsabilidades.`
        });
      }
    }
    if (node.category === 'component' && node.metrics.reuseCount === 0) {
      findings.push({
        severity: 'info',
        category: 'Componente UI Sem Uso Detectado',
        target: node.label,
        file: node.file,
        line: node.line,
        message: `O componente '<${node.label} />' foi criado em ${node.file}, mas não está sendo renderizado em nenhuma tela ou componente.`
      });
    }
  }

  // Ensure default arc42 chapters are available in the editor if doc/architecture doesn't exist yet
  ensureArc42StarterDocs(markdownDocs, absRoot, nodesMap, edges);

  const nodes = Array.from(nodesMap.values());
  const summary = {
    repoName: path.basename(absRoot),
    repoPath: absRoot,
    generatedAt: new Date().toISOString(),
    counts: {
      totalFiles: files.length,
      tables: nodes.filter(n => n.category === 'database').length,
      classes: nodes.filter(n => n.category === 'class' || n.category === 'interface' || n.category === 'enum').length,
      components: nodes.filter(n => n.category === 'component').length,
      screens: nodes.filter(n => n.category === 'screen').length,
      functions: nodes.filter(n => n.category === 'function').length,
      modules: nodes.filter(n => n.category === 'module').length,
      edges: edges.length,
      docs: markdownDocs.length,
      findings: findings.length
    }
  };

  return { summary, nodes, edges, markdownDocs, findings };
}

// ============================================================================
// PARSERS: PRISMA, SQL, ORMs
// ============================================================================

function parsePrismaSchema(content, file, addNode, addEdge, symbolToNodeId) {
  const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let match;
  const pendingRelations = [];

  while ((match = modelRegex.exec(content)) !== null) {
    const modelName = match[1];
    const body = match[2];
    const line = getLineNumber(content, match.index);
    const nodeId = `db:${modelName}`;

    const columns = [];
    const lines = body.split('\n');
    for (const rawLine of lines) {
      const l = rawLine.trim();
      if (!l || l.startsWith('//') || l.startsWith('@@')) continue;
      const colMatch = /^(\w+)\s+([\w\[\]\?]+)(.*)$/.exec(l);
      if (colMatch) {
        const [, colName, colType, rest] = colMatch;
        const isPk = rest.includes('@id');
        const isFk = rest.includes('@relation') || /Id$/i.test(colName);
        const isUnique = rest.includes('@unique');
        columns.push({
          name: colName,
          type: colType,
          isPk,
          isFk,
          isUnique
        });

        const cleanTargetType = colType.replace(/[\[\]\?]/g, '');
        if (rest.includes('@relation') || /^[A-Z]/.test(cleanTargetType)) {
          const isMany = colType.includes('[]');
          pendingRelations.push({
            fromModel: modelName,
            toModel: cleanTargetType,
            fieldName: colName,
            cardinality: isMany ? '1:N' : 'N:1'
          });
        }
      }
    }

    addNode({
      id: nodeId,
      label: modelName,
      category: 'database',
      subType: 'Prisma Model',
      file: file.relPath,
      line,
      details: { columns, orm: 'Prisma' }
    });
    symbolToNodeId.set(modelName, nodeId);
  }

  for (const rel of pendingRelations) {
    const srcId = `db:${rel.fromModel}`;
    const tgtId = `db:${rel.toModel}`;
    if (symbolToNodeId.has(rel.toModel)) {
      addEdge(srcId, tgtId, 'db-relation', `${rel.fieldName} (${rel.cardinality})`);
    }
  }
}

function parseSqlSchema(content, file, addNode, addEdge, symbolToNodeId) {
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"'\[]?(\w+)[`"'\]]?\s*\(([\s\S]*?)\);/gi;
  let match;
  const fkRelations = [];

  while ((match = createTableRegex.exec(content)) !== null) {
    const tableName = match[1];
    const body = match[2];
    const line = getLineNumber(content, match.index);
    const nodeId = `db:${tableName}`;
    const columns = [];

    const colLines = body.split(/,\r?\n/);
    for (const raw of colLines) {
      const l = raw.trim();
      if (!l || l.startsWith('--')) continue;

      const fkInline = /FOREIGN\s+KEY\s*\([`"']?(\w+)[`"']?\)\s*REFERENCES\s+[`"']?(\w+)[`"']?\s*\([`"']?(\w+)[`"']?\)/i.exec(l);
      if (fkInline) {
        fkRelations.push({
          fromTable: tableName,
          fromCol: fkInline[1],
          toTable: fkInline[2],
          toCol: fkInline[3]
        });
        continue;
      }

      if (/^(PRIMARY|CONSTRAINT|UNIQUE|INDEX|KEY|CHECK)\b/i.test(l)) continue;

      const colMatch = /^[`"']?(\w+)[`"']?\s+([A-Za-z0-9_()]+)(.*)$/.exec(l);
      if (colMatch) {
        const [, colName, colType, rest] = colMatch;
        const isPk = /PRIMARY\s+KEY/i.test(rest);
        const refMatch = /REFERENCES\s+[`"']?(\w+)[`"']?(?:\s*\([`"']?(\w+)[`"']?\))?/i.exec(rest);
        const isFk = Boolean(refMatch) || /_id$/i.test(colName);
        if (refMatch) {
          fkRelations.push({
            fromTable: tableName,
            fromCol: colName,
            toTable: refMatch[1],
            toCol: refMatch[2] || 'id'
          });
        }
        columns.push({ name: colName, type: colType, isPk, isFk });
      }
    }

    addNode({
      id: nodeId,
      label: tableName,
      category: 'database',
      subType: 'SQL Table',
      file: file.relPath,
      line,
      details: { columns, orm: 'SQL' }
    });
    symbolToNodeId.set(tableName, nodeId);
  }

  for (const fk of fkRelations) {
    addEdge(`db:${fk.fromTable}`, `db:${fk.toTable}`, 'db-relation', `FK: ${fk.fromCol} → ${fk.toCol} (N:1)`);
  }
}

function parseCodeORMs(content, file, addNode, addEdge, symbolToNodeId) {
  // Drizzle ORM: pgTable('users', { ... })
  const drizzleRegex = /(?:export\s+const\s+(\w+)\s*=\s*)?(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"`](\w+)['"`]\s*,\s*\{([\s\S]*?)\}\s*\)/g;
  let match;
  while ((match = drizzleRegex.exec(content)) !== null) {
    const varName = match[1] || match[2];
    const tableName = match[2];
    const body = match[3];
    const line = getLineNumber(content, match.index);
    const nodeId = `db:${tableName}`;
    const columns = [];

    const fieldRegex = /(\w+)\s*:\s*(\w+)\s*\([^)]*\)([^\n,]*)/g;
    let fMatch;
    while ((fMatch = fieldRegex.exec(body)) !== null) {
      const [, colName, colType, chain] = fMatch;
      const isPk = chain.includes('primaryKey');
      const refMatch = /\.references\(\s*\(\)\s*=>\s*(\w+)\.(\w+)/.exec(chain);
      const isFk = Boolean(refMatch);
      columns.push({ name: colName, type: colType, isPk, isFk });
      if (refMatch) {
        addEdge(nodeId, `db:${refMatch[1]}`, 'db-relation', `${colName} → ${refMatch[1]}.${refMatch[2]} (N:1)`);
      }
    }

    addNode({
      id: nodeId,
      label: tableName,
      category: 'database',
      subType: 'Drizzle Table',
      file: file.relPath,
      line,
      details: { columns, orm: 'Drizzle', symbol: varName }
    });
    symbolToNodeId.set(varName, nodeId);
    symbolToNodeId.set(tableName, nodeId);
  }

  // TypeORM / JPA @Entity
  if (/@Entity\b/.test(content) || /@Table\b/.test(content)) {
    const entityRegex = /@(?:Entity|Table)\s*(?:\(\s*(?:['"`](\w+)['"`]|\{[^}]*name\s*:\s*['"`](\w+)['"`][^}]*\})?\s*\))?[\s\S]{0,120}?class\s+(\w+)/g;
    while ((match = entityRegex.exec(content)) !== null) {
      const tableName = match[1] || match[2] || match[3];
      const className = match[3];
      const line = getLineNumber(content, match.index);
      const nodeId = `db:${className}`;
      addNode({
        id: nodeId,
        label: `${className} (${tableName})`,
        category: 'database',
        subType: 'ORM Entity',
        file: file.relPath,
        line,
        details: { orm: 'TypeORM/JPA', columns: [] }
      });
      symbolToNodeId.set(className, nodeId);
    }
  }
}

// ============================================================================
// PARSERS: CLASSES, INTERFACES, INHERITANCE & ENCAPSULATION (TS/JS, Java, C#, Python)
// ============================================================================

function parseClassesAndOOP(content, file, addNode, addEdge, symbolToNodeId) {
  if (file.ext === '.py') {
    const pyClassRegex = /^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/gm;
    let match;
    while ((match = pyClassRegex.exec(content)) !== null) {
      const className = match[1];
      const bases = (match[2] || '').split(',').map(s => s.trim()).filter(Boolean);
      const line = getLineNumber(content, match.index);
      const nodeId = `cls:${file.relPath}:${className}`;

      // Extract Python methods & encapsulation (_protected, __private, public)
      const afterClass = content.slice(match.index, match.index + 3500);
      const members = [];
      const defRegex = /^\s{2,4}def\s+(\w+)\s*\(([^)]*)\)/gm;
      let dMatch;
      while ((dMatch = defRegex.exec(afterClass)) !== null) {
        const mName = dMatch[1];
        const visibility = mName.startsWith('__') && !mName.endsWith('__')
          ? 'private'
          : mName.startsWith('_')
            ? 'protected'
            : 'public';
        members.push({ name: `${mName}()`, kind: 'method', visibility });
      }

      addNode({
        id: nodeId,
        label: className,
        category: 'class',
        subType: 'Python Class',
        file: file.relPath,
        line,
        details: { bases, members, language: 'Python' }
      });
      symbolToNodeId.set(className, nodeId);
    }
    return;
  }

  // TypeScript, JavaScript, Java, C#
  const classRegex = /(?:export\s+)?(?:default\s+)?(?:public\s+|private\s+|protected\s+|internal\s+)?(abstract\s+class|class|interface|enum)\s+(\w+)(?:<[^>]+>)?(?:\s+extends\s+([\w.,\s<>]+?))?(?:\s+implements\s+([\w.,\s<>]+?))?(?:\s*:\s*([\w.,\s<>]+?))?\s*\{/g;
  let match;
  while ((match = classRegex.exec(content)) !== null) {
    const rawKind = match[1].replace(/\s+/g, ' ');
    const name = match[2];
    const extendsClause = match[3] || '';
    const implementsClause = match[4] || '';
    const csharpColonClause = match[5] || '';
    const line = getLineNumber(content, match.index);

    const category = rawKind.includes('interface')
      ? 'interface'
      : rawKind.includes('enum')
        ? 'enum'
        : 'class';

    const bodySnippet = extractBalancedBraces(content, match.index + match[0].length - 1);
    const members = extractOOPMembers(bodySnippet, file.ext);

    const nodeId = `cls:${file.relPath}:${name}`;
    addNode({
      id: nodeId,
      label: name,
      category,
      subType: rawKind,
      file: file.relPath,
      line,
      details: {
        extends: parseTypeList(extendsClause),
        implements: parseTypeList(implementsClause),
        csharpBases: parseTypeList(csharpColonClause),
        members,
        encapsulationSummary: {
          public: members.filter(m => m.visibility === 'public').length,
          protected: members.filter(m => m.visibility === 'protected').length,
          private: members.filter(m => m.visibility === 'private').length
        }
      }
    });
    if (!symbolToNodeId.has(name)) {
      symbolToNodeId.set(name, nodeId);
    }
  }
}

function extractBalancedBraces(content, openBraceIdx) {
  let depth = 0;
  const maxLen = Math.min(content.length, openBraceIdx + 6000);
  for (let i = openBraceIdx; i < maxLen; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) return content.slice(openBraceIdx + 1, i);
    }
  }
  return content.slice(openBraceIdx + 1, maxLen);
}

function parseTypeList(clause) {
  if (!clause) return [];
  return clause
    .replace(/<[^>]+>/g, '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function extractOOPMembers(body, ext) {
  const members = [];
  const lines = body.split('\n');
  for (const raw of lines) {
    const l = raw.trim();
    if (!l || l.startsWith('//') || l.startsWith('/*') || l.startsWith('*')) continue;

    // Match visibility + member
    const methodMatch = /^(?:(public|private|protected|internal|readonly|static|async)\s+)*(?:(public|private|protected)\s+)?(?:async\s+|static\s+|readonly\s+|override\s+|virtual\s+)*(\w+)\s*\(([^)]*)\)\s*(?::\s*([\w<>[\]|?]+))?/.exec(l);
    if (methodMatch && !['if', 'for', 'while', 'switch', 'catch', 'return', 'super'].includes(methodMatch[3])) {
      const vis = methodMatch[2] || (['public', 'private', 'protected'].includes(methodMatch[1]) ? methodMatch[1] : 'public');
      const name = methodMatch[3];
      const returnType = methodMatch[5] || '';
      members.push({
        name: `${name}()${returnType ? ': ' + returnType : ''}`,
        rawName: name,
        kind: 'method',
        visibility: vis,
        type: returnType
      });
      continue;
    }

    const fieldMatch = /^(public|private|protected|readonly)\s+(?:readonly\s+)?(#?\w+)\s*[?:]?\s*:\s*([\w<>[\]|?]+)/.exec(l) ||
      /^(public|private|protected)\s+(?:static\s+|final\s+|readonly\s+)*([\w<>[\]]+)\s+(\w+)\s*[;=]/.exec(l);
    if (fieldMatch) {
      const isJavaCSharp = !l.includes(':') || l.indexOf(' ') < l.indexOf(':');
      const vis = fieldMatch[1] === 'readonly' ? 'public' : fieldMatch[1];
      const name = isJavaCSharp ? fieldMatch[3] : fieldMatch[2];
      const type = isJavaCSharp ? fieldMatch[2] : fieldMatch[3];
      members.push({
        name: `${name}: ${type}`,
        rawName: name,
        kind: 'field',
        visibility: name.startsWith('#') ? 'private' : vis,
        type
      });
    }
  }
  return members.slice(0, 30);
}

// ============================================================================
// PARSERS: FUNCTIONS, UI COMPONENTS & SCREENS
// ============================================================================

function parseFunctionsAndUI(content, file, isScreen, isComponentDir, addNode, addEdge, symbolToNodeId, moduleNodeId) {
  const isJSXFile = file.ext === '.tsx' || file.ext === '.jsx' || /<[A-Z]\w+/.test(content);

  // Named functions & arrow functions
  const fnRegex = /(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)|(?:export\s+)?const\s+(\w+)\s*(?::\s*[\w.<>[\]]+\s*)?=\s*(?:React\.memo\(|forwardRef\()?\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*[\w.<>[\]]+\s*)?=>/g;
  let match;
  let foundAnyInFile = false;

  while ((match = fnRegex.exec(content)) !== null) {
    const fnName = match[1] || match[3];
    if (!fnName) continue;
    const isPascalCase = /^[A-Z]/.test(fnName);
    const line = getLineNumber(content, match.index);

    if (isPascalCase && (isJSXFile || isScreen || isComponentDir)) {
      const category = isScreen ? 'screen' : 'component';
      const nodeId = `${category}:${file.relPath}:${fnName}`;
      addNode({
        id: nodeId,
        label: fnName,
        category,
        subType: isScreen ? 'Tela / Página UI' : 'Componente Reutilizável UI',
        file: file.relPath,
        line,
        details: { propsRaw: (match[2] || match[4] || '').trim() }
      });
      symbolToNodeId.set(fnName, nodeId);
      foundAnyInFile = true;
    } else if (match[0].startsWith('export') || !isJSXFile) {
      const nodeId = `fn:${file.relPath}:${fnName}`;
      addNode({
        id: nodeId,
        label: `${fnName}()`,
        category: 'function',
        subType: 'Função Exportada',
        file: file.relPath,
        line,
        details: { params: (match[2] || match[4] || '').trim() }
      });
      symbolToNodeId.set(fnName, nodeId);
      foundAnyInFile = true;
    }
  }

  // Always add module node if no top-level component/screen was registered or to track file-level imports
  if (!foundAnyInFile) {
    addNode({
      id: moduleNodeId,
      label: file.name,
      category: isScreen ? 'screen' : isComponentDir ? 'component' : 'module',
      subType: 'Módulo / Arquivo',
      file: file.relPath,
      line: 1,
      details: {}
    });
  }
}

// ============================================================================
// RELATIONSHIP RESOLVER (IMPORTS, INHERITANCE, COMPOSITION, JSX REUSE, DB ACCESS)
// ============================================================================

function resolveRelationships(content, file, codeFiles, nodesMap, addNode, addEdge, symbolToNodeId, fileToModuleNodeId) {
  // Primary node representing this file (prefer screen/component/class in this file)
  const fileNodes = Array.from(nodesMap.values()).filter(n => n.file === file.relPath);
  const primaryNode = fileNodes.find(n => ['screen', 'component', 'class'].includes(n.category)) ||
    fileNodes[0] ||
    addNode({
      id: `mod:${file.relPath}`,
      label: file.name,
      category: 'module',
      subType: 'Módulo',
      file: file.relPath,
      line: 1,
      details: {}
    });

  // 1. Resolve OOP Inheritance (extends / implements / bases)
  for (const node of fileNodes) {
    if (node.category === 'class' || node.category === 'interface') {
      const extList = [
        ...(node.details.extends || []),
        ...(node.details.bases || []),
        ...(node.details.csharpBases || [])
      ];
      for (const baseName of extList) {
        const targetId = symbolToNodeId.get(baseName);
        if (targetId) {
          addEdge(node.id, targetId, 'extends', 'extends / herda');
        }
      }
      for (const ifaceName of (node.details.implements || [])) {
        const targetId = symbolToNodeId.get(ifaceName);
        if (targetId) {
          addEdge(node.id, targetId, 'implements', 'implements');
        }
      }
      // Composition: fields referencing other classes/interfaces
      for (const member of (node.details.members || [])) {
        if (member.type) {
          const cleanType = member.type.replace(/[\[\]<>?]/g, '');
          const targetId = symbolToNodeId.get(cleanType);
          if (targetId && targetId !== node.id) {
            addEdge(node.id, targetId, 'composes', `compõe (${member.rawName || member.name})`);
          }
        }
      }
    }
  }

  // 2. Resolve ES / TS Imports: import { A, B } from './path'
  const importRegex = /import\s+([\s\S]*?)\s+from\s+['"`]([^'"`]+)['"`]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const specifiers = match[1];
    const importPath = match[2];

    const names = specifiers
      .replace(/[{}]/g, ' ')
      .replace(/\*\s+as\s+/g, '')
      .split(',')
      .map(s => s.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);

    for (const sym of names) {
      const targetId = symbolToNodeId.get(sym);
      if (targetId) {
        const targetNode = nodesMap.get(targetId);
        if (targetNode && targetNode.category === 'function') {
          addEdge(primaryNode.id, targetId, 'imports', `importa ${sym}()`);
        } else if (targetNode && targetNode.category !== 'component') {
          addEdge(primaryNode.id, targetId, 'imports', `importa ${sym}`);
        }
      }
    }
  }

  // 3. Resolve JSX Component Rendering (<ComponentName ... />)
  if (file.ext === '.tsx' || file.ext === '.jsx' || /<[A-Z]\w+/.test(content)) {
    const jsxRegex = /<([A-Z]\w+)\b/g;
    const renderCounts = new Map();
    while ((match = jsxRegex.exec(content)) !== null) {
      const compName = match[1];
      renderCounts.set(compName, (renderCounts.get(compName) || 0) + 1);
    }
    for (const [compName, count] of renderCounts.entries()) {
      const targetId = symbolToNodeId.get(compName);
      if (targetId && targetId !== primaryNode.id) {
        const targetNode = nodesMap.get(targetId);
        if (targetNode && (targetNode.category === 'component' || targetNode.category === 'screen')) {
          addEdge(primaryNode.id, targetId, 'renders', `usa <${compName}/> (${count}x)`, { count });
        }
      }
    }
  }

  // 4. Resolve Database Queries (prisma.user.findMany, db.select().from(users), etc.)
  const prismaCallRegex = /\bprisma\.(\w+)\.(findMany|findUnique|findFirst|create|update|delete|upsert|count)/g;
  while ((match = prismaCallRegex.exec(content)) !== null) {
    const modelLower = match[1].toLowerCase();
    const op = match[2];
    for (const [sym, id] of symbolToNodeId.entries()) {
      if (id.startsWith('db:') && sym.toLowerCase() === modelLower) {
        addEdge(primaryNode.id, id, 'queries', `prisma.${match[1]}.${op}()`);
      }
    }
  }
}

// ============================================================================
// ARC42 STARTER TEMPLATES (Compatible with generating-arc42 skill)
// ============================================================================

function ensureArc42StarterDocs(markdownDocs, absRoot, nodesMap, edges) {
  const hasArc42 = markdownDocs.some(d => d.category === 'arc42');
  if (hasArc42) return;

  const repoName = path.basename(absRoot);
  const nodes = Array.from(nodesMap.values());
  const dbNodes = nodes.filter(n => n.category === 'database');
  const classNodes = nodes.filter(n => n.category === 'class' || n.category === 'interface');
  const screenNodes = nodes.filter(n => n.category === 'screen');
  const compNodes = nodes.filter(n => n.category === 'component');

  // Build auto-generated Mermaid diagram following generating-arc42 blue/green/white convention
  const mermaidLines = [
    'flowchart TB',
    '  classDef blue fill:#1e40af,stroke:#93c5fd,color:#ffffff;',
    '  classDef green fill:#065f46,stroke:#6ee7b7,color:#ffffff;',
    '  classDef white fill:#f8fafc,stroke:#64748b,color:#0f172a;'
  ];

  screenNodes.slice(0, 6).forEach((s, i) => {
    mermaidLines.push(`  S${i}["Tela: ${s.label}"]:::blue`);
  });
  compNodes.slice(0, 8).forEach((c, i) => {
    mermaidLines.push(`  C${i}["UI: ${c.label}"]:::blue`);
  });
  classNodes.slice(0, 8).forEach((c, i) => {
    mermaidLines.push(`  CLS${i}["Classe: ${c.label}"]:::green`);
  });
  dbNodes.slice(0, 6).forEach((d, i) => {
    mermaidLines.push(`  DB${i}[("Tabela: ${d.label}")]:::white`);
  });

  const starterChapters = [
    {
      id: 'doc:doc/architecture/01_introduction_and_goals.md',
      title: '01 - Introdução e Objetivos (arc42)',
      path: 'doc/architecture/01_introduction_and_goals.md',
      category: 'arc42',
      content: `<!-- arc42:generated -->
# 1. Introdução e Objetivos — ${repoName}

## 1.1 Visão Geral de Requisitos
Este documento descreve a arquitetura do repositório **${repoName}**, extraída e auditada via \`repo-visualizer\` em conjunto com o padrão **arc42**.

- **Tabelas / Entidades de Dados mapeadas:** ${dbNodes.length}
- **Classes / Interfaces OOP mapeadas:** ${classNodes.length}
- **Telas / Páginas mapeadas:** ${screenNodes.length}
- **Componentes UI reutilizáveis:** ${compNodes.length}

## 1.2 Metas de Qualidade
| Prioridade | Meta de Qualidade | Cenário / Motivação |
| :--- | :--- | :--- |
| 1 | **Auditabilidade do Código IA** | Rastreamento visual de classes, banco e componentes |
| 2 | **Reuso e Modularidade** | Evitar duplicação de componentes UI e serviços |
| 3 | **Encapsulamento e Coesão** | Controle explícito de visibilidade (\`public\` / \`private\` / \`protected\`) |

## 1.3 Stakeholders
- \`TODO:\` Preencher responsáveis técnicos e de negócio do projeto.
<!-- /arc42:generated -->`
    },
    {
      id: 'doc:doc/architecture/05_building_block_view.md',
      title: '05 - Visão de Blocos de Construção (arc42)',
      path: 'doc/architecture/05_building_block_view.md',
      category: 'arc42',
      content: `<!-- arc42:generated -->
# 5. Visão de Blocos de Construção (Building Block View)

## 5.1 Diagrama Geral de Componentes Extraídos

\`\`\`mermaid
${mermaidLines.join('\n')}
\`\`\`

## 5.2 Inventário de Módulos e Classes
${classNodes.map(c => `- **${c.label}** (\`${c.file}:${c.line}\`) — Tipo: \`${c.subType}\``).join('\n') || '- Nenhuma classe detectada ainda.'}

## 5.3 Inventário de Tabelas do Banco de Dados
${dbNodes.map(d => `- **${d.label}** (\`${d.file}:${d.line}\`) — ORM/Fonte: \`${d.subType}\``).join('\n') || '- Nenhuma tabela detectada ainda.'}
<!-- /arc42:generated -->`
    },
    {
      id: 'doc:doc/architecture/12_glossary.md',
      title: '12 - Glossário de Domínio (arc42)',
      path: 'doc/architecture/12_glossary.md',
      category: 'arc42',
      content: `<!-- arc42:generated -->
# 12. Glossário

| Termo / Entidade | Tipo | Origem no Código | Descrição |
| :--- | :--- | :--- | :--- |
${[...dbNodes, ...classNodes, ...compNodes].slice(0, 20).map(n => `| **${n.label}** | ${n.category} | \`${n.file}\` | \`TODO:\` Descrever papel no domínio |`).join('\n')}
<!-- /arc42:generated -->`
    }
  ];

  markdownDocs.unshift(...starterChapters);
}

// ============================================================================
// MAIN CLI ENTRYPOINT
// ============================================================================

function writeVisualizerOutput(absRepo, data) {
  const outDir = path.join(absRepo, '.arch-visualizer');
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, 'arch-data.json');
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');

  const jsDataPath = path.join(outDir, 'arch-data.js');
  fs.writeFileSync(jsDataPath, `window.__ARCH_DATA__ = ${JSON.stringify(data, null, 2)};\n`, 'utf8');

  const resDir = path.join(__dirname, '..', 'resources');
  const assetFiles = [
    { src: 'dashboard-template.html', dest: 'arch-dashboard.html' },
    { src: 'styles.css', dest: 'styles.css' },
    { src: 'svg-engine.js', dest: 'svg-engine.js' },
    { src: 'c4-engine.js', dest: 'c4-engine.js' },
    { src: 'browser-scanner.js', dest: 'browser-scanner.js' },
    { src: 'app.js', dest: 'app.js' }
  ];

  for (const asset of assetFiles) {
    const srcPath = path.join(resDir, asset.src);
    const destPath = path.join(outDir, asset.dest);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  console.log(`[repo-visualizer] Dashboard modular gerado em: ${path.join(outDir, 'arch-dashboard.html')}`);
}

function main() {
  const targetRepo = process.argv[2] || process.cwd();
  const absRepo = path.resolve(targetRepo);

  if (!fs.existsSync(absRepo)) {
    console.error(`[repo-visualizer] Diretório não encontrado: ${absRepo}`);
    process.exit(1);
  }

  console.log(`[repo-visualizer] Analisando repositório: ${absRepo} ...`);
  const data = analyzeRepository(absRepo);
  writeVisualizerOutput(absRepo, data);
  console.log(`[repo-visualizer] Resumo da extração:`, JSON.stringify(data.summary.counts, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { analyzeRepository, writeVisualizerOutput };
