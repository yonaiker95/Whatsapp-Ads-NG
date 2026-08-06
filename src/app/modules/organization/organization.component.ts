import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Subject, takeUntil } from 'rxjs';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { OrganizationService } from '../../core/services/organization.service';
import { AuthService } from '../../core/services/auth.service';
import { Organization, OrganizationMember, PERMISSION_OPTIONS, permissionLabel as permissionLabelFor, permissionIcon as permissionIconFor } from '../../core/models/organization.model';

@Component({
  selector: 'app-organization',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule, MatTabsModule,
    MatFormFieldModule, MatInputModule, MatProgressSpinnerModule, MatTooltipModule,
    MatSnackBarModule, MatDividerModule, MatDialogModule, MatCheckboxModule,
  ],
  templateUrl: './organization.component.html',
  styleUrls: ['./organization.component.scss'],
})
export class OrganizationComponent implements OnInit, OnDestroy {
  org: Organization | null = null;
  members: OrganizationMember[] = [];
  loading = true;
  loadingMembers = false;
  savingOrg = false;
  creatingOrg = false;
  addingMember = false;
  removingMemberId: string | null = null;
  showPassword = false;
  editingOrg = false;
  lastAdded: OrganizationMember | null = null;
  lastAddedPassword = '';

  orgName = '';
  orgDescription = '';
  memberName = '';
  memberEmail = '';
  memberPassword = '';
  memberPermissions: string[] = [];
  editingMemberId: string | null = null;
  editingPermissions: string[] = [];
  savingPermissions = false;

  readonly permissionOptions = PERMISSION_OPTIONS;

  private destroy$ = new Subject<void>();

