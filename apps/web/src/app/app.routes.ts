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
  {
    path: 'result/:clipId',
    loadComponent: () => import('./features/result/result-page').then((m) => m.ResultPage),
  },
  { path: '**', redirectTo: '' },
];
