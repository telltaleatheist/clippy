// clippy/frontend/src/app/components/settings/settings.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
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

import { SettingsService } from '../../services/settings.service';
import { Settings } from '../../models/settings.model';
import { BROWSER_OPTIONS, QUALITY_OPTIONS } from '../download-form/download-form.constants';

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
    MatOptionModule
  ]
})
export class SettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private settingsService = inject(SettingsService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  settingsForm: FormGroup;
  browserOptions = BROWSER_OPTIONS;
  qualityOptions = QUALITY_OPTIONS;
  themeOptions = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' }
  ];

  constructor() {
    this.settingsForm = this.createForm();
  }

  ngOnInit(): void {
    this.settingsService.getSettings().subscribe(settings => {
      this.updateForm(settings);
    });
  }

  createForm(): FormGroup {
    return this.fb.group({
      outputDir: [''],
      quality: ['720'],
      convertToMp4: [true],
      useCookies: [true],
      fixAspectRatio: [true],
      browser: ['auto'],
      theme: ['light']
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
      theme: settings.theme
    });
  }

  onSubmit(): void {
    if (this.settingsForm.invalid) return;

    this.settingsService.updateSettings(this.settingsForm.value);
    this.snackBar.open('Settings saved', 'Dismiss', { duration: 3000 });
  }

  resetToDefaults(): void {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      this.settingsService.resetSettings();
      this.snackBar.open('Settings reset to defaults', 'Dismiss', { duration: 3000 });
    }
  }

  browseOutputDir(): void {
    this.snackBar.open('File picking is not available in the web version', 'Dismiss', { duration: 3000 });
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}
