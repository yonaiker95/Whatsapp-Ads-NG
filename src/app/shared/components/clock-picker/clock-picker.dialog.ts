import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ClockPickerData {
  time?: string;
  title?: string;
}

type ClockMode = 'hours' | 'minutes';

@Component({
  selector: 'app-clock-picker-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './clock-picker.dialog.html',
  styleUrls: ['./clock-picker.dialog.scss'],
})
export class ClockPickerDialogComponent {
  mode: ClockMode = 'hours';
  selectedHour: number;
  selectedMinute: number;
  period: 'AM' | 'PM';
  title: string;

  hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  constructor(
    public dialogRef: MatDialogRef<ClockPickerDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ClockPickerData
  ) {
    this.title = data?.title || 'Seleccionar hora';
    const [h, m] = this.parseTime(data?.time);
    this.period = h >= 12 ? 'PM' : 'AM';
    this.selectedHour = (h % 12) || 12;
    this.selectedMinute = Math.round(m / 5) * 5;
    if (this.selectedMinute === 60) this.selectedMinute = 0;
  }

  private parseTime(time?: string): [number, number] {
    if (!time) return [0, 0];
    const m = time.match(/(\d{1,2}):(\d{2})/);
    if (!m) return [0, 0];
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    return [isNaN(h) ? 0 : h, isNaN(min) ? 0 : min];
  }

  get preview(): string {
    const h24 = this.period === 'PM' ? (this.selectedHour % 12) + 12 : this.selectedHour % 12;
    return `${this.pad(h24)}:${this.pad(this.selectedMinute)}`;
  }

  private pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  private position(value: number, total: number, radius: number): { x: number; y: number } {
    const angle = (value / total) * 2 * Math.PI - Math.PI / 2;
    return { x: Math.round(radius * Math.cos(angle)), y: Math.round(radius * Math.sin(angle)) };
  }

  hourPos(h: number): string {
    const { x, y } = this.position(h % 12, 12, 92);
    return `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  }

  minutePos(m: number): string {
    const { x, y } = this.position(m / 5, 12, 92);
    return `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  }

  get handTransform(): string {
    const degrees = this.mode === 'hours' ? (this.selectedHour % 12) * 30 : this.selectedMinute * 6;
    return `rotate(${degrees}deg)`;
  }

  selectHour(h: number): void {
    this.selectedHour = h;
    this.mode = 'minutes';
  }

  selectMinute(m: number): void {
    this.selectedMinute = m;
  }

  backToHours(): void {
    this.mode = 'hours';
  }

  goToMinutes(): void {
    this.mode = 'minutes';
  }

  togglePeriod(): void {
    this.period = this.period === 'AM' ? 'PM' : 'AM';
  }

  confirm(): void {
    this.dialogRef.close(this.preview);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
