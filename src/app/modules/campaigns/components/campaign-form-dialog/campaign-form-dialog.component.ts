import { Component, Inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { MatDialogModule, MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule, MAT_DATE_LOCALE } from '@angular/material/core';
import { MatChipInputEvent } from '@angular/material/chips';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { ClockPickerDialogComponent } from '../../../../shared/components/clock-picker/clock-picker.dialog';
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

const INSTANCE_STATUS_LABELS: Record<string, string> = {
  connected: 'Conectada',
  disconnected: 'Desconectada',
  connecting: 'Conectando',
  qrcoded: 'Código QR',
};

const INSTANCE_STATUS_CLASS: Record<string, string> = {
  connected: 'online',
  connecting: 'pending',
  qrcoded: 'pending',
  disconnected: 'offline',
};

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
    MatButtonToggleModule,
    MatIconModule,
    MatCheckboxModule,
    MatChipsModule,
    MatAutocompleteModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'es-ES' }],
  templateUrl: './campaign-form-dialog.component.html',
  styleUrls: ['./campaign-form-dialog.component.scss'],
})
export class CampaignFormDialogComponent implements OnDestroy {
  form!: FormGroup;
  isEdit = false;
  campaignId: string | null = null;
  submitting = false;
  loading = true;
  loadError = false;
  today = new Date();

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
    private dialog: MatDialog,
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

  get scheduleMode(): string {
    return this.form.get('scheduleMode')?.value || 'now';
  }

  get recurrenceValue(): string {
    return this.form.get('recurrence')?.value || 'none';
  }

  get templateId(): string {
    return this.form.get('templateId')?.value || '';
  }

  get instanceOptions(): Instance[] {
    const currentId = this.form.get('instanceId')?.value;
    return this.instances.filter((i) => i.status === 'connected' || i.id === currentId);
  }

  get selectedInstance(): Instance | null {
    return this.instances.find((i) => i.id === this.form.get('instanceId')?.value) || null;
  }

  get selectedInstanceId(): string {
    return this.form.get('instanceId')?.value || '';
  }

  get visibleGroups(): Group[] {
    const instId = this.selectedInstanceId;
    const list = instId ? this.groups.filter((g) => g.instanceId === instId) : [];
    const selected = (this.form.get('groupIds')?.value || []) as string[];
    const ids = new Set(list.map((g) => g.id));
    for (const id of selected) {
      if (ids.has(id)) continue;
      const g = this.groups.find((x) => x.id === id);
      if (g) {
        list.push(g);
        ids.add(id);
      }
    }
    return list;
  }

  get hasGroupsForInstance(): boolean {
    if (!this.selectedInstanceId) return false;
    return this.groups.some((g) => g.instanceId === this.selectedInstanceId);
  }

  get selectedGroupsInfo(): { count: number; participants: number } {
    const selected = (this.form.get('groupIds')?.value || []) as string[];
    let participants = 0;
    for (const id of selected) {
      const g = this.groups.find((x) => x.id === id);
      participants += g?.participants || 0;
    }
    return { count: selected.length, participants };
  }

  get suggestedTags(): string[] {
    const current = (this.form.get('tags')?.value || []) as string[];
    return this.availableTags.filter((t) => !current.includes(t));
  }

  get suggestedExcludeTags(): string[] {
    const current = (this.form.get('excludeTags')?.value || []) as string[];
    return this.availableTags.filter((t) => !current.includes(t));
  }

