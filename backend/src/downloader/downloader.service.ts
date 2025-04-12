
// clippy/backend/src/downloader/downloader.service.ts
import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { 
  DownloadOptions, 
  DownloadResult, 
  HistoryItem 
} from '../common/interfaces/download.interface';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { PathService } from '../path/path.service';
import { join } from 'node:path';
import { execFile, ExecFileOptions } from 'node:child_process';
import { EnvironmentUtil } from "../config/environment.util";

@WebSocketGateway({ cors: true })
@Injectable()
export class DownloaderService implements OnModuleInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DownloaderService.name);
  private readonly ytDlpPath: string;
  private downloadHistory: HistoryItem[] = [];
  private historyFilePath: string;
  
  constructor(
    private readonly configService: ConfigService,
    private readonly ffmpegService: FfmpegService,
    private readonly pathService: PathService,
  ) {
    // Try multiple locations for the binary in this order:
    // 1. Environment variable YT_DLP_PATH
    // 2. From EnvironmentUtil
    // 3. From ~/Documents/clippy/bin/ directory
    // 4. Development fallback (../../../bin/yt-dlp)
    
    let resolvedPath = this.configService.get('YT_DLP_PATH') || EnvironmentUtil.getBinaryPath('yt-dlp');
    this.logger.log(`yt-dlp path initially resolved to: ${resolvedPath}`);
    
    // Check if the path exists
    if (!fs.existsSync(resolvedPath)) {
      this.logger.warn(`WARNING: yt-dlp not found at ${resolvedPath}`);
      
      // Try standard production location at ~/Documents/clippy/bin/
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      const prodPath = path.join(homeDir, 'Documents', 'clippy', 'bin', 'yt-dlp');
      
      if (fs.existsSync(prodPath)) {
        resolvedPath = prodPath;
        this.logger.log(`Using production path: ${resolvedPath}`);
      } else {
        this.logger.warn(`WARNING: yt-dlp not found at ${prodPath}`);
        
        // Try absolute project root bin directory
        const projectRootBin = path.join(__dirname, '../../../bin');
        
        if (fs.existsSync(projectRootBin)) {
          resolvedPath = projectRootBin;
          this.logger.log(`Using project root bin path: ${resolvedPath}`);
        } else if (EnvironmentUtil.isDevelopment()) {
          // Last resort fallback: absolute path for local dev only
          resolvedPath = path.join(__dirname, '../../../bin/yt-dlp');
          this.logger.log(`Development fallback path used: ${resolvedPath}`);
        }
      }
    }
    
    // Final check if binary exists
    if (!fs.existsSync(resolvedPath)) {
      this.logger.error(`CRITICAL ERROR: yt-dlp binary not found at any location. Last tried: ${resolvedPath}`);
      // Don't throw here to allow graceful service startup, but app will fail when trying to use it
    } else {
      this.logger.log(`Final yt-dlp path: ${resolvedPath}`);
    }

    this.logger.log(`__dirname: ${__dirname}`);
    this.ytDlpPath = resolvedPath;
    this.logger.log(`yt-dlp resolved path (raw): ${this.ytDlpPath}`);
    this.historyFilePath = path.join(process.cwd(), 'downloads', 'history.json');
    this.ensureDirectoriesExist();
    this.loadDownloadHistory();
  }
  
  private ensureDirectoriesExist(): void {
    const downloadsDir = path.dirname(this.historyFilePath);
    
    if (!fs.existsSync(downloadsDir)) {
      try {
        fs.mkdirSync(downloadsDir, { recursive: true });
        this.logger.log(`Created directory: ${downloadsDir}`);
      } catch (error) {
        this.logger.error(`Failed to create directory: ${(error as Error).message}`);
      }
    }
  }

  onModuleInit() {
    if (!this.server) {
      this.logger.warn('WebSocket server not initialized during module initialization');
    } else {
      this.logger.log('WebSocket server initialized successfully');
    }
  }

  /**
   * Helper method to safely emit WebSocket events
   */
  private emitEvent(event: string, data: any): void {
    if (this.server) {
      this.server.emit(event, data);
    } else {
      this.logger.warn(`Cannot emit ${event} - WebSocket server not initialized`);
    }
  }

  private loadDownloadHistory(): void {
    try {
      if (fs.existsSync(this.historyFilePath)) {
        const historyData = fs.readFileSync(this.historyFilePath, 'utf8');
        this.downloadHistory = JSON.parse(historyData);
        this.logger.log(`Loaded ${this.downloadHistory.length} items from download history`);
      }
    } catch (error) {
      this.logger.error('Failed to load download history', error);
      this.downloadHistory = [];
    }
  }

  private saveDownloadHistory(): void {
    try {
      fs.writeFileSync(this.historyFilePath, JSON.stringify(this.downloadHistory, null, 2));
    } catch (error) {
      this.logger.error('Failed to save download history', error);
    }
  }

  async downloadVideo(options: DownloadOptions, jobId?: string): Promise<DownloadResult> {
    try {
      this.logger.log(`Starting download for URL: ${options.url}`);
      
      // Use PathService to ensure we have a valid download location
      const downloadFolder = this.pathService.getSafePath(options.outputDir);
      this.logger.log(`Using download directory: ${downloadFolder}`);
      
      // Ensure output directory exists
      if (!this.pathService.ensurePathExists(downloadFolder)) {
        throw new Error(`Cannot create or access download directory: ${downloadFolder}`);
      }
  
      // Set date format for output template
      const dateFormat = '%(upload_date>%Y-%m-%d)s ';
      const outputTemplate = path.join(downloadFolder, `${dateFormat}%(title)s.%(ext)s`);
  
      // Build yt-dlp options
      const ytDlpOptions: string[] = ['--verbose', '--output', outputTemplate];
      
      // Add no-check-certificates option
      ytDlpOptions.push('--no-check-certificates');
      
      // Add no-playlist option
      ytDlpOptions.push('--no-playlist');
      
      // Add force-overwrites option
      ytDlpOptions.push('--force-overwrites');
  
      // Add format option based on quality
      if (options.convertToMp4) {
        ytDlpOptions.push('--merge-output-format', 'mp4');
      }
  
      // Add quality setting based on URL type
      if (options.url.includes('youtube.com') || options.url.includes('youtu.be')) {
        ytDlpOptions.push('--format', `bestvideo[height<=${options.quality}]+bestaudio/best[height<=${options.quality}]`);
      } else {
        ytDlpOptions.push('--format', `best[height<=${options.quality}]/best`);
      }
  
      // Add browser cookies if requested
      if (options.useCookies && options.browser) {
        if (options.browser !== 'auto') {
          ytDlpOptions.push('--cookies-from-browser', options.browser);
        } else {
          // Auto-detect browser (handle this on frontend instead)
          ytDlpOptions.push('--cookies-from-browser', 'chrome');
        }
      }
      
      // Add the URL as the final argument
      ytDlpOptions.push(options.url);
      
      // Start download process
      let outputFile: string | null = null;
      let progressPercent = 0;
      
      // Notify clients that download has started
      this.emitEvent('download-started', { url: options.url, jobId });
      
      // Create a promise that resolves when the download is complete
      const downloadPromise = new Promise<DownloadResult>((resolve, reject) => {
        // Use a type assertion to allow 'stdio' even though it's not officially part of ExecFileOptions
        const commandOptions = {
          stdio: ['ignore', 'pipe', 'pipe']
        } as ExecFileOptions;
        
        const downloadProcess = execFile(this.ytDlpPath, ytDlpOptions, commandOptions);
  
        // Handle stdout data
        if (downloadProcess.stdout) {
          downloadProcess.stdout.on('data', (data: Buffer) => {
            const output = data.toString();
            
            // Extract download progress
            const progressMatch = output.match(/(\d+\.\d+)% of/);
            if (progressMatch) {
              progressPercent = parseFloat(progressMatch[1]);
              this.emitEvent('download-progress', { 
                progress: progressPercent,
                task: 'Downloading',
                jobId // Include jobId in the event
              });
            }
            
            // Extract output filename
            if (output.includes('[download] Destination:')) {
              outputFile = output.split('Destination: ')[1].trim();
            }
            
            // Extract merged filename
            if (output.includes('[Merger] Merging formats into')) {
              const match = output.match(/"([^"]+)"/);
              if (match) {
                outputFile = match[1];
              }
            }
          });
        }
        
        // Handle stderr data
        if (downloadProcess.stderr) {
          downloadProcess.stderr.on('data', (data: Buffer) => {
            const output = data.toString();
            
            // Check if this is a debug message or a real error
            if (output.includes('[debug]')) {
              // It's a debug message, log as debug or info
              this.logger.debug(`yt-dlp debug: ${output}`);
            } else {
              // It's a real error
              this.logger.error(`yt-dlp error: ${output}`);
            }
          });
        }
                
        // Handle process completion
        downloadProcess.on('close', async (code: number) => {
          if (code === 0 && outputFile && fs.existsSync(outputFile)) {
            this.logger.log(`Download successful: ${outputFile}`);
            
            // Process output filename
            outputFile = await this.processOutputFilename(outputFile);
            
            // For batch jobs, we'll skip processing and just return the result
            if (jobId) {
              // Notify clients that download has completed, but no processing yet
              this.emitEvent('download-completed', { 
                outputFile, 
                url: options.url,
                jobId
              });
              
              // Resolve with success
              resolve({
                success: true,
                outputFile
              });
              return;
            }
            
            // For single jobs, continue with processing
            if (options.fixAspectRatio) {
              this.emitEvent('processing-progress', { task: 'Fixing aspect ratio' });
              const fixedFile = await this.ffmpegService.fixAspectRatio(outputFile);
              if (fixedFile) {
                outputFile = fixedFile;
              }
            }
            
            // Add to download history
            this.addToHistory(outputFile, options.url);
            
            // Notify clients that download has completed
            this.emitEvent('download-completed', { 
              outputFile, 
              url: options.url,
              jobId
            });
            
            // Resolve promise
            resolve({
              success: true,
              outputFile
            });
          } else {
            const errorMsg = `Download failed with code ${code}`;
            this.logger.error(errorMsg);
            
            // Notify clients that download has failed
            this.emitEvent('download-failed', { 
              error: errorMsg, 
              url: options.url,
              jobId
            });
            
            resolve({
              success: false,
              error: errorMsg
            });
          }
        });
        
        // Handle process error
        downloadProcess.on('error', (err: Error) => {
          this.logger.error(`Download process error: ${err.message}`);
          
          // Notify clients that download has failed
          this.emitEvent('download-failed', { 
            error: err.message, 
            url: options.url,
            jobId
          });
          
          reject({
            success: false,
            error: err.message
          });
        });
      });
      
      // Return the result of the download
      return downloadPromise;
    } catch (error) {
      this.logger.error('Error in downloadVideo:', error);
      
      // Notify clients that download has failed
      this.emitEvent('download-failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        url: options.url,
        jobId
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
    
  async processOutputFilename(filePath: string): Promise<string> {
    try {
      if (!fs.existsSync(filePath)) {
        this.logger.error(`File does not exist: ${filePath}`);
        return filePath;
      }
      
      const filename = path.basename(filePath);
      const directory = path.dirname(filePath);
      
      // Check if the filename already starts with a date pattern (YYYY-MM-DD )
      if (/^\d{4}-\d{2}-\d{2} /.test(filename)) {
        this.logger.log(`File already has correct date format: ${filename}`);
        return filePath;
      }
      
      // Check if it has the YYYYMMDD- format
      if (/^\d{8}[-_ ]/.test(filename)) {
        // Convert YYYYMMDD- to YYYY-MM-DD 
        const dateStr = filename.substring(0, 8);
        const separator = filename.charAt(8);
        const restOfFilename = filename.substring(9);
        
        // Format the date with dashes
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        const newDateFormat = `${year}-${month}-${day} `;
        
        const newFilename = `${newDateFormat}${restOfFilename}`;
        const newPath = path.join(directory, newFilename);
        
        // Rename the file
        fs.renameSync(filePath, newPath);
        this.logger.log(`Reformatted date in filename: ${newFilename}`);
        return newPath;
      }
      
      // If no date, add today's date as prefix with proper format
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const newFilename = `${today} ${filename}`;
      const newPath = path.join(directory, newFilename);
      
      // Rename the file
      fs.renameSync(filePath, newPath);
      this.logger.log(`Adding date prefix to file: ${newFilename}`);
      return newPath;
    } catch (error) {
      this.logger.error('Error processing output filename:', error);
      return filePath;
    }
  }

  addToHistory(filePath: string, sourceUrl: string): void {
    try {
      const filename = path.basename(filePath);
      const date = new Date().toISOString();
      const id = Date.now().toString();
      
      // Get file size
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;
      
      // Create history item
      const historyItem: HistoryItem = {
        id,
        filename,
        filePath,
        sourceUrl,
        fileSize,
        date,
      };
      
      // Add to beginning of history array
      this.downloadHistory.unshift(historyItem);
      
      // Limit history to 50 items
      if (this.downloadHistory.length > 50) {
        this.downloadHistory.pop();
      }
      
      // Save history to file
      this.saveDownloadHistory();
      
      // Notify clients
      this.emitEvent('download-history-updated', this.downloadHistory);
    } catch (error) {
      this.logger.error('Error adding to history:', error);
    }
  }

  getDownloadHistory(): HistoryItem[] {
    return this.downloadHistory;
  }

  getFileById(id: string): HistoryItem | undefined {
    const file = this.downloadHistory.find(item => item.id === id);
    
    if (!file) {
      throw new NotFoundException('File not found in download history');
    }
    
    return file;
  }

  removeFromHistory(id: string): { success: boolean, message: string } {
    const initialLength = this.downloadHistory.length;
    this.downloadHistory = this.downloadHistory.filter(item => item.id !== id);
    
    if (this.downloadHistory.length < initialLength) {
      this.saveDownloadHistory();
      this.emitEvent('download-history-updated', this.downloadHistory);
      return { success: true, message: 'Item removed from history' };
    }
    
    return { success: false, message: 'Item not found in history' };
  }

  clearHistory(): { success: boolean, message: string } {
    this.downloadHistory = [];
    this.saveDownloadHistory();
    this.emitEvent('download-history-updated', this.downloadHistory);
    
    return { success: true, message: 'Download history cleared' };
  }

  async checkUrl(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      execFile(this.ytDlpPath, ['--dump-json', '--simulate', '--no-playlist', url], (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          this.logger.error(`yt-dlp failed!`);
          this.logger.error(`Command: ${this.ytDlpPath} --dump-json "${url}"`);
          this.logger.error(`Error message: ${error.message}`);
          this.logger.error(`stderr: ${stderr}`);
          this.logger.error(`stdout: ${stdout}`);
          reject(new Error(`yt-dlp failed: ${stderr || error.message}`));
          return;
        }
      
        try {
          const info = JSON.parse(stdout);
          resolve({ valid: true, info });
        } catch (parseErr) {
          this.logger.error('Failed to parse yt-dlp output!');
          this.logger.error(`stdout: ${stdout}`);
          this.logger.error(`Parse error: ${parseErr}`);
          reject(new Error('Invalid yt-dlp response'));
        }
      });
    });
  }
}