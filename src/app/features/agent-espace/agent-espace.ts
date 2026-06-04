// =============================================================================
// agent-espace.ts — BHGuard SaaS Premium v6
// PFE BH Assurance Tunisie — Design ultra-professionnel
// =============================================================================

import {
  Component, OnInit, OnDestroy, AfterViewChecked,
  ViewChild, ElementRef, ChangeDetectorRef, HostListener
} from '@angular/core';
import { CommonModule }     from '@angular/common';
import { FormsModule }      from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { Router }           from '@angular/router';
import { FraudService, PredictionResponse, ChatMessage } from '../../services/fraud.service';

interface Alerte  { id:string; num:string; score:number; time:string; lue:boolean; }
interface Decision{ date:Date; agent:string; num:string; statut:string; score:number; commentaire?:string; }
interface SinistreItem {
  numSinistre:string; gouvernorat:string; natureSinistre:string;
  montantEvaluation:number; libEtatSinistre:string; nombreBlesses:number;
  nombreDeces:number; codeResponsabilite:string;
  score?:number; suspect?:boolean; decision?:'CONFORME'|'FRAUDE';
  motifs?:string[]; mlAnalysed?:boolean; scoreEstime?:boolean;
}

@Component({
  selector:'app-agent-espace',
  standalone:true,
  imports:[CommonModule,FormsModule,HttpClientModule],
  templateUrl: './agent-espace.html',
  styleUrls:   ['./agent-espace.scss'],
})
export class AgentEspaceComponent implements OnInit, OnDestroy, AfterViewChecked {

  @ViewChild('scrollRef') private scrollRef!: ElementRef;

  // ── Utilisateur ───────────────────────────────────────────────────────────
  user = { nom: '', prenom: '', role: 'Agent Anti-Fraude' };
  get userInitials(): string {
    return ((this.user.prenom?.[0] || '') + (this.user.nom?.[0] || 'U')).toUpperCase();
  }

  // ── État ──────────────────────────────────────────────────────────────────
  tab     : string  = 'dashboard';
  mini    : boolean = false;
  apiOk   : boolean = false;
  today   : Date    = new Date();
  chatOpen: boolean = false;
  private timers: any[] = [];

  // ── Stats ─────────────────────────────────────────────────────────────────
  totalSinistres : number = 0;
  sinistresEleves: number = 0;
  nbAnalyses     : number = 0;
  totalPages     : number = 1;
  page           : number = 0;
  dashboardSample: any[]  = [];
  listError      : string = '';

  govs = [
    { n:'Tunis',   p:78, c:'#1a56db' },
    { n:'Sfax',    p:62, c:'#3b82f6' },
    { n:'Sousse',  p:45, c:'#f59e0b' },
    { n:'Bizerte', p:38, c:'#ea580c' },
    { n:'Nabeul',  p:29, c:'#dc2626' },
  ];

  // ── Analyse ───────────────────────────────────────────────────────────────
  numInput     : string             = '';
  loading      : boolean            = false;
  lStep        : number             = 0;
  resultat     : PredictionResponse | null = null;
  decisionPrise: 'CONFORME' | 'FRAUDE' | null = null;
  dernieres    : any[]              = [];
  searchQ      : string             = '';

  // ── Décisions ─────────────────────────────────────────────────────────────
  decisions: Decision[] = [];
  get conformes(): number { return this.decisions.filter(d => d.statut === 'CONFORME').length; }
  get fraudes()  : number { return this.decisions.filter(d => d.statut === 'FRAUDE').length; }

  // ── Liste ─────────────────────────────────────────────────────────────────
  sinistres : SinistreItem[] = [];
  tfilt     : string = '';
  filtGov   : string = '';
  filtNature: string = '';
  filtRisque: string = '';
  pageInput : number = 1;

  listGovs   : string[] = [];
  listNatures: string[] = [];
  get sinistresAffiches(): SinistreItem[] {
    // niveau/gouvernorat/nature sont filtrés côté backend — ici uniquement le texte libre.
    const q = this.tfilt.toLowerCase().trim();
    if (!q) return this.sinistres;
    return this.sinistres.filter(s =>
      (s.numSinistre    || '').toLowerCase().includes(q) ||
      (s.gouvernorat    || '').toLowerCase().includes(q) ||
      (s.natureSinistre || '').toLowerCase().includes(q)
    );
  }

