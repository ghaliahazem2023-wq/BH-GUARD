import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { Router } from '@angular/router';
import { FraudService } from '../../services/fraud.service';

interface SinistreRow {
  numSinistre       : string;
  gouvernorat       : string;
  natureSinistre    : string;
  montantEvaluation : number;
  libEtatSinistre   : string;
  nombreBlesses     : number;
  nombreDeces       : number;
  codeResponsabilite: string;
  score             : number;
  mlAnalysed        : boolean;
}

@Component({
  selector   : 'app-gestion-sinistres',
  standalone : true,
  imports    : [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './gestion-sinistres.html',
  styleUrl   : './gestion-sinistres.scss',
})
export class GestionSinistres implements OnInit, OnDestroy {

  // ── Données ───────────────────────────────────────────────────────────────
  sinistres     : SinistreRow[] = [];
  totalElements : number = 0;
  totalPages    : number = 1;
  page          : number = 0;
  pageInput     : number = 1;
  pageSize      : number = 20;
  loading       : boolean = false;

  // ── Filtres ───────────────────────────────────────────────────────────────
  searchText : string = '';
  filtNature : string = '';
  filtGov    : string = '';
  filtNiveau : string = '';

  readonly natures: string[] = ['MATÉRIEL', 'CORPOREL', 'ASSISTANCE', 'VOL'];

  get gouvernorats(): string[] {
    return [...new Set(this.sinistres.map(s => s.gouvernorat).filter(g => g && g !== '—'))].sort();
  }

  get sinistresAffiches(): SinistreRow[] {
    const q = this.searchText.toLowerCase();
    return this.sinistres.filter(s => {
      const t = !q
        || s.numSinistre.toLowerCase().includes(q)
        || s.gouvernorat.toLowerCase().includes(q)
        || s.natureSinistre.toLowerCase().includes(q);
      const n = !this.filtNature || s.natureSinistre.toUpperCase().includes(this.filtNature.toUpperCase());
      const g = !this.filtGov    || s.gouvernorat === this.filtGov;
      const v = s.score;
      const r = !this.filtNiveau
        || (this.filtNiveau === 'critique'      && v >= 75)
        || (this.filtNiveau === 'investigation' && v >= 40 && v < 75)
        || (this.filtNiveau === 'conforme'      && v < 40)
        || (this.filtNiveau === 'ml'            && s.mlAnalysed);
      return t && n && g && r;
    });
  }

  // ── Retry timer ───────────────────────────────────────────────────────────
  private retryTimer: any;

  constructor(
    private svc   : FraudService,
    private cdr   : ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void { this.loadPage(); }
  ngOnDestroy(): void { if (this.retryTimer) clearTimeout(this.retryTimer); }

  // ── Chargement ────────────────────────────────────────────────────────────
  loadPage(): void {
    this.loading = true;
    this.svc.getSinistres(this.page, this.pageSize).subscribe({
      next: (d) => {
        this.totalElements = d.totalElements || 0;
        this.totalPages    = Math.ceil(this.totalElements / this.pageSize) || 1;
        this.pageInput     = this.page + 1;
        this.sinistres = (d.sinistres || []).map((s: any) => {
          const row: SinistreRow = {
            numSinistre       : s.numSinistre        || '',
            gouvernorat       : s.gouvernorat        || '—',
            natureSinistre    : s.natureSinistre     || '—',
            montantEvaluation : s.montantEvaluation  || 0,
            libEtatSinistre   : s.libEtatSinistre    || '—',
            nombreBlesses     : s.nombreBlesses      || 0,
            nombreDeces       : s.nombreDeces        || 0,
            codeResponsabilite: s.codeResponsabilite || '',
            score             : 0,
            mlAnalysed        : false,
          };
          row.score = this.scoreRegle(row);
          return row;
        });
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        // Spring Boot pas encore prêt — réessayer dans 4 s
        if (this.page === 0 && this.sinistres.length === 0) {
          this.retryTimer = setTimeout(() => this.loadPage(), 4000);
        }
        this.cdr.detectChanges();
      }
    });
  }

  onFilterChange(): void {
    // Les filtres sont appliqués côté front via sinistresAffiches
    // Pas besoin de re-requêter le backend pour les filtres simples
    this.cdr.detectChanges();
  }

  resetFiltres(): void {
    this.searchText = '';
    this.filtNature = '';
    this.filtGov    = '';
    this.filtNiveau = '';
    this.cdr.detectChanges();
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  goPage(delta: number): void {
    this.page      += delta;
    this.pageInput  = this.page + 1;
    this.loadPage();
  }

  jumpPage(): void {
    const p = Math.max(0, Math.min(this.totalPages - 1, (this.pageInput || 1) - 1));
    if (p !== this.page) { this.page = p; this.loadPage(); }
  }

  // ── Navigation vers analyse ───────────────────────────────────────────────
  analyserSinistre(num: string): void {
    // Stocke le numéro et redirige vers l'espace agent
    localStorage.setItem('analyseNum', num);
    this.router.navigate(['/espace-agent']);
  }

  // ── Score règle métier (même logique que FastAPI score_regle()) ───────────
  private scoreRegle(s: SinistreRow): number {
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

  // ── Helpers couleur ───────────────────────────────────────────────────────
  scoreColor(s: number): string {
    if (s >= 75) return '#dc2626';
    if (s >= 40) return '#d97706';
    return '#16a34a';
  }

  niveauClass(s: number): string {
    if (s >= 75) return 'badge-red';
    if (s >= 40) return 'badge-yel';
    return 'badge-grn';
  }

  niveauLabel(s: number): string {
    if (s >= 75) return 'Critique';
    if (s >= 40) return 'Investigation';
    return 'Conforme';
  }

  get nbCritique()      : number { return this.sinistres.filter(s => s.score >= 75).length; }
  get nbInvestigation() : number { return this.sinistres.filter(s => s.score >= 40 && s.score < 75).length; }
  get nbConforme()      : number { return this.sinistres.filter(s => s.score < 40).length; }
}
