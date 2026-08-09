import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface BlockedDialogData {
  reason?: string | null;
}

@Component({
  selector: 'app-blocked-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="dialog-icon" color="warn">block</mat-icon>
      Tu cuenta fue bloqueada
    </h2>
    <mat-dialog-content>
      <p>
        {{
          data.reason
            ? 'El propietario de la organización bloqueó tu cuenta con el siguiente motivo:'
            : 'El propietario de la organización bloqueó tu cuenta. No podrás iniciar sesión hasta que te desbloqueen.'
        }}
      </p>
      @if (data.reason) {
        <div class="block-reason">{{ data.reason }}</div>
      }
      <p>Tu sesión fue cerrada y tus accesos quedaron revocados.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-raised-button color="warn" (click)="onConfirm()" cdkFocusInitial>
        Entendido
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-icon { margin-right: 8px; vertical-align: middle; }
    mat-dialog-content { padding: 16px 0; }
    mat-dialog-actions { padding: 8px 0 0; }
    .block-reason {
      background: #ffebee;
      color: #b71c1c;
      border-left: 3px solid #f44336;
      padding: 10px 12px;
      border-radius: 6px;
      margin: 8px 0;
      font-size: 14px;
    }
  `],
})
export class BlockedDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<BlockedDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BlockedDialogData
  ) {}

  onConfirm(): void {
    this.dialogRef.close(true);
  }
}