  // ── Dashboard (données backend) ───────────────────────────────────────────
  dashData: any = null;
  evoFilter: string = 'tous';
  govAnnee: string = '';
  govLoading: boolean = false;
  private dashRefreshInterval: any = null;
  private histoRefreshInterval: any = null;
  get tauxValides(): number {
    if (!this.decisions.length) return 0;
    return Math.round(this.conformes * 100 / this.decisions.length);
  }

  // ── Alertes ───────────────────────────────────────────────────────────────
  bellOpen : boolean  = false;
  usrOpen  : boolean  = false;
  newAlert : boolean  = false;
  alertes  : Alerte[] = [];
  get unread(): number { return this.alertes.filter(a => !a.lue).length; }

  // ── Chat ──────────────────────────────────────────────────────────────────
  msgInp  : string        = '';
  msgs    : ChatMessage[] = [];
  typing  : boolean       = false;
  inpFocus: boolean       = false;

  sugs = [
    'Pourquoi ce sinistre est-il suspect ?',
    'Génère un rapport d\'audit',
    'Quels éléments vérifier en priorité ?',
    'Résume les points clés du dossier'
  ];

  private currentSinistreData: any = {};
  userLogin     : string        = '';
  pendingDecision : string | null = null;
  commentaireFraude: string     = '';
  decisionLoading  : boolean    = false;

  constructor(
    private svc   : FraudService,
    private cdr   : ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    const stored = localStorage.getItem('currentUser');
    if (stored) {
      const u = JSON.parse(stored);
      this.user = {
        nom   : u.nom    || u.username || 'Utilisateur',
        prenom: u.prenom || '',
        role  : u.role   || 'Agent Anti-Fraude'
      };
      this.userLogin = u.username || (u.prenom + ' ' + u.nom) || 'agent';
    }
    // Restaurer les alertes persistées (survive au refresh)
    try {
      const saved = localStorage.getItem('bhguard_alertes');
      if (saved) this.alertes = JSON.parse(saved);
    } catch {}
    // Polling automatique jusqu'à ce que FastAPI soit en ligne
    this.pollApi();
    // Charger les sinistres + listes de filtres depuis Spring Boot au démarrage
    this.loadList();
    this.loadDashboardSample();
    this.loadDashboard();
    this.loadHistoriqueAgent();
    this.histoRefreshInterval = setInterval(() => {
      this.loadHistoriqueAgent();
    }, 30_000);
    this.svc.getNatures().subscribe({
      next: (data) => {
        this.listNatures = (data || []).filter(n => !!n && n.trim().length > 0);
        this.cdr.detectChanges();
      },
      error: (err) => console.error('[BHGuard] /natures erreur:', err?.status, err?.message)
    });
    this.svc.getGouvernorats().subscribe({
      next: (data) => {
        this.listGovs = (data || []).filter(g => !!g && g.trim().length > 0);
        this.cdr.detectChanges();
      },
      error: (err) => console.error('[BHGuard] /gouvernorats erreur:', err?.status, err?.message)
    });
  }

  ngOnDestroy(): void {
    this.timers.forEach(t => clearTimeout(t));
    if (this.dashRefreshInterval) clearInterval(this.dashRefreshInterval);
    if (this.histoRefreshInterval) clearInterval(this.histoRefreshInterval);
  }

  ngAfterViewChecked(): void {
    try {
      if (this.scrollRef)
        this.scrollRef.nativeElement.scrollTop = this.scrollRef.nativeElement.scrollHeight;
    } catch {}
  }

  @HostListener('document:click')
  closeAll(_e?: any): void { this.bellOpen = false; this.usrOpen = false; }

  logout(): void { localStorage.removeItem('currentUser'); this.router.navigate(['/login']); }

  loadStats(): void {
    // totalSinistres and totalPages are updated by loadList()
  }

  private scoreRegle(s: SinistreItem): number {
    let sc = 0;
    const m = s.montantEvaluation || 0;
    if      (m > 100000) sc += 35;
    else if (m > 50000)  sc += 25;
    else if (m > 20000)  sc += 15;
    else if (m > 10000)  sc += 8;
    const deces   = s.nombreDeces   || 0;
    const blesses = s.nombreBlesses || 0;
    if      (deces   > 0)  sc += 40;
    else if (blesses >= 3) sc += 20;
    else if (blesses >= 1) sc += 10;
    const resp = (s.codeResponsabilite || '').trim().toUpperCase();
    if (resp === 'A' || resp === 'E') sc += 15;
    const nature = (s.natureSinistre || '').toUpperCase();
    if (nature.includes('CORPOREL')) sc += 8;
    if (nature.includes('INCENDIE')) sc += 10;
    return Math.min(sc, 100);
  }

