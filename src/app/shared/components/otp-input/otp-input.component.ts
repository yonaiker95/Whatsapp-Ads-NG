import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-otp-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './otp-input.component.html',
  styleUrls: ['./otp-input.component.scss'],
})
export class OtpInputComponent {
  @Input() length = 6;
  @Input() groupEvery = 3;
  @Input() state: 'normal' | 'error' | 'success' = 'normal';
  @Input() disabled = false;

  private _code = '';

  @Input()
  set code(value: string) {
    this._code = String(value || '').replace(/\D/g, '').slice(0, this.length);
  }
  get code(): string {
    return this._code;
  }

  @Output() codeChange = new EventEmitter<string>();
  @Output() complete = new EventEmitter<string>();

  @ViewChild('realInput') realInput?: ElementRef<HTMLInputElement>;

  focused = false;
  activeIndex = 0;

  get cellIndexes(): number[] {
    return Array.from({ length: this.length }, (_, i) => i);
  }

  digitAt(i: number): string {
    return this._code[i] || '';
  }

  shouldSeparateAfter(i: number): boolean {
    return this.groupEvery > 0 && (i + 1) % this.groupEvery === 0 && i < this.length - 1;
  }

  onInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, this.length);
    const prev = this._code;
    this._code = digits;
    input.value = digits;
    this.codeChange.emit(digits);
    this.activeIndex = Math.min(input.selectionStart ?? digits.length, digits.length);
    if (digits.length === this.length && prev.length < this.length) {
      input.blur();
      this.complete.emit(digits);
    }
  }

  onKeydown(e: KeyboardEvent): void {
    const input = e.target as HTMLInputElement;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      requestAnimationFrame(() => {
        this.activeIndex = Math.min(input.selectionStart ?? input.value.length, this.length);
      });
    }
  }

  onFocus(): void {
    this.focused = true;
    const input = this.realInput?.nativeElement;
    if (input) {
      requestAnimationFrame(() => {
        this.activeIndex = Math.min(input.selectionStart ?? input.value.length, this.length);
      });
    }
  }

  onBlur(): void {
    this.focused = false;
  }

  focusAt(i: number): void {
    if (this.disabled) return;
    const input = this.realInput?.nativeElement;
    if (!input) return;
    input.focus();
    const pos = Math.min(i, this._code.length);
    input.setSelectionRange(pos, pos);
    this.activeIndex = pos;
  }
}
