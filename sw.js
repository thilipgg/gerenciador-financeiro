// Service Worker mínimo para habilitar a instalação do PWA.
// Não interceptamos requisições: um `fetch` genérico aqui também captura as
// chamadas externas ao Supabase e pode convertê-las em ERR_FAILED.

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  return self.clients.claim();
});
