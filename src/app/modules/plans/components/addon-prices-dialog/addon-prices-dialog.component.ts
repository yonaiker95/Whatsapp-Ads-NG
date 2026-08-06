import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { PlanAddonPrice } from '../../../../core/models/plan.model';
import { PlanService } from '../../../../core/services/plan.service';

@Component({
  selector: 'app-addon-prices-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './addon-prices-dialog.component.html',
  styleUrls: ['./addon-prices-dialog.component.scss'],
})
export class AddonPricesDialogComponent implements OnInit {
  loading = true;
  saving = false;
  addons: PlanAddonPrice[] = [];

  private fb = inject(FormBuilder);
  private planService = inject(PlanService);
  private dialogRef = inject(MatDialogRef<AddonPricesDialogComponent>);
  private snackBar = inject(MatSnackBar);

  form = this.fb.group({
    rows: this.fb.array<ReturnType<FormBuilder['group']>>([]),
  });

  get rows(): FormArray {
    return this.form.get('rows') as FormArray;
  }

  ngOnInit(): void {
    this.planService.getAddonPrices().subscribe({
      next: (addons) => {
        this.addons = addons;
        for (const a of addons) {
          this.rows.push(
            this.fb.group({
              key: a.key,
              label: a.label,
              unitLabel: a.unitLabel,
              unitAmount: [a.unitAmount, [Validators.required, Validators.min(0)]],
            })
          );
        }
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.snackBar.open(err?.error?.error || 'Error al cargar los adicionales', 'Cerrar', { duration: 5000 });
      },
    });
  }

  get hasChanges(): boolean {
    for (let i = 0; i < this.rows.length; i++) {
      const group = this.rows.at(i);
      const original = this.addons[i];
      if ((Number(group.get('unitAmount')?.value) || 0) !== original.unitAmount) return true;
    }
    return false;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Los precios deben ser números mayores o iguales a 0', 'Cerrar', { duration: 4000 });
      return;
    }
    this.saving = true;
    const payload = this.rows.controls.map((group) => ({
      key: group.get('key')?.value,
      unitAmount: Number(group.get('unitAmount')?.value) || 0,
    }));
    this.planService.updateAddonPrices(payload).subscribe({
      next: () => {
        this.saving = false;
        this.snackBar.open('Precios de adicionales actualizados', 'Cerrar', { duration: 4000 });
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.saving = false;
        this.snackBar.open(err?.error?.error || 'Error al guardar los precios', 'Cerrar', { duration: 5000 });
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
