import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 4173);

const routes = {
  '/': { file: path.join(__dirname, 'src', 'index.html'), type: 'text/html; charset=utf-8' },
  '/style.css': { file: path.join(__dirname, 'src', 'style.css'), type: 'text/css; charset=utf-8' },
  '/app.js': { file: path.join(__dirname, 'dist', 'app.js'), type: 'text/javascript; charset=utf-8' }
};

createServer(async (req, res) => {
  const route = routes[req.url || '/'];
  if (!route) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  try {
    const body = await readFile(route.file);
    res.writeHead(200, { 'Content-Type': route.type });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Unable to read ${route.file}\n${String(error)}`);
  }
}).listen(port, () => {
  console.log(`Yolk running at http://127.0.0.1:${port}`);
});
