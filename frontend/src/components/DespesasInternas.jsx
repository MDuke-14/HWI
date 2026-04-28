import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Receipt, Plus, Edit, Trash2, Calendar as CalIcon, Check, X, BarChart3, ArrowLeft, RefreshCcw } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function todayISO() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function fmtEur(v) {
  return `${Number(v || 0).toFixed(2)} €`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-PT');
}

const DespesasInternas = ({ user, onLogout }) => {
  const [despesas, setDespesas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [ocorrencias, setOcorrencias] = useState([]);
  const [balanco, setBalanco] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('calendario');

  // Calendar view
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // Form modal
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());

  // Pay modal
  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({ data_pagamento: todayISO(), valor_pago: '', notas: '' });

  // Balanço
  const [anoBalanco, setAnoBalanco] = useState(new Date().getFullYear());
  const [apenasPagas, setApenasPagas] = useState(false);

  // Categorias
  const [showCategorias, setShowCategorias] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState({ nome: '', cor: '#6366f1' });

  function emptyForm() {
    return {
      descricao: '', valor: '', categoria_id: '', data_inicial: todayISO(),
      tipo_pagamento: 'pontual', recorrencia: 'mensal',
      dia_mes: '', aviso_dias_antes: 3, aviso_email: 'geral@hwi.pt',
      data_fim: '',
    };
  }

  const loadDespesas = async () => {
    try {
      const r = await axios.get(`${API}/despesas-internas`);
      setDespesas(r.data || []);
    } catch { /* erros já são tratados pelo interceptor global */ }
  };

  const loadOcorrencias = async () => {
    setLoading(true);
    try {
      const inicio = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
      const fim = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0);
      const r = await axios.get(`${API}/despesas-internas/ocorrencias`, {
        params: { inicio: inicio.toISOString().split('T')[0], fim: fim.toISOString().split('T')[0] },
      });
      setOcorrencias(r.data || []);
    } finally {
      setLoading(false);
    }
  };

  const loadBalanco = async () => {
    try {
      const r = await axios.get(`${API}/despesas-internas/balanco/${anoBalanco}`, {
        params: { apenas_pagas: apenasPagas },
      });
      setBalanco(r.data);
    } catch { /* erros já são tratados pelo interceptor global */ }
  };

  useEffect(() => { loadDespesas(); }, []);
  useEffect(() => { loadOcorrencias(); /* eslint-disable-line */ }, [calMonth]);
  useEffect(() => {
    if (tab === 'balanco') loadBalanco();
    // eslint-disable-next-line
  }, [tab, anoBalanco, apenasPagas]);

  const submitForm = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        descricao: form.descricao.trim(),
        valor: parseFloat(form.valor),
        data_inicial: form.data_inicial,
        tipo_pagamento: form.tipo_pagamento,
        recorrencia: form.tipo_pagamento === 'recorrente' ? form.recorrencia : null,
        dia_mes: form.dia_mes ? parseInt(form.dia_mes, 10) : null,
        aviso_dias_antes: parseInt(form.aviso_dias_antes, 10) || 3,
        aviso_email: form.aviso_email.trim() || 'geral@hwi.pt',
        data_fim: form.data_fim || null,
      };
      if (editingId) {
        await axios.put(`${API}/despesas-internas/${editingId}`, payload);
        toast.success('Despesa atualizada');
      } else {
        await axios.post(`${API}/despesas-internas`, payload);
        toast.success('Despesa criada');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      await Promise.all([loadDespesas(), loadOcorrencias()]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro a guardar');
    }
  };

  const startEdit = (d) => {
    setEditingId(d.id);
    setForm({
      descricao: d.descricao || '',
      valor: d.valor ?? '',
      data_inicial: (d.data_inicial || '').split('T')[0],
      tipo_pagamento: d.tipo_pagamento || 'pontual',
      recorrencia: d.recorrencia || 'mensal',
      dia_mes: d.dia_mes ?? '',
      aviso_dias_antes: d.aviso_dias_antes ?? 3,
      aviso_email: d.aviso_email || 'geral@hwi.pt',
      data_fim: d.data_fim ? d.data_fim.split('T')[0] : '',
    });
    setShowForm(true);
  };

  const removeDespesa = async (id) => {
    if (!window.confirm('Eliminar esta despesa? Os pagamentos associados também serão removidos.')) return;
    try {
      await axios.delete(`${API}/despesas-internas/${id}`);
      toast.success('Despesa eliminada');
      await Promise.all([loadDespesas(), loadOcorrencias()]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro');
    }
  };

  const openPay = (oc) => {
    setPayModal(oc);
    setPayForm({
      data_pagamento: oc.data_pagamento || todayISO(),
      valor_pago: oc.valor_pago ?? oc.valor,
      notas: '',
    });
  };

  const submitPay = async () => {
    if (!payModal) return;
    try {
      await axios.post(`${API}/despesas-internas/${payModal.despesa_id}/marcar-pago`, {
        data_prevista: payModal.data_prevista,
        data_pagamento: payForm.data_pagamento,
        valor_pago: parseFloat(payForm.valor_pago) || payModal.valor,
        notas: payForm.notas,
      });
      toast.success('Pagamento registado');
      setPayModal(null);
      await loadOcorrencias();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro');
    }
  };

  const desmarcarPago = async (oc) => {
    if (!window.confirm('Remover registo de pagamento desta ocorrência?')) return;
    try {
      await axios.delete(`${API}/despesas-internas/${oc.despesa_id}/marcar-pago`, {
        params: { data_prevista: oc.data_prevista },
      });
      toast.success('Pagamento removido');
      await loadOcorrencias();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro');
    }
  };

  // Indexar ocorrências por dia (YYYY-MM-DD)
  const ocorrPorDia = useMemo(() => {
    const m = {};
    ocorrencias.forEach((o) => {
      (m[o.data_prevista] = m[o.data_prevista] || []).push(o);
    });
    return m;
  }, [ocorrencias]);

  // Construir dias do mês para calendar grid
  const calendarDays = useMemo(() => {
    const y = calMonth.getFullYear(); const m = calMonth.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const startWeekday = (first.getDay() + 6) % 7; // Monday-first
    const cells = [];
    for (let i = 0; i < startWeekday; i += 1) cells.push(null);
    for (let d = 1; d <= last.getDate(); d += 1) {
      const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, iso: ds, ocs: ocorrPorDia[ds] || [] });
    }
    return cells;
  }, [calMonth, ocorrPorDia]);

  const totalMes = useMemo(() => {
    let plan = 0; let pago = 0;
    ocorrencias.forEach((o) => {
      plan += parseFloat(o.valor || 0);
      if (o.pago) pago += parseFloat(o.valor_pago || 0);
    });
    return { plan, pago };
  }, [ocorrencias]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navigation user={user} onLogout={onLogout} />
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => (window.location.href = '/admin')}
              data-testid="btn-back-admin"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Admin
            </Button>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Receipt className="w-7 h-7 text-rose-500" />
              Despesas Internas
            </h1>
          </div>
          <Button
            onClick={() => { setEditingId(null); setForm(emptyForm()); setShowForm(true); }}
            className="bg-rose-600 hover:bg-rose-700"
            data-testid="btn-nova-despesa"
          >
            <Plus className="w-4 h-4 mr-1" /> Nova Despesa
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-[#1a1a1a] mb-4">
            <TabsTrigger value="calendario" data-testid="tab-calendario">
              <CalIcon className="w-4 h-4 mr-1" /> Calendário
            </TabsTrigger>
            <TabsTrigger value="lista" data-testid="tab-lista">
              <Receipt className="w-4 h-4 mr-1" /> Despesas ({despesas.length})
            </TabsTrigger>
            <TabsTrigger value="balanco" data-testid="tab-balanco">
              <BarChart3 className="w-4 h-4 mr-1" /> Balanço
            </TabsTrigger>
          </TabsList>

          {/* CALENDÁRIO */}
          <TabsContent value="calendario" className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                  data-testid="btn-prev-month"
                >
                  ‹
                </Button>
                <h2 className="text-xl font-semibold min-w-[180px] text-center">
                  {MONTH_NAMES[calMonth.getMonth()]} {calMonth.getFullYear()}
                </h2>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                  data-testid="btn-next-month"
                >
                  ›
                </Button>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => setCalMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                >
                  Hoje
                </Button>
                <Button variant="ghost" size="sm" onClick={loadOcorrencias} disabled={loading}>
                  <RefreshCcw className="w-3 h-3 mr-1" /> Atualizar
                </Button>
              </div>
              <div className="text-sm flex items-center gap-3">
                <span className="text-gray-400">Mês:</span>
                <span>Planeado <strong className="text-rose-400">{fmtEur(totalMes.plan)}</strong></span>
                <span>Pago <strong className="text-emerald-400">{fmtEur(totalMes.pago)}</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-xs">
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((w) => (
                <div key={w} className="text-center font-semibold text-gray-400 py-1">{w}</div>
              ))}
              {calendarDays.map((c, i) => (
                <div
                  key={i}
                  className={`min-h-[110px] p-1.5 rounded border ${
                    c ? 'bg-[#0f0f0f] border-gray-700' : 'border-transparent'
                  }`}
                >
                  {c && (
                    <>
                      <div className="text-[10px] text-gray-400 mb-1 flex justify-between">
                        <span>{c.day}</span>
                        {c.ocs.length > 0 && (
                          <span className="text-rose-400 font-bold">{c.ocs.length}</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {c.ocs.slice(0, 4).map((o) => (
                          <button
                            key={`${o.despesa_id}-${o.data_prevista}`}
                            onClick={() => openPay(o)}
                            data-testid={`occ-${o.despesa_id}`}
                            className={`w-full text-left text-[10px] px-1 py-0.5 rounded truncate ${
                              o.pago
                                ? 'bg-emerald-700/40 text-emerald-200 border border-emerald-600/40'
                                : 'bg-rose-900/40 text-rose-200 border border-rose-700/40 hover:bg-rose-800/60'
                            }`}
                            title={`${o.descricao} — ${fmtEur(o.valor)}`}
                          >
                            {o.pago ? '✓ ' : ''}{o.descricao}
                          </button>
                        ))}
                        {c.ocs.length > 4 && (
                          <div className="text-[10px] text-gray-500">+{c.ocs.length - 4} mais</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          {/* LISTA */}
          <TabsContent value="lista">
            <div className="overflow-x-auto rounded-lg border border-gray-700 bg-[#0f0f0f]">
              <table className="w-full text-sm">
                <thead className="bg-[#1a1a1a]">
                  <tr>
                    <th className="text-left p-2">Descrição</th>
                    <th className="text-right p-2">Valor</th>
                    <th className="text-left p-2">Tipo</th>
                    <th className="text-left p-2">Início</th>
                    <th className="text-left p-2">Fim</th>
                    <th className="text-center p-2">Aviso</th>
                    <th className="text-center p-2">Estado</th>
                    <th className="text-right p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {despesas.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-8 text-gray-500">
                      Sem despesas. Clica em <strong>Nova Despesa</strong> para criar.
                    </td></tr>
                  )}
                  {despesas.map((d) => (
                    <tr key={d.id} className="border-t border-gray-800" data-testid={`despesa-row-${d.id}`}>
                      <td className="p-2">{d.descricao}</td>
                      <td className="p-2 text-right">{fmtEur(d.valor)}</td>
                      <td className="p-2">
                        {d.tipo_pagamento === 'recorrente'
                          ? `Recorrente · ${d.recorrencia || ''}`
                          : 'Pontual'}
                      </td>
                      <td className="p-2">{fmtDate(d.data_inicial)}</td>
                      <td className="p-2">{d.data_fim ? fmtDate(d.data_fim) : '—'}</td>
                      <td className="p-2 text-center">{d.aviso_dias_antes}d</td>
                      <td className="p-2 text-center">
                        {d.ativo ? (
                          <span className="text-[10px] uppercase font-bold bg-emerald-700 text-white px-1.5 py-0.5 rounded">activa</span>
                        ) : (
                          <span className="text-[10px] uppercase text-gray-400">inactiva</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => startEdit(d)}
                          data-testid={`btn-edit-${d.id}`}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => removeDespesa(d.id)}
                          data-testid={`btn-del-${d.id}`}
                        >
                          <Trash2 className="w-3 h-3 text-rose-400" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* BALANÇO */}
          <TabsContent value="balanco" className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Label>Ano:</Label>
              <Input
                type="number" value={anoBalanco}
                onChange={(e) => setAnoBalanco(parseInt(e.target.value, 10) || new Date().getFullYear())}
                className="w-24"
                data-testid="balanco-ano-input"
              />
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={apenasPagas}
                  onChange={(e) => setApenasPagas(e.target.checked)}
                />
                Apenas pagas
              </label>
            </div>
            {balanco && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#0f0f0f] p-4 rounded border border-rose-700/40">
                    <div className="text-xs text-gray-400">Total Planeado</div>
                    <div className="text-2xl font-bold text-rose-400" data-testid="bal-planeado">
                      {fmtEur(balanco.total_planeado)}
                    </div>
                  </div>
                  <div className="bg-[#0f0f0f] p-4 rounded border border-emerald-700/40">
                    <div className="text-xs text-gray-400">Total Pago</div>
                    <div className="text-2xl font-bold text-emerald-400" data-testid="bal-pago">
                      {fmtEur(balanco.total_pago)}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto rounded border border-gray-700">
                  <table className="w-full text-sm">
                    <thead className="bg-[#1a1a1a]"><tr>
                      <th className="text-left p-2">Mês</th>
                      <th className="text-right p-2">Planeado</th>
                      <th className="text-right p-2">Pago</th>
                    </tr></thead>
                    <tbody>
                      {Array.from({ length: 12 }).map((_, i) => {
                        const m = String(i + 1);
                        const v = balanco.por_mes[m] || { planeado: 0, pago: 0 };
                        return (
                          <tr key={m} className="border-t border-gray-800">
                            <td className="p-2">{MONTH_NAMES[i]}</td>
                            <td className="p-2 text-right">{fmtEur(v.planeado)}</td>
                            <td className="p-2 text-right text-emerald-400">{fmtEur(v.pago)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 className="font-semibold mt-4 mb-2">Por Despesa</h3>
                  <div className="overflow-x-auto rounded border border-gray-700">
                    <table className="w-full text-sm">
                      <thead className="bg-[#1a1a1a]"><tr>
                        <th className="text-left p-2">Descrição</th>
                        <th className="text-left p-2">Tipo</th>
                        <th className="text-right p-2">Ocorrências</th>
                        <th className="text-right p-2">Planeado</th>
                        <th className="text-right p-2">Pago</th>
                      </tr></thead>
                      <tbody>
                        {(balanco.por_despesa || []).map((d) => (
                          <tr key={d.id} className="border-t border-gray-800">
                            <td className="p-2">{d.descricao}</td>
                            <td className="p-2">{d.tipo_pagamento}{d.recorrencia ? ` · ${d.recorrencia}` : ''}</td>
                            <td className="p-2 text-right">{d.ocorrencias}</td>
                            <td className="p-2 text-right">{fmtEur(d.total_planeado)}</td>
                            <td className="p-2 text-right text-emerald-400">{fmtEur(d.total_pago)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* MODAL FORM */}
      <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditingId(null); } }}>
        <DialogContent className="max-w-lg" data-testid="form-despesa-modal">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Despesa' : 'Nova Despesa'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitForm} className="space-y-3">
            <div>
              <Label>Descrição</Label>
              <Input
                required value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                data-testid="form-descricao"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor (€)</Label>
                <Input
                  required type="number" step="0.01" min="0"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  data-testid="form-valor"
                />
              </div>
              <div>
                <Label>Data Inicial</Label>
                <Input
                  required type="date"
                  value={form.data_inicial}
                  onChange={(e) => setForm({ ...form, data_inicial: e.target.value })}
                  data-testid="form-data-inicial"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <select
                  value={form.tipo_pagamento}
                  onChange={(e) => setForm({ ...form, tipo_pagamento: e.target.value })}
                  className="w-full bg-[#0f0f0f] border border-gray-700 rounded px-2 py-1 text-sm"
                  data-testid="form-tipo"
                >
                  <option value="pontual">Pontual</option>
                  <option value="recorrente">Recorrente</option>
                </select>
              </div>
              {form.tipo_pagamento === 'recorrente' && (
                <div>
                  <Label>Recorrência</Label>
                  <select
                    value={form.recorrencia}
                    onChange={(e) => setForm({ ...form, recorrencia: e.target.value })}
                    className="w-full bg-[#0f0f0f] border border-gray-700 rounded px-2 py-1 text-sm"
                    data-testid="form-recorrencia"
                  >
                    <option value="semanal">Semanal</option>
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
              )}
            </div>
            {form.tipo_pagamento === 'recorrente' && form.recorrencia === 'mensal' && (
              <div>
                <Label>Dia do mês (1–31, opcional)</Label>
                <Input
                  type="number" min="1" max="31"
                  value={form.dia_mes}
                  onChange={(e) => setForm({ ...form, dia_mes: e.target.value })}
                  placeholder="Por defeito usa o dia da Data Inicial"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Avisar com (dias)</Label>
                <Input
                  type="number" min="0" max="60"
                  value={form.aviso_dias_antes}
                  onChange={(e) => setForm({ ...form, aviso_dias_antes: e.target.value })}
                />
              </div>
              <div>
                <Label>Email do aviso</Label>
                <Input
                  type="email"
                  value={form.aviso_email}
                  onChange={(e) => setForm({ ...form, aviso_email: e.target.value })}
                />
              </div>
            </div>
            {form.tipo_pagamento === 'recorrente' && (
              <div>
                <Label>Data fim (opcional)</Label>
                <Input
                  type="date"
                  value={form.data_fim}
                  onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
                />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" className="bg-rose-600 hover:bg-rose-700" data-testid="form-submit">
                {editingId ? 'Atualizar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL PAGAR */}
      <Dialog open={!!payModal} onOpenChange={(o) => { if (!o) setPayModal(null); }}>
        <DialogContent className="max-w-md" data-testid="pay-modal">
          {payModal && (
            <>
              <DialogHeader>
                <DialogTitle>{payModal.pago ? 'Ocorrência Paga' : 'Marcar como Pago'}</DialogTitle>
                <DialogDescription>
                  {payModal.descricao} — {fmtEur(payModal.valor)} ({fmtDate(payModal.data_prevista)})
                </DialogDescription>
              </DialogHeader>
              {payModal.pago ? (
                <div className="space-y-2 text-sm">
                  <div>Pago em <strong>{fmtDate(payModal.data_pagamento)}</strong></div>
                  <div>Valor pago: <strong>{fmtEur(payModal.valor_pago)}</strong></div>
                  <Button
                    variant="destructive"
                    onClick={() => { desmarcarPago(payModal); setPayModal(null); }}
                    data-testid="btn-desmarcar"
                  >
                    <X className="w-4 h-4 mr-1" /> Desmarcar pagamento
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label>Data do pagamento</Label>
                    <Input
                      type="date"
                      value={payForm.data_pagamento}
                      onChange={(e) => setPayForm({ ...payForm, data_pagamento: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Valor pago (€)</Label>
                    <Input
                      type="number" step="0.01" min="0"
                      value={payForm.valor_pago}
                      onChange={(e) => setPayForm({ ...payForm, valor_pago: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Notas</Label>
                    <Input
                      value={payForm.notas}
                      onChange={(e) => setPayForm({ ...payForm, notas: e.target.value })}
                      placeholder="Opcional"
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setPayModal(null)}>Cancelar</Button>
                    <Button
                      onClick={submitPay}
                      className="bg-emerald-600 hover:bg-emerald-700"
                      data-testid="btn-confirmar-pago"
                    >
                      <Check className="w-4 h-4 mr-1" /> Confirmar
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DespesasInternas;
