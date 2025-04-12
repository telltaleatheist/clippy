// clippy/frontend/src/app/components/settings/settings.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';

import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { SettingsService } from '../../services/settings.service';
import { PathService } from '../../services/path.service';
import { Settings } from '../../models/settings.model';
import { BROWSER_OPTIONS, QUALITY_OPTIONS } from '../download-form/download-form.constants';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatSnackBarModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatButtonModule,
    MatOptionModule,
    MatTooltipModule,
    MatProgressSpinnerModule
  ]
})
export class SettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private settingsService = inject(SettingsService);
  private pathService = inject(PathService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  settingsForm: FormGroup;
  browserOptions = BROWSER_OPTIONS;
  qualityOptions = QUALITY_OPTIONS;
  themeOptions = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' }
  ];
  
  isValidatingPath = false;
  isElectron = false;

  constructor() {
    this.settingsForm = this.createForm();
    // Check if we're running in Electron
    this.isElectron = !!(window as any).electron;
  }

  ngOnInit(): void {
    this.settingsService.getSettings().subscribe(settings => {
      this.updateForm(settings);
      
      // If outputDir is empty, get the default from the backend
      if (!settings.outputDir) {
        this.getDefaultPath();
      }
    });
  }

  createForm(): FormGroup {
    return this.fb.group({
      outputDir: [''],
      quality: ['720'],
      convertToMp4: [true],
      useCookies: [false],
      fixAspectRatio: [true],
      browser: ['auto'],
      theme: ['light'],
      // Batch processing settings
      batchProcessingEnabled: [true],
      maxConcurrentDownloads: [2, [Validators.required, Validators.min(1), Validators.max(10)]]
    });
  }

  updateForm(settings: Settings): void {
    this.settingsForm.patchValue({
      outputDir: settings.outputDir,
      quality: settings.quality,
      convertToMp4: settings.convertToMp4,
      useCookies: settings.useCookies,
      fixAspectRatio: settings.fixAspectRatio,
      browser: settings.browser,
      theme: settings.theme,
      // Batch processing settings
      batchProcessingEnabled: settings.batchProcessingEnabled !== undefined ? settings.batchProcessingEnabled : true,
      maxConcurrentDownloads: settings.maxConcurrentDownloads || 2
    });
  }

  onSubmit(): void {
    if (this.settingsForm.invalid) return;
    
    // Validate the path before saving
    const outputDir = this.settingsForm.get('outputDir')?.value;
    if (outputDir) {
      this.validatePath(outputDir, true);
    } else {
      // No path specified, fallback to default
      this.getDefaultPath(true);
    }
  }

  resetToDefaults(): void {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      this.settingsService.resetSettings();
      // Get the default path from the backend
      this.getDefaultPath();
      this.snackBar.open('Settings reset to defaults', 'Dismiss', { duration: 3000 });
    }
  }

  browseOutputDir(): void {
    if (this.isElectron) {
      this.pathService.openDirectoryPicker().subscribe({
        next: (path) => {
          if (path) {
            this.settingsForm.patchValue({ outputDir: path });
            this.validatePath(path);
          }
        },
        error: (error) => {
          console.error('Error picking directory:', error);
          this.snackBar.open('Error selecting directory', 'Dismiss', { duration: 3000 });
        }
      });
    } else {
      this.snackBar.open('Directory selection is not available in the web version', 'Dismiss', { duration: 3000 });
    }
  }

  getDefaultPath(saveAfter = false): void {
    this.pathService.getDefaultPath().subscribe({
      next: (response) => {
        if (response.success) {
          this.settingsForm.patchValue({ outputDir: response.path });
          if (saveAfter) {
            this.saveSettings();
          }
        }
      },
      error: (error) => {
        console.error('Error getting default path:', error);
        this.snackBar.open('Error getting default download path', 'Dismiss', { duration: 3000 });
      }
    });
  }

  validatePath(path: string, saveAfter = false): void {
    this.isValidatingPath = true;
    
    this.pathService.validatePath(path)
      .pipe(finalize(() => this.isValidatingPath = false))
      .subscribe({
        next: (result) => {
          if (result.success) {
            if (result.isValid) {
              if (saveAfter) {
                this.saveSettings();
              } else {
                this.snackBar.open('Directory is valid and writable', 'Dismiss', { duration: 3000 });
              }
            } else {
              this.snackBar.open('Directory is not writable. Please choose another location.', 'Dismiss', { duration: 5000 });
            }
          }
        },
        error: (error) => {
          console.error('Error validating path:', error);
          this.snackBar.open('Error validating directory', 'Dismiss', { duration: 3000 });
        }
      });
  }

  saveSettings(): void {
    this.settingsService.updateSettings(this.settingsForm.value);
    this.snackBar.open('Settings saved', 'Dismiss', { duration: 3000 });
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}