// clippy/frontend/src/app/material.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DatePipe } from '@angular/common';

// Material Imports
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';

const MATERIAL_MODULES = [
  MatCardModule,
  MatButtonModule,
  MatIconModule,
  MatFormFieldModule,
  MatInputModule,
  MatSelectModule,
  MatCheckboxModule,
  MatProgressBarModule,
  MatProgressSpinnerModule,
  MatExpansionModule
];

@NgModule({
  imports: [
    CommonModule,
    ...MATERIAL_MODULES
  ],
  exports: [
    ...MATERIAL_MODULES
  ],
  providers: [
    DatePipe
  ]
})
export class MaterialModule { }