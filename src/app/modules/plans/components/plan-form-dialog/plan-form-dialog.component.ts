import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatChipInputEvent } from '@angular/material/chips';
import { Plan } from '../../../../core/models/plan.model';
import { PlanService } from '../../../../core/services/plan.service';

export interface PlanDialogData {
  mode: 'create' | 'edit';
  plan?: Plan;
}

@Component({
  selector: 'app-plan-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatChipsModule,
    MatSlideToggleModule,
    MatSnackBarModule,
  ],
  templateUrl: './plan-form-dialog.component.html',
  styleUrls: ['./plan-form-dialog.component.scss'],
})
export class PlanFormDialogComponent {
  form: FormGroup;
  isEdit = false;
  planId: string | null = null;
  submitting = false;

  colorPresets = ['#25D366', '#075E54', '#6c63ff', '#06b6d4', '#f59e0b', '#ef4444', '#6b7280'];

  constructor(
    @Inject(MAT_DIALOG_DATA) data: PlanDialogData,
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<PlanFormDialogComponent>,
    private planService: PlanService,
    private snackBar: MatSnackBar
  ) {
    this.isEdit = data.mode === 'edit';
    this.planId = data.plan?.id || null;
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      slug: [''],
      description: [''],
      priceMonthly: [0, [Validators.required, Validators.min(0)]],
      priceYearly: [0, [Validators.required, Validators.min(0)]],
      features: [[]],
      cta: ['Empezar'],
      popular: [false],
      color: ['#25D366'],
      isActive: [true],
      sortOrder: [0],
      maxInstances: [0, [Validators.required, Validators.min(0)]],
      maxMessages: [0, [Validators.required, Validators.min(0)]],
      maxCampaigns: [0, [Validators.required, Validators.min(0)]],
      maxGroups: [0, [Validators.required, Validators.min(0)]],
      maxAutoReplies: [0, [Validators.required, Validators.min(0)]],
      chatbotEnabled: [false],
      aiQuota: [0, [Validators.required, Validators.min(0)]],
    });

    if (data.plan) {
      this.form.patchValue({
        name: data.plan.name,
        slug: data.plan.slug || '',
        description: data.plan.description,
        priceMonthly: data.plan.priceMonthly,
        priceYearly: data.plan.priceYearly,
        features: data.plan.features,
        cta: data.plan.cta,
        popular: data.plan.popular,
        color: data.plan.color,
        isActive: data.plan.isActive,
        sortOrder: data.plan.sortOrder,
        maxInstances: data.plan.maxInstances ?? 0,
        maxMessages: data.plan.maxMessages ?? 0,
        maxCampaigns: data.plan.maxCampaigns ?? 0,
        maxGroups: data.plan.maxGroups ?? 0,
        maxAutoReplies: data.plan.maxAutoReplies ?? 0,
        chatbotEnabled: data.plan.chatbotEnabled ?? false,
        aiQuota: data.plan.aiQuota ?? 0,
      });
    }
  }

  get title(): string {
    return this.isEdit ? 'Editar plan' : 'Nuevo plan';
  }

  get saveLabel(): string {
    return this.submitting ? 'Guardando...' : this.isEdit ? 'Actualizar' : 'Crear';
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Completa los campos obligatorios', 'Cerrar', { duration: 3000 });
      return;
    }
    this.submitting = true;
    const value = this.form.value;
    const num = (v: any) => (v === null || v === undefined || v === '' ? 0 : Number(v));
    const data = {
      name: value.name,
      slug: value.slug || undefined,
      description: value.description,
      priceMonthly: value.priceMonthly === null ? 0 : value.priceMonthly,
      priceYearly: value.priceYearly === null ? 0 : value.priceYearly,
      features: value.features,
      cta: value.cta,
      popular: !!value.popular,
      color: value.color,
      isActive: value.isActive,
      sortOrder: value.sortOrder === null ? 0 : value.sortOrder,
      maxInstances: num(value.maxInstances),
      maxMessages: num(value.maxMessages),
      maxCampaigns: num(value.maxCampaigns),
      maxGroups: num(value.maxGroups),
      maxAutoReplies: num(value.maxAutoReplies),
      chatbotEnabled: !!value.chatbotEnabled,
      aiQuota: num(value.aiQuota),
    };
    const request = this.isEdit && this.planId
      ? this.planService.updatePlan(this.planId, data)
      : this.planService.createPlan(data);
    request.subscribe({
      next: () => {
        this.submitting = false;
        this.dialogRef.close(true);
      },
      error: (err: any) => {
        this.submitting = false;
        this.snackBar.open(err?.error?.error || 'Error al guardar el plan', 'Cerrar', { duration: 5000 });
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  addFeature(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value) {
      const current = this.form.get('features')?.value || [];
      this.form.get('features')?.setValue([...current, value]);
    }
    event.chipInput!.clear();
  }

  removeFeature(feature: string): void {
    const current = this.form.get('features')?.value || [];
    this.form.get('features')?.setValue(current.filter((f: string) => f !== feature));
  }
}
