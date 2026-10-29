const http = require('http');
const https = require('https');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const MAX_QUERY_LENGTH = 200;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const DUCKDUCKGO_HOSTS = new Set(['html.duckduckgo.com', 'duckduckgo.com']);

// Set this on Render to the specific WebSocket destinations you trust.
// Example: ALLOWED_WS_HOSTS=game.example.com,another.example.org
const ALLOWED_WS_HOSTS = new Set(
  String(process.env.ALLOWED_WS_HOSTS || '')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean)
);

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(message);
}

function fetchDuckDuckGoHtml(searchUrl, redirectsRemaining = 3) {
  return new Promise((resolve, reject) => {
    const request = https.get(searchUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; StudySearch/1.0)'
      }
    }, response => {
      const statusCode = response.statusCode || 0;
      const location = response.headers.location;

      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume();
        if (redirectsRemaining <= 0) {
          reject(new Error('DuckDuckGo redirected too many times.'));
          return;
        }

        const redirectUrl = new URL(location, searchUrl);
        if (
          redirectUrl.protocol !== 'https:' ||
          !DUCKDUCKGO_HOSTS.has(redirectUrl.hostname.toLowerCase())
        ) {
          reject(new Error('DuckDuckGo returned an unexpected redirect.'));
          return;
        }
        resolve(fetchDuckDuckGoHtml(redirectUrl, redirectsRemaining - 1));
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error('DuckDuckGo returned HTTP ' + statusCode + '.'));
        return;
      }

      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        response.resume();
        reject(new Error('DuckDuckGo did not return an HTML page.'));
        return;
      }

      const chunks = [];
      let totalBytes = 0;
      response.on('data', chunk => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_HTML_BYTES) {
          response.destroy(new Error('DuckDuckGo response was too large.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      response.on('error', reject);
    });

    request.setTimeout(15000, () => request.destroy(new Error('DuckDuckGo search timed out.')));
    request.on('error', reject);
  });
}

async function handleHttpRequest(req, res) {
  let requestUrl;
  try {
    requestUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  } catch (_error) {
    sendText(res, 400, 'Invalid request URL.');
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/healthz') {
    sendText(res, 200, 'ok');
    return;
  }

  if (requestUrl.pathname === '/api/search') {
    if (req.method !== 'GET') {
      sendText(res, 405, 'Use GET for search.');
      return;
    }

    const engine = (requestUrl.searchParams.get('engine') || 'duckduckgo').toLowerCase();
    const query = (requestUrl.searchParams.get('q') || '').trim();
    if (engine !== 'duckduckgo') {
      sendText(res, 400, 'Unsupported search engine.');
      return;
    }
    if (!query) {
      sendText(res, 400, 'Enter a search query.');
      return;
    }
    if (query.length > MAX_QUERY_LENGTH) {
      sendText(res, 400, 'Search query is too long.');
      return;
    }

    const duckDuckGoUrl = new URL('https://html.duckduckgo.com/html/');
    duckDuckGoUrl.searchParams.set('q', query);
    try {
      const html = await fetchDuckDuckGoHtml(duckDuckGoUrl);
      if (!/<(?:!doctype|html|head|body)\b/i.test(html)) {
        sendText(res, 502, 'DuckDuckGo did not return a search results page.');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(html);
    } catch (error) {
      console.error('DuckDuckGo search failed:', error.message);
      sendText(res, 502, 'DuckDuckGo search is temporarily unavailable.');
    }
    return;
  }

  sendText(res, 200, 'WebSocket proxy and DuckDuckGo search API are running.');
}

const server = http.createServer((req, res) => {
  handleHttpRequest(req, res).catch(error => {
    console.error('HTTP request failed:', error.message);
    if (!res.headersSent) sendText(res, 500, 'Search service error.');
    else res.destroy();
  });
});

const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  let targetUrl;
  try {
    const requestUrl = new URL(request.url, 'http://' + (request.headers.host || 'localhost'));
    targetUrl = new URL(requestUrl.searchParams.get('target') || '');
  } catch (_error) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\nInvalid or missing target.');
    socket.destroy();
    return;
  }

  if (
    targetUrl.protocol !== 'wss:' ||
    targetUrl.username ||
    targetUrl.password ||
    (targetUrl.port && targetUrl.port !== '443') ||
    !ALLOWED_WS_HOSTS.has(targetUrl.hostname.toLowerCase())
  ) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\nWebSocket target is not allowed.');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, ws => {
    const destinationWs = new WebSocket(targetUrl.toString());

    ws.on('message', (message, isBinary) => {
      if (destinationWs.readyState === WebSocket.OPEN) {
        destinationWs.send(message, { binary: isBinary });
      }
    });

    destinationWs.on('message', (message, isBinary) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message, { binary: isBinary });
      }
    });

    const closeConnections = () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
      if (destinationWs.readyState === WebSocket.OPEN) destinationWs.close();
    };

    ws.on('close', closeConnections);
    destinationWs.on('close', closeConnections);
    ws.on('error', closeConnections);
    destinationWs.on('error', closeConnections);
  });
});

server.listen(PORT, () => {
  console.log(`Proxy server listening on port ${PORT}`);
});
