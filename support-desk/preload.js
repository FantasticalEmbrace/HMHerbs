'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('businessOneDesk', {
    getHubUrl: () => ipcRenderer.invoke('desk:get-hub-url'),
    setHubUrl: (url) => ipcRenderer.invoke('desk:set-hub-url', url),
    isDesktopApp: true
});
