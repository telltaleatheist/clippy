import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../services/api.service';
import { SettingsService } from '../../services/settings.service';
import { Settings } from '../../models/settings.model';
import { DownloadOptions, VideoInfo } from '../../models/download.model';
import { BROWSER_OPTIONS, QUALITY_OPTIONS } from './download-form.constants';
import { debounceTime, distinctUntilChanged, switchMap, catchError, of } from 'rxjs';

@Component({
  selector: 'app-download-form',
  templateUrl: './download-form.component.html',
  styleUrls: ['./download-form.component.scss']
})
export class DownloadFormComponent implements OnInit {
  downloadForm: FormGroup;
  advancedOptionsExpanded = false;
  isLoading = false;
  browserOptions = BROWSER_OPTIONS;
  qualityOptions = QUALITY_OPTIONS;
  urlInfo: VideoInfo | null = null;
  isValidUrl = false;
  isCheckingUrl = false;

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
    private settingsService: SettingsService,
    private snackBar: MatSnackBar
  ) {
    this.downloadForm = this.createForm();
  }

  ngOnInit(): void {
    // Load saved settings
    this.settingsService.getSettings().subscribe(settings => {
      this.updateFormWithSettings(settings);
    });

    // Add URL validator with debounce
    this.downloadForm.get('url')?.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap(url => {
          if (!url || url.length < 5) {
            this.urlInfo = null;
            this.isValidUrl = false;
            return of(null);
          }
          
          this.isCheckingUrl = true;
          return this.apiService.checkUrl(url).pipe(
            catchError(() => of({ valid: false, message: 'Error checking URL' }))
          );
        })
      )
      .subscribe(result => {
        this.isCheckingUrl = false;
        
        if (result) {
          this.isValidUrl = result.valid;
          if (result && 'info' in result) {
            this.urlInfo = result.info;
          }
          
          if (!result.valid) {
            this.downloadForm.get('url')?.setErrors({ invalidUrl: true });
          }
        }
      });
  }

  createForm(): FormGroup {
    return this.fb.group({
      url: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
      quality: ['720'],
      convertToMp4: [true],
      useCookies: [true],
      browser: ['auto'],
      fixAspectRatio: [true],
      outputDir: ['']
    });
  }

  updateFormWithSettings(settings: Settings): void {
    this.downloadForm.patchValue({
      quality: settings.quality,
      convertToMp4: settings.convertToMp4,
      useCookies: settings.useCookies,
      browser: settings.browser,
      fixAspectRatio: settings.fixAspectRatio,
      outputDir: settings.outputDir
    });
  }

  toggleAdvancedOptions(): void {
    this.advancedOptionsExpanded = !this.advancedOptionsExpanded;
  }

  onSubmit(): void {
    if (this.downloadForm.invalid) {
      return;
    }

    const formValue = this.downloadForm.value;
    const downloadOptions: DownloadOptions = {
      url: formValue.url,
      quality: formValue.quality,
      convertToMp4: formValue.convertToMp4,
      useCookies: formValue.useCookies,
      browser: formValue.useCookies ? formValue.browser : null,
      fixAspectRatio: formValue.fixAspectRatio,
      outputDir: formValue.outputDir || undefined,
      fps: 30 // Default FPS
    };

    this.isLoading = true;

    this.apiService.downloadVideo(downloadOptions).subscribe({
      next: (result) => {
        this.isLoading = false;
        if (result.success) {
          this.snackBar.open('Download started!', 'Dismiss', {
            duration: 3000
          });
          this.downloadForm.get('url')?.reset();
          this.urlInfo = null;
        } else {
          this.snackBar.open(`Download error: ${result.error}`, 'Dismiss', {
            duration: 5000
          });
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.snackBar.open(`Server error: ${error.message || 'Unknown error'}`, 'Dismiss', {
          duration: 5000
        });
      }
    });

    // Save settings
    this.settingsService.updateSettings({
      quality: formValue.quality,
      convertToMp4: formValue.convertToMp4,
      useCookies: formValue.useCookies,
      browser: formValue.browser,
      fixAspectRatio: formValue.fixAspectRatio,
      outputDir: formValue.outputDir
    });
  }

  async pasteFromClipboard(): Promise<void> {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText) {
        this.downloadForm.get('url')?.setValue(clipboardText);
      }
    } catch (error) {
      this.snackBar.open('Failed to read from clipboard', 'Dismiss', {
        duration: 3000
      });
    }
  }

  browseOutputDir(): void {
    // This would typically open a file dialog, but we're restricted in web apps
    // In a desktop app using Electron, you could implement a native file picker here
    this.snackBar.open('File picking is not available in the web version', 'Dismiss', {
      duration: 3000
    });
  }
}