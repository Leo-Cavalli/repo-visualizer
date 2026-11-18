/**
 * Unified Interactive SVG Controller (svg-engine.js)
 * - Pan & Wheel Zoom
 * - Left-Click Node Drag & Drop with real-time curved border-to-border edge updates
 * - Interactive Resizable & Movable Dashed Boundary Boxes (8 resize handles + header drag)
 */
(function () {
  function escapeAttr(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Finds the intersection point on the border of a rectangle centered at `center` (half-width hw, half-height hh)
   * towards `target`.
   */
  function intersectRectBorder(center, target, hw, hh) {
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      return { x: center.x, y: center.y };
    }
    const scaleX = hw / Math.max(0.001, Math.abs(dx));
    const scaleY = hh / Math.max(0.001, Math.abs(dy));
    const s = Math.min(scaleX, scaleY);
    return {
      x: center.x + dx * s,
      y: center.y + dy * s
    };
  }

  /**
   * Computes a clean Quadratic Bezier path between two rectangular nodes,
   * clipping endpoints to the outer borders of each node box and arcing around same-row obstacles.
   */
  function computeEdgeGeometry(p1, p2, size1, size2, curveOffset = 0) {
    const hw1 = ((size1 && size1.w) || 248) / 2 + 4;
    const hh1 = ((size1 && size1.h) || 116) / 2 + 4;
    const hw2 = ((size2 && size2.w) || 248) / 2 + 8;
    const hh2 = ((size2 && size2.h) || 116) / 2 + 8;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy) || 1;

    // Determine control point offset so same-row long edges arc cleanly above/below intermediate cards
    let normalOffset = curveOffset;
    if (Math.abs(dy) < 40 && Math.abs(dx) > 360 && normalOffset === 0) {
      normalOffset = dx > 0 ? -75 : 75;
    }

    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const nx = -dy / dist;
    const ny = dx / dist;
    const ctrl = {
      x: midX + nx * normalOffset,
      y: midY + ny * normalOffset
    };

    const start = intersectRectBorder(p1, ctrl, hw1, hh1);
    const end = intersectRectBorder(p2, ctrl, hw2, hh2);

    // Recompute control point from border endpoints
    const bMidX = (start.x + end.x) / 2;
    const bMidY = (start.y + end.y) / 2;
    const cx = bMidX + nx * normalOffset;
    const cy = bMidY + ny * normalOffset;

    // Point on quadratic Bezier at t = 0.5 is 0.25*start + 0.5*ctrl + 0.25*end
    const labelX = 0.25 * start.x + 0.5 * cx + 0.25 * end.x;
    const labelY = 0.25 * start.y + 0.5 * cy + 0.25 * end.y;

    return {
      pathD: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
      start,
      end,
      labelX,
      labelY
    };
  }

  /**
   * Renders an interactive resizable & movable dashed boundary box with 8 resize handles (4 corners + 4 sides)
   * and a draggable header title bar.
   */
  function renderResizableBoundary(boundary) {
    const {
      id,
      x,
      y,
      w,
      h,
      label,
      subLabel,
      strokeColor = '#64748b',
      fillColor = 'rgba(15, 23, 42, 0.38)'
    } = boundary;

    const handleSize = 10;
    const hs = handleSize / 2;
    const mx = x + w / 2;
    const my = y + h / 2;

    return `
      <g class="resizable-boundary" data-boundary-id="${escapeAttr(id)}" data-x="${x}" data-y="${y}" data-w="${w}" data-h="${h}">
        <!-- Dashed Main Container Box -->
        <rect class="boundary-box" x="${x}" y="${y}" width="${w}" height="${h}" rx="14"
              fill="${fillColor}" stroke="${strokeColor}" stroke-width="2.2" stroke-dasharray="9,6" />

        <!-- Draggable Header Bar inside Boundary -->
        <rect class="boundary-header-drag" data-handle="move" x="${x + 8}" y="${y + 8}" width="${Math.max(120, w - 16)}" height="44" rx="8"
              fill="rgba(30, 41, 59, 0.65)" stroke="rgba(100, 116, 139, 0.35)" stroke-width="1" style="cursor:move;" />
        <text class="boundary-title" x="${x + 20}" y="${y + 27}" fill="#f1f5f9" font-size="13" font-weight="800" style="pointer-events:none; user-select:none;">
          ${escapeAttr(label)}
        </text>
        <text class="boundary-subtitle" x="${x + 20}" y="${y + 43}" fill="#94a3b8" font-size="10.5" font-family="monospace" style="pointer-events:none; user-select:none;">
          ${escapeAttr(subLabel || 'Arraste o cabeçalho para mover ou as alças nas bordas para redimensionar')}
        </text>
        <text class="boundary-dims" x="${x + w - 18}" y="${y + 33}" fill="#64748b" font-size="10" font-family="monospace" text-anchor="end" style="pointer-events:none; user-select:none;">
          ⤢ ${Math.round(w)}×${Math.round(h)}
        </text>

        <!-- 4 Corner Resize Handles -->
        <rect class="boundary-handle handle-nw" data-handle="nw" x="${x - hs}" y="${y - hs}" width="${handleSize}" height="${handleSize}" rx="2.5" fill="#1e293b" stroke="#38bdf8" stroke-width="1.8" style="cursor:nwse-resize;" />
        <rect class="boundary-handle handle-ne" data-handle="ne" x="${x + w - hs}" y="${y - hs}" width="${handleSize}" height="${handleSize}" rx="2.5" fill="#1e293b" stroke="#38bdf8" stroke-width="1.8" style="cursor:nesw-resize;" />
        <rect class="boundary-handle handle-sw" data-handle="sw" x="${x - hs}" y="${y + h - hs}" width="${handleSize}" height="${handleSize}" rx="2.5" fill="#1e293b" stroke="#38bdf8" stroke-width="1.8" style="cursor:nesw-resize;" />
        <rect class="boundary-handle handle-se" data-handle="se" x="${x + w - hs}" y="${y + h - hs}" width="${handleSize}" height="${handleSize}" rx="2.5" fill="#1e293b" stroke="#38bdf8" stroke-width="1.8" style="cursor:nwse-resize;" />

        <!-- 4 Side Midpoint Resize Handles -->
        <rect class="boundary-handle handle-n" data-handle="n" x="${mx - 16}" y="${y - 4}" width="32" height="8" rx="4" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" style="cursor:ns-resize;" />
        <rect class="boundary-handle handle-s" data-handle="s" x="${mx - 16}" y="${y + h - 4}" width="32" height="8" rx="4" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" style="cursor:ns-resize;" />
        <rect class="boundary-handle handle-w" data-handle="w" x="${x - 4}" y="${my - 16}" width="8" height="32" rx="4" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" style="cursor:ew-resize;" />
        <rect class="boundary-handle handle-e" data-handle="e" x="${x + w - 4}" y="${my - 16}" width="8" height="32" rx="4" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" style="cursor:ew-resize;" />
      </g>
    `;
  }

  function updateBoundaryDom(groupEl, rect) {
    const { x, y, w, h } = rect;
    const hs = 5;
    const mx = x + w / 2;
    const my = y + h / 2;

    groupEl.dataset.x = x;
    groupEl.dataset.y = y;
    groupEl.dataset.w = w;
    groupEl.dataset.h = h;

    const box = groupEl.querySelector('.boundary-box');
    if (box) {
      box.setAttribute('x', x);
      box.setAttribute('y', y);
      box.setAttribute('width', w);
      box.setAttribute('height', h);
    }

    const header = groupEl.querySelector('.boundary-header-drag');
    if (header) {
      header.setAttribute('x', x + 8);
      header.setAttribute('y', y + 8);
      header.setAttribute('width', Math.max(120, w - 16));
    }

    const title = groupEl.querySelector('.boundary-title');
    if (title) {
      title.setAttribute('x', x + 20);
      title.setAttribute('y', y + 27);
    }

    const subtitle = groupEl.querySelector('.boundary-subtitle');
    if (subtitle) {
      subtitle.setAttribute('x', x + 20);
      subtitle.setAttribute('y', y + 43);
    }

    const dims = groupEl.querySelector('.boundary-dims');
    if (dims) {
      dims.setAttribute('x', x + w - 18);
      dims.setAttribute('y', y + 33);
      dims.textContent = `⤢ ${Math.round(w)}×${Math.round(h)}`;
    }

    const setPos = (sel, nx, ny) => {
      const el = groupEl.querySelector(sel);
      if (el) {
        el.setAttribute('x', nx);
        el.setAttribute('y', ny);
      }
    };

    setPos('.handle-nw', x - hs, y - hs);
    setPos('.handle-ne', x + w - hs, y - hs);
    setPos('.handle-sw', x - hs, y + h - hs);
    setPos('.handle-se', x + w - hs, y + h - hs);
    setPos('.handle-n', mx - 16, y - 4);
    setPos('.handle-s', mx - 16, y + h - 4);
    setPos('.handle-w', x - 4, my - 16);
    setPos('.handle-e', x + w - 4, my - 16);
  }

  function attachInteractiveSvg(config) {
    const {
      svgId,
      viewportId,
      nodeSelector,
      edgeSelector,
      getPositionsMap,
      getZoomState,
      getBoundariesMap,
      getNodeSize,
      onNodeClick,
      onNodeDoubleClick
    } = config;

    let isPanning = false;
    let panStartX = 0, panStartY = 0;

    let draggedId = null;
    let draggedEl = null;
    let dragStartMouseX = 0, dragStartMouseY = 0;
    let dragStartNodeX = 0, dragStartNodeY = 0;
    let hasMoved = false;

    // Boundary resize / move state
    let activeBoundaryEl = null;
    let activeBoundaryId = null;
    let activeHandle = null;
    let startBoundaryRect = null;
    let boundaryStartMouseX = 0, boundaryStartMouseY = 0;

    const svg = document.getElementById(svgId);
    if (!svg) return;

    svg.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const posMap = getPositionsMap();
      const zoom = getZoomState();

      // 1. Check if user clicked on a Dashed Boundary Resize Handle or Header Bar
      const handleEl = e.target.closest('[data-handle]');
      const boundaryEl = e.target.closest('.resizable-boundary');
      if (handleEl && boundaryEl) {
        e.stopPropagation();
        activeBoundaryEl = boundaryEl;
        activeBoundaryId = boundaryEl.dataset.boundaryId;
        activeHandle = handleEl.dataset.handle;
        boundaryStartMouseX = e.clientX;
        boundaryStartMouseY = e.clientY;
        startBoundaryRect = {
          x: parseFloat(boundaryEl.dataset.x || '0'),
          y: parseFloat(boundaryEl.dataset.y || '0'),
          w: parseFloat(boundaryEl.dataset.w || '400'),
          h: parseFloat(boundaryEl.dataset.h || '300')
        };
        return;
      }

      // 2. Check if user clicked on a Diagram Node
      const nodeEl = e.target.closest(nodeSelector);
      if (nodeEl) {
        e.stopPropagation();
        draggedId = nodeEl.dataset.id;
        draggedEl = nodeEl;
        hasMoved = false;
        dragStartMouseX = e.clientX;
        dragStartMouseY = e.clientY;
        const pos = posMap.get(draggedId) || { x: 200, y: 200 };
        dragStartNodeX = pos.x;
        dragStartNodeY = pos.y;
        nodeEl.style.cursor = 'grabbing';
        if (nodeEl.parentNode) nodeEl.parentNode.appendChild(nodeEl);
        return;
      }

      // 3. Otherwise pan the canvas
      isPanning = true;
      panStartX = e.clientX - zoom.tx;
      panStartY = e.clientY - zoom.ty;
      svg.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      const posMap = getPositionsMap();
      const zoom = getZoomState();
      const scale = zoom.scale || 1;

      // 1. Resizing or moving a dashed boundary box
      if (activeBoundaryEl && startBoundaryRect && activeHandle) {
        const dx = (e.clientX - boundaryStartMouseX) / scale;
        const dy = (e.clientY - boundaryStartMouseY) / scale;
        const minW = 240;
        const minH = 140;

        let { x, y, w, h } = startBoundaryRect;

        if (activeHandle === 'move') {
          x += dx;
          y += dy;
        } else {
          if (activeHandle.includes('e')) {
            w = Math.max(minW, startBoundaryRect.w + dx);
          }
          if (activeHandle.includes('s')) {
            h = Math.max(minH, startBoundaryRect.h + dy);
          }
          if (activeHandle.includes('w')) {
            const newW = Math.max(minW, startBoundaryRect.w - dx);
            x = startBoundaryRect.x + (startBoundaryRect.w - newW);
            w = newW;
          }
          if (activeHandle.includes('n')) {
            const newH = Math.max(minH, startBoundaryRect.h - dy);
            y = startBoundaryRect.y + (startBoundaryRect.h - newH);
            h = newH;
          }
        }

        const updated = { x, y, w, h, userResized: true };
        updateBoundaryDom(activeBoundaryEl, updated);
        if (typeof getBoundariesMap === 'function') {
          const bMap = getBoundariesMap();
          if (bMap && activeBoundaryId) bMap.set(activeBoundaryId, updated);
        }
        return;
      }

      // 2. Dragging a node
      if (draggedId && draggedEl) {
        const dxScreen = e.clientX - dragStartMouseX;
        const dyScreen = e.clientY - dragStartMouseY;
        if (Math.abs(dxScreen) > 3 || Math.abs(dyScreen) > 3) {
          hasMoved = true;
        }
        const nx = dragStartNodeX + dxScreen / scale;
        const ny = dragStartNodeY + dyScreen / scale;
        posMap.set(draggedId, { x: nx, y: ny });
        draggedEl.setAttribute('transform', `translate(${nx}, ${ny})`);

        // Real-time update of connected edges (supports both <path> Bezier and <line>)
        svg.querySelectorAll(edgeSelector).forEach((edgeEl) => {
          const s = edgeEl.dataset.source;
          const t = edgeEl.dataset.target;
          if (s === draggedId || t === draggedId) {
            const p1 = posMap.get(s) || { x: 150, y: 150 };
            const p2 = posMap.get(t) || { x: 400, y: 150 };
            const curveOffset = parseFloat(edgeEl.dataset.curve || '0');
            const size1 = typeof getNodeSize === 'function' ? getNodeSize(s) : { w: 248, h: 116 };
            const size2 = typeof getNodeSize === 'function' ? getNodeSize(t) : { w: 248, h: 116 };

            const pathEl = edgeEl.querySelector('path.edge-path');
            const lineEl = edgeEl.querySelector('line');
            const rectEl = edgeEl.querySelector('rect');
            const textEl = edgeEl.querySelector('text');

            if (pathEl) {
              const geom = computeEdgeGeometry(p1, p2, size1, size2, curveOffset);
              pathEl.setAttribute('d', geom.pathD);
              if (rectEl) {
                const rw = parseFloat(rectEl.getAttribute('width') || '96');
                rectEl.setAttribute('x', geom.labelX - rw / 2);
                rectEl.setAttribute('y', geom.labelY - 10);
              }
              if (textEl) {
                textEl.setAttribute('x', geom.labelX);
                textEl.setAttribute('y', geom.labelY + 3);
              }
            } else if (lineEl) {
              const mx = (p1.x + p2.x) / 2;
              const my = (p1.y + p2.y) / 2 - 8;
              lineEl.setAttribute('x1', p1.x);
              lineEl.setAttribute('y1', p1.y);
              lineEl.setAttribute('x2', p2.x);
              lineEl.setAttribute('y2', p2.y);
              if (rectEl) {
                const rw = parseFloat(rectEl.getAttribute('width') || '96');
                rectEl.setAttribute('x', mx - rw / 2);
                rectEl.setAttribute('y', my - 11);
              }
              if (textEl) {
                textEl.setAttribute('x', mx);
                textEl.setAttribute('y', my + (rectEl ? 1 : 2));
              }
            }
          }
        });
        return;
      }

      // 3. Panning the viewport
      if (!isPanning) return;
      zoom.tx = e.clientX - panStartX;
      zoom.ty = e.clientY - panStartY;
      const vp = document.getElementById(viewportId);
      if (vp) vp.setAttribute('transform', `translate(${zoom.tx}, ${zoom.ty}) scale(${zoom.scale})`);
    });

    window.addEventListener('mouseup', () => {
      if (activeBoundaryEl) {
        activeBoundaryEl = null;
        activeBoundaryId = null;
        activeHandle = null;
        startBoundaryRect = null;
      }
      if (draggedId) {
        const clickedId = draggedId;
        const wasClick = !hasMoved;
        if (draggedEl) draggedEl.style.cursor = 'grab';
        draggedId = null;
        draggedEl = null;
        if (wasClick && typeof onNodeClick === 'function') {
          onNodeClick(clickedId);
        }
      }
      if (isPanning) {
        isPanning = false;
        svg.style.cursor = 'grab';
      }
    });

    svg.addEventListener('dblclick', (e) => {
      const nodeEl = e.target.closest(nodeSelector);
      if (nodeEl && typeof onNodeDoubleClick === 'function') {
        e.stopPropagation();
        onNodeDoubleClick(nodeEl.dataset.id);
      }
    });

    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoom = getZoomState();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      zoom.scale = Math.min(2.5, Math.max(0.35, zoom.scale * factor));
      const vp = document.getElementById(viewportId);
      if (vp) vp.setAttribute('transform', `translate(${zoom.tx}, ${zoom.ty}) scale(${zoom.scale})`);
    }, { passive: false });
  }

  window.SvgEngine = {
    attachInteractiveSvg,
    computeEdgeGeometry,
    renderResizableBoundary
  };
})();
