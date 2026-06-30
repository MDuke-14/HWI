import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Clock } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function PublicAuthorizationDecidePage() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const action = searchParams.get('action');  // 'approve' | 'reject'

  const [phase, setPhase] = useState('loading'); // loading | error | already | success
  const [info, setInfo] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState(null);
  const triggered = useRef(false);  // prevent double-execution (React StrictMode)

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;
    decideNow();
  }, [token, action]);

  const decideNow = async () => {
    if (!action || (action !== 'approve' && action !== 'reject')) {
      setErrorMessage('Acção inválida. O link deve incluir ?action=approve ou ?action=reject.');
      setPhase('error');
      return;
    }
    try {
      // 1) Obter info do pedido (para mostrar quem/o quê)
      let detail = null;
      try {
        const res = await axios.get(`${API}/public/authorizations/${token}`);
        detail = res.data;
        setInfo(detail);
      } catch (e) {
        const code = e.response?.status;
        if (code === 410) {
          setErrorMessage('Este link expirou. Os links de autorização são válidos durante 7 dias.');
        } else if (code === 404) {
          setErrorMessage('Pedido de autorização não encontrado. O link pode estar inválido.');
        } else {
          setErrorMessage('Erro ao obter informação do pedido.');
        }
        setPhase('error');
        return;
      }

      // 2) Aplicar a decisão (idempotente — se já estiver decidido devolve "already_decided")
      const decideRes = await axios.post(
        `${API}/public/authorizations/${token}/decide?action=${action}`
      );
      setResult(decideRes.data);
      if (decideRes.data.status === 'already_decided') {
        setPhase('already');
      } else {
        setPhase('success');
      }
    } catch (e) {
      const detail = e.response?.data?.detail || 'Não foi possível processar a decisão.';
      setErrorMessage(detail);
      setPhase('error');
    }
  };

  const formatDateTime = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  const renderHeader = () => {
    if (phase === 'loading') return null;
    let cls = '';
    let icon = null;
    let title = '';
    if (phase === 'success') {
      const ok = (result?.status === 'authorized' || result?.status === 'approved' || result?.status === 'success');
      cls = ok ? 'bg-emerald-600' : 'bg-rose-600';
      icon = ok ? <CheckCircle2 className="w-16 h-16 mx-auto" /> : <XCircle className="w-16 h-16 mx-auto" />;
      title = ok ? 'Autorização Concedida' : 'Pedido Rejeitado';
    } else if (phase === 'already') {
      cls = 'bg-amber-500';
      icon = <AlertTriangle className="w-16 h-16 mx-auto" />;
      title = 'Já Decidido Anteriormente';
    } else {
      cls = 'bg-rose-600';
      icon = <XCircle className="w-16 h-16 mx-auto" />;
      title = 'Não Foi Possível Processar';
    }
    return (
      <div className={`${cls} text-white p-8 text-center`}>
        {icon}
        <h1 className="text-2xl font-bold mt-3" data-testid="auth-decide-title">{title}</h1>
      </div>
    );
  };

  const renderRolePt = (k) => {
    const map = { junior: 'Técnico Junior', tecnico: 'Técnico', senior: 'Técnico Sénior' };
    return map[(k || '').toLowerCase()] || 'Técnico';
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl overflow-hidden" data-testid="auth-decide-card">
        {phase === 'loading' && (
          <div className="p-12 text-center text-gray-700">
            <Loader2 className="w-12 h-12 mx-auto animate-spin text-blue-600" />
            <p className="mt-4 text-lg">A processar a sua decisão…</p>
          </div>
        )}

        {phase !== 'loading' && renderHeader()}

        {(phase === 'success' || phase === 'already') && info && (
          <div className="p-6 space-y-3 text-gray-800">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <span className="text-gray-500">Utilizador</span>
              <span className="col-span-2 font-semibold">{info.user_name} <span className="text-gray-500 font-normal">({renderRolePt(info.tipo_colaborador)})</span></span>
              <span className="text-gray-500">Data</span>
              <span className="col-span-2 font-semibold">{info.date}</span>
              {info.day_type && (
                <>
                  <span className="text-gray-500">Tipo</span>
                  <span className="col-span-2 font-semibold">{info.day_type}</span>
                </>
              )}
            </div>

            {Array.isArray(info.periodos) && info.periodos.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2 text-gray-700 font-medium">
                  <Clock className="w-4 h-4" /> Registos de Ponto
                </div>
                <ul className="text-sm space-y-1 text-gray-700">
                  {info.periodos.map((p, i) => <li key={i} className="font-mono">{p}</li>)}
                </ul>
              </div>
            )}

            <div className="border-t pt-3 text-sm text-gray-600">
              <p>
                Decisão registada por <strong>{result?.decided_by_name || 'geral@hwi.pt (via email)'}</strong>
                {result?.decided_at && <> em <strong>{formatDateTime(result.decided_at)}</strong></>}
              </p>
              {phase === 'already' && (
                <p className="text-amber-700 mt-2">
                  Este pedido tinha já sido <strong>{result?.current_status === 'authorized' || result?.current_status === 'approved' ? 'aprovado' : 'rejeitado'}</strong> anteriormente. A acção foi ignorada.
                </p>
              )}
            </div>

            <p className="text-xs text-gray-400 text-center pt-3">
              Pode fechar esta janela em segurança.
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className="p-6 text-center text-gray-700 space-y-3">
            <p className="text-base">{errorMessage}</p>
            <p className="text-xs text-gray-400">Se necessário, contacte a administração ou aceda ao portal de administração.</p>
          </div>
        )}
      </div>
    </div>
  );
}
