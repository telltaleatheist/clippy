// clippy/frontend/src/app/components/batch-download/batch-download.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { BatchApiService } from '../../services/batch-api.service';
import { SocketService } from '../../services/socket.service';
import { SettingsService } from '../../services/settings.service';
import { BROWSER_OPTIONS, QUALITY_OPTIONS } from '../download-form/download-form.constants';
import { BatchQueueStatus, DownloadOptions } from '../../models/download.model';
import { Settings } from '../../models/settings.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-batch-download',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatProgressBarModule,
    MatListModule,
    MatChipsModule,
    MatDividerModule,
    MatTooltipModule
  ],
  templateUrl: './batch-download.component.html',
  styleUrls: ['./batch-download.component.scss']
})
export class BatchDownloadComponent implements OnInit, OnDestroy {
  batchForm: FormGroup;
  configForm: FormGroup;
  batchQueueStatus: BatchQueueStatus | null = null;
  
  qualityOptions = QUALITY_OPTIONS;
  browserOptions = BROWSER_OPTIONS;
  
  private socketSubscription: Subscription | null = null;
  private settingsSubscription: Subscription | null = null;
  
  constructor(
    private fb: FormBuilder,
    private batchApiService: BatchApiService,
    private socketService: SocketService,
    private settingsService: SettingsService,
    private snackBar: MatSnackBar
  ) {
    this.batchForm = this.createBatchForm();
    this.configForm = this.createConfigForm();
  }

  ngOnInit(): void {
    // Load user settings
    this.settingsSubscription = this.settingsService.getSettings().subscribe((settings: Settings) => {
      this.updateDefaultValues(settings);
    });
    
    // Listen for batch queue updates
    this.socketSubscription = this.socketService.onBatchQueueUpdated().subscribe(
      (status: BatchQueueStatus) => {
        this.batchQueueStatus = status;
      }
    );
    
    // Get initial batch status
    this.refreshBatchStatus();
    
    // Listen for batch completion
    this.socketService.onBatchCompleted().subscribe(() => {
      this.snackBar.open('Batch processing completed!', 'Dismiss', { duration: 5000 });
      this.refreshBatchStatus();
    });
  }

  ngOnDestroy(): void {
    if (this.socketSubscription) {
      this.socketSubscription.unsubscribe();
    }
    
    if (this.settingsSubscription) {
      this.settingsSubscription.unsubscribe();
    }
  }

  createBatchForm(): FormGroup {
    return this.fb.group({
      urls: this.fb.array([this.createUrlField()]),
      quality: ['720'],
      convertToMp4: [true],
      fixAspectRatio: [true],
      useCookies: [false],
      browser: ['auto'],
      outputDir: ['']
    });
  }

  createConfigForm(): FormGroup {
    return this.fb.group({
      maxConcurrentDownloads: [2, [Validators.required, Validators.min(1), Validators.max(10)]],
      enabled: [true]
    });
  }

