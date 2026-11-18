#!/usr/bin/env node
/**
 * Local Web Server for Repo Visualizer Dashboard
 * - Serves .arch-visualizer/arch-dashboard.html
 * - POST /api/save-doc -> saves edited Markdown (.md) files directly into the repository (e.g., doc/architecture/*.md)
 * - POST /api/rescan   -> re-runs static analysis and returns updated graph data
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { analyzeRepository, writeVisualizerOutput } = require('./analyze_repo.cjs');

const repoRoot = path.resolve(process.argv[2] || process.cwd());
const port = parseInt(process.argv[3] || '4242', 10);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  if (req.method === 'GET' && !req.url.startsWith('/api/')) {
    const cleanUrl = req.url.split('?')[0];
    const fileName = (cleanUrl === '/' || cleanUrl === '/index.html') ? 'arch-dashboard.html' : path.basename(cleanUrl);
    const filePath = path.join(repoRoot, '.arch-visualizer', fileName);
    if (!fs.existsSync(filePath)) {
      return sendJson(res, 404, { error: `Arquivo não encontrado: ${fileName}` });
    }
    const ext = path.extname(fileName).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain; charset=utf-8' });
    return res.end(fs.readFileSync(filePath));
  }

  if (req.method === 'GET' && req.url === '/api/data') {
    const data = analyzeRepository(repoRoot);
    return sendJson(res, 200, data);
  }

  if (req.method === 'POST' && req.url === '/api/save-doc') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { relPath, content } = JSON.parse(body);
        if (!relPath || typeof content !== 'string') {
          return sendJson(res, 400, { error: 'Parâmetros relPath e content são obrigatórios.' });
        }
        const safeRel = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
        const fullTarget = path.resolve(repoRoot, safeRel);
        if (!fullTarget.startsWith(repoRoot)) {
          return sendJson(res, 403, { error: 'Caminho fora do repositório não permitido.' });
        }
        fs.mkdirSync(path.dirname(fullTarget), { recursive: true });
        fs.writeFileSync(fullTarget, content, 'utf8');
        return sendJson(res, 200, { ok: true, savedPath: fullTarget });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/rescan') {
    try {
      const data = analyzeRepository(repoRoot);
      writeVisualizerOutput(repoRoot, data);
      return sendJson(res, 200, { ok: true, data });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  sendJson(res, 404, { error: 'Rota não encontrada' });
});

server.listen(port, () => {
  console.log(`[repo-visualizer] Servidor ativo em: http://localhost:${port}`);
  console.log(`[repo-visualizer] Repositório monitorado: ${repoRoot}`);
});
