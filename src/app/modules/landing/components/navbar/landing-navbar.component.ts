import { Component, HostListener, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, NavigationEnd, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ThemeService } from '../../../../core/services/theme.service';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-landing-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule, MatToolbarModule],
  templateUrl: './landing-navbar.component.html',
  styleUrls: ['./landing-navbar.component.scss'],
})
export class LandingNavbarComponent implements OnDestroy {
  themeService = inject(ThemeService);
  authService = inject(AuthService);
  isScrolled = false;
  mobileMenuOpen = false;

  private routerSub: Subscription | undefined;

  constructor(private router: Router) {
    this.routerSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.closeMenu());
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
    this.setBodyScrollLock(false);
  }

  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    this.isScrolled = window.scrollY > 50;
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  toggleMenu(): void {
    if (this.mobileMenuOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  openMenu(): void {
    this.mobileMenuOpen = true;
    this.setBodyScrollLock(true);
  }

  closeMenu(): void {
    if (this.mobileMenuOpen) {
      this.setBodyScrollLock(false);
      this.mobileMenuOpen = false;
    }
  }

  private setBodyScrollLock(lock: boolean): void {
    document.body.style.overflow = lock ? 'hidden' : '';
  }
}
