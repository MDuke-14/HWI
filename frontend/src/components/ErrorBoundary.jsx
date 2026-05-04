import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * ErrorBoundary — evita que qualquer exceção React (ex: toast com HTML gigante,
 * erro ao fazer parse de resposta) deixe o site com tela branca.
 * Mostra um ecrã amigável com acções: recarregar, limpar sessão e ir para login.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    try {
      localStorage.removeItem('token');
      // Desregistar service worker para apagar caches stale
      if (navigator.serviceWorker?.getRegistrations) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister());
        });
      }
      // Limpar todas as caches do browser PWA
      if (window.caches?.keys) {
        window.caches.keys().then((keys) => {
          keys.forEach((k) => window.caches.delete(k));
        });
      }
    } catch (_) { /* ignore */ }
    // Pequeno delay para garantir que storage foi escrito antes de recarregar
    setTimeout(() => {
      window.location.href = '/login';
    }, 200);
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#111] border border-rose-900/40 rounded-2xl p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-8 h-8 text-rose-400" />
            <h1 className="text-2xl font-semibold">Algo correu mal</h1>
          </div>
          <p className="text-gray-300 mb-6">
            A aplicação encontrou um erro inesperado. A tua sessão está segura — basta
            recarregar para continuar.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={this.handleReload}
              className="flex items-center justify-center gap-2 bg-white text-black font-semibold py-3 rounded-lg hover:bg-gray-100"
              data-testid="eb-reload"
            >
              <RefreshCw className="w-4 h-4" /> Recarregar página
            </button>
            <button
              onClick={this.handleReset}
              className="flex items-center justify-center gap-2 bg-[#222] text-white font-medium py-3 rounded-lg hover:bg-[#2a2a2a] border border-white/10"
              data-testid="eb-reset"
            >
              <Home className="w-4 h-4" /> Limpar sessão e ir para login
            </button>
          </div>
          {this.state.error?.message && (
            <details className="mt-4 text-xs text-gray-500">
              <summary className="cursor-pointer hover:text-gray-400">Detalhes técnicos</summary>
              <pre className="mt-2 p-2 bg-black/40 rounded overflow-auto max-h-40 whitespace-pre-wrap">
                {String(this.state.error.message).substring(0, 500)}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
