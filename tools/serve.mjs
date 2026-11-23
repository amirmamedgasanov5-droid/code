#!/usr/bin/env node
// Мини-сервер статики для Noodle Studio:  node tools/serve.mjs studio 8080
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { mimeOf } from '../studio/js/nob.js';

const dir = path.resolve(process.argv[2] || 'studio');
const port = Number(process.argv[3] || 8080);
http
  .createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(dir, p);
    if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': mimeOf(file) + (/^text|javascript|json|svg/.test(mimeOf(file)) ? '; charset=utf-8' : ''), 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`Noodle Studio: http://localhost:${port}`));
