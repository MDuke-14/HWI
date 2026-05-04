import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' })
      .then((registration) => {
        console.log('Service Worker registered:', registration);
        // Força verificação de actualização a cada carregamento da app.
        // Se houver nova versão no servidor, instala e activa imediatamente.
        registration.update().catch(() => {});
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        registration.addEventListener('updatefound', () => {
          const nw = registration.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              nw.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        // Verifica updates do SW a cada 60 segundos enquanto o user tiver a app aberta.
        // Isto garante que uma nova versão deployed é detectada em ≤ 1 min,
        // sem depender de o user ativar notificações manualmente.
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 1000);

        // Também verifica quando a app volta a ficar visível (alt+tab)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {});
          }
        });
      })
      .catch((error) => {
        console.log('Service Worker registration failed:', error);
      });

    // Quando o SW activa uma nova versão, recarregar UMA vez para apanhar código novo
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      console.log('[SW] Controller changed — reloading page to pick up new version');
      window.location.reload();
    });
  });
}
