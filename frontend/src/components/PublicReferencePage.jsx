import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, CheckCircle, AlertTriangle, Loader2, Send } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function PublicReferencePage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [fsData, setFsData] = useState(null);
  const [error, setError] = useState(null);
  const [referencia, setReferencia] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchData();
  }, [token]);

  const fetchData = async () => {
    try {
      const res = await axios.get(`${API}/referencia/${token}`);
      setFsData(res.data);
    } catch (err) {
      const status = err.response?.status;
      if (status === 410) {
        setError('used');
      } else if (status === 404) {
        setError('invalid');
      } else {
        setError('generic');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!referencia.trim()) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/referencia/${token}`, { referencia: referencia.trim() });
      setSubmitted(true);
    } catch (err) {
      const status = err.response?.status;
      if (status === 410) {
        setError('used');
      } else {
        setError('submit_error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-testid="ref-page-loading">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" data-testid="ref-page-success">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Referencia Submetida</h2>
          <p className="text-gray-500 mb-4">
            A referencia interna <strong className="text-gray-800">{referencia}</strong> foi associada com sucesso.
          </p>
          <p className="text-sm text-gray-400">Pode fechar esta pagina.</p>
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessages = {
      used: { title: 'Referencia Ja Submetida', msg: 'A referencia interna para esta Folha de Servico ja foi inserida.' },
      invalid: { title: 'Link Invalido', msg: 'Este link nao e valido ou ja expirou.' },
      generic: { title: 'Erro', msg: 'Ocorreu um erro ao carregar os dados. Tente novamente mais tarde.' },
      submit_error: { title: 'Erro ao Submeter', msg: 'Nao foi possivel submeter a referencia. Tente novamente.' },
    };
    const errInfo = errorMessages[error] || errorMessages.generic;

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" data-testid="ref-page-error">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{errInfo.title}</h2>
          <p className="text-gray-500">{errInfo.msg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" data-testid="ref-page-form">
      <div className="bg-white rounded-xl shadow-lg max-w-lg w-full overflow-hidden">
        <div className="bg-[#1e40af] text-white px-6 py-5">
          <h1 className="text-lg font-bold">HWI Unipessoal, Lda</h1>
          <p className="text-blue-200 text-sm mt-1">Referencia Interna do Cliente</p>
        </div>

        <div className="p-6">
          <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2" data-testid="ref-fs-info">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-gray-900">
                Folha de Servico #{fsData.numero_assistencia}
              </span>
            </div>
            <InfoRow label="Cliente" value={fsData.cliente_nome} />
            <InfoRow label="Local" value={fsData.local_intervencao} />
            <InfoRow label="Data" value={fsData.data_servico ? new Date(fsData.data_servico).toLocaleDateString('pt-PT') : '-'} />
            {fsData.equipamento && (
              <InfoRow
                label="Equipamento"
                value={[fsData.equipamento.marca, fsData.equipamento.modelo].filter(Boolean).join(' ') || '-'}
              />
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Referencia Interna *
              </label>
              <Input
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="N. encomenda, ordem de compra, referencia..."
                className="border-gray-300 text-gray-900"
                required
                autoFocus
                data-testid="ref-input"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Insira a vossa referencia interna para associar a esta folha de servico.
              </p>
            </div>
            <Button
              type="submit"
              disabled={submitting || !referencia.trim()}
              className="w-full bg-[#1e40af] hover:bg-[#1e3a8a] text-white py-2.5"
              data-testid="ref-submit-btn"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {submitting ? 'A submeter...' : 'Submeter Referencia'}
            </Button>
          </form>
        </div>

        <div className="px-6 py-3 bg-gray-50 border-t text-center">
          <p className="text-xs text-gray-400">Este link e de utilizacao unica e expira em 30 dias.</p>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right ml-4">{value || '-'}</span>
    </div>
  );
}