  buildForm(campaign?: Campaign): void {
    const scheduled = campaign?.scheduledAt ? new Date(campaign.scheduledAt) : null;
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      instanceId: ['', Validators.required],
      groupIds: [[], Validators.required],
      tags: [[]],
      excludeTags: [[]],
      templateId: [''],
      scheduleMode: [scheduled ? 'scheduled' : 'now'],
      scheduledDate: [scheduled],
      scheduledTime: [scheduled ? this.toTimeString(scheduled) : ''],
      recurrence: ['none'],
      startTime: [''],
      endTime: [''],
      intervalUnit: ['minutes'],
      intervalValue: [1],
      concurrence: [1, [Validators.required, Validators.min(1), Validators.max(20)]],
      active: [true],
    }, { validator: this.validateTimeWindow });

    if (campaign) {
      this.form.patchValue({
        name: campaign.name,
        description: campaign.description,
        instanceId: campaign.instanceId,
        groupIds: campaign.groupIds,
        tags: campaign.tags,
        excludeTags: campaign.excludeTags,
        templateId: campaign.templateId || '',
        recurrence: campaign.recurrence || 'none',
        startTime: campaign.startTime ? campaign.startTime.slice(0, 5) : '',
        endTime: campaign.endTime ? campaign.endTime.slice(0, 5) : '',
        intervalUnit: campaign.intervalUnit || 'minutes',
        intervalValue: campaign.intervalValue || 1,
        concurrence: campaign.concurrence || 1,
        active: campaign.active,
      });
    }
  }

  private toTimeString(value: Date): string {
    const h = String(value.getHours()).padStart(2, '0');
    const m = String(value.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  private parseTime(value: string): [number, number] {
    const [h = 0, m = 0] = value.split(':').map(Number);
    return [isNaN(h) ? 0 : h, isNaN(m) ? 0 : m];
  }

  validateTimeWindow: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
    const recurrence = group.get('recurrence')?.value;
    if (!recurrence || recurrence === 'none') {
      group.get('endTime')?.setErrors(null);
      return null;
    }
    const start = (group.get('startTime')?.value || '') as string;
    const end = (group.get('endTime')?.value || '') as string;
    if (!start || !end) return null;
    if (end <= start) {
      group.get('endTime')?.setErrors({ endBeforeStart: true });
      return { endBeforeStart: true };
    }
    group.get('endTime')?.setErrors(null);
    return null;
  };

  loadData(): void {
    this.loading = true;
    this.loadError = false;
    forkJoin({
      instances: this.instanceService.getAll(),
      groups: this.groupService.getAll(),
      templates: this.templateService.getAll(),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ instances, groups, templates }) => {
          this.instances = instances;
          this.groups = groups;
          this.templates = templates;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
          this.loadError = true;
        },
      });
  }

  instanceStatusLabel(status: string): string {
    return INSTANCE_STATUS_LABELS[status] || status;
  }

  instanceStatusClass(status: string): string {
    return INSTANCE_STATUS_CLASS[status] || 'offline';
  }

  onInstanceChange(): void {
    const instId = this.selectedInstanceId;
    const selected = (this.form.get('groupIds')?.value || []) as string[];
    const allowed = new Set(this.groups.filter((g) => g.instanceId === instId).map((g) => g.id));
    const kept = selected.filter((id) => allowed.has(id) || !instId);
    this.form.get('groupIds')?.setValue(kept);
  }

  onScheduleModeChange(): void {
    if (this.scheduleMode === 'scheduled') {
      if (!this.form.get('scheduledTime')?.value) {
        this.form.get('scheduledTime')?.setValue('09:00');
      }
      if (!this.form.get('scheduledDate')?.value) {
        this.form.get('scheduledDate')?.setValue(new Date());
      }
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Completa los campos obligatorios', 'Cerrar', { duration: 3000 });
      return;
    }

    this.submitting = true;
    const value = this.form.value;

    let scheduledAt: string | undefined;
    if (this.scheduleMode === 'scheduled' && value.scheduledDate) {
      const date = new Date(value.scheduledDate);
      if (value.scheduledTime) {
        const [h, m] = this.parseTime(value.scheduledTime);
        date.setHours(h, m, 0, 0);
      }
      scheduledAt = date.toISOString();
    }

    const isRecurring = this.scheduleMode === 'scheduled' && value.recurrence !== 'none';

    const data: CampaignFormData = {
      name: value.name,
      description: value.description,
      instanceId: value.instanceId,
      groupIds: value.groupIds,
      tags: value.tags,
      excludeTags: value.excludeTags,
      templateId: value.templateId || undefined,
      scheduledAt,
      recurrence: isRecurring ? value.recurrence : 'none',
      startTime: isRecurring ? value.startTime || undefined : undefined,
      endTime: isRecurring ? value.endTime || undefined : undefined,
      intervalUnit: isRecurring && value.recurrence === 'custom' ? value.intervalUnit : undefined,
      intervalValue: isRecurring && value.recurrence === 'custom' ? value.intervalValue : undefined,
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

  clearScheduleDate(): void {
    this.form.get('scheduledDate')?.setValue(null);
  }

  clearScheduleTime(): void {
    this.form.get('scheduledTime')?.setValue('');
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

  openClock(control: string, title: string): void {
    const current = (this.form.get(control)?.value as string) || '';
    const dialogRef = this.dialog.open(ClockPickerDialogComponent, {
      width: '320px',
      data: { time: current, title },
    });
    dialogRef.afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe((result: string | null) => {
        if (result) this.form.get(control)?.setValue(result);
      });
  }
}
