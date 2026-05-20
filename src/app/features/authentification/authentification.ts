import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
// FIX: Zedna FormsModule houni bech [(ngModel)] tekhdem
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService, LoginCredentials, User } from '../../services/auth.services';
import { Router } from '@angular/router';

@Component({
  selector: 'app-authentification',
  standalone: true,
  // FIX: Zedna FormsModule fil imports
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './authentification.html',
  styleUrls: ['./authentification.scss']
})
export class AuthentificationComponent implements OnInit {
  loginForm!: FormGroup;
  loginError = '';
  
  // Variables Recovery
  showForgotModal = false;
  forgotEmail = '';

  constructor(private fb: FormBuilder, private authService: AuthService, private router: Router) {}

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required]],
      role: ['ADMINISTRATEUR', [Validators.required]]
    });
  }

  onSubmit() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      this.loginError = 'Veuillez saisir tous les champs requis.';
      return;
    }

    this.authService.login(this.loginForm.value as LoginCredentials).subscribe({
      next: (user: User) => {
        console.log('User received:', user);
        this.authService.storeUser(user);
        const role = (user.role || '').toUpperCase();

        if (role === 'ADMINISTRATEUR') {
          this.router.navigate(['/dashboard-admin']);
        } else if (role === 'AGENT_ANTI_FRAUDE') {
          this.router.navigate(['/espace-agent']);
        } else {
          this.router.navigate(['/']);
        }
      },
      error: (err) => {
        console.log('Login error:', err);
        this.loginError = 'Identifiants ou fonction incorrects';
      }
    });
  }

  // --- Fonctions Recovery ---
  openForgotModal() {
    this.showForgotModal = true;
    this.forgotEmail = ''; // Reset email ki n-7ellou
  }

  closeForgotModal() {
    this.showForgotModal = false;
  }

 sendResetLink() {
    if (this.forgotEmail && this.forgotEmail.includes('@')) {
      // 🚀 Houni el faza: lezem n-kallmou el AuthService!
      this.authService.forgotPassword(this.forgotEmail).subscribe({
        next: (res) => {
          console.log('✅ DEBUG: El Backend jawweb!', res);
          alert('Un lien de réinitialisation a été envoyé à ' + this.forgotEmail);
          this.closeForgotModal();
        },
        error: (err) => {
          console.error('❌ DEBUG: El Backend ma fiyiqch biya!', err);
          alert('Erreur: Impossible de contacter le serveur.');
        }
      });
    } else {
      alert('Veuillez entrer une adresse email valide.');
    }
  }
}