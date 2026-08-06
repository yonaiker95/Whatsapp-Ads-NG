import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Organization, OrganizationMember, OrganizationMemberFormData, OrganizationFormData } from '../models/organization.model';

interface RawOrganizationMember {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions?: string[];
  organization_id: string | null;
  created_at: string;
}

function toMember(m: RawOrganizationMember): OrganizationMember {
  return {
    id: m.id,
    email: m.email,
    name: m.name,
    role: m.role,
    permissions: Array.isArray(m.permissions) ? m.permissions : [],
    organizationId: m.organization_id,
    createdAt: m.created_at,
  };
}

@Injectable({ providedIn: 'root' })
export class OrganizationService {
  constructor(private api: ApiService) {}

  getCurrent(): Observable<Organization | null> {
    return this.api.get<Organization>('/organizations/current').pipe(map((res) => res.data));
  }

  create(data: OrganizationFormData): Observable<Organization> {
    return this.api.post<Organization>('/organizations', data).pipe(map((res) => res.data));
  }

  update(data: OrganizationFormData): Observable<Organization> {
    return this.api.put<Organization>('/organizations/current', data).pipe(map((res) => res.data));
  }

  getMembers(): Observable<OrganizationMember[]> {
    return this.api.get<RawOrganizationMember[]>('/organizations/current/members').pipe(map((res) => (res.data || []).map(toMember)));
  }

  addMember(data: OrganizationMemberFormData): Observable<OrganizationMember> {
    return this.api.post<RawOrganizationMember>('/organizations/current/members', data).pipe(map((res) => toMember(res.data)));
  }

  updateMember(memberId: string, data: { name?: string; permissions?: string[] }): Observable<OrganizationMember> {
    return this.api.put<RawOrganizationMember>(`/organizations/current/members/${memberId}`, data).pipe(map((res) => toMember(res.data)));
  }

  removeMember(memberId: string): Observable<{ id: string }> {
    return this.api.delete<{ id: string }>(`/organizations/current/members/${memberId}`).pipe(map((res) => res.data));
  }
}
