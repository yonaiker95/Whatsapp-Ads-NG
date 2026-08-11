import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Subject, takeUntil } from 'rxjs';
import { GroupService } from '../../core/services/group.service';
import { InstanceService } from '../../core/services/instance.service';
import { Group, GroupFormData } from '../../core/models/group.model';
import { Instance } from '../../core/models/instance.model';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { GroupFormDialogComponent } from './components/group-form-dialog/group-form-dialog.component';
import { CreateGroupDialogComponent } from './components/create-group-dialog/create-group-dialog.component';

type StatusFilter = 'all' | 'active' | 'excluded';

interface GroupSection {
  instanceId: string;
  instanceName: string;
  instancePhone?: string;
  instanceStatus?: Instance['status'];
  groups: Group[];
}

const AVATAR_COLORS = ['#075E54', '#128C7E', '#0E7490', '#4338CA', '#7C3AED', '#BE185D', '#B45309', '#0F766E'];

@Component({
  selector: 'app-groups',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule,
    MatChipsModule, MatMenuModule, MatDividerModule, MatExpansionModule,
    MatProgressSpinnerModule, MatSlideToggleModule, MatTooltipModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './groups.component.html',
  styleUrls: ['./groups.component.scss'],
})
export class GroupsComponent implements OnInit, OnDestroy {
  displayedColumns = ['name', 'participants', 'tags', 'campaign', 'actions'];
  groups: Group[] = [];
  instances: Instance[] = [];
  loading = true;
  syncing = false;
  syncingInstanceId = '';
  searchQuery = '';
  statusFilter: StatusFilter = 'all';
  private destroy$ = new Subject<void>();

