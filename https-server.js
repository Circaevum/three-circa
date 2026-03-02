#!/usr/bin/env node
/**
 * Simple HTTPS server for WebXR testing
 * 
 * Usage: node https-server.js [port]
 * Default port: 8443
 * 
 * Access from Quest: https://YOUR_IP:8443
 * You'll need to accept the self-signed certificate warning
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const port = process.argv[2] || 8443;
const webDir = __dirname;

// Generate self-signed certificate if it doesn't exist
const certPath = path.join(webDir, 'localhost.pem');
const keyPath = path.join(webDir, 'localhost-key.pem');

function generateCert() {
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        console.log('Using existing certificate...');
        return;
    }

    console.log('Generating self-signed certificate (this may take a moment)...');
    try {
        // Use openssl to generate certificate
        execSync(`openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Dev/CN=localhost"`, {
            stdio: 'inherit'
        });
        console.log('Certificate generated successfully!');
    } catch (error) {
        console.error('Failed to generate certificate. Make sure openssl is installed.');
        console.error('You can install it with: brew install openssl');
        process.exit(1);
    }
}

// Generate certificate if needed
generateCert();

// Create HTTPS server
const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
};

const server = https.createServer(options, (req, res) => {
    // Simple file server
    let filePath = path.join(webDir, req.url === '/' ? 'index.html' : req.url);
    
    // Security: prevent directory traversal
    if (!filePath.startsWith(webDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    // Default to index.html for directories
    if (fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not Found');
        return;
    }

    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2'
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';

    // Read and serve file
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500);
            res.end('Internal Server Error');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

// Get local IP address
function getLocalIP() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

const localIP = getLocalIP();

server.listen(port, '0.0.0.0', () => {
    console.log('\n✅ HTTPS Server running!');
    console.log(`\n📱 Access from Quest:`);
    console.log(`   https://${localIP}:${port}`);
    console.log(`\n💻 Or locally:`);
    console.log(`   https://localhost:${port}`);
    console.log(`\n⚠️  You'll need to accept the self-signed certificate warning on Quest`);
    console.log(`   (This is safe for local development)\n`);
});
