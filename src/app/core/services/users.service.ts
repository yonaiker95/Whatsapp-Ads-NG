import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import {
  RegisteredUser,
  BlockAuditEntry,
  AdminUserDetail,
  PasswordResetResult,
} from '../models/user-admin.model';

@Injectable({ providedIn: 'root' })
export class UsersService {
  constructor(private api: ApiService) {}

  list(): Observable<{ data: RegisteredUser[]; success: boolean }> {
    return this.api.get<RegisteredUser[]>('/users');
  }

  audit(): Observable<{ data: BlockAuditEntry[]; success: boolean }> {
    return this.api.get<BlockAuditEntry[]>('/users/audit');
  }

  get(id: string): Observable<{ data: AdminUserDetail; success: boolean }> {
    return this.api.get<AdminUserDetail>(`/users/${id}`);
  }

  update(
    id: string,
    payload: { plan?: string; addons?: { key: string; quantity: number }[] }
  ): Observable<{ data: AdminUserDetail; success: boolean }> {
    return this.api.put<AdminUserDetail>(`/users/${id}`, payload);
  }

  sendPasswordReset(id: string): Observable<{ data: PasswordResetResult; success: boolean }> {
    return this.api.post<PasswordResetResult>(`/users/${id}/password-reset`, {});
  }

  block(id: string, reason: string): Observable<{ data: { id: string; blocked: boolean }; success: boolean }> {
    return this.api.post<{ id: string; blocked: boolean }>(`/users/${id}/block`, { reason });
  }

  unblock(id: string): Observable<{ data: { id: string; blocked: boolean }; success: boolean }> {
    return this.api.post<{ id: string; blocked: boolean }>(`/users/${id}/unblock`, {});
  }
}
