import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { InstanceService } from '../../../../core/services/instance.service';
import { Instance, InstanceFormData, VERIFICATION_ROLE_LABELS } from '../../../../core/models/instance.model';

export interface InstanceFormDialogData {
  mode: 'create' | 'edit';
  instance?: Instance;
}

@Component({
  selector: 'app-instance-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="dialog-icon">phone_android</mat-icon>
      {{ title }}
    </h2>
    <mat-dialog-content>
      <p class="dialog-subtitle">
        {{ isEdit ? 'Modifica los datos de la instancia' : 'Crea una nueva conexión a WhatsApp Business' }}
      </p>

      <form [formGroup]="form" (ngSubmit)="onSubmit()" id="instance-form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Nombre *</mat-label>
          <input matInput formControlName="name" placeholder="Ej: Mi WhatsApp Business" autocomplete="off">
          <mat-error *ngIf="form.get('name')?.hasError('required')">El nombre es requerido</mat-error>
          <mat-error *ngIf="form.get('name')?.hasError('minlength')">Mínimo 3 caracteres</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Envíos de verificación</mat-label>
          <mat-select formControlName="verificationRole">
            @for (option of verificationRoles; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
          <mat-hint>Para qué códigos se usará esta instancia (OTP, recuperar contraseña, etc.).</mat-hint>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [disabled]="submitting" (click)="close()">Cancelar</button>
      <button mat-raised-button color="primary" type="submit" form="instance-form" [disabled]="submitting">
        @if (submitting) {
          <mat-spinner diameter="18"></mat-spinner>
        } @else {
          <mat-icon>{{ isEdit ? 'save' : 'add' }}</mat-icon>
        }
        {{ isEdit ? 'Guardar cambios' : 'Crear instancia' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-icon { margin-right: 8px; color: #2563eb; vertical-align: middle; }
    .dialog-subtitle { margin: -4px 0 16px; color: #6b7280; font-size: 14px; }
    mat-dialog-content { display: flex; flex-direction: column; min-width: 340px; overflow: hidden; }
    .full-width { width: 100%; }
    mat-dialog-actions { gap: 8px; padding: 12px 24px 20px; margin: 0; }
    mat-dialog-actions mat-spinner { display: inline-block; }
  `],
})
export class InstanceFormDialogComponent implements OnInit {
  form!: FormGroup;
  submitting = false;
  readonly isEdit: boolean;
  readonly verificationRoles = [
    { value: 'otp', label: VERIFICATION_ROLE_LABELS['otp'] },
    { value: 'password', label: VERIFICATION_ROLE_LABELS['password'] },
    { value: 'other', label: VERIFICATION_ROLE_LABELS['other'] },
    { value: 'all', label: VERIFICATION_ROLE_LABELS['all'] },
  ];

  constructor(
    public dialogRef: MatDialogRef<InstanceFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: InstanceFormDialogData,
    private fb: FormBuilder,
    private instanceService: InstanceService
  ) {
    this.isEdit = data.mode === 'edit';
  }

  ngOnInit(): void {
    this.buildForm();
    if (this.isEdit && this.data.instance) {
      this.form.patchValue({
        name: this.data.instance.name,
        verificationRole: this.data.instance.verificationRole || 'all',
      });
    }
  }

  get title(): string {
    return this.isEdit ? 'Editar instancia' : 'Nueva instancia';
  }

  close(): void {
    this.dialogRef.close();
  }

  buildForm(): void {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      verificationRole: ['all', [Validators.required]],
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;
    const data: InstanceFormData = this.form.value;

    const request = this.isEdit && this.data.instance
      ? this.instanceService.update(this.data.instance.id, data)
      : this.instanceService.create(data);

    request.subscribe({
      next: (instance) => {
        this.submitting = false;
        this.dialogRef.close(instance);
      },
      error: () => {
        this.submitting = false;
      },
    });
  }
}
