import { Component, OnInit, OnDestroy, ViewEncapsulation, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders, HttpClientModule } from '@angular/common/http';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Pipe({ name: 'historyFilter', standalone: true })
export class HistoryFilterPipe implements PipeTransform {
  transform(items: any[], statut: string): any[] {
    if (!items) return [];
    return items.filter(h => h.statut === statut);
  }
}

@Pipe({ name: 'length', standalone: true })
export class LengthPipe implements PipeTransform {
  transform(items: any[]): number { return items?.length || 0; }
}

export interface User {
  id: number; username?: string; nom?: string; prenom?: string;
  email?: string; role: 'ADMINISTRATEUR' | 'AGENT_ANTI_FRAUDE';
  actif: boolean; dateCreation?: string;
}

export interface LoginHistory {
  id: number; utilisateur: string; date: string; heure: string;
  adresseIp?: string; statut?: 'SUCCÈS' | 'ÉCHEC';
}

export interface DashboardStats {
  totalUtilisateurs: number; administrateurs: number; agentsAntiFraude: number;
  totalSinistres: number; sinistresEnCours: number; sinistresValides: number;
  sinistresRejetes: number; tauxFraude: number; alertesActives: number; contratsAnalyses: number;
}

export interface SinistreSuspect {
  id: string | number; numeroContrat: string; assure: string;
  montant: number; scoreRisque: number;
  statut: 'SUSPECT' | 'EN_ANALYSE' | 'CONFIRMÉ' | 'REJETÉ';
  dateSignalement: string; typeAssurance: string;
  natureSinistre?: string; typeSinistre?: string; gouvernorat?: string;
  lieuAccident?: string; dateSurvenance?: string; dateOuverture?: string;
  libEtatSinistre?: string; nombreBlesses?: number; nombreDeces?: number;
  totalSapFinal?: number; cumulReglement?: number; codeTypeContrat?: string;
  decisionAgent?: string; commentaireAgent?: string; dateDecision?: string;
  agentUsername?: string; motifs?: string;
  scoreML?: number; scoreHeuristique?: number; scoreGlobal?: number;
}

