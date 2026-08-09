import { Component, OnDestroy } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil, filter } from 'rxjs';
import { CookieConsentComponent } from './shared/components/cookie-consent/cookie-consent.component';
import { BlockedDialogComponent } from './shared/components/blocked-dialog/blocked-dialog.component';
import { InstanceSocketService, SocketMessage } from './core/services/instance-socket.service';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MatSnackBarModule, MatDialogModule, CookieConsentComponent],
  template: '<router-outlet></router-outlet>\n<app-cookie-consent></app-cookie-consent>',
  styles: [],
})
export class AppComponent implements OnDestroy {
  title = 'WhatsApp Ads';
  private readonly destroy$ = new Subject<void>();

  constructor(
    private http: HttpClient,
    private router: Router,
    private dialog: MatDialog,
    private socketService: InstanceSocketService,
    private authService: AuthService,
  ) {
    this.checkSetup();
    this.watchAccountBlocked();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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

  // Si el propietario bloquea la cuenta mientras la app está abierta, avisa y
  // cierra la sesión de inmediato (el servidor ya revocó la sesión HTTP).
  private watchAccountBlocked(): void {
    this.socketService.messages
      .pipe(
        takeUntil(this.destroy$),
        filter((msg: SocketMessage) => msg.type === 'account:blocked'),
      )
      .subscribe((msg) => {
        const data = (msg.data || {}) as { reason?: string | null };
        const dialogRef = this.dialog.open(BlockedDialogComponent, {
          data: { reason: data.reason || null },
          disableClose: true,
          width: '420px',
        });
        dialogRef.afterClosed().subscribe(() => this.authService.logout());
      });
  }
}
