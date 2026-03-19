import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Shield, ChevronRight, Check, FileText, ArrowLeft } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_OPTIONS = [
  { value: 'Em Espera', color: 'bg-gray-600', border: 'border-gray-500' },
  { value: 'Cotação Pedida', color: 'bg-yellow-600', border: 'border-yellow-500' },
  { value: 'A Caminho', color: 'bg-blue-600', border: 'border-blue-500' },
  { value: 'Terminado', color: 'bg-green-600', border: 'border-green-500' },
  { value: 'Cancelado', color: 'bg-red-600', border: 'border-red-500' },
];

export default function PCStatusPage() {
  const { pcId } = useParams();
  const navigate = useNavigate();
  const [pc, setPc] = useState(null);
  const [fsInfo, setFsInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (!token || !savedUser) {
      setNeedsLogin(true);
      setLoading(false);
      return;
    }

    const userData = JSON.parse(savedUser);
    if (!userData.is_admin) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    setIsAdmin(true);
    fetchPC();
  }, [pcId]);

  const fetchPC = async () => {
    try {
      const res = await axios.get(`${API}/pedidos-cotacao/${pcId}`);
      setPc(res.data);

      if (res.data.relatorio_id) {
        const fsRes = await axios.get(`${API}/relatorios-tecnicos/${res.data.relatorio_id}`);
        setFsInfo(fsRes.data);
      }
    } catch {
      toast.error('Pedido de Cotação não encontrado');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeStatus = async (newStatus) => {
    if (newStatus === pc.status) return;
    setUpdating(true);
    try {
      await axios.put(`${API}/pedidos-cotacao/${pcId}`, {
        status: newStatus,
        observacoes: pc.observacoes || ''
      });
      setPc({ ...pc, status: newStatus });
      toast.success(`Estado alterado para "${newStatus}"`);
    } catch {
      toast.error('Erro ao alterar estado');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-gray-400">A carregar...</div>
      </div>
    );
  }

  if (needsLogin) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="bg-[#1a1a1a] border border-gray-700 rounded-xl p-8 max-w-sm w-full text-center">
          <Shield className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-white text-xl font-bold mb-2">Acesso Restrito</h1>
          <p className="text-gray-400 text-sm mb-6">
            Necessita de autenticação para gerir o estado desta proposta.
          </p>
          <Button
            onClick={() => {
              localStorage.setItem('redirect_after_login', window.location.pathname);
              navigate('/login');
            }}
            className="w-full bg-white text-black hover:bg-gray-200 font-medium"
            data-testid="pc-status-login-btn"
          >
            Iniciar Sessão
          </Button>
          <p className="text-gray-600 text-xs mt-6">
            Este acesso é exclusivo para uso interno da HWI Unipessoal LDA.
          </p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="bg-[#1a1a1a] border border-red-800 rounded-xl p-8 max-w-sm w-full text-center">
          <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-white text-xl font-bold mb-2">Sem Permissão</h1>
          <p className="text-gray-400 text-sm">
            Apenas administradores podem alterar o estado das propostas.
          </p>
        </div>
      </div>
    );
  }

  if (!pc) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="text-gray-400">Pedido de Cotação não encontrado.</div>
      </div>
    );
  }

  const currentStatus = STATUS_OPTIONS.find(s => s.value === pc.status) || STATUS_OPTIONS[0];

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-gray-700 rounded-xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-[#111] border-b border-gray-700 p-5">
          <div className="flex items-center gap-3 mb-1">
            <FileText className="w-5 h-5 text-yellow-400" />
            <h1 className="text-white text-lg font-bold">{pc.numero_pc}</h1>
          </div>
          {fsInfo && (
            <p className="text-gray-500 text-sm ml-8">
              FS #{fsInfo.numero_assistencia} — {fsInfo.cliente_nome}
            </p>
          )}
        </div>

        {/* Current Status */}
        <div className="p-5 border-b border-gray-800">
          <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Estado Atual</p>
          <span className={`inline-block px-3 py-1.5 rounded text-white text-sm font-medium ${currentStatus.color}`}>
            {pc.status}
          </span>
        </div>

        {/* Status Options */}
        <div className="p-5">
          <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">Alterar Estado</p>
          <div className="space-y-2">
            {STATUS_OPTIONS.map((opt) => {
              const isActive = opt.value === pc.status;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleChangeStatus(opt.value)}
                  disabled={updating || isActive}
                  data-testid={`pc-status-option-${opt.value.toLowerCase().replace(/\s/g, '-')}`}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                    isActive
                      ? `${opt.border} bg-white/5`
                      : 'border-gray-700 hover:border-gray-500 bg-[#0f0f0f]'
                  } ${updating ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${opt.color}`} />
                    <span className={`text-sm ${isActive ? 'text-white font-medium' : 'text-gray-300'}`}>
                      {opt.value}
                    </span>
                  </div>
                  {isActive && <Check className="w-4 h-4 text-green-400" />}
                  {!isActive && <ChevronRight className="w-4 h-4 text-gray-600" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#111] border-t border-gray-800 p-4">
          <button
            onClick={() => navigate('/technical-reports')}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao sistema
          </button>
          <p className="text-gray-600 text-xs mt-3 leading-relaxed">
            Este acesso é exclusivo para uso interno da HWI Unipessoal LDA, com o objetivo de gerir e controlar os estados das propostas. Não se destina a utilização por clientes.
          </p>
        </div>
      </div>
    </div>
  );
}
