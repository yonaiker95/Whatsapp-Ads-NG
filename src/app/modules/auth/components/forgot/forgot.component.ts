import { Component } from '@angular/core';
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
  selector: 'app-forgot',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule, OtpInputComponent],
  templateUrl: './forgot.component.html',
  styleUrls: ['./forgot.component.scss'],
})
export class ForgotComponent {
  forgotForm: FormGroup;
  resetForm: FormGroup;
  step: 'email' | 'code' | 'done' = 'email';
  loading = false;
  maskedPhone = '';
  hidePassword = true;
  hideConfirm = true;
  codeError = false;
  private resetToken = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
    this.resetForm = this.fb.group(
      {
        code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  passwordMatchValidator(form: FormGroup): { mismatch: boolean } | null {
    const password = form.get('password')?.value;
    const confirm = form.get('confirmPassword')?.value;
    return password === confirm ? null : { mismatch: true };
  }

  sendCode(): void {
    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }
    this.loading = true;
    this.authService.forgotSend(this.forgotForm.value.email).subscribe({
      next: (res) => {
        this.loading = false;
        this.resetToken = res?.data?.token || '';
        this.maskedPhone = res?.data?.maskedPhone || '';
        this.step = 'code';
      },
      error: (error) => {
        this.loading = false;
        const message = error?.error?.error || 'No se pudo enviar el código';
        this.snackBar.open(message, 'Cerrar', { duration: 5000 });
      },
    });
  }

  resetPassword(): void {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }
    this.loading = true;
    const { code, password } = this.resetForm.value;
    this.authService.forgotReset(this.resetToken, code, password).subscribe({
      next: () => {
        this.loading = false;
        this.step = 'done';
      },
      error: (error) => {
        this.loading = false;
        this.codeError = true;
        const message = error?.error?.error || 'No se pudo restablecer la contraseña';
        this.snackBar.open(message, 'Cerrar', { duration: 5000 });
      },
    });
  }

  onCodeChange(code: string): void {
    this.resetForm.patchValue({ code });
    this.codeError = false;
  }

  goBack(): void {
    this.step = 'email';
    this.resetToken = '';
    this.resetForm.reset();
  }
}
