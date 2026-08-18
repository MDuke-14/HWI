import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, Send, Calendar } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/** Mapa de Férias — vista consolidada do ano com export Excel + publicar. */
export default function MapaFeriasModal({ open, onOpenChange }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const r = await axios.get(`${API}/admin/vacations/mapa?year=${year}`);
        setData(r.data);
      } catch {
        toast.error('Erro ao carregar mapa');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, year]);

  const handleExcel = () => {
    const url = `${API}/admin/vacations/mapa/excel?year=${year}`;
    // Include auth via a POST-like fetch to preserve token — for now open in new tab (token is in localStorage but axios interceptor sends header)
    axios.get(url, { responseType: 'blob' }).then((res) => {
      const blob = new Blob([res.data]);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Mapa_Ferias_${year}.xlsx`;
      link.click();
    }).catch(() => toast.error('Erro ao descarregar Excel'));
  };

  const handlePublish = async () => {
    if (!window.confirm(`Publicar mapa de ${year} e notificar todos os colaboradores?`)) return;
    setPublishing(true);
    try {
      const r = await axios.post(`${API}/admin/vacations/mapa/publicar?year=${year}`);
      toast.success(`Mapa publicado. ${r.data.notified} colaboradores notificados.`);
      // Reload to reflect published_at
      const r2 = await axios.get(`${API}/admin/vacations/mapa?year=${year}`);
      setData(r2.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao publicar');
    } finally {
      setPublishing(false);
    }
  };

  const rows = data?.rows || [];
  const publicado = data?.publicado;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0f0f0f] border-gray-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Calendar className="w-5 h-5 text-blue-400" />
            Mapa de Férias — {year}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <label className="text-sm text-gray-400">Ano:</label>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="bg-[#1a1a1a] border border-gray-700 text-white rounded px-2 py-1 text-sm">
            {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={handleExcel} className="bg-emerald-600 hover:bg-emerald-700" data-testid="mapa-excel">
              <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
            </Button>
            <Button size="sm" onClick={handlePublish} disabled={publishing} className="bg-blue-600 hover:bg-blue-700" data-testid="mapa-publicar">
              <Send className="w-4 h-4 mr-1" /> {publishing ? 'A publicar…' : 'Publicar'}
            </Button>
          </div>
        </div>

        {publicado && (
          <div className="mt-2 text-xs text-gray-400">
            Publicado em {new Date(publicado.published_at).toLocaleString('pt-PT')} por {publicado.published_by_name}.
          </div>
        )}
        <p className="text-xs text-amber-300/80 mt-1">Prazo legal: mapa afixado até 15 de Abril.</p>

        {loading ? (
          <div className="text-center py-6 text-gray-400">A carregar…</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-800 text-left">
                  <th className="py-2 px-2">Colaborador</th>
                  <th className="py-2 px-2">Períodos</th>
                  <th className="py-2 px-2 text-right">Total (d. úteis)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id} className="border-b border-gray-800/50">
                    <td className="py-2 px-2 font-medium">{r.full_name}</td>
                    <td className="py-2 px-2">
                      {r.periodos.length === 0 ? (
                        <span className="text-gray-500 italic text-xs">Sem férias marcadas</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.periodos.map((p, i) => (
                            <span key={i} className="bg-[#1a1a1a] border border-gray-700 rounded px-2 py-0.5 text-xs">
                              {p.start} → {p.end} ({p.days_uteis}d)
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-green-400">{r.total_dias}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
