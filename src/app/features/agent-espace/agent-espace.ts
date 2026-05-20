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
interface Decision{ date:Date; agent:string; num:string; statut:string; score:number; }
interface SinistreItem {
  numSinistre:string; gouvernorat:string; natureSinistre:string;
  montantEvaluation:number; libEtatSinistre:string; nombreBlesses:number;
  score?:number; suspect?:boolean; decision?:'CONFORME'|'FRAUDE';
  motifs?:string[];
}

@Component({
  selector:'app-agent-espace',
  standalone:true,
  imports:[CommonModule,FormsModule,HttpClientModule],
  template:`
<div class="app" (click)="closeAll($event)">

  <!-- ══ SIDEBAR ═════════════════════════════════════════════════════════ -->
  <aside class="sidebar" [class.mini]="mini">
    <div class="sb-brand">
      <div class="sb-logo-wrap">
        <img src="assets/logo.png" alt="BH" class="sb-img"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
        <div class="sb-svg" style="display:none">
          <svg viewBox="0 0 40 40" fill="none" width="34" height="34">
            <path d="M20 3L35 10V22C35 30 28 36 20 38C12 36 5 30 5 22V10Z" fill="url(#g1)"/>
            <path d="M14 20L18 24L26 16" stroke="white" stroke-width="2.5"
                  stroke-linecap="round" stroke-linejoin="round"/>
            <defs><linearGradient id="g1" x1="5" y1="3" x2="35" y2="38">
              <stop stop-color="#1a56db"/><stop offset="1" stop-color="#06b6d4"/>
            </linearGradient></defs>
          </svg>
        </div>
      </div>
      <div class="sb-txt" *ngIf="!mini">
        <span class="t1">BH</span><span class="t2">Guard</span>
        <small>Anti-Fraude IA</small>
      </div>
    </div>

    <nav class="sb-nav">
      <button class="nb" [class.act]="tab==='dashboard'" (click)="tab='dashboard'">
        <span class="ni">📊</span><span class="nl" *ngIf="!mini">Dashboard</span>
      </button>
      <button class="nb" [class.act]="tab==='analyse'" (click)="tab='analyse'">
        <span class="ni">🔍</span><span class="nl" *ngIf="!mini">Analyse</span>
      </button>
      <button class="nb" [class.act]="tab==='liste'" (click)="tab='liste';loadList()">
        <span class="ni">📂</span><span class="nl" *ngIf="!mini">Sinistres</span>
      </button>
      <button class="nb" [class.act]="tab==='historique'" (click)="tab='historique'">
        <span class="ni">📜</span><span class="nl" *ngIf="!mini">Historique</span>
        <span class="nb-count" *ngIf="!mini && decisions.length>0">{{ decisions.length }}</span>
      </button>
    </nav>

    <div class="sb-api" *ngIf="!mini">
      <div class="api-pill" [class.on]="apiOk">
        <span class="apd"></span>{{ apiOk ? 'Système actif' : 'API hors ligne' }}
      </div>
    </div>
    <button class="mini-btn" (click)="mini=!mini">{{ mini?'›':'‹' }}</button>
  </aside>

  <!-- ══ MAIN ═════════════════════════════════════════════════════════════ -->
  <main class="main">

    <!-- TOPBAR -->
    <header class="topbar">
      <div class="tb-l">
        <h2 class="tb-title">{{ tabTitle() }}</h2>
        <span class="tb-sub">{{ today | date:'EEEE d MMMM yyyy' }}</span>
      </div>
      <div class="tb-r">
        <div class="srch">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="#94a3b8" stroke-width="2"/>
            <path d="M21 21l-4.35-4.35" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <input type="text" placeholder="Rechercher un sinistre..."
                 [(ngModel)]="searchQ" (keyup.enter)="doSearch()"/>
        </div>

        <!-- Cloche -->
        <div class="bell-wrap" (click)="$event.stopPropagation();bellOpen=!bellOpen;newAlert=false">
          <button class="bell-btn" [class.bell-blink]="newAlert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round"/>
            </svg>
            <span class="bell-dot" *ngIf="unread>0">{{ unread }}</span>
          </button>
          <div class="bell-drop" *ngIf="bellOpen">
            <div class="bd-hd">
              <span>Alertes Fraude</span>
              <button (click)="markRead()">Tout lire</button>
            </div>
            <div class="bd-item" *ngFor="let a of alertes"
                 [class.unread]="!a.lue" (click)="openAlert(a)">
              <div class="bd-sc" [style.color]="sc(a.score)"
                   [style.background]="sc(a.score)+'18'">{{ a.score }}%</div>
              <div class="bd-i">
                <div class="bd-n">Sinistre {{ a.num }}</div>
                <div class="bd-t">{{ a.time }}</div>
              </div>
              <span class="bd-dot" *ngIf="!a.lue"></span>
            </div>
            <div class="bd-empty" *ngIf="alertes.length===0">Aucune alerte</div>
          </div>
        </div>

        <!-- Profil (UNIQUE — header seulement) -->
        <div class="prof-wrap" (click)="$event.stopPropagation();usrOpen=!usrOpen">
          <div class="prof-chip">
            <div class="prof-av">{{ userInitials }}</div>
            <div class="prof-info">
              <div class="prof-name">{{ user.prenom }} {{ user.nom }}</div>
              <div class="prof-role">{{ user.role }}</div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="color:#94a3b8">
              <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="prof-drop" *ngIf="usrOpen">
            <div class="pd-hd">
              <div class="pd-av">{{ userInitials }}</div>
              <div>
                <div class="pd-name">{{ user.prenom }} {{ user.nom }}</div>
                <div class="pd-role">{{ user.role }}</div>
              </div>
            </div>
            <div class="pd-sep"></div>
            <button class="pd-logout" (click)="logout()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                      stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              Déconnexion
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- ══ DASHBOARD ══════════════════════════════════════════════════════ -->
    <section class="page" *ngIf="tab==='dashboard'">
      <div class="kpi-grid">
        <div class="kpi" style="--ac:#1a56db">
          <div class="kpi-ic" style="background:#eff6ff;color:#1a56db">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                    stroke="currentColor" stroke-width="2"/>
              <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="2"/>
            </svg>
          </div>
          <div><div class="kpi-v">{{ totalSinistres | number }}</div><div class="kpi-l">Total Sinistres</div></div>
          <div class="kpi-tag" style="color:#16a34a;background:#f0fdf4">↑ 2.4%</div>
        </div>
        <div class="kpi" style="--ac:#dc2626">
          <div class="kpi-ic" style="background:#fef2f2;color:#dc2626">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                    stroke="currentColor" stroke-width="2"/>
              <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2"/>
              <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" stroke-width="2"/>
            </svg>
          </div>
          <div><div class="kpi-v">{{ sinistresEleves | number }}</div><div class="kpi-l">Dossiers Critiques</div></div>
          <div class="kpi-tag" style="color:#dc2626;background:#fef2f2">↑ 7.2%</div>
        </div>
        <div class="kpi" style="--ac:#16a34a">
          <div class="kpi-ic" style="background:#f0fdf4;color:#16a34a">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <polyline points="20,6 9,17 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div><div class="kpi-v">{{ nbAnalyses }}</div><div class="kpi-l">Analysés ce jour</div></div>
          <div class="kpi-tag" style="color:#6b7280;background:#f9fafb">—</div>
        </div>
        <div class="kpi" style="--ac:#d97706">
          <div class="kpi-ic" style="background:#fffbeb;color:#d97706">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
              <polyline points="12,6 12,12 16,14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div><div class="kpi-v">{{ decisions.length }}</div><div class="kpi-l">Décisions prises</div></div>
          <div class="kpi-tag" style="color:#d97706;background:#fffbeb">Auj.</div>
        </div>
      </div>

      <div class="dash-grid">
        <!-- Taux fraude -->
        <div class="card">
          <div class="card-hd"><h3>Taux de Détection de Fraude</h3></div>
          <div class="fraud-wrap">
            <div class="fraud-ring">
              <svg viewBox="0 0 120 120" width="110" height="110">
                <circle cx="60" cy="60" r="48" fill="none" stroke="#f1f5f9" stroke-width="12"/>
                <circle cx="60" cy="60" r="48" fill="none" stroke="#dc2626" stroke-width="12"
                        stroke-linecap="round" stroke-dasharray="36.2 265.5"
                        stroke-dashoffset="75.4" transform="rotate(-90 60 60)"/>
                <text x="60" y="56" text-anchor="middle" fill="#1e293b" font-size="18" font-weight="800">12%</text>
                <text x="60" y="70" text-anchor="middle" fill="#94a3b8" font-size="8">fraude</text>
              </svg>
            </div>
            <div class="fraud-legend">
              <div class="fl-item"><span style="background:#dc2626"></span><div><b>3 247</b><small>Fraudes bloquées</small></div></div>
              <div class="fl-item"><span style="background:#d97706"></span><div><b>8 912</b><small>Sous investigation</small></div></div>
              <div class="fl-item"><span style="background:#16a34a"></span><div><b>14 234</b><small>Dossiers conformes</small></div></div>
            </div>
          </div>
        </div>

        <!-- Répartition -->
        <div class="card">
          <div class="card-hd"><h3>Répartition par Niveau de Risque</h3></div>
          <div class="risk-bars">
            <div class="rb">
              <div class="rb-lbl"><span style="background:#dc2626"></span>Critique (&gt;75%)</div>
              <div class="rb-track"><div class="rb-fill" style="width:12%;background:#dc2626"></div></div>
              <span style="color:#dc2626" class="rb-pct">12%</span>
            </div>
            <div class="rb">
              <div class="rb-lbl"><span style="background:#d97706"></span>Investigation (40-75%)</div>
              <div class="rb-track"><div class="rb-fill" style="width:33%;background:#d97706"></div></div>
              <span style="color:#d97706" class="rb-pct">33%</span>
            </div>
            <div class="rb">
              <div class="rb-lbl"><span style="background:#16a34a"></span>Conforme (&lt;40%)</div>
              <div class="rb-track"><div class="rb-fill" style="width:55%;background:#16a34a"></div></div>
              <span style="color:#16a34a" class="rb-pct">55%</span>
            </div>
          </div>
        </div>

        <!-- Dernières analyses -->
        <div class="card">
          <div class="card-hd">
            <h3>Dernières Analyses</h3>
            <button class="btn-sm" (click)="tab='analyse'">+ Nouvelle</button>
          </div>
          <div *ngIf="dernieres.length>0">
            <div class="rec-row" *ngFor="let a of dernieres" (click)="openFromDash(a)">
              <div class="rec-num">{{ a.numSinistre }}</div>
              <div class="rec-bar"><div [style.width.%]="a.score||0" [style.background]="sc(a.score||0)"></div></div>
              <span [style.color]="sc(a.score||0)" class="rec-sc">{{ a.score|number:'1.0-0' }}%</span>
              <span class="oval" [ngClass]="oc(a.score||0)">{{ ol(a.score||0) }}</span>
            </div>
          </div>
          <div class="empty-box" *ngIf="dernieres.length===0">
            <p>Aucune analyse effectuée</p>
            <button class="btn-blue" (click)="tab='analyse'">Analyser →</button>
          </div>
        </div>

        <!-- Gouvernorats -->
        <div class="card">
          <div class="card-hd"><h3>Top Gouvernorats</h3></div>
          <div class="gov-list">
            <div class="gov-row" *ngFor="let g of govs">
              <span class="gov-n">{{ g.n }}</span>
              <div class="gov-track"><div [style.width.%]="g.p" [style.background]="g.c"></div></div>
              <span [style.color]="g.c" class="gov-p">{{ g.p }}%</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ ANALYSE ════════════════════════════════════════════════════════ -->
    <section class="page analyse-page" *ngIf="tab==='analyse'">
      <div class="an-left">

        <div class="card search-card">
          <h3 class="sc-title">Analyser un Sinistre</h3>
          <div class="sc-row">
            <input class="sc-inp" [(ngModel)]="numInput"
                   placeholder="Numéro sinistre (ex: 20033100731)"
                   (keyup.enter)="analyser()"/>
            <button class="btn-blue" (click)="analyser()" [disabled]="loading||!numInput.trim()">
              <span *ngIf="!loading">Analyser →</span>
              <span *ngIf="loading" class="ld-row">
                <span class="ld"></span><span class="ld"></span><span class="ld"></span>
              </span>
            </button>
          </div>
        </div>

        <!-- Loader -->
        <div class="card load-card" *ngIf="loading">
          <div class="lc-spin"><div class="s1"></div><div class="s2"></div><div class="s3"></div></div>
          <h4>Analyse en cours...</h4>
          <p>Random Forest + ARIA traitent votre requête</p>
          <div class="lc-steps">
            <div class="ls" [class.done]="lStep>0">✓ Chargement données sinistre</div>
            <div class="ls" [class.done]="lStep>1">✓ Score ML calculé</div>
            <div class="ls" [class.act]="lStep===2">⟳ Génération explication ARIA...</div>
          </div>
        </div>

        <!-- Résultat -->
        <div class="card result-card" *ngIf="resultat&&!loading">
          <div class="rc-top">
            <div class="score-svg">
              <svg viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="none" stroke="#f1f5f9" stroke-width="10"/>
                <circle cx="60" cy="60" r="50" fill="none"
                        [attr.stroke]="sc(resultat.score_risque)" stroke-width="10"
                        stroke-linecap="round"
                        [attr.stroke-dasharray]="arcVal(resultat.score_risque)"
                        stroke-dashoffset="78.5" transform="rotate(-90 60 60)"/>
                <text x="60" y="55" text-anchor="middle" fill="#1e293b" font-size="20" font-weight="800">
                  {{ resultat.score_risque|number:'1.0-0' }}%</text>
                <text x="60" y="71" text-anchor="middle" fill="#94a3b8" font-size="8">SCORE FRAUDE</text>
              </svg>
            </div>
            <div class="rc-meta">
              <div class="rc-num">Dossier {{ resultat.num_sinistre }}</div>
              <div class="nv-badge" [ngClass]="nvCls(resultat.niveau_risque)">
                {{ nvIco(resultat.niveau_risque) }} {{ resultat.niveau_risque }}
              </div>
              <div class="oval oval-lg" [ngClass]="oc(resultat.score_risque)">{{ ol(resultat.score_risque) }}</div>
              <div class="verdict" [class.ok]="!resultat.est_suspect">
                {{ resultat.est_suspect ? '⚠️ Sinistre SUSPECT' : '✅ Sinistre CONFORME' }}
              </div>
            </div>
          </div>

          <div class="risk-track-wrap">
            <div class="rz-labels">
              <span style="color:#16a34a">Conforme</span>
              <span style="color:#d97706">Investigation</span>
              <span style="color:#ea580c">Élevé</span>
              <span style="color:#dc2626">Fraude</span>
            </div>
            <div class="rz-bar">
              <div style="background:#dcfce7;flex:40"></div>
              <div style="background:#fef9c3;flex:35"></div>
              <div style="background:#ffedd5;flex:18"></div>
              <div style="background:#fee2e2;flex:7"></div>
              <div class="rz-pin" [style.left.%]="resultat.score_risque"
                   [style.background]="sc(resultat.score_risque)"></div>
            </div>
          </div>

          <div class="flags-block" *ngIf="resultat.flags_detectes.length>0">
            <div class="flags-title">🚩 Signaux d'Alerte ({{ resultat.flags_detectes.length }})</div>
            <div class="flags-row">
              <span class="flag-pill" *ngFor="let f of resultat.flags_detectes">{{ f }}</span>
            </div>
          </div>
          <div class="no-flag" *ngIf="resultat.flags_detectes.length===0">
            ✅ Aucun signal binaire — risque évalué par le modèle ML
          </div>

          <div class="aria-box">
            <div class="aria-box-hd">
              <div class="aria-icon-wrap">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                        stroke="#1a56db" stroke-width="2" fill="#eff6ff"/>
                </svg>
              </div>
              <div>
                <div class="aria-box-name">Analyse ARIA</div>
                <div class="aria-box-sub">Agent de Risque et d'Investigation Anti-fraude</div>
              </div>
            </div>
            <div class="aria-box-txt" [innerHTML]="fmt(resultat.explication_ia)"></div>
          </div>

          <!-- DÉCISION -->
          <div class="dec-bloc">
            <div class="dec-bloc-hd">
              <div class="dec-ico-wrap">⚖️</div>
              <div>
                <h4>Décision finale</h4>
                <p>{{ user.prenom }} {{ user.nom }} — {{ today | date:'dd/MM/yyyy HH:mm' }}</p>
              </div>
            </div>
            <div class="dec-taken" *ngIf="decisionPrise">
              <div class="dt-inner" [class.dt-ok]="decisionPrise==='CONFORME'" [class.dt-ko]="decisionPrise==='FRAUDE'">
                <span>{{ decisionPrise==='CONFORME'?'✅':'🚨' }}</span>
                <div>
                  <div class="dt-title">{{ decisionPrise==='CONFORME'?'Dossier Validé — Conforme':'Dossier Bloqué — Fraude suspectée' }}</div>
                  <div class="dt-agent">Par {{ user.prenom }} {{ user.nom }}</div>
                </div>
                <button class="dt-undo" (click)="decisionPrise=null">Annuler</button>
              </div>
            </div>
            <div class="dec-btns" *ngIf="!decisionPrise">
              <button class="btn-ok" (click)="saveDecision('CONFORME')">✅ Valider le dossier</button>
              <button class="btn-ko" (click)="saveDecision('FRAUDE')">🚨 Bloquer — Fraude</button>
            </div>
          </div>

          <div class="action-row">
            <button class="btn-blue" (click)="chatOpen=true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                      stroke="white" stroke-width="2"/>
              </svg>
              Discuter avec ARIA
            </button>
            <button class="btn-outline" (click)="resultat=null;numInput='';decisionPrise=null">↺ Nouvelle analyse</button>
          </div>
        </div>

        <div class="card empty-card" *ngIf="!resultat&&!loading">
          <div class="ec-ico">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" opacity=".2">
              <circle cx="11" cy="11" r="8" stroke="#1a56db" stroke-width="2"/>
              <path d="M21 21l-4.35-4.35" stroke="#1a56db" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <p>Saisissez un numéro de sinistre pour lancer l'analyse IA</p>
        </div>
      </div>

      <!-- Historique sidebar -->
      <div class="an-right">
        <div class="card histo-card">
          <div class="card-hd"><h3>Historique</h3></div>
          <div *ngIf="dernieres.length>0">
            <div class="hi-row" *ngFor="let a of dernieres;let i=index" (click)="reanalyse(a)">
              <span class="hi-i">{{ i+1 }}</span>
              <div class="hi-info">
                <div class="hi-num">{{ a.numSinistre }}</div>
                <div class="hi-bar"><div [style.width.%]="a.score||0" [style.background]="sc(a.score||0)"></div></div>
              </div>
              <span [style.color]="sc(a.score||0)" class="hi-sc">{{ a.score|number:'1.0-0' }}%</span>
            </div>
          </div>
          <div class="histo-empty" *ngIf="dernieres.length===0"><p>Aucune analyse</p></div>
        </div>

        <div class="card histo-card" *ngIf="decisions.length>0">
          <div class="card-hd"><h3>Décisions</h3></div>
          <div class="hi-row" *ngFor="let d of decisions">
            <span>{{ d.statut==='CONFORME'?'✅':'🚨' }}</span>
            <div class="hi-info">
              <div class="hi-num">{{ d.num }}</div>
              <div class="hi-agent">{{ d.agent }} — {{ d.date|date:'HH:mm' }}</div>
            </div>
            <span class="oval" [ngClass]="d.statut==='CONFORME'?'oc-ok':'oc-bad'">
              {{ d.statut==='CONFORME'?'Validé':'Bloqué' }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ LISTE SINISTRES ════════════════════════════════════════════════ -->
    <section class="page" *ngIf="tab==='liste'">
      <div class="card table-card">
        <div class="table-hd">
          <h3>Registre des Sinistres</h3>
          <div class="filter-row">
            <div class="fi-srch">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="8" stroke="#94a3b8" stroke-width="2"/>
                <path d="M21 21l-4.35-4.35" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <input type="text" [(ngModel)]="tfilt" placeholder="Rechercher..."/>
            </div>
            <select class="fi-sel" [(ngModel)]="filtGov">
              <option value="">Tous gouvernorats</option>
              <option *ngFor="let g of listGovs">{{ g }}</option>
            </select>
            <select class="fi-sel" [(ngModel)]="filtNature">
              <option value="">Toutes natures</option>
              <option *ngFor="let n of listNatures">{{ n }}</option>
            </select>
            <select class="fi-sel" [(ngModel)]="filtRisque">
              <option value="">Tous niveaux</option>
              <option value="critique">🔴 Critique (&gt;75%)</option>
              <option value="investigation">🟡 Investigation</option>
              <option value="conforme">🟢 Conforme</option>
              <option value="non-analyse">⬜ Non analysé</option>
            </select>
            <span class="total-tag">{{ sinistresAffiches.length | number }} sinistres</span>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>N° Sinistre & Motifs</th><th>Gouvernorat</th>
                <th>Nature</th><th>Montant TND</th><th>Blessés</th>
                <th>Score</th><th>Niveau</th><th>Décision Agent</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let s of sinistresAffiches;let i=index"
                  [class.row-red]="(s.score||0)>=75"
                  [class.row-yel]="(s.score||0)>=40&&(s.score||0)<75"
                  (click)="clickRow(s)">
                <td class="td-i">{{ i+1 }}</td>
                <td>
                  <div class="td-num">{{ s.numSinistre }}</div>
                  <div class="motifs-row" *ngIf="s.motifs&&s.motifs.length>0">
                    <span class="motif-pill" *ngFor="let m of s.motifs">{{ m }}</span>
                  </div>
                </td>
                <td>{{ s.gouvernorat }}</td>
                <td>{{ s.natureSinistre }}</td>
                <td class="td-amt">{{ s.montantEvaluation|number:'1.0-0' }}</td>
                <td class="td-c">
                  <span class="bl-pill" *ngIf="s.nombreBlesses>0">⚠ {{ s.nombreBlesses }}</span>
                  <span *ngIf="s.nombreBlesses===0" style="color:#cbd5e1">—</span>
                </td>
                <td>
                  <div class="sc-cell" *ngIf="s.score!==undefined">
                    <div class="sc-bar"><div [style.width.%]="s.score" [style.background]="sc(s.score)"></div></div>
                    <span [style.color]="sc(s.score)" class="sc-val">{{ s.score|number:'1.0-0' }}%</span>
                  </div>
                  <span class="na-txt" *ngIf="s.score===undefined">—</span>
                </td>
                <td>
                  <span class="oval" [ngClass]="oc(s.score||0)" *ngIf="s.score!==undefined">{{ ol(s.score||0) }}</span>
                  <span class="na-txt" *ngIf="s.score===undefined">Non analysé</span>
                </td>
                <td>
                  <span class="oval oc-ok"  *ngIf="s.decision==='CONFORME'">✅ Validé</span>
                  <span class="oval oc-bad" *ngIf="s.decision==='FRAUDE'">🚨 Bloqué</span>
                  <span class="na-txt" *ngIf="!s.decision">—</span>
                </td>
                <td>
                  <button class="btn-tbl" (click)="$event.stopPropagation();analyseRow(s)">Analyser</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pagination">
          <button [disabled]="page===0" (click)="goPage(-1)">‹ Préc.</button>
          <span>Page {{ page+1 }} / {{ totalPages }}</span>
          <button [disabled]="page>=totalPages-1" (click)="goPage(1)">Suiv. ›</button>
        </div>
      </div>
    </section>

    <!-- ══ HISTORIQUE ══════════════════════════════════════════════════════ -->
    <section class="page" *ngIf="tab==='historique'">
      <div class="card histo-page">
        <div class="card-hd">
          <div>
            <h3>Historique des Actions</h3>
            <p class="histo-sub">Décisions de {{ user.prenom }} {{ user.nom }}</p>
          </div>
          <div class="histo-counts">
            <span class="oval oc-ok">✅ {{ conformes }} Conformes</span>
            <span class="oval oc-bad">🚨 {{ fraudes }} Fraudes</span>
          </div>
        </div>

        <table class="histo-table" *ngIf="decisions.length>0">
          <thead>
            <tr>
              <th>#</th><th>Date & Heure</th><th>Agent</th>
              <th>N° Sinistre</th><th>Score</th><th>Statut final</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let d of decisions;let i=index"
                [class.htr-ok]="d.statut==='CONFORME'" [class.htr-ko]="d.statut==='FRAUDE'">
              <td class="td-i">{{ decisions.length-i }}</td>
              <td>
                <div>{{ d.date|date:'dd/MM/yyyy' }}</div>
                <div class="td-time">{{ d.date|date:'HH:mm:ss' }}</div>
              </td>
              <td>
                <div class="agent-cell">
                  <div class="ag-av">{{ userInitials }}</div>
                  <span>{{ d.agent }}</span>
                </div>
              </td>
              <td class="td-num">{{ d.num }}</td>
              <td><span [style.color]="sc(d.score)" style="font-weight:700">{{ d.score|number:'1.0-0' }}%</span></td>
              <td>
                <span class="oval" [ngClass]="d.statut==='CONFORME'?'oc-ok':'oc-bad'">
                  {{ d.statut==='CONFORME'?'✅ Dossier Conforme':'🚨 Fraude Suspectée' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="histo-log" *ngIf="decisions.length>0">
          <div class="hl-title">Journal d'activité</div>
          <div class="hl-row" *ngFor="let d of decisions">
            <span [ngClass]="d.statut==='CONFORME'?'hl-ico-ok':'hl-ico-ko'">
              {{ d.statut==='CONFORME'?'✅':'🚨' }}
            </span>
            <span class="hl-txt">
              Le <strong>{{ d.date|date:'dd/MM/yyyy à HH:mm' }}</strong> —
              Agent <strong>{{ d.agent }}</strong> a marqué le sinistre
              N°<strong>{{ d.num }}</strong> comme
              <strong [style.color]="d.statut==='CONFORME'?'#16a34a':'#dc2626'">{{ d.statut }}</strong>
              (Score : {{ d.score|number:'1.0-0' }}%)
            </span>
          </div>
        </div>

        <div class="empty-box" *ngIf="decisions.length===0">
          <p>Aucune décision enregistrée</p>
          <button class="btn-blue" (click)="tab='analyse'">Analyser un sinistre →</button>
        </div>
      </div>
    </section>

  </main>

  <!-- ══ FAB CHAT ═══════════════════════════════════════════════════════════ -->
  <button class="fab" (click)="chatOpen=!chatOpen" [class.fab-on]="chatOpen">
    <span *ngIf="!chatOpen">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
              fill="white" stroke="white" stroke-width="1"/>
      </svg>
    </span>
    <span *ngIf="chatOpen">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <line x1="18" y1="6" x2="6" y2="18" stroke="white" stroke-width="2" stroke-linecap="round"/>
        <line x1="6" y1="6" x2="18" y2="18" stroke="white" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </span>
    <span class="fab-pulse" *ngIf="resultat&&!chatOpen"></span>
  </button>

  <!-- ══ MODAL CHAT (Style ChatGPT) ══════════════════════════════════════════ -->
  <div class="modal-overlay" *ngIf="chatOpen" (click)="chatOpen=false">
    <div class="modal" (click)="$event.stopPropagation()">

      <!-- Modal header -->
      <div class="mhd">
        <div class="mhd-l">
          <div class="mhd-av">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                    fill="white" stroke="white" stroke-width="0.5"/>
            </svg>
          </div>
          <div>
            <div class="mhd-name">ARIA</div>
            <div class="mhd-sub">
              <span class="mhd-dot"></span>
              {{ resultat ? 'Dossier '+resultat.num_sinistre+' — '+(resultat.score_risque|number:"1.0-0")+'%' : 'En attente d\'un dossier' }}
            </div>
          </div>
        </div>
        <div class="mhd-r">
          <span class="oval" [ngClass]="oc(resultat?.score_risque||0)" *ngIf="resultat">
            {{ ol(resultat.score_risque) }}
          </span>
          <button class="mhd-close" (click)="chatOpen=false">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <line x1="18" y1="6" x2="6" y2="18" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>
              <line x1="6" y1="6" x2="18" y2="18" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Messages -->
      <div class="m-msgs" #scrollRef>
        <!-- Welcome -->
        <div class="m-msg aria-m">
          <div class="m-av">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                    fill="white" stroke="white" stroke-width="0.5"/>
            </svg>
          </div>
          <div class="m-bbl a-bbl">
            <span *ngIf="resultat">
              Dossier <strong>{{ resultat.num_sinistre }}</strong> — score
              <strong [style.color]="sc(resultat.score_risque)">{{ resultat.score_risque|number:'1.0-0' }}%</strong>.
              Posez vos questions.
            </span>
            <span *ngIf="!resultat">
              Analysez d'abord un sinistre pour activer le contexte IA.
            </span>
            <span class="m-time">maintenant</span>
          </div>
        </div>

        <!-- Conversation -->
        <div class="m-msg" *ngFor="let m of msgs"
             [ngClass]="m.role==='user'?'user-m':'aria-m'">
          <div class="m-av" *ngIf="m.role==='assistant'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                    fill="white" stroke="white" stroke-width="0.5"/>
            </svg>
          </div>
          <div class="m-bbl" [ngClass]="m.role==='user'?'u-bbl':'a-bbl'">
            <div [innerHTML]="fmt(m.content)"></div>
            <span class="m-time">{{ m.timestamp|date:'HH:mm' }}</span>
          </div>
          <div class="m-uav" *ngIf="m.role==='user'">{{ userInitials }}</div>
        </div>

        <!-- Typing -->
        <div class="m-msg aria-m" *ngIf="typing">
          <div class="m-av">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                    fill="white" stroke="white" stroke-width="0.5"/>
            </svg>
          </div>
          <div class="m-bbl a-bbl m-typing">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>

      <!-- Suggestions -->
      <div class="m-sugs" *ngIf="resultat&&msgs.length===0">
        <button class="m-sug" *ngFor="let s of sugs" (click)="sendSug(s)">{{ s }}</button>
      </div>

      <!-- Input -->
      <div class="m-inp-wrap">
        <div class="m-inp-box" [class.focused]="inpFocus">
          <textarea class="m-ta" [(ngModel)]="msgInp"
                    [disabled]="!resultat||typing"
                    placeholder="Posez une question sur le dossier..."
                    (keydown.enter)="sendMsg($event)"
                    (focus)="inpFocus=true" (blur)="inpFocus=false"
                    rows="1"></textarea>
          <button class="m-send" (click)="sendMsg(null)"
                  [disabled]="!msgInp.trim()||!resultat||typing">
            <svg viewBox="0 0 24 24" fill="none" width="17" height="17">
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                    stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

</div>
  `,
  styles:[`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
    :host{display:block;height:100vh;font-family:'Inter',sans-serif;
      --blue:#1a56db;--blt:#eff6ff;--bmid:#3b82f6;
      --red:#dc2626;--rlt:#fef2f2;
      --org:#ea580c;
      --yel:#d97706;--ylt:#fffbeb;
      --grn:#16a34a;--glt:#f0fdf4;
      --g50:#f4f6f9;--g100:#f1f5f9;--g200:#e2e8f0;
      --g300:#cbd5e1;--g400:#94a3b8;--g500:#64748b;
      --g600:#475569;--g700:#334155;--g900:#0f172a;
      --sh:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);
      --sh-md:0 4px 16px rgba(0,0,0,.08);
      --sh-lg:0 10px 40px rgba(0,0,0,.14);
      --r:14px;--r-sm:8px;}
    *{box-sizing:border-box;margin:0;padding:0;}
    .app{display:flex;height:100vh;background:var(--g50);overflow:hidden;}

    /* SIDEBAR */
    .sidebar{width:220px;min-width:220px;background:white;border-right:1px solid var(--g200);
      display:flex;flex-direction:column;padding:20px 0;transition:width .25s,min-width .25s;
      position:relative;box-shadow:var(--sh);z-index:50;}
    .sidebar.mini{width:64px;min-width:64px;}
    .sb-brand{display:flex;align-items:center;gap:10px;padding:0 16px 20px;
      border-bottom:1px solid var(--g100);margin-bottom:12px;}
    .sb-logo-wrap{position:relative;width:34px;height:34px;flex-shrink:0;}
    .sb-img{width:34px;height:34px;border-radius:8px;object-fit:contain;}
    .sb-svg{width:34px;height:34px;align-items:center;justify-content:center;}
    .sb-txt{line-height:1.2;}
    .t1{font-weight:800;font-size:1.15rem;color:var(--g900);}
    .t2{font-weight:800;font-size:1.15rem;color:var(--blue);}
    .sb-txt small{display:block;font-size:.62rem;color:var(--g400);margin-top:1px;}
    .sb-nav{flex:1;display:flex;flex-direction:column;gap:2px;padding:0 8px;}
    .nb{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;
      border-radius:var(--r-sm);background:transparent;border:none;color:var(--g600);
      cursor:pointer;font-size:.84rem;font-family:'Inter',sans-serif;font-weight:500;
      transition:all .2s;text-align:left;position:relative;}
    .nb:hover{background:var(--g50);color:var(--blue);}
    .nb.act{background:var(--blt);color:var(--blue);font-weight:600;}
    .ni{font-size:1rem;width:22px;text-align:center;flex-shrink:0;}
    .nl{white-space:nowrap;}
    .nb-count{position:absolute;right:8px;background:var(--blue);color:white;
      font-size:.6rem;padding:1px 6px;border-radius:10px;font-weight:700;}
    .sb-api{padding:14px;margin-top:auto;}
    .api-pill{display:flex;align-items:center;gap:7px;font-size:.7rem;color:var(--red);font-weight:500;}
    .api-pill.on{color:var(--grn);}
    .apd{width:7px;height:7px;border-radius:50%;background:currentColor;animation:pulse 2s infinite;}
    .mini-btn{position:absolute;right:-13px;top:50%;transform:translateY(-50%);
      width:26px;height:26px;border-radius:50%;background:white;border:1px solid var(--g200);
      color:var(--blue);cursor:pointer;font-size:.9rem;display:flex;align-items:center;
      justify-content:center;box-shadow:var(--sh);z-index:60;}

    /* MAIN */
    .main{flex:1;display:flex;flex-direction:column;overflow:hidden;}
    .topbar{display:flex;justify-content:space-between;align-items:center;padding:14px 28px;
      background:white;border-bottom:1px solid var(--g200);box-shadow:var(--sh);
      flex-shrink:0;z-index:40;position:relative;}
    .tb-title{font-size:1.05rem;font-weight:700;color:var(--g900);}
    .tb-sub{font-size:.7rem;color:var(--g400);margin-top:2px;}
    .tb-r{display:flex;align-items:center;gap:12px;}
    .srch{display:flex;align-items:center;gap:8px;background:var(--g50);
      border:1px solid var(--g200);border-radius:var(--r-sm);padding:7px 12px;}
    .srch input{background:transparent;border:none;outline:none;font-size:.82rem;
      color:var(--g700);width:180px;font-family:'Inter',sans-serif;}
    .srch input::placeholder{color:var(--g400);}

    /* Bell */
    .bell-wrap{position:relative;}
    .bell-btn{position:relative;background:var(--g50);border:1px solid var(--g200);
      border-radius:var(--r-sm);padding:8px;cursor:pointer;color:var(--g500);
      display:flex;align-items:center;justify-content:center;transition:all .2s;}
    .bell-btn:hover{background:var(--g100);}
    .bell-dot{position:absolute;top:-5px;right:-5px;background:var(--red);color:white;
      font-size:.58rem;width:16px;height:16px;border-radius:50%;display:flex;
      align-items:center;justify-content:center;font-weight:700;}
    .bell-blink{animation:bellPulse 1s infinite;}
    .bell-drop{position:absolute;right:0;top:calc(100% + 8px);width:300px;background:white;
      border:1px solid var(--g200);border-radius:var(--r);box-shadow:var(--sh-lg);z-index:100;overflow:hidden;}
    .bd-hd{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;
      border-bottom:1px solid var(--g100);font-size:.82rem;font-weight:600;color:var(--g700);}
    .bd-hd button{background:none;border:none;font-size:.72rem;color:var(--blue);cursor:pointer;}
    .bd-item{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;
      transition:background .15s;border-bottom:1px solid var(--g50);position:relative;}
    .bd-item:hover{background:var(--g50);}
    .bd-item.unread{background:#fefce8;}
    .bd-sc{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;
      justify-content:center;font-size:.7rem;font-weight:700;flex-shrink:0;
      font-family:'JetBrains Mono',monospace;}
    .bd-i{flex:1;}
    .bd-n{font-size:.8rem;font-weight:600;color:var(--g700);}
    .bd-t{font-size:.65rem;color:var(--g400);}
    .bd-dot{width:8px;height:8px;border-radius:50%;background:var(--blue);flex-shrink:0;}
    .bd-empty{padding:20px;text-align:center;color:var(--g400);font-size:.82rem;}

    /* Profil */
    .prof-wrap{position:relative;}
    .prof-chip{display:flex;align-items:center;gap:8px;padding:6px 10px;
      border-radius:var(--r-sm);cursor:pointer;transition:background .15s;}
    .prof-chip:hover{background:var(--g50);}
    .prof-av{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--blue),#06b6d4);
      color:white;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;}
    .prof-name{font-size:.82rem;font-weight:700;color:var(--g900);}
    .prof-role{font-size:.65rem;color:var(--g400);}
    .prof-drop{position:absolute;right:0;top:calc(100% + 8px);width:220px;background:white;
      border:1px solid var(--g200);border-radius:var(--r);box-shadow:var(--sh-lg);z-index:100;overflow:hidden;}
    .pd-hd{display:flex;align-items:center;gap:10px;padding:14px;background:var(--g50);}
    .pd-av{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--blue),#06b6d4);
      color:white;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;flex-shrink:0;}
    .pd-name{font-size:.82rem;font-weight:700;color:var(--g900);}
    .pd-role{font-size:.68rem;color:var(--g400);}
    .pd-sep{height:1px;background:var(--g100);}
    .pd-logout{display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;
      background:none;border:none;text-align:left;font-size:.82rem;color:var(--red);
      cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;transition:background .15s;}
    .pd-logout:hover{background:var(--rlt);}

    /* PAGE */
    .page{flex:1;overflow-y:auto;padding:24px 28px;
      scrollbar-width:thin;scrollbar-color:var(--g200) transparent;}
    .card{background:white;border:1px solid var(--g200);border-radius:var(--r);
      box-shadow:var(--sh);padding:20px;margin-bottom:16px;}
    .card-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}
    .card-hd h3{font-size:.92rem;font-weight:700;color:var(--g900);}

    /* OVAL BADGES */
    .oval{display:inline-flex;align-items:center;padding:3px 10px;border-radius:50px;
      font-size:.68rem;font-weight:700;white-space:nowrap;}
    .oval-lg{font-size:.76rem;padding:5px 14px;margin:6px 0;}
    .oc-red{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;}
    .oc-yel{background:#fffbeb;color:#d97706;border:1px solid #fde68a;}
    .oc-ok {background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;}
    .oc-bad{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;}

    /* KPI */
    .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px;}
    .kpi{background:white;border:1px solid var(--g200);border-radius:var(--r);
      padding:18px 20px;display:flex;align-items:center;gap:14px;box-shadow:var(--sh);
      position:relative;overflow:hidden;transition:transform .2s,box-shadow .2s;}
    .kpi:hover{transform:translateY(-2px);box-shadow:var(--sh-md);}
    .kpi::after{content:'';position:absolute;top:0;left:0;width:4px;height:100%;
      background:var(--ac,#1a56db);border-radius:4px 0 0 4px;}
    .kpi-ic{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;
      justify-content:center;font-size:1.1rem;flex-shrink:0;}
    .kpi-v{font-size:1.5rem;font-weight:800;color:var(--g900);
      font-family:'JetBrains Mono',monospace;line-height:1;}
    .kpi-l{font-size:.72rem;color:var(--g400);margin-top:4px;font-weight:500;}
    .kpi-tag{font-size:.7rem;font-weight:700;padding:3px 8px;border-radius:20px;
      position:absolute;top:14px;right:14px;}

    /* DASHBOARD GRID */
    .dash-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
    .fraud-wrap{display:flex;align-items:center;gap:20px;}
    .fraud-ring{flex-shrink:0;}
    .fraud-legend{display:flex;flex-direction:column;gap:12px;}
    .fl-item{display:flex;align-items:center;gap:10px;}
    .fl-item span{width:10px;height:10px;border-radius:50%;flex-shrink:0;}
    .fl-item b{font-size:1rem;font-weight:700;color:var(--g900);
      font-family:'JetBrains Mono',monospace;display:block;}
    .fl-item small{font-size:.7rem;color:var(--g400);}
    .risk-bars{display:flex;flex-direction:column;gap:14px;}
    .rb{display:flex;align-items:center;gap:10px;}
    .rb-lbl{width:165px;font-size:.76rem;color:var(--g600);display:flex;align-items:center;gap:6px;flex-shrink:0;}
    .rb-lbl span{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
    .rb-track{flex:1;height:8px;background:var(--g100);border-radius:4px;overflow:hidden;}
    .rb-fill{height:100%;border-radius:4px;transition:width 1s;}
    .rb-pct{width:36px;font-size:.76rem;font-weight:700;
      font-family:'JetBrains Mono',monospace;text-align:right;}
    .rec-row{display:flex;align-items:center;gap:10px;padding:8px 6px;
      border-bottom:1px solid var(--g100);cursor:pointer;border-radius:var(--r-sm);transition:background .15s;}
    .rec-row:hover{background:var(--g50);}
    .rec-num{font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--g700);flex:1;}
    .rec-bar{width:60px;height:5px;background:var(--g100);border-radius:3px;overflow:hidden;}
    .rec-bar div{height:100%;border-radius:3px;}
    .rec-sc{font-family:'JetBrains Mono',monospace;font-size:.78rem;font-weight:700;width:34px;text-align:right;}
    .gov-list{display:flex;flex-direction:column;gap:10px;}
    .gov-row{display:flex;align-items:center;gap:12px;}
    .gov-n{width:70px;font-size:.76rem;color:var(--g600);font-weight:500;text-align:right;}
    .gov-track{flex:1;height:8px;background:var(--g100);border-radius:4px;overflow:hidden;}
    .gov-track div{height:100%;border-radius:4px;}
    .gov-p{width:38px;font-size:.72rem;font-weight:600;font-family:'JetBrains Mono',monospace;}
    .empty-box{text-align:center;padding:30px;}
    .empty-box p{font-size:.84rem;color:var(--g400);margin-bottom:14px;}

    /* ANALYSE */
    .analyse-page{display:grid!important;grid-template-columns:1fr 290px;gap:20px;
      align-items:start;padding:24px 28px;}
    .an-left,.an-right{display:flex;flex-direction:column;}
    .search-card{border-left:4px solid var(--blue);}
    .sc-title{font-size:.92rem;font-weight:700;color:var(--blue);margin-bottom:14px;}
    .sc-row{display:flex;gap:10px;}
    .sc-inp{flex:1;padding:10px 14px;background:var(--g50);border:1px solid var(--g200);
      border-radius:var(--r-sm);font-size:.85rem;color:var(--g900);
      font-family:'JetBrains Mono',monospace;outline:none;transition:border-color .2s;}
    .sc-inp:focus{border-color:var(--blue);background:white;}
    .load-card{text-align:center;padding:40px;border:2px dashed var(--g200);background:var(--g50);}
    .lc-spin{position:relative;width:70px;height:70px;margin:0 auto 20px;}
    .s1,.s2,.s3{position:absolute;border-radius:50%;border:2px solid transparent;animation:spin 2s linear infinite;}
    .s1{inset:0;border-top-color:var(--blue);}
    .s2{inset:10px;border-top-color:#06b6d4;animation-duration:1.5s;animation-direction:reverse;}
    .s3{inset:20px;border-top-color:var(--bmid);animation-duration:1s;}
    .load-card h4{font-size:.95rem;font-weight:700;color:var(--g700);margin-bottom:6px;}
    .load-card p{font-size:.78rem;color:var(--g400);margin-bottom:20px;}
    .lc-steps{display:flex;flex-direction:column;gap:8px;text-align:left;max-width:280px;margin:0 auto;}
    .ls{font-size:.78rem;color:var(--g300);padding:6px 10px;border-radius:6px;background:var(--g100);font-weight:500;}
    .ls.done{color:var(--grn);background:var(--glt);}
    .ls.act{color:var(--blue);background:var(--blt);animation:flash 1s infinite;}
    @keyframes flash{0%,100%{opacity:1}50%{opacity:.5}}
    .ld-row{display:flex;align-items:center;gap:5px;}
    .ld{width:5px;height:5px;border-radius:50%;background:white;animation:bounce 1.2s infinite;display:block;}
    .ld:nth-child(2){animation-delay:.2s}.ld:nth-child(3){animation-delay:.4s}
    .result-card{border-top:4px solid var(--blue);}
    .rc-top{display:flex;align-items:center;gap:20px;margin-bottom:20px;}
    .score-svg{width:110px;height:110px;flex-shrink:0;}
    .score-svg svg{width:100%;height:100%;}
    .rc-num{font-size:1.05rem;font-weight:800;color:var(--g900);margin-bottom:8px;
      font-family:'JetBrains Mono',monospace;}
    .nv-badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:.72rem;font-weight:700;margin-bottom:6px;}
    .nv-tres{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;}
    .nv-eleve{background:#fff7ed;color:#ea580c;border:1px solid #fdba74;}
    .nv-mod{background:#fffbeb;color:#d97706;border:1px solid #fde68a;}
    .nv-faib{background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;}
    .verdict{font-size:.8rem;font-weight:700;color:var(--red);}
    .verdict.ok{color:var(--grn);}
    .risk-track-wrap{margin-bottom:20px;}
    .rz-labels{display:flex;justify-content:space-between;font-size:.65rem;font-weight:600;margin-bottom:6px;}
    .rz-bar{height:12px;border-radius:6px;overflow:visible;position:relative;display:flex;background:var(--g100);}
    .rz-bar div{flex:1;}
    .rz-bar div:first-child{border-radius:6px 0 0 6px;}
    .rz-bar div:last-of-type{border-radius:0 6px 6px 0;}
    .rz-pin{position:absolute;top:-4px;width:20px;height:20px;border-radius:50%;
      border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.2);transform:translateX(-50%);transition:left 1s;}
    .flags-block{margin-bottom:16px;}
    .flags-title{font-size:.8rem;font-weight:700;color:var(--yel);margin-bottom:8px;}
    .flags-row{display:flex;flex-wrap:wrap;gap:6px;}
    .flag-pill{padding:4px 10px;background:#fffbeb;border:1px solid #fde68a;border-radius:50px;
      font-size:.7rem;color:#92400e;font-weight:500;}
    .no-flag{font-size:.78rem;color:var(--g400);padding:8px 0;margin-bottom:16px;}
    .aria-box{background:var(--g50);border:1px solid var(--g200);border-left:3px solid var(--blue);
      border-radius:var(--r-sm);padding:14px 16px;margin-bottom:16px;}
    .aria-box-hd{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
    .aria-icon-wrap{width:32px;height:32px;border-radius:50%;background:var(--blt);display:flex;
      align-items:center;justify-content:center;flex-shrink:0;}
    .aria-box-name{font-size:.84rem;font-weight:700;color:var(--g900);}
    .aria-box-sub{font-size:.68rem;color:var(--g400);}
    .aria-box-txt{font-size:.8rem;line-height:1.7;color:var(--g700);}
    .dec-bloc{border:2px solid var(--g200);border-radius:var(--r);padding:18px;margin-bottom:18px;background:var(--g50);}
    .dec-bloc-hd{display:flex;align-items:center;gap:12px;margin-bottom:14px;}
    .dec-ico-wrap{font-size:1.6rem;}
    .dec-bloc-hd h4{font-size:.92rem;font-weight:700;color:var(--g900);margin-bottom:2px;}
    .dec-bloc-hd p{font-size:.72rem;color:var(--g400);}
    .dec-btns{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
    .btn-ok{padding:12px 16px;border-radius:var(--r-sm);font-weight:700;font-family:'Inter',sans-serif;
      font-size:.85rem;cursor:pointer;background:var(--glt);border:2px solid #86efac;
      color:var(--grn);transition:all .2s;display:flex;align-items:center;justify-content:center;gap:6px;}
    .btn-ok:hover{background:#dcfce7;border-color:var(--grn);transform:translateY(-1px);}
    .btn-ko{padding:12px 16px;border-radius:var(--r-sm);font-weight:700;font-family:'Inter',sans-serif;
      font-size:.85rem;cursor:pointer;background:var(--rlt);border:2px solid #fca5a5;
      color:var(--red);transition:all .2s;display:flex;align-items:center;justify-content:center;gap:6px;}
    .btn-ko:hover{background:#fee2e2;border-color:var(--red);transform:translateY(-1px);}
    .dec-taken{}
    .dt-inner{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:var(--r-sm);border:2px solid;}
    .dt-ok{background:#f0fdf4;border-color:#86efac;}
    .dt-ko{background:#fef2f2;border-color:#fca5a5;}
    .dt-title{font-size:.85rem;font-weight:700;color:var(--g900);}
    .dt-agent{font-size:.7rem;color:var(--g400);margin-top:2px;}
    .dt-undo{margin-left:auto;background:none;border:1px solid var(--g200);padding:4px 10px;
      border-radius:6px;font-size:.72rem;color:var(--g500);cursor:pointer;font-family:'Inter',sans-serif;}
    .action-row{display:flex;gap:10px;}
    .empty-card{text-align:center;padding:60px 40px;border:2px dashed var(--g200);background:var(--g50);}
    .ec-ico{display:flex;justify-content:center;margin-bottom:14px;}
    .empty-card p{font-size:.84rem;color:var(--g400);}
    .histo-card{padding:16px;}
    .histo-card .card-hd{margin-bottom:12px;}
    .hi-row{display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid var(--g100);
      cursor:pointer;transition:background .15s;border-radius:var(--r-sm);}
    .hi-row:hover{background:var(--g50);}
    .hi-i{width:20px;height:20px;border-radius:50%;background:var(--g100);display:flex;
      align-items:center;justify-content:center;font-size:.62rem;color:var(--g500);flex-shrink:0;}
    .hi-info{flex:1;}
    .hi-num{font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--g700);margin-bottom:4px;}
    .hi-bar{height:4px;background:var(--g100);border-radius:2px;overflow:hidden;}
    .hi-bar div{height:100%;border-radius:2px;}
    .hi-sc{font-family:'JetBrains Mono',monospace;font-size:.72rem;font-weight:700;}
    .hi-agent{font-size:.65rem;color:var(--g400);margin-top:2px;}
    .histo-empty{text-align:center;padding:20px;color:var(--g400);font-size:.8rem;}

    /* TABLE */
    .table-card{padding:0;overflow:hidden;}
    .table-hd{padding:16px 20px;border-bottom:1px solid var(--g100);}
    .table-hd h3{font-size:.92rem;font-weight:700;color:var(--g900);margin-bottom:12px;}
    .filter-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
    .fi-srch{display:flex;align-items:center;gap:6px;background:var(--g50);
      border:1px solid var(--g200);border-radius:var(--r-sm);padding:7px 10px;}
    .fi-srch input{background:transparent;border:none;outline:none;font-size:.78rem;
      color:var(--g700);width:140px;font-family:'Inter',sans-serif;}
    .fi-sel{padding:7px 10px;background:var(--g50);border:1px solid var(--g200);
      border-radius:var(--r-sm);font-size:.78rem;outline:none;font-family:'Inter',sans-serif;color:var(--g700);}
    .fi-sel:focus{border-color:var(--blue);}
    .total-tag{padding:4px 10px;background:var(--blt);border-radius:20px;
      font-size:.7rem;color:var(--blue);font-weight:600;white-space:nowrap;}
    .table-wrap{overflow-x:auto;}
    table{width:100%;border-collapse:collapse;font-size:.8rem;}
    th{text-align:left;padding:10px 14px;background:var(--g50);color:var(--g500);
      font-weight:600;font-size:.68rem;text-transform:uppercase;letter-spacing:.5px;
      white-space:nowrap;border-bottom:2px solid var(--g100);}
    td{padding:11px 14px;border-bottom:1px solid var(--g100);color:var(--g700);vertical-align:middle;}
    tr:hover td{background:var(--g50);cursor:pointer;}
    tr.row-red td{background:#fff5f5;}
    tr.row-yel td{background:#fffdf0;}
    .td-i{color:var(--g400);font-size:.72rem;}
    .td-num{font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--blue);font-weight:600;}
    .motifs-row{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;}
    .motif-pill{padding:2px 8px;background:var(--blt);border:1px solid #bfdbfe;border-radius:50px;
      font-size:.62rem;color:var(--blue);font-weight:500;white-space:nowrap;}
    .td-amt{font-family:'JetBrains Mono',monospace;font-weight:600;}
    .td-c{text-align:center;}
    .etat-pill{padding:3px 8px;background:var(--g100);border-radius:6px;font-size:.68rem;color:var(--g600);font-weight:500;}
    .bl-pill{padding:3px 8px;background:#fff7ed;color:var(--org);border-radius:10px;font-size:.7rem;font-weight:600;}
    .sc-cell{display:flex;align-items:center;gap:8px;}
    .sc-bar{width:50px;height:5px;background:var(--g100);border-radius:3px;overflow:hidden;}
    .sc-bar div{height:100%;border-radius:3px;}
    .sc-val{font-family:'JetBrains Mono',monospace;font-size:.72rem;font-weight:700;}
    .na-txt{font-size:.68rem;color:var(--g400);font-style:italic;}
    .pagination{display:flex;justify-content:center;align-items:center;gap:14px;padding:14px;
      font-size:.8rem;color:var(--g600);border-top:1px solid var(--g100);}
    .pagination button{padding:6px 14px;background:white;border:1px solid var(--g200);
      border-radius:var(--r-sm);color:var(--g700);cursor:pointer;font-size:.8rem;
      font-family:'Inter',sans-serif;font-weight:500;transition:all .2s;}
    .pagination button:hover:not(:disabled){border-color:var(--blue);color:var(--blue);background:var(--blt);}
    .pagination button:disabled{opacity:.4;cursor:not-allowed;}

    /* HISTORIQUE PAGE */
    .histo-page{padding:0;overflow:hidden;}
    .histo-page .card-hd{padding:16px 20px;border-bottom:1px solid var(--g100);margin-bottom:0;}
    .histo-sub{font-size:.75rem;color:var(--g400);margin-top:3px;}
    .histo-counts{display:flex;gap:10px;}
    .histo-table{width:100%;border-collapse:collapse;font-size:.8rem;}
    .histo-table th{text-align:left;padding:10px 16px;background:var(--g50);color:var(--g500);
      font-weight:600;font-size:.68rem;text-transform:uppercase;letter-spacing:.5px;
      border-bottom:2px solid var(--g100);}
    .histo-table td{padding:12px 16px;border-bottom:1px solid var(--g100);vertical-align:middle;}
    .htr-ok td{background:#f8fff8;}
    .htr-ko td{background:#fff8f8;}
    .td-time{font-size:.65rem;color:var(--g400);margin-top:2px;}
    .agent-cell{display:flex;align-items:center;gap:8px;}
    .ag-av{width:28px;height:28px;border-radius:50%;background:var(--blue);color:white;
      display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;flex-shrink:0;}
    .histo-log{padding:16px 20px;border-top:1px solid var(--g100);}
    .hl-title{font-size:.78rem;font-weight:700;color:var(--g700);margin-bottom:10px;
      text-transform:uppercase;letter-spacing:.5px;}
    .hl-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;
      border-bottom:1px solid var(--g50);font-size:.78rem;color:var(--g600);}
    .hl-ico-ok{color:var(--grn);font-size:.9rem;flex-shrink:0;margin-top:1px;}
    .hl-ico-ko{color:var(--red);font-size:.9rem;flex-shrink:0;margin-top:1px;}
    .hl-txt{flex:1;line-height:1.5;}

    /* FAB */
    .fab{position:fixed;bottom:28px;right:28px;width:56px;height:56px;border-radius:50%;
      background:linear-gradient(135deg,var(--blue),#06b6d4);border:none;cursor:pointer;
      color:white;display:flex;align-items:center;justify-content:center;
      box-shadow:0 4px 20px rgba(26,86,219,.4);z-index:200;transition:transform .2s,box-shadow .2s;}
    .fab:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(26,86,219,.5);}
    .fab.fab-on{background:linear-gradient(135deg,#475569,#334155);}
    .fab-pulse{position:absolute;top:4px;right:4px;width:12px;height:12px;border-radius:50%;
      background:var(--grn);border:2px solid white;animation:pulse 2s infinite;}

    /* MODAL CHAT */
    .modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(6px);
      z-index:300;display:flex;align-items:center;justify-content:center;padding:24px;}
    .modal{background:white;border-radius:20px;width:100%;max-width:660px;height:72vh;
      max-height:660px;display:flex;flex-direction:column;
      box-shadow:0 24px 80px rgba(0,0,0,.22);overflow:hidden;animation:mIn .22s ease;}
    @keyframes mIn{from{transform:scale(.94);opacity:0}to{transform:scale(1);opacity:1}}
    .mhd{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;
      border-bottom:1px solid var(--g100);background:white;}
    .mhd-l{display:flex;align-items:center;gap:12px;}
    .mhd-av{width:38px;height:38px;border-radius:50%;
      background:linear-gradient(135deg,var(--blue),#06b6d4);
      display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    .mhd-name{font-size:.95rem;font-weight:800;color:var(--g900);}
    .mhd-sub{font-size:.72rem;color:var(--g400);display:flex;align-items:center;gap:5px;margin-top:1px;}
    .mhd-dot{width:6px;height:6px;border-radius:50%;background:var(--grn);flex-shrink:0;animation:pulse 2s infinite;}
    .mhd-r{display:flex;align-items:center;gap:8px;}
    .mhd-close{background:var(--g100);border:none;width:30px;height:30px;border-radius:50%;
      cursor:pointer;display:flex;align-items:center;justify-content:center;
      color:var(--g500);transition:background .15s;}
    .mhd-close:hover{background:var(--g200);}
    .m-msgs{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:14px;
      background:#f8fafc;scrollbar-width:thin;scrollbar-color:var(--g200) transparent;}
    .m-msg{display:flex;align-items:flex-end;gap:8px;}
    .user-m{flex-direction:row-reverse;}
    .aria-m{}
    .m-av{width:30px;height:30px;border-radius:50%;
      background:linear-gradient(135deg,var(--blue),#06b6d4);
      display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    .m-uav{width:30px;height:30px;border-radius:50%;background:var(--blue);color:white;
      display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;flex-shrink:0;}
    .m-bbl{max-width:72%;padding:10px 14px;border-radius:16px;font-size:.83rem;
      line-height:1.6;box-shadow:var(--sh);}
    .a-bbl{background:white;border:1px solid var(--g200);border-bottom-left-radius:4px;color:#1e293b;}
    .u-bbl{background:var(--blue);color:white;border-bottom-right-radius:4px;}
    .u-bbl .m-time{color:rgba(255,255,255,.6);}
    .m-time{font-size:.6rem;color:var(--g400);margin-top:4px;display:block;}
    .m-typing{display:flex;align-items:center;gap:5px;padding:14px 18px;}
    .m-typing span{width:7px;height:7px;border-radius:50%;background:var(--bmid);
      animation:bounce 1.2s infinite;display:block;}
    .m-typing span:nth-child(2){animation-delay:.2s}.m-typing span:nth-child(3){animation-delay:.4s}
    .m-sugs{padding:10px 20px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--g100);background:white;}
    .m-sug{padding:6px 12px;background:var(--g50);border:1px solid var(--g200);border-radius:20px;
      font-size:.73rem;color:var(--g600);cursor:pointer;font-family:'Inter',sans-serif;
      font-weight:500;transition:all .15s;}
    .m-sug:hover{border-color:var(--blue);color:var(--blue);background:var(--blt);}
    .m-inp-wrap{padding:14px 20px;background:white;border-top:1px solid var(--g200);}
    .m-inp-box{display:flex;gap:10px;align-items:flex-end;background:var(--g50);
      border:1.5px solid var(--g200);border-radius:14px;padding:8px 8px 8px 16px;
      transition:border-color .2s,box-shadow .2s;}
    .m-inp-box.focused{border-color:var(--blue);box-shadow:0 0 0 3px rgba(26,86,219,.1);}
    .m-ta{flex:1;background:transparent;border:none;outline:none;font-size:.85rem;
      color:var(--g900);resize:none;max-height:100px;line-height:1.5;font-family:'Inter',sans-serif;}
    .m-ta::placeholder{color:var(--g400);}
    .m-ta:disabled{opacity:.5;}
    .m-send{width:38px;height:38px;border-radius:10px;background:var(--blue);border:none;
      cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;
      transition:opacity .2s,transform .15s;}
    .m-send:hover:not(:disabled){opacity:.9;transform:scale(1.05);}
    .m-send:disabled{opacity:.4;cursor:not-allowed;}

    /* BOUTONS COMMUNS */
    .btn-blue{padding:9px 18px;background:var(--blue);border:none;border-radius:var(--r-sm);
      color:white;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;font-size:.84rem;
      transition:all .2s;display:inline-flex;align-items:center;gap:7px;}
    .btn-blue:hover:not(:disabled){background:#1545b8;transform:translateY(-1px);}
    .btn-blue:disabled{opacity:.45;cursor:not-allowed;transform:none;}
    .btn-outline{padding:9px 16px;background:white;border:1px solid var(--g200);
      border-radius:var(--r-sm);color:var(--g700);font-weight:600;cursor:pointer;
      font-family:'Inter',sans-serif;font-size:.84rem;transition:all .2s;}
    .btn-outline:hover{border-color:var(--blue);color:var(--blue);background:var(--blt);}
    .btn-sm{padding:5px 12px;background:var(--blt);border:1px solid #bfdbfe;
      border-radius:var(--r-sm);color:var(--blue);font-size:.75rem;font-weight:600;
      cursor:pointer;font-family:'Inter',sans-serif;}
    .btn-tbl{padding:5px 12px;background:white;border:1px solid var(--g200);border-radius:7px;
      color:var(--blue);font-size:.73rem;font-weight:600;cursor:pointer;
      font-family:'Inter',sans-serif;transition:all .15s;}
    .btn-tbl:hover{background:var(--blt);border-color:var(--blue);}

    /* ANIMATIONS */
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    @keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes bellPulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.4)}50%{box-shadow:0 0 0 6px rgba(220,38,38,0)}}
  `]
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

  get listGovs(): string[] {
    return [...new Set(this.sinistres.map(s => s.gouvernorat).filter(g => g && g !== '—'))];
  }
  get listNatures(): string[] {
    return [...new Set(this.sinistres.map(s => s.natureSinistre).filter(n => n && n !== '—'))];
  }
  get sinistresAffiches(): SinistreItem[] {
    return this.sinistres.filter(s => {
      const q = this.tfilt.toLowerCase();
      const t = !q || s.numSinistre?.toLowerCase().includes(q) ||
                s.gouvernorat?.toLowerCase().includes(q) || s.natureSinistre?.toLowerCase().includes(q);
      const g = !this.filtGov    || s.gouvernorat    === this.filtGov;
      const n = !this.filtNature || s.natureSinistre === this.filtNature;
      const v = s.score ?? -1;
      const r = !this.filtRisque ||
        (this.filtRisque === 'critique'      && v >= 75) ||
        (this.filtRisque === 'investigation' && v >= 40 && v < 75) ||
        (this.filtRisque === 'conforme'      && v >= 0  && v < 40) ||
        (this.filtRisque === 'non-analyse'   && v === -1);
      return t && g && n && r;
    });
  }

  // ── Alertes ───────────────────────────────────────────────────────────────
  bellOpen : boolean  = false;
  usrOpen  : boolean  = false;
  newAlert : boolean  = false;
  alertes  : Alerte[] = [
    { id:'1', num:'20033100731', score:83, time:'Il y a 2 min',  lue:false },
    { id:'2', num:'20024500192', score:91, time:'Il y a 15 min', lue:false },
    { id:'3', num:'20019873421', score:76, time:'Il y a 1h',     lue:true  },
  ];
  get unread(): number { return this.alertes.filter(a => !a.lue).length; }

  // ── Chat ──────────────────────────────────────────────────────────────────
  msgInp  : string        = '';
  msgs    : ChatMessage[] = [];
  typing  : boolean       = false;
  inpFocus: boolean       = false;

  sugs = [
    '🔍 Pourquoi ce sinistre est-il suspect ?',
    '📋 Génère un rapport d\'audit',
    '⚠️ Quels éléments vérifier en priorité ?',
    '📊 Résume les points clés du dossier'
  ];

  private exData: any = {
    MONTANT_EVALUATION:45000,DELAI_DECLARATION:8,DELAI_OUVERTURE:1,
    DELAI_CONTRAT_SINISTRE:5,NOMBRE_BLESSES:1,NOMBRE_DECES:0,
    AGE_VEHICULE:12,DUREE_CONTRAT:365,RATIO_VALEUR_PUISSANCE:850,
    KLM_TOTAL:650,KLM_MAX:650,MONTANT_REMORQUAGE_TOTAL:380,
    JOURS_REMPLACEMENT_TOTAL:0,MOIS_SURVENANCE:3,JOUR_SEMAINE:6,
    cumul_reglement:0,Total_SAP_Final:42000,PUISSANCE:90,VALEUR_VENALE:18000,
    ACCIDENT_WEEKEND:1,DECLARATION_TARDIVE:1,FLAG_VICTIME:1,
    CONTRAT_RECENT_SINISTRE:1,MONTANT_EVALUATION_SUSPECT:1,
    ZONE_SINISTRALITE_ELEVEE:1,DISTANCE_REMORQUAGE_SUSPECTE:1,
    GOUVERNORAT_ENC:23,NATURE_SINISTRE_ENC:1,TYPE_SINISTRE_ENC:3,
    LIB_ETAT_SINISTRE_ENC:2,SEGMENT_ENC:1,usage_ENC:1,CODE_TYPE_CONTRAT_ENC:0
  };

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
    }
    this.svc.healthCheck().subscribe({
      next : () => { this.apiOk = true; this.loadStats(); },
      error: () =>   this.apiOk = false
    });
    const t = setTimeout(() => {
      const n = '2002' + Math.floor(Math.random() * 9000000 + 1000000);
      const s = Math.floor(Math.random() * 15 + 82);
      this.alertes.unshift({ id: Date.now().toString(), num: n, score: s, time: 'À l\'instant', lue: false });
      this.newAlert = true;
      this.cdr.detectChanges();
    }, 5000);
    this.timers.push(t);
  }

  ngOnDestroy(): void { this.timers.forEach(t => clearTimeout(t)); }

  ngAfterViewChecked(): void {
    try {
      if (this.scrollRef)
        this.scrollRef.nativeElement.scrollTop = this.scrollRef.nativeElement.scrollHeight;
    } catch {}
  }

  @HostListener('document:click')
  closeAll(e?: any): void { this.bellOpen = false; this.usrOpen = false; }

  logout(): void { localStorage.removeItem('currentUser'); this.router.navigate(['/login']); }

  loadStats(): void {
    this.svc.getSinistres(0, 1).subscribe({
      next: (d) => { this.totalSinistres = d.totalElements || 0; this.totalPages = d.totalPages || 1; }
    });
    this.sinistresEleves = 1902;
  }

  loadList(): void {
    this.svc.getSinistres(this.page, 20).subscribe({
      next: (d) => {
        this.totalSinistres = d.totalElements || 0;
        this.totalPages     = d.totalPages    || 1;
        this.sinistres = (d.sinistres || []).map((s: any) => ({
          numSinistre      : s.numSinistre,
          gouvernorat      : s.gouvernorat       || '—',
          natureSinistre   : s.natureSinistre    || '—',
          montantEvaluation: s.montantEvaluation || 0,
          libEtatSinistre  : s.libEtatSinistre   || '—',
          nombreBlesses    : s.nombreBlesses     || 0,
          score            : undefined,
          decision         : undefined,
          motifs           : []
        }));
      }
    });
  }

  goPage(d: number): void { this.page += d; this.loadList(); }

  doSearch(): void {
    if (this.searchQ.trim()) { this.numInput = this.searchQ; this.tab = 'analyse'; this.analyser(); }
  }

  analyser(): void {
    if (!this.numInput.trim()) return;
    this.loading = true; this.resultat = null; this.decisionPrise = null; this.lStep = 0;
    const t1 = setTimeout(() => { this.lStep = 1; this.cdr.detectChanges(); }, 800);
    const t2 = setTimeout(() => { this.lStep = 2; this.cdr.detectChanges(); }, 1600);
    this.timers.push(t1, t2);
    this.svc.getSinistreML(this.numInput).subscribe({
      next: (s) => this.sendML({
        NUM_SINISTRE:this.numInput,
        MONTANT_EVALUATION:s.montantEvaluation||0,DELAI_DECLARATION:5,
        DELAI_OUVERTURE:1,DELAI_CONTRAT_SINISTRE:5,
        NOMBRE_BLESSES:s.nombreBlesses||0,NOMBRE_DECES:s.nombreDeces||0,
        AGE_VEHICULE:3,DUREE_CONTRAT:365,RATIO_VALEUR_PUISSANCE:250,
        KLM_TOTAL:45,KLM_MAX:30,MONTANT_REMORQUAGE_TOTAL:0,
        JOURS_REMPLACEMENT_TOTAL:0,MOIS_SURVENANCE:3,JOUR_SEMAINE:6,
        cumul_reglement:s.cumulReglement||0,Total_SAP_Final:s.totalSapFinal||0,
        PUISSANCE:90,VALEUR_VENALE:18000,ACCIDENT_WEEKEND:0,DECLARATION_TARDIVE:0,
        FLAG_VICTIME:(s.nombreBlesses||0)>0?1:0,CONTRAT_RECENT_SINISTRE:0,
        MONTANT_EVALUATION_SUSPECT:(s.montantEvaluation||0)>10000?1:0,
        ZONE_SINISTRALITE_ELEVEE:0,DISTANCE_REMORQUAGE_SUSPECTE:0,
        GOUVERNORAT_ENC:2,NATURE_SINISTRE_ENC:1,TYPE_SINISTRE_ENC:0,
        LIB_ETAT_SINISTRE_ENC:1,SEGMENT_ENC:1,usage_ENC:0,CODE_TYPE_CONTRAT_ENC:1
      }),
      error: () => this.sendML({ NUM_SINISTRE: this.numInput, ...this.exData })
    });
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
    this.svc.predire(p).subscribe({
      next: (r) => {
        this.resultat = r; this.loading = false; this.nbAnalyses++;
        this.dernieres.unshift({ numSinistre: r.num_sinistre, score: r.score_risque });
        if (this.dernieres.length > 10) this.dernieres.pop();
        const idx = this.sinistres.findIndex(s => s.numSinistre === r.num_sinistre);
        if (idx >= 0) {
          this.sinistres[idx].score   = r.score_risque;
          this.sinistres[idx].suspect = r.est_suspect;
          this.sinistres[idx].motifs  = this.buildMotifs(r);
        }
        if (r.score_risque >= 75) {
          this.alertes.unshift({ id: Date.now().toString(), num: r.num_sinistre,
            score: Math.round(r.score_risque), time: 'À l\'instant', lue: false });
          this.newAlert = true;
        }
        this.msgs = []; this.cdr.detectChanges();
      },
      error: () => { this.loading = false; alert('Erreur FastAPI — vérifiez que le serveur Python tourne sur :8000'); }
    });
  }

  saveDecision(statut: 'CONFORME' | 'FRAUDE'): void {
    if (!this.resultat) return;
    this.decisionPrise = statut;
    const idx = this.sinistres.findIndex(s => s.numSinistre === this.resultat!.num_sinistre);
    if (idx >= 0) this.sinistres[idx].decision = statut;
    this.decisions.unshift({
      date: new Date(), agent: this.user.prenom + ' ' + this.user.nom,
      num: this.resultat.num_sinistre, statut, score: Math.round(this.resultat.score_risque)
    });
    this.cdr.detectChanges();
  }

  analyseRow(s: SinistreItem): void { this.numInput = s.numSinistre; this.tab = 'analyse'; this.analyser(); }
  clickRow(s: SinistreItem): void   { this.numInput = s.numSinistre; this.tab = 'analyse'; this.analyser(); }
  reanalyse(a: any): void           { this.numInput = a.numSinistre; this.analyser(); }
  openFromDash(a: any): void        { this.numInput = a.numSinistre; this.tab = 'analyse'; }

  markRead(): void { this.alertes.forEach(a => a.lue = true); this.newAlert = false; }

  openAlert(a: Alerte): void {
    a.lue = true; this.numInput = a.num; this.tab = 'analyse'; this.bellOpen = false; this.analyser();
  }

  sendMsg(e: any): void {
    if (e) e.preventDefault();
    if (!this.msgInp.trim() || !this.resultat || this.typing) return;
    const m: ChatMessage = { role:'user', content:this.msgInp.trim(), timestamp:new Date() };
    this.msgs.push(m);
    const txt = this.msgInp.trim(); this.msgInp = ''; this.typing = true;
    this.svc.chatSinistre(this.resultat.num_sinistre, txt, this.msgs.slice(-6),
      { ...this.exData, score_risque: this.resultat.score_risque }).subscribe({
      next : (r) => { this.msgs.push({ role:'assistant', content:r.reponse, timestamp:new Date() }); this.typing = false; },
      error: ()  => { this.msgs.push({ role:'assistant', content:'Erreur de connexion.', timestamp:new Date() }); this.typing = false; }
    });
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
    if (s >= 75) return '🚨 Fraude'; if (s >= 40) return '⏳ Investigation'; return '✅ Conforme';
  }

  oc(s: number): string {
    if (s >= 75) return 'oc-red'; if (s >= 40) return 'oc-yel'; return 'oc-ok';
  }

  nvCls(n: string): string {
    switch(n?.toUpperCase()){
      case'TRES ELEVE':return'nv-tres'; case'ELEVE':return'nv-eleve';
      case'MODERE':return'nv-mod'; default:return'nv-faib';
    }
  }

  nvIco(n: string): string {
    switch(n?.toUpperCase()){
      case'TRES ELEVE':return'🔴'; case'ELEVE':return'🟠';
      case'MODERE':return'🟡'; default:return'🟢';
    }
  }

  arcVal(s: number): string { const c = 2 * Math.PI * 50; return `${(s/100)*c} ${c}`; }

  fmt(t: string): string {
    return t?.replace(/\n/g,'<br>')
             .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
             .replace(/###\s*(.*?)(<br>|$)/g,'<strong style="color:#1a56db">$1</strong><br>') || '';
  }
}