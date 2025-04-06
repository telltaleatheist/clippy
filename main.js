const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile } = require('child_process');

function createWindow() {
  const win = new BrowserWindow({
    width: 600,
    height: 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
});

// Listen for download request from renderer
ipcMain.handle('download-video', async (_, url) => {
  return new Promise((resolve, reject) => {
    execFile('./yt-dlp', [url], (error, stdout, stderr) => {
      if (error) return reject(stderr);
      resolve(stdout);
    });
  });
});
