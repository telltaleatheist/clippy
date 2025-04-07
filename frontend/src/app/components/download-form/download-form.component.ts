import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../services/api.service';
import { SettingsService } from '../../services/settings.service';
import { Settings } from '../../models/settings.model';
import { DownloadOptions, VideoInfo } from '../../models/download.model';
import { BROWSER_OPTIONS, QUALITY_OPTIONS } from './download-form.constants';

import { debounceTime, distinctUntilChanged, switchMap, catchError, of } from 'rxjs';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-download-form',
  standalone: true,
  templateUrl: './download-form.component.html',
  styleUrls: ['./download-form.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatIconModule,
    MatButtonModule,
    MatOptionModule,
    MatCardModule
  ]
})
export class DownloadFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private apiService = inject(ApiService);
  private settingsService = inject(SettingsService);
  private snackBar = inject(MatSnackBar);

  downloadForm: FormGroup;
  advancedOptionsExpanded = false;
  isLoading = false;
  browserOptions = BROWSER_OPTIONS;
  qualityOptions = QUALITY_OPTIONS;
  urlInfo: VideoInfo | null = null;
  isValidUrl = false;
  isCheckingUrl = false;

  constructor() {
    this.downloadForm = this.createForm();
  }

  ngOnInit(): void {
    this.settingsService.getSettings().subscribe(settings => {
      this.updateFormWithSettings(settings);
    });

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
    if (this.downloadForm.invalid) return;

    const formValue = this.downloadForm.value;
    const downloadOptions: DownloadOptions = {
      url: formValue.url,
      quality: formValue.quality,
      convertToMp4: formValue.convertToMp4,
      useCookies: formValue.useCookies,
      browser: formValue.useCookies ? formValue.browser : null,
      fixAspectRatio: formValue.fixAspectRatio,
      outputDir: formValue.outputDir || undefined,
      fps: 30
    };

    this.isLoading = true;

    this.apiService.downloadVideo(downloadOptions).subscribe({
      next: (result) => {
        this.isLoading = false;
        if (result.success) {
          this.snackBar.open('Download started!', 'Dismiss', { duration: 3000 });
          this.downloadForm.get('url')?.reset();
          this.urlInfo = null;
        } else {
          this.snackBar.open(`Download error: ${result.error}`, 'Dismiss', { duration: 5000 });
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.snackBar.open(`Server error: ${error.message || 'Unknown error'}`, 'Dismiss', { duration: 5000 });
      }
    });

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
    } catch {
      this.snackBar.open('Failed to read from clipboard', 'Dismiss', { duration: 3000 });
    }
  }

  browseOutputDir(): void {
    this.snackBar.open('File picking is not available in the web version', 'Dismiss', { duration: 3000 });
  }
}
