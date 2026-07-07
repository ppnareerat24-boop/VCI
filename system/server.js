// Local static web server for the Face Check-in system.
// Zero dependencies — uses only Node's built-in modules.
// Camera access (getUserMedia) requires a secure context; http://localhost qualifies,
// so we bind to 127.0.0.1 and the browser will allow the webcam.

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = parseInt(process.env.PORT || '8000', 10);
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent(url.parse(req.url).pathname);
  if (pathname === '/') pathname = '/index.html';

  // Resolve and guard against path traversal.
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + pathname);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ระบบเช็คชื่อด้วยใบหน้า (Face Check-in)');
  console.log('  -------------------------------------------------');
  console.log(`  เปิดเบราว์เซอร์ที่:  http://${HOST}:${PORT}`);
  console.log('  กด Ctrl+C เพื่อหยุดเซิร์ฟเวอร์');
  console.log('');
});
