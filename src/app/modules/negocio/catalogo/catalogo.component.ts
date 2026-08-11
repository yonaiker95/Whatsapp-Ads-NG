import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSortModule } from '@angular/material/sort';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { NegocioService, Product } from '../negocio.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ProductFormDialogComponent } from './product-form-dialog/product-form-dialog.component';

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule, MatInputModule,
    MatFormFieldModule, MatSelectModule, MatTableModule, MatChipsModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatTooltipModule, MatDialogModule, MatSortModule, MatSlideToggleModule,
  ],
  templateUrl: './catalogo.component.html',
  styleUrls: ['./catalogo.component.scss'],
})
export class CatalogoComponent implements OnInit {
  displayedColumns = ['name', 'price', 'stock', 'status', 'actions'];
  products: Product[] = [];
  categories: string[] = [];
  selectedCategory = '';
  search = '';
  loading = true;
  onlyActive = false;

  summary = { totalValue: 0, totalStock: 0 };

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
    if (this.selectedCategory) params['category'] = this.selectedCategory;
    if (this.search.trim()) params['q'] = this.search.trim();
    if (this.onlyActive) params['active'] = 'true';
    this.negocio.getProducts(params).subscribe({
      next: (res) => {
        this.products = res.list;
        this.summary = res.summary;
        this.loading = false;
        this.loadCategories();
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  loadCategories(): void {
    this.negocio.getProducts().subscribe((res) => {
      const cats = new Set<string>();
      for (const p of res.list) {
        if (p.category) cats.add(p.category);
      }
      this.categories = [...cats].sort();
    });
  }

  get filteredByCategory(): Product[] {
    if (!this.selectedCategory) return this.products;
    return this.products.filter((p) => p.category === this.selectedCategory);
  }

  get totalValue(): number {
    return this.products.reduce((s, p) => s + (p.active ? p.price * p.stock : 0), 0);
  }

  get lowStockCount(): number {
    return this.products.filter((p) => p.stock <= 5).length;
  }

  openCreate(): void {
    const dialogRef = this.dialog.open(ProductFormDialogComponent, {
      width: '520px',
      maxWidth: '94vw',
      data: { product: null },
    });
    dialogRef.afterClosed().subscribe((ok) => {
      if (ok) {
        this.snackBar.open('Producto creado', 'Cerrar', { duration: 3000 });
        this.load();
      }
    });
  }

  openEdit(p: Product): void {
    const dialogRef = this.dialog.open(ProductFormDialogComponent, {
      width: '520px',
      maxWidth: '94vw',
      data: { product: p },
    });
    dialogRef.afterClosed().subscribe((ok) => {
      if (ok) this.load();
    });
  }

  confirmDelete(p: Product): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar producto',
        message: `¿Eliminar "${p.name}" del catálogo?`,
        confirmText: 'Eliminar',
      },
    });
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.negocio.deleteProduct(p.id).subscribe({
        next: () => {
          this.snackBar.open('Producto eliminado', 'Cerrar', { duration: 3000 });
          this.load();
        },
        error: (err) => {
          this.snackBar.open(err?.error?.error || 'Error al eliminar', 'Cerrar', { duration: 5000 });
        },
      });
    });
  }

  formatMoney(v: number): string {
    return Number(v || 0).toLocaleString('es-VE', { style: 'currency', currency: 'USD' });
  }
}
