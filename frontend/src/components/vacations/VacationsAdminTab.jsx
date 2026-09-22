import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Palmtree, Check, X, Plus, Calendar as CalIcon, User as UserIcon,
  History, Settings, RefreshCw, Edit3, Trash2, AlertCircle, Download,
} from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const STATUS_COLORS = {
  pendente:  'bg-yellow-500/10 text-yellow-400 border-yellow-500/40',
  aprovada:  'bg-green-500/10 text-green-400 border-green-500/40',
  rejeitada: 'bg-red-500/10 text-red-400 border-red-500/40',
  cancelada: 'bg-gray-500/10 text-gray-400 border-gray-500/40',
};

const fmtDate = (iso) => {
  if (!iso) return '-';
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

const fmtDateTime = (iso) => {
  if (!iso) return '-';
  try {
    const dt = new Date(iso);
    return dt.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
};

const Metric = ({ label, value, tone = 'default' }) => {
  const tones = {
    default: 'text-white', positive: 'text-green-400', warning: 'text-yellow-400',
    muted: 'text-gray-400',
  };
  return (
    <div className="bg-[#0f0f0f] border border-gray-800 rounded-lg p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${tones[tone]}`}>{value}</div>
    </div>
  );
};

export default function VacationsAdminTab({ isMobile }) {
  const [users, setUsers] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  // User detail view
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [userSaldo, setUserSaldo] = useState(null);
  const [userRequests, setUserRequests] = useState([]);
  const [userAudit, setUserAudit] = useState([]);
  const [userAdjustments, setUserAdjustments] = useState([]);
  const [loadingUser, setLoadingUser] = useState(false);
  const [detailTab, setDetailTab] = useState('history');

  // Modals
  const [decisionModal, setDecisionModal] = useState(null); // {request, action}
  const [reason, setReason] = useState('');
  const [showHistoric, setShowHistoric] = useState(false);
  const [histForm, setHistForm] = useState({ start_date: '', end_date: '', dias_override: '', observacao: '' });
  const [histCalcDays, setHistCalcDays] = useState(null);
  const [showAdj, setShowAdj] = useState(false);
  const [adjForm, setAdjForm] = useState({ year: new Date().getFullYear(), dias: '', reason: '' });
  const [showCsd, setShowCsd] = useState(false);
  const [csdValue, setCsdValue] = useState('');

  const fetchTop = async () => {
    setLoading(true);
    try {
      const [u, p] = await Promise.all([
        axios.get(`${API}/admin/users`),
        axios.get(`${API}/admin/vacations/pending`),
      ]);
      setUsers(u.data || []);
      setPending(p.data || []);
    } catch (e) {
      toast.error('Erro ao carregar dados');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchTop(); }, [refreshTick]);

  const fetchUserDetail = async (uid) => {
    if (!uid) return;
    setLoadingUser(true);
    try {
      const [s, r, a, adj] = await Promise.all([
        axios.get(`${API}/admin/vacations/user/${uid}/saldo`),
        axios.get(`${API}/admin/vacations/user/${uid}/requests`),
        axios.get(`${API}/admin/vacations/user/${uid}/audit`),
        axios.get(`${API}/admin/vacations/user/${uid}/adjustments`),
      ]);
      setUserSaldo(s.data);
      setUserRequests(r.data || []);
      setUserAudit(a.data || []);
      setUserAdjustments(adj.data || []);
    } catch (e) {
      toast.error('Erro ao carregar utilizador');
    } finally { setLoadingUser(false); }
  };

  useEffect(() => { fetchUserDetail(selectedUserId); }, [selectedUserId, refreshTick]);

  // Auto-calc dias for historic form
  useEffect(() => {
    const run = async () => {
      if (!histForm.start_date || !histForm.end_date) { setHistCalcDays(null); return; }
      try {
        const { data } = await axios.post(`${API}/vacations/calculate-days`, {
          start_date: histForm.start_date, end_date: histForm.end_date,
        });
        setHistCalcDays(data.dias_uteis);
      } catch { setHistCalcDays(null); }
    };
    run();
  }, [histForm.start_date, histForm.end_date]);

  const usersById = useMemo(() => Object.fromEntries((users || []).map(u => [u.id, u])), [users]);

  const submitDecision = async () => {
    if (!decisionModal) return;
    try {
      await axios.post(
        `${API}/admin/vacations/requests/${decisionModal.request.id}/decide`,
        { action: decisionModal.action, reason }
      );
      toast.success(decisionModal.action === 'approve' ? 'Pedido aprovado' : 'Pedido rejeitado');
      setDecisionModal(null); setReason('');
      setRefreshTick(t => t + 1);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro na decisão');
    }
  };

  const submitHistoric = async () => {
    if (!selectedUserId) { toast.error('Selecione um utilizador'); return; }
    if (!histForm.start_date || !histForm.end_date) { toast.error('Datas obrigatórias'); return; }
    try {
      await axios.post(`${API}/admin/vacations/historic`, {
        user_id: selectedUserId,
        start_date: histForm.start_date,
        end_date: histForm.end_date,
        dias_override: histForm.dias_override ? parseInt(histForm.dias_override, 10) : undefined,
        observacao: histForm.observacao || undefined,
      });
      toast.success('Histórico adicionado');
      setShowHistoric(false);
      setHistForm({ start_date: '', end_date: '', dias_override: '', observacao: '' });
      setHistCalcDays(null);
      setRefreshTick(t => t + 1);
    } catch (e) { toast.error(e.response?.data?.detail || 'Erro'); }
  };

  const submitAdjustment = async () => {
    if (!selectedUserId) { toast.error('Selecione um utilizador'); return; }
    const dias = parseInt(adjForm.dias, 10);
    if (!adjForm.year || Number.isNaN(dias) || dias === 0) {
      toast.error('Ano e dias (≠ 0) obrigatórios'); return;
    }
    try {
      await axios.post(`${API}/admin/vacations/adjustments`, {
        user_id: selectedUserId,
        year: parseInt(adjForm.year, 10),
        dias, reason: adjForm.reason || undefined,
      });
      toast.success('Ajuste guardado');
      setShowAdj(false);
      setAdjForm({ year: new Date().getFullYear(), dias: '', reason: '' });
      setRefreshTick(t => t + 1);
    } catch (e) { toast.error(e.response?.data?.detail || 'Erro'); }
  };

  const deleteAdjustment = async (adjId) => {
    if (!window.confirm('Remover este ajuste?')) return;
    try {
      await axios.delete(`${API}/admin/vacations/adjustments/${adjId}`);
      toast.success('Ajuste removido');
      setRefreshTick(t => t + 1);
    } catch (e) { toast.error(e.response?.data?.detail || 'Erro'); }
  };

  const submitCsd = async () => {
    if (!selectedUserId || !csdValue) { toast.error('Data obrigatória'); return; }
    try {
      await axios.patch(
        `${API}/admin/vacations/user/${selectedUserId}/config`,
        { company_start_date: csdValue }
      );
      toast.success('Data de entrada atualizada');
      setShowCsd(false);
      setRefreshTick(t => t + 1);
    } catch (e) { toast.error(e.response?.data?.detail || 'Erro'); }
  };

  const cancelRequest = async (id) => {
    if (!window.confirm('Cancelar este pedido aprovado?')) return;
    try {
      await axios.post(`${API}/admin/vacations/requests/${id}/cancel`, { reason: 'Cancelamento admin' });
      toast.success('Pedido cancelado');
      setRefreshTick(t => t + 1);
    } catch (e) { toast.error(e.response?.data?.detail || 'Erro'); }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin inline mr-2" /> A carregar...</div>;
  }

  const selUser = selectedUserId ? usersById[selectedUserId] : null;

  return (
    <div className="space-y-6" data-testid="admin-vacations-tab">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Palmtree className="w-6 h-6 text-emerald-400" />
          <h2 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-semibold text-white`}>Gestão de Férias</h2>
        </div>
        <Button
          onClick={async () => {
            toast.info('A gerar Mapa de Férias...');
            try {
              const resp = await axios.get(`${API}/admin/vacations/mapa-ferias.xlsx?_ts=${Date.now()}`, {
                responseType: 'blob',
                headers: { 'Cache-Control': 'no-cache' },
              });
              const url = URL.createObjectURL(new Blob([resp.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              }));
              const a = document.createElement('a');
              a.href = url;
              a.download = `Mapa_Ferias.xlsx`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
              toast.success('Mapa de Férias descarregado');
            } catch (e) {
              toast.error('Erro ao gerar Mapa de Férias');
            }
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          data-testid="download-mapa-ferias-btn"
        >
          <Download className="w-4 h-4 mr-1.5" /> Download Mapa de Férias
        </Button>
      </div>

      {/* Pedidos pendentes */}
      <Card className="bg-[#141414] border-gray-800 p-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
          Pedidos Pendentes ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">Nenhum pedido pendente</p>
        ) : (
          <div className="space-y-2" data-testid="admin-pending-list">
            {pending.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-[#0f0f0f] border border-yellow-500/30 rounded-lg p-3 gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-white font-medium">{r.username}</span>
                    <span className="text-xs text-gray-500">·</span>
                    <span className="text-sm text-gray-300">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</span>
                    <span className="text-xs text-gray-500">·</span>
                    <span className="text-sm text-yellow-400 font-semibold">{r.dias_uteis} dias úteis</span>
                  </div>
                  {r.observacao && <p className="text-xs text-gray-500 mt-1">{r.observacao}</p>}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm" className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => { setDecisionModal({ request: r, action: 'approve' }); setReason(''); }}
                    data-testid={`approve-${r.id}`}
                  >
                    <Check className="w-4 h-4 mr-1" /> Aprovar
                  </Button>
                  <Button
                    size="sm" variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                    onClick={() => { setDecisionModal({ request: r, action: 'reject' }); setReason(''); }}
                    data-testid={`reject-${r.id}`}
                  >
                    <X className="w-4 h-4 mr-1" /> Rejeitar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Detalhe de utilizador */}
      <Card className="bg-[#141414] border-gray-800 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Ficha do Colaborador
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedUserId || ''} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-[240px] bg-[#0f0f0f] border-gray-800 text-white" data-testid="admin-vac-user-select">
                <SelectValue placeholder="Escolher utilizador..." />
              </SelectTrigger>
              <SelectContent className="bg-[#0f0f0f] border-gray-800 max-h-80">
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.username} {u.full_name ? `— ${u.full_name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selUser && (
              <>
                <Button size="sm" variant="outline" className="border-blue-500/40 text-blue-400"
                  onClick={() => { setCsdValue(selUser.company_start_date || ''); setShowCsd(true); }}
                  data-testid="admin-vac-edit-csd">
                  <Edit3 className="w-3.5 h-3.5 mr-1" /> Data de entrada
                </Button>
                <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-400"
                  onClick={() => setShowHistoric(true)} data-testid="admin-vac-add-historic">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Histórico
                </Button>
                <Button size="sm" variant="outline" className="border-orange-500/40 text-orange-400"
                  onClick={() => setShowAdj(true)} data-testid="admin-vac-add-adjustment">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Ajuste transitados
                </Button>
              </>
            )}
          </div>
        </div>

        {!selUser ? (
          <p className="text-gray-500 text-sm text-center py-8">Escolhe um colaborador para ver o saldo, pedidos e auditoria.</p>
        ) : loadingUser ? (
          <p className="text-gray-500 text-sm text-center py-8"><RefreshCw className="w-4 h-4 animate-spin inline mr-2" /> A carregar...</p>
        ) : (
          <>
            <div className="text-xs text-gray-500 mb-3">
              Data de entrada: <span className="text-white font-medium">{fmtDate(userSaldo?.company_start_date)}</span>
              {userSaldo?.current && (
                <> · Ano actual: <span className="text-white font-medium">{userSaldo.current_year}</span></>
              )}
            </div>

            <Tabs value={detailTab} onValueChange={setDetailTab}>
              <TabsList className="bg-[#0f0f0f] border border-gray-800">
                <TabsTrigger value="history"><History className="w-3.5 h-3.5 mr-1" /> Histórico</TabsTrigger>
                <TabsTrigger value="requests"><CalIcon className="w-3.5 h-3.5 mr-1" /> Pedidos</TabsTrigger>
                <TabsTrigger value="adjustments"><Settings className="w-3.5 h-3.5 mr-1" /> Ajustes</TabsTrigger>
                <TabsTrigger value="audit"><AlertCircle className="w-3.5 h-3.5 mr-1" /> Auditoria</TabsTrigger>
              </TabsList>

              {/* Histórico anual */}
              <TabsContent value="history" className="pt-4">
                {(userSaldo?.history || []).length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">Sem histórico</p>
                ) : (
                  <div className="space-y-2" data-testid="admin-vac-history">
                    {userSaldo.history.map(y => (
                      <div key={y.year} className="bg-[#0f0f0f] border border-gray-800 rounded-lg p-3">
                        <div className="text-sm text-emerald-400 font-semibold mb-2">{y.year}</div>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                          <Metric label="Totais" value={y.dias_totais} />
                          <Metric label="Transitados" value={y.dias_transitados} tone="muted" />
                          <Metric label="Gozados" value={y.dias_gozados} tone="warning" />
                          <Metric label="Pendentes" value={y.dias_pendentes} tone="warning" />
                          <Metric label="Disponíveis" value={y.dias_disponiveis} tone="positive" />
                          <Metric label="Cancelados" value={y.dias_cancelados} tone="muted" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Pedidos */}
              <TabsContent value="requests" className="pt-4">
                {userRequests.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">Sem pedidos</p>
                ) : (
                  <div className="space-y-2">
                    {userRequests.map(r => (
                      <div key={r.id} className={`bg-[#0f0f0f] border rounded-lg p-3 ${STATUS_COLORS[r.status]?.split(' ')[2] || 'border-gray-800'}`}>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-medium">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</span>
                              <span className="text-xs text-gray-500">·</span>
                              <span className="text-sm text-gray-300">{r.dias_uteis} dias</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold ${STATUS_COLORS[r.status]}`}>
                                {r.status}
                              </span>
                              {r.source === 'historic' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold bg-blue-500/10 text-blue-400">
                                  Histórico
                                </span>
                              )}
                            </div>
                            {r.observacao && <p className="text-xs text-gray-500 mt-1">{r.observacao}</p>}
                            {r.decision_reason && <p className="text-xs text-gray-400 italic mt-1">Motivo: {r.decision_reason}</p>}
                          </div>
                          {(r.status === 'aprovada' || r.status === 'pendente') && (
                            <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10"
                              onClick={() => cancelRequest(r.id)}>
                              <X className="w-3.5 h-3.5 mr-1" /> Cancelar
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Ajustes */}
              <TabsContent value="adjustments" className="pt-4">
                {userAdjustments.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">Sem ajustes manuais</p>
                ) : (
                  <div className="space-y-2">
                    {userAdjustments.map(a => (
                      <div key={a.id} className="bg-[#0f0f0f] border border-gray-800 rounded-lg p-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-white text-sm">
                            <span className="font-semibold">{a.year}</span> · {' '}
                            <span className={a.dias > 0 ? 'text-green-400' : 'text-red-400'}>
                              {a.dias > 0 ? '+' : ''}{a.dias} dias
                            </span>
                          </div>
                          {a.reason && <p className="text-xs text-gray-500">{a.reason}</p>}
                          <p className="text-[10px] text-gray-600">{fmtDateTime(a.created_at)} · {a.created_by_name || 'admin'}</p>
                        </div>
                        <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10" onClick={() => deleteAdjustment(a.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Auditoria */}
              <TabsContent value="audit" className="pt-4">
                {userAudit.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">Sem eventos</p>
                ) : (
                  <div className="space-y-1 max-h-96 overflow-y-auto">
                    {userAudit.map(a => (
                      <div key={a.id} className="bg-[#0f0f0f] border border-gray-800 rounded p-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">{fmtDateTime(a.timestamp)}</span>
                          <span className="text-emerald-400 font-semibold">{a.action}</span>
                          <span className="text-gray-400">em {a.entity_type}</span>
                          <span className="text-gray-500">por</span>
                          <span className="text-white">{a.actor_name || 'sistema'}</span>
                        </div>
                        {a.reason && <div className="text-gray-500 mt-1">Motivo: {a.reason}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </Card>

      {/* Modal: decisão */}
      <Dialog open={!!decisionModal} onOpenChange={(o) => !o && setDecisionModal(null)}>
        <DialogContent className="bg-[#141414] border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>{decisionModal?.action === 'approve' ? 'Aprovar' : 'Rejeitar'} pedido</DialogTitle>
          </DialogHeader>
          {decisionModal && (
            <div className="space-y-3 text-sm">
              <p><span className="text-gray-500">Colaborador:</span> <span className="text-white">{decisionModal.request.username}</span></p>
              <p><span className="text-gray-500">Período:</span> <span className="text-white">{fmtDate(decisionModal.request.start_date)} → {fmtDate(decisionModal.request.end_date)}</span></p>
              <p><span className="text-gray-500">Dias úteis:</span> <span className="text-white font-semibold">{decisionModal.request.dias_uteis}</span></p>
              <div>
                <Label className="text-xs text-gray-400">Observação (opcional)</Label>
                <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                  className="bg-[#0f0f0f] border-gray-800 text-white" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDecisionModal(null)}>Cancelar</Button>
            <Button onClick={submitDecision}
              className={decisionModal?.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
              data-testid="submit-decision">
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: adicionar histórico */}
      <Dialog open={showHistoric} onOpenChange={setShowHistoric}>
        <DialogContent className="bg-[#141414] border-gray-800 text-white">
          <DialogHeader><DialogTitle>Adicionar férias históricas</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Adiciona férias que já foram gozadas antes do sistema entrar em produção.
              Ficam com estado <span className="text-blue-400">aprovada</span>+<span className="text-blue-400">histórico</span>.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-400">Data inicial</Label>
                <Input type="date" value={histForm.start_date}
                  onChange={e => setHistForm({ ...histForm, start_date: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-800 text-white" />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Data final</Label>
                <Input type="date" value={histForm.end_date}
                  onChange={e => setHistForm({ ...histForm, end_date: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-800 text-white" />
              </div>
            </div>
            {histCalcDays != null && (
              <div className="text-xs text-emerald-400">
                Cálculo automático: <span className="font-bold">{histCalcDays}</span> dias úteis
              </div>
            )}
            <div>
              <Label className="text-xs text-gray-400">Dias (corrigir manualmente — opcional)</Label>
              <Input type="number" min="1" value={histForm.dias_override}
                placeholder={histCalcDays != null ? `Deixar vazio para usar ${histCalcDays}` : ''}
                onChange={e => setHistForm({ ...histForm, dias_override: e.target.value })}
                className="bg-[#0f0f0f] border-gray-800 text-white" />
            </div>
            <div>
              <Label className="text-xs text-gray-400">Observação</Label>
              <Textarea rows={2} value={histForm.observacao}
                onChange={e => setHistForm({ ...histForm, observacao: e.target.value })}
                className="bg-[#0f0f0f] border-gray-800 text-white" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowHistoric(false)}>Cancelar</Button>
            <Button onClick={submitHistoric} className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="submit-historic">Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: ajuste transitados */}
      <Dialog open={showAdj} onOpenChange={setShowAdj}>
        <DialogContent className="bg-[#141414] border-gray-800 text-white">
          <DialogHeader><DialogTitle>Ajuste de dias transitados</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Adiciona/retira dias transitados a um ano específico (para inicializar saldos ou corrigir manualmente).
              Este ajuste não afeta os cálculos automáticos futuros.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-400">Ano</Label>
                <Input type="number" value={adjForm.year}
                  onChange={e => setAdjForm({ ...adjForm, year: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-800 text-white" />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Dias (+ ou −)</Label>
                <Input type="number" value={adjForm.dias}
                  onChange={e => setAdjForm({ ...adjForm, dias: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-800 text-white" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-400">Motivo</Label>
              <Textarea rows={2} value={adjForm.reason}
                onChange={e => setAdjForm({ ...adjForm, reason: e.target.value })}
                className="bg-[#0f0f0f] border-gray-800 text-white" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdj(false)}>Cancelar</Button>
            <Button onClick={submitAdjustment} className="bg-orange-600 hover:bg-orange-700"
              data-testid="submit-adjustment">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: editar data de entrada */}
      <Dialog open={showCsd} onOpenChange={setShowCsd}>
        <DialogContent className="bg-[#141414] border-gray-800 text-white">
          <DialogHeader><DialogTitle>Data de entrada na empresa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Base do cálculo automático dos direitos de férias (art. 239.º CT).
            </p>
            <Input type="date" value={csdValue}
              onChange={e => setCsdValue(e.target.value)}
              className="bg-[#0f0f0f] border-gray-800 text-white" data-testid="csd-input" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCsd(false)}>Cancelar</Button>
            <Button onClick={submitCsd} className="bg-blue-600 hover:bg-blue-700"
              data-testid="submit-csd">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
