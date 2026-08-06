import { Routes } from '@angular/router';
import { LandingComponent } from './landing.component';

export const landingRoutes: Routes = [
  {
    path: '',
    component: LandingComponent,
    data: { title: 'WhatsApp Ads - Automatiza tu WhatsApp y escala tus ventas' },
  },
];