import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

export interface SocketMessage<T = unknown> {
  type: string;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class InstanceSocketService implements OnDestroy {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly messages$ = new Subject<SocketMessage>();
  private destroyed = false;

  messages = this.messages$.asObservable();

  constructor() {
    this.connect();
  }

  connect(): void {
    if (this.destroyed) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    this.socket = new WebSocket(`${proto}://${window.location.host}/api/ws`);

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as SocketMessage;
        this.messages$.next(message);
      } catch {
        /* ignorar tramas malformadas */
      }
    };

    this.socket.onclose = () => {
      if (this.destroyed) return;
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.messages$.complete();
  }
}
