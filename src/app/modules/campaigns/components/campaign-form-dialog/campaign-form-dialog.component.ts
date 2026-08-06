import { Component, Inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Subject, takeUntil } from 'rxjs';
import { MatChipInputEvent } from '@angular/material/chips';
import { CampaignService } from '../../../../core/services/campaign.service';
import { InstanceService } from '../../../../core/services/instance.service';
import { GroupService } from '../../../../core/services/group.service';
import { TemplateService } from '../../../../core/services/template.service';
import { Campaign, CampaignFormData } from '../../../../core/models/campaign.model';
import { Instance } from '../../../../core/models/instance.model';
import { Group } from '../../../../core/models/group.model';
import { Template } from '../../../../core/models/template.model';

export interface CampaignDialogData {
  mode: 'create' | 'edit';
  campaign?: Campaign;
}

@Component({
  selector: 'app-campaign-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatChipsModule,
    MatAutocompleteModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './campaign-form-dialog.component.html',
  styleUrls: ['./campaign-form-dialog.component.scss'],
})
export class CampaignFormDialogComponent implements OnDestroy {
  form!: FormGroup;
  isEdit = false;
  campaignId: string | null = null;
  submitting = false;

  instances: Instance[] = [];
  groups: Group[] = [];
  templates: Template[] = [];

  private destroy$ = new Subject<void>();

  recurrenceOptions = [
    { value: 'none', label: 'Sin recurrencia' },
    { value: 'daily', label: 'Diaria' },
    { value: 'weekly', label: 'Semanal' },
    { value: 'monthly', label: 'Mensual' },
    { value: 'custom', label: 'Personalizada' },
  ];

  intervalUnitOptions = [
    { value: 'minutes', label: 'Minutos' },
    { value: 'hours', label: 'Horas' },
    { value: 'days', label: 'Días' },
  ];

  availableTags = ['marketing', 'promocion', 'newsletter', 'urgente', 'vip', 'nuevos', 'recuperacion'];

  constructor(
    @Inject(MAT_DIALOG_DATA) data: CampaignDialogData,
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CampaignFormDialogComponent>,
    private campaignService: CampaignService,
    private instanceService: InstanceService,
    private groupService: GroupService,
    private templateService: TemplateService,
    private snackBar: MatSnackBar
  ) {
    this.isEdit = data.mode === 'edit';
    this.campaignId = data.campaign?.id || null;
    this.buildForm(data.campaign);
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get title(): string {
    return this.isEdit ? 'Editar campaña' : 'Nueva campaña';
  }

  get subtitle(): string {
    return this.isEdit ? 'Modifica los detalles de la campaña' : 'Crea una nueva campaña de WhatsApp';
  }

  get saveLabel(): string {
    return this.submitting ? 'Guardando...' : this.isEdit ? 'Actualizar' : 'Crear';
  }

  buildForm(campaign?: Campaign): void {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      instanceId: ['', Validators.required],
      groupIds: [[], Validators.required],
      tags: [[]],
      excludeTags: [[]],
      templateId: [''],
      scheduledAt: [''],
      recurrence: ['none'],
      startTime: [''],
      endTime: [''],
      intervalUnit: ['minutes'],
      intervalValue: [1],
      concurrence: [1],
      active: [true],
    });

    if (campaign) {
      this.form.patchValue({
        name: campaign.name,
        description: campaign.description,
        instanceId: campaign.instanceId,
        groupIds: campaign.groupIds,
        tags: campaign.tags,
        excludeTags: campaign.excludeTags,
        templateId: campaign.templateId || '',
        scheduledAt: campaign.scheduledAt ? new Date(campaign.scheduledAt).toISOString().slice(0, 16) : '',
        recurrence: campaign.recurrence || 'none',
        startTime: campaign.startTime,
        endTime: campaign.endTime,
        intervalUnit: campaign.intervalUnit || 'minutes',
        intervalValue: campaign.intervalValue || 1,
        concurrence: campaign.concurrence || 1,
        active: campaign.active,
      });
    }
  }

  loadData(): void {
    this.instanceService.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe((instances) => {
        this.instances = instances.filter((i) => i.status === 'connected');
      });

    this.groupService.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe((groups) => {
        this.groups = groups;
      });

    this.templateService.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe((templates) => {
        this.templates = templates;
      });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Completa los campos obligatorios', 'Cerrar', { duration: 3000 });
      return;
    }

    this.submitting = true;
    const value = this.form.value;

    const data: CampaignFormData = {
      name: value.name,
      description: value.description,
      instanceId: value.instanceId,
      groupIds: value.groupIds,
      tags: value.tags,
      excludeTags: value.excludeTags,
      templateId: value.templateId || undefined,
      scheduledAt: value.scheduledAt ? new Date(value.scheduledAt).toISOString() : undefined,
      recurrence: value.recurrence,
      startTime: value.startTime || undefined,
      endTime: value.endTime || undefined,
      intervalUnit: value.intervalUnit,
      intervalValue: value.intervalValue,
      concurrence: value.concurrence,
      active: value.active,
    };

    const request = this.isEdit && this.campaignId
      ? this.campaignService.update(this.campaignId, data)
      : this.campaignService.create(data);

    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.submitting = false;
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.submitting = false;
        this.snackBar.open(err?.error?.error || 'Error al guardar la campaña', 'Cerrar', { duration: 5000 });
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  addTag(event: MatChipInputEvent, type: 'tags' | 'excludeTags'): void {
    const value = (event.value || '').trim();
    if (value) {
      const current = this.form.get(type)?.value || [];
      this.form.get(type)?.setValue([...current, value]);
    }
    event.chipInput!.clear();
  }

  removeTag(tag: string, type: 'tags' | 'excludeTags'): void {
    const current = this.form.get(type)?.value || [];
    this.form.get(type)?.setValue(current.filter((t: string) => t !== tag));
  }
}
