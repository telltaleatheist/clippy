// preload/preload.js
const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

// Get resource path information
const isDevelopment = process.env.NODE_ENV !== 'production';
const resourcesPath = process.resourcesPath;

contextBridge.exposeInMainWorld('electron', {
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getBinaryPaths: () => ipcRenderer.invoke('get-binary-paths'),
  environment: {
    isDevelopment,
    resourcesPath,
    appPath: process.cwd(),
    getBinaryPath: (binaryName) => {
      const executable = process.platform === 'win32' ? `${binaryName}.exe` : binaryName;
      
      if (isDevelopment) {
        // In development, binaries are in the project root's bin directory
        return path.join(process.cwd(), 'bin', executable);
      } else {
        // In production, binaries are in the resources/bin directory
        return path.join(resourcesPath, 'bin', executable);
      }
    }
  },
  // Add all your other IPC handlers here
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  downloadVideo: (options) => ipcRenderer.invoke('download-video', options),
  selectDirectory: () => ipcRenderer.invoke('select-directory')
});

// Listen for update events from main process
ipcRenderer.on('update-available', () => {
  // You can use a custom event to communicate with your Angular app
  window.dispatchEvent(new CustomEvent('electron-update-available'));
});

ipcRenderer.on('update-downloaded', () => {
  window.dispatchEvent(new CustomEvent('electron-update-downloaded'));
});