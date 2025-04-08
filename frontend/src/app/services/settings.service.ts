// clippy/frontend/src/app/services/settings.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Settings } from '../models/settings.model';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly STORAGE_KEY = 'clippy_settings';
  private settingsSubject: BehaviorSubject<Settings>;

  // Default settings
  private defaultSettings: Settings = {
    outputDir: '',
    quality: '720',
    convertToMp4: true,
    useCookies: true,
    fixAspectRatio: true,
    browser: 'auto',
    theme: 'light'
  };

  constructor() {
    // Initialize settings from localStorage or defaults
    const savedSettings = this.loadSettings();
    this.settingsSubject = new BehaviorSubject<Settings>({
      ...this.defaultSettings,
      ...savedSettings
    });
  }

  /**
   * Get current settings as Observable
   */
  getSettings(): Observable<Settings> {
    return this.settingsSubject.asObservable();
  }

  /**
   * Get current settings value
   */
  getCurrentSettings(): Settings {
    return this.settingsSubject.getValue();
  }

  /**
   * Update settings
   */
  updateSettings(settings: Partial<Settings>): void {
    const currentSettings = this.settingsSubject.getValue();
    const newSettings = { ...currentSettings, ...settings };
    this.settingsSubject.next(newSettings);
    this.saveSettings(newSettings);
  }

  /**
   * Reset settings to defaults
   */
  resetSettings(): void {
    this.settingsSubject.next({ ...this.defaultSettings });
    this.saveSettings(this.defaultSettings);
  }

  /**
   * Load settings from localStorage
   */
  private loadSettings(): Partial<Settings> {
    try {
      const settings = localStorage.getItem(this.STORAGE_KEY);
      return settings ? JSON.parse(settings) : {};
    } catch (error) {
      console.error('Error loading settings:', error);
      return {};
    }
  }

  /**
   * Save settings to localStorage
   */
  private saveSettings(settings: Settings): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }
}