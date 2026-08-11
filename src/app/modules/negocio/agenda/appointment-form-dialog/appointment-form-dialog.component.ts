import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { NegocioService, Appointment } from '../../negocio.service';

@Component({
  selector: 'app-appointment-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatDatepickerModule, MatNativeDateModule,
    MatProgressSpinnerModule, MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ appointment ? 'Editar cita' : 'Agendar cita' }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline" class="full">
          <mat-label>Título *</mat-label>
          <input matInput [(ngModel)]="form.title" placeholder="p.ej. Consulta inicial, Entrega de pedido...">
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Fecha *</mat-label>
          <input matInput [matDatepicker]="picker" [(ngModel)]="date">
          <mat-datepicker-toggle matSuffix [for]="picker"></mat-datepicker-toggle>
          <mat-datepicker #picker></mat-datepicker>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Hora *</mat-label>
          <input matInput type="time" [(ngModel)]="time">
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Duración (min)</mat-label>
          <input matInput type="number" [(ngModel)]="durationMin" min="5">
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Estado</mat-label>
          <mat-select [(ngModel)]="form.status">
            <mat-option value="pendiente">Pendiente</mat-option>
            <mat-option value="confirmada">Confirmada</mat-option>
            <mat-option value="realizada">Realizada</mat-option>
            <mat-option value="cancelada">Cancelada</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Cliente</mat-label>
          <input matInput [(ngModel)]="form.customerName">
        </mat-form-field>

        <mat-form-field appearance="outline" class="full">
          <mat-label>Ubicación / Lugar</mat-label>
          <input matInput [(ngModel)]="form.location" placeholder="Dirección, sucursal o enlace">
        </mat-form-field>

        <mat-form-field appearance="outline" class="full">
          <mat-label>Descripción / Notas</mat-label>
          <textarea matInput rows="3" [(ngModel)]="form.description"></textarea>
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="saving">
        @if (saving) { <mat-spinner diameter="16"></mat-spinner> }
        {{ appointment ? 'Guardar cambios' : 'Agendar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      padding-top: 8px;
    }
    .full { grid-column: 1 / -1; }
    mat-dialog-actions { padding: 8px 0 0; }
    mat-dialog-actions mat-spinner { margin-right: 8px; }
  `],
})
export class AppointmentFormDialogComponent {
  appointment: Appointment | null;
  date: Date;
  time = '09:00';
  durationMin = 60;
  form: { title: string; description: string; customerName: string; customerJid: string; status: string; location: string } = {
    title: '', description: '', customerName: '', customerJid: '', status: 'pendiente', location: '',
  };
  saving = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: { appointment: Appointment | null },
    private dialogRef: MatDialogRef<AppointmentFormDialogComponent>,
    private negocio: NegocioService,
    private snackBar: MatSnackBar
  ) {
    this.appointment = data.appointment;
    this.date = new Date();
    if (this.appointment) {
      const start = new Date(this.appointment.startAt);
      this.date = start;
      this.time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
      const end = this.appointment.endAt ? new Date(this.appointment.endAt) : null;
      if (end && end > start) {
        this.durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
      }
      this.form = {
        title: this.appointment.title,
        description: this.appointment.description || '',
        customerName: this.appointment.customerName || '',
        customerJid: this.appointment.customerJid || '',
        status: this.appointment.status || 'pendiente',
        location: this.appointment.location || '',
      };
    }
  }

  save(): void {
    if (!this.form.title.trim()) {
      this.snackBar.open('El título es requerido', 'Cerrar', { duration: 3000 });
      return;
    }
    const start = new Date(this.date);
    const [h, m] = this.time.split(':').map((n) => parseInt(n, 10) || 0);
    start.setHours(h, m, 0, 0);
    if (isNaN(start.getTime())) {
      this.snackBar.open('Fecha u hora inválidas', 'Cerrar', { duration: 3000 });
      return;
    }
    const dur = Math.max(5, Number(this.durationMin) || 60);
    const end = new Date(start.getTime() + dur * 60000);
    const body = {
      title: this.form.title.trim(),
      description: this.form.description,
      customerName: this.form.customerName,
      customerJid: this.form.customerJid,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      status: this.form.status,
      location: this.form.location,
    };
    this.saving = true;
    const op = this.appointment
      ? this.negocio.updateAppointment(this.appointment.id, body)
      : this.negocio.createAppointment(body);
    op.subscribe({
      next: () => {
        this.saving = false;
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.saving = false;
        this.snackBar.open(err?.error?.error || 'Error al guardar la cita', 'Cerrar', { duration: 5000 });
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
