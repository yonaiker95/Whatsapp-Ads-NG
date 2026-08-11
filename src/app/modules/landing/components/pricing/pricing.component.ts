import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { Plan } from '../../../../core/models/plan.model';
import { PlanService } from '../../../../core/services/plan.service';

const FALLBACK_PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    slug: 'starter',
    priceMonthly: 0,
    priceYearly: 0,
    description: 'Para empezar y probar la plataforma',
    features: [
      '1 instancia de WhatsApp',
      '1,000 mensajes/mes',
      '1 campaña activa',
      'Plantillas básicas',
      'Respuestas automáticas (5)',
      'Analytics básico',
      'Soporte por email'
    ],
    cta: 'Comenzar ahora',
    color: '#6b7280',
    isActive: true,
    sortOrder: 1
  },
  {
    id: 'profesional',
    name: 'Profesional',
    slug: 'profesional',
    priceMonthly: 49,
    priceYearly: 39,
    description: 'Para negocios que escalan en WhatsApp',
    features: [
      '5 instancias de WhatsApp',
      '50,000 mensajes/mes',
      'Campañas ilimitadas',
      'Plantillas avanzadas + variables',
      'Respuestas automáticas ilimitadas',
      'Chatbot IA incluido',
      'Analytics avanzado + gráficos',
      'Bandeja de conversaciones',
      'Soporte prioritario (chat)',
      'API acceso'
    ],
    cta: 'Empezar ahora',
    popular: true,
    color: '#25D366',
    isActive: true,
    sortOrder: 2
  },
  {
    id: 'empresarial',
    name: 'Empresarial',
    slug: 'empresarial',
    priceMonthly: 199,
    priceYearly: 159,
    description: 'Para equipos y agencias con alto volumen',
    features: [
      '20 instancias de WhatsApp',
      '500,000 mensajes/mes',
      'Todo lo de Profesional +',
      'Marca blanca (white-label)',
      'Sub-cuentas para clientes',
      'Webhooks personalizados',
      'SSO / SAML',
      'SLA 99.9%',
      'Gerente de cuenta dedicado',
      'Onboarding personalizado',
      'Soporte 24/7 telefónico'
    ],
    cta: 'Contactar ventas',
    color: '#6c63ff',
    isActive: true,
    sortOrder: 3
  }
];

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatCardModule, MatDividerModule],
  templateUrl: './pricing.component.html',
  styleUrls: ['./pricing.component.scss'],
})
export class PricingComponent implements OnInit {
  billingCycle = signal<'monthly' | 'yearly'>('monthly');

  planService = inject(PlanService);

  plans: Plan[] = FALLBACK_PLANS;

  ngOnInit(): void {
    this.planService.getPublicPlans().subscribe({
      next: (plans) => {
        if (plans && plans.length > 0) {
          this.plans = plans;
        }
      },
      error: () => {
        this.plans = FALLBACK_PLANS;
      },
    });
  }

  toggleBilling(): void {
    this.billingCycle.update(v => v === 'monthly' ? 'yearly' : 'monthly');
  }

  getPrice(plan: Plan): number {
    return this.billingCycle() === 'monthly' ? plan.priceMonthly : plan.priceYearly;
  }

  getSavingsPercent(plan: Plan): number {
    if (!plan.priceMonthly || plan.priceMonthly <= 0 || !plan.priceYearly) return 0;
    if (plan.priceYearly >= plan.priceMonthly) return 0;
    return Math.round(((plan.priceMonthly - plan.priceYearly) / plan.priceMonthly) * 100);
  }

  textColor(color: string): string {
    const h = (color || '#25D366').replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.179 ? '#052e1f' : '#ffffff';
  }
}
