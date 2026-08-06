import { Component, signal, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HeaderComponent } from './header/header.component';
import { SidebarComponent } from './sidebar/sidebar.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, HeaderComponent, SidebarComponent],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss'],
})
export class LayoutComponent {
  sidebarCollapsed = signal(false);
  pageTitle = signal('');
  mobileOpen = signal(false);
  isMobile = signal(false);

  private destroyRef = inject(DestroyRef);
  private mediaQuery = window.matchMedia('(max-width: 1024px)');

  private titleMap: Record<string, string> = {
    '/app/dashboard': 'Dashboard',
    '/app/campaigns': 'Campañas',
    '/app/campaigns/new': 'Nueva Campaña',
    '/app/templates': 'Plantillas',
    '/app/templates/new': 'Nueva Plantilla',
    '/app/instances': 'Instancias',
    '/app/groups': 'Grupos',
    '/app/auto-replies': 'Auto-respuestas',
    '/app/chatbot': 'Chatbot',
    '/app/reports': 'Reportes',
    '/app/conversations': 'Conversaciones',
    '/app/billing': 'Facturación',
  };

  constructor(private router: Router) {
    this.isMobile.set(this.mediaQuery.matches);
    this.mediaQuery.addEventListener('change', (e) => {
      this.isMobile.set(e.matches);
      if (!e.matches) this.mobileOpen.set(false);
    });

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((event: NavigationEnd) => {
      const url = event.urlAfterRedirects;
      const baseRoute = '/' + url.split('/').slice(0, 3).join('/');
      this.pageTitle.set(this.titleMap[baseRoute] || this.titleMap[url] || '');
      // En móvil, cerrar el drawer al navegar
      if (this.isMobile()) this.mobileOpen.set(false);
    });
  }

  onSidebarToggle(): void {
    if (this.isMobile()) {
      this.mobileOpen.update((v) => !v);
    } else {
      this.sidebarCollapsed.update((v) => !v);
    }
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
  }
}
