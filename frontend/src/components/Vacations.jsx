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
import { Calendar, Palmtree, Clock, CheckCircle, XCircle, AlertCircle, RotateCcw } from 'lucide-react';
import VacationReviewModal from './VacationReviewModal';

const Vacations = ({ user, onLogout }) => {
  const { isMobile } = useMobile();
  const [balance, setBalance] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [requestForm, setRequestForm] = useState({ start_date: '', end_date: '', reason: '' });
  const [setupForm, setSetupForm] = useState({ company_start_date: '', vacation_days_taken: 0 });

  useEffect(() => {
    fetchBalance();
    fetchRequests();
  }, []);

  const fetchBalance = async () => {
    try {
      const response = await axios.get(`${API}/vacations/balance`);
      setBalance(response.data);
    } catch (error) {
      console.error('Erro ao carregar saldo');
    }
  };

  const fetchRequests = async () => {
    try {
      const response = await axios.get(`${API}/vacations/my-requests`);
      setRequests(response.data);
    } catch (error) {
      toast.error('Erro ao carregar pedidos');
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
      fetchRequests();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao submeter pedido');
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/vacations/update-start-date?company_start_date=${setupForm.company_start_date}&vacation_days_taken=${setupForm.vacation_days_taken}`);
      toast.success('Dados atualizados!');
      setShowSetupDialog(false);
      fetchBalance();
    } catch (error) {
      toast.error('Erro ao atualizar dados');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { color: 'bg-amber-700 text-amber-200', icon: <Clock className="w-3 h-3" />, text: 'Pendente' },
      approved: { color: 'bg-green-700 text-green-200', icon: <CheckCircle className="w-3 h-3" />, text: 'Aprovado' },
      rejected: { color: 'bg-red-700 text-red-200', icon: <XCircle className="w-3 h-3" />, text: 'Rejeitado' }
    };
    const badge = badges[status];
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
            <Dialog open={showSetupDialog} onOpenChange={setShowSetupDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-gray-700 hover:bg-gray-600 text-white rounded-full text-xs md:text-sm">Configurar</Button>
              </DialogTrigger>
              <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white">
                <DialogHeader><DialogTitle>Configurar Dados</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Data de Início na Empresa</Label>
                    <Input type="date" value={setupForm.company_start_date} onChange={(e) => setSetupForm({...setupForm, company_start_date: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                  </div>
                  <div>
                    <Label>Dias de Férias Já Gozados</Label>
                    <Input type="number" value={setupForm.vacation_days_taken} onChange={(e) => setSetupForm({...setupForm, vacation_days_taken: parseInt(e.target.value)})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                  </div>
                  <Button onClick={handleSetup} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-full">Guardar</Button>
                </div>
              </DialogContent>
            </Dialog>
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

        {balance ? (
          <div className="grid grid-cols-3 gap-3 md:gap-6 mb-6 md:mb-8">
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
          <h2 className="text-lg md:text-2xl font-semibold text-white mb-4 md:mb-6">Meus Pedidos</h2>
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
      </div>
      <VacationReviewModal
        open={showReviewDialog}
        onOpenChange={setShowReviewDialog}
        onSuccess={() => { fetchBalance(); fetchRequests(); }}
      />
    </div>
  );
};

export default Vacations;