  constructor(
    private groupService: GroupService,
    private instanceService: InstanceService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadInstances();
    this.loadGroups();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadInstances(): void {
    this.instanceService.getAll().subscribe({
      next: (instances) => {
        this.instances = instances;
      },
    });
  }

  loadGroups(): void {
    this.loading = true;
    this.groupService.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (groups) => {
          this.groups = groups;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  get filteredGroups(): Group[] {
    const q = this.searchQuery.trim().toLowerCase();
    return this.groups.filter((g) => {
      if (this.statusFilter === 'active' && g.excluded) return false;
      if (this.statusFilter === 'excluded' && !g.excluded) return false;
      if (!q) return true;
      return g.name.toLowerCase().includes(q) || (g.jid || '').toLowerCase().includes(q);
    });
  }

  get stats() {
    return {
      total: this.groups.length,
      active: this.groups.filter((g) => !g.excluded).length,
      excluded: this.groups.filter((g) => g.excluded).length,
      instances: this.instances.filter((i) => this.groups.some((g) => g.instanceId === i.id)).length,
    };
  }

  get sections(): GroupSection[] {
    const byId = new Map<string, Group[]>();
    for (const g of this.filteredGroups) {
      const list = byId.get(g.instanceId) || [];
      list.push(g);
      byId.set(g.instanceId, list);
    }

    const emptyIds: string[] = [];
    if (!this.searchQuery.trim() && this.statusFilter === 'all') {
      emptyIds.push(...this.instances.map((i) => i.id).filter((id) => !byId.has(id)));
    }

    const keys = [...byId.keys(), ...emptyIds];
    keys.sort((a, b) => {
      const ia = this.instances.findIndex((i) => i.id === a);
      const ib = this.instances.findIndex((i) => i.id === b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    return keys.map((key) => {
      const inst = this.instances.find((i) => i.id === key);
      const list = byId.get(key) || [];
      return {
        instanceId: key,
        instanceName: inst?.name || list[0]?.instanceName || key,
        instancePhone: inst?.phone,
        instanceStatus: inst?.status,
        groups: list,
      };
    });
  }

  clearSearch(): void {
    this.searchQuery = '';
  }

  sectionTrackBy(_: number, section: GroupSection): string {
    return section.instanceId;
  }

  setStatusFilter(filter: StatusFilter): void {
    this.statusFilter = filter;
  }

  openCreateGroupDialog(): void {
    const dialogRef = this.dialog.open(CreateGroupDialogComponent, {
      width: '640px',
      maxWidth: '95vw',
      data: { instanceId: this.instances[0]?.id },
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadGroups();
        this.snackBar.open(`Grupo "${result.name}" creado en WhatsApp`, 'Cerrar', { duration: 3500 });
      }
    });
  }

  syncAll(): void {
    if (!this.instances.length) {
      this.snackBar.open('No hay instancias disponibles para sincronizar', 'Cerrar', { duration: 4000 });
      return;
    }
    this.syncing = true;
    const ids = this.instances.map((i) => i.id);
    let idx = 0;
    const totals = { created: 0, synced: 0 };
    const next = () => {
      if (idx >= ids.length) {
        this.syncing = false;
        this.syncingInstanceId = '';
        this.loadGroups();
        const parts: string[] = [];
        if (totals.created > 0) parts.push(`${totals.created} nuevos`);
        if (totals.synced > 0) parts.push(`${totals.synced} actualizados`);
        this.snackBar.open(
          parts.length ? `Sincronizados: ${parts.join(', ')}` : 'Grupos sincronizados correctamente',
          'Cerrar',
          { duration: 3500 }
        );
        return;
      }
      const id = ids[idx++];
      this.syncingInstanceId = id;
      this.groupService.sync(id).subscribe({
        next: (result) => {
          totals.created += result.created;
          totals.synced += result.synced;
          next();
        },
        error: (err) => {
          this.snackBar.open(
            `${this.instanceName(id)}: ${err?.error?.error || 'Error al sincronizar'}`,
            'Cerrar',
            { duration: 5000 }
          );
          next();
        },
      });
    };
    next();
  }

  syncByInstance(instanceId: string): void {
    if (this.syncing) return;
    this.syncing = true;
    this.syncingInstanceId = instanceId;
    this.groupService.sync(instanceId).subscribe({
      next: (result) => {
        this.syncing = false;
        this.syncingInstanceId = '';
        this.groups = [
          ...this.groups.filter((g) => g.instanceId !== instanceId),
          ...result.groups,
        ];
        const parts: string[] = [];
        if (result.created > 0) parts.push(`${result.created} nuevos`);
        if (result.synced > 0) parts.push(`${result.synced} actualizados`);
        this.snackBar.open(
          parts.length ? `Sincronizados: ${parts.join(', ')}` : 'Grupos sincronizados correctamente',
          'Cerrar',
          { duration: 3500 }
        );
      },
      error: (err) => {
        this.syncing = false;
        this.syncingInstanceId = '';
        this.snackBar.open(err?.error?.error || 'Error al sincronizar grupos', 'Cerrar', { duration: 5000 });
      },
    });
  }

  editGroup(group: Group): void {
    this.openFormDialog({
      instanceId: group.instanceId,
      jid: group.jid,
      name: group.name,
      description: group.description,
      tags: group.tags,
      excluded: group.excluded,
    }, group.id);
  }

  openFormDialog(data: GroupFormData, id?: string): void {
    const dialogRef = this.dialog.open(GroupFormDialogComponent, {
      width: '480px',
      data: { formData: data, id },
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result) this.loadGroups();
    });
  }

  toggleExcluded(group: Group): void {
    const payload: GroupFormData = {
      instanceId: group.instanceId,
      jid: group.jid,
      name: group.name,
      description: group.description,
      tags: group.tags,
      excluded: !group.excluded,
    };
    this.groupService.update(group.id, payload).subscribe({
      next: () => {
        this.groups = this.groups.map((g) =>
          g.id === group.id ? { ...g, excluded: payload.excluded } : g
        );
      },
      error: (err) => {
        this.snackBar.open(err?.error?.error || 'Error al actualizar el grupo', 'Cerrar', { duration: 4000 });
      },
    });
  }

  setCampaignInclusion(group: Group, included: boolean): void {
    if (group.excluded === !included) return;
    this.toggleExcluded(group);
  }

  deleteGroup(group: Group): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar grupo',
        message: `¿Eliminar el grupo "${group.name}"?`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      },
    });
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.groupService.delete(group.id).subscribe({
          next: () => {
            this.snackBar.open('Grupo eliminado', 'Cerrar', { duration: 3000 });
            this.loadGroups();
          },
          error: (err) => {
            this.snackBar.open(err?.error?.error || 'Error al eliminar el grupo', 'Cerrar', { duration: 5000 });
          },
        });
      }
    });
  }

  avatarColor(name: string): string {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  instanceName(id: string): string {
    return this.instances.find((i) => i.id === id)?.name || id;
  }

  instanceStatusLabel(status?: Instance['status']): string {
    switch (status) {
      case 'connected': return 'Conectada';
      case 'connecting': return 'Conectando';
      case 'qrcoded': return 'Pendiente de escaneo';
      default: return 'Desconectada';
    }
  }
}
