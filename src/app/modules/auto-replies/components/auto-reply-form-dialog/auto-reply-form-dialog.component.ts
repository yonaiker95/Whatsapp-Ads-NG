import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { AutoReplyService } from '../../../../core/services/auto-reply.service';
import { InstanceService } from '../../../../core/services/instance.service';
import { AutoReplyFormData } from '../../../../core/models/auto-reply.model';
import { Instance } from '../../../../core/models/instance.model';

export interface AutoReplyDialogData {
  formData: AutoReplyFormData;
  id?: string;
}

@Component({
  selector: 'app-auto-reply-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatCheckboxModule, MatProgressSpinnerModule, MatSnackBarModule,
  ],
  templateUrl: './auto-reply-form-dialog.component.html',
  styleUrls: ['./auto-reply-form-dialog.component.scss'],
})
export class AutoReplyFormDialogComponent {
  formData: AutoReplyFormData;
  id?: string;
  instances: Instance[] = [];
  saving = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: AutoReplyDialogData,
    private dialogRef: MatDialogRef<AutoReplyFormDialogComponent>,
    private autoReplyService: AutoReplyService,
    private instanceService: InstanceService,
    private snackBar: MatSnackBar
  ) {
    this.formData = { ...data.formData };
    this.id = data.id;
    this.loadInstances();
  }

  loadInstances(): void {
    this.instanceService.getAll().subscribe((instances) => {
      this.instances = instances;
      if (!this.formData.instanceId && instances.length > 0) {
        this.formData.instanceId = instances[0].id;
      }
    });
  }

  save(): void {
    if (!this.formData.instanceId) {
      this.snackBar.open('Selecciona una instancia', 'Cerrar', { duration: 3000 });
      return;
    }
    if (!this.formData.trigger.trim()) {
      this.snackBar.open('La palabra clave es requerida', 'Cerrar', { duration: 3000 });
      return;
    }
    if (!this.formData.useAi && !this.formData.response.trim()) {
      this.snackBar.open('La respuesta es requerida', 'Cerrar', { duration: 3000 });
      return;
    }
    this.saving = true;
    const request = this.id
      ? this.autoReplyService.update(this.id, this.formData)
      : this.autoReplyService.create(this.formData);

    request.subscribe({
      next: () => {
        this.saving = false;
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.saving = false;
        this.snackBar.open(err?.error?.error || 'Error al guardar la respuesta', 'Cerrar', { duration: 5000 });
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
