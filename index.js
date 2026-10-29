const http = require('http');
const WebSocket = require('ws');
const url = require('url');

// Render injects the PORT environment variable automatically
const PORT = process.env.PORT || 8080;

// Create a standard HTTP server to satisfy Render's port binding and health checks
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebSocket Proxy is running.');
});

// Initialize a WebSocket server without attaching it to a specific port immediately
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    const parsedUrl = url.parse(request.url, true);
    
    // Expecting target destination passed via query parameter, e.g., /?target=wss://echo.websocket.org
    const targetUrl = parsedUrl.query.target;

    if (!targetUrl) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\nMissing target parameter.');
        socket.destroy();
        return;
    }

    // Authenticate or validate target domains here if you want to prevent open-proxy abuse

    wss.handleUpgrade(request, socket, head, (ws) => {
        // Establish connection to the destination server
        const destinationWs = new WebSocket(targetUrl);

        // Pipe data: Proxy Client -> Destination Server
        ws.on('message', (message, isBinary) => {
            if (destinationWs.readyState === WebSocket.OPEN) {
                destinationWs.send(message, { binary: isBinary });
            }
        });

        // Pipe data: Destination Server -> Proxy Client
        destinationWs.on('message', (message, isBinary) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message, { binary: isBinary });
            }
        });

        // Handle closures and errors safely
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
    console.log(`WebSocket Proxy server listening on port ${PORT}`);
});
