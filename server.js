import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = Number(process.env.PORT) || 3000;
const ROOT_DIR = path.resolve(__dirname);

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
    const rawUrl = req.url || '/';
    const urlPath = rawUrl.split('?')[0];

    // Encaminha somente chamadas REST do Supabase. Assim, o navegador conversa
    // com o servidor local e este usa HTTPS para chegar ao Supabase.
    if (urlPath.startsWith('/api/supabase/rest/v1/')) {
        const headers = {};
        for (const header of ['apikey', 'authorization', 'content-type', 'prefer', 'accept-profile', 'content-profile']) {
            if (req.headers[header]) headers[header] = req.headers[header];
        }

        const proxyRequest = https.request({
            hostname: 'yetdstodxkkukwzckopy.supabase.co',
            path: rawUrl.replace('/api/supabase', ''),
            method: req.method,
            headers,
        }, (proxyResponse) => {
            res.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
            proxyResponse.pipe(res);
        });

        proxyRequest.on('error', () => {
            res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: 'Não foi possível conectar ao Supabase.' }));
        });

        req.pipe(proxyRequest);
        return;
    }

    let decodedPath;
    try {
        decodedPath = decodeURIComponent(urlPath);
    } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad Request');
        return;
    }

    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    const filePath = path.resolve(ROOT_DIR, relativePath);

    // Proteção contra Path Traversal (garante que o arquivo está dentro do diretório do app)
    if (filePath !== ROOT_DIR && !filePath.startsWith(ROOT_DIR + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    // Impede acesso direto a arquivos internos do servidor/testes
    const baseName = path.basename(filePath);
    if (baseName === 'server.js' || baseName === 'package.json' || baseName.startsWith('.')) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    const extname = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT' || error.code === 'EISDIR') {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('File not found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Server error: ' + error.code);
            }
            return;
        }

        res.writeHead(200, {
            'Content-Type': contentType,
            'X-Content-Type-Options': 'nosniff',
        });
        // Envia o Buffer sem forçar 'utf-8' para não corromper binários (.png, .mp3, etc.)
        res.end(content);
    });
});

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});
