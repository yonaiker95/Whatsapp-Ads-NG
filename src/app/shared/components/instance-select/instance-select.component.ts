import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { InstanceService } from '../../../core/services/instance.service';
import { Instance } from '../../../core/models/instance.model';

@Component({
  selector: 'app-instance-select',
  standalone: true,
  imports: [CommonModule, MatFormFieldModule, MatSelectModule],
  template: `
    <mat-form-field appearance="outline" class="instance-select">
      <mat-label>{{ label }}</mat-label>
      <mat-select [value]="selected" (selectionChange)="onChange($event)">
        <mat-option *ngIf="allowAll" value="">Todas las instancias</mat-option>
        <mat-option *ngFor="let inst of instances" [value]="inst.id">
          {{ inst.name }}
          <span class="status-dot" [class.on]="inst.status === 'connected'"></span>
        </mat-option>
      </mat-select>
      <mat-hint>Los datos de esta sección pertenecen a la instancia elegida</mat-hint>
    </mat-form-field>
  `,
  styles: [`
    .instance-select {
      width: 100%;
    }
    .status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #bdbdbd;
      margin-left: 8px;
      vertical-align: middle;
    }
    .status-dot.on {
      background: #4caf50;
    }
  `],
})
export class InstanceSelectComponent implements OnInit {
  @Input() selected = '';
  @Input() allowAll = false;
  @Input() label = 'Instancia de WhatsApp';
  @Output() selectedChange = new EventEmitter<string>();

  instances: Instance[] = [];

  constructor(private instanceService: InstanceService) {}

  ngOnInit(): void {
    this.instanceService.getAll().subscribe({
      next: (list) => (this.instances = list),
      error: () => (this.instances = []),
    });
  }

  onChange(event: { value: string }): void {
    this.selectedChange.emit(event.value || '');
  }
}
