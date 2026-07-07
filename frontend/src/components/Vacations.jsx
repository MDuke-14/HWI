import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import { useMobile } from '@/contexts/MobileContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Calendar, Palmtree, Clock, CheckCircle, XCircle, AlertCircle, RotateCcw, Users, ChevronDown, ChevronUp, History } from 'lucide-react';
import VacationReviewModal from './VacationReviewModal';

const Vacations = ({ user, onLogout }) => {
  const { isMobile } = useMobile();
  const [balance, setBalance] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [requestForm, setRequestForm] = useState({ start_date: '', end_date: '', reason: '' });
  const [activeTab, setActiveTab] = useState('my');
  const [allBalances, setAllBalances] = useState([]);
  const [expandedUser, setExpandedUser] = useState(null);
  const [showPastYears, setShowPastYears] = useState(false);
  const [showPastYearsAdmin, setShowPastYearsAdmin] = useState(false);
  // Modal admin: editar dias gozados por ano
  const [showTakenDialog, setShowTakenDialog] = useState(false);
  const [takenDialogUser, setTakenDialogUser] = useState(null);
  const [takenYears, setTakenYears] = useState([]);
  const [takenLoading, setTakenLoading] = useState(false);
  const [takenSaving, setTakenSaving] = useState(false);

  useEffect(() => {
    fetchBalance();
    fetchRequests(showPastYears);
    if (user?.is_admin) {
      fetchAllBalances(showPastYearsAdmin);
    }
  }, []);

  const fetchBalance = async () => {
    try {
      const response = await axios.get(`${API}/vacations/balance`);
      setBalance(response.data);
    } catch (error) {
      console.error('Erro ao carregar saldo');
    }
  };

  const fetchRequests = async (includePast = false) => {
    try {
      const response = await axios.get(`${API}/vacations/my-requests`, {
        params: { include_past: includePast },
      });
      setRequests(response.data);
    } catch (error) {
      toast.error('Erro ao carregar pedidos');
    }
  };

  const fetchAllBalances = async (includePast = false) => {
    try {
      const response = await axios.get(`${API}/admin/vacations/all-balances`, {
        params: { include_past: includePast },
      });
      setAllBalances(response.data);
    } catch (error) {
      console.error('Erro ao carregar balances admin');
    }
  };

  const handleRequestVacation = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/vacations/request`, requestForm);
      toast.success('Pedido de férias submetido!');
      setShowRequestDialog(false);
      setRequestForm({ start_date: '', end_date: '', reason: '' });
      fetchBalance();
      fetchRequests(showPastYears);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao submeter pedido');
    } finally {
      setLoading(false);
    }
  };

  const openTakenDialog = async (ub) => {
    setTakenDialogUser(ub);
    setShowTakenDialog(true);
    setTakenLoading(true);
    try {
      const res = await axios.get(`${API}/admin/vacations/taken-by-year/${ub.user_id}`);
      setTakenYears(res.data.years || []);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao carregar anos');
      setTakenYears([]);
    } finally {
      setTakenLoading(false);
    }
  };

  const updateTakenYear = (year, value) => {
    const parsed = value === '' ? 0 : parseInt(value, 10);
    const days = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    setTakenYears((prev) => {
      // Novo modelo: cada ano tem earned próprio. Alocação FIFO por total_taken.
      const updated = prev.map((y) => ({
        ...y,
        days_taken_raw: y.year === year ? days : (y.days_taken_raw ?? y.days_taken ?? 0),
      }));
      // Recalcular days_taken (FIFO) e days_available
      let remaining = updated.reduce((s, y) => s + (y.days_taken_raw || 0), 0);
      return updated.map((y, i) => {
        const earned = y.days_earned || 0;
        const isLast = i === updated.length - 1;
        let displayTaken;
        let displayAvail;
        if (isLast) {
          displayTaken = remaining;
          displayAvail = earned - displayTaken;
          remaining = 0;
        } else {
          displayTaken = Math.min(remaining, earned);
          displayAvail = earned - displayTaken;
          remaining -= displayTaken;
        }
        return {
          ...y,
          days_taken: displayTaken,
          days_available: displayAvail,
          days_earned_effective: earned,
          carry_over_prev: 0,
        };
      });
    });
  };

  const saveTakenYears = async () => {
    if (!takenDialogUser) return;
    setTakenSaving(true);
    try {
      await axios.post(`${API}/admin/vacations/taken-by-year/${takenDialogUser.user_id}`, {
        years: takenYears.map((y) => ({ year: y.year, days_taken: y.days_taken_raw ?? y.days_taken ?? 0 })),
      });
      toast.success('Dias gozados atualizados');
      setShowTakenDialog(false);
      setTakenDialogUser(null);
      fetchAllBalances(showPastYearsAdmin);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao guardar');
    } finally {
      setTakenSaving(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { color: 'bg-amber-700 text-amber-200', icon: <Clock className="w-3 h-3" />, text: 'Pendente' },
      approved: { color: 'bg-green-700 text-green-200', icon: <CheckCircle className="w-3 h-3" />, text: 'Aprovado' },
      rejected: { color: 'bg-red-700 text-red-200', icon: <XCircle className="w-3 h-3" />, text: 'Rejeitado' },
      cancelled: { color: 'bg-gray-700 text-gray-200', icon: <XCircle className="w-3 h-3" />, text: 'Cancelado' },
    };
    const badge = badges[status] || {
      color: 'bg-gray-700 text-gray-300',
      icon: <AlertCircle className="w-3 h-3" />,
      text: status ? String(status) : 'Desconhecido',
    };
    return <span className={`${badge.color} px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1`}>{badge.icon}{badge.text}</span>;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] mobile-safe-top">
      {!isMobile && <Navigation user={user} onLogout={onLogout} activePage="vacations" />}
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-6xl fade-in">
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-2 md:gap-3 mb-3">
            <Palmtree className="w-7 h-7 md:w-10 md:h-10 text-green-400" />
            <h1 className="text-2xl md:text-4xl font-bold text-white">Gestão de Férias</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {balance && (
              <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-full text-xs md:text-sm">Pedir Férias</Button>
                </DialogTrigger>
                <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white">
                  <DialogHeader><DialogTitle>Pedir Férias</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <Label>Data Início</Label>
                      <Input type="date" value={requestForm.start_date} onChange={(e) => setRequestForm({...requestForm, start_date: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                    </div>
                    <div>
                      <Label>Data Fim</Label>
                      <Input type="date" value={requestForm.end_date} onChange={(e) => setRequestForm({...requestForm, end_date: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                    </div>
                    <div>
                      <Label>Motivo (opcional)</Label>
                      <Textarea value={requestForm.reason} onChange={(e) => setRequestForm({...requestForm, reason: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                    </div>
                    <Button onClick={handleRequestVacation} disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white rounded-full">Submeter Pedido</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {balance && balance.days_taken > 0 && (
              <Button
                size="sm"
                onClick={() => setShowReviewDialog(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white rounded-full text-xs md:text-sm"
                data-testid="review-vacations-btn"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                Rever
              </Button>
            )}
          </div>
        </div>

        {/* Tabs for admin */}
        {user?.is_admin && (
          <div className="flex gap-2 mb-6">
            <Button
              size="sm"
              onClick={() => setActiveTab('my')}
              className={`rounded-full text-xs md:text-sm ${activeTab === 'my' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              As Minhas Férias
            </Button>
            <Button
              size="sm"
              onClick={() => setActiveTab('admin')}
              className={`rounded-full text-xs md:text-sm ${activeTab === 'admin' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              data-testid="admin-vacations-tab"
            >
              <Users className="w-3.5 h-3.5 mr-1" />
              Todos os Colaboradores
            </Button>
          </div>
        )}

        {/* Admin: All balances */}
        {user?.is_admin && activeTab === 'admin' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-lg md:text-2xl font-semibold text-white flex items-center gap-2">
                <Users className="w-5 h-5 md:w-6 md:h-6 text-blue-400" />
                Férias por Colaborador
              </h2>
              <Button
                onClick={() => {
                  const next = !showPastYearsAdmin;
                  setShowPastYearsAdmin(next);
                  fetchAllBalances(next);
                }}
                variant="outline"
                size="sm"
                className={`border-gray-600 ${showPastYearsAdmin ? 'bg-amber-600/10 text-amber-300 border-amber-600/50' : 'text-gray-300 hover:bg-white/5'}`}
                data-testid="toggle-past-years-admin"
              >
                <History className="w-3.5 h-3.5 mr-1.5" />
                {showPastYearsAdmin ? 'Esconder anos anteriores' : 'Mostrar anos anteriores'}
              </Button>
            </div>

            {allBalances.length === 0 ? (
              <div className="glass-effect p-6 rounded-xl text-center text-gray-400">
                Nenhum colaborador com férias configuradas
              </div>
            ) : (
              <div className="space-y-3">
                {allBalances.map((ub) => {
                  const isExpanded = expandedUser === ub.user_id;
                  return (
                    <div key={ub.user_id} className="glass-effect rounded-xl overflow-hidden">
                      {/* Header row */}
                      <button
                        onClick={() => setExpandedUser(isExpanded ? null : ub.user_id)}
                        className="w-full flex items-center justify-between p-4 md:p-5 text-left hover:bg-white/5 transition"
                        data-testid={`vacation-user-${ub.user_id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-white font-semibold text-sm md:text-base">{ub.full_name || ub.username}</span>
                            {!ub.is_active && <span className="text-xs bg-red-600/20 text-red-400 px-1.5 py-0.5 rounded">Inativo</span>}
                          </div>
                          <div className="text-gray-500 text-xs">
                            Ano {ub.year} | Entrada: {ub.company_start_date ? new Date(ub.company_start_date + 'T00:00:00').toLocaleDateString('pt-PT') : 'N/D'}
                          </div>
                        </div>

                        {/* Quick stats — year breakdown from backend */}
                        <div className="flex items-center gap-3 md:gap-6 mr-2">
                          {ub.year_breakdown && ub.year_breakdown.length > 0 ? (
                            <>
                              {ub.year_breakdown.map((y, idx) => (
                                <div key={y.year} className="flex items-center gap-2 md:gap-3">
                                  <div className="text-center">
                                    <div className="text-xs text-gray-500">{y.year}</div>
                                    <div className={`font-bold text-sm md:text-lg ${y.days_available < 0 ? 'text-red-400' : 'text-blue-400'}`}>{y.days_available}</div>
                                  </div>
                                  {idx < ub.year_breakdown.length - 1 && (
                                    <div className="text-gray-600 text-xs">+</div>
                                  )}
                                </div>
                              ))}
                            </>
                          ) : (
                            <div className="text-center">
                              <div className="text-xs text-gray-500">{ub.year}</div>
                              <div className="text-blue-400 font-bold text-sm md:text-lg">{ub.days_earned}</div>
                            </div>
                          )}
                          <div className="text-gray-700 font-light">|</div>
                          <div className="text-center">
                            <div className="text-xs text-gray-500">Gozados</div>
                            <div className="text-amber-400 font-bold text-sm md:text-lg">{ub.days_taken}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-500">Disponíveis</div>
                            <div className={`font-bold text-sm md:text-lg ${ub.days_available < 0 ? 'text-red-400' : 'text-green-400'}`}>{ub.days_available}</div>
                          </div>
                        </div>

                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />}
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="border-t border-gray-800 p-4 md:p-5 space-y-4">
                          {/* Ações admin */}
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              onClick={() => openTakenDialog(ub)}
                              className="bg-amber-600 hover:bg-amber-700 text-white rounded-full text-xs"
                              data-testid={`edit-taken-${ub.user_id}`}
                            >
                              Editar Dias Gozados por Ano
                            </Button>
                          </div>

                          {/* Annual transitions */}
                          {ub.annual_transitions && ub.annual_transitions.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                                Transições Anuais
                              </h4>
                              <div className="space-y-2">
                                {ub.annual_transitions.map((t, i) => (
                                  <div key={i} className="bg-[#0f0f0f] rounded-lg p-3 text-sm">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-gray-400">{t.from_year} → {t.to_year}</span>
                                      <span className="text-gray-500 text-xs">
                                        {t.transition_date ? new Date(t.transition_date).toLocaleDateString('pt-PT') : ''}
                                      </span>
                                    </div>
                                    <div className="flex gap-4 text-xs">
                                      <span className="text-gray-500">Saldo anterior: <span className={`font-medium ${t.previous_available < 0 ? 'text-red-400' : 'text-amber-400'}`}>{t.previous_available} dias</span></span>
                                      <span className="text-gray-500">Gozados: <span className="text-amber-400 font-medium">{t.previous_taken}</span></span>
                                      <span className="text-gray-500">Novo saldo: <span className="text-green-400 font-medium">{t.new_available} dias</span></span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Approved requests */}
                          {ub.approved_requests && ub.approved_requests.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                                Férias Aprovadas
                              </h4>
                              <div className="space-y-1.5">
                                {ub.approved_requests.map((req) => (
                                  <div key={req.id} className="bg-[#0f0f0f] rounded-lg p-2.5 flex items-center justify-between text-sm">
                                    <div>
                                      <span className="text-white">{new Date(req.start_date + 'T00:00:00').toLocaleDateString('pt-PT')}</span>
                                      <span className="text-gray-500 mx-1">→</span>
                                      <span className="text-white">{new Date(req.end_date + 'T00:00:00').toLocaleDateString('pt-PT')}</span>
                                      {req.reason && <span className="text-gray-500 ml-2 text-xs">({req.reason})</span>}
                                    </div>
                                    <span className="text-green-400 font-medium text-xs">{req.days_requested} dias</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {(!ub.annual_transitions || ub.annual_transitions.length === 0) && (!ub.approved_requests || ub.approved_requests.length === 0) && (
                            <p className="text-gray-500 text-sm text-center py-2">Sem histórico de transições ou férias aprovadas</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* User's own section */}
        {(activeTab === 'my' || !user?.is_admin) && (
        <>
        {balance ? (
          <>
          <div className="grid grid-cols-3 gap-3 md:gap-6 mb-4">
            <div className="glass-effect p-4 md:p-6 rounded-xl">
              <div className="text-gray-400 text-xs md:text-sm mb-1">Dias Acumulados</div>
              <div className="text-2xl md:text-4xl font-bold text-blue-400">{balance.days_earned}</div>
            </div>
            <div className="glass-effect p-4 md:p-6 rounded-xl">
              <div className="text-gray-400 text-xs md:text-sm mb-1">Dias Gozados</div>
              <div className="text-2xl md:text-4xl font-bold text-amber-400">{balance.days_taken}</div>
            </div>
            <div className="glass-effect p-4 md:p-6 rounded-xl">
              <div className="text-gray-400 text-xs md:text-sm mb-1">Dias Disponíveis</div>
              <div className={`text-2xl md:text-4xl font-bold ${balance.days_available < 0 ? 'text-red-400' : 'text-green-400'}`}>{balance.days_available}</div>
            </div>
          </div>
          {balance.year_breakdown && balance.year_breakdown.length > 0 && (
            <div className="glass-effect p-4 md:p-5 rounded-xl mb-6 md:mb-8">
              <div className="text-gray-400 text-xs md:text-sm mb-3">Disponíveis por ano (consumo FIFO — os dias mais antigos são gastos primeiro)</div>
              <div className="flex flex-wrap gap-3">
                {balance.year_breakdown.map((y) => (
                  <div key={y.year} className="bg-[#0f0f0f] rounded-lg px-4 py-3 border border-gray-800 min-w-[120px]" data-testid={`year-card-${y.year}`}>
                    <div className="text-gray-500 text-xs mb-1">{y.year}</div>
                    <div className={`text-xl md:text-2xl font-bold ${y.days_available < 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {y.days_available}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      {y.days_taken}/{y.days_earned} gastos
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>
        ) : (
          <div className="glass-effect p-6 rounded-xl mb-8 border-l-4 border-amber-500">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-amber-500" />
              <div>
                <h3 className="text-white font-semibold mb-2">Configure os seus dados</h3>
                <p className="text-gray-300 text-sm">Por favor, configure a sua data de início na empresa para calcular os dias de férias disponíveis. Em Portugal, acumula 2 dias por mês trabalhado (máximo 22 dias/ano).</p>
              </div>
            </div>
          </div>
        )}

        <div className="glass-effect p-4 md:p-6 rounded-xl">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-4 md:mb-6">
            <h2 className="text-lg md:text-2xl font-semibold text-white">Meus Pedidos</h2>
            <Button
              onClick={() => {
                const next = !showPastYears;
                setShowPastYears(next);
                fetchRequests(next);
              }}
              variant="outline"
              size="sm"
              className={`border-gray-600 ${showPastYears ? 'bg-amber-600/10 text-amber-300 border-amber-600/50' : 'text-gray-300 hover:bg-white/5'}`}
              data-testid="toggle-past-years"
            >
              <History className="w-3.5 h-3.5 mr-1.5" />
              {showPastYears ? 'Esconder anos anteriores' : 'Mostrar anos anteriores'}
            </Button>
          </div>
          {requests.length > 0 ? (
            <div className="space-y-3 md:space-y-4">
              {requests.map((req) => (
                <div key={req.id} className="bg-[#1a1a1a] p-3 md:p-5 rounded-lg">
                  <div className="flex justify-between items-start gap-2 mb-2 md:mb-3">
                    <div className="min-w-0">
                      <div className="text-white font-semibold text-sm md:text-base mb-0.5">{new Date(req.start_date + 'T00:00:00').toLocaleDateString('pt-PT')} até {new Date(req.end_date + 'T00:00:00').toLocaleDateString('pt-PT')}</div>
                      <div className="text-gray-400 text-xs md:text-sm">{req.days_requested} dias</div>
                    </div>
                    {getStatusBadge(req.status)}
                  </div>
                  {req.reason && <div className="text-gray-300 text-xs md:text-sm mt-1">Motivo: {req.reason}</div>}
                  {req.reviewed_by && <div className="text-gray-500 text-xs mt-1">Revisto por: {req.reviewed_by}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8 md:py-12 text-sm">Ainda não fez pedidos de férias</div>
          )}
        </div>
        </>
        )}
      </div>
      <VacationReviewModal
        open={showReviewDialog}
        onOpenChange={setShowReviewDialog}
        onSuccess={() => { fetchBalance(); fetchRequests(showPastYears); if (user?.is_admin) fetchAllBalances(showPastYearsAdmin); }}
      />

      {/* Admin: Editar dias gozados por ano */}
      <Dialog open={showTakenDialog} onOpenChange={(o) => { if (!o) { setShowTakenDialog(false); setTakenDialogUser(null); } }}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Dias Gozados por Ano</DialogTitle>
          </DialogHeader>
          {takenDialogUser && (
            <p className="text-sm text-gray-400">
              <span className="text-white font-medium">{takenDialogUser.full_name || takenDialogUser.username}</span>
              {' · Entrada: '}
              {takenDialogUser.company_start_date
                ? new Date(takenDialogUser.company_start_date + 'T00:00:00').toLocaleDateString('pt-PT')
                : 'N/D'}
            </p>
          )}
          <div className="space-y-3 mt-2">
            {takenLoading ? (
              <p className="text-gray-500 text-sm">A carregar...</p>
            ) : takenYears.length === 0 ? (
              <p className="text-amber-400 text-sm">Sem dados. Configura a data de entrada primeiro.</p>
            ) : (
              <>
                <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 font-medium uppercase tracking-wide px-1">
                  <div className="col-span-2">Ano</div>
                  <div className="col-span-3 text-right">Disponíveis</div>
                  <div className="col-span-3 text-right">Gozados</div>
                  <div className="col-span-4 text-right">Saldo</div>
                </div>
                {takenYears.map((y) => (
                  <div key={y.year} className="grid grid-cols-12 gap-2 items-center bg-[#0f0f0f] p-2 rounded">
                    <div className="col-span-2 text-white font-semibold">{y.year}</div>
                    <div className="col-span-3 text-right">
                      <span className="text-blue-400 font-semibold">{y.days_earned_effective ?? y.days_earned}</span>
                      {y.carry_over_prev > 0 && (
                        <span className="block text-[10px] text-gray-500">
                          {y.days_earned} + {y.carry_over_prev} carry
                        </span>
                      )}
                    </div>
                    <div className="col-span-3 text-right">
                      <Input
                        type="number"
                        min="0"
                        value={y.days_taken_raw ?? y.days_taken ?? 0}
                        onChange={(e) => updateTakenYear(y.year, e.target.value)}
                        className="bg-[#0a0a0a] border-gray-700 text-white h-8 text-sm text-right"
                        data-testid={`taken-input-${y.year}`}
                      />
                      {typeof y.days_taken_auto === 'number' && (
                        <span className="block text-[10px] text-gray-500 mt-0.5">
                          auto: {y.days_taken_auto} (pedidos aprovados)
                        </span>
                      )}
                    </div>
                    <div className={`col-span-4 text-right font-semibold ${y.days_available <= 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {y.days_available}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-500 mt-2">
                  Os dias são consumidos por FIFO — o saldo mais antigo é gasto primeiro. Se o consumo total ultrapassar o total ganho, o último ano fica com saldo negativo (que transita para o ano seguinte). O valor {'"'}auto{'"'} é a contagem de pedidos aprovados nesse ano (menos cancelamentos); o input define um total manual (útil para importar anos pré-sistema). Efectivo = max(manual, auto).
                </p>
              </>
            )}
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Button
              variant="outline"
              onClick={() => { setShowTakenDialog(false); setTakenDialogUser(null); }}
              className="border-gray-600 text-gray-300"
              disabled={takenSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={saveTakenYears}
              disabled={takenSaving || takenLoading || takenYears.length === 0}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="save-taken-btn"
            >
              {takenSaving ? 'A guardar…' : 'Guardar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Vacations;