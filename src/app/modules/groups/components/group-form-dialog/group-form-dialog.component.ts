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
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { GroupService } from '../../../../core/services/group.service';
import { InstanceService } from '../../../../core/services/instance.service';
import { GroupFormData } from '../../../../core/models/group.model';
import { Instance } from '../../../../core/models/instance.model';

export interface GroupDialogData {
  formData: GroupFormData;
  id?: string;
}

@Component({
  selector: 'app-group-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatCheckboxModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatChipsModule, MatIconModule,
  ],
  templateUrl: './group-form-dialog.component.html',
  styleUrls: ['./group-form-dialog.component.scss'],
})
export class GroupFormDialogComponent {
  formData: GroupFormData;
  id?: string;
  instances: Instance[] = [];
  saving = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: GroupDialogData,
    private dialogRef: MatDialogRef<GroupFormDialogComponent>,
    private groupService: GroupService,
    private instanceService: InstanceService,
    private snackBar: MatSnackBar
  ) {
    this.formData = { ...data.formData, tags: [...(data.formData.tags || [])] };
    this.id = data.id;
    this.loadInstances();
  }

  loadInstances(): void {
    this.instanceService.getAll().subscribe((instances) => {
      this.instances = instances;
      if (instances.length > 0 && !this.formData.instanceId) {
        this.formData.instanceId = instances[0].id;
      }
    });
  }

  addTag(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value && !this.formData.tags.includes(value)) {
      this.formData.tags = [...this.formData.tags, value];
    }
    event.chipInput!.clear();
  }

  removeTag(tag: string): void {
    this.formData.tags = this.formData.tags.filter((t) => t !== tag);
  }

  save(): void {
    if (!this.formData.name.trim()) {
      this.snackBar.open('El nombre es requerido', 'Cerrar', { duration: 3000 });
      return;
    }
    if (!this.formData.jid.trim()) {
      this.snackBar.open('El JID del grupo es requerido', 'Cerrar', { duration: 3000 });
      return;
    }
    this.saving = true;
    this.groupService.update(this.id!, this.formData).subscribe({
      next: () => {
        this.saving = false;
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.saving = false;
        this.snackBar.open(err?.error?.error || 'Error al guardar el grupo', 'Cerrar', { duration: 5000 });
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
