import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.services';
import { Router } from '@angular/router';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reset-password.html',
  styleUrls: ['./reset-password.scss']
})
export class ResetPasswordComponent {
  resetData = {
    username: '',
    fonction: 'ADMINISTRATEUR',
    newPassword: ''
  };

  constructor(private authService: AuthService, private router: Router) {}

  onReset() {
    if (!this.resetData.username || !this.resetData.newPassword) {
      alert("Veuillez remplir tous les champs.");
      return;
    }

    // N-kallmou el method elli fil AuthService
    this.authService.resetPassword(this.resetData).subscribe({
      next: (res) => {
        alert("✅ Mot de passe mis à jour avec succès !");
        this.router.navigate(['/login']); // Rajja3na lel login
      },
      error: (err) => {
        alert("❌ Erreur: Username ou Fonction incorrecte.");
      }
    });
  }
}