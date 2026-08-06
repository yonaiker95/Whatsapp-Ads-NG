import { Component, OnDestroy } from '@angular/core';
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
import { CountryCodeSelectorComponent } from '../../../../shared/components/country-code-selector/country-code-selector.component';
import { DEFAULT_COUNTRY, type Country } from '../../../../shared/components/country-code-selector/countries';
import { OtpInputComponent } from '../../../../shared/components/otp-input/otp-input.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule, CountryCodeSelectorComponent, OtpInputComponent],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent implements OnDestroy {
  registerForm: FormGroup;
  hidePassword = true;
  hideConfirm = true;
  submitting = false;
  sendingCode = false;
  codeSent = false;
  verifyingCode = false;
  codeVerified = false;
  codeState: 'normal' | 'error' | 'success' = 'normal';
  maskedPhone = '';
  resendCooldown = 0;
  phoneCountry: Country = DEFAULT_COUNTRY;
  private lastDial = DEFAULT_COUNTRY.dial;
  private verifiedCode = '';
  private resendTimer?: ReturnType<typeof setInterval>;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private snackBar: MatSnackBar,
    private authService: AuthService
  ) {
    this.registerForm = this.fb.group(
      {
        name: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]],
        phone: ['', [Validators.required, Validators.pattern(/^\+?[\d\s\-()]{8,20}$/)]],
        code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  ngOnDestroy(): void {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
    }
  }

  passwordMatchValidator(form: FormGroup): { mismatch: boolean } | null {
    const password = form.get('password')?.value;
    const confirm = form.get('confirmPassword')?.value;
    return password === confirm ? null : { mismatch: true };
  }

  sendCode(): void {
    const phoneControl = this.registerForm.get('phone');
    if (!phoneControl || phoneControl.invalid) {
      phoneControl?.markAsTouched();
      return;
    }
    this.sendingCode = true;
    this.authService.sendPhoneCode(this.fullPhone(), 'register').subscribe({
      next: (res) => {
        this.sendingCode = false;
        this.codeSent = true;
        this.codeVerified = false;
        this.codeState = 'normal';
        this.verifiedCode = '';
        this.registerForm.patchValue({ code: '' });
        this.maskedPhone = res?.data?.maskedPhone || '';
        this.snackBar.open('Te enviamos un código de 6 dígitos por WhatsApp.', 'Cerrar', { duration: 4000 });
        this.startResendTimer();
      },
      error: (error) => {
        this.sendingCode = false;
        const message = error?.error?.error || 'No se pudo enviar el código';
        this.snackBar.open(message, 'Cerrar', { duration: 5000 });
      },
    });
  }

  onCountryChange(): void {
    const digits = String(this.registerForm.get('phone')?.value || '').replace(/[^\d]/g, '');
    if (digits.startsWith(this.lastDial)) {
      this.registerForm.patchValue({ phone: digits.slice(this.lastDial.length) });
    }
    this.lastDial = this.phoneCountry.dial;
  }

  onCodeChange(code: string): void {
    this.registerForm.patchValue({ code });
    if (this.codeVerified && code !== this.verifiedCode) {
      this.codeVerified = false;
      this.codeState = 'normal';
    } else if (!this.codeVerified) {
      this.codeState = 'normal';
    }
  }

  verifyCode(): void {
    const code = String(this.registerForm.get('code')?.value || '');
    if (!/^\d{6}$/.test(code)) return;
    this.verifyingCode = true;
    this.authService.verifyPhoneCode(this.fullPhone(), code, 'register').subscribe({
      next: () => {
        this.verifyingCode = false;
        this.codeVerified = true;
        this.codeState = 'success';
        this.verifiedCode = code;
        this.snackBar.open('Código verificado correctamente.', 'Cerrar', { duration: 3000 });
      },
      error: (error) => {
        this.verifyingCode = false;
        this.codeState = 'error';
        const message = error?.error?.error || 'El código no es válido';
        this.snackBar.open(message, 'Cerrar', { duration: 5000 });
      },
    });
  }

  private fullPhone(): string {
    const national = String(this.registerForm.get('phone')?.value || '').replace(/[^\d]/g, '');
    return '+' + this.phoneCountry.dial + national;
  }

  resendCode(): void {
    this.sendCode();
  }

  private startResendTimer(): void {
    this.resendCooldown = 60;
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
    }
    this.resendTimer = setInterval(() => {
      this.resendCooldown--;
      if (this.resendCooldown <= 0 && this.resendTimer) {
        clearInterval(this.resendTimer);
        this.resendTimer = undefined;
      }
    }, 1000);
  }

  onSubmit(): void {
    if (!this.codeSent) {
      this.snackBar.open('Primero solicita el código de verificación a tu WhatsApp.', 'Cerrar', { duration: 4000 });
      return;
    }
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.submitting = true;
    const { name, email, password, code } = this.registerForm.value;
    this.authService.register({ name, email, password, phone: this.fullPhone(), code }).subscribe({
      next: () => {
        this.submitting = false;
        this.snackBar.open('¡Cuenta creada! Completa el onboarding para empezar.', 'Cerrar', { duration: 4000 });
        this.router.navigate(['/onboarding']);
      },
      error: (error) => {
        this.submitting = false;
        const message = error?.error?.error || 'Error al crear la cuenta';
        this.snackBar.open(message, 'Cerrar', { duration: 5000 });
      },
    });
  }
}
