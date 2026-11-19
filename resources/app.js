/**
 * Repo Visualizer & AI Code Auditor — Main Application Controller (app.js)
 * Modular architecture using SvgEngine, C4Engine, and BrowserScanner.
 */

const state = {
  data: window.__ARCH_DATA__ || {
    summary: { repoName: 'Demo', repoPath: '.', counts: {} },
    nodes: [],
    edges: [],
    markdownDocs: [],
    findings: []
  },
  // Tab 1: C4 & General Graph state
  archMode: 'c2', // 'c1' | 'c2' | 'c3' | 'graph'
  c3ContainerFilter: 'all', // 'all' | 'webapp' | 'backend'
  graphFilter: 'all',
  searchQuery: '',
  selectedNodeId: null,
  zoom: { scale: 1, tx: 0, ty: 0 },
  nodePositions: new Map(),
  lastRenderedC4Nodes: [],

  // Universal Resizable Dashed Boundary Boxes map (boundaryId -> { x, y, w, h, userResized })
  boundaryRects: new Map(),

  // Tab 2: Database ER state
  dbViewMode: 'cards',
  dbFocusedId: null,
  dbZoom: { scale: 1, tx: 0, ty: 0 },
  dbPositions: new Map(),

  // Tab 3: OOP UML state
  oopViewMode: 'cards',
  oopFocusedId: null,
  oopZoom: { scale: 1, tx: 0, ty: 0 },
  oopPositions: new Map(),

  // Tab 5: arc42 Docs state
  activeDocIndex: 0,
  selectedDocIds: new Set(),
  dirHandle: null
};

const CATEGORY_COLORS = {
  database: '#f59e0b',
  class: '#8b5cf6',
  interface: '#a855f7',
  enum: '#c084fc',
  screen: '#3b82f6',
  component: '#10b981',
  function: '#06b6d4',
  module: '#64748b'
};

const C4_CARD_SIZE = { w: 248, h: 118 };
const GRAPH_CARD_SIZE = { w: 156, h: 48 };

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Word-aware text wrapper so descriptions inside SVG cards never cut words in half or overflow.
 */
function wrapWords(text, maxChars = 36) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  if (lines.length > 2) {
    lines[1] = lines[1].slice(0, Math.max(0, maxChars - 3)) + '...';
  }
  return [lines[0] || '', lines[1] || ''];
}

function formatShortPath(str, maxChars = 34) {
  const s = String(str || '');
  if (s.length <= maxChars) return s;
  return '…' + s.slice(-(maxChars - 1));
}

/**
 * Computes or retrieves a user-resized dashed boundary rectangle around a group of nodes.
 */
function resolveBoundaryRect(boundaryId, memberNodes, posMap, halfW, halfH) {
  const existing = state.boundaryRects.get(boundaryId);
  if (existing && existing.userResized) {
    return existing;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of memberNodes) {
    const p = posMap.get(n.id);
    if (!p) continue;
    minX = Math.min(minX, p.x - halfW);
    minY = Math.min(minY, p.y - halfH);
    maxX = Math.max(maxX, p.x + halfW);
    maxY = Math.max(maxY, p.y + halfH);
  }
  if (!isFinite(minX)) {
    return { x: 100, y: 60, w: 600, h: 300, userResized: false };
  }
  const padLeft = 44;
  const padRight = 44;
  const padTop = 76; // Dedicated space for the draggable header bar so it never overlaps top cards
  const padBottom = 36;
  const rect = {
    x: minX - padLeft,
    y: minY - padTop,
    w: Math.max(340, (maxX - minX) + padLeft + padRight),
    h: Math.max(190, (maxY - minY) + padTop + padBottom),
    userResized: false
  };
  state.boundaryRects.set(boundaryId, rect);
  return rect;
}

function initDashboard() {
  const { summary } = state.data;
  document.getElementById('repo-title').textContent = `Repo Visualizer — ${summary.repoName || 'Repositório'}`;
  document.getElementById('repo-path').textContent = summary.repoPath || '';

  renderKPIs();
  renderGraph();
  renderDatabaseTab();
  renderOOPTab();
  renderUITab();
  renderDocsTab();
  renderAuditTab();

  if (window.mermaid) {
    mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
  }
}

function renderKPIs() {
  const c = state.data.summary.counts || {};
  const inc = state.data.summary.incremental;
  const incPill = inc
    ? `<div class="kpi-pill" title="Motor Incremental @arch:status (Cache Hit vs Reanalisados)">⚡ Cache: <strong>${inc.cachedFiles}</strong> lidos / <strong>${inc.analyzedFiles}</strong> atua.</div>`
    : '';
  document.getElementById('kpi-strip').innerHTML = `
    <div class="kpi-pill">🗄️ Tabelas DB: <strong>${c.tables || 0}</strong></div>
    <div class="kpi-pill">🧬 Classes/Interfaces: <strong>${c.classes || 0}</strong></div>
    <div class="kpi-pill">🖥️ Telas: <strong>${c.screens || 0}</strong></div>
    <div class="kpi-pill">🧩 Componentes UI: <strong>${c.components || 0}</strong></div>
    <div class="kpi-pill">⚡ Funções: <strong>${c.functions || 0}</strong></div>
    <div class="kpi-pill">🔗 Conexões: <strong>${c.edges || 0}</strong></div>
    <div class="kpi-pill">🛡️ Alertas: <strong>${c.findings || 0}</strong></div>
    ${incPill}
  `;
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach((pane) => {
    pane.classList.toggle('active', pane.id === tabId);
  });
  if (tabId === 'tab-docs') {
    renderMarkdownPreview();
  }
}

// ============================================================================
// TAB 1: C4 MODEL GENERATOR (C1 -> C2 -> C3 -> C4) & GENERAL DEPENDENCY GRAPH
// ============================================================================

function setArchMode(mode, c3Container = 'all') {
  state.archMode = mode;
  state.c3ContainerFilter = c3Container;
  state.nodePositions.clear();
  state.zoom = { scale: 1, tx: 0, ty: 0 };

  const modeSelect = document.getElementById('arch-mode-select');
  if (modeSelect && modeSelect.value !== mode) modeSelect.value = mode;

  const c3Select = document.getElementById('c3-container-select');
  const layerFilters = document.getElementById('graph-layer-filters');
  if (c3Select) {
    c3Select.style.display = mode === 'c3' ? 'inline-block' : 'none';
    c3Select.value = c3Container;
  }
  if (layerFilters) {
    layerFilters.style.display = mode === 'graph' ? 'flex' : 'none';
  }

  updateC4Breadcrumb();
  renderGraph();
}

function updateC4Breadcrumb() {
  const bc = document.getElementById('c4-breadcrumb');
  if (!bc) return;
  if (state.archMode === 'graph') {
    bc.innerHTML = `<span>🕸️ Visão Grafo Geral Completo</span>`;
    return;
  }
  const parts = [`<span class="crumb" onclick="setArchMode('c1')">C1: Contexto</span>`];
  if (state.archMode === 'c2' || state.archMode === 'c3') {
    parts.push(`<span>›</span><span class="crumb" onclick="setArchMode('c2')">C2: Contêineres</span>`);
  }
  if (state.archMode === 'c3') {
    const label = state.c3ContainerFilter === 'webapp'
      ? 'Web App (Frontend)'
      : state.c3ContainerFilter === 'backend'
        ? 'Domain & Services (Backend)'
        : 'Todos Componentes';
    parts.push(`<span>›</span><span class="crumb">C3: ${escapeHtml(label)}</span>`);
  }
  bc.innerHTML = parts.join(' ');
}

function setGraphFilter(filter) {
  state.graphFilter = filter;
  document.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.filter === filter);
  });
  state.nodePositions.clear();
  renderGraph();
}

function renderGraph() {
  if (state.archMode !== 'graph') {
    renderC4View();
  } else {
    renderGeneralGraphView();
  }
}

function layoutC4NodesByTiers(nodes, edges) {
  // Group nodes into ordered tiers (0..5)
  const tierMap = new Map();
  for (const n of nodes) {
    const t = typeof n.tier === 'number' ? n.tier : 1;
    if (!tierMap.has(t)) tierMap.set(t, []);
    tierMap.get(t).push(n);
  }
  const sortedTierKeys = Array.from(tierMap.keys()).sort((a, b) => a - b);

  const centerX = 640;
  const colSpacing = 305;
  const subRowSpacing = 175;
  const tierSpacing = 185;
  const boundaryGapBonus = 115; // Extra vertical space when entering a new container boundary

  let currentY = 135;
  let prevGroup = null;

  for (const tKey of sortedTierKeys) {
    const group = tierMap.get(tKey);
    const groupContainer = group[0] && group[0].containerGroup;

    if (prevGroup !== null && groupContainer !== prevGroup) {
      currentY += boundaryGapBonus;
    }

    // Barycenter sort: order nodes in this tier by average X of connected nodes already placed in upper tiers
    group.sort((a, b) => {
      const getAvgX = (node) => {
        const connectedXs = [];
        for (const e of edges) {
          const otherId = e.source === node.id ? e.target : e.target === node.id ? e.source : null;
          if (otherId && state.nodePositions.has(otherId)) {
            connectedXs.push(state.nodePositions.get(otherId).x);
          }
        }
        if (connectedXs.length === 0) return null;
        return connectedXs.reduce((sum, x) => sum + x, 0) / connectedXs.length;
      };
      const ax = getAvgX(a);
      const bx = getAvgX(b);
      if (ax !== null && bx !== null) return ax - bx;
      if (ax !== null) return -1;
      if (bx !== null) return 1;
      return a.label.localeCompare(b.label);
    });

    const maxCols = 4;
    const totalSubRows = Math.ceil(group.length / maxCols);

    group.forEach((n, idx) => {
      const subRow = Math.floor(idx / maxCols);
      const col = idx % maxCols;
      const countInRow = Math.min(maxCols, group.length - subRow * maxCols);
      const startX = centerX - ((countInRow - 1) * colSpacing) / 2;

      if (!state.nodePositions.has(n.id)) {
        state.nodePositions.set(n.id, {
          x: startX + col * colSpacing,
          y: currentY + subRow * subRowSpacing
        });
      }
    });

    currentY += (totalSubRows - 1) * subRowSpacing + tierSpacing;
    prevGroup = groupContainer;
  }
}

