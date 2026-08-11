import { Injectable } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  sku: string;
  price: number;
  cost: number;
  stock: number;
  unit: string;
  image: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NegocioDoc {
  id: string;
  title: string;
  type: string;
  content: string;
  summary: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  title: string;
  description: string;
  customerName: string;
  customerJid: string;
  startAt: string;
  endAt: string;
  status: string;
  location: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class NegocioService {
  constructor(private api: ApiService) {}

  getProducts(params = {}): Observable<{ list: Product[]; summary: { totalValue: number; totalStock: number } }> {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return this.api
      .get<{ list: Product[]; summary: { totalValue: number; totalStock: number } }>(`/products${qs ? '?' + qs : ''}`)
      .pipe(
        map((res) => {
          const raw = res.data as unknown;
          const list = Array.isArray(raw)
            ? (raw as Product[])
            : ((raw as { list?: Product[] })?.list ?? []);
          const summary = (res as unknown as { summary?: { totalValue: number; totalStock: number } })?.summary || {
            totalValue: 0,
            totalStock: 0,
          };
          return { list, summary };
        })
      );
  }

  createProduct(body: Partial<Product>): Observable<Product> {
    return this.api.post<Product>('/products', body).pipe(map((res) => res.data));
  }

  updateProduct(id: string, body: Partial<Product>): Observable<Product> {
    return this.api.put<Product>(`/products/${id}`, body).pipe(map((res) => res.data));
  }

  deleteProduct(id: string): Observable<unknown> {
    return this.api.delete<void>(`/products/${id}`);
  }

  getDocuments(params = {}): Observable<NegocioDoc[]> {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return this.api.get<NegocioDoc[]>(`/documents${qs ? '?' + qs : ''}`).pipe(map((res) => res.data));
  }

  createDocument(body: Partial<NegocioDoc>): Observable<NegocioDoc> {
    return this.api.post<NegocioDoc>('/documents', body).pipe(map((res) => res.data));
  }

  updateDocument(id: string, body: Partial<NegocioDoc>): Observable<NegocioDoc> {
    return this.api.put<NegocioDoc>(`/documents/${id}`, body).pipe(map((res) => res.data));
  }

  deleteDocument(id: string): Observable<unknown> {
    return this.api.delete<void>(`/documents/${id}`);
  }

  getAppointments(params = {}): Observable<Appointment[]> {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return this.api.get<Appointment[]>(`/appointments${qs ? '?' + qs : ''}`).pipe(map((res) => res.data));
  }

  createAppointment(body: Partial<Appointment>): Observable<Appointment> {
    return this.api.post<Appointment>('/appointments', body).pipe(map((res) => res.data));
  }

  updateAppointment(id: string, body: Partial<Appointment>): Observable<Appointment> {
    return this.api.put<Appointment>(`/appointments/${id}`, body).pipe(map((res) => res.data));
  }

  deleteAppointment(id: string): Observable<unknown> {
    return this.api.delete<void>(`/appointments/${id}`);
  }
}
