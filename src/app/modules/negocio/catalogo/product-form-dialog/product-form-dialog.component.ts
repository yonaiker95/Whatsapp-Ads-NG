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
import { NegocioService, Product } from '../../negocio.service';

@Component({
  selector: 'app-product-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatCheckboxModule, MatProgressSpinnerModule, MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ product ? 'Editar producto' : 'Nuevo producto' }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline" class="full">
          <mat-label>Nombre *</mat-label>
          <input matInput [(ngModel)]="form.name" required>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Categoría</mat-label>
          <input matInput [(ngModel)]="form.category" placeholder="p.ej. Menú, Ropa, Servicios">
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>SKU / Referencia</mat-label>
          <input matInput [(ngModel)]="form.sku">
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Precio ($)</mat-label>
          <input matInput type="number" step="0.01" [(ngModel)]="form.price">
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Costo ($)</mat-label>
          <input matInput type="number" step="0.01" [(ngModel)]="form.cost">
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Stock</mat-label>
          <input matInput type="number" step="any" [(ngModel)]="form.stock">
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Unidad</mat-label>
          <input matInput [(ngModel)]="form.unit" placeholder="unidad, kg, servicio">
        </mat-form-field>

        <mat-form-field appearance="outline" class="full">
          <mat-label>Descripción</mat-label>
          <textarea matInput rows="3" [(ngModel)]="form.description"></textarea>
        </mat-form-field>

        <mat-checkbox class="full" color="primary" [(ngModel)]="form.active">Activo en catálogo y para el bot</mat-checkbox>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="saving">
        @if (saving) { <mat-spinner diameter="16"></mat-spinner> }
        Guardar
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
export class ProductFormDialogComponent {
  product: Product | null;
  form: { name: string; category: string; sku: string; price: number; cost: number; stock: number; unit: string; description: string; active: boolean } = {
    name: '', category: '', sku: '', price: 0, cost: 0, stock: 0, unit: 'unidad', description: '', active: true,
  };
  saving = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: { product: Product | null },
    private dialogRef: MatDialogRef<ProductFormDialogComponent>,
    private negocio: NegocioService,
    private snackBar: MatSnackBar
  ) {
    this.product = data.product;
    if (this.product) {
      this.form = {
        name: this.product.name,
        category: this.product.category || '',
        sku: this.product.sku || '',
        price: this.product.price,
        cost: this.product.cost,
        stock: this.product.stock,
        unit: this.product.unit || 'unidad',
        description: this.product.description || '',
        active: this.product.active,
      };
    }
  }

  save(): void {
    if (!this.form.name.trim()) {
      this.snackBar.open('El nombre es requerido', 'Cerrar', { duration: 3000 });
      return;
    }
    this.saving = true;
    const body = { ...this.form, name: this.form.name.trim() };
    const op = this.product
      ? this.negocio.updateProduct(this.product.id, body)
      : this.negocio.createProduct(body);
    op.subscribe({
      next: () => {
        this.saving = false;
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.saving = false;
        this.snackBar.open(err?.error?.error || 'Error al guardar el producto', 'Cerrar', { duration: 5000 });
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
