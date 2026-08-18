import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, History, Save, X, FileText, AlertCircle } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Modal "Gerir Férias" (novo motor legal — Código do Trabalho arts. 237.º–246.º).
 *
 * Secções:
 *  1. Data de Admissão (permanente, obrigatória, guardada 1 vez e nunca vazia)
 *  2. Dias gozados anteriormente por ano (histórico pré-sistema — opcional)
 *  3. Subsídio de férias (valor informativo, opcional)
 *  4. Breakdown completo por ano (vencidos / transitados / gozados / marcados / disponíveis + períodos)
 *  5. Histórico de alterações (audit)
 *
 * Requer motivo em qualquer alteração após a config existir.
 */
export default function VacationConfigModal({ open, onOpenChange, userTarget, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [user, setUser] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [audit, setAudit] = useState([]);

  const [admissaoDate, setAdmissaoDate] = useState('');
  const [subsidio, setSubsidio] = useState('');
  const [motivo, setMotivo] = useState('');
  const [dgaRows, setDgaRows] = useState([]); // [{year, days}]

  const targetId = userTarget?.user_id || userTarget?.id;

  useEffect(() => {
    if (!open || !targetId) return;
    (async () => {
      setLoading(true);
      try {
        const [cfgR, bkR, auR] = await Promise.all([
          axios.get(`${API}/admin/vacations/config/${targetId}`),
          axios.get(`${API}/admin/vacations/breakdown/${targetId}`).catch(() => ({ data: null })),
          axios.get(`${API}/admin/vacations/audit/${targetId}`).catch(() => ({ data: { entries: [] } })),
        ]);
        setConfig(cfgR.data.config);
        setUser(cfgR.data.user);
        setBreakdown(bkR.data);
        setAudit(auR.data?.entries || []);
        setAdmissaoDate(cfgR.data.config?.admissao_date || '');
        setSubsidio(
          cfgR.data.config?.subsidio_ferias_valor != null
            ? String(cfgR.data.config.subsidio_ferias_valor)
            : ''
        );
        const dga = cfgR.data.config?.dias_gozados_anteriores || {};
        const rows = Object.entries(dga)
          .map(([y, d]) => ({ year: Number(y), days: Number(d || 0) }))
          .sort((a, b) => a.year - b.year);
        setDgaRows(rows);
        setMotivo('');
      } catch (err) {
        toast.error('Erro ao carregar dados de férias');
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, targetId]);

  const addDgaRow = () => {
    const next = new Date().getFullYear() - 1;
    setDgaRows((prev) => [...prev, { year: next, days: 0 }]);
  };
  const updateDgaRow = (idx, field, value) => {
    setDgaRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: field === 'year' || field === 'days' ? Number(value || 0) : value } : r)));
  };
  const removeDgaRow = (idx) => setDgaRows((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!admissaoDate) {
      toast.error('Data de admissão é obrigatória');
      return;
    }
    const wasSet = !!config?.admissao_date;
    if (wasSet && !motivo.trim()) {
      toast.error('Indique um motivo para a alteração');
      return;
    }
    const dgaPayload = {};
    for (const r of dgaRows) {
      if (!r.year || Number.isNaN(r.year)) continue;
      dgaPayload[String(r.year)] = Number(r.days || 0);
    }
    setSaving(true);
    try {
      await axios.put(`${API}/admin/vacations/config/${targetId}`, {
        admissao_date: admissaoDate,
        dias_gozados_anteriores: dgaPayload,
        subsidio_ferias_valor: subsidio.trim() === '' ? null : Number(subsidio),
        motivo: motivo.trim(),
      });
      toast.success('Configuração de férias guardada.');
      onSaved && onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao guardar configuração');
    } finally {
      setSaving(false);
    }
  };

  const admissaoWasSet = !!config?.admissao_date;
  const years = breakdown?.year_breakdown || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0f0f0f] border-gray-700 text-white max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Calendar className="w-5 h-5 text-blue-400" />
            Gerir Férias — {user?.full_name || user?.username || '…'}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="text-center py-8 text-gray-400">A carregar…</div>
        ) : (
          <div className="space-y-6 mt-4">
            {/* 1. Dados base */}
            <section className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-blue-300 uppercase tracking-wide">Dados base</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-300">
                    Data de Admissão *
                    {admissaoWasSet && (
                      <span className="ml-2 text-[10px] text-amber-400">
                        (guardada — requer motivo para alterar)
                      </span>
                    )}
                  </Label>
                  <Input
                    type="date"
                    value={admissaoDate}
                    onChange={(e) => setAdmissaoDate(e.target.value)}
                    className="bg-[#0f0f0f] border-gray-700 mt-1"
                    data-testid="vacation-config-admissao"
                  />
                </div>
                <div>
                  <Label className="text-gray-300">Subsídio de férias (€)  <span className="text-gray-500 text-xs">(opcional, informativo)</span></Label>
                  <Input
                    type="number" step="0.01"
                    value={subsidio}
                    onChange={(e) => setSubsidio(e.target.value)}
                    placeholder="Ex: 950.00"
                    className="bg-[#0f0f0f] border-gray-700 mt-1"
                    data-testid="vacation-config-subsidio"
                  />
                </div>
              </div>
            </section>

            {/* 2. Dias gozados anteriormente */}
            <section className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-blue-300 uppercase tracking-wide">
                  Dias gozados anteriormente <span className="text-gray-500 text-xs normal-case">(histórico pré-sistema)</span>
                </h3>
                <Button size="sm" onClick={addDgaRow} className="bg-blue-600 hover:bg-blue-700 text-xs" data-testid="add-dga-row">
                  + Adicionar ano
                </Button>
              </div>
              {dgaRows.length === 0 ? (
                <p className="text-gray-500 text-xs">Nenhum registo. Adicione um ano para importar dias que já foram gozados antes do sistema.</p>
              ) : (
                <div className="space-y-2">
                  {dgaRows.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        type="number" value={r.year}
                        onChange={(e) => updateDgaRow(idx, 'year', e.target.value)}
                        className="bg-[#0f0f0f] border-gray-700 w-28"
                        placeholder="Ano"
                        data-testid={`dga-year-${idx}`}
                      />
                      <Input
                        type="number" value={r.days}
                        onChange={(e) => updateDgaRow(idx, 'days', e.target.value)}
                        className="bg-[#0f0f0f] border-gray-700 w-28"
                        placeholder="Dias"
                        min="0"
                        data-testid={`dga-days-${idx}`}
                      />
                      <span className="text-gray-500 text-xs">dias úteis gozados nesse ano</span>
                      <Button size="sm" variant="ghost" onClick={() => removeDgaRow(idx)} className="ml-auto text-red-400" data-testid={`dga-remove-${idx}`}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 3. Motivo (só se já estava configurado) */}
            {admissaoWasSet && (
              <section className="bg-[#1a1a1a] border border-amber-800/40 rounded-lg p-4 space-y-2">
                <Label className="text-amber-300 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Motivo da alteração *
                </Label>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-full bg-[#0f0f0f] border border-gray-700 rounded-md p-2 min-h-[70px] text-sm"
                  placeholder="Ex: correção de admissão após revisão de contrato"
                  data-testid="vacation-config-motivo"
                />
              </section>
            )}

            {/* 4. Breakdown */}
            {breakdown?.year_breakdown && (
              <section className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-300 uppercase tracking-wide mb-3">
                  Saldo detalhado por ano
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs md:text-sm">
                    <thead>
                      <tr className="text-gray-400 text-left border-b border-gray-800">
                        <th className="py-2 px-2">Ano</th>
                        <th className="py-2 px-2 text-right">Vencidos</th>
                        <th className="py-2 px-2 text-right">Transitados</th>
                        <th className="py-2 px-2 text-right">Gozados</th>
                        <th className="py-2 px-2 text-right">Marcados</th>
                        <th className="py-2 px-2 text-right">Disponíveis</th>
                        <th className="py-2 px-2">Regra / Notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {years.map((y) => (
                        <tr key={y.year} className="border-b border-gray-800/50">
                          <td className="py-2 px-2 font-semibold">{y.year}</td>
                          <td className="py-2 px-2 text-right text-blue-400">{y.dias_vencidos}</td>
                          <td className="py-2 px-2 text-right text-cyan-400">{y.dias_transitados}</td>
                          <td className="py-2 px-2 text-right text-amber-400">{y.dias_gozados}</td>
                          <td className="py-2 px-2 text-right text-purple-400">{y.dias_marcados}</td>
                          <td className={`py-2 px-2 text-right font-bold ${y.dias_disponiveis < 0 ? 'text-red-400' : 'text-green-400'}`}>{y.dias_disponiveis}</td>
                          <td className="py-2 px-2 text-gray-500 max-w-xs">{y.notas}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {years.some((y) => (y.periodos || []).length > 0) && (
                  <div className="mt-3 text-xs text-gray-400">
                    <div className="font-semibold mb-1 text-gray-300">Períodos de férias:</div>
                    {years.map((y) => (
                      (y.periodos || []).length > 0 && (
                        <div key={`p-${y.year}`}>
                          <span className="text-gray-500">{y.year}: </span>
                          {y.periodos.map((p, i) => (
                            <span key={i} className="inline-block bg-[#0f0f0f] border border-gray-700 rounded px-2 py-0.5 mr-1 mb-1">
                              {p.start} → {p.end} ({p.days}d)
                            </span>
                          ))}
                        </div>
                      )
                    ))}
                  </div>
                )}
              </section>
            )}
            {breakdown?.error === 'admissao_date_missing' && (
              <div className="bg-amber-900/20 border border-amber-800/40 rounded-lg p-3 text-amber-300 text-sm">
                Data de admissão ainda não configurada — introduza acima para ver o cálculo.
              </div>
            )}

            {/* 5. Histórico de alterações */}
            {audit.length > 0 && (
              <section className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-300 uppercase tracking-wide mb-2 flex items-center gap-2">
                  <History className="w-4 h-4" /> Histórico de alterações
                </h3>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {audit.map((e) => (
                    <div key={e.id} className="bg-[#0f0f0f] border border-gray-800 rounded p-2 text-xs">
                      <div className="flex items-center justify-between text-gray-400">
                        <span>{new Date(e.created_at).toLocaleString('pt-PT')}</span>
                        <span className="text-blue-300">{e.admin_username}</span>
                      </div>
                      <div className="text-gray-300 mt-1">
                        {e.action}: {e.motivo ? <em>&ldquo;{e.motivo}&rdquo;</em> : <em className="text-gray-500">(sem motivo)</em>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2 border-t border-gray-800 sticky bottom-0 bg-[#0f0f0f]">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 border-gray-600" disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} className="flex-1 bg-blue-500 hover:bg-blue-600" disabled={saving} data-testid="vacation-config-save">
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'A guardar…' : 'Guardar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