  private pollApi(): void {
    this.svc.healthCheck().subscribe({
      next: () => {
        this.apiOk = true;
        this.cdr.detectChanges();
      },
      error: () => {
        this.apiOk = false;
        this.cdr.detectChanges();
        // Réessayer dans 5 secondes si toujours hors ligne
        const t = setTimeout(() => this.pollApi(), 5000);
        this.timers.push(t);
      }
    });
  }

  private pollSpring(): void {
    const t = setTimeout(() => this.loadList(), 4000);
    this.timers.push(t);
  }

  loadList(): void {
    this.svc.getSinistres(this.page, 20, this.filtRisque, this.filtGov, this.filtNature).subscribe({
      next: (d) => {
        // Spring Boot returns {error:"...", sinistres:[], totalElements:0} on DB failure.
        // Preserve existing data instead of wiping the list.
        if (d.error) {
          this.listError = d.error as string;
          this.cdr.detectChanges();
          return;
        }
        this.listError = '';
        this.totalSinistres = d.totalElements || 0;
        this.totalPages     = d.totalPages || Math.ceil((d.totalElements || 0) / 20) || 1;
        this.pageInput      = this.page + 1;
        this.sinistres = (d.sinistres || []).map((s: any) => {
          const numTrimmed = (s.numSinistre || '').trim();
          const score = s.scoreGlobal != null && Number(s.scoreGlobal) > 0
              ? Number(s.scoreGlobal)
              : s.scoreRisque != null ? Number(s.scoreRisque) : undefined;
          const estimated  = s.scoreEstime === true;

          const item: SinistreItem = {
            numSinistre        : numTrimmed,
            gouvernorat        : (s.gouvernorat        || '—').trim(),
            natureSinistre     : (s.natureSinistre     || '—').trim(),
            montantEvaluation  : s.montantEvaluation   || 0,
            libEtatSinistre    : (s.libEtatSinistre    || '—').trim(),
            nombreBlesses      : s.nombreBlesses       || 0,
            nombreDeces        : s.nombreDeces         || 0,
            codeResponsabilite : (s.codeResponsabilite || '').trim().toUpperCase(),
            score              : score,
            decision           : undefined,
            motifs             : [],
            mlAnalysed         : score != null && score > 0,
            scoreEstime        : estimated,
          };
          return item;
        });

        // Peupler la cloche avec les sinistres dont le score ML (BD) >= 75
        const critiques = this.sinistres.filter(s => s.mlAnalysed && (s.score || 0) >= 75);
        critiques.forEach(s => {
          if (!this.alertes.find(a => a.num === s.numSinistre)) {
            this.alertes.unshift({
              id   : s.numSinistre,
              num  : s.numSinistre,
              score: Math.round(s.score!),
              time : 'Score ML chargé depuis BD',
              lue  : false
            });
          }
        });
        if (critiques.length > 0) {
          this.newAlert = true;
          if (this.alertes.length > 20) this.alertes = this.alertes.slice(0, 20);
          this.saveAlertesToStorage();
        }

        this.cdr.detectChanges();
      },
      error: (err: any) => {
        const status = err?.status;
        console.error('[BHGuard] loadList() erreur:', status, err?.error);
        if (status === 0 || status === 503) {
          // Spring Boot pas encore démarré — réessayer
          if (this.page === 0 && this.sinistres.length === 0) this.pollSpring();
        }
        this.cdr.detectChanges();
      }
    });
  }

