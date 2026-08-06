import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { BillingInfo, Invoice, PaymentDestination, ReportedPayment, PlanChangeInfo, UserAddon } from '../models/dashboard.model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface PaymentDestinationFormData {
  type: string;
  customType?: string;
  name: string;
  holder?: string;
  detail?: string;
  instructions?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface ReportPaymentFormData {
  destinationId: string;
  amount?: number;
  reference: string;
  paymentDate?: string;
}

export interface AddonQuantity {
  key: string;
  quantity: number;
}

@Injectable({ providedIn: 'root' })
export class BillingService {
  constructor(private api: ApiService) {}

  getBillingInfo(): Observable<BillingInfo> {
    return this.api.get<BillingInfo>('/billing').pipe(map((res) => res.data));
  }

  getInvoices(): Observable<Invoice[]> {
    return this.api.get<Invoice[]>('/billing/invoices').pipe(map((res) => res.data));
  }

  payInvoice(invoiceId: string): Observable<Invoice> {
    return this.api.post<Invoice>(`/billing/invoices/${invoiceId}/pay`, {}).pipe(map((res) => res.data));
  }

  getPaymentDestinations(): Observable<PaymentDestination[]> {
    return this.api.get<PaymentDestination[]>('/billing/payment-destinations').pipe(map((res) => res.data));
  }

  createPaymentDestination(data: PaymentDestinationFormData): Observable<PaymentDestination> {
    return this.api.post<PaymentDestination>('/billing/payment-destinations', data).pipe(map((res) => res.data));
  }

  updatePaymentDestination(id: string, data: PaymentDestinationFormData): Observable<PaymentDestination> {
    return this.api.put<PaymentDestination>(`/billing/payment-destinations/${id}`, data).pipe(map((res) => res.data));
  }

  deletePaymentDestination(id: string): Observable<unknown> {
    return this.api.delete<unknown>(`/billing/payment-destinations/${id}`).pipe(map((res) => res.data));
  }

  reportPayment(data: ReportPaymentFormData): Observable<ReportedPayment> {
    return this.api.post<ReportedPayment>('/billing/reported-payments', data).pipe(map((res) => res.data));
  }

  getReportedPayments(): Observable<ReportedPayment[]> {
    return this.api.get<ReportedPayment[]>('/billing/reported-payments').pipe(map((res) => res.data));
  }

  verifyReportedPayment(id: string): Observable<unknown> {
    return this.api.post<unknown>(`/billing/reported-payments/${id}/verify`, {}).pipe(map((res) => res.data));
  }

  rejectReportedPayment(id: string, note?: string): Observable<unknown> {
    return this.api.post<unknown>(`/billing/reported-payments/${id}/reject`, { note }).pipe(map((res) => res.data));
  }

  getPlanChangeInfo(): Observable<PlanChangeInfo> {
    return this.api.get<PlanChangeInfo>('/billing/plan').pipe(map((res) => res.data));
  }

  changePlan(planSlug: string): Observable<{ planSlug: string; message: string }> {
    return this.api.post<{ planSlug: string; message: string }>('/billing/plan/change', { planSlug }).pipe(map((res) => res.data));
  }

  updateAddons(addons: AddonQuantity[]): Observable<{ addons: UserAddon[]; addonTotal: number; total: number }> {
    return this.api.post<{ addons: UserAddon[]; addonTotal: number; total: number }>('/billing/plan/addons', { addons }).pipe(map((res) => res.data));
  }
}
