// clippy/frontend/src/app/models/settings.model.ts
import { BrowserType, QualityOption } from './download.model';

export interface Settings {
  outputDir: string;
  quality: QualityOption;
  convertToMp4: boolean;
  useCookies: boolean;
  fixAspectRatio: boolean;
  browser: BrowserType;
  theme: 'light' | 'dark';
}