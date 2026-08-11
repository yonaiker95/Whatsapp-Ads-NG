import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GroupService } from '../../../../core/services/group.service';
import { InstanceService } from '../../../../core/services/instance.service';
import { Instance } from '../../../../core/models/instance.model';

export interface CreateGroupDialogData {
  instanceId?: string;
}

interface ContactRow {
  name: string;
  phone: string;
}

@Component({
  selector: 'app-create-group-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatChipsModule, MatTooltipModule,
  ],
  templateUrl: './create-group-dialog.component.html',
  styleUrls: ['./create-group-dialog.component.scss'],
})
export class CreateGroupDialogComponent {
  instances: Instance[] = [];
  instanceId = '';
  name = '';
  description = '';
  tags: string[] = [];
  contacts: ContactRow[] = [{ name: '', phone: '' }];
  creating = false;
  error = '';

  constructor(
    @Inject(MAT_DIALOG_DATA) data: CreateGroupDialogData,
    private dialogRef: MatDialogRef<CreateGroupDialogComponent>,
    private groupService: GroupService,
    private instanceService: InstanceService,
    private snackBar: MatSnackBar
  ) {
    this.instanceId = data?.instanceId || '';
    this.loadInstances();
  }

  loadInstances(): void {
    this.instanceService.getAll().subscribe({
      next: (instances) => {
        this.instances = instances;
        if (!this.instanceId && instances.length > 0) {
          this.instanceId = instances[0].id;
        }
      },
    });
  }

  addContact(): void {
    this.contacts.push({ name: '', phone: '' });
  }

  removeContact(index: number): void {
    this.contacts.splice(index, 1);
  }

  trackContact(index: number): number {
    return index;
  }

  addTag(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value && !this.tags.includes(value)) {
      this.tags = [...this.tags, value];
    }
    event.chipInput!.clear();
  }

  removeTag(tag: string): void {
    this.tags = this.tags.filter((t) => t !== tag);
  }

  canCreate(): boolean {
    return (
      !!this.instanceId &&
      !!this.name.trim() &&
      this.contacts.some((c) => c.phone.trim()) &&
      !this.creating
    );
  }

  create(): void {
    if (this.creating) return;
    this.error = '';
    if (!this.instanceId) {
      this.snackBar.open('Selecciona una instancia', 'Cerrar', { duration: 3000 });
      return;
    }
    if (!this.name.trim()) {
      this.snackBar.open('El nombre del grupo es obligatorio', 'Cerrar', { duration: 3000 });
      return;
    }
    const valid = this.contacts.filter((c) => c.phone.trim());
    if (valid.length === 0) {
      this.snackBar.open('Agrega al menos un contacto con número', 'Cerrar', { duration: 3000 });
      return;
    }

    this.creating = true;
    this.groupService.createRemote({
      instanceId: this.instanceId,
      name: this.name.trim(),
      description: this.description.trim(),
      tags: this.tags,
      contacts: valid.map((c) => ({ name: c.name.trim(), phone: c.phone.trim() })),
    }).subscribe({
      next: (group) => {
        this.creating = false;
        this.dialogRef.close(group);
      },
      error: (err) => {
        this.creating = false;
        const msg = err?.error?.error || 'Error al crear el grupo';
        this.error = msg;
        this.snackBar.open(msg, 'Cerrar', { duration: 6000 });
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
