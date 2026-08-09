import { Component, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: number;
  adminOnly?: boolean;
  ownerOnly?: boolean;
  permission?: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent {
  collapsed = input<boolean>(false);
  mobileOpen = input<boolean>(false);
  toggle = output<void>();

  authService = inject(AuthService);

  readonly activeOptions = { exact: false };

  navSections: NavSection[] = [
    {
      label: 'Principal',
      items: [{ label: 'Dashboard', icon: 'dashboard', route: '/app/dashboard' }],
    },
    {
      label: 'Operación',
      items: [
        { label: 'Campañas', icon: 'campaign', route: '/app/campaigns', badge: 3, permission: 'campaigns' },
        { label: 'Plantillas', icon: 'description', route: '/app/templates', permission: 'templates' },
        { label: 'Instancias', icon: 'phone_android', route: '/app/instances', permission: 'instances' },
        { label: 'Grupos', icon: 'groups', route: '/app/groups', permission: 'groups' },
        { label: 'Auto-respuestas', icon: 'auto_awesome', route: '/app/auto-replies', permission: 'auto_replies' },
        { label: 'Chatbot', icon: 'smart_toy', route: '/app/chatbot', permission: 'chatbot' },
        { label: 'Conversaciones', icon: 'chat', route: '/app/conversations', permission: 'reports' },
      ],
    },
    {
      label: 'Crecimiento',
      items: [
        { label: 'Centro de IA', icon: 'psychology', route: '/app/ai-center', permission: 'ai_center' },
        { label: 'Reportes', icon: 'analytics', route: '/app/reports', permission: 'reports' },
      ],
    },
    {
      label: 'Cuenta',
      items: [
        { label: 'Facturación', icon: 'receipt_long', route: '/app/billing', permission: 'billing' },
        { label: 'Organización y equipo', icon: 'diversity_3', route: '/app/organization', permission: 'organization' },
        { label: 'Usuarios', icon: 'group', route: '/app/users' },
        { label: 'Planes', icon: 'workspace_premium', route: '/app/plans', adminOnly: true },
        { label: 'Testimonios', icon: 'rate_review', route: '/app/testimonials', adminOnly: true },
        { label: 'Mi perfil', icon: 'person', route: '/app/profile' },
        { label: 'Configuración', icon: 'settings', route: '/app/settings' },
      ],
    },
  ];

  private cachedKey: string | null = null;
  private cachedVisibleSections: NavSection[] = [];

  get visibleSections(): NavSection[] {
    const user = this.authService.currentUser();
    const perms = Array.isArray(user?.permissions) ? user.permissions : [];
    const isFull = user?.role === 'admin' || user?.role === 'owner';
    const key = `${user?.role || ''}|${isFull ? '*' : [...perms].sort().join(',')}`;
    if (this.cachedKey !== key) {
      this.cachedKey = key;
      this.cachedVisibleSections = this.navSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => {
            if (item.ownerOnly) return user?.role === 'owner';
            if (item.adminOnly) return isFull;
            if (isFull) return true;
            return !item.permission || perms.includes(item.permission);
          }),
        }))
        .filter((section) => section.items.length > 0);
    }
    return this.cachedVisibleSections;
  }

  get userName(): string {
    return this.authService.currentUser()?.name || 'Usuario';
  }

  get userInitial(): string {
    return (this.authService.currentUser()?.name || 'U')[0] || 'U';
  }

  get roleLabel(): string {
    const role = this.authService.currentUser()?.role || 'user';
    return role === 'admin' || role === 'owner' ? 'Administrador' : 'Usuario';
  }

  onToggle(): void {
    this.toggle.emit();
  }
}