  private loadDashboardSample(): void {
    // Page 100 contient des sinistres CORPOREL avec de vrais risques
    this.svc.getSinistres(100, 10).subscribe({
      next: (d) => {
        const mapped: SinistreItem[] = (d.sinistres || [])
          .filter((s: any) => s.montantEvaluation >= 10000 || s.nombreDeces > 0 || s.nombreBlesses > 1)
          .slice(0, 5)
          .map((s: any) => {
            const dbScore = s.scoreGlobal != null && Number(s.scoreGlobal) > 0
              ? Number(s.scoreGlobal)
              : s.scoreRisque != null ? Number(s.scoreRisque) : 0;
            const item: SinistreItem = {
              numSinistre       : s.numSinistre,
              gouvernorat       : s.gouvernorat       || '—',
              natureSinistre    : s.natureSinistre    || '—',
              montantEvaluation : s.montantEvaluation || 0,
              libEtatSinistre   : s.libEtatSinistre   || '—',
              nombreBlesses     : s.nombreBlesses     || 0,
              nombreDeces       : s.nombreDeces       || 0,
              codeResponsabilite: s.codeResponsabilite || '',
              score             : dbScore > 0 ? dbScore : undefined,
              decision          : undefined,
              motifs            : [],
              mlAnalysed        : dbScore > 0,
            };
            return item;
          });
        this.dashboardSample = mapped;
        // Pré-alimenter la cloche avec les sinistres à haut risque du sample
        mapped.filter(s => (s.score || 0) >= 75).forEach(s => {
          if (!this.alertes.find(a => a.num === s.numSinistre)) {
            this.alertes.unshift({
              id   : s.numSinistre,
              num  : s.numSinistre,
              score: Math.round(s.score!),
              time : 'Détecté automatiquement',
              lue  : false
            });
          }
        });
        if (mapped.some(s => (s.score || 0) >= 75)) this.newAlert = true;
        this.cdr.detectChanges();
      }
    });
  }

  onNiveauChange(): void {
    this.page      = 0;
    this.pageInput = 1;
    this.loadList();
  }

  goPage(delta: number): void {
    const next = this.page + delta;
    if (next < 0 || next >= this.totalPages) return;
    this.page = next;
    this.pageInput = this.page + 1;
    this.loadList();
  }

  jumpPage(): void {
    const p = Math.max(0, Math.min(this.totalPages - 1, (this.pageInput || 1) - 1));
    if (p !== this.page) { this.page = p; this.pageInput = p + 1; this.loadList(); }
  }

  resetFilters(): void {
    this.tfilt      = '';
    this.filtGov    = '';
    this.filtNature = '';
    this.filtRisque = '';
  }

  doSearch(): void {
    if (this.searchQ.trim()) { this.numInput = this.searchQ; this.tab = 'analyse'; this.analyser(); }
  }

  analyser(): void {
    if (!this.numInput.trim()) return;
    this.loading = true; this.resultat = null; this.decisionPrise = null; this.lStep = 0;
    const t1 = setTimeout(() => { this.lStep = 1; this.cdr.detectChanges(); }, 800);
    const t2 = setTimeout(() => { this.lStep = 2; this.cdr.detectChanges(); }, 1600);
    this.timers.push(t1, t2);

    const num = this.numInput.trim();

    // ── Étape 1 : GET sinistre complet depuis Spring Boot ─────────────────────
    this.svc.getSinistreML(num).subscribe({
      next: (s) => {
        // Construire le payload sans forcer null → 0
        // Les valeurs null/undefined sont omises pour que FastAPI
        // puisse les enrichir depuis sa propre connexion DB
        const payload: any = { NUM_SINISTRE: num };
        if (s.montantEvaluation  != null) payload.MONTANT_EVALUATION  = s.montantEvaluation;
        if (s.nombreBlesses      != null) payload.NOMBRE_BLESSES      = s.nombreBlesses;
        if (s.nombreDeces        != null) payload.NOMBRE_DECES        = s.nombreDeces;
        if (s.codeResponsabilite != null) payload.CODE_RESPONSABILITE = (s.codeResponsabilite || '').trim().toUpperCase();
        if (s.natureSinistre     != null) payload.NATURE_SINISTRE     = (s.natureSinistre     || '').trim();
        if (s.libEtatSinistre    != null) payload.LIB_ETAT_SINISTRE   = (s.libEtatSinistre    || '').trim();
        if (s.numContrat         != null) payload.NUM_CONTRAT         = (s.numContrat         || '').trim();
        if (s.gouvernorat        != null) payload.GOUVERNORAT         = (s.gouvernorat        || '').trim();
        if (s.dateSurvenance     != null) payload.DATE_SURVENANCE     = s.dateSurvenance;
        if (s.dateDeclaration    != null) payload.DATE_DECLARATION    = s.dateDeclaration;
        if (s.typeSinistre       != null) payload.TYPE_SINISTRE       = (s.typeSinistre       || '').trim();
        if (s.lieuAccident       != null) payload.LIEU_ACCIDENT       = (s.lieuAccident       || '').trim();
        if (s.usage              != null) payload.usage               = (s.usage              || '').trim();
        if (s.dateOuverture      != null) payload.DATE_OUVERTURE      = s.dateOuverture;
        if (s.anneeExercice      != null) payload.ANNEE_EXERCICE      = s.anneeExercice;
        if (s.codeTypeContrat    != null) payload.CODE_TYPE_CONTRAT   = (s.codeTypeContrat    || '').trim();
        if (s.cumulReglement     != null) payload.cumul_reglement     = s.cumulReglement;
        if (s.totalSapFinal      != null) payload.Total_SAP_Final     = s.totalSapFinal;

        this.currentSinistreData = payload;
        // Stocker aussi les champs camelCase pour sendMsg()
        this.currentSinistreData.numContrat         = s.numContrat;
        this.currentSinistreData.codeTypeContrat    = s.codeTypeContrat;
        this.currentSinistreData.usage              = s.usage;
        this.currentSinistreData.typeSinistre       = s.typeSinistre;
        this.currentSinistreData.lieuAccident       = s.lieuAccident;
        this.currentSinistreData.dateSurvenance     = s.dateSurvenance;
        this.currentSinistreData.dateDeclaration    = s.dateDeclaration;
        this.currentSinistreData.dateOuverture      = s.dateOuverture;
        this.currentSinistreData.gouvernorat        = s.gouvernorat;
        this.currentSinistreData.natureSinistre     = s.natureSinistre;
        this.currentSinistreData.nombreBlesses      = s.nombreBlesses;
        this.currentSinistreData.nombreDeces        = s.nombreDeces;
        this.currentSinistreData.montantEvaluation  = s.montantEvaluation;
        this.currentSinistreData.cumulReglement     = s.cumulReglement;
        this.currentSinistreData.codeResponsabilite = s.codeResponsabilite;
        this.currentSinistreData.anneeExercice      = s.anneeExercice;

        // ── Étape 2 : POST vers Spring Boot /analyser (qui appelle FastAPI + fallback) ──
        this.svc.analyserViaSprint(num, payload).subscribe({
          next: (r) => this.handleMLResult(r),
          error: () => {
            // Spring Boot indisponible → appeler FastAPI directement
            this.sendML(payload);
          }
        });
      },
      error: () => {
        // Spring Boot GET échoué → analyser via Spring Boot avec payload minimal
        // Spring Boot chargera les données depuis sa DB
        this.svc.analyserViaSprint(num, {}).subscribe({
          next:  (r) => this.handleMLResult(r),
          error: ()  => this.sendML({ NUM_SINISTRE: num })
        });
      }
    });
  }

