import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LandingComponent } from './landing.component';
import { LandingNavbarComponent } from './components/navbar/landing-navbar.component';
import { HeroComponent } from './components/hero/hero.component';
import { FeaturesComponent } from './components/features/features.component';
import { PricingComponent } from './components/pricing/pricing.component';
import { LandingFooterComponent } from './components/footer/landing-footer.component';
import { landingRoutes } from './landing.routes';
import { RouterModule } from '@angular/router';

@NgModule({
  declarations: [
    LandingComponent,
    LandingNavbarComponent,
    HeroComponent,
    FeaturesComponent,
    PricingComponent,
    LandingFooterComponent
  ],
  imports: [
    CommonModule,
    RouterModule.forChild(landingRoutes)
  ]
})
export class LandingModule {}