// Este é um Service Worker básico para permitir a instalação do PWA
const CACHE_NAME = 'financas-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Apenas repassa as requisições, cumprindo a exigência do Chrome
  e.respondWith(fetch(e.request));
});