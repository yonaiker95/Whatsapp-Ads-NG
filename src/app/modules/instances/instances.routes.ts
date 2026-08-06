import { Routes } from '@angular/router';
import { InstanceListComponent } from './components/instance-list/instance-list.component';
import { InstanceQrComponent } from './components/instance-qr/instance-qr.component';

export const instancesRoutes: Routes = [
  { path: '', component: InstanceListComponent, data: { title: 'Instancias' } },
  { path: ':id/qr', component: InstanceQrComponent, data: { title: 'Código QR' } },
];