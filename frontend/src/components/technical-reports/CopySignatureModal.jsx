import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Search, ArrowLeft, FileText, Calendar } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Modal para copiar uma assinatura existente de uma FS para outra FS.
 * Fluxo:
 *   1) Utilizador escolhe FS alvo (com pesquisa por número/cliente)
 *   2) Utilizador escolhe qual intervenção da FS alvo
 *   3) Confirmação — endpoint copia assinatura e devolve toast
 */
export default function CopySignatureModal({ open, onOpenChange, signature, currentRelatorioId, onCopied }) {
  const [step, setStep] = useState(1); // 1 = escolher FS, 2 = escolher intervenção
  const [search, setSearch] = useState('');
  const [relatorios, setRelatorios] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedFS, setSelectedFS] = useState(null);
  const [intervencoes, setIntervencoes] = useState([]);
  const [loadingInter, setLoadingInter] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset quando abre
  useEffect(() => {
    if (open) {
      setStep(1);
      setSearch('');
      setSelectedFS(null);
      setIntervencoes([]);
      fetchRelatorios();
    }
  }, [open]);

  const fetchRelatorios = async () => {
    setLoadingList(true);
    try {
      const res = await axios.get(`${API}/relatorios-tecnicos`);
      const list = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      // Excluir a FS actual (não faz sentido copiar para a própria)
      setRelatorios(list.filter((r) => r.id !== currentRelatorioId));
    } catch (e) {
      toast.error('Erro ao carregar lista de FS');
    } finally {
      setLoadingList(false);
    }
  };

  const fetchIntervencoes = async (fsId) => {
    setLoadingInter(true);
    try {
      const res = await axios.get(`${API}/relatorios-tecnicos/${fsId}/intervencoes`);
      const list = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setIntervencoes(list);
    } catch (e) {
      toast.error('Erro ao carregar intervenções');
      setIntervencoes([]);
    } finally {
      setLoadingInter(false);
    }
  };

  const filteredFS = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return relatorios.slice(0, 100);
    return relatorios
      .filter((r) => {
        const num = String(r.numero_assistencia || r.numero_ot || '').toLowerCase();
        const cli = String(r.cliente_nome || '').toLowerCase();
        const eq = String(r.equipamento_marca || '').toLowerCase();
        return num.includes(q) || cli.includes(q) || eq.includes(q);
      })
      .slice(0, 100);
  }, [relatorios, search]);

  const handleSelectFS = async (fs) => {
    setSelectedFS(fs);
    setStep(2);
    await fetchIntervencoes(fs.id);
  };

  const handleConfirm = async (intervencao) => {
    if (!signature?.id || !selectedFS?.id) return;
    // Extrair data (YYYY-MM-DD) da intervenção
    const dataInter = (intervencao.data_intervencao || intervencao.data || '').toString().split('T')[0];
    if (!dataInter) {
      toast.error('Intervenção sem data válida');
      return;
    }
    setSubmitting(true);
    try {
      const res = await axios.post(
        `${API}/relatorios-tecnicos/assinaturas/${signature.id}/copy`,
        {
          target_relatorio_id: selectedFS.id,
          target_data_intervencao: dataInter,
        }
      );
      toast.success(`Assinatura copiada para FS_${res.data?.target_fs_numero || selectedFS.numero_assistencia}`);
      onOpenChange(false);
      if (onCopied) onCopied(res.data?.assinatura);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(detail || 'Erro ao copiar assinatura');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" data-testid="copy-signature-modal">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Copy className="w-5 h-5" />
            Copiar assinatura para outra FS
          </DialogTitle>
        </DialogHeader>

        {signature && (
          <div className="flex items-center gap-3 bg-gray-800/40 rounded-md p-3 border border-gray-700">
            {signature.assinatura_base64 && (
              <img
                src={`data:image/png;base64,${signature.assinatura_base64}`}
                alt="Assinatura origem"
                className="h-10 w-20 object-contain bg-white rounded"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium truncate">{signature.assinado_por || `${signature.primeiro_nome || ''} ${signature.ultimo_nome || ''}`.trim() || '—'}</p>
              <p className="text-gray-400 text-xs">Assinatura original a ser copiada</p>
            </div>
          </div>
        )}

        {/* Step 1: escolher FS */}
        {step === 1 && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3 min-h-0" data-testid="copy-sig-step1">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                type="text"
                placeholder="Pesquisar por FS, cliente ou equipamento..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-[#0f0f0f] border-gray-700 text-white pl-9"
                data-testid="copy-sig-search-input"
                autoFocus
              />
            </div>

            <div className="overflow-y-auto flex-1 space-y-1.5 pr-1">
              {loadingList ? (
                <p className="text-gray-400 text-sm text-center py-6">A carregar...</p>
              ) : filteredFS.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-6">Nenhuma FS encontrada</p>
              ) : (
                filteredFS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleSelectFS(r)}
                    className="w-full text-left bg-[#0f0f0f] hover:bg-[#161616] border border-gray-700 hover:border-blue-500 rounded-md p-2.5 transition-all"
                    data-testid={`copy-sig-fs-${r.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-medium">
                          FS_{r.numero_assistencia || r.numero_ot || '—'}
                          {r.cliente_nome && <span className="text-gray-400 font-normal"> — {r.cliente_nome}</span>}
                        </p>
                        {(r.equipamento_marca || r.equipamento_modelo) && (
                          <p className="text-gray-500 text-xs truncate">
                            {[r.equipamento_marca, r.equipamento_modelo].filter(Boolean).join(' / ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Step 2: escolher intervenção */}
        {step === 2 && selectedFS && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3 min-h-0" data-testid="copy-sig-step2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(1)}
                className="text-gray-400 hover:text-white"
                data-testid="copy-sig-back-btn"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Voltar
              </Button>
              <span className="text-white text-sm">
                FS_{selectedFS.numero_assistencia || selectedFS.numero_ot || '—'}
                {selectedFS.cliente_nome && <span className="text-gray-400"> — {selectedFS.cliente_nome}</span>}
              </span>
            </div>

            <p className="text-gray-400 text-sm">Escolhe a intervenção alvo:</p>

            <div className="overflow-y-auto flex-1 space-y-1.5 pr-1">
              {loadingInter ? (
                <p className="text-gray-400 text-sm text-center py-6">A carregar intervenções...</p>
              ) : intervencoes.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-6">Esta FS não tem intervenções</p>
              ) : (
                intervencoes.map((iv) => {
                  const dataStr = iv.data_intervencao ? new Date(iv.data_intervencao).toLocaleDateString('pt-PT') : '—';
                  const label = iv.descricao || iv.observacoes || iv.tipo || 'Intervenção';
                  return (
                    <button
                      key={iv.id}
                      onClick={() => handleConfirm(iv)}
                      disabled={submitting}
                      className="w-full text-left bg-[#0f0f0f] hover:bg-[#161616] border border-gray-700 hover:border-green-500 rounded-md p-2.5 transition-all disabled:opacity-50"
                      data-testid={`copy-sig-interv-${iv.id}`}
                    >
                      <div className="flex items-start gap-2">
                        <Calendar className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-sm font-medium">{dataStr}</p>
                          <p className="text-gray-400 text-xs truncate">{label}</p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-3 border-t border-gray-700">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="border-gray-600 text-gray-300"
            data-testid="copy-sig-cancel-btn"
          >
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
