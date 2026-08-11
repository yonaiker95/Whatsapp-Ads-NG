import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { NegocioService, Appointment } from '../negocio.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AppointmentFormDialogComponent } from './appointment-form-dialog/appointment-form-dialog.component';

interface DayGroup {
  label: string;
  items: Appointment[];
}

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule, MatSelectModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatTooltipModule, MatDialogModule, MatChipsModule,
  ],
  templateUrl: './agenda.component.html',
  styleUrls: ['./agenda.component.scss'],
})
export class AgendaComponent implements OnInit {
  appointments: Appointment[] = [];
  statuses = [
    { value: '', label: 'Todas' },
    { value: 'pendiente', label: 'Pendientes' },
    { value: 'confirmada', label: 'Confirmadas' },
    { value: 'realizada', label: 'Realizadas' },
    { value: 'cancelada', label: 'Canceladas' },
  ];
  selectedStatus = '';
  loading = true;

  constructor(
    private negocio: NegocioService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    const params: Record<string, string> = {};
    if (this.selectedStatus) params['status'] = this.selectedStatus;
    this.negocio.getAppointments(params).subscribe({
      next: (list) => {
        this.appointments = list;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  get groups(): DayGroup[] {
    const map = new Map<string, Appointment[]>();
    for (const a of this.appointments) {
      const d = new Date(a.startAt);
      const key = d.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, items]) => {
        const d = new Date(key + 'T12:00:00');
        const today = new Date();
        const diff = d.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
        const label = diff
          ? 'Hoy'
          : d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        return { label: label.charAt(0).toUpperCase() + label.slice(1), items };
      });
  }

  get upcomingCount(): number {
    return this.appointments.filter((a) => a.status !== 'cancelada' && new Date(a.startAt) >= new Date()).length;
  }

  openCreate(): void {
    const dialogRef = this.dialog.open(AppointmentFormDialogComponent, {
      width: '560px',
      maxWidth: '94vw',
      data: { appointment: null },
    });
    dialogRef.afterClosed().subscribe((ok) => {
      if (ok) {
        this.snackBar.open('Cita agendada', 'Cerrar', { duration: 3000 });
        this.load();
      }
    });
  }

  openEdit(a: Appointment): void {
    const dialogRef = this.dialog.open(AppointmentFormDialogComponent, {
      width: '560px',
      maxWidth: '94vw',
      data: { appointment: a },
    });
    dialogRef.afterClosed().subscribe((ok) => {
      if (ok) this.load();
    });
  }

  confirmDelete(a: Appointment): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar cita',
        message: `¿Eliminar la cita "${a.title}"?`,
        confirmText: 'Eliminar',
      },
    });
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.negocio.deleteAppointment(a.id).subscribe({
        next: () => {
          this.snackBar.open('Cita eliminada', 'Cerrar', { duration: 3000 });
          this.load();
        },
        error: (err) => {
          this.snackBar.open(err?.error?.error || 'Error al eliminar', 'Cerrar', { duration: 5000 });
        },
      });
    });
  }

  statusLabel(s: string): string {
    const map: Record<string, string> = {
      pendiente: 'Pendiente',
      confirmada: 'Confirmada',
      realizada: 'Realizada',
      cancelada: 'Cancelada',
    };
    return map[s] || s;
  }

  statusIcon(s: string): string {
    const map: Record<string, string> = {
      pendiente: 'schedule',
      confirmada: 'check_circle',
      realizada: 'task_alt',
      cancelada: 'cancel',
    };
    return map[s] || 'event';
  }

  timeRange(a: Appointment): string {
    const s = new Date(a.startAt);
    if (!a.endAt) return s.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const e = new Date(a.endAt);
    return `${s.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} – ${e.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  }
}