function renderC4View() {
  const svg = document.getElementById('graph-svg');
  if (!svg || !window.C4Engine) return;

  const c4 = window.C4Engine.buildC4Graph(state.data, state.archMode, state.c3ContainerFilter);
  const q = state.searchQuery;
  const nodes = q
    ? c4.nodes.filter((n) => `${n.label} ${n.c4Type} ${n.tech} ${n.description}`.toLowerCase().includes(q))
    : c4.nodes;
  state.lastRenderedC4Nodes = nodes;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = c4.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  // Position nodes cleanly in architectural tiers with zero overlapping groups
  layoutC4NodesByTiers(nodes, edges);

  const hw = C4_CARD_SIZE.w / 2;
  const hh = C4_CARD_SIZE.h / 2;

  // Render Resizable Dashed Boundary Boxes (one per container/system scope)
  let boundariesSvg = '';
  if (c4.boundaries && window.SvgEngine) {
    for (const bDef of c4.boundaries) {
      const memberNodes = nodes.filter((n) => n.containerGroup === bDef.group);
      if (memberNodes.length === 0) continue;
      const rect = resolveBoundaryRect(bDef.id, memberNodes, state.nodePositions, hw, hh);
      boundariesSvg += window.SvgEngine.renderResizableBoundary({
        id: bDef.id,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        label: bDef.label,
        subLabel: bDef.subLabel,
        strokeColor: bDef.strokeColor,
        fillColor: bDef.fillColor
      });
    }
  }

  // Render Curved Border-to-Border Edges
  let edgesSvg = '';
  edges.forEach((e, idx) => {
    const p1 = state.nodePositions.get(e.source) || { x: 100, y: 100 };
    const p2 = state.nodePositions.get(e.target) || { x: 300, y: 300 };

    // Slight curve stagger to prevent parallel or crossing edges from stacking labels
    const curveOffset = ((idx % 3) - 1) * 22;
    const geom = window.SvgEngine
      ? window.SvgEngine.computeEdgeGeometry(p1, p2, C4_CARD_SIZE, C4_CARD_SIZE, curveOffset)
      : { pathD: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`, labelX: (p1.x + p2.x) / 2, labelY: (p1.y + p2.y) / 2 };

    const isHighlighted = state.selectedNodeId && (e.source === state.selectedNodeId || e.target === state.selectedNodeId);
    const hasSelection = Boolean(state.selectedNodeId);
    const strokeCol = isHighlighted ? '#38bdf8' : '#94a3b8';
    const edgeOpacity = hasSelection ? (isHighlighted ? 1 : 0.35) : 0.88;

    const rawLbl = e.tech ? `${e.label} [${e.tech}]` : e.label;
    const shortLbl = rawLbl.length > 34 ? rawLbl.slice(0, 32) + '…' : rawLbl;
    const pillW = Math.max(92, shortLbl.length * 5.7 + 16);

    edgesSvg += `
      <g class="edge-group" data-source="${escapeHtml(e.source)}" data-target="${escapeHtml(e.target)}" data-curve="${curveOffset}" opacity="${edgeOpacity}">
        <path class="edge-path" d="${geom.pathD}" fill="none"
              stroke="${strokeCol}" stroke-width="${isHighlighted ? 2.6 : 1.75}" stroke-dasharray="6,4"
              marker-end="${isHighlighted ? 'url(#c4-arrow-active)' : 'url(#c4-arrow)'}" />
        <rect x="${geom.labelX - pillW / 2}" y="${geom.labelY - 10}" width="${pillW}" height="18" rx="5"
              fill="#0b0f19" stroke="${isHighlighted ? '#38bdf8' : '#334155'}" stroke-width="${isHighlighted ? 1.5 : 1}" />
        <text x="${geom.labelX}" y="${geom.labelY + 3}" fill="${isHighlighted ? '#38bdf8' : '#e2e8f0'}" font-size="10" font-weight="${isHighlighted ? '700' : '500'}" text-anchor="middle" style="pointer-events:none; user-select:none;">
          ${escapeHtml(shortLbl)}
        </text>
      </g>
    `;
  });

  // Render C4 Cards with Word-Wrapped Descriptions & SVG ClipPath Protection
  let nodesSvg = '';
  for (const n of nodes) {
    const pos = state.nodePositions.get(n.id) || { x: 300, y: 300 };
    const isSelected = state.selectedNodeId === n.id;
    const w = C4_CARD_SIZE.w;
    const h = C4_CARD_SIZE.h;
    const drillIcon = n.drillTarget ? '🔍 ' : '';
    const [descLine1, descLine2] = wrapWords(n.description, 36);
    const c4Bracket = `[${n.c4Type}${n.tech ? ': ' + n.tech : ''}]`;

    const personHead = n.isPerson
      ? `<circle cx="0" cy="${-hh - 14}" r="16" fill="${n.color}" stroke="${n.borderColor}" stroke-width="2" />
         <text x="0" y="${-hh - 9}" font-size="14" text-anchor="middle" style="pointer-events:none;">🧑</text>`
      : '';

    const fileLineSvg = n.fileBadge
      ? `<text x="0" y="${-hh + 54}" fill="#93c5fd" font-size="9.5" font-family="monospace" text-anchor="middle">📄 ${escapeHtml(formatShortPath(n.fileBadge, 34))}</text>`
      : '';
    const descY1 = n.fileBadge ? -hh + 72 : -hh + 64;
    const descY2 = n.fileBadge ? -hh + 86 : -hh + 80;

    const syncState = n.originalNode && n.originalNode.syncState;
    const syncBadge = (syncState === 'new' || syncState === 'modified')
      ? `<g transform="translate(${hw - 36}, ${-hh - 8})">
           <rect x="-26" y="-9" width="52" height="17" rx="8" fill="${syncState === 'new' ? '#10b981' : '#f59e0b'}" stroke="#0b0f19" stroke-width="1.5" />
           <text x="0" y="3" fill="#052e16" font-size="8.5" font-weight="800" text-anchor="middle" style="pointer-events:none;">${syncState === 'new' ? '🆕 NOVO' : '✏️ MOD'}</text>
         </g>`
      : '';

    nodesSvg += `
      <g class="graph-node" data-id="${escapeHtml(n.id)}" transform="translate(${pos.x}, ${pos.y})" style="cursor:grab;">
        ${personHead}
        <rect x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="${n.isDatabase ? 18 : 10}"
              fill="${n.color}" stroke="${isSelected ? '#ffffff' : n.borderColor}" stroke-width="${isSelected ? 3.5 : 2}" />
        ${syncBadge}
        <g clip-path="url(#c4-card-clip)" style="pointer-events:none; user-select:none;">
          <text x="0" y="${-hh + 22}" fill="#ffffff" font-size="13" font-weight="800" text-anchor="middle">
            ${drillIcon}${escapeHtml(n.label.slice(0, 26))}
          </text>
          <text x="0" y="${-hh + 38}" fill="#cbd5e1" font-size="10" font-family="monospace" text-anchor="middle">
            ${escapeHtml(c4Bracket.slice(0, 36))}
          </text>
          ${fileLineSvg}
          <text x="0" y="${descY1}" fill="#e2e8f0" font-size="10" text-anchor="middle">
            ${escapeHtml(descLine1)}
          </text>
          <text x="0" y="${descY2}" fill="#cbd5e1" font-size="10" text-anchor="middle">
            ${escapeHtml(descLine2)}
          </text>
          ${n.drillTarget ? `<text x="0" y="${hh - 8}" fill="#fde047" font-size="9.5" font-weight="700" text-anchor="middle">⚡ Duplo-clique: Drill-Down</text>` : ''}
        </g>
      </g>
    `;
  }

  const { scale, tx, ty } = state.zoom;
  svg.innerHTML = `
    <defs>
      <clipPath id="c4-card-clip">
        <rect x="${-hw + 6}" y="${-hh + 4}" width="${C4_CARD_SIZE.w - 12}" height="${C4_CARD_SIZE.h - 8}" rx="8" />
      </clipPath>
      <marker id="c4-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
      </marker>
      <marker id="c4-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
      </marker>
    </defs>
    <g id="graph-viewport" transform="translate(${tx}, ${ty}) scale(${scale})">
      ${boundariesSvg}
      ${edgesSvg}
      ${nodesSvg}
    </g>
  `;
}

function renderGeneralGraphView() {
  const svg = document.getElementById('graph-svg');
  if (!svg) return;
  const q = state.searchQuery;
  const nodes = state.data.nodes.filter((n) => {
    if (state.graphFilter === 'database' && n.category !== 'database') return false;
    if (state.graphFilter === 'oop' && !['class', 'interface', 'enum'].includes(n.category)) return false;
    if (state.graphFilter === 'ui' && !['screen', 'component'].includes(n.category)) return false;
    if (state.graphFilter === 'functions' && !['function', 'module', 'screen', 'component'].includes(n.category)) return false;
    if (q) return `${n.label} ${n.file} ${n.subType}`.toLowerCase().includes(q);
    return true;
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  if (state.graphFilter !== 'all' || q) {
    for (const e of state.data.edges) {
      if (nodeIds.has(e.source) || nodeIds.has(e.target)) {
        const sNode = state.data.nodes.find((n) => n.id === e.source);
        const tNode = state.data.nodes.find((n) => n.id === e.target);
        if (sNode && !nodeIds.has(sNode.id)) { nodes.push(sNode); nodeIds.add(sNode.id); }
        if (tNode && !nodeIds.has(tNode.id)) { nodes.push(tNode); nodeIds.add(tNode.id); }
      }
    }
  }
  const edges = state.data.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  // Layered layout
  const lanes = { screen: [], component: [], class: [], interface: [], enum: [], function: [], module: [], database: [] };
  nodes.forEach((n) => (lanes[n.category] || lanes.module).push(n));
  const groups = [lanes.screen, lanes.component, [...lanes.class, ...lanes.interface, ...lanes.enum], [...lanes.function, ...lanes.module], lanes.database].filter((g) => g.length > 0);
  const rowGap = Math.max(145, 760 / (groups.length + 1));

  groups.forEach((group, rIdx) => {
    const y = 135 + rIdx * rowGap;
    const colGap = Math.max(210, 1150 / (group.length + 1));
    group.forEach((n, cIdx) => {
      if (!state.nodePositions.has(n.id)) {
        state.nodePositions.set(n.id, { x: 140 + cIdx * colGap, y: y + (cIdx % 2) * 22 });
      }
    });
  });

  let boundarySvg = '';
  if (nodes.length > 0 && window.SvgEngine) {
    const bId = `graph:boundary:${state.graphFilter}`;
    const rect = resolveBoundaryRect(bId, nodes, state.nodePositions, GRAPH_CARD_SIZE.w / 2, GRAPH_CARD_SIZE.h / 2);
    boundarySvg = window.SvgEngine.renderResizableBoundary({
      id: bId,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      label: `${state.data.summary.repoName || 'Repositório'} [Dependency Graph Boundary]`,
      subLabel: 'Fronteira do Grafo Geral (Arraste as alças azuis nas bordas para redimensionar)',
      strokeColor: '#475569'
    });
  }

  let edgesSvg = '';
  edges.forEach((e, idx) => {
    const p1 = state.nodePositions.get(e.source) || { x: 100, y: 100 };
    const p2 = state.nodePositions.get(e.target) || { x: 300, y: 300 };
    const isH = state.selectedNodeId && (e.source === state.selectedNodeId || e.target === state.selectedNodeId);
    const curveOffset = ((idx % 3) - 1) * 16;
    const geom = window.SvgEngine
      ? window.SvgEngine.computeEdgeGeometry(p1, p2, GRAPH_CARD_SIZE, GRAPH_CARD_SIZE, curveOffset)
      : { pathD: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`, labelX: (p1.x + p2.x) / 2, labelY: (p1.y + p2.y) / 2 };

    edgesSvg += `
      <g class="edge-group" data-source="${escapeHtml(e.source)}" data-target="${escapeHtml(e.target)}" data-curve="${curveOffset}">
        <path class="edge-path" d="${geom.pathD}" fill="none"
              stroke="${isH ? '#38bdf8' : '#475569'}" stroke-width="${isH ? 2.5 : 1.4}" marker-end="url(#arrow)" opacity="0.85" />
        <text x="${geom.labelX}" y="${geom.labelY - 4}" fill="${isH ? '#38bdf8' : '#94a3b8'}" font-size="10" text-anchor="middle">${escapeHtml(e.label || e.type)}</text>
      </g>
    `;
  });

  let nodesSvg = '';
  for (const n of nodes) {
    const pos = state.nodePositions.get(n.id) || { x: 200, y: 200 };
    const color = CATEGORY_COLORS[n.category] || '#64748b';
    const isSelected = state.selectedNodeId === n.id;
    const reuseBadge = n.metrics && n.metrics.reuseCount > 0
      ? `<circle cx="68" cy="-18" r="11" fill="#10b981" stroke="#052e16" stroke-width="1.5"/>
         <text x="68" y="-14" fill="#052e16" font-size="10" font-weight="bold" text-anchor="middle">${n.metrics.reuseCount}x</text>`
      : '';

    nodesSvg += `
      <g class="graph-node" data-id="${escapeHtml(n.id)}" transform="translate(${pos.x}, ${pos.y})" style="cursor:grab;">
        <rect x="-78" y="-24" width="156" height="48" rx="10" fill="#1e293b" stroke="${color}" stroke-width="${isSelected ? 3 : 2}" />
        <rect x="-78" y="-24" width="8" height="48" rx="4" fill="${color}" />
        <text x="2" y="-3" fill="#f8fafc" font-size="12" font-weight="700" text-anchor="middle" style="user-select:none; pointer-events:none;">${escapeHtml(n.label.slice(0, 19))}</text>
        <text x="2" y="13" fill="#94a3b8" font-size="10" text-anchor="middle" style="user-select:none; pointer-events:none;">${escapeHtml(n.category.toUpperCase())}</text>
        ${reuseBadge}
      </g>
    `;
  }

  const { scale, tx, ty } = state.zoom;
  svg.innerHTML = `
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
      </marker>
    </defs>
    <g id="graph-viewport" transform="translate(${tx}, ${ty}) scale(${scale})">
      ${boundarySvg}
      ${edgesSvg}
      ${nodesSvg}
    </g>
  `;
}

