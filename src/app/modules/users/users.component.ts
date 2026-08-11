import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { UsersService } from '../../core/services/users.service';
import { RegisteredUser, BlockAuditEntry } from '../../core/models/user-admin.model';
import {
  UserManagerDialogComponent,
  UserManagerDialogData,
} from './components/user-manager-dialog/user-manager-dialog.component';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule, MatChipsModule,
    MatTableModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule,
    MatTooltipModule, MatSnackBarModule, MatDividerModule, MatPaginatorModule, MatDialogModule,
  ],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss'],
})
export class UsersComponent implements OnInit, OnDestroy {
  users: RegisteredUser[] = [];
  loading = true;
  loadError = false;
  search = '';
  filter: 'all' | 'active' | 'blocked' = 'all';
  actioningId: string | null = null;

  pageIndex = 0;
  pageSize = 10;

  auditEntries: BlockAuditEntry[] = [];
  loadingAudit = false;
  loadAuditError = false;

  displayedColumns = ['usuario', 'organizacion', 'plan', 'estado', 'registrado', 'acciones'];

  private destroy$ = new Subject<void>();

  constructor(
    private usersService: UsersService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  get isAdmin(): boolean {
    return this.authService.currentUser()?.role === 'admin';
  }

  get currentUserId(): string | null {
    return this.authService.currentUser()?.id || null;
  }

  get viewTitle(): string {
    return 'Dueños de cada organización registrada en la plataforma';
  }

  get stats(): { total: number; active: number; blocked: number; organizations: number } {
    return {
      total: this.users.length,
      active: this.users.filter((u) => !u.blocked).length,
      blocked: this.users.filter((u) => u.blocked).length,
      organizations: new Set(this.users.map((u) => u.organizationId).filter(Boolean)).size,
    };
  }

  get filteredUsers(): RegisteredUser[] {
    const q = this.search.trim().toLowerCase();
    return this.users.filter((u) => {
      if (this.filter === 'active' && u.blocked) return false;
      if (this.filter === 'blocked' && !u.blocked) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.organizationName || '').toLowerCase().includes(q)
      );
    });
  }

  get paginatedUsers(): RegisteredUser[] {
    const start = this.pageIndex * this.pageSize;
    return this.filteredUsers.slice(start, start + this.pageSize);
  }

  get resultsRange(): string {
    const total = this.filteredUsers.length;
    if (total === 0) return 'Sin resultados';
    const start = this.pageIndex * this.pageSize + 1;
    const end = Math.min((this.pageIndex + 1) * this.pageSize, total);
    return `Mostrando ${start}–${end} de ${total} propietarios`;
  }

  onPage(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
  }

  ngOnInit(): void {
    this.load();
    if (this.isAdmin) {
      this.loadAudit();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.loadError = false;
    this.usersService.list().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.users = res.data || [];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.loadError = true;
      },
    });
  }

  loadAudit(): void {
    this.loadingAudit = true;
    this.loadAuditError = false;
    this.usersService.audit().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.auditEntries = res.data || [];
        this.loadingAudit = false;
      },
      error: () => {
        this.loadingAudit = false;
        this.loadAuditError = true;
      },
    });
  }

  refresh(): void {
    this.load();
    if (this.isAdmin) {
      this.loadAudit();
    }
  }

  avatarColor(u: RegisteredUser): string {
    const palette = ['#075E54', '#0B6E63', '#06B6D4', '#6c63ff', '#7c3aed', '#059669', '#2563eb', '#db2777'];
    let h = 0;
    for (const c of u.name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return palette[h % palette.length];
  }

  openDetails(u: RegisteredUser, focusBlock = false): void {
    if (this.actioningId === u.id) return;
    const data: UserManagerDialogData = { user: u, focusBlock };
    const ref = this.dialog.open<UserManagerDialogComponent, UserManagerDialogData, boolean>(
      UserManagerDialogComponent,
      { data, width: '720px', maxWidth: '95vw' }
    );
    ref.afterClosed().pipe(takeUntil(this.destroy$)).subscribe((changed) => {
      if (changed) {
        this.load();
        this.loadAudit();
      }
    });
  }

  unblock(u: RegisteredUser): void {
    this.actioningId = u.id;
    this.usersService.unblock(u.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.actioningId = null;
        this.load();
        this.loadAudit();
        this.snackBar.open('Usuario desbloqueado', 'Cerrar', { duration: 3000 });
      },
      error: (err) => {
        this.actioningId = null;
        this.snackBar.open(err?.error?.error || 'Error al desbloquear al usuario', 'Cerrar', { duration: 5000 });
      },
    });
  }

  clearSearch(): void {
    this.search = '';
    this.pageIndex = 0;
  }

  onSearch(): void {
    this.pageIndex = 0;
  }

  setFilter(f: 'all' | 'active' | 'blocked'): void {
    this.filter = f;
    this.pageIndex = 0;
  }

  setFilterFromStat(type: 'total' | 'active' | 'blocked'): void {
    const map = { total: 'all', active: 'active', blocked: 'blocked' } as const;
    this.setFilter(map[type]);
  }

  planLabel(plan: string): string {
    const map: Record<string, string> = {
      mensual: 'Mensual',
      trimestral: 'Trimestral',
      anual: 'Anual',
      free: 'Gratis',
      starter: 'Starter',
      profesional: 'Profesional',
      empresarial: 'Empresarial',
    };
    const label = map[plan];
    if (label) return label;
    if (!plan) return '—';
    return plan.charAt(0).toUpperCase() + plan.slice(1);
  }

  billingLabel(status: string): string {
    const map: Record<string, string> = { active: 'Activo', trial: 'Prueba', overdue: 'Moroso', blocked: 'Suspendido' };
    return map[status] || status || '—';
  }

  canBlock(u: RegisteredUser): boolean {
    if (u.blocked || u.role === 'admin' || u.id === this.currentUserId) return false;
    return this.isAdmin;
  }

  canUnblock(u: RegisteredUser): boolean {
    if (!u.blocked || u.role === 'admin') return false;
    return this.isAdmin;
  }

  isProtected(u: RegisteredUser): boolean {
    return u.role === 'admin' || u.id === this.currentUserId;
  }

  formatDate(value?: string | null): string {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return value;
    }
  }

  formatDateTime(value?: string | null): string {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return value;
    }
  }
}
