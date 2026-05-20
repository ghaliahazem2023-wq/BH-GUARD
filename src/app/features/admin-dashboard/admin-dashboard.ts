import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { AuthService, User } from '../../services/auth.services';
import { NgxPaginationModule } from 'ngx-pagination'; 

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule, 
    HttpClientModule, 
    FormsModule, 
    NgxPaginationModule
  ],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.scss']
})
export class AdminDashboardComponent implements OnInit {
  users: User[] = [];
  historyData: any[] = []; 
  stats = { total: 0, admins: 0, agents: 0 };
  loggedInUser: any = { username: 'Connecté' };
  showModal = false;
  newUser = { username: '', password: '', role: 'AGENT_ANTI_FRAUDE' };

  p: number = 1;              
  userSearch: string = '';    

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.refreshData();
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (currentUser && currentUser.username) {
      this.loggedInUser = currentUser;
    }
  }

  refreshData(): void {
    this.loadUsers();
    this.loadHistory(); 
  }

  loadHistory(): void {
    this.authService.getLoginHistory().subscribe({
      next: (data) => {
        this.historyData = data;
      },
      error: (err) => console.error("Erreur history:", err)
    });
  }

  loadUsers(): void {
    this.authService.getUsers().subscribe({
      next: (data: User[]) => {
        this.users = data;
        this.calculateStats();
      },
      error: (err) => console.error("Erreur users:", err)
    });
  }

  calculateStats(): void {
    this.stats.total = this.users.length;
    this.stats.admins = this.users.filter(u => u.role === 'ADMINISTRATEUR').length;
    this.stats.agents = this.users.filter(u => u.role === 'AGENT_ANTI_FRAUDE').length;
  }

  get filteredUsers() {
    return this.users.filter(u => 
      u.username.toLowerCase().includes(this.userSearch.toLowerCase())
    );
  }

  openAddModal(): void {
    this.showModal = true;
    this.newUser = { username: '', password: '', role: 'AGENT_ANTI_FRAUDE' };
  }

  closeModal(): void {
    this.showModal = false;
  }

  saveUser(): void {
    if (this.newUser.username && this.newUser.password) {
      this.authService.createUser(this.newUser as any).subscribe({
        next: () => {
          this.closeModal();
          this.refreshData();
        },
        error: (err: any) => {
          alert('Erreur: ' + (err.error?.message || 'Serveur injoignable'));
        }
      });
    }
  }

  onDelete(id: number): void {
    if (confirm('Supprimer cet utilisateur ?')) {
      this.authService.deleteUser(id).subscribe({
        next: () => this.refreshData(),
        error: (err) => console.error("Erreur delete:", err)
      });
    }
  }
}