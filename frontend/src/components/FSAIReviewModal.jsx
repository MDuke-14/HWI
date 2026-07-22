import React, { useState } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Sparkles, AlertTriangle, CheckCircle, Wand2, X, RefreshCw } from 'lucide-react';

/**
 * Modal "Rever FS com IA" — analisa a FS, mostra inconsistências e
 * permite aceitar/rejeitar reescritas dos Relatórios de Assistência.
 *
 * Props:
 * - open, onOpenChange
 * - relatorioId
 * - onApplied (callback quando se aplica uma reescrita)
 */
const FSAIReviewModal = ({ open, onOpenChange, relatorioId, onApplied }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [accepted, setAccepted] = useState({}); // { ra_id: 'accepted' | 'rejected' }
  const [busyId, setBusyId] = useState(null);

  const runReview = async () => {
    if (!relatorioId) return;
    setLoading(true);
    setData(null);
    setAccepted({});
    try {
      const r = await axios.post(`${API}/relatorios-tecnicos/${relatorioId}/ai-review`, {});
      setData(r.data);
      toast.success('Análise concluída');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Falha ao analisar com IA');
    } finally {
      setLoading(false);
    }
  };

  const applyRewrite = async (item) => {
    setBusyId(item.id);
    try {
      await axios.post(`${API}/relatorios-tecnicos/${relatorioId}/ai-apply-rewrite`, {
        relatorio_assistencia_id: item.id,
        texto_melhorado: item.texto_melhorado,
      });
      setAccepted((prev) => ({ ...prev, [item.id]: 'accepted' }));
      toast.success('Reescrita aplicada');
      onApplied?.(item.id);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Falha ao aplicar');
    } finally {
      setBusyId(null);
    }
  };

  React.useEffect(() => {
    if (open && relatorioId && !data && !loading) {
      runReview();
    }
    // eslint-disable-next-line
  }, [open, relatorioId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#0a0a0a] border border-violet-500/30 text-white max-w-4xl max-h-[90vh] overflow-y-auto"
        data-testid="fs-ai-review-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" />
            Rever FS com IA
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Análise por Claude Sonnet 4.5: validação de dados, inconsistências e melhoria
            do tom técnico dos Relatórios de Assistência. Aprovas cada reescrita antes de aplicar.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-12 text-center text-gray-400">
            <Sparkles className="w-8 h-8 mx-auto mb-2 text-violet-400 animate-pulse" />
            A IA está a analisar a FS… isto pode demorar 5–15 segundos.
          </div>
        )}

        {!loading && data && (
          <div className="space-y-4">
            {/* Score e resumo */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className={`text-3xl font-bold ${
                (data.score_qualidade || 0) >= 80 ? 'text-emerald-400' :
                (data.score_qualidade || 0) >= 50 ? 'text-amber-400' : 'text-rose-400'
              }`} data-testid="fs-ai-score">
                {data.score_qualidade ?? 0}
                <span className="text-sm text-gray-500 ml-1">/100</span>
              </div>
              <div className="flex-1 text-sm text-gray-300">
                {data.resumo}
              </div>
              <Button
                variant="outline" size="sm"
                onClick={runReview}
                disabled={loading}
                data-testid="fs-ai-rerun"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Re-analisar
              </Button>
            </div>

            {/* Inconsistências */}
            {(data.inconsistencias || []).length > 0 && (
              <section>
                <h3 className="text-xs uppercase tracking-wider text-amber-500 font-semibold mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Inconsistências ({data.inconsistencias.length})
                </h3>
                <div className="space-y-1">
                  {data.inconsistencias.map((inc, i) => (
                    <div key={`${inc.campo || 'c'}-${inc.problema || 'p'}-${i}`} className="bg-amber-950/20 border border-amber-900/40 rounded p-2 text-sm">
                      <span className="font-semibold text-amber-300">{inc.campo}: </span>
                      <span className="text-gray-300">{inc.problema}</span>
                      {inc.sugestao && <div className="text-xs text-amber-200/80 italic mt-0.5">→ {inc.sugestao}</div>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Dados em falta */}
            {(data.dados_em_falta || []).length > 0 && (
              <section>
                <h3 className="text-xs uppercase tracking-wider text-rose-500 font-semibold mb-2">
                  Dados em falta ({data.dados_em_falta.length})
                </h3>
                <ul className="text-sm text-gray-300 list-disc list-inside space-y-0.5">
                  {data.dados_em_falta.map((d, i) => <li key={`${d}-${i}`}>{d}</li>)}
                </ul>
              </section>
            )}

            {/* Reescritas dos relatórios */}
            {(data.relatorios_melhorados || []).length > 0 && (
              <section>
                <h3 className="text-xs uppercase tracking-wider text-violet-400 font-semibold mb-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Reescritas Sugeridas ({data.relatorios_melhorados.length})
                </h3>
                <div className="space-y-3">
                  {data.relatorios_melhorados.map((r, i) => {
                    const status = accepted[r.id];
                    const sameText = (r.texto_original || '').trim() === (r.texto_melhorado || '').trim();
                    return (
                      <div
                        key={r.id || i}
                        className={`border rounded-lg p-3 ${
                          status === 'accepted' ? 'border-emerald-500/40 bg-emerald-950/10' :
                          status === 'rejected' ? 'border-gray-700 bg-[#0f0f0f] opacity-60' :
                          'border-violet-500/30 bg-violet-950/10'
                        }`}
                        data-testid={`rewrite-${r.id}`}
                      >
                        {sameText ? (
                          <div className="text-sm text-emerald-300 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            Sem alterações necessárias
                          </div>
                        ) : (
                          <>
                            <div className="grid md:grid-cols-2 gap-3 mb-2">
                              <div>
                                <div className="text-[10px] uppercase text-gray-500 font-semibold mb-1">Original</div>
                                <div className="text-xs text-gray-300 whitespace-pre-wrap bg-[#0a0a0a] border border-gray-800 rounded p-2 max-h-48 overflow-y-auto">
                                  {r.texto_original || <span className="italic text-gray-600">(vazio)</span>}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] uppercase text-violet-400 font-semibold mb-1">Proposta IA</div>
                                <div className="text-xs text-violet-100 whitespace-pre-wrap bg-violet-950/30 border border-violet-800/40 rounded p-2 max-h-48 overflow-y-auto">
                                  {r.texto_melhorado}
                                </div>
                              </div>
                            </div>
                            {r.alteracoes_principais && (
                              <p className="text-[11px] italic text-gray-500 mb-2">
                                <span className="font-semibold">Alterações: </span>{r.alteracoes_principais}
                              </p>
                            )}
                            <div className="flex gap-2">
                              {status === 'accepted' ? (
                                <span className="text-xs text-emerald-400 flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" /> Aplicado
                                </span>
                              ) : status === 'rejected' ? (
                                <span className="text-xs text-gray-500">Rejeitado</span>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    disabled={busyId === r.id}
                                    onClick={() => applyRewrite(r)}
                                    className="bg-emerald-600 hover:bg-emerald-700"
                                    data-testid={`accept-${r.id}`}
                                  >
                                    <Wand2 className={`w-3 h-3 mr-1 ${busyId === r.id ? 'animate-spin' : ''}`} />
                                    {busyId === r.id ? 'A aplicar…' : 'Aceitar'}
                                  </Button>
                                  <Button
                                    size="sm" variant="outline"
                                    onClick={() => setAccepted((p) => ({ ...p, [r.id]: 'rejected' }))}
                                    data-testid={`reject-${r.id}`}
                                  >
                                    <X className="w-3 h-3 mr-1" /> Rejeitar
                                  </Button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FSAIReviewModal;
