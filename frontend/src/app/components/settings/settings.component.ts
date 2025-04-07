import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { SettingsService } from '../../services/settings.service';
import { Settings } from '../../models/settings.model';
import { BROWSER_OPTIONS, QUALITY_OPTIONS } from '../download-form/download-form.constants';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  settingsForm: FormGroup;
  browserOptions = BROWSER_OPTIONS;
  qualityOptions = QUALITY_OPTIONS;
  themeOptions = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' }
  ];
  
  constructor(
    private fb: FormBuilder,
    private settingsService: SettingsService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {
    this.settingsForm = this.createForm();
  }

  ngOnInit(): void {
    // Load current settings
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
    if (this.settingsForm.invalid) {
      return;
    }

    const formValue = this.settingsForm.value;
    this.settingsService.updateSettings(formValue);
    
    this.snackBar.open('Settings saved', 'Dismiss', {
      duration: 3000
    });
  }

  resetToDefaults(): void {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      this.settingsService.resetSettings();
      this.snackBar.open('Settings reset to defaults', 'Dismiss', {
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

  goBack(): void {
    this.router.navigate(['/']);
  }
}