  private handleMLResult(r: PredictionResponse): void {
    this.resultat = r;
    if (this.resultat.score_formule == null) {
      this.resultat.score_formule = this.resultat.score_risque;
    }
    if (this.resultat.score_ml == null) {
      this.resultat.score_ml = this.resultat.score_risque;
    }
    this.loading  = false;
    this.nbAnalyses++;
    if (r.donnees_sinistre) {
      this.currentSinistreData = { ...this.currentSinistreData, ...r.donnees_sinistre };
    }
    this.dernieres.unshift({ numSinistre: r.num_sinistre, score: r.score_risque });
    if (this.dernieres.length > 10) this.dernieres.pop();
    const rNum = (r.num_sinistre || '').trim();
    const idx  = this.sinistres.findIndex(
      s => s.numSinistre === rNum || s.numSinistre === this.numInput.trim()
    );
    if (idx >= 0) {
      this.sinistres[idx].motifs      = this.buildMotifs(r);
      this.sinistres[idx].mlAnalysed  = true;
      this.sinistres[idx].scoreEstime = false;
      this.sinistres = [...this.sinistres];
    }
    // Recharger depuis DB pour afficher SCORE_GLOBAL persisté
    setTimeout(() => this.loadList(), 1500);
    if (r.score_risque >= 65) this.sinistresEleves++;
    if (r.score_risque >= 75) {
      const existing = this.alertes.findIndex(a => a.num === r.num_sinistre);
      if (existing >= 0) {
        // Re-analyse du même sinistre : rafraîchir et remonter en tête
        const updated = { ...this.alertes[existing], score: Math.round(r.score_risque), time: 'À l\'instant', lue: false };
        this.alertes.splice(existing, 1);
        this.alertes.unshift(updated);
      } else {
        this.alertes.unshift({
          id: r.num_sinistre, num: r.num_sinistre,
          score: Math.round(r.score_risque), time: 'À l\'instant', lue: false
        });
      }
      if (this.alertes.length > 20) this.alertes = this.alertes.slice(0, 20);
      this.newAlert = true;
      this.saveAlertesToStorage();
    }
    this.msgs = [];
    this.cdr.detectChanges();
  }

