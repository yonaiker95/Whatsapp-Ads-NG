import { Routes } from '@angular/router';
import { CampaignListComponent } from './components/campaign-list/campaign-list.component';
import { CampaignDetailComponent } from './components/campaign-detail/campaign-detail.component';

export const campaignsRoutes: Routes = [
  {
    path: '',
    component: CampaignListComponent,
    data: { title: 'Campañas' },
  },
  {
    path: 'new',
    redirectTo: '',
    pathMatch: 'full',
  },
  {
    path: ':id/edit',
    redirectTo: '',
    pathMatch: 'full',
  },
  {
    path: ':id',
    component: CampaignDetailComponent,
    data: { title: 'Detalle de campaña' },
  },
];
