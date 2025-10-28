// backend/src/config/shared-config.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SharedConfigService {
  private static instance: SharedConfigService;
  private readonly logger = new Logger(SharedConfigService.name);
  private config: any = {};
  private configPath: string;

  private constructor() {
    // Determine the user config path - similar to your ConfigManager
    const userDataPath = process.env.APPDATA || 
                      (process.platform === 'darwin' ? 
                      path.join(process.env.HOME || '', 'Library', 'Application Support') : 
                      path.join(process.env.HOME || '', '.config'));
    
    this.configPath = path.join(userDataPath, 'clippy', 'app-config.json');
    this.loadConfig();
  }

  static getInstance(): SharedConfigService {
    if (!SharedConfigService.instance) {
      SharedConfigService.instance = new SharedConfigService();
    }
    return SharedConfigService.instance;
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        this.config = JSON.parse(configData);
        this.logger.log(`Loaded config from ${this.configPath}`);
      } else {
        this.logger.warn(`No config file found at ${this.configPath}, using defaults`);
        this.config = {};
      }
    } catch (error) {
      this.logger.error('Failed to load config:', error);
      this.config = {};
    }
  }

  refreshConfig(): void {
    this.loadConfig();
  }

  getFfmpegPath(): string | undefined {
    return this.config.ffmpegPath;
  }

  getFfprobePath(): string | undefined {
    return this.config.ffprobePath;
  }

  getYtDlpPath(): string | undefined {
    return this.config.ytDlpPath;
  }

  getOutputDir(): string | undefined {
    return this.config.outputDir;
  }

  getConfig(): any {
    return { ...this.config }; // Return a copy to prevent direct mutation
  }
}