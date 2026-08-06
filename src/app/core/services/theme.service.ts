import { Injectable, signal, computed, effect, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const THEME_KEY = 'wa-theme';

// Servicio global de tema: aplica data-theme="dark" sobre <html>, persiste la
// elección en localStorage y respeta la preferencia del sistema por defecto.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storage: Storage | null;

  dark = signal<boolean>(this.initDark());

  readonly isDark = computed(() => this.dark());

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.storage = isPlatformBrowser(platformId) ? window.localStorage : null;
    if (isPlatformBrowser(platformId)) {
      this.apply(this.dark());
      effect(() => this.apply(this.dark()));
      this.syncWithSystem();
    }
  }

  toggle(): void {
    this.dark.update((v) => !v);
    if (this.storage) {
      this.storage.setItem(THEME_KEY, this.dark() ? 'dark' : 'light');
    }
  }

  private initDark(): boolean {
    if (this.storage) {
      const saved = this.storage.getItem(THEME_KEY);
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
    }
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private apply(dark: boolean): void {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }

  // Si el usuario no ha elegido un tema explícito, sigue los cambios de la
  // preferencia del sistema.
  private syncWithSystem(): void {
    if (!this.storage || this.storage.getItem(THEME_KEY)) return;
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      this.dark.set(e.matches);
    });
  }
}