  createUrlField(): FormGroup {
    return this.fb.group({
      url: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]]
    });
  }

  get urls(): FormArray {
    return this.batchForm.get('urls') as FormArray;
  }

  addUrlField(): void {
    this.urls.push(this.createUrlField());
  }

  removeUrlField(index: number): void {
    if (this.urls.length > 1) {
      this.urls.removeAt(index);
    }
  }

  pasteFromClipboard(index: number): void {
    navigator.clipboard.readText().then(text => {
        const urlGroup = this.urls.controls[index] as FormGroup;
        urlGroup.get('url')?.setValue(text);
    });
  }

  updateDefaultValues(settings: Settings): void {
    this.batchForm.patchValue({
      quality: settings.quality,
      convertToMp4: settings.convertToMp4,
      fixAspectRatio: settings.fixAspectRatio,
      useCookies: false,
      browser: settings.browser,
      outputDir: settings.outputDir
    });
    
    this.configForm.patchValue({
      maxConcurrentDownloads: settings.maxConcurrentDownloads || 2,
      enabled: settings.batchProcessingEnabled !== undefined ? settings.batchProcessingEnabled : true
    });
  }

  onSubmit(): void {
    if (this.batchForm.invalid) {
      this.snackBar.open('Please fill in all required fields correctly', 'Dismiss', { duration: 3000 });
      return;
    }
    
    const urlValues = this.urls.controls.map(control => control.value.url);
    const formValues = this.batchForm.value;
    
    // Create download options for each URL
    const downloadOptions: DownloadOptions[] = urlValues.map(url => ({
      url,
      quality: formValues.quality,
      convertToMp4: formValues.convertToMp4,
      fixAspectRatio: formValues.fixAspectRatio,
      useCookies: formValues.useCookies,
      browser: formValues.browser,
      outputDir: formValues.outputDir
    }));
    
    // Add to batch queue
    this.batchApiService.addMultipleToBatchQueue(downloadOptions).subscribe({
      next: (response) => {
        this.snackBar.open(`Added ${response.jobIds.length} downloads to batch queue`, 'Dismiss', { duration: 3000 });
        this.refreshBatchStatus();
        
        // Reset the form to a single empty URL
        this.batchForm.setControl('urls', this.fb.array([this.createUrlField()]));
      },
      error: (error) => {
        this.snackBar.open('Failed to add downloads to batch queue', 'Dismiss', { duration: 3000 });
        console.error('Error adding to batch queue:', error);
      }
    });
  }

  saveConfig(): void {
    if (this.configForm.invalid) {
      return;
    }
    
    const config = this.configForm.value;
    
    this.batchApiService.updateBatchConfig(config).subscribe({
      next: (response) => {
        this.snackBar.open('Batch configuration updated', 'Dismiss', { duration: 3000 });
        
        // Get current settings and update just the batch fields
        this.settingsService.getSettings().subscribe(currentSettings => {
            const updatedSettings = {
            ...currentSettings,
            maxConcurrentDownloads: config.maxConcurrentDownloads,
            batchProcessingEnabled: config.enabled
            };
            this.settingsService.updateSettings(updatedSettings);
        });

        this.refreshBatchStatus();
      },
      error: (error) => {
        this.snackBar.open('Failed to update batch configuration', 'Dismiss', { duration: 3000 });
        console.error('Error updating batch config:', error);
      }
    });
  }

  clearQueue(): void {
    if (confirm('Are you sure you want to clear the batch queue?')) {
      this.batchApiService.clearBatchQueues().subscribe({
        next: () => {
          this.snackBar.open('Batch queue cleared', 'Dismiss', { duration: 3000 });
          this.refreshBatchStatus();
        },
        error: (error) => {
          this.snackBar.open('Failed to clear batch queue', 'Dismiss', { duration: 3000 });
          console.error('Error clearing batch queue:', error);
        }
      });
    }
  }

  refreshBatchStatus(): void {
    this.batchApiService.getBatchStatus().subscribe({
      next: (status) => {
        this.batchQueueStatus = status;
      },
      error: (error) => {
        console.error('Error getting batch status:', error);
      }
    });
  }

  getStatusChipColor(status: string): string {
    switch (status) {
      case 'queued': return 'primary';
      case 'downloading': return 'accent';
      case 'processing': return 'warn';
      case 'completed': return 'success';
      case 'failed': return 'danger';
      default: return 'default';
    }
  }

  pasteMultipleUrls(): void {
    navigator.clipboard.readText().then(text => {
      // Split by newlines, filter empty lines, and trim whitespace
      const urls = text.split(/\r?\n/)
        .map(url => url.trim())
        .filter(url => url.length > 0 && url.match(/^https?:\/\/.+/));
      
      if (urls.length === 0) {
        this.snackBar.open('No valid URLs found in clipboard', 'Dismiss', { duration: 3000 });
        return;
      }
      
      // Reset the form and add a field for each URL
      const urlsArray = this.fb.array([]);
      
      urls.forEach(url => {
        const group = this.createUrlField();
        group.get('url')?.setValue(url);
        // Use "as any" to bypass the type checking for the push operation
        urlsArray.push(group as any);
      });

      this.batchForm.setControl('urls', urlsArray);
      
      this.snackBar.open(`Added ${urls.length} URLs from clipboard`, 'Dismiss', { duration: 3000 });
    });
  }
}