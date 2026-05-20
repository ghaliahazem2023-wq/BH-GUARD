import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./features/authentification/authentification').then(m => m.AuthentificationComponent)
  },
  // 🚀 ZID HEDHI HOUNI:
  {
    path: 'reset-password',
    loadComponent: () => import('./features/reset-password/reset-password').then(m => m.ResetPasswordComponent)
  },
  {
    path: 'dashboard-admin',
    loadComponent: () => import('./features/admin-dashboard/admin-dashboard').then(m => m.AdminDashboardComponent)
  },
  {
    path: 'espace-agent',
    loadComponent: () => import('./features/agent-espace/agent-espace').then(m => m.AgentEspaceComponent)
  }
];