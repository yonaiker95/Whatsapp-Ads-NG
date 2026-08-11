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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
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
    MatProgressSpinnerModule,
  ],
  templateUrl: './plan-form-dialog.component.html',
  styleUrls: ['./plan-form-dialog.component.scss'],
})
export class PlanFormDialogComponent {
  form: FormGroup;
  isEdit = false;
  planId: string | null = null;
  submitting = false;
  previewCycle: 'monthly' | 'yearly' = 'monthly';
  slugManuallyEdited = false;

  colorPresets = ['#25D366', '#075E54', '#6c63ff', '#06b6d4', '#f59e0b', '#ef4444', '#6b7280'];

  limitFields = [
    { key: 'maxInstances', label: 'Instancias máximas', icon: 'smartphone', default: 5 },
    { key: 'maxMessages', label: 'Mensajes por mes', icon: 'chat', default: 50000 },
    { key: 'maxCampaigns', label: 'Campañas activas', icon: 'campaign', default: 10 },
    { key: 'maxGroups', label: 'Grupos', icon: 'groups', default: 500 },
    { key: 'maxAutoReplies', label: 'Auto-respuestas', icon: 'reply', default: 20 },
  ];

  private prevLimits: Record<string, number> = {};

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
      color: ['#25D366', [Validators.pattern(/^#[0-9a-fA-F]{6}$/)]],
      isActive: [true],
      sortOrder: [0],
      maxInstances: [5, [Validators.required, Validators.min(0)]],
      maxMessages: [50000, [Validators.required, Validators.min(0)]],
      maxCampaigns: [10, [Validators.required, Validators.min(0)]],
      maxGroups: [500, [Validators.required, Validators.min(0)]],
      maxAutoReplies: [20, [Validators.required, Validators.min(0)]],
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
      this.slugManuallyEdited = !!data.plan.slug;
    }

    this.setupUnlimitedStates();
    this.setupSlugSync();
  }

  get title(): string {
    return this.isEdit ? 'Editar plan' : 'Nuevo plan';
  }

  get subtitle(): string {
    return this.isEdit ? 'Ajusta los detalles del plan' : 'Configura un nuevo plan de precios';
  }

  get saveLabel(): string {
    return this.isEdit ? 'Actualizar' : 'Crear';
  }

  get nameValue(): string {
    return this.form.get('name')?.value || '';
  }

  get descriptionValue(): string {
    return this.form.get('description')?.value || '';
  }

  get ctaValue(): string {
    return this.form.get('cta')?.value || '';
  }

  get colorValue(): string {
    const c = this.form.get('color')?.value;
    return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#25D366';
  }

  get priceMonthly(): number {
    return Number(this.form.get('priceMonthly')?.value) || 0;
  }

  get priceYearly(): number {
    return Number(this.form.get('priceYearly')?.value) || 0;
  }

  get previewPrice(): number {
    return this.previewCycle === 'yearly' ? this.priceYearly : this.priceMonthly;
  }

  get previewSavings(): number | null {
    const m = this.priceMonthly;
    const y = this.priceYearly;
    if (m > 0 && y > 0 && y < m) return Math.round((1 - y / m) * 100);
    return null;
  }

  get previewFeatures(): string[] {
    const feats = this.form.get('features')?.value || [];
    const shown = feats.slice(0, 5);
    const extra = feats.length - 5;
    if (extra > 0) return [...shown, `+ ${extra} características más`];
    return shown;
  }

  togglePreviewCycle(): void {
    this.previewCycle = this.previewCycle === 'monthly' ? 'yearly' : 'monthly';
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Revisa los campos marcados en rojo', 'Cerrar', { duration: 3000 });
      return;
    }
    this.submitting = true;
    const value = this.form.getRawValue();
    const num = (v: any) => (v === null || v === undefined || v === '' ? 0 : Number(v));
    const data = {
      name: value.name,
      slug: value.slug?.trim() || this.slugify(value.name) || undefined,
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

  resetToDefaults(): void {
    this.previewCycle = 'monthly';
    this.form.patchValue({
      name: '',
      slug: '',
      description: '',
      priceMonthly: 0,
      priceYearly: 0,
      features: [],
      cta: 'Empezar',
      popular: false,
      color: '#25D366',
      isActive: true,
      sortOrder: 0,
      chatbotEnabled: false,
      aiQuota: 0,
    });
    for (const f of this.limitFields) {
      this.form.get(f.key)?.enable({ emitEvent: false });
      this.form.get(f.key)?.setValue(f.default, { emitEvent: false });
    }
    this.slugManuallyEdited = false;
    this.setupUnlimitedStates();
  }

  toggleUnlimited(key: string, checked: boolean): void {
    const ctrl = this.form.get(key);
    if (!ctrl) return;
    const field = this.limitFields.find((f) => f.key === key);
    if (checked) {
      const cur = Number(ctrl.value) || 0;
      if (cur > 0) this.prevLimits[key] = cur;
      ctrl.setValue(0, { emitEvent: false });
      ctrl.disable({ emitEvent: false });
    } else {
      ctrl.enable({ emitEvent: false });
      ctrl.setValue(this.prevLimits[key] ?? field?.default ?? 0, { emitEvent: false });
    }
  }

  isUnlimited(key: string): boolean {
    const v = this.form.get(key)?.value;
    return v === 0 || v === '0';
  }

  onColorPick(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    if (v) this.form.get('color')?.setValue(v);
  }

  previewTextColor(): string {
    const color = this.colorValue;
    const h = color.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.179 ? '#052e1f' : '#ffffff';
  }

  private setupUnlimitedStates(): void {
    for (const f of this.limitFields) {
      const ctrl = this.form.get(f.key);
      if (!ctrl) continue;
      const v = Number(ctrl.value) || 0;
      if (v === 0) {
        this.prevLimits[f.key] = f.default;
        ctrl.disable({ emitEvent: false });
      } else {
        this.prevLimits[f.key] = v;
      }
    }
  }

  private setupSlugSync(): void {
    this.form.get('name')?.valueChanges.subscribe((name: string) => {
      if (!this.slugManuallyEdited) {
        this.form.get('slug')?.setValue(this.slugify(name || ''), { emitEvent: false });
      }
    });
  }

  private slugify(s: string): string {
    return String(s || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
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
