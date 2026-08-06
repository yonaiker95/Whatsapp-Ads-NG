import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LandingNavbarComponent } from '../../../modules/landing/components/navbar/landing-navbar.component';
import { LandingFooterComponent } from '../../../modules/landing/components/footer/landing-footer.component';

@Component({
  selector: 'app-shield',
  standalone: true,
  imports: [RouterOutlet, LandingNavbarComponent, LandingFooterComponent],
  template: `
    <div class="shield-page">
      <app-landing-navbar></app-landing-navbar>
      <main class="shield-main">
        <router-outlet></router-outlet>
      </main>
      <app-landing-footer></app-landing-footer>
    </div>
  `,
  styles: [`
    .shield-page {
      min-height: 100vh;
      background: var(--background);
    }
    .shield-main {
      padding: 120px 24px 60px;
    }
    @media (max-width: 768px) {
      .shield-main {
        padding: 100px 16px 40px;
      }
    }
  `],
})
export class ShieldComponent {}