function handleGraphNodeDoubleClick(nodeId) {
  if (state.archMode === 'graph') return;
  const c4Node = state.lastRenderedC4Nodes.find((n) => n.id === nodeId);
  if (!c4Node || !c4Node.drillTarget) return;

  const dt = c4Node.drillTarget;
  if (dt.level === 'c2' || dt.level === 'c3') {
    setArchMode(dt.level, dt.container || 'all');
  } else if (dt.level === 'c4-db') {
    switchTab('tab-db');
    switchDBView('diagram');
  } else if (dt.level === 'c4-oop') {
    switchTab('tab-oop');
    switchOOPView('diagram');
    if (dt.targetLabel) focusOnOOPClass(dt.targetLabel);
  }
}

function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  renderGraph();

  const inspector = document.getElementById('node-inspector');
  const c4Node = state.archMode !== 'graph' ? state.lastRenderedC4Nodes.find((n) => n.id === nodeId) : null;
  const realNode = state.data.nodes.find((n) => n.id === nodeId) || (c4Node && c4Node.originalNode);

  if (c4Node && !realNode) {
    const drillBtn = c4Node.drillTarget
      ? `<button class="btn btn-primary" style="width:100%; justify-content:center; margin-top:10px;" onclick="handleGraphNodeDoubleClick('${escapeHtml(c4Node.id)}')">🔍 Drill-Down (Dar Zoom neste Nível C4)</button>`
      : '';
    inspector.innerHTML = `
      <div class="inspector-card">
        <h3>Elemento Arquitetural C4</h3>
        <div style="font-size:16px; font-weight:700; margin-bottom:6px;">${escapeHtml(c4Node.label)}</div>
        <span class="badge badge-screen">[${escapeHtml(c4Node.c4Type)}: ${escapeHtml(c4Node.tech)}]</span>
        <p style="font-size:13px; color:var(--text-muted); margin-top:10px;">${escapeHtml(c4Node.description)}</p>
        ${drillBtn}
      </div>
    `;
    return;
  }

  if (!realNode) return;
  const incoming = state.data.edges.filter((e) => e.target === realNode.id);
  const outgoing = state.data.edges.filter((e) => e.source === realNode.id);

  let detailsHtml = '';
  if (realNode.category === 'database' && realNode.details && realNode.details.columns) {
    detailsHtml = `
      <div class="inspector-card">
        <h3>Colunas da Tabela (${realNode.details.columns.length})</h3>
        ${realNode.details.columns.map((c) => `
          <div class="member-row">
            <span>${c.isPk ? '🔑 ' : c.isFk ? '🔗 ' : ''}${escapeHtml(c.name)}</span>
            <span style="color:var(--text-muted)">${escapeHtml(c.type)}</span>
          </div>
        `).join('')}
      </div>
    `;
  } else if ((realNode.category === 'class' || realNode.category === 'interface') && realNode.details && realNode.details.members) {
    detailsHtml = `
      <div class="inspector-card">
        <h3>Encapsulamento & Membros (${realNode.details.members.length})</h3>
        ${realNode.details.members.map((m) => {
          const sym = m.visibility === 'private' ? '-' : m.visibility === 'protected' ? '#' : '+';
          const cls = m.visibility === 'private' ? 'vis-priv' : m.visibility === 'protected' ? 'vis-prot' : 'vis-pub';
          return `<div class="member-row"><span><span class="${cls}">${sym} ${m.visibility}</span> ${escapeHtml(m.name)}</span><span style="color:var(--text-muted)">${escapeHtml(m.kind)}</span></div>`;
        }).join('')}
        <button class="btn btn-primary" style="width:100%; justify-content:center; margin-top:10px;" onclick="switchTab('tab-oop'); switchOOPView('diagram'); focusOnOOPClass('${escapeHtml(realNode.label)}')">🔍 Abrir no C4 Nível 4 (UML)</button>
      </div>
    `;
  }

  const archTag = realNode.details && realNode.details.archTag;
  const syncBadgeHtml = realNode.syncState === 'cached'
    ? `<span class="badge badge-component">⚡ Cache (read)</span>`
    : realNode.syncState === 'new' || realNode.syncState === 'modified'
      ? `<span class="badge badge-db">${realNode.syncState === 'new' ? '🆕 Novo → read' : '✏️ Modificado → read'}</span>`
      : '';
  const archDescHtml = archTag && archTag.desc
    ? `<p style="font-size:12px; color:#cbd5e1; margin:8px 0 6px;">🏷️ ${escapeHtml(archTag.desc)}</p>`
    : '';

  inspector.innerHTML = `
    <div class="inspector-card">
      <h3>Elemento Selecionado</h3>
      <div style="font-size:16px; font-weight:700; margin-bottom:6px;">${escapeHtml(realNode.label)}</div>
      <div style="margin-bottom:10px; display:flex; flex-wrap:wrap; gap:4px;">
        <span class="badge badge-screen">${escapeHtml(realNode.subType || realNode.category)}</span>
        ${realNode.metrics && realNode.metrics.reuseCount ? `<span class="badge badge-component">Reutilizado ${realNode.metrics.reuseCount}x</span>` : ''}
        ${syncBadgeHtml}
      </div>
      ${archDescHtml}
      <div class="file-loc">📍 Arquivo: ${escapeHtml(realNode.file)} (Linha ${realNode.line || 1})</div>
    </div>
    ${detailsHtml}
    <div class="inspector-card">
      <h3>Quem usa / importa (${incoming.length})</h3>
      ${incoming.length === 0 ? '<p style="font-size:12px;color:var(--text-muted)">Nenhuma referência de entrada.</p>' : incoming.map((e) => {
        const src = state.data.nodes.find((n) => n.id === e.source);
        return `<div class="member-row" style="cursor:pointer" onclick="selectNode('${escapeHtml(e.source)}')"><span>⬅️ ${escapeHtml(src ? src.label : e.source)}</span><span style="color:var(--accent-cyan)">${escapeHtml(e.label || e.type)}</span></div>`;
      }).join('')}
    </div>
    <div class="inspector-card">
      <h3>Do que depende / conecta (${outgoing.length})</h3>
      ${outgoing.length === 0 ? '<p style="font-size:12px;color:var(--text-muted)">Nenhuma dependência de saída.</p>' : outgoing.map((e) => {
        const tgt = state.data.nodes.find((n) => n.id === e.target);
        return `<div class="member-row" style="cursor:pointer" onclick="selectNode('${escapeHtml(e.target)}')"><span>➡️ ${escapeHtml(tgt ? tgt.label : e.target)}</span><span style="color:var(--accent-amber)">${escapeHtml(e.label || e.type)}</span></div>`;
      }).join('')}
    </div>
  `;
}

