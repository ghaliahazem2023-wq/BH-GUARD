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
import { HttpClient }       from '@angular/common/http';
import { FraudService, PredictionResponse, ChatMessage } from '../../services/fraud.service';

interface Alerte  { id:string; num:string; score:number; time:string; lue:boolean; }
interface Decision{ date:Date; agent:string; num:string; statut:string; score:number; commentaire?:string; }
interface SinistreItem {
  numSinistre:string; gouvernorat:string; natureSinistre:string;
  montantEvaluation:number; libEtatSinistre:string; nombreBlesses:number;
  nombreDeces:number; codeResponsabilite:string;
  score?:number; suspect?:boolean; decision?:'CONFORME'|'FRAUDE';
  motifs?:string[]; mlAnalysed?:boolean; scoreEstime?:boolean;
  scoreHeuristique?:number; scoreML?:number;
}

@Component({
  selector:'app-agent-espace',
  standalone:true,
  imports:[CommonModule,FormsModule,HttpClientModule],
  templateUrl: './agent-espace.html',
  styleUrls:   ['./agent-espace.scss'],
})
export class AgentEspaceComponent implements OnInit, OnDestroy, AfterViewChecked {

  @ViewChild('scrollRef')  private scrollRef!:    ElementRef;
  @ViewChild('vaiScroll') private vaiScrollRef!: ElementRef;

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
  private scoreCache = new Map<string, number>(); // cache analyse → liste

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

  // ── VeriAI ────────────────────────────────────────────────────────────────
  vaiMsgs  : any[]    = [];
  vaiInput : string   = '';
  vaiTyping: boolean  = false;
  inpFocus : boolean  = false;
  vaiStats : any      = null;

