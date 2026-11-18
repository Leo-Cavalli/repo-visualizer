/**
 * In-Browser Live Repository Scanner & Disk Writer (File System Access API + Fallback)
 * Works even when arch-dashboard.html is opened directly via file://
 */
(function () {
  const BROWSER_IGNORE_DIRS = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage',
    '.arch-visualizer', '.venv', 'venv', '__pycache__', 'target', 'bin', 'obj',
    '.idea', '.vscode', '.gradle'
  ]);
  const BROWSER_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.java', '.cs', '.py', '.prisma', '.sql', '.md']);

  async function writeFileToDirHandle(rootHandle, relPath, content) {
    const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
    const fileName = parts.pop();
    let curr = rootHandle;
    for (const dirName of parts) {
      curr = await curr.getDirectoryHandle(dirName, { create: true });
    }
    const fileHandle = await curr.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async function collectFilesFromDirHandle(dirHandle, prefix = '', out = []) {
    for await (const [name, entry] of dirHandle.entries()) {
      if (BROWSER_IGNORE_DIRS.has(name)) continue;
      const relPath = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === 'directory') {
        await collectFilesFromDirHandle(entry, relPath, out);
      } else if (entry.kind === 'file') {
        const dotIdx = name.lastIndexOf('.');
        const ext = dotIdx >= 0 ? name.slice(dotIdx).toLowerCase() : '';
        if (BROWSER_EXTS.has(ext)) {
          const fileObj = await entry.getFile();
          const content = await fileObj.text();
          out.push({ name, relPath, ext, content });
        }
      }
    }
    return out;
  }

  function analyzeFilesInBrowser(repoName, repoPath, files) {
    const nodesMap = new Map();
    const edges = [];
    const markdownDocs = [];
    const findings = [];
    const symbolToNodeId = new Map();

    function lineAt(content, idx) {
      return content.slice(0, idx).split('\n').length;
    }
    function addNode(node) {
      if (!nodesMap.has(node.id)) {
        nodesMap.set(node.id, { ...node, metrics: { inDegree: 0, outDegree: 0, reuseCount: 0 } });
      }
      return nodesMap.get(node.id);
    }
    function addEdge(source, target, type, label = '') {
      if (!source || !target || source === target) return;
      const key = `${source}-->${target}[${type}:${label}]`;
      if (!edges.some((e) => e.key === key)) edges.push({ key, source, target, type, label });
    }

    for (const file of files) {
      const c = file.content;
      if (file.ext === '.md') {
        markdownDocs.push({
          id: `doc:${file.relPath}`,
          title: file.name.replace(/\.md$/i, ''),
          path: file.relPath,
          category: file.relPath.includes('architecture') || file.relPath.includes('arc42') ? 'arc42' : 'project-doc',
          content: c
        });
        continue;
      }
      if (file.ext === '.prisma') {
        const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;
        let m;
        const rels = [];
        while ((m = modelRegex.exec(c)) !== null) {
          const modelName = m[1];
          const cols = [];
          for (const raw of m[2].split('\n')) {
            const l = raw.trim();
            if (!l || l.startsWith('//') || l.startsWith('@@')) continue;
            const cm = /^(\w+)\s+([\w\[\]\?]+)(.*)$/.exec(l);
            if (cm) {
              const [, colName, colType, rest] = cm;
              cols.push({
                name: colName,
                type: colType,
                isPk: rest.includes('@id'),
                isFk: rest.includes('@relation') || /Id$/i.test(colName),
                isUnique: rest.includes('@unique')
              });
              const cleanTarget = colType.replace(/[\[\]\?]/g, '');
              if (rest.includes('@relation') || /^[A-Z]/.test(cleanTarget)) {
                rels.push({ from: modelName, to: cleanTarget, field: colName, card: colType.includes('[]') ? '1:N' : 'N:1' });
              }
            }
          }
          const id = `db:${modelName}`;
          addNode({ id, label: modelName, category: 'database', subType: 'Prisma Model', file: file.relPath, line: lineAt(c, m.index), details: { columns: cols, orm: 'Prisma' } });
          symbolToNodeId.set(modelName, id);
        }
        rels.forEach((r) => {
          if (symbolToNodeId.has(r.to)) addEdge(`db:${r.from}`, `db:${r.to}`, 'db-relation', `${r.field} (${r.card})`);
        });
      }
      if (file.ext === '.sql') {
        const sqlRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"'\[]?(\w+)[`"'\]]?\s*\(([\s\S]*?)\);/gi;
        let m;
        while ((m = sqlRegex.exec(c)) !== null) {
          const tName = m[1];
          const id = `db:${tName}`;
          addNode({ id, label: tName, category: 'database', subType: 'SQL Table', file: file.relPath, line: lineAt(c, m.index), details: { columns: [], orm: 'SQL' } });
          symbolToNodeId.set(tName, id);
        }
      }
    }

    const codeFiles = files.filter((f) => !['.md', '.prisma', '.sql'].includes(f.ext));
    for (const file of codeFiles) {
      const c = file.content;
      const isScreen = /(^|\/)(pages|app|screens|views)\//i.test(file.relPath) || /(Page|Screen|View)\.(tsx|jsx|ts|js)$/i.test(file.name);
      const isCompDir = /(^|\/)(components|ui|widgets|shared)\//i.test(file.relPath);
      const isJSX = file.ext === '.tsx' || file.ext === '.jsx' || /<[A-Z]\w+/.test(c);

      const classRegex = /(?:export\s+)?(?:default\s+)?(?:public\s+|private\s+|protected\s+)?(abstract\s+class|class|interface|enum)\s+(\w+)(?:<[^>]+>)?(?:\s+extends\s+([\w.,\s<>]+?))?(?:\s+implements\s+([\w.,\s<>]+?))?\s*\{/g;
      let m;
      while ((m = classRegex.exec(c)) !== null) {
        const kind = m[1].replace(/\s+/g, ' ');
        const name = m[2];
        const extList = (m[3] || '').replace(/<[^>]+>/g, '').split(',').map((s) => s.trim()).filter(Boolean);
        const impList = (m[4] || '').replace(/<[^>]+>/g, '').split(',').map((s) => s.trim()).filter(Boolean);
        const cat = kind.includes('interface') ? 'interface' : kind.includes('enum') ? 'enum' : 'class';
        const id = `cls:${file.relPath}:${name}`;

        const snippet = c.slice(m.index + m[0].length, m.index + m[0].length + 2200);
        const members = [];
        for (const rawLine of snippet.split('\n')) {
          const l = rawLine.trim();
          if (l.startsWith('}')) break;
          const fm = /^(public|private|protected)\s+(?:readonly\s+|async\s+)*(\w+)(\s*\([^)]*\))?\s*(?::\s*([\w<>[\]|?]+))?/.exec(l);
          if (fm) {
            members.push({
              visibility: fm[1],
              name: `${fm[2]}${fm[3] ? '()' : ''}${fm[4] ? ': ' + fm[4] : ''}`,
              rawName: fm[2],
              kind: fm[3] ? 'method' : 'field',
              type: fm[4] || ''
            });
          }
        }

        addNode({ id, label: name, category: cat, subType: kind, file: file.relPath, line: lineAt(c, m.index), details: { extends: extList, implements: impList, members } });
        symbolToNodeId.set(name, id);
      }

      const fnRegex = /(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)|(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g;
      while ((m = fnRegex.exec(c)) !== null) {
        const fnName = m[1] || m[3];
        if (!fnName) continue;
        const isPascal = /^[A-Z]/.test(fnName);
        if (isPascal && (isJSX || isScreen || isCompDir)) {
          const cat = isScreen ? 'screen' : 'component';
          const id = `${cat}:${file.relPath}:${fnName}`;
          addNode({ id, label: fnName, category: cat, subType: isScreen ? 'Tela / Página UI' : 'Componente Reutilizável UI', file: file.relPath, line: lineAt(c, m.index), details: {} });
          symbolToNodeId.set(fnName, id);
        } else {
          const id = `fn:${file.relPath}:${fnName}`;
          addNode({ id, label: `${fnName}()`, category: 'function', subType: 'Função Exportada', file: file.relPath, line: lineAt(c, m.index), details: {} });
          symbolToNodeId.set(fnName, id);
        }
      }
    }

    for (const file of codeFiles) {
      const c = file.content;
      const fileNodes = Array.from(nodesMap.values()).filter((n) => n.file === file.relPath);
      const primary = fileNodes.find((n) => ['screen', 'component', 'class'].includes(n.category)) || fileNodes[0];
      if (!primary) continue;

      for (const n of fileNodes) {
        for (const b of (n.details && n.details.extends) || []) {
          if (symbolToNodeId.has(b)) addEdge(n.id, symbolToNodeId.get(b), 'extends', 'extends / herda');
        }
        for (const i of (n.details && n.details.implements) || []) {
          if (symbolToNodeId.has(i)) addEdge(n.id, symbolToNodeId.get(i), 'implements', 'implements');
        }
        for (const mem of (n.details && n.details.members) || []) {
          const cleanT = (mem.type || '').replace(/[\[\]<>?]/g, '');
          if (symbolToNodeId.has(cleanT) && symbolToNodeId.get(cleanT) !== n.id) {
            addEdge(n.id, symbolToNodeId.get(cleanT), 'composes', `compõe (${mem.rawName})`);
          }
        }
      }

      const impRegex = /import\s+([\s\S]*?)\s+from\s+['"`]([^'"`]+)['"`]/g;
      let m;
      while ((m = impRegex.exec(c)) !== null) {
        const names = m[1].replace(/[{}]/g, ' ').split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
        for (const sym of names) {
          const tId = symbolToNodeId.get(sym);
          const tNode = tId && nodesMap.get(tId);
          if (tNode && tNode.category !== 'component') {
            addEdge(primary.id, tId, 'imports', `importa ${sym}`);
          }
        }
      }

      if (file.ext === '.tsx' || file.ext === '.jsx' || /<[A-Z]\w+/.test(c)) {
        const jsxRegex = /<([A-Z]\w+)\b/g;
        const counts = new Map();
        while ((m = jsxRegex.exec(c)) !== null) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
        for (const [comp, count] of counts.entries()) {
          const tId = symbolToNodeId.get(comp);
          if (tId && tId !== primary.id) addEdge(primary.id, tId, 'renders', `usa <${comp}/> (${count}x)`);
        }
      }
    }

    for (const e of edges) {
      const s = nodesMap.get(e.source);
      const t = nodesMap.get(e.target);
      if (s) s.metrics.outDegree++;
      if (t) {
        t.metrics.inDegree++;
        if (['renders', 'imports', 'calls'].includes(e.type)) t.metrics.reuseCount++;
      }
    }

    const nodes = Array.from(nodesMap.values());
    for (const n of nodes) {
      if (n.category === 'class') {
        const pubFields = ((n.details && n.details.members) || []).filter((m) => m.kind === 'field' && m.visibility === 'public');
        if (pubFields.length >= 3) {
          findings.push({
            severity: 'warning',
            category: 'Encapsulamento OOP',
            target: n.label,
            file: n.file,
            line: n.line,
            message: `A classe '${n.label}' expõe ${pubFields.length} atributos públicos diretamente. Considere encapsular com private/protected.`
          });
        }
      }
      if (n.category === 'component' && n.metrics.reuseCount === 0) {
        findings.push({
          severity: 'info',
          category: 'Componente UI Sem Uso Detectado',
          target: n.label,
          file: n.file,
          line: n.line,
          message: `O componente '<${n.label} />' foi criado em ${n.file}, mas não está sendo renderizado em nenhuma tela.`
        });
      }
    }

    return {
      summary: {
        repoName,
        repoPath,
        generatedAt: new Date().toISOString(),
        counts: {
          totalFiles: files.length,
          tables: nodes.filter((n) => n.category === 'database').length,
          classes: nodes.filter((n) => ['class', 'interface', 'enum'].includes(n.category)).length,
          components: nodes.filter((n) => n.category === 'component').length,
          screens: nodes.filter((n) => n.category === 'screen').length,
          functions: nodes.filter((n) => n.category === 'function').length,
          modules: nodes.filter((n) => n.category === 'module').length,
          edges: edges.length,
          docs: markdownDocs.length,
          findings: findings.length
        }
      },
      nodes,
      edges,
      markdownDocs,
      findings
    };
  }

  window.BrowserScanner = {
    writeFileToDirHandle,
    collectFilesFromDirHandle,
    analyzeFilesInBrowser
  };
})();
