#!/usr/bin/env node

/**
 * HM Herbs Quick Start Script
 * Run this to start the backend server
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🌿 Starting HM Herbs Backend Server...');

const server = spawn('npm', ['start'], {
    cwd: path.join(__dirname, 'backend'),
    stdio: 'inherit'
});

server.on('close', (code) => {
    console.log(`\n🛑 Server stopped with code ${code}`);
});

server.on('error', (error) => {
    console.error('❌ Failed to start server:', error.message);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server...');
    server.kill('SIGINT');
});

