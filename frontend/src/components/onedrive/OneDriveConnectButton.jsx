import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Cloud, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const APP_ORIGIN = window.location.origin;

/**
 * Componente para ligar/desligar a conta OneDrive do utilizador atual.
 * Pode ser embedded no perfil ou usado standalone.
 * Props:
 *   - variant: 'inline' (default) | 'card'
 *   - onConnected: callback quando a ligação fica ok
 */
export default function OneDriveConnectButton({ variant = 'inline', onConnected }) {
  const [status, setStatus] = useState({ connected: false, loading: true });
  const [connecting, setConnecting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/onedrive/status`);
      setStatus({ ...data, loading: false });
    } catch (e) {
      setStatus({ connected: false, loading: false });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const onMessage = (ev) => {
      // ignorar mensagens sem prefixo
      if (!ev?.data?.type?.startsWith?.('onedrive-')) return;
      if (ev.data.type === 'onedrive-connected') {
        toast.success('OneDrive ligado com sucesso!');
        setConnecting(false);
        fetchStatus();
        onConnected?.();
      } else if (ev.data.type === 'onedrive-error') {
        toast.error(`Erro OneDrive: ${ev.data.error || 'consentimento negado'}`);
        setConnecting(false);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [fetchStatus, onConnected]);

  const handleConnect = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('Faz login primeiro');
      return;
    }
    setConnecting(true);
    const url = `${API}/onedrive/oauth/start?token=${encodeURIComponent(token)}`;
    const popup = window.open(url, 'onedrive_oauth', 'width=600,height=750,popup=yes');
    if (!popup) {
      toast.error('Permite popups deste site para ligar o OneDrive');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Desligar a conta OneDrive? Podes voltar a ligar depois.')) return;
    try {
      await axios.delete(`${API}/onedrive/disconnect`);
      toast.success('OneDrive desligado');
      fetchStatus();
    } catch (e) {
      toast.error('Erro ao desligar');
    }
  };

  if (status.loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> A verificar OneDrive…
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className="p-3 rounded-lg border border-gray-700 bg-[#0f0f0f] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Cloud className="w-6 h-6 text-blue-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">OneDrive</p>
            {status.connected ? (
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span className="truncate">Ligado: {status.email || '—'}</span>
              </p>
            ) : (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <XCircle className="w-3 h-3" /> Não ligado
              </p>
            )}
          </div>
        </div>
        {status.connected ? (
          <Button variant="outline" size="sm" onClick={handleDisconnect} className="border-red-500/40 text-red-300 hover:bg-red-500/10">
            Desligar
          </Button>
        ) : (
          <Button size="sm" onClick={handleConnect} disabled={connecting} className="bg-blue-600 hover:bg-blue-700" data-testid="onedrive-connect-btn">
            {connecting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> A ligar…</> : 'Ligar'}
          </Button>
        )}
      </div>
    );
  }

  // variant === 'inline'
  return status.connected ? (
    <div className="flex items-center gap-2 text-xs">
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
      <span className="text-emerald-300 truncate">{status.email}</span>
      <button onClick={handleDisconnect} className="text-red-400 hover:text-red-300 underline text-xs">
        desligar
      </button>
    </div>
  ) : (
    <Button size="sm" variant="outline" onClick={handleConnect} disabled={connecting} className="border-blue-500 text-blue-300 hover:bg-blue-500/10" data-testid="onedrive-connect-btn-inline">
      <Cloud className="w-3.5 h-3.5 mr-1" />
      {connecting ? 'A ligar…' : 'Ligar OneDrive'}
    </Button>
  );
}