  private buildMotifs(r: PredictionResponse): string[] {
    const m: string[] = [];
    if (r.score_risque >= 75) m.push('Score Critique');
    if (r.flags_detectes?.some(f => f.toLowerCase().includes('montant'))) m.push('Montant Élevé');
    if (r.flags_detectes?.some(f => f.toLowerCase().includes('tardive'))) m.push('Déclaration Tardive');
    if (r.flags_detectes?.some(f => f.toLowerCase().includes('contrat'))) m.push('Contrat Récent');
    if (r.flags_detectes?.some(f => f.toLowerCase().includes('zone')))    m.push('Zone Suspecte');
    if (r.flags_detectes?.some(f => f.toLowerCase().includes('weekend'))) m.push('Accident Week-end');
    return m.slice(0, 4);
  }

  private sendML(p: any): void {
    this.currentSinistreData = { ...this.currentSinistreData, ...p };
    this.svc.predire(p).subscribe({
      next:  (r) => this.handleMLResult(r),
      error: () => {
        this.loading = false;
        this.msgs.push({
          role: 'assistant',
          content: 'Le serveur d\'analyse IA (FastAPI) est hors ligne. Lancez le backend Python avec **start.bat**.',
          timestamp: new Date()
        });
        this.cdr.detectChanges();
      }
    });
  }

  saveDecision(statut: 'CONFORME' | 'FRAUDE'): void {
    if (!this.resultat) return;
    if (statut === 'FRAUDE') { this.pendingDecision = 'FRAUDE'; this.commentaireFraude = ''; return; }
    this.persistDecision(statut, '');
  }

  confirmDecision(statut: 'CONFORME' | 'FRAUDE'): void {
    if (!this.resultat) return;
    if (statut === 'FRAUDE' && !this.commentaireFraude.trim()) return;
    this.pendingDecision = null;
    this.persistDecision(statut, this.commentaireFraude.trim());
  }

  private persistDecision(statut: 'CONFORME' | 'FRAUDE', commentaire: string): void {
    if (!this.resultat) return;
    const num = this.resultat.num_sinistre;

    // Mise à jour optimiste locale
    this.decisionPrise = statut;
    const idx = this.sinistres.findIndex(s => s.numSinistre === num);
    if (idx >= 0) this.sinistres[idx].decision = statut;
    const localDecision: Decision = {
      date     : new Date(),
      agent    : this.user.prenom + ' ' + this.user.nom,
      num,
      statut,
      score    : Math.round(this.resultat.score_risque),
      commentaire
    };
    this.decisions.unshift(localDecision);
    this.cdr.detectChanges();

    // Sauvegarde backend
    this.decisionLoading = true;
    const payload = {
      agentUsername   : this.userLogin || (this.user.prenom + ' ' + this.user.nom),
      decision        : statut,
      scoreRisque     : Math.round(this.resultat.score_risque),
      niveauRisque    : this.resultat.niveau_risque || '',
      motifs          : (this.resultat.flags_detectes || []).join(','),
      commentaireAgent: commentaire
    };
    this.svc.saveDecisionAgent(num, payload).subscribe({
      next : ()  => { this.decisionLoading = false; this.cdr.detectChanges(); },
      error: ()  => { this.decisionLoading = false; this.cdr.detectChanges(); }
    });
  }

  loadHistoriqueAgent(): void {
    const username = this.userLogin || (this.user.prenom + ' ' + this.user.nom);
    if (!username) return;
    this.svc.getHistoriqueAgent(username).subscribe({
      next: (data: any[]) => {
        if (data && data.length > 0) {
          this.decisions = data.map((d: any) => ({
            date     : new Date(d.dateDecision),
            agent    : d.agentUsername || d.agentNom || '',
            num      : d.numSinistre,
            statut   : d.decision || d.statut,
            score    : d.scoreRisque || 0,
            commentaire: d.commentaireAgent || ''
          }));
          this.cdr.detectChanges();
        }
      },
      error: () => {}
    });
  }

  analyseRow(s: SinistreItem): void  { this.numInput = s.numSinistre; this.tab = 'analyse'; this.analyser(); }
  clickRow(s: SinistreItem): void    { this.numInput = s.numSinistre; this.tab = 'analyse'; this.analyser(); }
  reanalyse(a: any): void            { this.numInput = a.numSinistre; this.analyser(); }
  openFromDash(a: any): void         { this.numInput = a.numSinistre; this.tab = 'analyse'; }
  analyseNum(num: string): void      { this.numInput = num; this.tab = 'analyse'; this.bellOpen = false; this.analyser(); }

