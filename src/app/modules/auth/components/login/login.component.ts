import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../../../core/services/auth.service';
import { OtpInputComponent } from '../../../../shared/components/otp-input/otp-input.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule, OtpInputComponent],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  codeForm: FormGroup;
  loading = false;
  hidePassword = true;
  twoFactorStep = false;
  maskedPhone = '';
  codeError = false;
  private twoFactorToken = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
    this.codeForm = this.fb.group({
      code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    });
  }

  ngOnInit(): void {
    if (this.authService.getAuthState().isAuthenticated) {
      this.navigateAfterAuth();
    }
  }

  private navigateAfterAuth(): void {
    const user = this.authService.getAuthState().user;
    this.router.navigate([user?.onboardingCompleted ? '/app/dashboard' : '/onboarding']);
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.authService.login(this.loginForm.value).subscribe({
      next: (result) => {
        this.loading = false;
        if (result.requiresTwoFactor) {
          this.twoFactorStep = true;
          this.twoFactorToken = result.token || '';
          this.maskedPhone = result.maskedPhone || '';
          this.snackBar.open('Ingresa el código que te enviamos por WhatsApp.', 'Cerrar', { duration: 4000 });
          return;
        }
        this.navigateAfterAuth();
      },
      error: (error) => {
        this.loading = false;
        const message = error?.status === 401
          ? 'Usuario y/o contraseña incorrectos'
          : error?.error?.error || 'Error al iniciar sesión';
        this.snackBar.open(message, 'Cerrar', { duration: 5000 });
      },
    });
  }

  onVerifyCode(): void {
    if (this.codeForm.invalid) {
      this.codeForm.markAllAsTouched();
      return;
    }
    this.loading = true;
    this.authService.verifyTwoFactor(this.twoFactorToken, this.codeForm.value.code).subscribe({
      next: () => {
        this.loading = false;
        this.navigateAfterAuth();
      },
      error: (error) => {
        this.loading = false;
        this.codeError = true;
        const message = error?.error?.error || 'Código inválido';
        this.snackBar.open(message, 'Cerrar', { duration: 5000 });
      },
    });
  }

  onCodeChange(code: string): void {
    this.codeForm.patchValue({ code });
    this.codeError = false;
  }

  backToLogin(): void {
    this.twoFactorStep = false;
    this.twoFactorToken = '';
    this.maskedPhone = '';
    this.codeForm.reset();
  }

  resendCode(): void {
    this.loading = true;
    this.authService.resendTwoFactorCode(this.twoFactorToken).subscribe({
      next: () => {
        this.loading = false;
        this.snackBar.open('Te reenviamos el código por WhatsApp.', 'Cerrar', { duration: 4000 });
      },
      error: (error) => {
        this.loading = false;
        this.snackBar.open(error?.error?.error || 'No se pudo reenviar el código', 'Cerrar', { duration: 5000 });
      },
    });
  }

  togglePasswordVisibility(): void {
    this.hidePassword = !this.hidePassword;
  }
}
