import { Component, Inject, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
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
import { MatChipInputEvent } from '@angular/material/chips';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { CampaignService } from '../../../../core/services/campaign.service';
import { InstanceService } from '../../../../core/services/instance.service';
import { GroupService } from '../../../../core/services/group.service';
import { TemplateService } from '../../../../core/services/template.service';
import { Campaign, CampaignFormData } from '../../../../core/models/campaign.model';
import { Instance } from '../../../../core/models/instance.model';
import { Group } from '../../../../core/models/group.model';
import { Template } from '../../../../core/models/template.model';

const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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
  ],
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

  instances: Instance[] = [];
  groups: Group[] = [];
  templates: Template[] = [];

  private destroy$ = new Subject<void>();

  @ViewChild('tagChipInput') tagChipInput!: ElementRef<HTMLInputElement>;
  @ViewChild('excludeTagChipInput') excludeTagChipInput!: ElementRef<HTMLInputElement>;

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
    const now = new Date();
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      instanceId: ['', Validators.required],
      groupIds: [[], Validators.required],
      tags: [[]],
      excludeTags: [[]],
      templateId: [''],
      scheduleMode: [scheduled ? 'scheduled' : 'now'],
      scheduledDate: [scheduled ? this.toDateString(scheduled) : this.toDateString(now), [Validators.pattern(DATE_RE)]],
      scheduledTime: [scheduled ? this.toTimeString(scheduled) : this.toTimeString(now), [Validators.pattern(TIME_RE)]],
      recurrence: ['none'],
      startTime: ['', [Validators.pattern(TIME_RE)]],
      endTime: ['', [Validators.pattern(TIME_RE)]],
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
        startTime: campaign.startTime || '',
        endTime: campaign.endTime || '',
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

  private toDateString(value: Date): string {
    const d = String(value.getDate()).padStart(2, '0');
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const y = value.getFullYear();
    return `${d}/${m}/${y}`;
  }

  private parseDateInput(value: string): Date | null {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
    if (!match) return null;
    const d = Number(match[1]);
    const mo = Number(match[2]);
    const y = Number(match[3]);
    const date = new Date(y, mo - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
    return date;
  }

  private parseTime(value: string): [number, number] {
    const [h = 0, m = 0] = value.split(':').map(Number);
    return [isNaN(h) ? 0 : h, isNaN(m) ? 0 : m];
  }

  onScheduledDateInput(): void {
    const raw = ((this.form.get('scheduledDate')?.value || '') as string).replace(/[^\d]/g, '').slice(0, 8);
    let out = raw;
    if (raw.length > 4) out = `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}`;
    else if (raw.length > 2) out = `${raw.slice(0, 2)}/${raw.slice(2)}`;
    this.form.get('scheduledDate')?.setValue(out, { emitEvent: false });
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
      const now = new Date();
      if (!this.form.get('scheduledTime')?.value) {
        this.form.get('scheduledTime')?.setValue(this.toTimeString(now));
      }
      if (!this.form.get('scheduledDate')?.value) {
        this.form.get('scheduledDate')?.setValue(this.toDateString(now));
      }
    }
  }

  save(): void {
    const value = this.form.value;

    let scheduledAt: string | undefined;
    if (this.scheduleMode === 'scheduled') {
      const dateStr = String(value.scheduledDate || '').trim();
      const timeStr = String(value.scheduledTime || '').trim();
      if (!DATE_RE.test(dateStr) || !this.parseDateInput(dateStr)) {
        this.form.get('scheduledDate')?.markAsTouched();
        this.snackBar.open('Ingresa una fecha válida (DD/MM/AAAA)', 'Cerrar', { duration: 4000 });
        return;
      }
      if (!TIME_RE.test(timeStr)) {
        this.form.get('scheduledTime')?.markAsTouched();
        this.snackBar.open('Ingresa una hora válida (HH:MM)', 'Cerrar', { duration: 4000 });
        return;
      }
      const date = this.parseDateInput(dateStr)!;
      const [h, m] = this.parseTime(timeStr);
      date.setHours(h, m, 0, 0);
      scheduledAt = date.toISOString();
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Completa los campos obligatorios', 'Cerrar', { duration: 3000 });
      return;
    }

    this.submitting = true;

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

  onTagOptionSelected(event: MatAutocompleteSelectedEvent, type: 'tags' | 'excludeTags'): void {
    const value = (event.option.viewValue || '').trim();
    if (value) {
      const current = this.form.get(type)?.value || [];
      if (!current.includes(value)) {
        this.form.get(type)?.setValue([...current, value]);
      }
    }
    event.option.deselect();
    const input = type === 'tags' ? this.tagChipInput : this.excludeTagChipInput;
    if (input?.nativeElement) input.nativeElement.value = '';
  }

  removeTag(tag: string, type: 'tags' | 'excludeTags'): void {
    const current = this.form.get(type)?.value || [];
    this.form.get(type)?.setValue(current.filter((t: string) => t !== tag));
  }
}
