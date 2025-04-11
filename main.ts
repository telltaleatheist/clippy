// clippy/main.ts
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { downloadVideo, checkAndFixAspectRatio, processOutputFilename } from './download';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';

// Configure logging early
log.transports.file.level = 'info';
log.transports.console.level = 'info';
log.info('Application starting... Checking for other instances.');

// Log important paths
log.info(`App path: ${app.getAppPath()}`);
log.info(`__dirname: ${__dirname}`);
log.info(`Resources path: ${process.resourcesPath || 'not available'}`);
log.info(`Current working directory: ${process.cwd()}`);

// Single instance lock - THIS IS CRITICAL
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log.info('Another instance is already running. Exiting.');
  app.quit();
  process.exit(0);
} else {
  log.info('This is the primary instance. Continuing startup.');
  
  // This event will be triggered when a second instance tries to run
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    log.info('Second instance detected. Focusing main window.');
    // Someone tried to run a second instance, we should focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Keep a global reference of the window object
  let mainWindow: BrowserWindow | null = null;
  let backendStarted = false;
  let server = null;

  /**
   * Setup binary files by ensuring they have executable permissions on macOS/Linux
   */
  function setupBinaries(): void {
    if (process.platform === 'win32') {
      // No need to set permissions on Windows
      return;
    }

    // Determine the location of binaries based on environment
    const isDevelopment = !app.isPackaged;
    const binPath = isDevelopment 
      ? path.join(process.cwd(), 'bin')  // Development: root/bin
      : path.join(process.resourcesPath || app.getAppPath(), 'bin');  // Production: resources/bin
      
    log.info(`Setting up binaries at: ${binPath} (exists: ${fs.existsSync(binPath)})`);
    
    if (fs.existsSync(binPath)) {
      // List binaries for debugging
      try {
        const files = fs.readdirSync(binPath);
        log.info(`Files in bin directory: ${files.join(', ')}`);
      } catch (err) {
        log.error(`Error listing bin directory: ${err}`);
      }
      
      // List of binaries to make executable
      const binaries = ['yt-dlp', 'ffmpeg', 'ffprobe'];
      
      binaries.forEach(binary => {
        const binaryPath = path.join(binPath, binary);
        
        if (fs.existsSync(binaryPath)) {
          log.info(`Setting executable permissions for: ${binaryPath}`);
          try {
            fs.chmodSync(binaryPath, 0o755);
          } catch (error) {
            log.error(`Failed to set permissions for ${binaryPath}:`, error);
          }
        } else {
          log.warn(`Binary not found: ${binaryPath}`);
        }
      });
    } else {
      log.warn(`Bin directory not found: ${binPath}`);
    }
  }

  // Create main application window
  function createWindow(): void {
    log.info('Creating main application window...');
    
    // Setup binary permissions
    setupBinaries();

    // Determine if we're in development mode
    const isDevelopment = !app.isPackaged;

    log.info(`Running in ${isDevelopment ? 'development' : 'production'} mode`);

    // Create the browser window
    mainWindow = new BrowserWindow({
      width: 900,
      height: 700,
      minWidth: 800,  // Reasonable minimum width
      minHeight: 600, // Reasonable minimum height
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
        webSecurity: true, // Enable web security
        allowRunningInsecureContent: false, // Disable insecure content
        preload: path.join(__dirname, 'preload', 'preload.js')
      },
      // Disable icon for now to avoid path issues
      // icon: path.join(__dirname, '../../assets/icon.png') 
    });
    
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          contentSecurityPolicy: "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' https://fonts.gstatic.com; " +
          "connect-src 'self' http://localhost:3000 http://localhost:8080 ws://localhost:3000 ws://localhost:8080;"
        }
      });
    });

    // Always open DevTools in development mode
    // In production, only open if we specifically want debugging
    if (isDevelopment || process.env.DEBUG_PROD === 'true') {
      mainWindow.webContents.openDevTools();
      
      // Add debug listeners only in development mode
      mainWindow.webContents.on('did-start-loading', () => log.info('Started loading'));
      mainWindow.webContents.on('did-stop-loading', () => log.info('Stopped loading'));
      mainWindow.webContents.on('did-finish-load', () => log.info('Finished loading'));
      mainWindow.webContents.on('did-fail-load', (_, code, desc) => log.info(`Failed loading: ${code} ${desc}`));
      mainWindow.webContents.on('crashed' as any, () => log.info('Renderer crashed'));
      mainWindow.webContents.on('unresponsive', () => log.info('Window unresponsive'));
      
      // Log console messages from the renderer
      mainWindow.webContents.on('console-message', (_, level, message, line, sourceId) => {
        const levelNames = ['debug', 'info', 'warning', 'error', 'log'];
        const levelName = levelNames[level] || 'unknown';
        log.info(`Console [${levelName}]: ${message} (${sourceId}:${line})`);
      });
    }

    // Create a simple server to serve Angular files and proxy API requests
    server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
      const url = req.url || '/';
      
      log.info(`[HTTP Server] Received request: ${url}`);
      
      // Prioritize API and socket.io routes
      if (url.startsWith('/api/') || url.includes('/socket.io/')) {
        log.info(`[HTTP Server] Proxying special route: ${url}`);
        
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
          
          // Log response status
          log.info(`[HTTP Server] Proxy response for ${url}: ${proxyRes.statusCode}`);
        });
      
        // Pipe request body if exists
        req.pipe(proxyReq);
      
        proxyReq.on('error', (err) => {
          log.error(`[HTTP Server] Proxy error for ${url}: ${err.message}`);
          
          // Return a more user-friendly error page
          res.writeHead(503, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head>
                <title>Service Unavailable</title>
                <style>
                  body {
                    font-family: Arial, sans-serif;
                    text-align: center;
                    padding: 50px;
                    background-color: #f5f5f5;
                  }
                  .error-container {
                    background-color: white;
                    border-radius: 8px;
                    padding: 30px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    max-width: 500px;
                    margin: 0 auto;
                  }
                  h1 { color: #e74c3c; }
                  p { color: #333; line-height: 1.5; }
                  button {
                    background-color: #3498db;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-top: 20px;
                    font-size: 14px;
                  }
                  button:hover { background-color: #2980b9; }
                </style>
              </head>
              <body>
                <div class="error-container">
                  <h1>Connection Error</h1>
                  <p>Unable to connect to the backend service. This is typically because the backend server isn't running.</p>
                  <p>Please make sure the backend server is started before using the application.</p>
                  <button onclick="window.location.reload()">Retry Connection</button>
                </div>
              </body>
            </html>
          `);
        });
      
        return;
      }

      // Serve static files
      const isDevelopment = !app.isPackaged;
      let frontendPath;

      // Determine the path to the frontend files based on whether we're in development or production
      if (isDevelopment) {
        frontendPath = path.join(__dirname, '../frontend/dist/clippy-frontend/browser');
      } else {
        frontendPath = path.join(process.resourcesPath, 'frontend/dist/clippy-frontend/browser');
        // Alternative path if the first one doesn't exist
        if (!fs.existsSync(frontendPath)) {
          frontendPath = path.join(app.getAppPath(), 'frontend/dist/clippy-frontend/browser');
        }
      }

      log.info(`[HTTP Server] Frontend path: ${frontendPath} (exists: ${fs.existsSync(frontendPath)})`);
      
      // If the frontend path doesn't exist, try to list parent directories to help with debugging
      if (!fs.existsSync(frontendPath)) {
        try {
          const parentPath = path.dirname(frontendPath);
          log.info(`Parent path ${parentPath} exists: ${fs.existsSync(parentPath)}`);
          
          if (fs.existsSync(parentPath)) {
            log.info(`Contents of ${parentPath}: ${fs.readdirSync(parentPath).join(', ')}`);
          }
        } catch (err) {
          log.error(`Error checking parent path: ${err}`);
        }
      }
      
      let filePath = path.join(frontendPath, url === '/' ? 'index.html' : url);
      log.info(`[HTTP Server] Checking for file: ${filePath}`);

      if (fs.existsSync(filePath)) {
        // Check if the requested path is a directory
        if (fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, 'index.html');
        }
        
        if (fs.existsSync(filePath)) {
          log.info(`[HTTP Server] Serving file: ${filePath}`);
                
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
      log.info(`[HTTP Server] File not found: ${filePath}, falling back to index.html`);
      
      const indexPath = path.join(frontendPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        log.info(`[HTTP Server] Serving index.html as fallback`);
        const content = fs.readFileSync(indexPath);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
      } else {
        log.error(`[HTTP Server] index.html not found at ${indexPath}`);
        // List the contents of the directory where index.html should be
        try {
          const dir = path.dirname(indexPath);
          if (fs.existsSync(dir)) {
            log.info(`Contents of ${dir}: ${fs.readdirSync(dir).join(', ')}`);
          }
        } catch (err) {
          log.error(`Error listing directory: ${err}`);
        }
        
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found - index.html could not be located');
      }
    });
        
    if (mainWindow) {
      log.info('Loading application in main window...');
      mainWindow.loadFile(path.join(__dirname, '../frontend/dist/clippy-frontend/browser/index.html'));
    }

    // Handle server errors
    server.on('error', (err) => {
      log.error(`HTTP server error: ${err.message}`);
    });

    // Hide menu bar in production mode
    const isDevelopmentMode = !app.isPackaged;
    mainWindow.setMenuBarVisibility(isDevelopmentMode);

    // Handle window closed
    mainWindow.on('closed', () => {
      log.info('Main window closed');
      mainWindow = null;
    });

    // Check for updates
    if (!isDevelopmentMode) {
      try {
        log.info('Checking for updates...');
        autoUpdater.checkForUpdatesAndNotify().catch(err => {
          // Just log the error, don't crash the app
          log.warn('Auto-updater error (can be ignored if you have no published releases):', err);
        });
      } catch (error) {
        log.warn('Failed to check for updates:', error);
      }
    }
  }

  function startBackendServer(): Promise<boolean> {
    if (backendStarted) {
      log.info('Backend already started. Skipping.');
      return Promise.resolve(true);
    }
  
    // Create a lock file path
    const lockFilePath = path.join(app.getPath('userData'), 'backend.lock');
    
    // Check if lock file exists and is recent (less than 10 seconds old)
    if (fs.existsSync(lockFilePath)) {
      const stats = fs.statSync(lockFilePath);
      const fileAge = Date.now() - stats.mtimeMs;
      
      if (fileAge < 10000) {  // 10 seconds
        log.info('Recent lock file found. Another backend instance may be running.');
        return Promise.resolve(false); // Changed to false since we have no fallback
      } else {
        // Lock file is stale, remove it
        fs.unlinkSync(lockFilePath);
      }
    }
    
    // Create the lock file
    try {
      fs.writeFileSync(lockFilePath, new Date().toString());
    } catch (err) {
      log.error('Failed to create lock file:', err);
    }
    
    backendStarted = true; // Set immediately to prevent race conditions  
  
    return new Promise((resolve) => {
      // Catch uncaught errors globally
      process.on('uncaughtException', (err) => {
        log.error('Uncaught Exception:', err);
      });

      process.on('unhandledRejection', (reason, promise) => {
        log.error('Unhandled Rejection at:', promise, 'reason:', reason);
      });

      try {
        const isDevelopment = !app.isPackaged;
        const { spawn } = require('child_process');

        log.info('Starting backend server...');
        log.info(`Environment: ${isDevelopment ? 'Development' : 'Production'}`);

        // Path to the backend main.js file
        let backendMain: string;
        
        if (isDevelopment) {
          backendMain = path.join(__dirname, '../backend/dist/src/main.js');
        } else {
          backendMain = path.join(process.resourcesPath, 'backend/dist/src/main.js');
          // Fallback if the first path doesn't exist
          if (!fs.existsSync(backendMain)) {
            backendMain = path.join(app.getAppPath(), 'backend/dist/src/main.js');
          }
        }

        log.info(`Backend path: ${backendMain} (exists: ${fs.existsSync(backendMain)})`);

        if (!fs.existsSync(backendMain)) {
          log.error(`Backend server not found at: ${backendMain}`);

          // Debug missing paths
          try {
            const parentDir = path.dirname(backendMain);
            const grandparentDir = path.dirname(parentDir);

            log.info(`Checking parent directory: ${parentDir} (exists: ${fs.existsSync(parentDir)})`);
            if (fs.existsSync(parentDir)) {
              log.info(`Parent directory contents: ${fs.readdirSync(parentDir).join(', ')}`);
            } else {
              log.info(`Checking grandparent directory: ${grandparentDir} (exists: ${fs.existsSync(grandparentDir)})`);
              if (fs.existsSync(grandparentDir)) {
                log.info(`Grandparent directory contents: ${fs.readdirSync(grandparentDir).join(', ')}`);
              }
            }
          } catch (err) {
            log.error(`Error checking directories: ${err}`);
          }

          log.info('Backend not found. Falling back to minimal server...');
          resolve(false);
          return;
        }

        log.info(`Backend entry point exists. Preparing to launch...`);

        // Set up binary paths
        const ytDlpPath = getBinaryPath('yt-dlp');
        const ffmpegPath = getBinaryPath('ffmpeg');
        const ffprobePath = getBinaryPath('ffprobe');

        log.info(`Binary paths for backend process:`);
        log.info(`- yt-dlp: ${ytDlpPath} (exists: ${fs.existsSync(ytDlpPath)})`);
        log.info(`- ffmpeg: ${ffmpegPath} (exists: ${fs.existsSync(ffmpegPath)})`);
        log.info(`- ffprobe: ${ffprobePath} (exists: ${fs.existsSync(ffprobePath)})`);

        const nodePath = process.execPath;
        log.info(`Using Node.js executable: ${nodePath} (exists: ${fs.existsSync(nodePath)})`);

        // Environment variables for the backend
        const env = {
          ...process.env,
          NODE_ENV: isDevelopment ? 'development' : 'production',
          YT_DLP_PATH: ytDlpPath,
          FFMPEG_PATH: ffmpegPath,
          FFPROBE_PATH: ffprobePath,
        };

        log.info(`Attempting to spawn Node.js process...`);

        const frontendPath = path.join(app.getPath('userData'), 'Resources', 'frontend', 'dist', 'clippy-frontend', 'browser');
        process.env.FRONTEND_PATH = frontendPath;

        log.info(`Frontend path for backend: ${frontendPath} (exists: ${fs.existsSync(frontendPath)})`);

        try {
          // Spawn the backend process
          const backend = spawn(nodePath, [backendMain], {
            env: {
              ...env,
              ELECTRON_RUN_AS_NODE: '1',
              CLIPPY_BACKEND: 'true',
              FRONTEND_PATH: frontendPath,
              // Add this to help find node modules
              NODE_PATH: path.join(process.resourcesPath, 'backend/node_modules')
            },
            ...(process.platform === 'win32' ? { detached: true } : {}),
            ...(process.platform === 'darwin' ? { 
              stdio: ['ignore', 'pipe', 'pipe'],
              windowsHide: true 
            } : {})
          });
          
          log.info(`Process spawned successfully with PID: ${backend.pid}`);

          if (backend.stdout) {
            backend.stdout.on('data', (data: Buffer) => {
              log.info(`[Backend] ${data.toString().trim()}`);
            });
          } else {
            log.warn(`Backend stdout stream is not available`);
          }

          if (backend.stderr) {
            backend.stderr.on('data', (data: Buffer) => {
              log.error(`[Backend Error] ${data.toString().trim()}`);
            });
          } else {
            log.warn(`Backend stderr stream is not available`);
          }

          backend.on('error', (err: Error) => {
            log.error(`Error starting backend process: ${err.message}`);
            resolve(false); // Changed from resolve(startFallbackServer())
          });
      
          backend.on('close', (code: number | null) => {
            log.info(`Backend process closed with code ${code}`);
            if (code !== 0) resolve(false);
          });

          backend.on('exit', (code: number | null) => {
            log.info(`Backend process exited with code ${code}`);
          });

          // Clean up when app quits
          app.on('before-quit', () => {
            log.info('Shutting down backend server...');
            if (backend && !backend.killed) {
              // On Windows, we need to kill the process group since it's detached
              if (process.platform === 'win32' && backend.pid) {
                try {
                  process.kill(-backend.pid, 'SIGTERM');
                } catch (err) {
                  log.warn(`Error killing process group: ${err}`);
                }
              }
              backend.kill();
            }
          });

          log.info(`Waiting 5 seconds for backend to initialize...`);
          setTimeout(() => {
            checkBackendServer().then((isRunning) => {
              log.info(`Backend server status check: ${isRunning ? 'RUNNING' : 'NOT RUNNING'}`);
              if (!isRunning) {
                log.warn('Backend server is not responding. Falling back to minimal server...');
                resolve(false);
              } else {
                resolve(true);
              }
            });
          }, 5000);

        } catch (spawnError) {
          log.error(`Failed to spawn process: ${spawnError}`);
          resolve(false);
        }

      } catch (outerError) {
        log.error(`Overall error in backend startup: ${outerError}`);
        resolve(false);
      }
    });
  }

  // This method will be called when Electron has finished initialization
  app.whenReady().then(async () => {
    log.info('Electron app ready, initializing...');
    logActiveProcesses();

    // Add environment variables for binary paths that NestJS can access
    process.env.YT_DLP_PATH = getBinaryPath('yt-dlp');
    process.env.FFMPEG_PATH = getBinaryPath('ffmpeg');
    process.env.FFPROBE_PATH = getBinaryPath('ffprobe');
    
    // Log the paths we're using
    log.info(`Using yt-dlp: ${process.env.YT_DLP_PATH}`);
    log.info(`Using ffmpeg: ${process.env.FFMPEG_PATH}`);
    log.info(`Using ffprobe: ${process.env.FFPROBE_PATH}`);

  // Start the backend first 
  const backendStarted = await startBackendServer();
  
  if (!backendStarted) {
    // Show error window instead of normal window
    showBackendErrorWindow();
  } else {
    // Then create the main window
    createWindow();
  }

  app.on('activate', () => {
    // On macOS it's common to re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      if (backendStarted) {
        createWindow();
      } else {
        showBackendErrorWindow();
      }
    }
  });
});

  function showBackendErrorWindow(): void {
    const errorWindow = new BrowserWindow({
      width: 500,
      height: 300,
      center: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: 'Backend Error',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    
    // Generate a simple HTML error page
    const errorHtml = `
      <html>
        <head>
          <title>Backend Error</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              margin: 0;
              padding: 20px;
              color: #333;
              background-color: #f5f5f5;
              text-align: center;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              height: 100vh;
            }
            .container {
              background-color: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              width: 100%;
              max-width: 450px;
            }
            h2 { 
              color: #e74c3c;
              margin-top: 0;
            }
            p { 
              line-height: 1.5;
              margin-bottom: 20px;
            }
            button {
              background-color: #3498db;
              color: white;
              border: none;
              padding: 10px 20px;
              border-radius: 4px;
              cursor: pointer;
            }
            button:hover {
              background-color: #2980b9;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Backend Server Error</h2>
            <p>The application encountered an error while starting the backend server.</p>
            <p>This could be because:</p>
            <ul style="text-align: left;">
              <li>Another instance of the application is already running</li>
              <li>Port 3000 is being used by another application</li>
              <li>There was an error during backend initialization</li>
            </ul>
            <p>Please close all instances of this application and try again.</p>
            <button onclick="window.close()">Close Application</button>
          </div>
        </body>
      </html>
    `;
    
    // Load the HTML content
    errorWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
    
    // Handle window closed
    errorWindow.on('closed', () => {
      app.quit();
    });
  }
  /**
   * Gets the appropriate path for a binary based on environment and platform
   */
  function getBinaryPath(binaryName: string): string {
    const isDevelopment = !app.isPackaged;
    const executable = process.platform === 'win32' ? `${binaryName}.exe` : binaryName;
    
    let binPath: string;
    
    if (isDevelopment) {
      // Development environment - check project root
      binPath = path.join(process.cwd(), 'bin', executable);
    } else {
      // Production environment - check in resources
      binPath = path.join(process.resourcesPath, 'bin', executable);
    }
    
    // Verify the binary exists
    if (!fs.existsSync(binPath)) {
      log.warn(`Binary not found at ${binPath}`);
    }
    
    return binPath;
  }

  // Quit when all windows are closed, except on macOS
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  function logActiveProcesses() {
    const { exec } = require('child_process');
    if (process.platform === 'darwin' || process.platform === 'linux') {
      exec('lsof -i :3000', (error: any, stdout: any) => {
        if (error) {
          log.info('No process found using port 3000');
          return;
        }
        log.info('Processes using port 3000:');
        log.info(stdout);
      });
    } else if (process.platform === 'win32') {
      exec('netstat -ano | findstr :3000', (error: any, stdout: any) => {
        if (error) {
          log.info('No process found using port 3000');
          return;
        }
        log.info('Processes using port 3000:');
        log.info(stdout);
      });
    }
  }

  // Make sure the backend server is running
  function checkBackendServer(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/api',
        method: 'GET',
        timeout: 2000 // 2 second timeout
      }, (res) => {
        log.info(`Backend check response status: ${res.statusCode}`);
        resolve(res.statusCode === 200);
      });
      
      req.on('error', (err) => {
        log.error(`Backend check error: ${err.message}`);
        resolve(false);
      });
      
      req.on('timeout', () => {
        log.error('Backend check timeout');
        req.destroy();
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
  // Expose the binary paths in the preload API so they can be used in the renderer process
  ipcMain.handle('get-binary-paths', () => {
    return {
      ytDlpPath: process.env.YT_DLP_PATH,
      ffmpegPath: process.env.FFMPEG_PATH,
      ffprobePath: process.env.FFPROBE_PATH,
      resourcesPath: process.resourcesPath || app.getAppPath(),
      isDevelopment: !app.isPackaged
    };
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
    log.info(`Opening file: ${filePath}`);
    return shell.openPath(filePath);
  });

  // Show file in folder
  ipcMain.handle('show-in-folder', (_, filePath) => {
    log.info(`Showing file in folder: ${filePath}`);
    return shell.showItemInFolder(filePath);
  });

  // Install update
  ipcMain.handle('install-update', () => {
    log.info('Installing update...');
    autoUpdater.quitAndInstall();
  });

  // Handle app update events
  autoUpdater.on('update-available', () => {
    log.info('Update available');
    if (mainWindow) {
      mainWindow.webContents.send('update-available');
    }
  });

  autoUpdater.on('update-downloaded', () => {
    log.info('Update downloaded');
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded');
    }
  });

  // Directory picker dialog
  ipcMain.handle('open-directory-picker', async () => {
    if (!mainWindow) return { canceled: true, filePaths: [] };
    
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Download Location'
    });
    
    return result;
  });

  // To help debugging - get the download directory path
  ipcMain.handle('get-downloads-path', () => {
    const downloadsPath = app.getPath('downloads');
    log.info(`Downloads path: ${downloadsPath}`);
    return downloadsPath;
  });
  
  // New handler for checking file existence
  ipcMain.handle('check-file-exists', (_, filePath) => {
    const exists = fs.existsSync(filePath);
    log.info(`Checking if file exists: ${filePath} - ${exists ? 'YES' : 'NO'}`);
    return exists;
  });
  
  // New handler for getting app paths (helpful for debugging)
  ipcMain.handle('get-app-paths', () => {
    return {
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
      dirname: __dirname,
      execPath: process.execPath,
      cwd: process.cwd(),
      downloadsPath: app.getPath('downloads'),
      tempPath: app.getPath('temp'),
      userDataPath: app.getPath('userData')
    };
  });
}