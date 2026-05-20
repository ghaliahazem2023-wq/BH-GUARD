import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders, HttpClientModule } from '@angular/common/http';import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

export interface User {
  id: number;
  username?: string;
  nom?: string;
  prenom?: string;
  email?: string;
  role: 'ADMINISTRATEUR' | 'AGENT_ANTI_FRAUDE';
  actif: boolean;
  dateCreation?: string;
}

export interface LoginHistory {
  id: number;
  utilisateur: string;
  date: string;
  heure: string;
  adresseIp?: string;
  statut?: 'SUCCÈS' | 'ÉCHEC';
}

export interface DashboardStats {
  totalUtilisateurs: number;
  administrateurs: number;
  agentsAntiFraude: number;
  totalSinistres: number;
  sinistresEnCours: number;
  sinistresValides: number;
  sinistresRejetes: number;
  tauxFraude: number;
  alertesActives: number;
  contratsAnalyses: number;
}

export interface SinistreSuspect {
  id: string | number;
  numeroContrat: string;
  assure: string;
  montant: number;
  scoreRisque: number;
  statut: 'SUSPECT' | 'EN_ANALYSE' | 'CONFIRMÉ' | 'REJETÉ';
  dateSignalement: string;
  typeAssurance: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HttpClientModule  ],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.scss'],
  encapsulation: ViewEncapsulation.None   // ← AJOUTE CETTE LIGNE

})
export class AdminDashboardComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();
  private apiUrl = 'http://localhost:8081/api';
  private pythonUrl = 'http://localhost:8000';

  // UI State
  activeTab: 'dashboard' | 'utilisateurs' | 'sinistres' | 'securite' = 'dashboard';
  sidebarOpen = true;
  darkMode = false;
  showAddUserModal = false;
  showDeleteConfirm = false;
  userToDelete: User | null = null;
  loading = false;
  searchQuery = '';
  currentPage = 1;
  historyPage = 1;
  itemsPerPage = 8;
  alertMessage = '';
  alertType: 'success' | 'error' | 'info' = 'info';
  showAlert = false;

  // Data
  stats: DashboardStats = {
    totalUtilisateurs: 0,
    administrateurs: 0,
    agentsAntiFraude: 0,
    totalSinistres: 0,
    sinistresEnCours: 0,
    sinistresValides: 0,
    sinistresRejetes: 0,
    tauxFraude: 0,
    alertesActives: 0,
    contratsAnalyses: 0
  };

  users: User[] = [];
  loginHistory: LoginHistory[] = [];
  sinistres: SinistreSuspect[] = [];
  filteredUsers: User[] = [];
  currentUser: any = null;

  // Chart data (for CSS-based charts)
  chartData = {
    sinistresParMois: [12, 19, 8, 25, 14, 30, 22, 18, 27, 15, 21, 33],
    fraudeParType: [
      { label: 'Auto', value: 35, color: '#ef4444' },
      { label: 'Habitation', value: 25, color: '#f97316' },
      { label: 'Santé', value: 20, color: '#eab308' },
      { label: 'Vie', value: 20, color: '#22c55e' },
    ]
  };

  // New user form
  newUser = {
    nom: '',
    prenom: '',
    email: '',
    role: 'AGENT_ANTI_FRAUDE' as 'ADMINISTRATEUR' | 'AGENT_ANTI_FRAUDE',
    motDePasse: ''
  };

  // Sinistres filter
  sinistresFilter: 'TOUS' | 'SUSPECT' | 'EN_ANALYSE' | 'CONFIRMÉ' = 'TOUS';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    this.loadAllData();
    // Rafraîchissement toutes les 30 secondes
    interval(30000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.loadStats();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private getHeaders(): HttpHeaders {
  return new HttpHeaders({
    'Content-Type': 'application/json'
  });
}

  loadAllData(): void {
    this.loadStats();
    this.loadUsers();
    this.loadLoginHistory();
    this.loadSinistres();
  }

  loadStats(): void {
    this.http.get<DashboardStats>(`${this.apiUrl}/admin/stats`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => { this.stats = data; },
        error: () => {
          // Données de démo si l'API n'est pas prête
          this.stats = {
            totalUtilisateurs: 12,
            administrateurs: 3,
            agentsAntiFraude: 9,
            totalSinistres: 247,
            sinistresEnCours: 43,
            sinistresValides: 178,
            sinistresRejetes: 26,
            tauxFraude: 18.2,
            alertesActives: 7,
            contratsAnalyses: 1432
          };
        }
      });
  }

  loadUsers(): void {
    this.http.get<User[]>(`${this.apiUrl}/admin/users`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.users = data;
          this.filterUsers();
        },
        error: () => {
          // Données de démo
          this.users = [
            { id: 1, nom: 'Ben Ali', prenom: 'Ahmed', email: 'a.benali@bh.tn', role: 'AGENT_ANTI_FRAUDE', actif: true, dateCreation: '2024-01-15' },
            { id: 2, nom: 'Chahed', prenom: 'Sarra', email: 's.chahed@bh.tn', role: 'AGENT_ANTI_FRAUDE', actif: true, dateCreation: '2024-02-20' },
            { id: 3, nom: 'Trabelsi', prenom: 'Mohamed', email: 'm.trabelsi@bh.tn', role: 'ADMINISTRATEUR', actif: true, dateCreation: '2023-11-05' },
            { id: 4, nom: 'Khelifi', prenom: 'Nour', email: 'n.khelifi@bh.tn', role: 'AGENT_ANTI_FRAUDE', actif: false, dateCreation: '2024-03-10' },
            { id: 5, nom: 'Mansouri', prenom: 'Ines', email: 'i.mansouri@bh.tn', role: 'AGENT_ANTI_FRAUDE', actif: true, dateCreation: '2024-04-01' },
          ];
          this.filterUsers();
        }
      });
  }

  loadLoginHistory(): void {
    this.http.get<LoginHistory[]>(`${this.apiUrl}/admin/login-history`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => { this.loginHistory = data; },
        error: () => {
          this.loginHistory = [
            { id: 1, utilisateur: 'a.benali@bh.tn', date: '2026-05-20', heure: '08:32', adresseIp: '192.168.1.10', statut: 'SUCCÈS' },
            { id: 2, utilisateur: 's.chahed@bh.tn', date: '2026-05-20', heure: '09:15', adresseIp: '192.168.1.11', statut: 'SUCCÈS' },
            { id: 3, utilisateur: 'unknown@ext.com', date: '2026-05-20', heure: '10:02', adresseIp: '41.228.55.3', statut: 'ÉCHEC' },
            { id: 4, utilisateur: 'm.trabelsi@bh.tn', date: '2026-05-19', heure: '17:48', adresseIp: '192.168.1.5', statut: 'SUCCÈS' },
            { id: 5, utilisateur: 'n.khelifi@bh.tn', date: '2026-05-19', heure: '14:21', adresseIp: '192.168.1.14', statut: 'SUCCÈS' },
          ];
        }
      });
  }

  loadSinistres(): void {
    this.http.get<SinistreSuspect[]>(`${this.apiUrl}/admin/sinistres/suspects`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => { this.sinistres = data; },
        error: () => {
          this.sinistres = [
            { id: 1, numeroContrat: 'AUTO-2024-00312', assure: 'Karim Bouzidi', montant: 45000, scoreRisque: 92, statut: 'SUSPECT', dateSignalement: '2026-05-18', typeAssurance: 'Auto' },
            { id: 2, numeroContrat: 'HAB-2024-00187', assure: 'Fatma Snoussi', montant: 120000, scoreRisque: 87, statut: 'EN_ANALYSE', dateSignalement: '2026-05-17', typeAssurance: 'Habitation' },
            { id: 3, numeroContrat: 'VIE-2025-00054', assure: 'Tarek Maaloul', montant: 250000, scoreRisque: 78, statut: 'CONFIRMÉ', dateSignalement: '2026-05-15', typeAssurance: 'Vie' },
            { id: 4, numeroContrat: 'AUTO-2025-00891', assure: 'Amina Gharbi', montant: 32000, scoreRisque: 65, statut: 'EN_ANALYSE', dateSignalement: '2026-05-14', typeAssurance: 'Auto' },
            { id: 5, numeroContrat: 'SAN-2024-00445', assure: 'Hassen Dridi', montant: 18500, scoreRisque: 71, statut: 'SUSPECT', dateSignalement: '2026-05-20', typeAssurance: 'Santé' },
          ];
        }
      });
  }

  filterUsers(): void {
    const q = this.searchQuery.toLowerCase();
    this.filteredUsers = this.users.filter(u =>
      (u.nom || '').toLowerCase().includes(q) ||
      (u.prenom || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q)
    );
    this.currentPage = 1;
  }

  get paginatedUsers(): User[] {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    return this.filteredUsers.slice(start, start + this.itemsPerPage);
  }

  

  get totalPages(): number {
    return Math.ceil(this.filteredUsers.length / this.itemsPerPage);
  }

  get paginatedHistory(): LoginHistory[] {
    const start = (this.historyPage - 1) * 5;
    return this.loginHistory.slice(start, start + 5);
  }

  get totalHistoryPages(): number {
    return Math.ceil(this.loginHistory.length / 5);
  }

  get filteredSinistres(): SinistreSuspect[] {
    if (this.sinistresFilter === 'TOUS') return this.sinistres;
    return this.sinistres.filter(s => s.statut === this.sinistresFilter);
  }

  addUser(): void {
    if (!this.newUser.nom || !this.newUser.email || !this.newUser.motDePasse) return;
    this.loading = true;
    this.http.post<User>(`${this.apiUrl}/admin/users`, this.newUser, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (user) => {
          this.users.push(user);
          this.filterUsers();
          this.loadStats();
          this.closeModal();
          this.showNotification('Utilisateur ajouté avec succès', 'success');
          this.loading = false;
        },
        error: () => {
          // Simulation locale pour démo
          const demo: User = {
            id: this.users.length + 1,
            ...this.newUser,
            actif: true,
            dateCreation: new Date().toISOString().split('T')[0]
          };
          this.users.push(demo);
          this.filterUsers();
          this.closeModal();
          this.showNotification('Utilisateur ajouté (mode démo)', 'info');
          this.loading = false;
        }
      });
  }

  confirmDelete(user: User): void {
    this.userToDelete = user;
    this.showDeleteConfirm = true;
  }

  deleteUser(): void {
    if (!this.userToDelete) return;
    this.http.delete(`${this.apiUrl}/admin/users/${this.userToDelete.id}`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.users = this.users.filter(u => u.id !== this.userToDelete!.id);
          this.filterUsers();
          this.loadStats();
          this.showNotification('Utilisateur supprimé', 'success');
        },
        error: () => {
          this.users = this.users.filter(u => u.id !== this.userToDelete!.id);
          this.filterUsers();
          this.showNotification('Utilisateur supprimé (mode démo)', 'info');
        }
      });
    this.showDeleteConfirm = false;
    this.userToDelete = null;
  }

  toggleUserStatus(user: User): void {
    this.http.patch(`${this.apiUrl}/admin/users/${user.id}/toggle`, {}, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { user.actif = !user.actif; },
        error: () => { user.actif = !user.actif; }
      });
  }

  closeModal(): void {
    this.showAddUserModal = false;
    this.newUser = { nom: '', prenom: '', email: '', role: 'AGENT_ANTI_FRAUDE', motDePasse: '' };
  }

  showNotification(message: string, type: 'success' | 'error' | 'info'): void {
    this.alertMessage = message;
    this.alertType = type;
    this.showAlert = true;
    setTimeout(() => { this.showAlert = false; }, 4000);
  }

  getRiskColor(score: number): string {
    if (score >= 85) return '#ef4444';
    if (score >= 65) return '#f97316';
    return '#eab308';
  }

  getRiskLabel(score: number): string {
    if (score >= 85) return 'CRITIQUE';
    if (score >= 65) return 'ÉLEVÉ';
    return 'MODÉRÉ';
  }

  getInitials(nom?: string, prenom?: string): string {
    const p = prenom?.charAt(0) || '';
    const n = nom?.charAt(0) || '';
    return (p + n).toUpperCase() || '?';
  }

  getBarHeight(value: number, max: number): number {
    return (value / max) * 100;
  }

  get maxSinistreMois(): number {
    return Math.max(...this.chartData.sinistresParMois);
  }

  readonly mois = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

  setTab(tab: 'dashboard' | 'utilisateurs' | 'sinistres' | 'securite'): void {
    this.activeTab = tab;
  }

  toggleTheme(): void {
    this.darkMode = !this.darkMode;
    const shell = document.querySelector('.shell');
    if (shell) {
      this.darkMode
        ? shell.setAttribute('data-theme', 'dark')
        : shell.removeAttribute('data-theme');
    }
  }

  logout(): void {
    localStorage.clear();
    window.location.href = '/login';
  }
}