  private loadDashboard(): void {
    const fetch = () => this.svc.getDashboard(this.userLogin, this.govAnnee).subscribe({
      next: (d) => { this.dashData = d; this.cdr.detectChanges(); },
      error: ()  => {}
    });
    fetch();
    if (this.dashRefreshInterval) clearInterval(this.dashRefreshInterval);
    this.dashRefreshInterval = setInterval(fetch, 60_000);
  }

  onGovAnnee(annee: string): void {
    if (this.govLoading) return;
    this.govAnnee = annee;
    this.govLoading = true;
    this.cdr.detectChanges();
    this.svc.getDashboard(this.userLogin, annee).subscribe({
      next: (d) => {
        this.dashData = { ...this.dashData, topGouvernorats: d.topGouvernorats };
        this.govLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.govLoading = false; this.cdr.detectChanges(); }
    });
  }

  evoVal(e: any): number {
    switch (this.evoFilter) {
      case 'critiques':     return e.critiques     || 0;
      case 'risque-modere': return e.risqueModere || 0;
      case 'conformes':     return e.conformes     || 0;
      default:              return e.total          || 0;
    }
  }

  evoColor(): string {
    switch (this.evoFilter) {
      case 'critiques':     return '#dc2626';
      case 'risque-modere': return '#d97706';
      case 'conformes':     return '#16a34a';
      default:              return '#1a56db';
    }
  }

  evoFilterLabel(): string {
    switch (this.evoFilter) {
      case 'critiques':     return 'Critiques';
      case 'risque-modere': return 'Risque Modéré';
      case 'conformes':     return 'Conformes';
      default:              return 'Sinistres';
    }
  }

  evoMax2(): number {
    if (!this.dashData?.evolutionMensuelle?.length) return 10;
    return Math.max(...this.dashData.evolutionMensuelle.map(
      (e: any) => this.evoVal(e)), 1);
  }

  evoTotal2(): number {
    if (!this.dashData?.evolutionMensuelle?.length) return 0;
    return this.dashData.evolutionMensuelle.reduce(
      (s: number, e: any) => s + this.evoVal(e), 0);
  }

  evoPicMois2(): string {
    if (!this.dashData?.evolutionMensuelle?.length) return '—';
    const pic = this.dashData.evolutionMensuelle.reduce((max: any, e: any) =>
      this.evoVal(e) > this.evoVal(max) ? e : max,
      this.dashData.evolutionMensuelle[0]);
    return pic?.mois || '—';
  }

  fraudArc(): string {
    const pct = this.dashData?.tauxFraude ?? 0;
    const c   = 2 * Math.PI * 48;
    const d   = (pct / 100) * c;
    return `${d.toFixed(1)} ${(c - d).toFixed(1)}`;
  }

  markRead(): void {
    this.alertes.forEach(a => a.lue = true);
    this.newAlert = false;
    this.saveAlertesToStorage();
  }

  openAlert(a: Alerte): void {
    a.lue = true;
    this.saveAlertesToStorage();
    this.numInput = a.num; this.tab = 'analyse'; this.bellOpen = false; this.analyser();
  }

  private saveAlertesToStorage(): void {
    try { localStorage.setItem('bhguard_alertes', JSON.stringify(this.alertes)); } catch {}
  }

