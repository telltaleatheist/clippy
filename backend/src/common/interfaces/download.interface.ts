export interface DownloadOptions {
  url: string;
  outputDir?: string;
  quality?: string;
  convertToMp4?: boolean;
  fps?: number;
  useCookies?: boolean;
  browser?: string;
  fixAspectRatio?: boolean;
}

export interface DownloadResult {
  success: boolean;
  outputFile?: string;
  error?: string;
}

export interface DownloadProgress {
  progress: number;
  task?: string;
  outputFile?: string;
}

export interface HistoryItem {
  id: string;
  filename: string;
  filePath: string;
  sourceUrl: string;
  fileSize?: number;
  duration?: number;
  date: string;
}

export interface VideoMetadata {
  width?: number;
  height?: number;
  duration?: number;
  codecName?: string;
  bitrate?: number;
  fps?: number;
  aspectRatio?: string;
}

export type BrowserType = 'auto' | 'chrome' | 'firefox' | 'edge' | 'safari' | 'brave' | 'opera';