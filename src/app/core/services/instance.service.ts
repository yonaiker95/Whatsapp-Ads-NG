import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Instance, InstanceFormData } from '../models/instance.model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class InstanceService {
  constructor(private api: ApiService) {}

  getAll(): Observable<Instance[]> {
    return this.api.get<Instance[]>('/instances').pipe(map((res) => res.data));
  }

  getById(id: string): Observable<Instance> {
    return this.api.get<Instance>(`/instances/${id}`).pipe(map((res) => res.data));
  }

  create(data: InstanceFormData): Observable<Instance> {
    return this.api.post<Instance>('/instances', data).pipe(map((res) => res.data));
  }

  update(id: string, data: InstanceFormData): Observable<Instance> {
    return this.api.put<Instance>(`/instances/${id}`, data).pipe(map((res) => res.data));
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/instances/${id}`).pipe(map((res) => res.data));
  }

  connect(id: string): Observable<Instance> {
    return this.api.post<Instance>(`/instances/${id}/connect`, {}).pipe(map((res) => res.data));
  }

  disconnect(id: string): Observable<void> {
    return this.api.delete<void>(`/instances/${id}/disconnect`).pipe(map((res) => res.data));
  }

  getQrCode(id: string): Observable<{ qrCode: string }> {
    return this.api.get<{ qrCode: string }>(`/instances/${id}/qrcode`).pipe(map((res) => res.data));
  }

  getStatus(id: string): Observable<{ status: string }> {
    return this.api.get<{ status: string }>(`/instances/${id}/status`).pipe(map((res) => res.data));
  }

  syncAll(): Observable<{ synced: number; created: number; total: number }> {
    return this.api.post<{ synced: number; created: number; total: number }>('/instances/sync', {}).pipe(map((res) => res.data));
  }
}