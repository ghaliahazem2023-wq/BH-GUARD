import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PredictionResponse {
  num_sinistre   : string;
  score_risque   : number;
  est_suspect    : boolean;
  niveau_risque  : string;
  flags_detectes : string[];
  explication_ia : string;
  recommandation : string;
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
  private readonly SPRING_URL = 'http://localhost:8081';
  private headers = new HttpHeaders({ 'Content-Type': 'application/json' });

  constructor(private http: HttpClient) {}

  predire(donneesSinistre: any): Observable<PredictionResponse> {
    return this.http.post<PredictionResponse>(
      `${this.API_URL}/predict`, donneesSinistre, { headers: this.headers }
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
      `${this.API_URL}/chat-sinistre`, payload, { headers: this.headers }
    );
  }

  healthCheck(): Observable<any> {
    return this.http.get(`${this.API_URL}/health`);
  }

  getSinistreML(numSinistre: string): Observable<any> {
    return this.http.get(`${this.SPRING_URL}/api/sinistres/${numSinistre}`);
  }

  getSinistres(page: number = 0, size: number = 20): Observable<any> {
    return this.http.get(`${this.SPRING_URL}/api/sinistres?page=${page}&size=${size}`);
  }
}