  // ── VeriAI Mascot Animations ──────────────────────────────────────────────
  mascotBlink    = false;
  mascotWaving   = false;
  mascotExcited  = false;
  mascotAntenna  = false;
  mascotMouth    = false;
  mascotEyeScanY = 94;
  mascotScanW    = 10;
  mascotWaveH    = [16, 28, 10, 22, 18, 12];
  mascotFloat    = 0;
  private mascotIntervals: any[] = [];

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
    private http  : HttpClient,
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
    this.startMascotAnimations();
    this.loadVaiStats();
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
    this.mascotIntervals.forEach(i => clearInterval(i));
  }

  ngAfterViewChecked(): void {
    try {
      if (this.scrollRef)
        this.scrollRef.nativeElement.scrollTop = this.scrollRef.nativeElement.scrollHeight;
      if (this.vaiScrollRef)
        this.vaiScrollRef.nativeElement.scrollTop = this.vaiScrollRef.nativeElement.scrollHeight;
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
            scoreHeuristique   : s.scoreHeuristique != null ? Number(s.scoreHeuristique) : undefined,
            scoreML            : s.scoreML          != null ? Number(s.scoreML)          : undefined,
          };
          // Appliquer le cache d'analyse — priorité absolue sur la DB
          const cached = this.scoreCache.get(item.numSinistre);
          if (cached !== undefined) {
            item.score       = cached;
            item.mlAnalysed  = true;
            item.scoreEstime = false;
          }
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
    if (this.resultat.score_formule == null) this.resultat.score_formule = this.resultat.score_risque;
    if (this.resultat.score_ml      == null) this.resultat.score_ml      = this.resultat.score_risque;

    const rNum     = (r.num_sinistre || '').trim();
    const newScore = Math.round(r.score_risque);

    // Cache persistant — appliqué dans chaque loadList() futur
    this.scoreCache.set(rNum, newScore);

    // Mise à jour unique et complète du tableau
    const idx = this.sinistres.findIndex(
      s => s.numSinistre === rNum || s.numSinistre === this.numInput.trim()
    );
    if (idx >= 0) {
      this.sinistres[idx].score            = newScore;
      this.sinistres[idx].scoreHeuristique = r.score_formule ?? newScore;
      this.sinistres[idx].scoreML          = r.score_ml      ?? newScore;
      this.sinistres[idx].mlAnalysed       = true;
      this.sinistres[idx].scoreEstime      = false;
      this.sinistres[idx].motifs           = this.buildMotifs(r);
      this.sinistres = [...this.sinistres];
    } else {
      // Sinistre sur une autre page — recharger depuis DB (cache garantit le bon score)
      setTimeout(() => this.loadList(), 2000);
    }

    this.loading = false;
    this.nbAnalyses++;
    if (r.donnees_sinistre) this.currentSinistreData = { ...this.currentSinistreData, ...r.donnees_sinistre };
    this.dernieres.unshift({ numSinistre: r.num_sinistre, score: r.score_risque });
    if (this.dernieres.length > 10) this.dernieres.pop();

    if (r.score_risque >= 65) this.sinistresEleves++;
    if (r.score_risque >= 75) {
      const existing = this.alertes.findIndex(a => a.num === r.num_sinistre);
      if (existing >= 0) {
        const updated = { ...this.alertes[existing], score: newScore, time: 'À l\'instant', lue: false };
        this.alertes.splice(existing, 1);
        this.alertes.unshift(updated);
      } else {
        this.alertes.unshift({ id: r.num_sinistre, num: r.num_sinistre, score: newScore, time: 'À l\'instant', lue: false });
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

  // clickRow : affiche le score STOCKÉ (= score de la liste) avec signaux calculés
  // depuis les données disponibles. L'analyse IA complète se lance via "Analyser →".
  clickRow(s: SinistreItem): void {
    this.numInput      = s.numSinistre;
    this.tab           = 'analyse';
    this.decisionPrise = s.decision || null;
    this.msgs          = [];
    this.loading       = false;

    const score   = s.score ?? 0;
    const formule = s.scoreHeuristique ?? score;
    const ml      = s.scoreML          ?? score;
    const niveau  = score >= 75 ? 'CRITIQUE' : score >= 40 ? 'RISQUE_MODÉRÉ' : 'CONFORME';
    const flags   = this.flagsFromItem(s);
    const reco    = score >= 75
      ? 'INVESTIGATION REQUISE — Dossier suspect, demander pièces justificatives.'
      : score >= 40
      ? 'SURVEILLANCE — Vérification rigoureuse des documents.'
      : 'TRAITEMENT NORMAL — Aucune anomalie majeure.';
    const expl =
      `### Score Stocké — Sinistre ${s.numSinistre}\n\n` +
      `**Score Global : ${score}/100 (${niveau})**\n\n` +
      `Nature : **${s.natureSinistre || '—'}** | ` +
      `Montant : **${(s.montantEvaluation || 0).toLocaleString('fr-TN')} TND** | ` +
      `Blessés : **${s.nombreBlesses || 0}** | Décès : **${s.nombreDeces || 0}**\n\n` +
      `Cliquez **Analyser →** pour lancer l'analyse Random Forest complète.`;

    this.resultat = {
      num_sinistre  : s.numSinistre,
      score_risque  : score,
      score_formule : formule,
      score_ml      : ml,
      est_suspect   : score >= 65,
      niveau_risque : niveau,
      flags_detectes: flags,
      explication_ia: expl,
      recommandation: reco
    };
    this.cdr.detectChanges();
  }

  // Calcule les signaux d'alerte depuis les champs du SinistreItem (même logique que buildFlags() backend)
  private flagsFromItem(s: SinistreItem): string[] {
    const flags: string[] = [];
    const m = s.montantEvaluation || 0;
    if      (m > 500_000) flags.push(`Montant exceptionnel (${Math.round(m).toLocaleString('fr-TN')} TND)`);
    else if (m > 200_000) flags.push(`Montant très élevé (${Math.round(m).toLocaleString('fr-TN')} TND)`);
    else if (m > 100_000) flags.push(`Montant élevé (${Math.round(m).toLocaleString('fr-TN')} TND)`);
    else if (m >  50_000) flags.push(`Montant suspect (${Math.round(m).toLocaleString('fr-TN')} TND)`);
    else if (m >  20_000) flags.push(`Montant significatif (${Math.round(m).toLocaleString('fr-TN')} TND)`);
    const d = s.nombreDeces || 0;
    if      (d >= 3) flags.push(`${d} décès déclarés`);
    else if (d >= 1) flags.push(`${d} décès déclaré(s)`);
    const b = s.nombreBlesses || 0;
    if      (b >= 5) flags.push(`${b} blessés déclarés (nombre élevé)`);
    else if (b >= 3) flags.push(`${b} blessés déclarés`);
    else if (b >= 1) flags.push(`${b} blessé(s) déclaré(s)`);
    const resp = (s.codeResponsabilite || '').toUpperCase();
    if      (['T', 'TOTALE', '100'].includes(resp)) flags.push('Responsabilité totale déclarée (100%)');
    else if (['P', 'PARTIELLE', '50'].includes(resp)) flags.push('Responsabilité partielle déclarée');
    return flags;
  }
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
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!this.msgInp.trim() || this.typing || !this.resultat) return;

    const msg = this.msgInp.trim();
    this.msgs.push({ role: 'user', content: msg, timestamp: new Date() });
    this.msgInp = '';
    this.typing = true;
    this.cdr.detectChanges();

    const sd = this.currentSinistreData || {};

    const donnees: any = {
      // Scores & IA
      score_risque        : this.resultat.score_risque,
      niveau_risque       : this.resultat.niveau_risque,
      flags_detectes      : this.resultat.flags_detectes      ?? [],
      explication_ia      : this.resultat.explication_ia      ?? '',
      recommandation      : this.resultat.recommandation      ?? '',
      decision_agent      : this.decisionPrise                ?? '',
      commentaire_agent   : this.commentaireFraude            ?? '',

      // Clés DB majuscules (lues directement par Python)
      NUM_SINISTRE        : this.resultat.num_sinistre,
      MONTANT_EVALUATION  : sd.MONTANT_EVALUATION  ?? sd.montantEvaluation,
      NOMBRE_BLESSES      : sd.NOMBRE_BLESSES      ?? sd.nombreBlesses,
      NOMBRE_DECES        : sd.NOMBRE_DECES        ?? sd.nombreDeces,
      CODE_RESPONSABILITE : sd.CODE_RESPONSABILITE ?? sd.codeResponsabilite,
      NATURE_SINISTRE     : sd.NATURE_SINISTRE     ?? sd.natureSinistre,
      GOUVERNORAT         : sd.GOUVERNORAT         ?? sd.gouvernorat,
      LIB_ETAT_SINISTRE   : sd.LIB_ETAT_SINISTRE  ?? sd.libEtatSinistre,
      DATE_SURVENANCE     : sd.DATE_SURVENANCE     ?? sd.dateSurvenance,
      DATE_DECLARATION    : sd.DATE_DECLARATION    ?? sd.dateDeclaration,
      DATE_OUVERTURE      : sd.DATE_OUVERTURE      ?? sd.dateOuverture,
      NUM_CONTRAT         : sd.NUM_CONTRAT         ?? sd.numContrat,
      CODE_TYPE_CONTRAT   : sd.CODE_TYPE_CONTRAT   ?? sd.codeTypeContrat,
      TYPE_SINISTRE       : sd.TYPE_SINISTRE       ?? sd.typeSinistre,
      LIEU_ACCIDENT       : sd.LIEU_ACCIDENT       ?? sd.lieuAccident,
      ANNEE_EXERCICE      : sd.ANNEE_EXERCICE      ?? sd.anneeExercice,
      usage               : sd.usage              ?? sd.USAGE,
      cumul_reglement     : sd.CUMUL_REGLEMENT     ?? sd.cumulReglement,
      Total_SAP_Final     : sd.Total_SAP_Final     ?? sd.totalSapFinal,

      // Stats globales pour référence Mistral
      stats_globales      : this.vaiStats,
      total_sinistres     : this.dashData?.totalSinistres ?? null,
      taux_fraude         : this.dashData?.tauxFraude     ?? null,
    };

    const body = {
      num_sinistre    : this.resultat.num_sinistre,
      message         : msg,
      historique      : this.msgs.slice(-10).map((m: any) => ({
                          role: m.role, content: m.content
                        })),
      donnees_sinistre: donnees,
    };

    this.http.post<any>('http://localhost:8000/chat-sinistre', body).subscribe({
      next: (r) => {
        this.msgs.push({ role: 'assistant', content: r.reponse, timestamp: new Date() });
        this.typing = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.msgs.push({
          role: 'assistant',
          content: '⚠️ Erreur de connexion. Vérifiez que FastAPI est actif.',
          timestamp: new Date()
        });
        this.typing = false;
        this.cdr.detectChanges();
      }
    });
  }

  downloadAuditPDF(): void {
    const r = this.resultat;
    if (!r) return;

    const s: any = {
      ...(r.donnees_sinistre      || {}),
      ...(this.currentSinistreData || {}),
    };

    const get = (...keys: string[]) => {
      for (const k of keys) {
        const v = s[k];
        if (v !== null && v !== undefined &&
            String(v).trim() !== '' &&
            String(v).trim() !== '—') return String(v).trim();
      }
      return '—';
    };

    const now      = new Date().toLocaleDateString('fr-TN', {day:'2-digit', month:'long', year:'numeric'});
    const time     = new Date().toLocaleTimeString('fr-TN', {hour:'2-digit', minute:'2-digit'});
    const agent    = `${this.user?.prenom ?? ''} ${this.user?.nom ?? ''}`.trim();
    const score    = r.score_risque;
    const niveau   = score >= 75 ? 'CRITIQUE' : score >= 40 ? 'RISQUE MODÉRÉ' : 'CONFORME';
    const montant  = parseFloat(get('MONTANT_EVALUATION','montantEvaluation') || '0') || 0;
    const blesses  = get('NOMBRE_BLESSES','nombreBlesses');
    const deces    = get('NOMBRE_DECES','nombreDeces');
    const nature   = get('NATURE_SINISTRE','natureSinistre');
    const gouv     = get('GOUVERNORAT','gouvernorat');
    const etat     = get('LIB_ETAT_SINISTRE','libEtatSinistre');
    const contrat  = get('NUM_CONTRAT','numContrat');
    const codeType = get('CODE_TYPE_CONTRAT','codeTypeContrat');
    const typeSin  = get('TYPE_SINISTRE','typeSinistre');
    const lieu     = get('LIEU_ACCIDENT','lieuAccident');
    const dateSurv = get('DATE_SURVENANCE','dateSurvenance');
    const dateDecl = get('DATE_DECLARATION','dateDeclaration');
    const dateOuv  = get('DATE_OUVERTURE','dateOuverture');
    const annee    = get('ANNEE_EXERCICE','anneeExercice');
    const usage    = get('usage','USAGE','LIB_USAGE');
    const cumul    = get('cumul_reglement','CUMUL_REGLEMENT','cumulReglement');
    const resp     = get('CODE_RESPONSABILITE','codeResponsabilite');

    const decision    = this.decisionPrise     ?? '—';
    const commentaire = this.commentaireFraude ?? '';

    const flags = (r.flags_detectes || [])
      .map((f: string) => `
      <tr>
        <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">
          ⚠️ ${f}
        </td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>Rapport Audit — ${r.num_sinistre}</title>
  <style>
    @page {
      size: A4;
      margin: 12mm 14mm;
    }
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: Arial, sans-serif;
      font-size: 9.5px;
      color: #000;
      background: #fff;
      width: 182mm;
    }

    /* HEADER */
    .hd {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 2.5px solid #002B80;
      margin-bottom: 8px;
    }
    .hd-l { display:flex; align-items:center; gap:10px; }
    .hd-l h1 { font-size:14px; font-weight:800; color:#002B80; }
    .hd-l p  { font-size:8px; color:#666; margin-top:2px; }
    .hd-r { text-align:right; font-size:8px; color:#444; line-height:1.9; }

    /* SCORE BAND */
    .sc-band {
      display: flex; align-items: center; gap: 16px;
      padding: 8px 12px;
      background: #f8f8f8;
      border: 1px solid #ddd;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    .sc-circle {
      width: 58px; height: 58px; border-radius: 50%;
      border: 3.5px solid #000;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .sc-circle .v { font-size:16px; font-weight:800; }
    .sc-circle .l { font-size:7px; color:#666; }
    .sc-info .niv {
      font-size: 11px; font-weight: 800;
      text-transform: uppercase; letter-spacing: 1px;
    }
    .sc-info .det { font-size:8px; color:#555; margin-top:3px; line-height:1.7; }

    /* SECTIONS */
    .sec { margin-bottom: 7px; }
    .sec-title {
      font-size: 8px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 1px;
      color: #002B80; padding: 4px 0;
      border-bottom: 1px solid #002B80;
      margin-bottom: 6px;
    }

    /* GRID */
    table.grid {
      width: 100%; border-collapse: collapse;
    }
    table.grid td {
      padding: 3px 6px 5px 0;
      vertical-align: top;
      width: 33.33%;
    }
    .lbl { font-size:7.5px; color:#888; text-transform:uppercase; letter-spacing:.4px; }
    .val { font-size:9.5px; font-weight:700; color:#000; }

    /* FLAGS */
    table.flags { width:100%; border-collapse:collapse; }
    table.flags td {
      font-size: 9px;
      padding: 5px 8px;
      border-bottom: 1px solid #f0f0f0;
    }
    .no-flag {
      font-size:9px; padding:6px 10px;
      border-left:3px solid #555;
      background:#f9f9f9;
    }

    /* EXPLICATION */
    .explic {
      font-size: 9px; line-height: 1.65;
      padding: 7px 10px;
      border-left: 3px solid #002B80;
      background: #f8faff;
    }

    /* DECISION */
    .dec-box {
      padding: 7px 10px;
      border: 1.5px solid #000;
      border-radius: 3px;
      font-size: 9.5px;
      font-weight: 700;
    }
    .dec-comment {
      margin-top: 5px;
      font-size: 9px;
      font-weight: 400;
      color: #444;
      font-style: italic;
      border-top: 1px dashed #ccc;
      padding-top: 5px;
    }

    /* RECO */
    .reco {
      padding: 7px 10px;
      border-left: 4px solid #000;
      background: #f9f9f9;
      font-size: 9.5px;
      font-weight: 700;
    }

    /* FOOTER */
    .ft {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-top: 10px;
      margin-top: 10px;
      border-top: 2px solid #002B80;
    }
    .ft-l { font-size:8px; color:#555; line-height:1.9; }
    .ft-l strong { font-size:10px; color:#002B80; }
    .sig { text-align:center; }
    .sig .sig-lbl { font-size:8px; color:#666; margin-bottom:5px; }
    .sig-line { width:160px; height:38px; border-bottom:1.5px solid #000; margin:0 auto 5px; }
    .sig .sig-name { font-size:9px; font-weight:700; }
    .sig .sig-role { font-size:8px; color:#555; }
    .sig .sig-date { font-size:8px; color:#888; }

    .wm {
      text-align:center; margin-top:8px;
      font-size:7.5px; color:#bbb; letter-spacing:2px;
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="hd">
    <div class="hd-l">
      <img src="http://localhost:4200/assets/logo-bh1.png"
           style="height:40px;object-fit:contain"
           onerror="this.style.display='none'"/>
      <div>
        <h1>RAPPORT D'AUDIT ANTI-FRAUDE</h1>
        <p>BH Assurance Tunisie — Système BH Guard</p>
      </div>
    </div>
    <div class="hd-r">
      <div><b>Réf :</b> BHG-${r.num_sinistre}-${Date.now()}</div>
      <div><b>Date :</b> ${now} à ${time}</div>
      <div><b>Agent :</b> ${agent}</div>
      <div><b>N° Sinistre :</b> ${r.num_sinistre}</div>
    </div>
  </div>

  <!-- SCORE -->
  <div class="sc-band">
    <div class="sc-circle">
      <span class="v">${score}%</span>
      <span class="l">SCORE</span>
    </div>
    <div class="sc-info">
      <div class="niv">${niveau} — Score de risque : ${score}/100</div>
      <div class="det">
        Score Formule (règles métier) : <b>${r.score_formule ?? '—'}%</b> &nbsp;|&nbsp;
        Score ML (Random Forest) : <b>${r.score_ml ?? '—'}%</b> &nbsp;|&nbsp;
        Score Global : <b>${score}%</b>
      </div>
      <div class="det">
        Formule : (2 × ${r.score_formule ?? '—'} + ${r.score_ml ?? '—'}) / 3 = ${score}
      </div>
    </div>
  </div>

  <!-- 1. IDENTIFICATION -->
  <div class="sec">
    <div class="sec-title">1 — Identification du Dossier</div>
    <table class="grid">
      <tr>
        <td><div class="lbl">N° Sinistre</div><div class="val">${r.num_sinistre}</div></td>
        <td><div class="lbl">N° Contrat</div><div class="val">${contrat}</div></td>
        <td><div class="lbl">Type contrat</div><div class="val">${codeType}</div></td>
      </tr>
      <tr>
        <td><div class="lbl">Nature sinistre</div><div class="val">${nature}</div></td>
        <td><div class="lbl">Type sinistre</div><div class="val">${typeSin}</div></td>
        <td><div class="lbl">État dossier</div><div class="val">${etat}</div></td>
      </tr>
      <tr>
        <td><div class="lbl">Gouvernorat</div><div class="val">${gouv}</div></td>
        <td><div class="lbl">Année exercice</div><div class="val">${annee}</div></td>
        <td><div class="lbl">Usage véhicule</div><div class="val">${usage}</div></td>
      </tr>
    </table>
  </div>

  <!-- 2. CHRONOLOGIE -->
  <div class="sec">
    <div class="sec-title">2 — Chronologie</div>
    <table class="grid">
      <tr>
        <td><div class="lbl">Date survenance</div><div class="val">${dateSurv}</div></td>
        <td><div class="lbl">Date déclaration</div><div class="val">${dateDecl}</div></td>
        <td><div class="lbl">Date ouverture</div><div class="val">${dateOuv}</div></td>
      </tr>
      <tr>
        <td colspan="3"><div class="lbl">Lieu accident</div><div class="val">${lieu}</div></td>
      </tr>
    </table>
  </div>

  <!-- 3. FINANCIER -->
  <div class="sec">
    <div class="sec-title">3 — Volet Financier</div>
    <table class="grid">
      <tr>
        <td>
          <div class="lbl">Montant évaluation</div>
          <div class="val" style="font-size:11px">
            ${montant > 0 ? montant.toLocaleString('fr-TN') + ' TND' : '—'}
          </div>
        </td>
        <td><div class="lbl">Cumul règlement</div><div class="val">${cumul !== '—' ? cumul + ' TND' : '—'}</div></td>
        <td><div class="lbl">Moyenne base BH</div><div class="val">3 736 TND</div></td>
      </tr>
      <tr>
        <td><div class="lbl">Responsabilité</div><div class="val">${resp}</div></td>
        ${montant > 0 ? `
        <td colspan="2">
          <div class="lbl">Ratio vs moyenne</div>
          <div class="val">${(montant/3736).toFixed(1)}× la moyenne</div>
        </td>` : '<td colspan="2"></td>'}
      </tr>
    </table>
  </div>

  <!-- 4. VICTIMES -->
  <div class="sec">
    <div class="sec-title">4 — Victimes Déclarées</div>
    <table class="grid">
      <tr>
        <td><div class="lbl">Nombre de blessés</div><div class="val">${blesses}</div></td>
        <td><div class="lbl">Nombre de décès</div><div class="val">${deces}</div></td>
        <td></td>
      </tr>
    </table>
  </div>

  <!-- 5. SIGNAUX -->
  <div class="sec">
    <div class="sec-title">5 — Signaux d'Alerte Détectés</div>
    ${flags
      ? `<table class="flags"><tbody>${flags}</tbody></table>`
      : `<div class="no-flag">✅ Aucun signal d'alerte critique détecté</div>`
    }
  </div>

  <!-- 6. ANALYSE VERIAI -->
  <div class="sec">
    <div class="sec-title">6 — Analyse VeriAI</div>
    <div class="explic">${r.explication_ia ?? '—'}</div>
  </div>

  <!-- 7. DÉCISION -->
  <div class="sec">
    <div class="sec-title">7 — Décision de l'Agent</div>
    <div class="dec-box">
      ${decision === 'CONFORME' ? '✅ Dossier Validé — Conforme'          :
        decision === 'FRAUDE'   ? '🚨 Dossier Bloqué — Fraude suspectée'  :
        '⏳ Aucune décision prise pour ce dossier'}
      ${commentaire
        ? `<div class="dec-comment">💬 Commentaire agent : ${commentaire}</div>`
        : ''}
    </div>
  </div>

  <!-- 8. RECOMMANDATION -->
  <div class="sec">
    <div class="sec-title">8 — Recommandation VeriAI</div>
    <div class="reco">${r.recommandation ?? '—'}</div>
  </div>

  <!-- FOOTER + SIGNATURE -->
  <div class="ft">
    <div class="ft-l">
      <div><strong>BH ASSURANCE</strong></div>
      <div>Banque de l'Habitat Tunisie</div>
      <div>VeriAI — Système Anti-Fraude IA</div>
      <div style="color:#aaa;font-size:7.5px;letter-spacing:1px;margin-top:2px">
        DOCUMENT CONFIDENTIEL — USAGE INTERNE
      </div>
    </div>
    <div class="sig">
      <div class="sig-lbl">Visa de l'agent anti-fraude</div>
      <div class="sig-line"></div>
      <div class="sig-name">${agent}</div>
      <div class="sig-role">Agent Anti-Fraude</div>
      <div class="sig-date">${now}</div>
    </div>
  </div>

  <div class="wm">CONFIDENTIEL — BH GUARD — USAGE INTERNE UNIQUEMENT</div>

</body>
</html>`;

    // ── تحميل مباشر ────────────────────────────────────────────
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);

    // فتح في tab جديد
    window.open(url, '_blank');

    // تحميل مباشر
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `Rapport-Audit-${r.num_sinistre}-${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  downloadDecisionPDF(d: any): void {
    this.http.post<any>('http://localhost:8000/predict', {
      NUM_SINISTRE: d.num
    }).subscribe({
      next: (result) => { this._generateDecisionPDF(d, result); },
      error: ()       => { this._generateDecisionPDF(d, null);  }
    });
  }

  _generateDecisionPDF(d: any, result: any): void {
    const agent   = `${this.user?.prenom ?? ''} ${this.user?.nom ?? ''}`.trim();
    const now     = new Date().toLocaleDateString('fr-TN', {day:'2-digit', month:'long', year:'numeric'});
    const time    = new Date().toLocaleTimeString('fr-TN', {hour:'2-digit', minute:'2-digit'});
    const score   = d.score ?? 0;
    const statut  = d.statut ?? '—';
    const niveau  = score >= 75 ? 'CRITIQUE' : score >= 40 ? 'RISQUE MODÉRÉ' : 'CONFORME';
    const dateD   = new Date(d.date).toLocaleDateString('fr-TN', {
      day:'2-digit', month:'long', year:'numeric'
    });
    const timeD   = new Date(d.date).toLocaleTimeString('fr-TN', {
      hour:'2-digit', minute:'2-digit'
    });

    const s: any = { ...(result?.donnees_sinistre || {}) };

    const get = (...keys: string[]) => {
      for (const k of keys) {
        const v = s[k];
        if (v !== null && v !== undefined &&
            String(v).trim() !== '' &&
            String(v).trim() !== '—') return String(v).trim();
      }
      return '—';
    };

    const montant      = parseFloat(get('MONTANT_EVALUATION','montantEvaluation') || '0') || 0;
    const nature       = get('NATURE_SINISTRE','natureSinistre');
    const gouv         = get('GOUVERNORAT','gouvernorat');
    const etat         = get('LIB_ETAT_SINISTRE','libEtatSinistre');
    const contrat      = get('NUM_CONTRAT','numContrat');
    const dateSurv     = get('DATE_SURVENANCE','dateSurvenance');
    const dateDecl     = get('DATE_DECLARATION','dateDeclaration');
    const blesses      = get('NOMBRE_BLESSES','nombreBlesses');
    const deces        = get('NOMBRE_DECES','nombreDeces');
    const resp         = get('CODE_RESPONSABILITE','codeResponsabilite');
    const cumul        = get('cumul_reglement','CUMUL_REGLEMENT','cumulReglement');
    const usage        = get('usage','USAGE','LIB_USAGE');
    const explication  = result?.explication_ia  || '—';
    const recommandation = result?.recommandation  || '—';
    const scoreFormule = result?.score_formule ?? '—';
    const scoreMl      = result?.score_ml      ?? '—';

    const flags = (result?.flags_detectes || d.flags || [])
      .map((f: string) => `<tr><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">⚠️ ${f}</td></tr>`)
      .join('');

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>Décision — ${d.num}</title>
  <style>
    @page { size: A4; margin: 14mm 16mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: Arial, sans-serif;
      font-size: 10px; color: #000; background: #fff;
      width: 178mm;
    }

    /* HEADER */
    .hd {
      display: flex; justify-content: space-between; align-items: center;
      padding-bottom: 10px;
      border-bottom: 2.5px solid #002B80;
      margin-bottom: 14px;
    }
    .hd-l { display:flex; align-items:center; gap:10px; }
    .hd-l h1 { font-size:15px; font-weight:800; color:#002B80; }
    .hd-l p  { font-size:8.5px; color:#666; margin-top:2px; }
    .hd-r { text-align:right; font-size:8.5px; color:#444; line-height:2; }

    /* DECISION BADGE */
    .dec-badge {
      text-align: center;
      padding: 18px;
      margin-bottom: 16px;
      border-radius: 6px;
      border: 2px solid ${statut === 'CONFORME' ? '#16a34a' : '#CC2229'};
      background: ${statut === 'CONFORME' ? '#f0fdf4' : '#fff5f5'};
    }
    .dec-badge .icon { font-size: 32px; display:block; margin-bottom:6px; }
    .dec-badge .title {
      font-size: 16px; font-weight: 800;
      color: ${statut === 'CONFORME' ? '#16a34a' : '#CC2229'};
      text-transform: uppercase; letter-spacing: 1px;
    }
    .dec-badge .sub { font-size: 9px; color: #666; margin-top: 4px; }

    /* SECTIONS */
    .sec { margin-bottom: 12px; }
    .sec-title {
      font-size: 8.5px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 1px;
      color: #002B80; padding: 4px 0;
      border-bottom: 1px solid #002B80;
      margin-bottom: 8px;
    }
    table.grid { width:100%; border-collapse:collapse; }
    table.grid td { padding: 4px 8px 6px 0; vertical-align:top; width:50%; }
    .lbl { font-size:8px; color:#888; text-transform:uppercase; letter-spacing:.4px; }
    .val { font-size:10px; font-weight:700; }

    /* SCORE */
    .score-row {
      display: flex; align-items: center; gap: 16px;
      padding: 10px 14px;
      background: #f8f8f8; border: 1px solid #ddd;
      border-radius: 4px; margin-bottom: 14px;
    }
    .sc-circle {
      width: 62px; height: 62px; border-radius: 50%;
      border: 3.5px solid ${score >= 75 ? '#CC2229' : score >= 40 ? '#F5A623' : '#16a34a'};
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; flex-shrink:0;
    }
    .sc-circle .v {
      font-size: 17px; font-weight: 800;
      color: ${score >= 75 ? '#CC2229' : score >= 40 ? '#F5A623' : '#16a34a'};
    }
    .sc-circle .l { font-size: 7px; color: #888; }
    .sc-info .niv { font-size:11px; font-weight:800; text-transform:uppercase; }
    .sc-info .det { font-size:8.5px; color:#555; margin-top:4px; line-height:1.7; }

    /* COMMENTAIRE */
    .comment-box {
      padding: 12px 14px;
      border-left: 4px solid ${statut === 'CONFORME' ? '#16a34a' : '#CC2229'};
      background: ${statut === 'CONFORME' ? '#f0fdf4' : '#fff5f5'};
      font-size: 10px; line-height: 1.7;
      border-radius: 0 4px 4px 0;
    }
    .no-comment {
      padding: 10px 14px;
      border-left: 3px solid #ccc;
      background: #f9f9f9;
      font-size: 9.5px; color: #888; font-style: italic;
    }

    /* FOOTER */
    .ft {
      display: flex; justify-content: space-between; align-items: flex-end;
      padding-top: 14px; margin-top: 16px;
      border-top: 2px solid #002B80;
    }
    .ft-l { font-size:8.5px; color:#555; line-height:1.9; }
    .ft-l strong { font-size:10px; color:#002B80; }
    .sig { text-align:center; }
    .sig-lbl { font-size:8px; color:#666; margin-bottom:6px; }
    .sig-line { width:160px; height:40px; border-bottom:1.5px solid #000; margin:0 auto 5px; }
    .sig-name { font-size:9.5px; font-weight:700; }
    .sig-role { font-size:8px; color:#555; }
    .sig-date { font-size:8px; color:#888; }
    .wm {
      text-align:center; margin-top:10px;
      font-size:7.5px; color:#bbb; letter-spacing:2px;
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="hd">
    <div class="hd-l">
      <img src="http://localhost:4200/assets/logo-bh1.png"
           style="height:40px;object-fit:contain"
           onerror="this.style.display='none'"/>
      <div>
        <h1>FICHE DE DÉCISION AGENT</h1>
        <p>BH Assurance Tunisie — Système BH Guard Anti-Fraude</p>
      </div>
    </div>
    <div class="hd-r">
      <div><b>Réf :</b> DEC-${d.num}-${Date.now()}</div>
      <div><b>Généré le :</b> ${now} à ${time}</div>
      <div><b>Agent :</b> ${agent}</div>
    </div>
  </div>

  <!-- DECISION BADGE -->
  <div class="dec-badge">
    <span class="icon">${statut === 'CONFORME' ? '✅' : '🚨'}</span>
    <div class="title">
      ${statut === 'CONFORME' ? 'Dossier Validé — Conforme' : 'Dossier Bloqué — Fraude Suspectée'}
    </div>
    <div class="sub">
      Décision prise le ${dateD} à ${timeD} par ${agent}
    </div>
  </div>

  <!-- SCORE -->
  <div class="score-row">
    <div class="sc-circle">
      <span class="v">${score}%</span>
      <span class="l">SCORE</span>
    </div>
    <div class="sc-info">
      <div class="niv">${niveau} — Score de risque : ${score}/100</div>
      <div class="det">
        Sinistre N° <b>${d.num}</b> — Analysé par VeriAI (Random Forest + Règles métier)
      </div>
      <div class="det">
        Seuils : ✅ Conforme &lt; 40% &nbsp;|&nbsp;
                 ⚡ Modéré 40-74% &nbsp;|&nbsp;
                 🚨 Critique ≥ 75%
      </div>
    </div>
  </div>

  <!-- INFOS DÉCISION -->
  <div class="sec">
    <div class="sec-title">Informations de la Décision</div>
    <table class="grid">
      <tr>
        <td>
          <div class="lbl">N° Sinistre</div>
          <div class="val">${d.num}</div>
        </td>
        <td>
          <div class="lbl">Score de risque</div>
          <div class="val" style="color:${score >= 75 ? '#CC2229' : score >= 40 ? '#F5A623' : '#16a34a'}">
            ${score}% — ${niveau}
          </div>
        </td>
      </tr>
      <tr>
        <td>
          <div class="lbl">Date de décision</div>
          <div class="val">${dateD}</div>
        </td>
        <td>
          <div class="lbl">Heure</div>
          <div class="val">${timeD}</div>
        </td>
      </tr>
      <tr>
        <td>
          <div class="lbl">Agent décideur</div>
          <div class="val">${d.agent ?? agent}</div>
        </td>
        <td>
          <div class="lbl">Statut final</div>
          <div class="val" style="color:${statut === 'CONFORME' ? '#16a34a' : '#CC2229'}">
            ${statut === 'CONFORME' ? '✅ CONFORME' : '🚨 FRAUDE SUSPECTÉE'}
          </div>
        </td>
      </tr>
    </table>
  </div>

  <!-- COMMENTAIRE -->
  <div class="sec">
    <div class="sec-title">Commentaire de l'Agent</div>
    ${d.commentaire
      ? `<div class="comment-box">💬 ${d.commentaire}</div>`
      : `<div class="no-comment">Aucun commentaire saisi pour cette décision.</div>`
    }
  </div>

  <!-- FOOTER + SIGNATURE -->
  <div class="ft">
    <div class="ft-l">
      <div><strong>BH ASSURANCE</strong></div>
      <div>Banque de l'Habitat Tunisie</div>
      <div>VeriAI — Système Anti-Fraude IA</div>
      <div style="color:#aaa;font-size:7.5px;letter-spacing:1px;margin-top:2px">
        DOCUMENT CONFIDENTIEL — USAGE INTERNE UNIQUEMENT
      </div>
    </div>
    <div class="sig">
      <div class="sig-lbl">Signature de l'agent</div>
      <div class="sig-line"></div>
      <div class="sig-name">${agent}</div>
      <div class="sig-role">Agent Anti-Fraude — BH Assurance</div>
      <div class="sig-date">${now}</div>
    </div>
  </div>

  <div class="wm">CONFIDENTIEL — BH GUARD — USAGE INTERNE UNIQUEMENT</div>

</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);

    window.open(url, '_blank');

    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Decision-${d.num}-${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  ariaSubtitle(): string {
    if (this.resultat) {
      return 'Dossier ' + this.resultat.num_sinistre + ' — ' + Math.round(this.resultat.score_risque) + '%';
    }
    return "En attente d'un dossier";
  }

  sendSug(s: string): void { this.msgInp = s; this.sendMsg(null); }

  tabTitle(): string {
    return ({
      dashboard : 'Dashboard Analytics',
      analyse   : 'Analyse de Sinistre',
      liste     : 'Registre des Sinistres',
      historique: 'Historique des Actions',
      veriai    : 'VeriAI — Assistant Anti-Fraude'
    } as any)[this.tab] || '';
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

  loadVaiStats(): void {
    this.http.get<any>('http://localhost:8000/dashboard-stats').subscribe({
      next : (stats) => { this.vaiStats = stats; },
      error: ()       => console.warn('[VeriAI] dashboard-stats non disponible')
    });
  }

  startMascotAnimations(): void {
    let t = 0;
    this.mascotIntervals.push(setInterval(() => {
      t += 0.05;
      this.mascotFloat = Math.sin(t) * 10;
      this.cdr.detectChanges();
    }, 30));
    this.mascotIntervals.push(setInterval(() => {
      this.mascotBlink = true;
      setTimeout(() => this.mascotBlink = false, 160);
    }, 3500));
    this.mascotIntervals.push(setInterval(() => {
      this.mascotAntenna = !this.mascotAntenna;
    }, 1200));
    this.mascotIntervals.push(setInterval(() => {
      this.mascotEyeScanY = this.mascotEyeScanY === 94 ? 101 : 94;
    }, 900));
    this.mascotIntervals.push(setInterval(() => {
      this.mascotScanW = this.mascotScanW >= 56 ? 10 : this.mascotScanW + 8;
    }, 600));
    this.mascotIntervals.push(setInterval(() => {
      this.mascotWaving = true;
      setTimeout(() => this.mascotWaving = false, 1200);
    }, 8000));
    this.mascotIntervals.push(setInterval(() => {
      this.mascotExcited = true;
      this.mascotWaving  = true;
      setTimeout(() => { this.mascotExcited = false; this.mascotWaving = false; }, 1500);
    }, 12000));
    this.mascotIntervals.push(setInterval(() => {
      if (this.vaiTyping) {
        this.mascotMouth = !this.mascotMouth;
        this.mascotWaveH = this.mascotWaveH.map(() => 8 + Math.floor(Math.random() * 24));
      }
    }, 180));
  }

  vaiSend(text: string): void {
    this.vaiInput = text;
    this.vaiSendMsg(null);
  }

  vaiSendMsg(e: any): void {
    if (e) e.preventDefault();
    if (!this.vaiInput.trim() || this.vaiTyping) return;

    const msg = this.vaiInput.trim();
    this.vaiMsgs.push({ role: 'user', content: msg, timestamp: new Date() });
    this.vaiInput  = '';
    this.vaiTyping = true;

    const context = {
      score_risque        : this.resultat?.score_risque        ?? null,
      num_sinistre_actif  : this.resultat?.num_sinistre        ?? null,
      flags_detectes      : this.resultat?.flags_detectes      ?? [],
      explication_ia      : this.resultat?.explication_ia      ?? null,
      stats_globales      : this.vaiStats,
      nb_decisions        : this.decisions.length,
      nb_conformes        : this.decisions.filter((d: any) => d.statut === 'CONFORME').length,
      nb_fraudes          : this.decisions.filter((d: any) => d.statut === 'FRAUDE').length,
      total_sinistres     : this.dashData?.totalSinistres       ?? null,
      taux_fraude         : this.dashData?.tauxFraude           ?? null,
      top_gouvernorats    : this.dashData?.topGouvernorats      ?? [],
    };

    const body = {
      num_sinistre    : 'GENERAL',
      message         : msg,
      historique      : this.vaiMsgs.slice(-8).map((m: any) => ({ role: m.role, content: m.content })),
      donnees_sinistre: context,
    };

    this.http.post<any>('http://localhost:8000/chat-sinistre', body).subscribe({
      next: (r) => {
        this.vaiMsgs.push({ role: 'assistant', content: r.reponse, timestamp: new Date() });
        this.vaiTyping = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.vaiMsgs.push({
          role: 'assistant',
          content: '⚠️ Erreur de connexion. Vérifiez que FastAPI est actif.',
          timestamp: new Date()
        });
        this.vaiTyping = false;
        this.cdr.detectChanges();
      }
    });
  }
}
