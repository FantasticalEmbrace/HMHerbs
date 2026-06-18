'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain, Notification, session } = require('electron');
const path = require('path');
const { resolveHubUrl, deskPageUrl, saveUserHubUrl, normalizeHubUrl } = require('./hub-config');

let mainWindow = null;
let cachedHubOrigin = '';

function execDirectory() {
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
        return process.env.PORTABLE_EXECUTABLE_DIR;
    }
    return path.dirname(process.execPath);
}

function getHubOrigin() {
    if (cachedHubOrigin) return cachedHubOrigin;
    cachedHubOrigin = resolveHubUrl({
        execDir: execDirectory(),
        userDataDir: app.getPath('userData')
    });
    return cachedHubOrigin;
}

function createWindow() {
    const hubOrigin = getHubOrigin();
    const startUrl = deskPageUrl(hubOrigin);
    const iconPath = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

    mainWindow = new BrowserWindow({
        width: 1180,
        height: 820,
        minWidth: 900,
        minHeight: 600,
        title: 'Business One Support Desk',
        icon: iconPath,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    mainWindow.loadURL(startUrl);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/support-viewer|support-desk\/viewer|platform-support/i.test(url)) {
            const child = new BrowserWindow({
                width: 1120,
                height: 760,
                title: 'Remote support viewer',
                autoHideMenuBar: true,
                webPreferences: {
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: true
                }
            });
            child.loadURL(url);
            return { action: 'deny' };
        }
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.webContents.on('page-title-updated', (event, title) => {
        if (title) mainWindow.setTitle(title);
        event.preventDefault();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function buildMenu() {
    const hubOrigin = getHubOrigin();
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Reload queue',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => mainWindow?.webContents?.reload()
                },
                { type: 'separator' },
                { role: 'quit', label: 'Exit' }
            ]
        },
        {
            label: 'Hub',
            submenu: [
                {
                    label: 'Open hub in browser',
                    click: () => shell.openExternal(deskPageUrl(hubOrigin))
                },
                {
                    label: 'Show hub URL',
                    click: () => {
                        const { dialog } = require('electron');
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Support hub URL',
                            message: hubOrigin,
                            detail:
                                'To change the hub for all technicians, place hub-url.txt next to the .exe with one line:\nhttps://support.yourbusinessone.com'
                        });
                    }
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        if (process.platform === 'win32') {
            app.setAppUserModelId('com.businessone.supportdesk');
        }

        session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
            if (permission === 'notifications' || permission === 'media') {
                callback(true);
                return;
            }
            callback(false);
        });

        ipcMain.handle('desk:get-hub-url', () => getHubOrigin());
        ipcMain.handle('desk:set-hub-url', (_event, url) => {
            const normalized = normalizeHubUrl(url);
            if (!normalized) return getHubOrigin();
            saveUserHubUrl(app.getPath('userData'), normalized);
            cachedHubOrigin = normalized;
            return normalized;
        });

        createWindow();
        buildMenu();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}

process.on('uncaughtException', (err) => {
    if (Notification.isSupported()) {
        new Notification({
            title: 'Support Desk error',
            body: err.message || 'Unexpected error'
        }).show();
    }
});
