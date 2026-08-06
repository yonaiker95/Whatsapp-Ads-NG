import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ThemeService } from '../../core/services/theme.service';
import { AuthService } from '../../core/services/auth.service';
import { CountryCodeSelectorComponent } from '../../shared/components/country-code-selector/country-code-selector.component';
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from '../../shared/components/country-code-selector/countries';
import { OtpInputComponent } from '../../shared/components/otp-input/otp-input.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSlideToggleModule, MatDividerModule, MatListModule, MatProgressSpinnerModule, MatSnackBarModule, CountryCodeSelectorComponent, OtpInputComponent],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit {
  snackBar = inject(MatSnackBar);
  themeService = inject(ThemeService);
  authService = inject(AuthService);

  notifications = true;
  autoSync = true;
  twoFactor = false;
  saving = false;
  editingPhone = false;
  phoneInput = '';
  phoneCode = '';
  phoneCodeState: 'normal' | 'error' | 'success' = 'normal';
  sendingPhoneCode = false;
  phoneCodeSent = false;
  savingPhone = false;
  phoneCountry: Country = DEFAULT_COUNTRY;
  private lastDial = DEFAULT_COUNTRY.dial;

  ngOnInit(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.notifications = user.notificationsEnabled !== false;
      this.twoFactor = !!user.twoFactorEnabled;
      if (user.phone) {
        const detected = this.detectCountry(user.phone);
        this.phoneCountry = detected.country;
        this.lastDial = detected.country.dial;
        this.phoneInput = detected.national;
      }
    }
  }

  private detectCountry(phone: string): { country: Country; national: string } {
    const digits = String(phone || '').replace(/\D/g, '');
    let best: Country | null = null;
    let bestLen = 0;
    for (const c of COUNTRIES) {
      if (digits.startsWith(c.dial) && c.dial.length > bestLen) {
        best = c;
        bestLen = c.dial.length;
      }
    }
    if (best) return { country: best, national: digits.slice(bestLen) };
    return { country: DEFAULT_COUNTRY, national: phone || '' };
  }

  onCountryChange(): void {
    const digits = this.phoneInput.replace(/[^\d]/g, '');
    if (digits.startsWith(this.lastDial)) {
      this.phoneInput = digits.slice(this.lastDial.length);
    }
    this.lastDial = this.phoneCountry.dial;
  }

  private fullPhone(): string {
    const national = this.phoneInput.replace(/[^\d]/g, '');
    return '+' + this.phoneCountry.dial + national;
  }

  get phoneVerified(): boolean {
    return !!this.authService.currentUser()?.phoneVerified;
  }

  get maskedPhone(): string {
    const phone = this.authService.currentUser()?.phone;
    if (!phone) return '';
    if (phone.length <= 4) return '••••';
    return `+${phone.slice(0, 2)}•••••${phone.slice(-2)}`;
  }

  setTheme(dark: boolean): void {
    if (dark !== this.themeService.isDark()) {
      this.themeService.toggle();
    }
  }

  sendPhoneCode(): void {
    if (!/^[\d\s\-()]{8,20}$/.test(this.phoneInput.trim())) {
      this.snackBar.open('Ingresa un número de WhatsApp válido', 'Cerrar', { duration: 4000 });
      return;
    }
    this.sendingPhoneCode = true;
    this.authService.sendPhoneCode(this.fullPhone(), 'phone_update').subscribe({
      next: () => {
        this.sendingPhoneCode = false;
        this.phoneCodeSent = true;
        this.phoneCode = '';
        this.phoneCodeState = 'normal';
        this.snackBar.open('Te enviamos un código de 6 dígitos por WhatsApp.', 'Cerrar', { duration: 4000 });
      },
      error: (error) => {
        this.sendingPhoneCode = false;
        this.snackBar.open(error?.error?.error || 'No se pudo enviar el código', 'Cerrar', { duration: 5000 });
      },
    });
  }

  onPhoneCodeChange(code: string): void {
    this.phoneCode = code;
    if (this.phoneCodeState !== 'normal') this.phoneCodeState = 'normal';
  }

  verifyPhone(): void {
    if (!/^\d{6}$/.test(this.phoneCode)) {
      this.snackBar.open('Ingresa el código de 6 dígitos', 'Cerrar', { duration: 4000 });
      return;
    }
    this.savingPhone = true;
    this.authService.updatePhone(this.fullPhone(), this.phoneCode).subscribe({
      next: () => {
        this.savingPhone = false;
        this.phoneCodeSent = false;
        this.editingPhone = false;
        this.phoneCode = '';
        this.phoneCodeState = 'normal';
        this.snackBar.open('Número de WhatsApp verificado.', 'Cerrar', { duration: 4000 });
      },
      error: (error) => {
        this.savingPhone = false;
        this.phoneCodeState = 'error';
        this.snackBar.open(error?.error?.error || 'No se pudo verificar el número', 'Cerrar', { duration: 5000 });
      },
    });
  }

  save(): void {
    this.saving = true;
    this.authService.updateSettings({
      notificationsEnabled: this.notifications,
      twoFactorEnabled: this.twoFactor,
    }).subscribe({
      next: () => {
        this.saving = false;
        this.snackBar.open('Configuración guardada correctamente', 'Cerrar', { duration: 3000 });
      },
      error: (error) => {
        this.saving = false;
        const message = error?.error?.error || 'No se pudo guardar la configuración';
        this.snackBar.open(message, 'Cerrar', { duration: 5000 });
      },
    });
  }
}
