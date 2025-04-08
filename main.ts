import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { downloadVideo, checkAndFixAspectRatio, processOutputFilename } from './download';

// Add these imports
import * as http from 'http';
const fs = require('fs');

// Configure logging
log.transports.file.level = 'info';
log.info('Application starting...');

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

// Create main application window
function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js'),
      webSecurity: false, // For testing
      allowRunningInsecureContent: true // For testing
    },
    icon: path.join(__dirname, '../../assets/icon.png')
  });

  // Add debugging event listeners
  mainWindow.webContents.openDevTools();
  mainWindow.webContents.on('did-start-loading', () => console.log('Started loading'));
  mainWindow.webContents.on('did-stop-loading', () => console.log('Stopped loading'));
  mainWindow.webContents.on('did-finish-load', () => console.log('Finished loading'));
  mainWindow.webContents.on('did-fail-load', (_, code, desc) => console.log('Failed loading:', code, desc));
  mainWindow.webContents.on('crashed', () => console.log('Renderer crashed'));
  mainWindow.webContents.on('unresponsive', () => console.log('Window unresponsive'));
  mainWindow.webContents.on('console-message', (_, level, message, line, sourceId) => {
    console.log(`Console [${level}]: ${message} (${sourceId}:${line})`);
  });

  // Create a simple server to serve Angular files
  const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    let url = req.url === '/' ? '/index.html' : req.url || '/index.html';
    const filePath = path.join(__dirname, '../frontend/dist/clippy-frontend/browser', url);
    
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      
      let contentType = 'text/html';
      if (ext === '.js') contentType = 'application/javascript';
      if (ext === '.css') contentType = 'text/css';
      if (ext === '.ico') contentType = 'image/x-icon';
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } else {
      console.log('File not found:', filePath);
      res.writeHead(404);
      res.end('Not found');
    }
  });
  
  server.listen(8080, 'localhost', () => {
    console.log('Server running at http://localhost:8080/');
    if (mainWindow) {
      mainWindow.loadURL('http://localhost:8080/');
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check for updates
  autoUpdater.checkForUpdatesAndNotify();
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // On macOS it's common to re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('download-video', async (_, options) => {
  try {
    log.info(`Starting download for: ${options.url}`);
    
    // Ensure we have a valid download directory
    const downloadFolder = options.outputDir || app.getPath('downloads');
    
    // Start the download process
    const result = await downloadVideo(options, downloadFolder);

    // Process the output filename if download was successful
    if (result.success && result.outputFile) {
      let outputFile = result.outputFile;
      
      // Add date prefix to filename if needed
      outputFile = await processOutputFilename(outputFile);
      
      // Fix aspect ratio if requested
      if (options.fixAspectRatio) {
        const fixedFile = await checkAndFixAspectRatio(outputFile, mainWindow);
        if (fixedFile) {
          outputFile = fixedFile;
        }
      }
      
      return {
        success: true,
        outputFile
      };
    }
    
    return result;
  } catch (error) {
    log.error('Download error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  }) as unknown as { canceled: boolean; filePaths: string[] };

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

// Open file in native application
ipcMain.handle('open-file', (_, filePath) => {
  return shell.openPath(filePath);
});

// Show file in folder
ipcMain.handle('show-in-folder', (_, filePath) => {
  return shell.showItemInFolder(filePath);
});

// Install update
ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

// Handle app update events
autoUpdater.on('update-available', () => {
  if (mainWindow) {
    mainWindow.webContents.send('update-available');
  }
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded');
  }
});