export interface ConfigScoring {
  id: number; cle: string; valeur: number; description: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HttpClientModule, HistoryFilterPipe, LengthPipe],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.scss'],
  encapsulation: ViewEncapsulation.None
})
export class AdminDashboardComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();
  private apiUrl = 'http://localhost:8082/api';

  activeTab: 'dashboard' | 'utilisateurs' | 'sinistres' | 'historique' | 'decisions' | 'configuration' = 'dashboard';
  sidebarOpen = true;
  darkMode = false;
  showAddUserModal = false;
  showEditUserModal = false;
  showDeleteConfirm = false;
  userToDelete: User | null = null;
  userToEdit: User | null = null;
  loading = false;
  searchQuery = '';
  currentPage = 1;
  historyPage = 1;
  itemsPerPage = 8;
  alertMessage = '';
  alertType: 'success' | 'error' | 'info' = 'info';
  showAlert = false;

  historyDateFilter: 'ALL' | 'TODAY' | 'WEEK' | 'MONTH' = 'ALL';
  historyFiltered: LoginHistory[] = [];

  sinistresSearch = '';
  sinistresFilter: 'TOUS' | 'CRITIQUE' | 'RISQUE_MODERE' | 'CONFORME' = 'TOUS';
  sinistresFiltered: SinistreSuspect[] = [];
  sinistresDateFilter: 'ALL' | 'WEEK' | 'MONTH' | 'QUARTER' = 'ALL';

  ficheOpen = false;
  ficheSelected: SinistreSuspect | null = null;

  decisions: any[] = [];
  decisionsFiltered: any[] = [];
  decisionsSearch = '';
  decisionsFilter = 'TOUS';
  decisionsStats = { total: 0, fraude: 0, conforme: 0, risqueModere: 0 };

  // Config scoring
  configScoring: ConfigScoring[] = [];
  configLoading = false;
  recalculLoading = false;
  recalculResult: any = null;

  stats: DashboardStats = {
    totalUtilisateurs: 0, administrateurs: 0, agentsAntiFraude: 0,
    totalSinistres: 0, sinistresEnCours: 0, sinistresValides: 0,
    sinistresRejetes: 0, tauxFraude: 0, alertesActives: 0, contratsAnalyses: 0
  };
  users: User[] = [];
  loginHistory: LoginHistory[] = [];
  sinistres: SinistreSuspect[] = [];
  filteredUsers: User[] = [];
  currentUser: any = null;

  chartData = {
    sinistresParMois: [0,0,0,0,0,0,0,0,0,0,0,0],
    fraudeParType: [
      { label: 'Auto',       value: 0, count: 0, color: '#ef4444' },
      { label: 'Corporel',   value: 0, count: 0, color: '#f97316' },
      { label: 'Matériel',   value: 0, count: 0, color: '#eab308' },
      { label: 'Habitation', value: 0, count: 0, color: '#22c55e' },
    ]
  };

  newUser = {
    nom: '', prenom: '', email: '',
    role: 'AGENT_ANTI_FRAUDE' as 'ADMINISTRATEUR' | 'AGENT_ANTI_FRAUDE',
    motDePasse: ''
  };

  editUserForm = {
    id: 0, nom: '', prenom: '', email: '',
    role: 'AGENT_ANTI_FRAUDE' as 'ADMINISTRATEUR' | 'AGENT_ANTI_FRAUDE',
    motDePasse: ''
  };

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    this.loadAllData();
    this.loadCharts();
    interval(30000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.loadStats();
      this.loadMonthlySinistres();
      this.loadFraudeByType();
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({ 'Content-Type': 'application/json' });
  }

  loadAllData(): void {
    this.loadStats();
    this.loadMonthlySinistres();
    this.loadFraudeByType();
    this.loadUsers();
    this.loadLoginHistory();
    this.loadSinistres();
    this.loadDecisions();
    this.loadConfigScoring();
  }

  loadStats(): void {
    this.http.get<DashboardStats>(`${this.apiUrl}/admin/stats`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (d) => { this.stats = d; }, error: () => {} });
  }

  loadMonthlySinistres(): void {
    this.http.get<any>(`${this.apiUrl}/admin/stats/monthly-sinistres`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (d) => { if (d?.data) this.chartData.sinistresParMois = d.data; }, error: () => {} });
  }

  loadFraudeByType(): void {
    this.http.get<any>(`${this.apiUrl}/admin/stats/fraude-by-type`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (d) => { if (d?.data?.length > 0) this.chartData.fraudeParType = d.data; }, error: () => {} });
  }

  getDonutGradient(): string {
    if (!this.chartData.fraudeParType?.length) return 'conic-gradient(#e2e8f0 0% 100%)';
    let cumulative = 0;
    const segments = this.chartData.fraudeParType.map(item => {
      const start = cumulative;
      cumulative += item.value;
      return `${item.color} ${start}% ${cumulative}%`;
    });
    return `conic-gradient(${segments.join(', ')})`;
  }

  loadUsers(): void {
    this.http.get<User[]>(`${this.apiUrl}/admin/users`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (d) => { this.users = d; this.filterUsers(); }, error: () => {} });
  }

  loadLoginHistory(): void {
    this.http.get<LoginHistory[]>(`${this.apiUrl}/admin/login-history`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (d) => { this.loginHistory = d as any; this.applyHistoryDateFilter(); }, error: () => {} });
  }

  loadSinistres(): void {
    this.http.get<SinistreSuspect[]>(`${this.apiUrl}/admin/sinistres/suspects`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (d) => { this.sinistres = d; this.filterSinistres(); }, error: () => {} });
  }

  loadDecisions(): void {
    this.http.get<any[]>(`${this.apiUrl}/admin/decisions`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (d) => { this.decisions = d; this.filterDecisions(); }, error: () => {} });
    this.loadDecisionsStats();
  }

  loadDecisionsStats(): void {
    this.http.get<any>(`${this.apiUrl}/admin/decisions/stats`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (d) => { this.decisionsStats = d; }, error: () => {} });
  }

  // ── Config Scoring ──────────────────────────────────────────────────────────

  loadConfigScoring(): void {
    this.http.get<any[]>(`${this.apiUrl}/sinistres/config-scoring`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (d) => {
          this.configScoring = d as ConfigScoring[];
          this.configLoading = false;
          console.log('[BHGuard] config chargée:', this.configScoring.length);
        },
        error: (err) => {
          this.configLoading = false;
          console.error('[BHGuard] config ERREUR:', err);
        }
      });
  }

  reloadConfig(): void {
    this.configScoring = [];
    this.configLoading = false;
    setTimeout(() => this.loadConfigScoring(), 100);
  }

  saveConfig(cfg: ConfigScoring): void {
    this.http.put(`${this.apiUrl}/sinistres/config-scoring/${cfg.id}`, { valeur: cfg.valeur }, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.showNotification(`"${cfg.description}" mis à jour`, 'success'); },
        error: () => { this.showNotification('Erreur sauvegarde', 'error'); }
      });
  }

  recalculerScores(): void {
    this.recalculLoading = true;
    this.recalculResult = null;
    this.http.post<any>(`${this.apiUrl}/sinistres/recalculer-scores-global`, {}, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (d) => {
          this.recalculResult = d;
          this.recalculLoading = false;
          this.showNotification(`${d.traites} scores recalculés en ${d.dureeMs}ms`, 'success');
        },
        error: () => {
          this.recalculLoading = false;
          this.showNotification('Erreur recalcul scores', 'error');
        }
      });
  }

  getConfigLabel(cle: string): string {
    const labels: any = {
      'poids_formule':         'Poids Score Heuristique',
      'poids_ml':              'Poids Score ML',
      'montant_500k_pts':      'Montant ≥ 500 000 TND',
      'montant_200k_pts':      'Montant ≥ 200 000 TND',
      'montant_100k_pts':      'Montant ≥ 100 000 TND',
      'montant_50k_pts':       'Montant ≥ 50 000 TND',
      'montant_20k_pts':       'Montant ≥ 20 000 TND',
      'montant_10k_pts':       'Montant ≥ 10 000 TND',
      'deces_pts':             'Décès déclaré(s)',
      'blesses_3_pts':         'Blessés > 3',
      'blesses_1_pts':         'Blessés ≥ 1',
      'responsabilite_pts':    'Responsabilité totale',
      'reglement_suspect_pts': 'Règlement suspect',
      'nature_corporel_pts':   'Nature CORPOREL',
      'blesses_pts':           'Blessés > 1',
    };
    return labels[cle] || cle;
  }

  getConfigGroup(cle: string): string {
    if (cle.startsWith('poids')) return 'Formule Composite';
    if (cle.startsWith('montant')) return 'Montant';
    if (cle.includes('deces') || cle.includes('blesses')) return 'Victimes';
    return 'Autres Signaux';
  }

  getConfigGroups(): string[] {
    const groups = new Set(this.configScoring.map(c => this.getConfigGroup(c.cle)));
    return Array.from(groups);
  }

  getConfigByGroup(group: string): ConfigScoring[] {
    return this.configScoring.filter(c => this.getConfigGroup(c.cle) === group);
  }

  // ── Décisions ───────────────────────────────────────────────────────────────

  setDecisionsFilter(f: string): void { this.decisionsFilter = f; this.filterDecisions(); }

  filterDecisions(): void {
    let list = this.decisions;
    if (this.decisionsFilter !== 'TOUS') list = list.filter(d => d.decision === this.decisionsFilter);
    if (this.decisionsSearch.trim()) {
      const q = this.decisionsSearch.toLowerCase();
      list = list.filter(d =>
        d.numSinistre?.toLowerCase().includes(q) ||
        d.agentUsername?.toLowerCase().includes(q) ||
        d.decision?.toLowerCase().includes(q) ||
        d.niveauRisque?.toLowerCase().includes(q)
      );
    }
    this.decisionsFiltered = list;
  }

  get filteredDecisions(): any[] { return this.decisionsFiltered; }

  openFiche(s: SinistreSuspect): void { this.ficheSelected = s; this.ficheOpen = true; }
  closeFiche(): void { this.ficheOpen = false; setTimeout(() => { this.ficheSelected = null; }, 300); }

  setSinistresFilter(f: any): void { this.sinistresFilter = f; this.filterSinistres(); }
  setSinistresDateFilter(f: 'ALL' | 'WEEK' | 'MONTH' | 'QUARTER'): void { this.sinistresDateFilter = f; this.filterSinistres(); }

  get countCritiques():    number { return this.sinistres.filter(s => s.scoreRisque >= 75).length; }
  get countRisqueModere(): number { return this.sinistres.filter(s => s.scoreRisque >= 40 && s.scoreRisque < 75).length; }
  get countConformes():    number { return this.sinistres.filter(s => s.scoreRisque < 40).length; }

  filterSinistres(): void {
    let list = this.sinistres;
    if (this.sinistresFilter === 'CRITIQUE')      list = list.filter(s => s.scoreRisque >= 75);
    if (this.sinistresFilter === 'RISQUE_MODERE') list = list.filter(s => s.scoreRisque >= 40 && s.scoreRisque < 75);
    if (this.sinistresFilter === 'CONFORME')      list = list.filter(s => s.scoreRisque < 40);
    if (this.sinistresDateFilter !== 'ALL') {
      const now = new Date();
      let cutoff = new Date();
      if (this.sinistresDateFilter === 'WEEK')    cutoff.setDate(now.getDate() - 7);
      if (this.sinistresDateFilter === 'MONTH')   cutoff.setMonth(now.getMonth() - 1);
      if (this.sinistresDateFilter === 'QUARTER') cutoff.setMonth(now.getMonth() - 3);
      list = list.filter(s => new Date(s.dateSignalement) >= cutoff);
    }
    if (this.sinistresSearch.trim()) {
      const q = this.sinistresSearch.toLowerCase();
      list = list.filter(s =>
        s.id?.toString().toLowerCase().includes(q) ||
        s.numeroContrat?.toString().toLowerCase().includes(q) ||
        s.typeAssurance?.toLowerCase().includes(q) ||
        s.gouvernorat?.toLowerCase().includes(q) ||
        (s.decisionAgent && s.decisionAgent.toLowerCase().includes(q))
      );
    }
    this.sinistresFiltered = list;
  }

  get filteredSinistres(): SinistreSuspect[] { return this.sinistresFiltered; }

  filterUsers(): void {
    const q = this.searchQuery.toLowerCase();
    this.filteredUsers = this.users.filter(u =>
      (u.nom || '').toLowerCase().includes(q) ||
      (u.prenom || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
    this.currentPage = 1;
  }

  setHistoryDateFilter(filter: 'ALL' | 'TODAY' | 'WEEK' | 'MONTH'): void {
    this.historyDateFilter = filter;
    this.applyHistoryDateFilter();
  }

  applyHistoryDateFilter(): void {
    const now = new Date();
    let filtered = [...this.loginHistory];
    if (this.historyDateFilter !== 'ALL') {
      filtered = filtered.filter(h => {
        if (!h.date || h.date === '—') return false;
        const parts = h.date.split('-');
        if (parts.length < 3) return false;
        const hDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        if (this.historyDateFilter === 'TODAY')  return hDate.toDateString() === now.toDateString();
        if (this.historyDateFilter === 'WEEK')   { const w = new Date(now); w.setDate(now.getDate()-7); return hDate >= w; }
        if (this.historyDateFilter === 'MONTH')  { const m = new Date(now); m.setMonth(now.getMonth()-1); return hDate >= m; }
        return true;
      });
    }
    this.historyFiltered = filtered;
    this.historyPage = 1;
  }

  get paginatedHistory(): LoginHistory[] {
    const start = (this.historyPage - 1) * 8;
    return this.historyFiltered.slice(start, start + 8);
  }
  get totalHistoryPages(): number { return Math.ceil(this.historyFiltered.length / 8); }
  get paginatedUsers(): User[] {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    return this.filteredUsers.slice(start, start + this.itemsPerPage);
  }
  get totalPages(): number { return Math.ceil(this.filteredUsers.length / this.itemsPerPage); }

  addUser(): void {
    if (!this.newUser.nom || !this.newUser.email || !this.newUser.motDePasse) {
      this.showNotification('Veuillez remplir tous les champs obligatoires', 'error');
      return;
    }
    this.loading = true;
    const payload = {
      nom: this.newUser.nom, prenom: this.newUser.prenom, email: this.newUser.email,
      username: (this.newUser.prenom.charAt(0) + this.newUser.nom).toLowerCase().replace(/\s/g, ''),
      password: this.newUser.motDePasse, role: this.newUser.role, actif: true
    };
    this.http.post<User>(`${this.apiUrl}/admin/users`, payload, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (u) => { this.users.push(u); this.filterUsers(); this.loadStats(); this.closeModal(); this.showNotification('Utilisateur ajouté', 'success'); this.loading = false; },
        error: () => {
          const d: User = { id: this.users.length+1, ...payload, actif: true, dateCreation: new Date().toISOString().split('T')[0] };
          this.users.push(d); this.filterUsers(); this.closeModal(); this.showNotification('Ajouté (mode démo)', 'info'); this.loading = false;
        }
      });
  }

  openEditModal(user: User): void {
    this.userToEdit = user;
    this.editUserForm = { id: user.id, nom: user.nom||'', prenom: user.prenom||'', email: user.email||'', role: user.role, motDePasse: '' };
    this.showEditUserModal = true;
  }

  updateUser(): void {
    if (!this.editUserForm.nom || !this.editUserForm.email) { this.showNotification('Nom et email obligatoires', 'error'); return; }
    this.loading = true;
    const payload: any = { nom: this.editUserForm.nom, prenom: this.editUserForm.prenom, email: this.editUserForm.email, role: this.editUserForm.role };
    if (this.editUserForm.motDePasse) payload.password = this.editUserForm.motDePasse;
    this.http.put<User>(`${this.apiUrl}/admin/users/${this.editUserForm.id}`, payload, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (u) => { const i = this.users.findIndex(x => x.id===u.id); if (i!==-1) this.users[i]=u; this.filterUsers(); this.closeEditModal(); this.showNotification('Modifié avec succès', 'success'); this.loading = false; },
        error: () => { const i = this.users.findIndex(x => x.id===this.editUserForm.id); if (i!==-1) { this.users[i].nom=this.editUserForm.nom; this.users[i].prenom=this.editUserForm.prenom; this.users[i].email=this.editUserForm.email; this.users[i].role=this.editUserForm.role; } this.filterUsers(); this.closeEditModal(); this.showNotification('Modifié (démo)', 'info'); this.loading = false; }
      });
  }

  confirmDelete(user: User): void { this.userToDelete = user; this.showDeleteConfirm = true; }

  deleteUser(): void {
    if (!this.userToDelete) return;
    this.http.delete(`${this.apiUrl}/admin/users/${this.userToDelete.id}`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.users = this.users.filter(u => u.id !== this.userToDelete!.id); this.filterUsers(); this.loadStats(); this.showNotification('Supprimé', 'success'); },
        error: () => { this.users = this.users.filter(u => u.id !== this.userToDelete!.id); this.filterUsers(); this.showNotification('Supprimé (démo)', 'info'); }
      });
    this.showDeleteConfirm = false;
    this.userToDelete = null;
  }

  toggleUserStatus(user: User): void {
    this.http.patch(`${this.apiUrl}/admin/users/${user.id}/toggle`, {}, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: () => { user.actif = !user.actif; }, error: () => { user.actif = !user.actif; } });
  }

  closeModal(): void { this.showAddUserModal = false; this.newUser = { nom:'', prenom:'', email:'', role:'AGENT_ANTI_FRAUDE', motDePasse:'' }; }
  closeEditModal(): void { this.showEditUserModal = false; this.userToEdit = null; this.editUserForm = { id:0, nom:'', prenom:'', email:'', role:'AGENT_ANTI_FRAUDE', motDePasse:'' }; }

  showNotification(message: string, type: 'success' | 'error' | 'info'): void {
    this.alertMessage = message; this.alertType = type; this.showAlert = true;
    setTimeout(() => { this.showAlert = false; }, 4000);
  }

  getConnexionsParUser(username: string): number {
    return this.loginHistory.filter(h =>
      h.utilisateur === username && h.statut === 'SUCCÈS'
    ).length;
  }

  getMaxConnexions(): number {
    const max = Math.max(...this.users.map(u =>
      this.getConnexionsParUser(u.username || '')
    ));
    return max > 0 ? max : 1;
  }

  getRiskColor(score: number): string { if (score >= 85) return '#ef4444'; if (score >= 65) return '#f97316'; return '#eab308'; }
  getRiskLabel(score: number): string { if (score >= 85) return 'CRITIQUE'; if (score >= 65) return 'ÉLEVÉ'; return 'MODÉRÉ'; }
  getInitials(nom?: string, prenom?: string): string { return ((prenom?.charAt(0)||'')+(nom?.charAt(0)||'')).toUpperCase()||'?'; }
  getBarHeight(value: number, max: number): number { if (max===0) return 0; return (value/max)*100; }
  get maxSinistreMois(): number { const m = Math.max(...this.chartData.sinistresParMois); return m>0?m:1; }
  readonly mois = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  readonly currentMonth = new Date().getMonth();

  setTab(tab: 'dashboard' | 'utilisateurs' | 'sinistres' | 'historique' | 'decisions' | 'configuration'): void {
    this.activeTab = tab;
    if (tab === 'sinistres') this.filterSinistres();
    if (tab === 'historique') this.applyHistoryDateFilter();
    if (tab === 'decisions') this.loadDecisions();
    if (tab === 'dashboard') setTimeout(() => this.loadCharts(), 100);
    if (tab === 'configuration') {
      this.configLoading = false;
      this.loadConfigScoring();
    }
  }

  toggleTheme(): void {
    this.darkMode = !this.darkMode;
    const shell = document.querySelector('.shell');
    if (shell) { this.darkMode ? shell.setAttribute('data-theme','dark') : shell.removeAttribute('data-theme'); }
  }

  logout(): void { localStorage.clear(); window.location.href = '/login'; }

  chartSinistres: any = null;
  chartGouvernorats: any = null;
  chartDecisions: any = null;
  filtreAnnee: string = 'tous';

  loadCharts(): void {
    this.loadChartSinistres();
    this.loadChartGouvernorats();
    this.loadChartDecisions();
  }

  loadChartSinistres(): void {
    this.http.get<any>(`${this.apiUrl}/admin/stats/sinistres-par-mois`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (d) => { this.renderChartSinistres(d); }, error: () => {} });
  }

  loadChartGouvernorats(): void {
    this.http.get<any>(`${this.apiUrl}/admin/stats/gouvernorats`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (d) => { this.renderChartGouvernorats(d); }, error: () => {} });
  }

  loadChartDecisions(): void {
    this.http.get<any>(`${this.apiUrl}/admin/stats/decisions-par-mois`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (d) => { this.renderChartDecisions(d); }, error: () => {} });
  }

  renderChartSinistres(data: any): void {
    const ctx = document.getElementById('chartSinistres') as HTMLCanvasElement;
    if (!ctx) return;
    if (this.chartSinistres) this.chartSinistres.destroy();
    const Chart = (window as any).Chart;
    let labels = data.labels;
    let values = data.data;
    if (this.filtreAnnee !== 'tous') {
      const filtered = labels.map((l: string, i: number) => ({ l, v: values[i] }))
        .filter((x: any) => x.l.startsWith(this.filtreAnnee));
      labels = filtered.map((x: any) => x.l);
      values = filtered.map((x: any) => x.v);
    }
    this.chartSinistres = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Sinistres', data: values, backgroundColor: labels.map((_: any, i: number) => `hsla(${220 + i * 3}, 70%, 55%, 0.8)`), borderRadius: 6, borderSkipped: false }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` ${c.raw.toLocaleString()} sinistres` } } },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } },
          y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: (v: any) => v.toLocaleString() } }
        }
      }
    });
  }

  renderChartGouvernorats(data: any): void {
    const ctx = document.getElementById('chartGouvernorats') as HTMLCanvasElement;
    if (!ctx) return;
    if (this.chartGouvernorats) this.chartGouvernorats.destroy();
    const Chart = (window as any).Chart;
    const colors = ['#1a56db','#ef4444','#22c55e','#f97316','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#6366f1','#84cc16'];
    this.chartGouvernorats = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: data.labels, datasets: [{ data: data.data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { font: { size: 11 }, padding: 12, usePointStyle: true } }, tooltip: { callbacks: { label: (c: any) => ` ${c.label} : ${c.raw.toLocaleString()} sinistres` } } },
        cutout: '65%'
      }
    });
  }

  renderChartDecisions(data: any): void {
    const ctx = document.getElementById('chartDecisions') as HTMLCanvasElement;
    if (!ctx) return;
    if (this.chartDecisions) this.chartDecisions.destroy();
    const Chart = (window as any).Chart;
    this.chartDecisions = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          { label: 'Conformes', data: data.conformes, backgroundColor: '#22c55e', borderRadius: 4 },
          { label: 'Fraudes',   data: data.fraudes,   backgroundColor: '#ef4444', borderRadius: 4 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { usePointStyle: true, font: { size: 11 } } } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: {
            stacked: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: {
              stepSize: 1,
              callback: (v: any) => Number.isInteger(v) ? v : ''
            }
          }
        }
      }
    });
  }

  setFiltreAnnee(annee: string): void {
    this.filtreAnnee = annee;
    this.http.get<any>(`${this.apiUrl}/admin/stats/sinistres-par-mois`, { headers: this.getHeaders() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (d) => { this.renderChartSinistres(d); }, error: () => {} });
  }
}