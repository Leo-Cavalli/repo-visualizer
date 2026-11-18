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
const { analyzeRepository } = require('./analyze_repo.cjs');

const repoRoot = path.resolve(process.argv[2] || process.cwd());
const port = parseInt(process.argv[3] || '4242', 10);

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

  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/index.html'))) {
    const htmlPath = path.join(repoRoot, '.arch-visualizer', 'arch-dashboard.html');
    if (!fs.existsSync(htmlPath)) {
      return sendJson(res, 404, { error: 'Dashboard ainda não gerado. Execute analyze_repo.cjs primeiro.' });
    }
    const html = fs.readFileSync(htmlPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
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
      const outDir = path.join(repoRoot, '.arch-visualizer');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'arch-data.json'), JSON.stringify(data, null, 2), 'utf8');
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
