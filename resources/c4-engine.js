/**
 * C4 Model Engine & Interactive Generator (Levels C1 -> C2 -> C3 -> C4 Code)
 * Follows Simon Brown's official C4 notation (c4model.com), George Fairbanks' Model-View separation,
 * layered topological tiers to eliminate edge tangling, and resizable dashed boundaries.
 */
(function () {
  function inferExternalSystems(data) {
    const externals = [];
    const seen = new Set();

    for (const n of data.nodes) {
      const lbl = n.label || '';
      if (/stripe/i.test(lbl) && !seen.has('stripe')) {
        seen.add('stripe');
        externals.push({
          id: 'c4:ext:stripe',
          label: 'Stripe Payment Gateway',
          c4Type: 'External System',
          tech: 'REST API / Webhooks',
          description: 'Processamento externo de pagamentos e cobranças integrado via Adapter.',
          color: '#334155',
          borderColor: '#94a3b8',
          linkedNodeId: n.id,
          tier: 5,
          containerGroup: 'external'
        });
      }
      if (/(mail|sendgrid|smtp|ses)/i.test(lbl) && !seen.has('mail')) {
        seen.add('mail');
        externals.push({
          id: 'c4:ext:mail',
          label: 'External Email Service',
          c4Type: 'External System',
          tech: 'SMTP / HTTPS API',
          description: 'Serviço externo de envio de e-mails e notificações.',
          color: '#334155',
          borderColor: '#94a3b8',
          linkedNodeId: n.id,
          tier: 5,
          containerGroup: 'external'
        });
      }
    }

    if (externals.length === 0) {
      externals.push({
        id: 'c4:ext:default',
        label: 'External Third-Party APIs',
        c4Type: 'External System',
        tech: 'HTTPS / JSON',
        description: 'Serviços externos e provedores integrados pela camada de domínio.',
        color: '#334155',
        borderColor: '#94a3b8',
        linkedNodeId: null,
        tier: 5,
        containerGroup: 'external'
      });
    }
    return externals;
  }

  function formatShortC4Metadata(node) {
    const cat = node.category;
    const sub = (node.subType || '').toLowerCase();
    if (cat === 'screen') {
      return { c4Type: 'Component: Screen', tech: 'React / TSX', tier: 1, group: 'webapp' };
    }
    if (cat === 'component') {
      return { c4Type: 'Component: UI Widget', tech: 'React / TSX', tier: 2, group: 'webapp' };
    }
    if (cat === 'function') {
      return { c4Type: 'Component: Utility Fn', tech: 'TS Module', tier: 3, group: 'backend' };
    }
    if (cat === 'interface') {
      return { c4Type: 'Component: Interface', tech: 'TypeScript OOP', tier: 4, group: 'backend' };
    }
    if (sub.includes('abstract')) {
      return { c4Type: 'Component: Abstract', tech: 'TypeScript OOP', tier: 4, group: 'backend' };
    }
    return { c4Type: 'Component: Class', tech: 'TypeScript OOP', tier: 3, group: 'backend' };
  }

  function buildC4Graph(data, level, containerFilter) {
    const repoName = (data.summary && data.summary.repoName) || 'Software System';
    const c = (data.summary && data.summary.counts) || {};
    const externals = inferExternalSystems(data);

    const nodes = [];
    const edges = [];
    const boundaries = [];

    const personNode = {
      id: 'c4:person:user',
      label: 'Usuário / Cliente',
      c4Type: 'Person',
      tech: 'Ator Humano / Browser',
      description: `Interage com as telas e fluxos do sistema ${repoName}.`,
      color: '#08427b',
      borderColor: '#38bdf8',
      isPerson: true,
      tier: 0,
      containerGroup: 'person'
    };

    // =========================================================================
    // LEVEL 1: SYSTEM CONTEXT (C1)
    // =========================================================================
    if (level === 'c1') {
      nodes.push(personNode);

      const sysNode = {
        id: 'c4:sys:main',
        label: repoName,
        c4Type: 'Software System',
        tech: `${c.screens || 0} Telas · ${c.classes || 0} Classes · ${c.tables || 0} Tabelas`,
        description: 'Sistema principal analisado neste repositório. Duplo-clique para abrir C2.',
        color: '#1168bd',
        borderColor: '#60a5fa',
        tier: 1,
        containerGroup: 'system',
        drillTarget: { level: 'c2', container: 'all' }
      };
      nodes.push(sysNode);

      edges.push({
        source: personNode.id,
        target: sysNode.id,
        label: 'Utiliza interfaces e fluxos',
        tech: 'HTTPS / Web UI'
      });

      for (const ext of externals) {
        nodes.push({ ...ext, tier: 2 });
        edges.push({
          source: sysNode.id,
          target: ext.id,
          label: 'Integra / Consome API',
          tech: ext.tech
        });
      }

      boundaries.push({
        id: 'c1:boundary:context',
        group: 'system',
        label: `${repoName} [Enterprise / Context Scope]`,
        subLabel: 'Escopo do sistema principal (Arraste as alças azuis nas bordas para redimensionar)',
        strokeColor: '#38bdf8'
      });

      return {
        levelTitle: `C1 — Diagrama de Contexto do Sistema (${repoName})`,
        levelSubtitle: 'Visão de nível mais alto (Simon Brown C4): Pessoas, o Sistema em escopo e Sistemas Externos.',
        nodes,
        edges,
        boundaries
      };
    }

    // =========================================================================
    // LEVEL 2: CONTAINERS (C2)
    // =========================================================================
    if (level === 'c2') {
      nodes.push(personNode);

      const hasUI = (c.screens || 0) + (c.components || 0) > 0;
      const hasBackend = (c.classes || 0) + (c.functions || 0) > 0;
      const hasDB = (c.tables || 0) > 0;

      if (hasUI) {
        nodes.push({
          id: 'c4:cont:webapp',
          label: 'Web Application (Frontend)',
          c4Type: 'Container',
          tech: 'React / TypeScript / JSX',
          description: `Entrega ${c.screens || 0} tela(s) e ${c.components || 0} componente(s) UI. Duplo-clique para C3.`,
          color: '#1d4ed8',
          borderColor: '#93c5fd',
          inBoundary: true,
          tier: 1,
          containerGroup: 'system',
          drillTarget: { level: 'c3', container: 'webapp' }
        });
        edges.push({
          source: personNode.id,
          target: 'c4:cont:webapp',
          label: 'Acessa páginas e componentes',
          tech: 'HTTPS / Browser'
        });
      }

      if (hasBackend) {
        nodes.push({
          id: 'c4:cont:backend',
          label: 'Domain & Application Services',
          c4Type: 'Container',
          tech: 'TypeScript / Node.js / OOP',
          description: `Regras de negócio (${c.classes || 0} classes/interfaces, ${c.functions || 0} funções). Duplo-clique para C3.`,
          color: '#1e40af',
          borderColor: '#60a5fa',
          inBoundary: true,
          tier: 2,
          containerGroup: 'system',
          drillTarget: { level: 'c3', container: 'backend' }
        });
        if (hasUI) {
          edges.push({
            source: 'c4:cont:webapp',
            target: 'c4:cont:backend',
            label: 'Invoca serviços e utilitários',
            tech: 'TS Modules'
          });
        } else {
          edges.push({
            source: personNode.id,
            target: 'c4:cont:backend',
            label: 'Executa operações',
            tech: 'API / CLI'
          });
        }
      }

      if (hasDB) {
        nodes.push({
          id: 'c4:cont:database',
          label: 'Relational Database',
          c4Type: 'Container: DB',
          tech: 'PostgreSQL / Prisma / SQL',
          description: `Armazena ${c.tables || 0} tabela(s) relacionais. Duplo-clique para abrir o DER (C4-L4).`,
          color: '#b45309',
          borderColor: '#fbbf24',
          isDatabase: true,
          inBoundary: true,
          tier: 3,
          containerGroup: 'system',
          drillTarget: { level: 'c4-db' }
        });
        if (hasBackend) {
          edges.push({
            source: 'c4:cont:backend',
            target: 'c4:cont:database',
            label: 'Lê e persiste entidades',
            tech: 'Prisma / SQL'
          });
        }
      }

      for (const ext of externals) {
        nodes.push({ ...ext, tier: 4 });
        if (hasBackend) {
          edges.push({
            source: 'c4:cont:backend',
            target: ext.id,
            label: 'Chama gateway externo',
            tech: ext.tech
          });
        }
      }

      boundaries.push({
        id: 'c2:boundary:system',
        group: 'system',
        label: `${repoName} [System Boundary]`,
        subLabel: 'Fronteira interna do sistema (Arraste o topo para mover ou as alças para redimensionar)',
        strokeColor: '#60a5fa'
      });

      return {
        levelTitle: `C2 — Diagrama de Contêineres (${repoName})`,
        levelSubtitle: 'Unidades executáveis/aplicações e bancos de dados dentro da fronteira do sistema.',
        nodes,
        edges,
        boundaries
      };
    }

    // =========================================================================
    // LEVEL 3: COMPONENTS (C3) — LAYERED TOPOLOGICAL TIERS + SEPARATE BOUNDARIES
    // =========================================================================
    const filter = containerFilter || 'all';
    const rawNodes = data.nodes.filter((n) => {
      if (filter === 'webapp') return ['screen', 'component', 'function'].includes(n.category);
      if (filter === 'backend') return ['class', 'interface', 'enum', 'function'].includes(n.category);
      return ['screen', 'component', 'class', 'interface', 'function'].includes(n.category);
    });

    const selectedIds = new Set(rawNodes.map((n) => n.id));

    for (const n of rawNodes) {
      const isUI = n.category === 'screen' || n.category === 'component';
      const isOOP = n.category === 'class' || n.category === 'interface';
      const meta = formatShortC4Metadata(n);
      const shortFile = `${n.file}:${n.line || 1}`;

      nodes.push({
        id: n.id,
        label: n.label,
        c4Type: meta.c4Type,
        tech: meta.tech,
        fileBadge: shortFile,
        description: isOOP
          ? `Componente de domínio OOP. Duplo-clique para abrir UML (C4-L4).`
          : isUI
            ? `Componente visual UI reutilizado ${n.metrics ? n.metrics.reuseCount : 0}x nas telas.`
            : `Função utilitária exportada e compartilhada entre módulos.`,
        color: n.category === 'screen'
          ? '#1e3a8a'
          : isUI
            ? '#065f46'
            : isOOP
              ? '#3b0764'
              : '#155e75',
        borderColor: n.category === 'screen'
          ? '#60a5fa'
          : isUI
            ? '#34d399'
            : isOOP
              ? '#c084fc'
              : '#22d3ee',
        inBoundary: true,
        tier: meta.tier,
        containerGroup: filter === 'webapp' ? 'webapp' : filter === 'backend' ? 'backend' : meta.group,
        originalNode: n,
        drillTarget: isOOP ? { level: 'c4-oop', targetLabel: n.label } : null
      });
    }

    // Add External Database Container in Tier 5 (strictly outside the component boundaries!)
    const dbNodes = data.nodes.filter((n) => n.category === 'database');
    if (dbNodes.length > 0 && filter !== 'webapp') {
      const dbNames = dbNodes.map((d) => d.label).join(', ');
      nodes.push({
        id: 'c4:cont:database',
        label: `Relational DB (${dbNodes.length} tabelas)`,
        c4Type: 'Container: DB',
        tech: 'Prisma / SQL',
        fileBadge: dbNames,
        description: 'Armazenamento relacional externo ao contêiner. Duplo-clique para abrir o DER.',
        color: '#b45309',
        borderColor: '#fbbf24',
        isDatabase: true,
        inBoundary: false,
        tier: 5,
        containerGroup: 'external',
        drillTarget: { level: 'c4-db' }
      });
    }

    for (const e of data.edges) {
      if (selectedIds.has(e.source) && selectedIds.has(e.target)) {
        edges.push({
          source: e.source,
          target: e.target,
          label: e.label || e.type,
          tech: e.type.toUpperCase()
        });
      } else if (selectedIds.has(e.source) && e.target.startsWith('db:')) {
        const dbTarget = data.nodes.find((d) => d.id === e.target);
        edges.push({
          source: e.source,
          target: 'c4:cont:database',
          label: dbTarget ? `Persiste ${dbTarget.label}` : (e.label || 'Persiste / Consulta'),
          tech: 'ORM / SQL'
        });
      }
    }

    // Define Resizable Container Boundaries for C3
    const hasWebAppNodes = nodes.some((n) => n.containerGroup === 'webapp');
    const hasBackendNodes = nodes.some((n) => n.containerGroup === 'backend');

    if (hasWebAppNodes) {
      boundaries.push({
        id: `c3:boundary:webapp:${filter}`,
        group: 'webapp',
        label: 'Web Application (Frontend) [Container Boundary]',
        subLabel: 'Camadas 1 e 2: Telas/Páginas e Componentes Visuais Reutilizáveis (Arraste as alças para redimensionar)',
        strokeColor: '#34d399',
        fillColor: 'rgba(6, 78, 59, 0.16)'
      });
    }
    if (hasBackendNodes) {
      boundaries.push({
        id: `c3:boundary:backend:${filter}`,
        group: 'backend',
        label: 'Domain & Application Services (Backend) [Container Boundary]',
        subLabel: 'Camadas 3 e 4: Serviços de Domínio, Utilitários, Classes Base e Interfaces (Arraste as alças para redimensionar)',
        strokeColor: '#c084fc',
        fillColor: 'rgba(59, 7, 100, 0.16)'
      });
    }

    const contName = filter === 'webapp'
      ? 'Web Application (Frontend)'
      : filter === 'backend'
        ? 'Domain & Application Services'
        : `${repoName} (Frontend + Backend)`;

    return {
      levelTitle: `C3 — Diagrama de Componentes (${contName})`,
      levelSubtitle: 'Organizado em camadas arquiteturais (Telas → UI → Serviços/Funções → Contratos OOP → Banco Externo).',
      nodes,
      edges,
      boundaries
    };
  }

  function generateMermaidC4ForArc42(data) {
    const repoName = (data.summary && data.summary.repoName) || 'Sistema';
    const externals = inferExternalSystems(data);
    const dbNodes = data.nodes.filter((n) => n.category === 'database');
    const classNodes = data.nodes.filter((n) => ['class', 'interface'].includes(n.category));
    const screenNodes = data.nodes.filter((n) => n.category === 'screen');
    const compNodes = data.nodes.filter((n) => n.category === 'component');

    const c1Mermaid = [
      'flowchart TB',
      '  classDef person fill:#08427b,stroke:#38bdf8,color:#ffffff,stroke-width:2px;',
      '  classDef system fill:#1168bd,stroke:#93c5fd,color:#ffffff,stroke-width:2px;',
      '  classDef external fill:#475569,stroke:#cbd5e1,color:#ffffff,stroke-dasharray: 5 5;',
      `  User["🧑 Usuário / Cliente<br/>[Person]<br/>Utiliza as interfaces do sistema"]:::person`,
      `  Sys["📦 ${repoName}<br/>[Software System]<br/>Sistema principal do repositório"]:::system`,
      '  User -->|"Acessa via [HTTPS / UI]"| Sys',
      ...externals.map((ext, i) => `  Ext${i}["🌐 ${ext.label}<br/>[External System]<br/>${ext.tech}"]:::external\n  Sys -->|"Integra via [${ext.tech}]"| Ext${i}`)
    ].join('\n');

    const c2Mermaid = [
      'flowchart TB',
      '  classDef person fill:#08427b,stroke:#38bdf8,color:#ffffff;',
      '  classDef container fill:#1d4ed8,stroke:#93c5fd,color:#ffffff;',
      '  classDef db fill:#b45309,stroke:#fbbf24,color:#ffffff;',
      '  classDef external fill:#475569,stroke:#cbd5e1,color:#ffffff;',
      '  User["🧑 Usuário / Cliente [Person]"]:::person',
      `  subgraph Boundary["${repoName} [System Boundary]"]`,
      `    WebApp["🖥️ Web Application<br/>[Container: React / TSX]<br/>${screenNodes.length} telas e ${compNodes.length} componentes"]:::container`,
      `    Domain["⚙️ Domain & Services<br/>[Container: TypeScript / OOP]<br/>${classNodes.length} classes/interfaces"]:::container`,
      `    DB[("🗄️ Relational Database<br/>[Container: Prisma / SQL]<br/>${dbNodes.length} tabelas")]:::db`,
      '  end',
      '  User -->|"Interage com [HTTPS]"| WebApp',
      '  WebApp -->|"Invoca serviços [TS Modules]"| Domain',
      '  Domain -->|"Lê e grava [Prisma ORM]"| DB',
      ...externals.map((ext, i) => `  Ext${i}["🌐 ${ext.label} [External]"]:::external\n  Domain -->|"Consome [${ext.tech}]"| Ext${i}`)
    ].join('\n');

    return { c1Mermaid, c2Mermaid };
  }

  window.C4Engine = {
    buildC4Graph,
    generateMermaidC4ForArc42
  };
})();
