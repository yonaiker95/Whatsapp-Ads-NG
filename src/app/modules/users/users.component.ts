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
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { UsersService } from '../../core/services/users.service';
import { RegisteredUser, BlockAuditEntry } from '../../core/models/user-admin.model';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule, MatChipsModule,
    MatTableModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule,
    MatTooltipModule, MatSnackBarModule, MatDividerModule, MatPaginatorModule,
  ],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss'],
})
export class UsersComponent implements OnInit, OnDestroy {
  users: RegisteredUser[] = [];
  loading = true;
  search = '';
  filter: 'all' | 'active' | 'blocked' = 'all';
  expandedId: string | null = null;
  blockTargetId: string | null = null;
  blockReason = '';
  actioningId: string | null = null;

  pageIndex = 0;
  pageSize = 10;

  auditEntries: BlockAuditEntry[] = [];
  loadingAudit = false;

  displayedColumns = ['usuario', 'rol', 'organizacion', 'plan', 'estado', 'registrado', 'acciones', 'expand'];

  private destroy$ = new Subject<void>();

  constructor(
    private usersService: UsersService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
  ) {}

  get isOwner(): boolean {
    return this.authService.currentUser()?.role === 'owner';
  }

  get currentUserId(): string | null {
    return this.authService.currentUser()?.id || null;
  }

  get stats(): { total: number; active: number; blocked: number; admins: number } {
    return {
      total: this.users.length,
      active: this.users.filter((u) => !u.blocked).length,
      blocked: this.users.filter((u) => u.blocked).length,
      admins: this.users.filter((u) => u.role === 'owner' || u.role === 'admin').length,
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

  onPage(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
  }

  ngOnInit(): void {
    this.load();
    this.loadAudit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.usersService.list().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.users = res.data || [];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  loadAudit(): void {
    this.loadingAudit = true;
    this.usersService.audit().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.auditEntries = res.data || [];
        this.loadingAudit = false;
      },
      error: () => {
        this.loadingAudit = false;
      },
    });
  }

  toggleExpand(u: RegisteredUser): void {
    this.expandedId = this.expandedId === u.id ? null : u.id;
    this.blockTargetId = null;
  }

  startBlock(u: RegisteredUser): void {
    this.blockTargetId = u.id;
    this.blockReason = u.blockedReason || '';
  }

  cancelBlock(): void {
    this.blockTargetId = null;
  }

  confirmBlock(): void {
    if (!this.blockTargetId) return;
    this.actioningId = this.blockTargetId;
    this.usersService.block(this.blockTargetId, this.blockReason).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.actioningId = null;
        this.blockTargetId = null;
        this.load();
        this.loadAudit();
        this.snackBar.open('Usuario bloqueado', 'Cerrar', { duration: 3000 });
      },
      error: (err) => {
        this.actioningId = null;
        this.snackBar.open(err?.error?.error || 'Error al bloquear al usuario', 'Cerrar', { duration: 5000 });
      },
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

  roleLabel(role: string): string {
    switch (role) {
      case 'owner':
        return 'Propietario';
      case 'admin':
        return 'Administrador';
      default:
        return 'Usuario';
    }
  }

  planLabel(plan: string): string {
    const map: Record<string, string> = { mensual: 'Mensual', trimestral: 'Trimestral', anual: 'Anual', free: 'Gratis' };
    return map[plan] || plan || '—';
  }

  billingLabel(status: string): string {
    const map: Record<string, string> = { active: 'Activo', trial: 'Prueba', overdue: 'Moroso', blocked: 'Suspendido' };
    return map[status] || status || '—';
  }

  canBlock(u: RegisteredUser): boolean {
    return this.isOwner && !u.blocked && !this.isProtected(u);
  }

  canUnblock(u: RegisteredUser): boolean {
    return this.isOwner && u.blocked && !this.isProtected(u);
  }

  isProtected(u: RegisteredUser): boolean {
    return u.role === 'owner' || u.role === 'admin' || u.id === this.currentUserId;
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
