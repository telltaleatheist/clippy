import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { downloadVideo, checkAndFixAspectRatio, processOutputFilename } from './download';

// Add these imports
import * as http from 'http';
import * as https from 'https';
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
      nodeIntegration: true,
      contextIsolation: true,
      webSecurity: false, // Enable web security
      allowRunningInsecureContent: false, // Disable insecure content
      preload: path.join(__dirname, 'preload', 'preload.js')
    },
    icon: path.join(__dirname, '../../assets/icon.png')
  });
  
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        contentSecurityPolicy: "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "connect-src 'self' http://localhost:3000 ws://localhost:3000;"
      }
    });
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
  const url = req.url || '/';
  
  console.log(`[ELECTRON PROXY] Received request: ${url}`);
  
  // Prioritize API and socket.io routes
  if (url.startsWith('/api/') || url.includes('/socket.io/')) {
    console.log(`[ELECTRON PROXY] Proxying special route: ${url}`);
    
    const proxyOptions = {
      hostname: 'localhost',
      port: 3000,
      path: url,
      method: req.method,
      headers: {
        ...req.headers,
        'Host': 'localhost:3000'
      }
    };
  
    const proxyReq = http.request(proxyOptions, (proxyRes) => {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
      // Forward response
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    });
  
    // Pipe request body if exists
    req.pipe(proxyReq);
  
    proxyReq.on('error', (err) => {
      console.error('[ELECTRON PROXY] Proxy error:', err);
      res.writeHead(500);
      res.end('Proxy error');
    });
  
    return;
  }

  // Serve static files
  let filePath = path.join(__dirname, '../frontend/dist/clippy-frontend/browser', 
                           url === '/' ? '/index.html' : url);
  
  // Check if file exists and serve it
  if (fs.existsSync(filePath)) {
    // Check if the requested path is a directory
    if (fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      
      let contentType = 'text/html';
      if (ext === '.js') contentType = 'application/javascript';
      if (ext === '.css') contentType = 'text/css';
      if (ext === '.ico') contentType = 'image/x-icon';
      if (ext === '.png') contentType = 'image/png';
      if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      if (ext === '.svg') contentType = 'image/svg+xml';
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
      return;
    }
  }
  
  // Fallback to serving index.html for client-side routing
  console.log(`[Fallback] Serving index.html for route: ${url}`);
  const indexPath = path.join(__dirname, '../frontend/dist/clippy-frontend/browser/index.html');
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
  } else {
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

// Make sure the backend server is running
function checkBackendServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api',
      method: 'GET'
    }, (res) => {
      resolve(res.statusCode === 200);
    });
    
    req.on('error', () => {
      resolve(false);
    });
    
    req.end();
  });
}

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