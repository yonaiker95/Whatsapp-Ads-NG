import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { ApiResponse } from '../models/api-response.model';
import { Group, GroupFormData } from '../models/group.model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface GroupSyncResult {
  groups: Group[];
  synced: number;
  created: number;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class GroupService {
  constructor(private api: ApiService) {}

  getAll(): Observable<Group[]> {
    return this.api.get<Group[]>('/groups').pipe(map((res) => res.data));
  }

  getById(id: string): Observable<Group> {
    return this.api.get<Group>(`/groups/${id}`).pipe(map((res) => res.data));
  }

  create(data: GroupFormData): Observable<Group> {
    return this.api.post<Group>('/groups', data).pipe(map((res) => res.data));
  }

  update(id: string, data: GroupFormData): Observable<Group> {
    return this.api.put<Group>(`/groups/${id}`, data).pipe(map((res) => res.data));
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/groups/${id}`).pipe(map((res) => res.data));
  }

  sync(instanceId: string): Observable<GroupSyncResult> {
    return this.api.post<Group[]>(`/groups/sync`, { instanceId }).pipe(
      map((res: ApiResponse<Group[]> & { synced?: number; created?: number; total?: number }) => ({
        groups: res.data,
        synced: res.synced ?? 0,
        created: res.created ?? 0,
        total: res.total ?? res.data.length,
      }))
    );
  }
}