import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  selector: 'app-cookie-consent',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule],
  template: `
    <div class="cookie-consent-overlay" *ngIf="visible" [@slideUp]>
      <div class="cookie-consent">
        <div class="cookie-icon">
          <mat-icon>cookie</mat-icon>
        </div>
        <div class="cookie-text">
          <p>Este sitio web utiliza cookies propias y de terceros para mejorar tu experiencia, analizar el tráfico y mostrarte publicidad relevante.</p>
          <p class="cookie-link">
            <a routerLink="/cookies">Más información sobre cookies</a> ·
            <a routerLink="/privacy">Política de privacidad</a>
          </p>
        </div>
        <div class="cookie-actions">
          <button mat-button (click)="dismiss()" class="btn-config">Configurar</button>
          <button mat-raised-button color="primary" (click)="accept()" class="btn-accept">
            <mat-icon>check</mat-icon>
            Aceptar todas
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .cookie-consent-overlay {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 10000;
      padding: 0 16px 16px;
      display: flex;
      justify-content: center;
      pointer-events: none;
    }

    .cookie-consent {
      background: #0f172a;
      color: rgba(255, 255, 255, 0.9);
      border-radius: 16px;
      padding: 20px 24px;
      display: flex;
      align-items: center;
      gap: 20px;
      max-width: 1100px;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
      pointer-events: auto;
    }

    .cookie-icon {
      flex-shrink: 0;

      mat-icon {
        font-size: 36px;
        width: 36px;
        height: 36px;
        color: #25D366;
      }
    }

    .cookie-text {
      flex: 1;
      min-width: 0;

      p {
        margin: 0;
        font-size: 14px;
        line-height: 1.6;
      }

      .cookie-link {
        margin-top: 4px;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.5);

        a {
          color: #25D366;
          text-decoration: none;

          &:hover {
            text-decoration: underline;
          }
        }
      }
    }

    .cookie-actions {
      display: flex;
      gap: 10px;
      flex-shrink: 0;
    }

    .btn-config {
      color: rgba(255, 255, 255, 0.7) !important;
      font-size: 13px;
    }

    .btn-accept {
      background: #25D366 !important;
      color: #0f172a !important;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 4px;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      &:hover {
        background: #1da956 !important;
      }
    }

    /* Tablet breakpoint - 1024px: keep full width, minor adjustments */
    @media (max-width: 1024px) {
      .cookie-consent {
        max-width: 900px;
        padding: 18px 20px;
        gap: 16px;
      }

      .cookie-icon mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
      }

      .cookie-text p {
        font-size: 13px;
      }

      .cookie-link {
        font-size: 12px;
      }

      .cookie-actions {
        gap: 8px;
      }
    }

    /* Tablet breakpoint - 768px: stack vertically */
    @media (max-width: 768px) {
      .cookie-consent {
        flex-direction: column;
        text-align: center;
        padding: 16px 20px;
        gap: 12px;
        max-width: 100%;
      }

      .cookie-icon mat-icon {
        font-size: 28px;
        width: 28px;
        height: 28px;
      }

      .cookie-text p {
        font-size: 13px;
      }

      .cookie-link {
        font-size: 12px;
      }

      .cookie-actions {
        width: 100%;
        justify-content: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      .btn-config,
      .btn-accept {
        flex: 1;
        min-width: 120px;
        font-size: 13px;
      }

      .cookie-consent-overlay {
        padding: 0 12px 12px;
      }
    }

    /* Mobile breakpoint - 480px: full-width buttons, smaller */
    @media (max-width: 480px) {
      .cookie-consent {
        padding: 14px 16px;
        gap: 10px;
        border-radius: 12px;
      }

      .cookie-icon mat-icon {
        font-size: 24px;
        width: 24px;
        height: 24px;
      }

      .cookie-text p {
        font-size: 12px;
        line-height: 1.5;
      }

      .cookie-link {
        font-size: 11px;
      }

      .cookie-actions {
        flex-direction: column;
        width: 100%;
        gap: 8px;
      }

      .btn-config,
      .btn-accept {
        width: 100%;
        padding: 10px 16px;
        font-size: 12px;
        justify-content: center;
      }

      .btn-accept {
        height: auto;
        min-height: 44px;

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }
      }

      .cookie-consent-overlay {
        padding: 0 10px 10px;
      }
    }

    /* Extra small screens - 360px: ultra compact */
    @media (max-width: 360px) {
      .cookie-consent {
        padding: 12px 14px;
        gap: 8px;
        border-radius: 10px;
      }

      .cookie-icon mat-icon {
        font-size: 22px;
        width: 22px;
        height: 22px;
      }

      .cookie-text p {
        font-size: 11px;
      }

      .cookie-link {
        font-size: 10px;
      }

      .btn-config,
      .btn-accept {
        font-size: 11px;
        padding: 8px 12px;
      }

      .cookie-consent-overlay {
        padding: 0 8px 8px;
      }
    }
  `],
  animations: [
    trigger('slideUp', [
      transition(':enter', [
        style({ transform: 'translateY(100%)', opacity: 0 }),
        animate('0.4s ease-out', style({ transform: 'translateY(0)', opacity: 1 })),
      ]),
      transition(':leave', [
        animate('0.3s ease-in', style({ transform: 'translateY(100%)', opacity: 0 })),
      ]),
    ]),
  ],
})
export class CookieConsentComponent implements OnInit {
  visible = false;

  ngOnInit(): void {
    const consent = localStorage.getItem('cookie-consent');
    if (consent !== 'accepted' && consent !== 'configured') {
      setTimeout(() => {
        this.visible = true;
      }, 1000);
    }
  }

  accept(): void {
    localStorage.setItem('cookie-consent', 'accepted');
    this.visible = false;
  }

  dismiss(): void {
    localStorage.setItem('cookie-consent', 'configured');
    this.visible = false;
  }
}
