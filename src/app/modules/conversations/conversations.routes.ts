import { Routes } from '@angular/router';
import { ConversationListComponent } from './components/conversation-list/conversation-list.component';
import { ChatWindowComponent } from './components/chat-window/chat-window.component';

export const conversationsRoutes: Routes = [
  { path: '', component: ConversationListComponent, data: { title: 'Conversaciones' } },
  { path: ':instanceId/:senderJid', component: ChatWindowComponent, data: { title: 'Chat' } },
];