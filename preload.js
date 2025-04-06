const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  runYtDlp: (url) => ipcRenderer.invoke('download-video', url)
});