function resetGraphZoom() {
  state.zoom = { scale: 1, tx: 0, ty: 0 };
  renderGraph();
}

function resetNodeLayout() {
  state.nodePositions.clear();
  state.boundaryRects.clear();
  state.zoom = { scale: 1, tx: 0, ty: 0 };
  renderGraph();
}

function injectC4IntoArc42Docs() {
  if (!window.C4Engine) return;
  const { c1Mermaid, c2Mermaid } = window.C4Engine.generateMermaidC4ForArc42(state.data);
  const repoName = (state.data.summary && state.data.summary.repoName) || 'Sistema';

  // Ensure Chapter 03 (Context and Scope — C4 Level 1) exists
  let ch3 = state.data.markdownDocs.find((d) => d.path.includes('03_context_and_scope'));
  const ch3Content = `<!-- arc42:generated -->\n# 3. Contexto e Escopo (C4 Nível 1 — System Context)\n\n## 3.1 Contexto de Negócio e Sistemas Externos\nDiagrama C4 Nível 1 gerado conforme notação de Simon Brown para **${repoName}**:\n\n\`\`\`mermaid\n${c1Mermaid}\n\`\`\`\n<!-- /arc42:generated -->`;

  if (ch3) {
    ch3.content = ch3Content;
  } else {
    ch3 = {
      id: 'doc:doc/architecture/03_context_and_scope.md',
      title: '03 - Contexto e Escopo C4 (arc42)',
      path: 'doc/architecture/03_context_and_scope.md',
      category: 'arc42',
      content: ch3Content
    };
    state.data.markdownDocs.splice(1, 0, ch3);
    state.selectedDocIds.add(ch3.id);
  }

  // Update Chapter 05 (Building Block View — C4 Level 2 Containers)
  const ch5 = state.data.markdownDocs.find((d) => d.path.includes('05_building_block_view'));
  if (ch5 && !ch5.content.includes('[System Boundary]')) {
    ch5.content += `\n\n## 5.4 Diagrama de Contêineres C4 (Nível 2)\n\n\`\`\`mermaid\n${c2Mermaid}\n\`\`\`\n`;
  }

  renderDocsTab();
  switchTab('tab-docs');
  const ch3Idx = state.data.markdownDocs.findIndex((d) => d.id === ch3.id);
  if (ch3Idx >= 0) selectDoc(ch3Idx);
}

// ============================================================================
// TAB 2: DATABASE ER CARDS & INTERACTIVE ENTITY-RELATIONSHIP DIAGRAM (DER)
// ============================================================================

function switchDBView(mode) {
  state.dbViewMode = mode;
  document.getElementById('db-cards-grid').style.display = mode === 'diagram' ? 'none' : 'grid';
  document.getElementById('db-diagram-container').style.display = mode === 'diagram' ? 'block' : 'none';
  const resetBtn = document.getElementById('btn-db-reset');
  if (resetBtn) resetBtn.style.display = mode === 'diagram' ? 'inline-flex' : 'none';
  const sel = document.getElementById('db-view-mode');
  if (sel && sel.value !== mode) sel.value = mode;
  if (mode === 'diagram') renderDBDiagram();
}

