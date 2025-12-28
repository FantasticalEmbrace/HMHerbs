#!/usr/bin/env node

/**
 * HM Herbs Quick Start Script
 * Run this to start the backend server
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🌿 Starting HM Herbs Backend Server...');

// On Windows, npm is npm.cmd
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const server = spawn(npmCommand, ['start'], {
    cwd: path.join(__dirname, 'backend'),
    stdio: 'inherit',
    shell: true // Use shell on Windows to find npm
});

server.on('close', (code) => {
    if (code === 0) {
        console.log(`\n🛑 Server stopped gracefully`);
    } else {
        console.log(`\n🛑 Server stopped with code ${code}`);
        console.error('💡 Non-zero exit code indicates an error occurred');
    }
});

server.on('error', (error) => {
    console.error('❌ Failed to start server:', error.message);
    
    // Provide helpful suggestions based on common errors
    if (error.code === 'ENOENT') {
        console.error('💡 Suggestion: Make sure you are in the correct directory and npm is installed');
        console.error('   Try running: cd backend && npm install');
    } else if (error.code === 'EADDRINUSE') {
        console.error('💡 Suggestion: Port is already in use. Try stopping other servers or change the port');
    } else if (error.message.includes('permission')) {
        console.error('💡 Suggestion: Try running with elevated permissions');
    }
    
    console.error('📋 For more help, check the backend/README.md file or contact support');
    process.exit(1);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server...');
    server.kill('SIGINT');
});
