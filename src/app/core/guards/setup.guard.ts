import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

// El asistente de instalación solo funciona la primera vez. Si la plataforma
// ya está instalada, /setup redirige a la raíz.
export const setupGuard: CanActivateFn = async () => {
  const http = inject(HttpClient);
  const router = inject(Router);
  try {
    const resp: any = await firstValueFrom(http.get('/api/setup/status'));
    if (resp?.installed === true) {
      router.navigate(['/']);
      return false;
    }
    return true;
  } catch {
    router.navigate(['/']);
    return false;
  }
};