function renderDatabaseTab() {
  const container = document.getElementById('db-cards-grid');
  const datalist = document.getElementById('db-table-datalist');
  const q = state.searchQuery;
  const allDbNodes = state.data.nodes.filter((n) => n.category === 'database');

  if (datalist) {
    datalist.innerHTML = allDbNodes.map((t) => `<option value="${escapeHtml(t.label)}">${escapeHtml(t.subType || 'Table')} — ${escapeHtml(t.file)}</option>`).join('');
  }

  const dbNodes = allDbNodes.filter((n) => !q || n.label.toLowerCase().includes(q));
  if (dbNodes.length === 0) {
    container.innerHTML = `<div class="entity-card"><div class="entity-card-body">Nenhuma tabela ou schema ORM encontrado.</div></div>`;
  } else {
    container.innerHTML = dbNodes.map((db) => {
      const cols = (db.details && db.details.columns) || [];
      const rels = state.data.edges.filter((e) => e.source === db.id || e.target === db.id);
      const isFocused = state.dbFocusedId === db.id;
      return `
        <div class="entity-card ${isFocused ? 'pulse-highlight' : ''}" id="db-card-${escapeHtml(db.id)}" tabindex="-1">
          <div class="entity-card-header">
            <strong>🗄️ ${escapeHtml(db.label)}</strong>
            <span class="badge badge-db">${escapeHtml(db.subType || 'Table')}</span>
          </div>
          <div class="entity-card-body">
            <div class="file-loc">📍 ${escapeHtml(db.file)}:${db.line}</div>
            <div>
              <strong style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Colunas (${cols.length})</strong>
              ${cols.map((c) => `
                <div class="member-row">
                  <span>${c.isPk ? '<span style="color:#fbbf24;font-weight:bold;">🔑 PK</span> ' : c.isFk ? '<span style="color:#38bdf8;font-weight:bold;">🔗 FK</span> ' : c.isUnique ? '<span style="color:#c084fc;font-weight:bold;">✦ UQ</span> ' : ''}${escapeHtml(c.name)}</span>
                  <span style="color:var(--text-muted)">${escapeHtml(c.type)}</span>
                </div>
              `).join('')}
            </div>
            <div>
              <strong style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Relacionamentos & Queries (${rels.length})</strong>
              ${rels.map((r) => {
                const otherId = r.source === db.id ? r.target : r.source;
                const other = state.data.nodes.find((n) => n.id === otherId);
                return `<div class="member-row" style="cursor:pointer;" onclick="focusOnDBTable('${escapeHtml(other ? other.label : '')}')">
                  <span>${r.source === db.id ? '➡️' : '⬅️'} ${escapeHtml(other ? other.label : otherId)}</span>
                  <span style="color:var(--accent-amber)">${escapeHtml(r.label)}</span>
                </div>`;
              }).join('') || '<div style="font-size:12px;color:var(--text-muted)">Sem conexões externas</div>'}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
  if (state.dbViewMode === 'diagram') renderDBDiagram();
}

function ensureDBPositions(dbNodes) {
  const colsPerRow = Math.max(2, Math.ceil(Math.sqrt(dbNodes.length)));
  dbNodes.forEach((node, idx) => {
    if (!state.dbPositions.has(node.id)) {
      state.dbPositions.set(node.id, {
        x: 240 + (idx % colsPerRow) * 370,
        y: 190 + Math.floor(idx / colsPerRow) * 290
      });
    }
  });
}

function renderDBDiagram() {
  const svg = document.getElementById('db-er-svg');
  if (!svg) return;
  const dbNodes = state.data.nodes.filter((n) => n.category === 'database');
  ensureDBPositions(dbNodes);

  const nodeIds = new Set(dbNodes.map((n) => n.id));
  const dbEdges = state.data.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  const { scale, tx, ty } = state.dbZoom;

  let boundarySvg = '';
  if (dbNodes.length > 0 && window.SvgEngine) {
    const bId = 'db:boundary:schema';
    const rect = resolveBoundaryRect(bId, dbNodes, state.dbPositions, 145, 115);
    boundarySvg = window.SvgEngine.renderResizableBoundary({
      id: bId,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      label: 'Relational Database Schema [Data Boundary]',
      subLabel: 'Fronteira do Modelo Entidade-Relacionamento (Arraste as alças nas bordas para redimensionar)',
      strokeColor: '#f59e0b',
      fillColor: 'rgba(69, 26, 3, 0.14)'
    });
  }

  let edgesSvg = '';
  for (const e of dbEdges) {
    const p1 = state.dbPositions.get(e.source) || { x: 150, y: 150 };
    const p2 = state.dbPositions.get(e.target) || { x: 450, y: 150 };
    const isH = state.dbFocusedId && (e.source === state.dbFocusedId || e.target === state.dbFocusedId);
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2 - 8;
    const lbl = e.label || '1:N';
    const pillW = Math.max(88, lbl.length * 6.5 + 16);

    edgesSvg += `
      <g class="er-edge" data-source="${escapeHtml(e.source)}" data-target="${escapeHtml(e.target)}">
        <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"
              stroke="${isH ? '#38bdf8' : '#f59e0b'}" stroke-width="${isH ? 2.6 : 1.8}" marker-start="url(#er-one)" marker-end="url(#er-crowsfoot)" />
        <rect x="${mx - pillW / 2}" y="${my - 11}" width="${pillW}" height="17" rx="4" fill="#0b0f19" stroke="#334155" opacity="0.92" />
        <text x="${mx}" y="${my + 1}" fill="#fbbf24" font-size="10" font-family="monospace" text-anchor="middle">${escapeHtml(lbl)}</text>
      </g>
    `;
  }

  let boxesSvg = '';
  for (const db of dbNodes) {
    const pos = state.dbPositions.get(db.id) || { x: 200, y: 200 };
    const cols = (db.details && db.details.columns) || [];
    const headerH = 54;
    const bodyH = Math.max(34, cols.length * 22 + 14);
    const w = 270, h = headerH + bodyH, hw = w / 2, hh = h / 2;
    const isFocused = state.dbFocusedId === db.id;
    const borderCol = isFocused ? '#38bdf8' : '#f59e0b';
    const stereotype = `«${(db.details && db.details.orm) || db.subType || 'Table'}»`;

    const colsSvg = cols.map((c, i) => {
      const ry = -hh + headerH + 20 + i * 22;
      const badge = c.isPk ? '🔑 PK' : c.isFk ? '🔗 FK' : c.isUnique ? '✦ UQ' : '  • ';
      const bCol = c.isPk ? '#fbbf24' : c.isFk ? '#38bdf8' : c.isUnique ? '#c084fc' : '#64748b';
      return `
        <text x="${-hw + 12}" y="${ry}" fill="#f1f5f9" font-size="11" font-family="monospace"><tspan fill="${bCol}" font-weight="bold">${badge}</tspan> ${escapeHtml(c.name.slice(0, 18))}</text>
        <text x="${hw - 12}" y="${ry}" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="end">${escapeHtml((c.type || '').slice(0, 16))}</text>
      `;
    }).join('');

    boxesSvg += `
      <g class="er-node" data-id="${escapeHtml(db.id)}" transform="translate(${pos.x}, ${pos.y})" style="cursor:grab;">
        <rect x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="8" fill="#0f172a" stroke="${borderCol}" stroke-width="${isFocused ? 3.5 : 2}" />
        <rect x="${-hw}" y="${-hh}" width="${w}" height="${headerH}" rx="8" fill="#451a03" stroke="${borderCol}" stroke-width="1.5" />
        <text x="0" y="${-hh + 16}" fill="#fde68a" font-size="10" font-family="monospace" text-anchor="middle" style="pointer-events:none; user-select:none;">${escapeHtml(stereotype)}</text>
        <text x="0" y="${-hh + 34}" fill="#ffffff" font-size="13" font-weight="700" text-anchor="middle" style="pointer-events:none; user-select:none;">🗄️ ${escapeHtml(db.label)}</text>
        <text x="0" y="${-hh + 48}" fill="#fcd34d" font-size="9" font-family="monospace" text-anchor="middle" style="pointer-events:none; user-select:none;">${escapeHtml(db.file)}:${db.line}</text>
        <line x1="${-hw}" y1="${-hh + headerH}" x2="${hw}" y2="${-hh + headerH}" stroke="${borderCol}" stroke-width="1" />
        ${colsSvg}
      </g>
    `;
  }

  svg.innerHTML = `
    <defs>
      <marker id="er-crowsfoot" viewBox="0 0 14 14" refX="12" refY="7" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
        <path d="M 0 7 L 12 7 M 12 1 L 4 7 L 12 13 M 3 2 L 3 12" fill="none" stroke="#f59e0b" stroke-width="1.8" />
      </marker>
      <marker id="er-one" viewBox="0 0 10 10" refX="4" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 4 1 L 4 9 M 7 1 L 7 9" fill="none" stroke="#f59e0b" stroke-width="1.8" />
      </marker>
    </defs>
    <g id="db-er-viewport" transform="translate(${tx}, ${ty}) scale(${scale})">${boundarySvg}${edgesSvg}${boxesSvg}</g>
  `;
}

function resetDBDiagramZoom() {
  state.dbZoom = { scale: 1, tx: 0, ty: 0 };
  state.dbFocusedId = null;
  state.boundaryRects.delete('db:boundary:schema');
  renderDBDiagram();
}

function focusOnDBTable(rawQuery) {
  const q = (rawQuery || '').trim().toLowerCase();
  if (!q) return;
  const dbNodes = state.data.nodes.filter((n) => n.category === 'database');
  const target = dbNodes.find((n) => n.label.toLowerCase() === q) || dbNodes.find((n) => n.label.toLowerCase().includes(q));
  if (!target) return;
  state.dbFocusedId = target.id;

  if (state.dbViewMode === 'diagram') {
    ensureDBPositions(dbNodes);
    const pos = state.dbPositions.get(target.id) || { x: 200, y: 200 };
    const container = document.getElementById('db-diagram-container');
    const cw = (container && container.clientWidth) || 1000;
    const ch = (container && container.clientHeight) || 600;
    state.dbZoom = { scale: 1.35, tx: cw / 2 - pos.x * 1.35, ty: ch / 2 - pos.y * 1.35 };
    renderDBDiagram();
  } else {
    renderDatabaseTab();
    setTimeout(() => {
      const cardEl = document.getElementById(`db-card-${target.id}`);
      if (cardEl) {
        cardEl.classList.remove('pulse-highlight');
        void cardEl.offsetWidth;
        cardEl.classList.add('pulse-highlight');
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  }
}

// ============================================================================
// TAB 3: OOP CLASSES, INHERITANCE & ENCAPSULATION (CARDS + UML DIAGRAM)
// ============================================================================

function switchOOPView(mode) {
  state.oopViewMode = mode;
  document.getElementById('oop-cards-grid').style.display = mode === 'diagram' ? 'none' : 'grid';
  document.getElementById('oop-diagram-container').style.display = mode === 'diagram' ? 'block' : 'none';
  const resetBtn = document.getElementById('btn-oop-reset');
  if (resetBtn) resetBtn.style.display = mode === 'diagram' ? 'inline-flex' : 'none';
  const sel = document.getElementById('oop-view-mode');
  if (sel && sel.value !== mode) sel.value = mode;
  if (mode === 'diagram') renderOOPDiagram();
}

function renderOOPTab() {
  const container = document.getElementById('oop-cards-grid');
  const datalist = document.getElementById('oop-class-datalist');
  const q = state.searchQuery;
  const allOopNodes = state.data.nodes.filter((n) => ['class', 'interface', 'enum'].includes(n.category));

  if (datalist) {
    datalist.innerHTML = allOopNodes.map((c) => `<option value="${escapeHtml(c.label)}">${escapeHtml(c.subType)} — ${escapeHtml(c.file)}</option>`).join('');
  }

  const oopNodes = allOopNodes.filter((n) => !q || `${n.label} ${n.file}`.toLowerCase().includes(q));
  if (oopNodes.length === 0) {
    container.innerHTML = `<div class="entity-card"><div class="entity-card-body">Nenhuma classe ou interface encontrada.</div></div>`;
  } else {
    container.innerHTML = oopNodes.map((cls) => {
      const members = (cls.details && cls.details.members) || [];
      const rels = state.data.edges.filter((e) => e.source === cls.id || e.target === cls.id);
      const isFocused = state.oopFocusedId === cls.id;
      return `
        <div class="entity-card ${isFocused ? 'pulse-highlight' : ''}" id="oop-card-${escapeHtml(cls.id)}" tabindex="-1">
          <div class="entity-card-header">
            <strong>🧬 ${escapeHtml(cls.label)}</strong>
            <span class="badge badge-class">${escapeHtml(cls.subType)}</span>
          </div>
          <div class="entity-card-body">
            <div class="file-loc">📍 ${escapeHtml(cls.file)}:${cls.line}</div>
            <div>
              <strong style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Herança, Interfaces & Composição (${rels.length})</strong>
              ${rels.map((r) => {
                const otherId = r.source === cls.id ? r.target : r.source;
                const other = state.data.nodes.find((n) => n.id === otherId);
                return `<div class="member-row" style="cursor:pointer;" onclick="focusOnOOPClass('${escapeHtml(other ? other.label : '')}')">
                  <span>${r.source === cls.id ? '⬆️' : '⬇️'} ${escapeHtml(other ? other.label : otherId)}</span>
                  <span style="color:var(--accent-cyan)">${escapeHtml(r.label)}</span>
                </div>`;
              }).join('') || '<div style="font-size:12px;color:var(--text-muted)">Sem herança externa</div>'}
            </div>
            <div>
              <strong style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Encapsulamento de Membros (${members.length})</strong>
              ${members.map((m) => {
                const sym = m.visibility === 'private' ? '- private' : m.visibility === 'protected' ? '# protected' : '+ public';
                const clsVis = m.visibility === 'private' ? 'vis-priv' : m.visibility === 'protected' ? 'vis-prot' : 'vis-pub';
                return `<div class="member-row"><span><span class="${clsVis}">${sym}</span> ${escapeHtml(m.name)}</span><span style="color:var(--text-muted)">${escapeHtml(m.kind)}</span></div>`;
              }).join('') || '<div style="font-size:12px;color:var(--text-muted)">Membros padrão</div>'}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
  if (state.oopViewMode === 'diagram') renderOOPDiagram();
}

function ensureOOPPositions(oopNodes) {
  const interfaces = oopNodes.filter((n) => n.category === 'interface' || (n.subType && n.subType.includes('abstract')));
  const concrete = oopNodes.filter((n) => !interfaces.includes(n));
  [interfaces, concrete].filter((r) => r.length > 0).forEach((row, rIdx) => {
    row.forEach((node, cIdx) => {
      if (!state.oopPositions.has(node.id)) {
        state.oopPositions.set(node.id, { x: 240 + cIdx * 340, y: 185 + rIdx * 290 });
      }
    });
  });
}

function renderOOPDiagram() {
  const svg = document.getElementById('oop-uml-svg');
  if (!svg) return;
  const oopNodes = state.data.nodes.filter((n) => ['class', 'interface', 'enum'].includes(n.category));
  ensureOOPPositions(oopNodes);

  const nodeIds = new Set(oopNodes.map((n) => n.id));
  const oopEdges = state.data.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  const { scale, tx, ty } = state.oopZoom;

  let boundarySvg = '';
  if (oopNodes.length > 0 && window.SvgEngine) {
    const bId = 'oop:boundary:uml';
    const rect = resolveBoundaryRect(bId, oopNodes, state.oopPositions, 140, 125);
    boundarySvg = window.SvgEngine.renderResizableBoundary({
      id: bId,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      label: 'Domain & OOP Class Model [Code Boundary — C4 Level 4]',
      subLabel: 'Fronteira do Diagrama de Classes UML (Arraste as alças nas bordas para redimensionar)',
      strokeColor: '#a855f7',
      fillColor: 'rgba(46, 16, 101, 0.14)'
    });
  }

  let edgesSvg = '';
  for (const e of oopEdges) {
    const p1 = state.oopPositions.get(e.source) || { x: 150, y: 150 };
    const p2 = state.oopPositions.get(e.target) || { x: 400, y: 150 };
    const isImpl = e.type === 'implements';
    const isExt = e.type === 'extends';
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2 - 8;

    edgesSvg += `
      <g class="uml-edge" data-source="${escapeHtml(e.source)}" data-target="${escapeHtml(e.target)}">
        <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"
              stroke="${isExt || isImpl ? '#a855f7' : '#38bdf8'}" stroke-width="2"
              ${isImpl ? 'stroke-dasharray="6,4"' : ''}
              marker-end="${isExt || isImpl ? 'url(#uml-hollow-arrow)' : 'url(#uml-diamond-arrow)'}" />
        <rect x="${mx - 48}" y="${my - 11}" width="96" height="16" rx="4" fill="#0b0f19" opacity="0.85" />
        <text x="${mx}" y="${my}" fill="#cbd5e1" font-size="10" font-family="monospace" text-anchor="middle">${escapeHtml(e.type)}</text>
      </g>
    `;
  }

  let boxesSvg = '';
  for (const cls of oopNodes) {
    const pos = state.oopPositions.get(cls.id) || { x: 200, y: 200 };
    const members = (cls.details && cls.details.members) || [];
    const fields = members.filter((m) => m.kind === 'field');
    const methods = members.filter((m) => m.kind !== 'field');
    const headerH = 54, fieldH = Math.max(28, fields.length * 20 + 12), methodH = Math.max(28, methods.length * 20 + 12);
    const w = 260, h = headerH + fieldH + methodH, hw = w / 2, hh = h / 2;
    const isFocused = state.oopFocusedId === cls.id;
    const borderCol = isFocused ? '#38bdf8' : cls.category === 'interface' ? '#10b981' : '#8b5cf6';
    const headerBg = cls.category === 'interface' ? '#064e3b' : '#2e1065';
    const stereotype = cls.category === 'interface' ? '«interface»' : (cls.subType && cls.subType.includes('abstract')) ? '«abstract»' : '«class»';

    const fieldsSvg = fields.length === 0
      ? `<text x="${-hw + 12}" y="${-hh + headerH + 18}" fill="#64748b" font-size="11" font-family="monospace">(sem atributos)</text>`
      : fields.map((f, i) => {
          const sym = f.visibility === 'private' ? '-' : f.visibility === 'protected' ? '#' : '+';
          const col = f.visibility === 'private' ? '#fb7185' : f.visibility === 'protected' ? '#fbbf24' : '#34d399';
          return `<text x="${-hw + 12}" y="${-hh + headerH + 18 + i * 20}" fill="#e2e8f0" font-size="11" font-family="monospace"><tspan fill="${col}" font-weight="bold">${sym}</tspan> ${escapeHtml(f.name.slice(0, 32))}</text>`;
        }).join('');

    const mStartY = -hh + headerH + fieldH;
    const methodsSvg = methods.length === 0
      ? `<text x="${-hw + 12}" y="${mStartY + 18}" fill="#64748b" font-size="11" font-family="monospace">(sem métodos)</text>`
      : methods.map((m, i) => {
          const sym = m.visibility === 'private' ? '-' : m.visibility === 'protected' ? '#' : '+';
          const col = m.visibility === 'private' ? '#fb7185' : m.visibility === 'protected' ? '#fbbf24' : '#34d399';
          return `<text x="${-hw + 12}" y="${mStartY + 18 + i * 20}" fill="#e2e8f0" font-size="11" font-family="monospace"><tspan fill="${col}" font-weight="bold">${sym}</tspan> ${escapeHtml(m.name.slice(0, 32))}</text>`;
        }).join('');

    boxesSvg += `
      <g class="uml-node" data-id="${escapeHtml(cls.id)}" transform="translate(${pos.x}, ${pos.y})" style="cursor:grab;">
        <rect x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="8" fill="#0f172a" stroke="${borderCol}" stroke-width="${isFocused ? 3.5 : 2}" />
        <rect x="${-hw}" y="${-hh}" width="${w}" height="${headerH}" rx="8" fill="${headerBg}" stroke="${borderCol}" stroke-width="1.5" />
        <text x="0" y="${-hh + 16}" fill="#cbd5e1" font-size="10" font-family="monospace" text-anchor="middle" style="pointer-events:none; user-select:none;">${stereotype}</text>
        <text x="0" y="${-hh + 34}" fill="#ffffff" font-size="13" font-weight="700" text-anchor="middle" style="pointer-events:none; user-select:none;">${escapeHtml(cls.label)}</text>
        <text x="0" y="${-hh + 48}" fill="#94a3b8" font-size="9" font-family="monospace" text-anchor="middle" style="pointer-events:none; user-select:none;">${escapeHtml(cls.file)}:${cls.line}</text>
        <line x1="${-hw}" y1="${-hh + headerH}" x2="${hw}" y2="${-hh + headerH}" stroke="${borderCol}" stroke-width="1" />
        ${fieldsSvg}
        <line x1="${-hw}" y1="${mStartY}" x2="${hw}" y2="${mStartY}" stroke="${borderCol}" stroke-width="1" />
        ${methodsSvg}
      </g>
    `;
  }

  svg.innerHTML = `
    <defs>
      <marker id="uml-hollow-arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
        <path d="M 0 1 L 11 6 L 0 11 z" fill="#0b0f19" stroke="#a855f7" stroke-width="1.8" />
      </marker>
      <marker id="uml-diamond-arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
        <path d="M 0 6 L 6 1 L 12 6 L 6 11 z" fill="#38bdf8" />
      </marker>
    </defs>
    <g id="oop-uml-viewport" transform="translate(${tx}, ${ty}) scale(${scale})">${boundarySvg}${edgesSvg}${boxesSvg}</g>
  `;
}

function resetOOPDiagramZoom() {
  state.oopZoom = { scale: 1, tx: 0, ty: 0 };
  state.oopFocusedId = null;
  state.boundaryRects.delete('oop:boundary:uml');
  renderOOPDiagram();
}

function focusOnOOPClass(rawQuery) {
  const q = (rawQuery || '').trim().toLowerCase();
  if (!q) return;
  const oopNodes = state.data.nodes.filter((n) => ['class', 'interface', 'enum'].includes(n.category));
  const target = oopNodes.find((n) => n.label.toLowerCase() === q) || oopNodes.find((n) => n.label.toLowerCase().includes(q));
  if (!target) return;
  state.oopFocusedId = target.id;

  if (state.oopViewMode === 'diagram') {
    ensureOOPPositions(oopNodes);
    const pos = state.oopPositions.get(target.id) || { x: 200, y: 200 };
    const container = document.getElementById('oop-diagram-container');
    const cw = (container && container.clientWidth) || 1000;
    const ch = (container && container.clientHeight) || 600;
    state.oopZoom = { scale: 1.35, tx: cw / 2 - pos.x * 1.35, ty: ch / 2 - pos.y * 1.35 };
    renderOOPDiagram();
  } else {
    renderOOPTab();
    setTimeout(() => {
      const cardEl = document.getElementById(`oop-card-${target.id}`);
      if (cardEl) {
        cardEl.classList.remove('pulse-highlight');
        void cardEl.offsetWidth;
        cardEl.classList.add('pulse-highlight');
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  }
}

// ============================================================================
// TAB 4: UI COMPONENT REUSE ACROSS SCREENS
// ============================================================================

function renderUITab() {
  const container = document.getElementById('ui-cards-grid');
  const q = state.searchQuery;
  const uiNodes = state.data.nodes.filter((n) => ['component', 'screen'].includes(n.category) && (!q || `${n.label} ${n.file}`.toLowerCase().includes(q)));

  if (uiNodes.length === 0) {
    container.innerHTML = `<div class="entity-card"><div class="entity-card-body">Nenhum componente UI ou tela detectado.</div></div>`;
    return;
  }

  container.innerHTML = uiNodes.map((ui) => {
    const usedBy = state.data.edges.filter((e) => e.target === ui.id && e.type === 'renders');
    const uses = state.data.edges.filter((e) => e.source === ui.id && (e.type === 'renders' || e.type === 'imports'));

    return `
      <div class="entity-card">
        <div class="entity-card-header">
          <strong>${ui.category === 'screen' ? '🖥️' : '🧩'} &lt;${escapeHtml(ui.label)} /&gt;</strong>
          <span class="badge ${ui.category === 'screen' ? 'badge-screen' : 'badge-component'}">
            ${ui.category === 'screen' ? 'Tela / Página' : `Reutilizado em ${usedBy.length} tela(s)`}
          </span>
        </div>
        <div class="entity-card-body">
          <div class="file-loc">📍 Criado em: ${escapeHtml(ui.file)}:${ui.line}</div>
          <div>
            <strong style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Telas / Componentes onde é reutilizado (${usedBy.length})</strong>
            ${usedBy.map((e) => {
              const parent = state.data.nodes.find((n) => n.id === e.source);
              return `<div class="member-row"><span>🖥️ ${escapeHtml(parent ? parent.label : e.source)}</span><span style="color:var(--accent-emerald)">${escapeHtml(e.label)}</span></div>`;
            }).join('') || '<div style="font-size:12px;color:var(--text-muted)">Ponto de entrada / Tela raiz</div>'}
          </div>
          <div>
            <strong style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Componentes e Funções que consome (${uses.length})</strong>
            ${uses.map((e) => {
              const child = state.data.nodes.find((n) => n.id === e.target);
              return `<div class="member-row"><span>🧩 ${escapeHtml(child ? child.label : e.target)}</span><span style="color:var(--accent-cyan)">${escapeHtml(e.label)}</span></div>`;
            }).join('') || '<div style="font-size:12px;color:var(--text-muted)">Nenhuma dependência interna</div>'}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// TAB 5: ARC42 MARKDOWN EDITOR & PDF EXPORT
// ============================================================================

function renderDocsTab() {
  const listEl = document.getElementById('doc-list');
  const docs = state.data.markdownDocs || [];
  if (docs.length === 0) {
    listEl.innerHTML = `<div style="font-size:12px; color:var(--text-muted);">Nenhum arquivo .md encontrado.</div>`;
    updateSelectedDocsBadge();
    return;
  }

  if (state.selectedDocIds.size === 0) {
    docs.forEach((d) => state.selectedDocIds.add(d.id));
  }

  listEl.innerHTML = docs.map((d, idx) => {
    const isChecked = state.selectedDocIds.has(d.id);
    return `
      <div class="doc-item ${idx === state.activeDocIndex ? 'active' : ''}" onclick="selectDoc(${idx})" style="flex-direction:row; align-items:flex-start; gap:10px;">
        <input type="checkbox" class="doc-select-cb" data-doc-id="${escapeHtml(d.id)}"
               ${isChecked ? 'checked' : ''}
               onclick="event.stopPropagation()"
               onchange="toggleDocSelection('${escapeHtml(d.id)}', this.checked)"
               style="margin-top:3px; cursor:pointer; accent-color:var(--accent-blue);" />
        <div style="display:flex; flex-direction:column; gap:2px; overflow:hidden;">
          <strong style="color:#f8fafc; word-break:break-word;">${escapeHtml(d.title)}</strong>
          <span style="font-family:monospace; font-size:10px;">${escapeHtml(d.path)}</span>
        </div>
      </div>
    `;
  }).join('');

  updateSelectedDocsBadge();
  selectDoc(state.activeDocIndex);
}

function toggleDocSelection(docId, isChecked) {
  if (isChecked) state.selectedDocIds.add(docId);
  else state.selectedDocIds.delete(docId);
  updateSelectedDocsBadge();
}

function toggleSelectAllDocs(checkAll) {
  const docs = state.data.markdownDocs || [];
  state.selectedDocIds.clear();
  if (checkAll) docs.forEach((d) => state.selectedDocIds.add(d.id));
  document.querySelectorAll('.doc-select-cb').forEach((cb) => { cb.checked = checkAll; });
  updateSelectedDocsBadge();
}

function updateSelectedDocsBadge() {
  const docs = state.data.markdownDocs || [];
  const countEl = document.getElementById('selected-docs-count');
  const selectAllCb = document.getElementById('select-all-docs-cb');
  if (countEl) countEl.textContent = `${state.selectedDocIds.size}/${docs.length} sel.`;
  if (selectAllCb && docs.length > 0) selectAllCb.checked = state.selectedDocIds.size === docs.length;
}

function getSelectedDocsList() {
  return (state.data.markdownDocs || []).filter((d) => state.selectedDocIds.has(d.id));
}

function selectDoc(idx) {
  const docs = state.data.markdownDocs || [];
  if (!docs[idx]) return;
  state.activeDocIndex = idx;
  document.querySelectorAll('.doc-item').forEach((el, i) => el.classList.toggle('active', i === idx));

  const doc = docs[idx];
  document.getElementById('current-doc-title').textContent = doc.title;
  document.getElementById('current-doc-path').textContent = doc.path;
  document.getElementById('md-editor-input').value = doc.content;
  document.getElementById('save-status').textContent = '';
  renderMarkdownPreview();
}

function onMarkdownInput() {
  const docs = state.data.markdownDocs || [];
  if (docs[state.activeDocIndex]) {
    docs[state.activeDocIndex].content = document.getElementById('md-editor-input').value;
  }
  renderMarkdownPreview();
}

function simpleMarkdownToHtml(md) {
  let html = escapeHtml(md);
  const mermaidBlocks = [];
  html = html.replace(/```mermaid\r?\n([\s\S]*?)```/g, (_, code) => {
    const idx = mermaidBlocks.length;
    mermaidBlocks.push(code.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"'));
    return `@@MERMAID_BLOCK_${idx}@@`;
  });

  html = html.replace(/```(\w*)\r?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/^\|(.+)\|\r?\n\|([-:| ]+)\|\r?\n((?:\|.*\|\r?\n?)*)/gm, (_, headerRow, sepRow, bodyRows) => {
    const headers = headerRow.split('|').map((s) => s.trim()).filter(Boolean);
    const rows = bodyRows.trim().split(/\r?\n/).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  });

  html = html.replace(/^---$/gm, '<hr/>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/\n\n/g, '<br/><br/>');
  html = html.replace(/@@MERMAID_BLOCK_(\d+)@@/g, (_, idx) => `<div class="mermaid" style="background:#090d16; padding:16px; border-radius:8px; margin:12px 0;">${mermaidBlocks[Number(idx)]}</div>`);
  return html;
}

async function renderMarkdownPreview() {
  const raw = document.getElementById('md-editor-input').value;
  const previewEl = document.getElementById('md-editor-preview');
  previewEl.innerHTML = simpleMarkdownToHtml(raw);
  if (window.mermaid) {
    try { await mermaid.run({ nodes: previewEl.querySelectorAll('.mermaid') }); } catch (e) {}
  }
}

function createNewArc42Chapter() {
  const fileName = prompt('Caminho do novo arquivo Markdown (ex: doc/architecture/06_runtime_view.md):', 'doc/architecture/06_runtime_view.md');
  if (!fileName) return;
  const newDoc = {
    id: `doc:${fileName}`,
    title: fileName.split('/').pop().replace(/\.md$/i, ''),
    path: fileName,
    category: 'arc42',
    content: `<!-- arc42:generated -->\n# ${fileName.split('/').pop().replace(/\.md$/i, '')}\n\n## Visão em Tempo de Execução\n\n\`\`\`mermaid\nsequenceDiagram\n  actor Usuario\n  Usuario->>Sistema: Requisição\n  Sistema-->>Usuario: Resposta\n\`\`\`\n<!-- /arc42:generated -->`
  };
  state.data.markdownDocs.push(newDoc);
  state.selectedDocIds.add(newDoc.id);
  state.activeDocIndex = state.data.markdownDocs.length - 1;
  renderDocsTab();
}

async function saveCurrentMarkdown() {
  const doc = state.data.markdownDocs[state.activeDocIndex];
  if (!doc) return;
  const statusEl = document.getElementById('save-status');

  if (state.dirHandle && window.BrowserScanner) {
    try {
      await window.BrowserScanner.writeFileToDirHandle(state.dirHandle, doc.path, doc.content);
      statusEl.textContent = `✅ Salvo direto no disco: ${doc.path}`;
      return;
    } catch (e) {}
  }

  if (location.protocol.startsWith('http')) {
    try {
      const res = await fetch('/api/save-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relPath: doc.path, content: doc.content })
      });
      const json = await res.json();
      if (json.ok) {
        statusEl.textContent = `✅ Salvo no disco: ${doc.path}`;
        return;
      }
    } catch (e) {}
  }

  const blob = new Blob([doc.content], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = doc.path.split('/').pop() || 'documento.md';
  a.click();
  statusEl.textContent = `📥 Arquivo ${a.download} baixado!`;
}

function exportCurrentDocToPDF() {
  switchTab('tab-docs');
  renderMarkdownPreview().then(() => setTimeout(() => window.print(), 250));
}

async function exportSelectedDocsToPDF() {
  const selected = getSelectedDocsList();
  if (selected.length === 0) {
    alert('Selecione pelo menos 1 arquivo .md na barra lateral.');
    return;
  }
  switchTab('tab-docs');
  const previewEl = document.getElementById('md-editor-preview');
  const repoName = (state.data.summary && state.data.summary.repoName) || 'Repositório';
  const consolidatedMd = [
    `# Caderno Consolidado de Arquitetura (arc42 + C4) — ${repoName}`,
    `**Capítulos consolidados (${selected.length}):** ${selected.map((d) => '`' + d.path + '`').join(', ')}`,
    ...selected.map((d) => `\n\n---\n\n${d.content}`)
  ].join('\n\n');

  previewEl.innerHTML = simpleMarkdownToHtml(consolidatedMd).replace(/<hr\s*\/?>/gi, '<div style="page-break-before: always; border-top: 2px solid #334155; margin: 28px 0;"></div>');
  if (window.mermaid) {
    try { await mermaid.run({ nodes: previewEl.querySelectorAll('.mermaid') }); } catch (e) {}
  }
  setTimeout(() => {
    window.print();
    setTimeout(() => renderMarkdownPreview(), 400);
  }, 300);
}

function downloadSelectedDocsMarkdown() {
  const selected = getSelectedDocsList();
  if (selected.length === 0) {
    alert('Selecione pelo menos 1 arquivo .md na barra lateral.');
    return;
  }
  const repoName = (state.data.summary && state.data.summary.repoName) || 'repositorio';
  const consolidatedMd = selected.map((d) => `<!-- FILE: ${d.path} -->\n${d.content}`).join('\n\n---\n\n');
  const blob = new Blob([consolidatedMd], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${repoName}-arc42-consolidado.md`;
  a.click();
}

// ============================================================================
// TAB 6: HUMAN AUDIT & FINDINGS
// ============================================================================

function renderAuditTab() {
  const container = document.getElementById('audit-cards-grid');
  const findings = state.data.findings || [];

  const checklistCard = `
    <div class="entity-card">
      <div class="entity-card-header">
        <strong>✅ Checklist de Validação Humana sobre IA</strong>
        <span class="badge badge-component">Governança</span>
      </div>
      <div class="entity-card-body">
        <label style="display:flex; gap:8px; align-items:center;"><input type="checkbox"/> Os limites de Contexto (C1) e Contêineres (C2) refletem a arquitetura desejada?</label>
        <label style="display:flex; gap:8px; align-items:center;"><input type="checkbox"/> Todas as tabelas novas possuem chaves estrangeiras no DER (Aba 2)?</label>
        <label style="display:flex; gap:8px; align-items:center;"><input type="checkbox"/> Atributos sensíveis das classes estão encapsulados como <code>private</code>/<code>protected</code> no UML (Aba 3)?</label>
        <label style="display:flex; gap:8px; align-items:center;"><input type="checkbox"/> Componentes de UI existentes foram reutilizados em vez de duplicados pela IA?</label>
      </div>
    </div>
  `;

  const findingCards = findings.map((f) => `
    <div class="entity-card">
      <div class="entity-card-header">
        <strong>⚠️ ${escapeHtml(f.category)}: ${escapeHtml(f.target)}</strong>
        <span class="badge badge-db">${escapeHtml(f.severity.toUpperCase())}</span>
      </div>
      <div class="entity-card-body">
        <div class="file-loc">📍 ${escapeHtml(f.file)}:${f.line}</div>
        <p>${escapeHtml(f.message)}</p>
      </div>
    </div>
  `).join('');

  container.innerHTML = checklistCard + (findingCards || `<div class="entity-card"><div class="entity-card-header"><strong>🎉 Nenhum alerta crítico detectado</strong></div></div>`);
}

// ============================================================================
// RESCAN / FOLDER PICKER INTEGRATION
// ============================================================================

async function rescanRepo(forcePickNewFolder = false) {
  const btn = document.getElementById('btn-rescan');

  if (!forcePickNewFolder && location.protocol.startsWith('http') && !state.dirHandle) {
    try {
      const res = await fetch('/api/rescan', { method: 'POST' });
      const json = await res.json();
      if (json.ok && json.data) {
        state.nodePositions.clear();
        state.dbPositions.clear();
        state.oopPositions.clear();
        state.boundaryRects.clear();
        state.selectedDocIds.clear();
        state.data = json.data;
        initDashboard();
        if (btn) btn.textContent = '✅ Código Atualizado!';
        setTimeout(() => { if (btn) btn.textContent = '🔄 Reanalisar Código'; }, 2000);
        return;
      }
    } catch (e) {}
  }

  if (window.showDirectoryPicker && window.BrowserScanner) {
    try {
      if (forcePickNewFolder || !state.dirHandle) {
        state.dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      }
      if (btn) btn.textContent = '⏳ Analisando...';
      const rawFiles = await window.BrowserScanner.collectFilesFromDirHandle(state.dirHandle);
      state.data = window.BrowserScanner.analyzeFilesInBrowser(state.dirHandle.name, state.dirHandle.name, rawFiles);
      state.nodePositions.clear();
      state.dbPositions.clear();
      state.oopPositions.clear();
      state.boundaryRects.clear();
      state.selectedDocIds.clear();
      initDashboard();
      if (btn) btn.textContent = `✅ Atualizado (${rawFiles.length} arqs)`;
      setTimeout(() => { if (btn) btn.textContent = '🔄 Reanalisar Código'; }, 2500);
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }

  document.getElementById('folder-fallback-input').click();
}

async function onFallbackFolderSelected(fileList) {
  if (!fileList || fileList.length === 0 || !window.BrowserScanner) return;
  const btn = document.getElementById('btn-rescan');
  if (btn) btn.textContent = '⏳ Analisando...';
  const rawFiles = [];
  let repoName = 'Repositório';

  for (const f of fileList) {
    const rawRel = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
    const parts = rawRel.split('/');
    if (parts.length > 1) repoName = parts[0];
    const relPath = parts.length > 1 ? parts.slice(1).join('/') : rawRel;
    const dotIdx = f.name.lastIndexOf('.');
    const ext = dotIdx >= 0 ? f.name.slice(dotIdx).toLowerCase() : '';
    const content = await f.text();
    rawFiles.push({ name: f.name, relPath, ext, content });
  }

  state.data = window.BrowserScanner.analyzeFilesInBrowser(repoName, repoName, rawFiles);
  state.nodePositions.clear();
  state.dbPositions.clear();
  state.oopPositions.clear();
  state.boundaryRects.clear();
  state.selectedDocIds.clear();
  initDashboard();
  if (btn) btn.textContent = `✅ Atualizado (${rawFiles.length} arqs)`;
  setTimeout(() => { if (btn) btn.textContent = '🔄 Reanalisar Código'; }, 2500);
}

// ============================================================================
// BOOTSTRAP ALL 3 SVG CANVASES WITH THE UNIFIED SVG ENGINE
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
  if (window.SvgEngine) {
    // 1. Tab 1: C4 & General Graph Canvas
    window.SvgEngine.attachInteractiveSvg({
      svgId: 'graph-svg',
      viewportId: 'graph-viewport',
      nodeSelector: '.graph-node',
      edgeSelector: '.edge-group',
      getPositionsMap: () => state.nodePositions,
      getZoomState: () => state.zoom,
      getBoundariesMap: () => state.boundaryRects,
      getNodeSize: () => (state.archMode === 'graph' ? GRAPH_CARD_SIZE : C4_CARD_SIZE),
      onNodeClick: selectNode,
      onNodeDoubleClick: handleGraphNodeDoubleClick
    });

    // 2. Tab 2: Database ER Diagram (DER) Canvas
    window.SvgEngine.attachInteractiveSvg({
      svgId: 'db-er-svg',
      viewportId: 'db-er-viewport',
      nodeSelector: '.er-node',
      edgeSelector: '.er-edge',
      getPositionsMap: () => state.dbPositions,
      getZoomState: () => state.dbZoom,
      getBoundariesMap: () => state.boundaryRects
    });

    // 3. Tab 3: OOP UML Class Diagram Canvas
    window.SvgEngine.attachInteractiveSvg({
      svgId: 'oop-uml-svg',
      viewportId: 'oop-uml-viewport',
      nodeSelector: '.uml-node',
      edgeSelector: '.uml-edge',
      getPositionsMap: () => state.oopPositions,
      getZoomState: () => state.oopZoom,
      getBoundariesMap: () => state.boundaryRects
    });
  }

  document.getElementById('global-search').addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim().toLowerCase();
    renderGraph();
    renderDatabaseTab();
    renderOOPTab();
    renderUITab();
  });

  updateC4Breadcrumb();
  initDashboard();
});
