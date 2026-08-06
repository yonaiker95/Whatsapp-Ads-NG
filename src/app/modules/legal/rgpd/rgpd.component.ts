import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-rgpd',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './rgpd.component.html',
  styleUrls: ['./rgpd.component.scss'],
})
export class RgpdComponent {
  lastUpdated = '15 de julio de 2026';
}
