import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { RegisteredUser } from '../models/user-admin.model';

@Injectable({ providedIn: 'root' })
export class UsersService {
  constructor(private api: ApiService) {}

  list(): Observable<{ data: RegisteredUser[]; success: boolean }> {
    return this.api.get<RegisteredUser[]>('/users');
  }

  block(id: string, reason: string): Observable<{ data: { id: string; blocked: boolean }; success: boolean }> {
    return this.api.post<{ id: string; blocked: boolean }>(`/users/${id}/block`, { reason });
  }

  unblock(id: string): Observable<{ data: { id: string; blocked: boolean }; success: boolean }> {
    return this.api.post<{ id: string; blocked: boolean }>(`/users/${id}/unblock`, {});
  }
}
