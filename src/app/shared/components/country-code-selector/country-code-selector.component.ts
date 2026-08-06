import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from './countries';

@Component({
  selector: 'app-country-code-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './country-code-selector.component.html',
  styleUrls: ['./country-code-selector.component.scss'],
})
export class CountryCodeSelectorComponent {
  readonly countries = COUNTRIES;

  @ViewChild('btn') btnRef!: ElementRef<HTMLElement>;
  @ViewChild('panel') panelRef!: ElementRef<HTMLElement>;

  open = false;
  filter = '';

  private _country: Country = DEFAULT_COUNTRY;

  @Input() set country(value: Country | null | undefined) {
    if (value) {
      this._country = value;
    }
  }
  get country(): Country {
    return this._country;
  }

  @Output() countryChange = new EventEmitter<Country>();

  get filteredCountries(): Country[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) return this.countries;
    return this.countries.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.iso2.toLowerCase().includes(q)
    );
  }

  flagEmoji(iso2: string): string {
    return String.fromCodePoint(...iso2.toUpperCase().split('').map((ch) => 127397 + ch.charCodeAt(0)));
  }

  toggle(): void {
    if (this.open) {
      this.close();
    } else {
      this.openPanel();
    }
  }

  select(c: Country): void {
    this._country = c;
    this.countryChange.emit(c);
    this.close();
  }

  onBackdropClick(): void {
    this.close();
  }

  private openPanel(): void {
    this.filter = '';
    this.open = true;
    setTimeout(() => {
      this.positionPanel();
      window.addEventListener('scroll', this.onViewportChange, true);
      window.addEventListener('resize', this.onViewportChange);
    });
  }

  private close(): void {
    this.open = false;
    window.removeEventListener('scroll', this.onViewportChange, true);
    window.removeEventListener('resize', this.onViewportChange);
  }

  private onViewportChange = (): void => {
    if (this.open) {
      this.positionPanel();
    }
  };

  private positionPanel(): void {
    const btn = this.btnRef?.nativeElement;
    const panel = this.panelRef?.nativeElement;
    if (!btn || !panel) return;
    const rect = btn.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.bottom + 6}px`;
    panel.style.width = `${Math.max(rect.width, 320)}px`;
  }
}
