import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/fetch/fetch-page').then((m) => m.FetchPage),
  },
  {
    path: 'edit/:videoId',
    loadComponent: () => import('./features/editor/editor-page').then((m) => m.EditorPage),
  },
  { path: '**', redirectTo: '' },
];