  sendMsg(e: any): void {
    if (e) e.preventDefault();
    if (!this.msgInp.trim() || !this.resultat || this.typing) return;
    const m: ChatMessage = { role:'user', content:this.msgInp.trim(), timestamp:new Date() };
    this.msgs.push(m);
    const txt = this.msgInp.trim(); this.msgInp = ''; this.typing = true;
    const d = this.currentSinistreData || {};
    const contexte = {
      // Identifiants
      num_sinistre          : this.resultat.num_sinistre        || d.num_sinistre                                         || null,
      num_contrat           : d.numContrat        || d.num_contrat        || d.NUM_CONTRAT                                || null,
      code_type_contrat     : d.codeTypeContrat   || d.code_type_contrat  || d.CODE_TYPE_CONTRAT                          || null,
      usage                 : d.usage             || d.USAGE                                                              || null,
      annee_exercice        : d.anneeExercice     || d.annee_exercice     || d.ANNEE_EXERCICE                             || null,
      // Dates
      date_survenance       : d.dateSurvenance    || d.date_survenance    || d.DATE_SURVENANCE                            || null,
      date_declaration      : d.dateDeclaration   || d.date_declaration   || d.DATE_DECLARATION                           || null,
      date_ouverture        : d.dateOuverture     || d.date_ouverture     || d.DATE_OUVERTURE                             || null,
      // Sinistre
      nature_sinistre       : d.natureSinistre    || d.nature_sinistre    || d.NATURE_SINISTRE                            || null,
      type_sinistre         : d.typeSinistre      || d.type_sinistre      || d.TYPE_SINISTRE                              || null,
      lib_etat_sinistre     : d.libEtatSinistre   || d.lib_etat_sinistre  || d.LIB_ETAT_SINISTRE                          || null,
      lieu_accident         : d.lieuAccident      || d.lieu_accident      || d.LIEU_ACCIDENT                              || null,
      gouvernorat           : d.gouvernorat       || d.GOUVERNORAT                                                        || null,
      code_responsabilite   : d.codeResponsabilite|| d.code_responsabilite|| d.CODE_RESPONSABILITE                        || null,
      // Financier
      montant_evaluation    : d.montantEvaluation || d.montant_evaluation || d.MONTANT_EVALUATION                         || null,
      cumul_reglement       : d.cumulReglement    || d.cumul_reglement    || d.CUMUL_REGLEMENT                            || null,
      total_sap_final       : d.totalSapFinal     || d.total_sap_final    || d.Total_SAP_Final                            || null,
      // Victimes
      nombre_blesses        : d.nombreBlesses     || d.nombre_blesses     || d.NOMBRE_BLESSES                             || null,
      nombre_deces          : d.nombreDeces       || d.nombre_deces       || d.NOMBRE_DECES                               || null,
      // Résultat analyse IA
      score_risque          : this.resultat.score_risque,
      est_suspect           : this.resultat.est_suspect,
      niveau_risque         : this.resultat.niveau_risque,
      flags_detectes        : this.resultat.flags_detectes,
      explication_ia        : this.resultat.explication_ia,
      recommandation        : this.resultat.recommandation,
      // Décision agent
      decision_agent        : this.decisionPrise              || null,
      commentaire_agent     : this.commentaireFraude?.trim()  || null,
    };
    this.svc.chatSinistre(this.resultat.num_sinistre, txt, this.msgs.slice(-6), contexte).subscribe({
      next : (r) => {
        this.msgs.push({ role:'assistant', content:r.reponse, timestamp:new Date() });
        this.typing = false; this.cdr.detectChanges();
      },
      error: ()  => {
        this.msgs.push({ role:'assistant', content:"Le service VeriAI est momentanément indisponible.", timestamp:new Date() });
        this.typing = false; this.cdr.detectChanges();
      }
    });
  }

  ariaSubtitle(): string {
    if (this.resultat) {
      return 'Dossier ' + this.resultat.num_sinistre + ' — ' + Math.round(this.resultat.score_risque) + '%';
    }
    return "En attente d'un dossier";
  }

  sendSug(s: string): void { this.msgInp = s; this.sendMsg(null); }

  tabTitle(): string {
    return ({dashboard:'Dashboard Analytics',analyse:'Analyse de Sinistre',
             liste:'Registre des Sinistres',historique:'Historique des Actions'} as any)[this.tab] || '';
  }

  sc(s: number): string {
    if (s >= 75) return '#dc2626'; if (s >= 40) return '#d97706'; return '#16a34a';
  }

  ol(s: number): string {
    if (s >= 75) return 'Critique'; if (s >= 40) return 'Risque Modéré'; return 'Conforme';
  }

  oc(s: number): string {
    if (s >= 75) return 'oc-red'; if (s >= 40) return 'oc-yel'; return 'oc-ok';
  }

  nvCls(n: string): string {
    switch(n?.toUpperCase()){
      case 'CRITIQUE': return 'oc-red';
      case 'ÉLEVÉ':    return 'oc-yel';
      case 'MODÉRÉ':   return 'oc-yel';
      default:         return 'oc-ok';
    }
  }

  nvIco(n: string): string {
    switch(n?.toUpperCase()){
      case 'CRITIQUE': return '●';
      case 'ÉLEVÉ':    return '●';
      case 'MODÉRÉ':   return '●';
      default:         return '●';
    }
  }

  arcVal(s: number): string { const c = 2 * Math.PI * 50; return `${(s/100)*c} ${c}`; }

  fmt(t: string): string {
    return t?.replace(/\n/g,'<br>')
             .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
             .replace(/###\s*(.*?)(<br>|$)/g,'<strong style="color:#1B2B5E">$1</strong><br>') || '';
  }
}
