const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const port = 3000;

http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];

    // Encaminha somente chamadas REST do Supabase. Assim, o navegador conversa
    // com o servidor local e este usa HTTPS para chegar ao Supabase.
    if (urlPath.startsWith('/api/supabase/rest/v1/')) {
        const headers = {};
        for (const header of ['apikey', 'authorization', 'content-type', 'prefer', 'accept-profile', 'content-profile']) {
            if (req.headers[header]) headers[header] = req.headers[header];
        }

        const proxyRequest = https.request({
            hostname: 'yetdstodxkkukwzckopy.supabase.co',
            path: req.url.replace('/api/supabase', ''),
            method: req.method,
            headers,
        }, (proxyResponse) => {
            res.writeHead(proxyResponse.statusCode, proxyResponse.headers);
            proxyResponse.pipe(res);
        });

        proxyRequest.on('error', () => {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Não foi possível conectar ao Supabase.' }));
        });

        req.pipe(proxyRequest);
        return;
    }

    let filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if(error.code == 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: '+error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}).listen(port);
console.log(`Server running at http://localhost:${port}/`);
