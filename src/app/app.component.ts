import { Component } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { CookieConsentComponent } from './shared/components/cookie-consent/cookie-consent.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MatSnackBarModule, CookieConsentComponent],
  template: '<router-outlet></router-outlet>\n<app-cookie-consent></app-cookie-consent>',
  styles: [],
})
export class AppComponent {
  title = 'WhatsApp Ads';

  constructor(private http: HttpClient, private router: Router) {
    this.checkSetup();
  }

  // Primer arranque: si la instalación no está completa, envía al wizard /setup.
  private checkSetup(): void {
    this.http.get<{ installed?: boolean }>('/api/setup/status').subscribe({
      next: (res) => {
        if (res?.installed === false && !this.router.url.startsWith('/setup')) {
          this.router.navigate(['/setup']);
        }
      },
      error: () => {
        // Sin respuesta (instalado y API ok) → no redirigir.
      },
    });
  }
}
