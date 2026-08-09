import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { setupGuard } from './core/guards/setup.guard';
import { onboardingGuard, onboardingCompleteGuard } from './core/guards/onboarding.guard';
import { LayoutComponent } from './layout/layout.component';
import { authRoutes } from './modules/auth/auth.routes';
import { ShieldComponent } from './shared/layouts/shield/shield.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./modules/landing/landing.component').then(m => m.LandingComponent),
  },
  {
    path: '',
    component: ShieldComponent,
    children: [
      { path: 'resources', loadComponent: () => import('./modules/resources/overview/overview.component').then(m => m.OverviewComponent) },
      { path: 'help', loadComponent: () => import('./modules/resources/help/help.component').then(m => m.HelpComponent) },
      { path: 'community', loadComponent: () => import('./modules/resources/community/community.component').then(m => m.CommunityComponent) },
      { path: 'webinars', loadComponent: () => import('./modules/resources/webinars/webinars.component').then(m => m.WebinarsComponent) },
      { path: 'templates', loadComponent: () => import('./modules/resources/templates/templates.component').then(m => m.TemplatesComponent) },
      { path: 'status', loadComponent: () => import('./modules/resources/status/status.component').then(m => m.StatusComponent) },
      { path: 'contact', loadComponent: () => import('./modules/resources/contact/contact.component').then(m => m.ContactComponent) },
      { path: 'integrations', loadComponent: () => import('./modules/product/integrations/integrations.component').then(m => m.IntegrationsComponent) },
      { path: 'changelog', loadComponent: () => import('./modules/product/changelog/changelog.component').then(m => m.ChangelogComponent) },
      { path: 'about', loadComponent: () => import('./modules/company/about/about.component').then(m => m.AboutComponent) },
      { path: 'blog', loadComponent: () => import('./modules/company/blog/blog.component').then(m => m.BlogComponent) },
      { path: 'careers', loadComponent: () => import('./modules/company/careers/careers.component').then(m => m.CareersComponent) },
      { path: 'press', loadComponent: () => import('./modules/company/press/press.component').then(m => m.PressComponent) },
      { path: 'privacy', loadComponent: () => import('./modules/legal/privacy/privacy.component').then(m => m.PrivacyComponent) },
      { path: 'terms', loadComponent: () => import('./modules/legal/terms/terms.component').then(m => m.TermsComponent) },
      { path: 'cookies', loadComponent: () => import('./modules/legal/cookies/cookies.component').then(m => m.CookiesComponent) },
      { path: 'security', loadComponent: () => import('./modules/legal/security/security.component').then(m => m.SecurityComponent) },
      { path: 'rgpd', loadComponent: () => import('./modules/legal/rgpd/rgpd.component').then(m => m.RgpdComponent) },
    ],
  },
  {
    path: 'app',
    component: LayoutComponent,
    canActivate: [authGuard, onboardingGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./modules/dashboard/dashboard.component').then(m => m.DashboardComponent),
        data: { title: 'Dashboard' },
      },
      {
        path: 'campaigns',
        loadChildren: () => import('./modules/campaigns/campaigns.routes').then(m => m.campaignsRoutes),
        data: { title: 'Campañas' },
      },
      {
        path: 'templates',
        loadChildren: () => import('./modules/templates/templates.routes').then(m => m.templatesRoutes),
        data: { title: 'Plantillas' },
      },
      {
        path: 'instances',
        loadChildren: () => import('./modules/instances/instances.routes').then(m => m.instancesRoutes),
        data: { title: 'Instancias' },
      },
      {
        path: 'groups',
        loadComponent: () => import('./modules/groups/groups.component').then(m => m.GroupsComponent),
        data: { title: 'Grupos' },
      },
      {
        path: 'auto-replies',
        loadComponent: () => import('./modules/auto-replies/auto-replies.component').then(m => m.AutoRepliesComponent),
        data: { title: 'Auto-respuestas' },
      },
      {
        path: 'chatbot',
        loadComponent: () => import('./modules/chatbot/chatbot.component').then(m => m.ChatbotComponent),
        data: { title: 'Chatbot' },
      },
      {
        path: 'ai-center',
        loadComponent: () => import('./modules/ai-center/ai-center.component').then(m => m.AiCenterComponent),
        data: { title: 'Centro de IA' },
      },
      {
        path: 'reports',
        loadComponent: () => import('./modules/reports/reports.component').then(m => m.ReportsComponent),
        data: { title: 'Reportes' },
      },
      {
        path: 'conversations',
        loadComponent: () => import('./modules/conversations/conversations.component').then(m => m.ConversationsComponent),
        data: { title: 'Conversaciones' },
      },
      {
        path: 'billing',
        loadComponent: () => import('./modules/billing/billing.component').then(m => m.BillingComponent),
        data: { title: 'Facturación' },
      },
      {
        path: 'organization',
        loadComponent: () => import('./modules/organization/organization.component').then(m => m.OrganizationComponent),
        data: { title: 'Organización y equipo' },
      },
      {
        path: 'users',
        loadComponent: () => import('./modules/users/users.component').then(m => m.UsersComponent),
        data: { title: 'Usuarios' },
      },
      {
        path: 'plans',
        loadComponent: () => import('./modules/plans/plans.component').then(m => m.PlansComponent),
        data: { title: 'Planes' },
      },
      {
        path: 'testimonials',
        loadComponent: () => import('./modules/testimonials/testimonials.component').then(m => m.TestimonialsComponent),
        data: { title: 'Testimonios' },
      },
      {
        path: 'profile',
        loadComponent: () => import('./modules/profile/profile.component').then(m => m.ProfileComponent),
        data: { title: 'Mi perfil' },
      },
      {
        path: 'settings',
        loadComponent: () => import('./modules/settings/settings.component').then(m => m.SettingsComponent),
        data: { title: 'Configuración' },
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: 'onboarding',
    loadComponent: () => import('./modules/onboarding/onboarding.component').then(m => m.OnboardingComponent),
    canActivate: [authGuard, onboardingCompleteGuard],
  },
  {
    path: 'setup',
    loadComponent: () => import('./modules/setup/setup.component').then(m => m.SetupComponent),
    canActivate: [setupGuard],
  },
  {
    path: 'auth',
    children: authRoutes,
    canActivate: [guestGuard],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
