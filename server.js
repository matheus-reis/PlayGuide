'use strict';

// Servidor estático mínimo para o Railway (sem dependências).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const PUBLIC = new Set(['/index.html', '/style.css', '/app.js', '/sw.js', '/manifest.webmanifest']);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';

  if (!PUBLIC.has(url) && !/^\/icons\/[\w-]+\.png$/.test(url)) {
    res.writeHead(404).end('Not found');
    return;
  }

  fs.readFile(path.join(ROOT, url), (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(url)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}).listen(PORT, () => console.log(`PlayGuide em http://localhost:${PORT}`));
