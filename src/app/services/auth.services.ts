import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface LoginCredentials {
  username: string;
  password: string;
  role: string;
}

export interface User {
  id      : number;
  username: string;
  role?   : string;
  nom?    : string;
  prenom? : string;
  email?  : string;
  token?  : string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private authUrl = 'http://localhost:8081/api/auth';
  private loginUrl = `${this.authUrl}/login`;

  constructor(private http: HttpClient) {}

  login(credentials: LoginCredentials): Observable<User> {
    return this.http.post<User>(this.loginUrl, credentials);
  }

  
getAllUsers(): Observable<User[]> {
  return this.http.get<User[]>(`${this.authUrl}/all`);
}

  storeUser(user: User): void {
    localStorage.setItem('currentUser', JSON.stringify(user));
  }

  // 🟢 HEDHI T-KOUN DAKHIL EL CLASS AUTHSERVICE
getLoginHistory(): Observable<any[]> {
  return this.http.get<any[]>(`${this.authUrl}/history`);
}
// --- Zid hedhi dakhil el class AuthService ---
forgotPassword(email: string): Observable<any> {
  // Lezem el esm ykoun 'email' bech el Backend ya3rfou
  return this.http.post(`${this.authUrl}/forgot-password`, { email: email });
}

  getUser(): User | null {
    const userJson = localStorage.getItem('currentUser');
    return userJson ? (JSON.parse(userJson) as User) : null;
  }

  logout(): void {
    localStorage.removeItem('currentUser');
  }

  // Jib el users el koll
getUsers(): Observable<User[]> {
  return this.http.get<User[]>(`${this.authUrl}/all`);
}


// Zid user jdid
createUser(user: User): Observable<User> {
  return this.http.post<User>(`${this.authUrl}/add`, user);
}

// Fassa5 user
deleteUser(id: number): Observable<void> {
  return this.http.delete<void>(`${this.authUrl}/delete/${id}`);
}

resetPassword(data: any): Observable<any> {
  return this.http.post(`${this.authUrl}/reset-password`, data);
}

}
