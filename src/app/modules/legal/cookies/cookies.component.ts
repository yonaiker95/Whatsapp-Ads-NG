import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-cookies',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './cookies.component.html',
  styleUrls: ['./cookies.component.scss'],
})
export class CookiesComponent {
  lastUpdated = '15 de julio de 2026';
}
