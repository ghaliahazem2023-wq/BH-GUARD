import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PredictionResponse {
  num_sinistre     : string;
  score_risque     : number;
  est_suspect      : boolean;
  niveau_risque    : string;
  flags_detectes   : string[];
  explication_ia   : string;
  recommandation   : string;
  donnees_sinistre?: { [key: string]: any };
  score_formule?   : number;
  score_ml?        : number;
}

export interface ChatMessage {
  role     : 'user' | 'assistant';
  content  : string;
  timestamp?: Date;
}

export interface ChatResponse {
  reponse      : string;
  num_sinistre : string;
}

@Injectable({ providedIn: 'root' })
export class FraudService {

  private readonly API_URL    = 'http://localhost:8000';
  private readonly SPRING_URL = 'http://localhost:8082';

  private readonly jsonHeaders = new HttpHeaders({ 'Content-Type': 'application/json' });
  private readonly springOpts  = { withCredentials: true as const };
  private readonly springJson  = { headers: this.jsonHeaders, withCredentials: true as const };

  constructor(private http: HttpClient) {}

  predire(donneesSinistre: any): Observable<PredictionResponse> {
    return this.http.post<PredictionResponse>(
      `${this.API_URL}/predict`, donneesSinistre, { headers: this.jsonHeaders }
    );
  }

  chatSinistre(numSinistre: string, message: string, historique: ChatMessage[], donneesSinistre: any): Observable<ChatResponse> {
    const payload = {
      num_sinistre    : numSinistre,
      message         : message,
      historique      : historique.map(m => ({ role: m.role, content: m.content })),
      donnees_sinistre: donneesSinistre
    };
    return this.http.post<ChatResponse>(
      `${this.SPRING_URL}/api/sinistres/chat`, payload, this.springJson
    );
  }

  healthCheck(): Observable<any> {
    return this.http.get(`${this.API_URL}/health`);
  }

  getSinistreML(numSinistre: string): Observable<any> {
    return this.http.get(`${this.SPRING_URL}/api/sinistres/${numSinistre}`, this.springOpts);
  }

  getSinistres(page: number = 0, size: number = 20, niveau: string = '', gouvernorat: string = '', nature: string = ''): Observable<any> {
    let url = `${this.SPRING_URL}/api/sinistres?page=${page}&size=${size}`;
    if (niveau)      url += `&niveau=${encodeURIComponent(niveau)}`;
    if (gouvernorat) url += `&gouvernorat=${encodeURIComponent(gouvernorat)}`;
    if (nature)      url += `&nature=${encodeURIComponent(nature)}`;
    return this.http.get(url, this.springOpts);
  }

  getDashboard(username: string = '', annee: string = ''): Observable<any> {
    let url = username
      ? `${this.SPRING_URL}/api/agent/dashboard?username=${encodeURIComponent(username)}`
      : `${this.SPRING_URL}/api/agent/dashboard`;
    if (annee) url += (url.includes('?') ? '&' : '?') + `annee=${encodeURIComponent(annee)}`;
    return this.http.get(url, this.springOpts);
  }

  saveDecisionAgent(numSinistre: string, payload: any): Observable<any> {
    return this.http.post(
      `${this.SPRING_URL}/api/sinistres/${numSinistre}/decision`,
      payload, this.springJson
    );
  }

  getDecisionAgent(numSinistre: string): Observable<any> {
    return this.http.get(`${this.SPRING_URL}/api/sinistres/${numSinistre}/decision`, this.springOpts);
  }

  getHistoriqueAgent(username: string): Observable<any> {
    return this.http.get(`${this.SPRING_URL}/api/agent/historique?username=${encodeURIComponent(username)}`, this.springOpts);
  }

  analyserViaSprint(numSinistre: string, extraData: any = {}): Observable<PredictionResponse> {
    return this.http.post<PredictionResponse>(
      `${this.SPRING_URL}/api/sinistres/${numSinistre}/analyser`,
      extraData, this.springJson
    );
  }

  getNatures(): Observable<string[]> {
    return this.http.get<string[]>(`${this.SPRING_URL}/api/sinistres/natures`, this.springOpts);
  }

  getGouvernorats(): Observable<string[]> {
    return this.http.get<string[]>(`${this.SPRING_URL}/api/sinistres/gouvernorats`, this.springOpts);
  }
}