  constructor(
    private organizationService: OrganizationService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get canManage(): boolean {
    return !!this.org?.isOwner || this.authService.currentUser()?.role === 'admin';
  }

  get memberCount(): number {
    return this.members.length;
  }

  get ownerName(): string {
    return this.members.find((m) => m.role === 'owner')?.name || '';
  }

  toggleEdit(): void {
    this.editingOrg = !this.editingOrg;
    if (this.editingOrg) {
      this.orgName = this.org?.name || '';
      this.orgDescription = this.org?.description || '';
    }
  }

  load(): void {
    this.loading = true;
    this.organizationService.getCurrent().pipe(takeUntil(this.destroy$)).subscribe({
      next: (org) => {
        this.org = org;
        this.orgName = org?.name || '';
        this.orgDescription = org?.description || '';
        this.editingOrg = false;
        this.loading = false;
        if (org) this.loadMembers();
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  loadMembers(): void {
    this.loadingMembers = true;
    this.organizationService.getMembers().pipe(takeUntil(this.destroy$)).subscribe({
      next: (members) => {
        this.members = members;
        this.loadingMembers = false;
      },
      error: () => {
        this.loadingMembers = false;
      },
    });
  }

  createOrg(): void {
    if (!this.orgName.trim()) {
      this.snackBar.open('Indica el nombre de tu organización', 'Cerrar', { duration: 4000 });
      return;
    }
    this.creatingOrg = true;
    this.organizationService
      .create({ name: this.orgName.trim(), description: this.orgDescription.trim() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (org) => {
          this.creatingOrg = false;
          this.org = org;
          this.snackBar.open('Organización creada correctamente', 'Cerrar', { duration: 3000 });
          this.loadMembers();
        },
        error: (err) => {
          this.creatingOrg = false;
          this.snackBar.open(err?.error?.error || 'Error al crear la organización', 'Cerrar', { duration: 5000 });
        },
      });
  }

  saveOrg(): void {
    if (!this.org || !this.orgName.trim()) {
      this.snackBar.open('El nombre de la organización es obligatorio', 'Cerrar', { duration: 4000 });
      return;
    }
    this.savingOrg = true;
    this.organizationService
      .update({ name: this.orgName.trim(), description: this.orgDescription.trim() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (org) => {
          this.savingOrg = false;
          this.org = org;
          this.editingOrg = false;
          this.snackBar.open('Organización actualizada', 'Cerrar', { duration: 3000 });
        },
        error: (err) => {
          this.savingOrg = false;
          this.snackBar.open(err?.error?.error || 'Error al actualizar la organización', 'Cerrar', { duration: 5000 });
        },
      });
  }

  addMember(): void {
    if (!this.memberName.trim() || this.memberName.trim().length < 2) {
      this.snackBar.open('Indica el nombre del miembro', 'Cerrar', { duration: 4000 });
      return;
    }
    if (!this.memberEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.memberEmail.trim())) {
      this.snackBar.open('Correo electrónico inválido', 'Cerrar', { duration: 4000 });
      return;
    }
    if (this.memberPassword.length < 6) {
      this.snackBar.open('La contraseña debe tener al menos 6 caracteres', 'Cerrar', { duration: 4000 });
      return;
    }
    this.addingMember = true;
    this.organizationService
      .addMember({ name: this.memberName.trim(), email: this.memberEmail.trim(), password: this.memberPassword, permissions: [...this.memberPermissions] })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (member) => {
          this.addingMember = false;
          this.lastAdded = member;
          this.lastAddedPassword = this.memberPassword;
          this.members = [...this.members, member];
          this.memberName = '';
          this.memberEmail = '';
          this.memberPassword = '';
          this.memberPermissions = [];
          this.snackBar.open('Miembro añadido correctamente', 'Cerrar', { duration: 3000 });
        },
        error: (err) => {
          this.addingMember = false;
          this.snackBar.open(err?.error?.error || 'Error al añadir el miembro', 'Cerrar', { duration: 5000 });
        },
      });
  }

  copyCredentials(): void {
    if (!this.lastAdded) return;
    const text = `Acceso de ${this.lastAdded.name}\nEmail: ${this.lastAdded.email}\nContraseña: ${this.lastAddedPassword}`;
    navigator.clipboard?.writeText(text).then(
      () => this.snackBar.open('Credenciales copiadas', 'Cerrar', { duration: 3000 }),
      () => this.snackBar.open('No se pudieron copiar las credenciales', 'Cerrar', { duration: 4000 })
    );
  }

  removeMember(member: OrganizationMember): void {
    if (member.role === 'owner') return;
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar miembro',
        message: `¿Eliminar a ${member.name} (${member.email}) de la organización?`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      },
    });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe((confirmed) => {
      if (!confirmed) return;
      this.removingMemberId = member.id;
      this.organizationService.removeMember(member.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.removingMemberId = null;
          this.members = this.members.filter((m) => m.id !== member.id);
          if (this.lastAdded?.id === member.id) this.lastAdded = null;
          this.snackBar.open('Miembro eliminado', 'Cerrar', { duration: 3000 });
        },
        error: (err) => {
          this.removingMemberId = null;
          this.snackBar.open(err?.error?.error || 'Error al eliminar el miembro', 'Cerrar', { duration: 5000 });
        },
      });
    });
  }

  memberRoleLabel(role: string): string {
    switch (role) {
      case 'owner':
        return 'Propietario';
      case 'admin':
        return 'Administrador';
      default:
        return 'Miembro';
    }
  }

  togglePermission(permission: string): void {
    if (this.memberPermissions.includes(permission)) {
      this.memberPermissions = this.memberPermissions.filter((p) => p !== permission);
    } else {
      this.memberPermissions = [...this.memberPermissions, permission];
    }
  }

  hasPermission(member: OrganizationMember, permission: string): boolean {
    return Array.isArray(member.permissions) && member.permissions.includes(permission);
  }

  memberHasAnyPermission(member: OrganizationMember): boolean {
    return Array.isArray(member.permissions) && member.permissions.length > 0;
  }

  memberPermissionKeys(member: OrganizationMember): string[] {
    return PERMISSION_OPTIONS.map((p) => p.key).filter((k) => this.hasPermission(member, k));
  }

  openPermissionsEditor(member: OrganizationMember): void {
    this.editingMemberId = member.id;
    this.editingPermissions = [...(member.permissions || [])];
  }

  cancelPermissionsEditor(): void {
    this.editingMemberId = null;
    this.editingPermissions = [];
  }

  toggleEditingPermission(permission: string): void {
    if (this.editingPermissions.includes(permission)) {
      this.editingPermissions = this.editingPermissions.filter((p) => p !== permission);
    } else {
      this.editingPermissions = [...this.editingPermissions, permission];
    }
  }

  savePermissions(member: OrganizationMember): void {
    this.savingPermissions = true;
    this.organizationService
      .updateMember(member.id, { permissions: [...this.editingPermissions] })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.savingPermissions = false;
          this.members = this.members.map((m) => (m.id === updated.id ? updated : m));
          this.editingMemberId = null;
          this.editingPermissions = [];
          this.snackBar.open('Permisos actualizados', 'Cerrar', { duration: 3000 });
        },
        error: (err) => {
          this.savingPermissions = false;
          this.snackBar.open(err?.error?.error || 'Error al actualizar los permisos', 'Cerrar', { duration: 5000 });
        },
      });
  }

  permissionLabel(key: string): string {
    return permissionLabelFor(key);
  }

  permissionIcon(key: string): string {
    return permissionIconFor(key);
  }

  formatDate(value?: string | null): string {
    if (!value) return '';
    try {
      return new Date(value).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return value;
    }
  }
}
