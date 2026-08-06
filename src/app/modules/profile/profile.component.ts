import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatDividerModule, MatSnackBarModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent {
  authService = inject(AuthService);
  snackBar = inject(MatSnackBar);

  name = this.authService.currentUser()?.name || '';
  email = this.authService.currentUser()?.email || '';
  password = '';

  get user() {
    return this.authService.currentUser();
  }

  get roleLabel(): string {
    return this.user?.role === 'admin' ? 'Administrador' : 'Usuario';
  }

  save(): void {
    if (!this.name.trim()) {
      this.snackBar.open('El nombre no puede estar vacío', 'Cerrar', { duration: 3000 });
      return;
    }
    if (!this.email.trim() || !this.email.includes('@')) {
      this.snackBar.open('Ingresa un email válido', 'Cerrar', { duration: 3000 });
      return;
    }
    if (this.password && this.password.length < 6) {
      this.snackBar.open('La contraseña debe tener al menos 6 caracteres', 'Cerrar', { duration: 3000 });
      return;
    }
    this.snackBar.open('Perfil guardado correctamente', 'Cerrar', { duration: 3000 });
    this.password = '';
  }
}
