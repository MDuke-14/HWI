import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Palmtree, CalendarDays, Send, Ban, RefreshCw, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const STATUS_COLORS = {
  pendente:   { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/40' },
  aprovada:   { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/40' },
  rejeitada:  { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/40' },
  cancelada:  { bg: 'bg-gray-500/10',   text: 'text-gray-400',   border: 'border-gray-500/40' },
};

function fmtDate(iso) {
  if (!iso) return '-';
  try {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  } catch {
    return iso;
  }
}

const Metric = ({ label, value, tone = 'default' }) => {
  const tones = {
    default: 'text-white',
    positive: 'text-green-400',
    warning: 'text-yellow-400',
    danger: 'text-red-400',
    muted: 'text-gray-400',
  };
  return (
    <div className="bg-[#0f0f0f] border border-gray-800 rounded-lg p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${tones[tone] || tones.default}`}>{value}</div>
    </div>
  );
};

export default function Vacations({ user }) {
  const [saldo, setSaldo] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(null);

  // Modal criar pedido
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ start_date: '', end_date: '', observacao: '' });
  const [calcDays, setCalcDays] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        axios.get(`${API}/vacations/saldo`),
        axios.get(`${API}/vacations/my-requests`),
      ]);
      setSaldo(s.data);
      setRequests(r.data || []);
      if (!selectedYear && s.data?.current_year) setSelectedYear(s.data.current_year);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar dados de férias');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, []);

  // Recalcular dias úteis quando o utilizador escolhe datas
  useEffect(() => {
    const run = async () => {
      if (!form.start_date || !form.end_date) { setCalcDays(null); return; }
      try {
        const { data } = await axios.post(`${API}/vacations/calculate-days`, {
          start_date: form.start_date, end_date: form.end_date,
        });
        setCalcDays(data.dias_uteis);
      } catch (e) {
        setCalcDays(null);
      }
    };
    run();
  }, [form.start_date, form.end_date]);

  const yearBalance = useMemo(() => {
    if (!saldo || !selectedYear) return null;
    return saldo.history?.find(h => h.year === selectedYear) || null;
  }, [saldo, selectedYear]);

  const yearRequests = useMemo(() => {
    if (!selectedYear) return [];
    return requests.filter(r => {
      const y = r.year || parseInt((r.start_date || '').slice(0, 4), 10);
      return y === selectedYear;
    });
  }, [requests, selectedYear]);

  const handleSubmit = async () => {
    if (!form.start_date || !form.end_date) {
      toast.error('Preencha as datas'); return;
    }
    if (form.end_date < form.start_date) {
      toast.error('Data final anterior à inicial'); return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/vacations/requests`, form);
      toast.success('Pedido submetido — a aguardar aprovação');
      setShowCreate(false);
      setForm({ start_date: '', end_date: '', observacao: '' });
      setCalcDays(null);
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao criar pedido');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Cancelar este pedido?')) return;
    try {
      await axios.post(`${API}/vacations/requests/${id}/cancel`);
      toast.success('Pedido cancelado');
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao cancelar');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400" data-testid="vacations-loading">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> A carregar...
      </div>
    );
  }

  const yearsAvailable = saldo?.history?.map(h => h.year) || [];

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6" data-testid="vacations-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <Palmtree className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Férias</h1>
            <p className="text-xs text-gray-500">
              {saldo?.company_start_date
                ? `Data de entrada: ${fmtDate(saldo.company_start_date)}`
                : 'Sem data de entrada configurada — contacte o admin'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(selectedYear || '')}
            onValueChange={(v) => setSelectedYear(parseInt(v, 10))}
          >
            <SelectTrigger className="w-[110px] bg-[#0f0f0f] border-gray-800 text-white" data-testid="vacations-year-select">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent className="bg-[#0f0f0f] border-gray-800">
              {yearsAvailable.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => setShowCreate(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            data-testid="vacations-new-request-btn"
          >
            <Send className="w-4 h-4 mr-1.5" /> Novo Pedido
          </Button>
        </div>
      </div>

      {/* Saldo cards */}
      {yearBalance ? (
        <Card className="bg-[#141414] border-gray-800 p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Saldo {selectedYear}
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3" data-testid="vacations-saldo-grid">
            <Metric label="Totais" value={yearBalance.dias_totais} />
            <Metric label="Transitados" value={yearBalance.dias_transitados} tone="muted" />
            <Metric label="Gozados" value={yearBalance.dias_gozados} tone="warning" />
            <Metric label="Pendentes" value={yearBalance.dias_pendentes} tone="warning" />
            <Metric label="Disponíveis" value={yearBalance.dias_disponiveis} tone="positive" />
            <Metric label="Cancelados" value={yearBalance.dias_cancelados} tone="muted" />
          </div>
        </Card>
      ) : (
        <Card className="bg-[#141414] border-gray-800 p-4 text-gray-400 text-sm">
          Sem saldo calculado para {selectedYear}.
        </Card>
      )}

      {/* Lista de pedidos do ano */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Pedidos {selectedYear} ({yearRequests.length})
          </h2>
        </div>
        {yearRequests.length === 0 ? (
          <Card className="bg-[#141414] border-gray-800 p-8 text-center text-gray-500 text-sm">
            <CalendarDays className="w-10 h-10 mx-auto text-gray-700 mb-2" />
            Sem pedidos em {selectedYear}
          </Card>
        ) : (
          <div className="space-y-2" data-testid="vacations-requests-list">
            {yearRequests.map(r => {
              const s = STATUS_COLORS[r.status] || STATUS_COLORS.pendente;
              return (
                <Card
                  key={r.id}
                  className={`bg-[#141414] ${s.border} border p-4 flex items-start justify-between gap-3`}
                  data-testid={`vacation-request-${r.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium">
                        {fmtDate(r.start_date)} → {fmtDate(r.end_date)}
                      </span>
                      <span className="text-xs text-gray-500">·</span>
                      <span className="text-sm text-gray-300">{r.dias_uteis} dias úteis</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold ${s.bg} ${s.text}`}>
                        {r.status}
                      </span>
                      {r.source === 'historic' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold bg-blue-500/10 text-blue-400">
                          Histórico
                        </span>
                      )}
                    </div>
                    {r.observacao && (
                      <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{r.observacao}</p>
                    )}
                    {r.decision_reason && (
                      <p className="text-xs text-gray-400 mt-1 italic">
                        Decisão: {r.decision_reason}
                      </p>
                    )}
                    {r.decided_at && (
                      <p className="text-[10px] text-gray-600 mt-1">
                        {r.status === 'aprovada' ? 'Aprovado' : r.status === 'rejeitada' ? 'Rejeitado' : 'Decidido'} por{' '}
                        {r.decided_by_name || 'admin'} · {fmtDate(r.decided_at)}
                      </p>
                    )}
                  </div>
                  {(r.status === 'pendente' || r.status === 'aprovada') && r.source !== 'historic' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => handleCancel(r.id)}
                      data-testid={`cancel-request-${r.id}`}
                    >
                      <Ban className="w-4 h-4 mr-1" /> Cancelar
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Info regra */}
      <div className="text-xs text-gray-500 flex items-start gap-2 pt-2">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>
          O cálculo segue o art. 239.º do Código do Trabalho: no ano de admissão, 2 dias
          úteis por cada mês completo de contrato (máx. 20); nos anos seguintes, 22 dias
          úteis. Sábados, domingos e feriados nacionais nunca contam.
        </span>
      </div>

      {/* Modal novo pedido */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-[#141414] border-gray-800 text-white" data-testid="vacations-create-modal">
          <DialogHeader>
            <DialogTitle>Novo pedido de férias</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="vac-start" className="text-xs text-gray-400">Data inicial</Label>
                <Input
                  id="vac-start"
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm({ ...form, start_date: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-800 text-white"
                  data-testid="vacations-start-input"
                />
              </div>
              <div>
                <Label htmlFor="vac-end" className="text-xs text-gray-400">Data final</Label>
                <Input
                  id="vac-end"
                  type="date"
                  value={form.end_date}
                  onChange={e => setForm({ ...form, end_date: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-800 text-white"
                  data-testid="vacations-end-input"
                />
              </div>
            </div>
            {calcDays != null && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-center">
                <span className="text-xs text-emerald-400 uppercase tracking-wider">Dias úteis</span>
                <div className="text-3xl font-bold text-emerald-400 mt-1" data-testid="vacations-calc-days">
                  {calcDays}
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="vac-obs" className="text-xs text-gray-400">Observação (opcional)</Label>
              <Textarea
                id="vac-obs"
                value={form.observacao}
                onChange={e => setForm({ ...form, observacao: e.target.value })}
                rows={2}
                className="bg-[#0f0f0f] border-gray-800 text-white"
                data-testid="vacations-obs-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !calcDays}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="vacations-submit-btn"
            >
              {submitting ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
              Submeter pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
