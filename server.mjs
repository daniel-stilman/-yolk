import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppService } from './runtime/app-service.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 4173);

const routes = {
  '/': { file: path.join(__dirname, 'src', 'index.html'), type: 'text/html; charset=utf-8' },
  '/style.css': { file: path.join(__dirname, 'src', 'style.css'), type: 'text/css; charset=utf-8' },
  '/app.js': { file: path.join(__dirname, 'dist', 'app.js'), type: 'text/javascript; charset=utf-8' }
};

const mediaTypeForFile = filePath => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.txt') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
};

const readBody = req => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  req.on('end', () => resolve(body));
  req.on('error', reject);
});

const sendJson = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};

const handleAction = async (service, payload) => {
  const clientId = String(payload.clientId || '').trim();
  if (!clientId) throw new Error('clientId is required');
  if (payload.type === 'createAccount') return service.createAccount(clientId, payload.input);
  if (payload.type === 'openProfile') return service.openProfile(clientId, payload.accountId);
  if (payload.type === 'searchProfiles') return service.searchProfiles(clientId, payload.query);
  if (payload.type === 'clearSearch') return service.clearSearch(clientId);
  if (payload.type === 'importFollowInvite') return service.importFollowInvite(clientId, payload.token);
  if (payload.type === 'setSection') return service.setSection(clientId, payload.section);
  if (payload.type === 'dismissFlash') return service.dismissFlash(clientId);
  if (payload.type === 'uploadMedia') {
    return service.uploadMedia(clientId, {
      ...payload.input,
      data: Buffer.from(payload.input.dataBase64, 'base64')
    });
  }
  if (payload.type === 'publishStructuredUpload') return service.publishStructuredUpload(clientId, payload.input);
  if (payload.type === 'createCollection') return service.createCollection(clientId, payload.input);
  if (payload.type === 'keepMedia') return service.keepMedia(clientId, payload.mediaRef);
  if (payload.type === 'keepCollection') return service.keepCollection(clientId, payload.collectionRef);
  if (payload.type === 'unkeepCollection') return service.unkeepCollection(clientId, payload.collectionRef);
  if (payload.type === 'followAccount') return service.followAccount(clientId, payload.accountId);
  if (payload.type === 'addDraftChild') return service.addDraftChild(clientId, payload.mediaRef);
  if (payload.type === 'removeDraftChild') return service.removeDraftChild(clientId, payload.mediaRef);
  if (payload.type === 'moveDraftChild') return service.moveDraftChild(clientId, payload.mediaRef, payload.direction);
  if (payload.type === 'resetDraft') return service.resetDraft(clientId);
  throw new Error(`Unknown action ${payload.type}`);
};

export async function createYolkServer(options = {}) {
  const listenPort = Number(options.port ?? process.env.PORT ?? 4173);
  const service = await AppService.create({
    baseDir: options.baseDir || path.join(__dirname, '.yolk-runtime'),
    sampleMediaDir: options.sampleMediaDir || path.join(__dirname, 'sample media'),
    seedDemo: options.seedDemo === true
  });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === '/api/snapshot') {
      try {
        const clientId = url.searchParams.get('clientId');
        if (!clientId) return sendJson(res, 400, { error: 'clientId is required' });
        return sendJson(res, 200, await service.buildSnapshot(clientId));
      } catch (error) {
        return sendJson(res, 500, { error: String(error) });
      }
    }
    if (url.pathname === '/api/action' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        const payload = body ? JSON.parse(body) : {};
        const result = await handleAction(service, payload);
        return sendJson(res, 200, { ok: true, result });
      } catch (error) {
        return sendJson(res, 500, { ok: false, error: String(error) });
      }
    }
    if (url.pathname === '/api/media') {
      try {
        const clientId = url.searchParams.get('clientId');
        const mediaRef = url.searchParams.get('mediaRef');
        if (!clientId || !mediaRef) return sendJson(res, 400, { error: 'clientId and mediaRef are required' });
        const asset = await service.resolveMediaAsset(clientId, mediaRef);
        res.writeHead(200, {
          'Content-Type': mediaTypeForFile(asset.filePath),
          'Cache-Control': 'no-store'
        });
        createReadStream(asset.filePath).pipe(res);
        return;
      } catch (error) {
        return sendJson(res, 500, { error: String(error) });
      }
    }
    if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true });
    const route = routes[url.pathname || '/'];
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
  });
  await new Promise(resolve => server.listen(listenPort, resolve));
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : listenPort;
  return {
    server,
    service,
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}`,
    async close() {
      await service.destroy();
      await new Promise(resolve => server.close(resolve));
    }
  };
}

if (process.argv[1] === __filename) {
  const instance = await createYolkServer({ port });
  console.log(`Yolk running at ${instance.url}`);
  process.on('SIGINT', async () => {
    await instance.close();
    process.exit(0);
  });
}
