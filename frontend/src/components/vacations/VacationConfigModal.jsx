import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, History, Save } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Modal "Gerir Férias" — versão simplificada.
 *
 * Só configura a Data de Admissão (permanente, obrigatória).
 * Continua a mostrar o breakdown legal por ano (informativo) e o
 * histórico de alterações.
 */
export default function VacationConfigModal({ open, onOpenChange, userTarget, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [user, setUser] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [audit, setAudit] = useState([]);

  const [admissaoDate, setAdmissaoDate] = useState('');

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
      } catch (err) {
        toast.error('Erro ao carregar dados de férias');
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, targetId]);

  const handleSave = async () => {
    if (!admissaoDate) {
      toast.error('Data de admissão é obrigatória');
      return;
    }
    setSaving(true);
    try {
      await axios.put(`${API}/admin/vacations/config/${targetId}`, {
        admissao_date: admissaoDate,
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
              <div>
                <Label className="text-gray-300">Data de Admissão *</Label>
                <Input
                  type="date"
                  value={admissaoDate}
                  onChange={(e) => setAdmissaoDate(e.target.value)}
                  className="bg-[#0f0f0f] border-gray-700 mt-1 max-w-xs"
                  data-testid="vacation-config-admissao"
                />
              </div>
            </section>

            {/* 2. Breakdown legal */}
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
              </section>
            )}
            {breakdown?.error === 'admissao_date_missing' && (
              <div className="bg-amber-900/20 border border-amber-800/40 rounded-lg p-3 text-amber-300 text-sm">
                Data de admissão ainda não configurada — introduza acima para ver o cálculo.
              </div>
            )}

            {/* 3. Histórico de alterações */}
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
                        {e.action}
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
