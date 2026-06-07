import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private baseUrl = 'http://localhost:8082/api/auth';

  constructor(private http: HttpClient) { }

  getStats(): Observable<any> {
    return this.http.get(`${this.baseUrl}/stats`);
  }

  getUsers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/all`);
  }

  deleteUser(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/delete/${id}`);
  }

  addUser(user: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/add`, user);
  }

  // src/app/services/user.service.ts
createUser(user: any): Observable<any> {
  return this.http.post(`${this.baseUrl}/add`, user);
}
}