import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import youtubeDl from 'youtube-dl-exec';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { 
  DownloadOptions, 
  DownloadResult, 
  HistoryItem 
} from '../common/interfaces/download.interface';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';

@WebSocketGateway({ cors: true })
@Injectable()
export class DownloaderService {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DownloaderService.name);
  private downloadHistory: HistoryItem[] = [];
  private historyFilePath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly ffmpegService: FfmpegService,
  ) {
    this.historyFilePath = path.join(process.cwd(), 'downloads', 'history.json');
    this.loadDownloadHistory();
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

  async downloadVideo(options: DownloadOptions): Promise<DownloadResult> {
    try {
      this.logger.log(`Starting download for URL: ${options.url}`);
      
      // Ensure output directory exists
      const downloadFolder = options.outputDir || path.join(process.cwd(), 'downloads');
      if (!fs.existsSync(downloadFolder)) {
        fs.mkdirSync(downloadFolder, { recursive: true });
      }

      // Set date format for output template
      const dateFormat = '%(upload_date>%Y-%m-%d)s ';
      const outputTemplate = path.join(downloadFolder, `${dateFormat}%(title)s.%(ext)s`);

      // Build yt-dlp options
      const ytDlpOptions: Record<string, any> = {
        output: outputTemplate,
        verbose: true,
        noCheckCertificates: true,
        noPlaylist: true,
        forceOverwrites: true
      };

      // Add format option based on quality
      if (options.convertToMp4) {
        ytDlpOptions.mergeOutputFormat = 'mp4';
      }

      // Add quality setting based on URL type
      if (options.url.includes('youtube.com') || options.url.includes('youtu.be')) {
        ytDlpOptions.format = `bestvideo[height<=${options.quality}]+bestaudio/best[height<=${options.quality}]`;
      } else {
        ytDlpOptions.format = `best[height<=${options.quality}]/best`;
      }

      // Add browser cookies if requested
      if (options.useCookies && options.browser) {
        if (options.browser !== 'auto') {
          ytDlpOptions.cookiesFromBrowser = options.browser;
        } else {
          // Auto-detect browser (handle this on frontend instead)
          ytDlpOptions.cookiesFromBrowser = 'chrome';
        }
      }
      
      // Start download process
      let outputFile: string | null = null;
      let progressPercent = 0;
      
      // Create a promise that resolves when the download is complete
      const downloadPromise = new Promise<DownloadResult>((resolve, reject) => {
        const downloadProcess = youtubeDl.exec(
          options.url,
          ytDlpOptions,
          { stdio: ['ignore', 'pipe', 'pipe'] }
        );
        
        // Handle stdout data
        if (downloadProcess.stdout) {
          downloadProcess.stdout.on('data', (data: Buffer) => {
            const output = data.toString();
            
            // Extract download progress
            const progressMatch = output.match(/(\d+\.\d+)% of/);
            if (progressMatch) {
              progressPercent = parseFloat(progressMatch[1]);
              this.server.emit('download-progress', { 
                progress: progressPercent,
                task: 'Downloading'
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
            this.logger.error(`yt-dlp error: ${data.toString()}`);
          });
        }
        
        // Handle process completion
        downloadProcess.on('close', async (code: number) => {
          if (code === 0 && outputFile && fs.existsSync(outputFile)) {
            this.logger.log(`Download successful: ${outputFile}`);
            
            // Process output filename
            outputFile = await this.processOutputFilename(outputFile);
            
            // Fix aspect ratio if requested
            if (options.fixAspectRatio) {
              const fixedFile = await this.ffmpegService.fixAspectRatio(outputFile);
              if (fixedFile) {
                outputFile = fixedFile;
              }
            }
            
            // Add to download history
            this.addToHistory(outputFile, options.url);
            
            // Resolve promise
            resolve({
              success: true,
              outputFile: outputFile
            });
          } else {
            this.logger.error(`Download failed with code ${code}`);
            resolve({
              success: false,
              error: `Download failed with code ${code}`
            });
          }
        });
        
        // Handle process error
        downloadProcess.on('error', (err: Error) => {
          this.logger.error(`Download process error: ${err.message}`);
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
      this.server.emit('download-history-updated', this.downloadHistory);
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
      this.server.emit('download-history-updated', this.downloadHistory);
      return { success: true, message: 'Item removed from history' };
    }
    
    return { success: false, message: 'Item not found in history' };
  }

  clearHistory(): { success: boolean, message: string } {
    this.downloadHistory = [];
    this.saveDownloadHistory();
    this.server.emit('download-history-updated', this.downloadHistory);
    return { success: true, message: 'Download history cleared' };
  }

  async checkUrl(url: string): Promise<{ valid: boolean, message: string, info?: any }> {
    try {
      // Use yt-dlp to get info about the URL
      const result = await youtubeDl(url, {
        dumpSingleJson: true,
        noPlaylist: true,
        skipDownload: true,
        noWarnings: true,
      });
      
      if (result) {
        return {
          valid: true,
          message: 'Valid video URL',
          info: {
            title: result.title,
            duration: result.duration,
            thumbnail: result.thumbnail,
            uploader: result.uploader,
            extractor: result.extractor,
          },
        };
      }
      
      return { valid: false, message: 'Could not extract video information' };
    } catch (error) {
      this.logger.error('Error checking URL:', error);
      return { 
        valid: false, 
        message: error instanceof Error ? error.message : 'Invalid video URL'
      };
    }
  }
}