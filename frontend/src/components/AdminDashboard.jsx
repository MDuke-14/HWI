import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Shield, Users, Calendar, TrendingUp, CheckCircle, XCircle, Plus, Edit, Trash2, Download, Clock, Minus, FileText, History as HistoryIcon, RefreshCw, ChevronLeft, ChevronRight, DollarSign, Bell, AlertTriangle, Play, BellRing } from 'lucide-react';

const AdminDashboard = ({ user, onLogout }) => {
  const [users, setUsers] = useState([]);
  const [pendingVacations, setPendingVacations] = useState([]);
  const [allAbsences, setAllAbsences] = useState([]);
  const [reports, setReports] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userEntries, setUserEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [verifyingUser, setVerifyingUser] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyMonth, setVerifyMonth] = useState(new Date().getMonth() + 1);
  const [verifyYear, setVerifyYear] = useState(new Date().getFullYear());
  
  // Estados para seleção de mês no Relatório Consolidado
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());

  // Estados para Tarifas
  const [tarifas, setTarifas] = useState([]);
  const [showTarifaDialog, setShowTarifaDialog] = useState(false);
  const [editingTarifa, setEditingTarifa] = useState(null);
  const [tarifaForm, setTarifaForm] = useState({
    nome: '',
    valor_por_hora: '',
    codigo: ''  // "1", "2", "S", "D" ou vazio para todos
  });

  // Estados para Notificações e Autorizações
  const [overtimeAuthorizations, setOvertimeAuthorizations] = useState([]);
  const [notificationLogs, setNotificationLogs] = useState([]);
  const [authStatusFilter, setAuthStatusFilter] = useState('all');
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [runningCheck, setRunningCheck] = useState(null);

  const [createForm, setCreateForm] = useState({
    username: '',
    email: '',
    phone: '',
    full_name: '',
    password: '',
    company_start_date: '',
    vacation_days_taken: 0
  });
  const [editForm, setEditForm] = useState({
    username: '',
    email: '',
    phone: '',
    full_name: '',
    password: '',
    is_admin: false
  });
  const [showManualEntryDialog, setShowManualEntryDialog] = useState(false);
  const [manualEntryForm, setManualEntryForm] = useState({
    user_id: '',
    date: '',
    time_entries: [{ start_time: '', end_time: '' }],
    observations: '',
    outside_residence_zone: false,
    location_description: ''
  });

  useEffect(() => {
    fetchUsers();
    fetchPendingVacations();
    fetchAllAbsences();
    fetchReports();
    fetchTarifas();
    fetchOvertimeAuthorizations();
    fetchNotificationLogs();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API}/admin/users`);
      setUsers(response.data);
    } catch (error) {
      toast.error('Erro ao carregar utilizadores');
    }
  };

  const fetchPendingVacations = async () => {
    try {
      const response = await axios.get(`${API}/admin/vacations/pending`);
      setPendingVacations(response.data);
    } catch (error) {
      console.error('Erro ao carregar férias pendentes');
    }
  };

  const fetchReports = async (month = null, year = null) => {
    try {
      const m = month || reportMonth;
      const y = year || reportYear;
      const response = await axios.get(`${API}/admin/reports/all?month=${m}&year=${y}`);
      setReports(response.data);
    } catch (error) {
      console.error('Erro ao carregar relatórios');
    }
  };

  const fetchUserEntries = async (userId) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/admin/user/${userId}/time-entries`);
      setUserEntries(response.data);
      setSelectedUser(userId);
    } catch (error) {
      toast.error('Erro ao carregar registos');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllAbsences = async () => {
    try {
      const response = await axios.get(`${API}/admin/absences/all`);
      setAllAbsences(response.data);
    } catch (error) {
      console.error('Erro ao carregar faltas');
    }
  };

  // ============ Tarifas Functions ============
  const fetchTarifas = async () => {
    try {
      const response = await axios.get(`${API}/tarifas/all`);
      setTarifas(response.data);
    } catch (error) {
      console.error('Erro ao carregar tarifas');
    }
  };

  // Funções para Notificações e Autorizações
  const fetchOvertimeAuthorizations = async (status = null) => {
    try {
      setLoadingNotifications(true);
      const url = status && status !== 'all' 
        ? `${API}/overtime/authorizations?status=${status}`
        : `${API}/overtime/authorizations`;
      const response = await axios.get(url);
      setOvertimeAuthorizations(response.data);
    } catch (error) {
      console.error('Erro ao carregar autorizações');
    } finally {
      setLoadingNotifications(false);
    }
  };

  const fetchNotificationLogs = async () => {
    try {
      const response = await axios.get(`${API}/notifications/logs?limit=50`);
      setNotificationLogs(response.data);
    } catch (error) {
      console.error('Erro ao carregar logs de notificações');
    }
  };

  const handleRunClockInCheck = async () => {
    setRunningCheck('clock_in');
    try {
      const response = await axios.post(`${API}/notifications/check-clock-in`);
      const data = response.data;
      if (data.status === 'completed') {
        toast.success(`Verificação concluída: ${data.notified_count} utilizadores notificados`);
      } else {
        toast.info(`Verificação ignorada: ${data.reason}`);
      }
      fetchNotificationLogs();
    } catch (error) {
      toast.error('Erro ao executar verificação');
    } finally {
      setRunningCheck(null);
    }
  };

  const handleRunClockOutCheck = async () => {
    setRunningCheck('clock_out');
    try {
      const response = await axios.post(`${API}/notifications/check-clock-out`);
      const data = response.data;
      if (data.status === 'completed') {
        toast.success(`Verificação concluída: ${data.notified_count} utilizadores notificados`);
      } else {
        toast.info(`Verificação ignorada: ${data.reason}`);
      }
      fetchOvertimeAuthorizations();
      fetchNotificationLogs();
    } catch (error) {
      toast.error('Erro ao executar verificação');
    } finally {
      setRunningCheck(null);
    }
  };

  const handleDecideAuthorization = async (token, action) => {
    try {
      const response = await axios.post(`${API}/overtime/authorization/${token}/decide`, { action });
      if (response.data.status === 'success') {
        toast.success(response.data.message);
        fetchOvertimeAuthorizations(authStatusFilter);
      } else {
        toast.error(response.data.message || 'Erro ao processar decisão');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao processar decisão');
    }
  };

  const handleOpenTarifaDialog = (tarifa = null) => {
    if (tarifa) {
      setEditingTarifa(tarifa);
      setTarifaForm({
        nome: tarifa.nome,
        valor_por_hora: tarifa.valor_por_hora.toString(),
        codigo: tarifa.codigo || ''
      });
    } else {
      setEditingTarifa(null);
      setTarifaForm({
        nome: '',
        valor_por_hora: '',
        codigo: ''
      });
    }
    setShowTarifaDialog(true);
  };

  const handleSaveTarifa = async () => {
    if (!tarifaForm.nome || !tarifaForm.valor_por_hora) {
      toast.error('Preencha todos os campos');
      return;
    }

    setLoading(true);
    try {
      const data = {
        nome: tarifaForm.nome,
        valor_por_hora: parseFloat(tarifaForm.valor_por_hora),
        codigo: tarifaForm.codigo || null  // null se vazio
      };

      if (editingTarifa) {
        await axios.put(`${API}/tarifas/${editingTarifa.id}`, data);
        toast.success('Tarifa atualizada!');
      } else {
        await axios.post(`${API}/tarifas`, data);
        toast.success('Tarifa criada!');
      }
      
      setShowTarifaDialog(false);
      setTarifaForm({ nome: '', valor_por_hora: '', codigo: '' });
      setEditingTarifa(null);
      fetchTarifas();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao guardar tarifa');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTarifa = async (tarifaId, tarifaNome) => {
    if (!window.confirm(`Tem certeza que deseja desativar a tarifa "${tarifaNome}"?`)) return;
    
    try {
      await axios.delete(`${API}/tarifas/${tarifaId}`);
      toast.success('Tarifa desativada!');
      fetchTarifas();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao desativar tarifa');
    }
  };

  const handleVacationApproval = async (requestId, approved) => {
    try {
      await axios.post(`${API}/admin/vacations/${requestId}/approve?approved=${approved}`);
      toast.success(approved ? 'Férias aprovadas!' : 'Férias rejeitadas');
      fetchPendingVacations();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao processar');
    }
  };

  const handleAbsenceReview = async (absenceId, approved) => {
    try {
      await axios.post(`${API}/admin/absences/${absenceId}/review?approved=${approved}`);
      toast.success(approved ? 'Falta aprovada!' : 'Falta rejeitada');
      fetchAllAbsences();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao processar');
    }
  };

  const handleCreateUser = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/admin/users/create`, createForm);
      toast.success('Utilizador criado com sucesso!');
      setShowCreateDialog(false);
      setCreateForm({ username: '', email: '', phone: '', full_name: '', password: '', company_start_date: '', vacation_days_taken: 0 });
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao criar utilizador');
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setEditForm({
      username: user.username,
      email: user.email,
      phone: user.phone || '',
      full_name: user.full_name || '',
      password: '',
      is_admin: user.is_admin || false
    });
    setShowEditDialog(true);
  };

  const handleUpdateUser = async () => {
    setLoading(true);
    try {
      const updateData = { ...editForm };
      if (!updateData.password) delete updateData.password;
      
      await axios.put(`${API}/admin/users/${editingUser.id}`, updateData);
      toast.success('Utilizador atualizado!');
      setShowEditDialog(false);
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao atualizar');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Tem certeza que deseja eliminar o utilizador ${username}? Todos os seus dados serão perdidos!`)) return;
    
    try {
      await axios.delete(`${API}/admin/users/${userId}`);
      toast.success('Utilizador eliminado!');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao eliminar');
    }
  };


  const handleVerifyHours = async (user, customMonth = null, customYear = null) => {
    setVerifyingUser(user);
    
    // Se não especificou mês/ano customizado, mostrar o modal para escolher
    if (customMonth === null || customYear === null) {
      setVerifyResult(null);
      setShowVerifyDialog(true);
      return;
    }
    
    setVerifying(true);

    try {
      const url = `${API}/admin/users/${user.id}/recalculate-hours?month=${customMonth}&year=${customYear}`;
      const response = await axios.post(url);
      setVerifyResult(response.data);
      
      if (response.data.entries_updated > 0) {
        toast.success(`${response.data.entries_updated} entrada(s) atualizada(s)!`);
      } else {
        toast.success('Todas as horas estão corretas!');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao verificar horas');
    } finally {
      setVerifying(false);
    }
  };

  const runVerification = () => {
    handleVerifyHours(verifyingUser, verifyMonth, verifyYear);
  };


  const handleCreateManualEntry = async () => {
    setLoading(true);
    try {
      if (!manualEntryForm.user_id || !manualEntryForm.date || manualEntryForm.time_entries.length === 0) {
        toast.error('Preencha todos os campos obrigatórios');
        setLoading(false);
        return;
      }
      
      // Validate all time entries
      for (let i = 0; i < manualEntryForm.time_entries.length; i++) {
        const entry = manualEntryForm.time_entries[i];
        if (!entry.start_time || !entry.end_time) {
          toast.error(`Entrada ${i+1}: preencha início e fim`);
          setLoading(false);
          return;
        }
      }
      
      await axios.post(`${API}/admin/time-entries/manual`, manualEntryForm);
      toast.success('Entrada(s) adicionada(s) com sucesso!');
      setShowManualEntryDialog(false);
      setManualEntryForm({
        user_id: '',
        date: '',
        time_entries: [{ start_time: '', end_time: '' }],
        observations: '',
        outside_residence_zone: false,
        location_description: ''
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao adicionar entrada');
    } finally {
      setLoading(false);
    }
  };

  const addTimeEntry = () => {
    setManualEntryForm({
      ...manualEntryForm,
      time_entries: [...manualEntryForm.time_entries, { start_time: '', end_time: '' }]
    });
  };

  const removeTimeEntry = (index) => {
    if (manualEntryForm.time_entries.length > 1) {
      const newEntries = manualEntryForm.time_entries.filter((_, i) => i !== index);
      setManualEntryForm({
        ...manualEntryForm,
        time_entries: newEntries
      });
    }
  };

  const updateTimeEntry = (index, field, value) => {
    const newEntries = [...manualEntryForm.time_entries];
    newEntries[index][field] = value;
    setManualEntryForm({
      ...manualEntryForm,
      time_entries: newEntries
    });
  };

  const handleDeleteDayEntries = async () => {
    if (!manualEntryForm.user_id || !manualEntryForm.date) {
      toast.error('Selecione utilizador e data primeiro');
      return;
    }
    
    if (!window.confirm('Tem certeza que deseja eliminar TODAS as entradas deste dia?')) {
      return;
    }
    
    setLoading(true);
    try {
      const response = await axios.delete(`${API}/admin/time-entries/date/${manualEntryForm.user_id}/${manualEntryForm.date}`);
      toast.success(response.data.message || 'Entradas eliminadas com sucesso!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao eliminar entradas');
    } finally {
      setLoading(false);
    }
  };

  // handleImportExcel function removed

  const downloadJustificationFile = async (filename) => {
    try {
      const response = await axios.get(`${API}/absences/file/${filename}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Ficheiro descarregado com sucesso!');
    } catch (error) {
      toast.error('Erro ao descarregar ficheiro');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navigation user={user} onLogout={onLogout} activePage="admin" />
      <div className="container mx-auto px-4 py-8 max-w-7xl fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-red-500 to-pink-600 p-3 rounded-xl"><Shield className="w-8 h-8 text-white" /></div>
            <h1 className="text-4xl font-bold text-white">Painel de Administração</h1>
          </div>
          
          {/* Quick Access Button */}
          <Button
            onClick={() => window.location.href = '/admin/time-entries'}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Clock className="w-5 h-5 mr-2" />
            Gestão de Entradas
          </Button>
        </div>

        <Tabs defaultValue="vacations" className="w-full">
          <div className="overflow-x-auto pb-2 mb-6 -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList className="inline-flex min-w-max gap-1 bg-[#1a1a1a] p-1 rounded-lg md:grid md:grid-cols-6 md:w-full md:max-w-5xl md:mx-auto">
              <TabsTrigger value="vacations" className="whitespace-nowrap px-3 py-2 text-sm data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400"><Calendar className="w-4 h-4 mr-1.5 flex-shrink-0" /><span>Férias</span></TabsTrigger>
              <TabsTrigger value="absences" className="whitespace-nowrap px-3 py-2 text-sm data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400"><Users className="w-4 h-4 mr-1.5 flex-shrink-0" /><span>Faltas</span></TabsTrigger>
              <TabsTrigger value="users" className="whitespace-nowrap px-3 py-2 text-sm data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400"><Users className="w-4 h-4 mr-1.5 flex-shrink-0" /><span>Utilizadores</span></TabsTrigger>
              <TabsTrigger value="notifications" className="whitespace-nowrap px-3 py-2 text-sm data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400 relative">
                <Bell className="w-4 h-4 mr-1.5 flex-shrink-0" /><span>Notificações</span>
                {overtimeAuthorizations.filter(a => a.status === 'pending').length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {overtimeAuthorizations.filter(a => a.status === 'pending').length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="tarifas" className="whitespace-nowrap px-3 py-2 text-sm data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400"><DollarSign className="w-4 h-4 mr-1.5 flex-shrink-0" /><span>Tarifas</span></TabsTrigger>
              <TabsTrigger value="reports" className="whitespace-nowrap px-3 py-2 text-sm data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400"><TrendingUp className="w-4 h-4 mr-1.5 flex-shrink-0" /><span>Relatórios</span></TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="vacations">
            <div className="glass-effect p-6 rounded-xl">
              <h2 className="text-2xl font-semibold text-white mb-6">Pedidos Pendentes ({pendingVacations.length})</h2>
              {pendingVacations.length > 0 ? (
                <div className="space-y-4">
                  {pendingVacations.map((req) => (
                    <div key={req.id} className="bg-[#1a1a1a] p-5 rounded-lg">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="text-white font-semibold text-lg">{req.username}</div>
                          <div className="text-gray-400 text-sm">{new Date(req.start_date + 'T00:00:00').toLocaleDateString('pt-PT')} até {new Date(req.end_date + 'T00:00:00').toLocaleDateString('pt-PT')}</div>
                          <div className="text-amber-400 font-semibold mt-1">{req.days_requested} dias</div>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={() => handleVacationApproval(req.id, true)} className="bg-green-600 hover:bg-green-700 text-white rounded-full"><CheckCircle className="w-4 h-4 mr-1" />Aprovar</Button>
                          <Button onClick={() => handleVacationApproval(req.id, false)} className="bg-red-600 hover:bg-red-700 text-white rounded-full"><XCircle className="w-4 h-4 mr-1" />Rejeitar</Button>
                        </div>
                      </div>
                      {req.reason && <div className="text-gray-300 text-sm mt-2 pt-2 border-t border-gray-700">Motivo: {req.reason}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-12">Não há pedidos pendentes</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="absences">
            <div className="glass-effect p-6 rounded-xl">
              <h2 className="text-2xl font-semibold text-white mb-6">Todas as Faltas ({allAbsences.length})</h2>
              {allAbsences.length > 0 ? (
                <div className="space-y-4">
                  {allAbsences.map((absence) => (
                    <div key={absence.id} className="bg-[#1a1a1a] p-5 rounded-lg">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <div className="text-white font-semibold text-lg">{absence.username}</div>
                          <div className="text-gray-400 text-sm">{new Date(absence.date + 'T00:00:00').toLocaleDateString('pt-PT')}</div>
                          <div className="text-amber-400 font-semibold mt-1">{absence.hours}h - {absence.is_justified ? 'Justificada' : 'Injustificada'}</div>
                          {absence.reason && <div className="text-gray-300 text-sm mt-1">Motivo: {absence.reason}</div>}
                          {absence.justification_file && (
                            <div className="mt-2">
                              <Button 
                                onClick={() => downloadJustificationFile(absence.justification_file)}
                                className="bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs"
                                size="sm"
                              >
                                <Download className="w-3 h-3 mr-1" />
                                Ver Justificação
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            absence.status === 'approved' ? 'bg-green-700 text-green-200' :
                            absence.status === 'rejected' ? 'bg-red-700 text-red-200' :
                            'bg-amber-700 text-amber-200'
                          }`}>
                            {absence.status === 'approved' ? 'Aprovado' : absence.status === 'rejected' ? 'Rejeitado' : 'Pendente'}
                          </span>
                          {absence.status === 'pending' && (
                            <div className="flex gap-2">
                              <Button onClick={() => handleAbsenceReview(absence.id, true)} className="bg-green-600 hover:bg-green-700 text-white rounded-full text-xs" size="sm">
                                <CheckCircle className="w-3 h-3 mr-1" />Aprovar
                              </Button>
                              <Button onClick={() => handleAbsenceReview(absence.id, false)} className="bg-red-600 hover:bg-red-700 text-white rounded-full text-xs" size="sm">
                                <XCircle className="w-3 h-3 mr-1" />Rejeitar
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                      {absence.reviewed_by && <div className="text-gray-500 text-xs mt-2 pt-2 border-t border-gray-700">Revisto por: {absence.reviewed_by}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-12">Não há faltas registadas</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="users">
            <div className="glass-effect p-6 rounded-xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-white">Utilizadores ({users.length})</h2>
                <div className="flex gap-3">
                  <Dialog open={showManualEntryDialog} onOpenChange={setShowManualEntryDialog}>
                    <DialogTrigger asChild>
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full">
                        <Clock className="w-4 h-4 mr-2" />Adicionar Entrada
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
                      <DialogHeader><DialogTitle>Adicionar Entrada Manual</DialogTitle></DialogHeader>
                      <div className="space-y-3 mt-4">
                        <div>
                          <Label>Utilizador</Label>
                          <select
                            value={manualEntryForm.user_id}
                            onChange={(e) => setManualEntryForm({...manualEntryForm, user_id: e.target.value})}
                            className="w-full bg-[#0a0a0a] border border-gray-700 text-white rounded-md px-3 py-2"
                          >
                            <option value="">Selecione um utilizador</option>
                            {users.map(u => (
                              <option key={u.id} value={u.id}>{u.username} - {u.full_name || u.email}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label>Data</Label>
                          <Input
                            type="date"
                            value={manualEntryForm.date}
                            onChange={(e) => setManualEntryForm({...manualEntryForm, date: e.target.value})}
                            className="bg-[#0a0a0a] border-gray-700 text-white"
                          />
                        </div>
                        
                        {/* Multiple Time Entries */}
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <Label>Horários de Trabalho</Label>
                            <Button
                              type="button"
                              onClick={addTimeEntry}
                              className="bg-green-600 hover:bg-green-700 text-white rounded-full text-xs"
                              size="sm"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Adicionar Período
                            </Button>
                          </div>
                          
                          {manualEntryForm.time_entries.map((entry, index) => (
                            <div key={index} className="bg-[#0a0a0a] p-3 rounded-lg space-y-2">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-xs text-gray-400">Período {index + 1}</span>
                                {manualEntryForm.time_entries.length > 1 && (
                                  <Button
                                    type="button"
                                    onClick={() => removeTimeEntry(index)}
                                    className="bg-red-600 hover:bg-red-700 text-white rounded-full text-xs"
                                    size="sm"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs">Início</Label>
                                  <Input
                                    type="time"
                                    value={entry.start_time}
                                    onChange={(e) => updateTimeEntry(index, 'start_time', e.target.value)}
                                    className="bg-[#0a0a0a] border-gray-700 text-white"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Fim</Label>
                                  <Input
                                    type="time"
                                    value={entry.end_time}
                                    onChange={(e) => updateTimeEntry(index, 'end_time', e.target.value)}
                                    className="bg-[#0a0a0a] border-gray-700 text-white"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div>
                          <Label>Observações (opcional)</Label>
                          <Input
                            value={manualEntryForm.observations}
                            onChange={(e) => setManualEntryForm({...manualEntryForm, observations: e.target.value})}
                            className="bg-[#0a0a0a] border-gray-700 text-white"
                            placeholder="Entrada manual pelo admin"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={manualEntryForm.outside_residence_zone}
                            onCheckedChange={(checked) => setManualEntryForm({...manualEntryForm, outside_residence_zone: checked})}
                          />
                          <Label>Fora de Zona de Residência</Label>
                        </div>
                        {manualEntryForm.outside_residence_zone && (
                          <div>
                            <Label>Localização</Label>
                            <Input
                              value={manualEntryForm.location_description}
                              onChange={(e) => setManualEntryForm({...manualEntryForm, location_description: e.target.value})}
                              className="bg-[#0a0a0a] border-gray-700 text-white"
                              placeholder="Ex: Madrid, Espanha"
                            />
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button 
                            onClick={handleDeleteDayEntries} 
                            disabled={loading || !manualEntryForm.user_id || !manualEntryForm.date} 
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-full"
                          >
                            🗑️ Limpar Dia
                          </Button>
                          <Button 
                            onClick={handleCreateManualEntry} 
                            disabled={loading} 
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-full"
                          >
                            {loading ? 'A adicionar...' : 'Adicionar Entrada'}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  
                  <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                    <DialogTrigger asChild>
                      <Button className="bg-green-600 hover:bg-green-700 text-white rounded-full">
                        <Plus className="w-4 h-4 mr-2" />Criar Utilizador
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
                    <DialogHeader><DialogTitle>Criar Novo Utilizador</DialogTitle></DialogHeader>
                    <div className="space-y-3 mt-4">
                      <div>
                        <Label>Username</Label>
                        <Input value={createForm.username} onChange={(e) => setCreateForm({...createForm, username: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                      </div>
                      <div>
                        <Label>Email</Label>
                        <Input type="email" value={createForm.email} onChange={(e) => setCreateForm({...createForm, email: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                      </div>
                      <div>
                        <Label>Contacto Telefónico</Label>
                        <Input type="tel" placeholder="+351 912 345 678" value={createForm.phone} onChange={(e) => setCreateForm({...createForm, phone: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                      </div>
                      <div>
                        <Label>Nome Completo</Label>
                        <Input value={createForm.full_name} onChange={(e) => setCreateForm({...createForm, full_name: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                      </div>
                      <div>
                        <Label>Password</Label>
                        <Input type="password" value={createForm.password} onChange={(e) => setCreateForm({...createForm, password: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                      </div>
                      <Button onClick={handleCreateUser} disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white rounded-full">
                        {loading ? 'A criar...' : 'Criar Utilizador'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                {users.map((u) => (
                  <div key={u.id} className="bg-[#1a1a1a] p-4 rounded-lg">
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${u.is_admin ? 'bg-gradient-to-br from-red-500 to-pink-600' : 'bg-gradient-to-br from-blue-500 to-purple-600'}`}>
                        <span className="text-white font-bold text-lg">{u.username.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-semibold">{u.username}{u.is_admin && <span className="ml-2 text-xs bg-red-600 px-2 py-1 rounded">ADMIN</span>}</div>
                        <div className="text-gray-400 text-sm">{u.email}</div>
                        {u.phone && <div className="text-gray-500 text-xs">📞 {u.phone}</div>}
                        {u.full_name && <div className="text-gray-500 text-xs">{u.full_name}</div>}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button 
                        onClick={() => handleVerifyHours(u)}
                        className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-full text-sm" 
                        size="sm"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />Verificar Horas
                      </Button>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button onClick={() => handleEditUser(u)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-sm" size="sm">
                        <Edit className="w-3 h-3 mr-1" />Editar
                      </Button>
                      <Button onClick={() => handleDeleteUser(u.id, u.username)} className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-full text-sm" size="sm">
                        <Trash2 className="w-3 h-3 mr-1" />Eliminar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            

            {/* Verify Hours Dialog */}
            <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
              <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-yellow-400" />
                    Verificação de Horas - {verifyingUser?.full_name || verifyingUser?.username}
                  </DialogTitle>
                </DialogHeader>

                <div className="mt-4">
                  {!verifyResult ? (
                    // Seletor de período ANTES de iniciar verificação
                    <div className="space-y-4">
                      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                        <h4 className="text-yellow-400 font-semibold mb-2">⚠️ Importante</h4>
                        <p className="text-gray-300 text-sm">
                          Selecione o <strong>mês de faturação</strong> que deseja verificar.
                        </p>
                        <p className="text-gray-400 text-xs mt-2">
                          O período de faturação vai do dia 26 do mês anterior até o dia 25 do mês selecionado.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-gray-300 mb-2 block">Mês de Faturação</Label>
                          <select
                            value={verifyMonth}
                            onChange={(e) => setVerifyMonth(parseInt(e.target.value))}
                            className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2"
                          >
                            <option value="1">Janeiro</option>
                            <option value="2">Fevereiro</option>
                            <option value="3">Março</option>
                            <option value="4">Abril</option>
                            <option value="5">Maio</option>
                            <option value="6">Junho</option>
                            <option value="7">Julho</option>
                            <option value="8">Agosto</option>
                            <option value="9">Setembro</option>
                            <option value="10">Outubro</option>
                            <option value="11">Novembro</option>
                            <option value="12">Dezembro</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-gray-300 mb-2 block">Ano</Label>
                          <Input
                            type="number"
                            value={verifyYear}
                            onChange={(e) => setVerifyYear(parseInt(e.target.value))}
                            className="bg-[#0f0f0f] border-gray-700 text-white"
                            min="2020"
                            max="2030"
                          />
                        </div>
                      </div>

                      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                        <p className="text-sm text-blue-300">
                          <strong>Período a verificar:</strong> 26/{verifyMonth === 1 ? 12 : verifyMonth - 1}/{verifyMonth === 1 ? verifyYear - 1 : verifyYear} até 25/{verifyMonth}/{verifyYear}
                        </p>
                      </div>

                      <div className="flex gap-3 pt-4">
                        <Button
                          onClick={() => setShowVerifyDialog(false)}
                          variant="outline"
                          className="flex-1 border-gray-600"
                        >
                          Cancelar
                        </Button>
                        <Button
                          onClick={runVerification}
                          className="flex-1 bg-yellow-600 hover:bg-yellow-700"
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Iniciar Verificação
                        </Button>
                      </div>
                    </div>
                  ) : verifying ? (
                    <div className="text-center py-8">
                      <RefreshCw className="w-12 h-12 text-yellow-400 mx-auto mb-4 animate-spin" />
                      <p className="text-gray-400">Verificando e recalculando horas...</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Período */}
                      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                        <h4 className="text-blue-400 font-semibold mb-2">Período Verificado</h4>
                        <p className="text-gray-300 text-sm">
                          {new Date(verifyResult.period.start).toLocaleDateString('pt-PT')} até{' '}
                          {new Date(verifyResult.period.end).toLocaleDateString('pt-PT')}
                        </p>
                        <p className="text-gray-400 text-xs mt-1">
                          Mês de faturação: {verifyResult.period.month}/{verifyResult.period.year}
                        </p>
                      </div>

                      {/* Totais */}
                      <div className="bg-[#0f0f0f] rounded-lg p-4 border border-gray-700">
                        <h4 className="text-white font-semibold mb-3">Resumo de Horas</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-gray-500">Horas Normais</p>
                            <p className="text-xl text-white font-semibold">{verifyResult.totals.regular_hours}h</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Horas Extras (Dias Úteis)</p>
                            <p className="text-xl text-yellow-400 font-semibold">{verifyResult.totals.overtime_hours}h</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Horas Especiais (Fins de Semana/Feriados)</p>
                            <p className="text-xl text-purple-400 font-semibold">{verifyResult.totals.special_hours}h</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Total de Horas</p>
                            <p className="text-xl text-green-400 font-semibold">{verifyResult.totals.total_hours}h</p>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-700">
                          <p className="text-xs text-gray-500">Dias Trabalhados</p>
                          <p className="text-lg text-white">{verifyResult.totals.days_worked} dias</p>
                        </div>
                      </div>

                      {/* Estatísticas */}
                      <div className="bg-[#0f0f0f] rounded-lg p-4 border border-gray-700">
                        <h4 className="text-white font-semibold mb-3">Estatísticas da Verificação</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Entradas verificadas:</span>
                            <span className="text-white font-semibold">{verifyResult.entries_checked}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Entradas atualizadas:</span>
                            <span className={`font-semibold ${verifyResult.entries_updated > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                              {verifyResult.entries_updated}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Problemas encontrados:</span>
                            <span className={`font-semibold ${verifyResult.issues_found.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                              {verifyResult.issues_found.length}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Issues encontrados */}
                      {verifyResult.issues_found.length > 0 && (
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                          <h4 className="text-yellow-400 font-semibold mb-3">Problemas Corrigidos</h4>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {verifyResult.issues_found.map((issue, idx) => (
                              <div key={idx} className="text-sm bg-black/30 p-2 rounded">
                                <p className="text-white">
                                  <span className="text-yellow-400">📅 {new Date(issue.date).toLocaleDateString('pt-PT')}</span>
                                  {' - '}{issue.issue}
                                </p>
                                <p className="text-gray-400 text-xs">
                                  Ação: {issue.action} ({issue.hours}h)
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Botões */}
                      <div className="flex gap-3 pt-4">
                        <Button
                          onClick={() => {
                            setVerifyResult(null);
                            setVerifyMonth(new Date().getMonth() + 1);
                            setVerifyYear(new Date().getFullYear());
                          }}
                          variant="outline"
                          className="border-gray-600"
                        >
                          Verificar Outro Período
                        </Button>
                        <Button
                          onClick={() => setShowVerifyDialog(false)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          Fechar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Edit User Dialog */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
              <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
                <DialogHeader><DialogTitle>Editar Utilizador</DialogTitle></DialogHeader>
                {editingUser && (
                  <div className="space-y-3 mt-4">
                    <div>
                      <Label>Username</Label>
                      <Input value={editForm.username} onChange={(e) => setEditForm({...editForm, username: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input type="email" value={editForm.email} onChange={(e) => setEditForm({...editForm, email: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                    </div>
                    <div>
                      <Label>Contacto Telefónico</Label>
                      <Input type="tel" placeholder="+351 912 345 678" value={editForm.phone} onChange={(e) => setEditForm({...editForm, phone: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                    </div>
                    <div>
                      <Label>Nome Completo</Label>
                      <Input value={editForm.full_name} onChange={(e) => setEditForm({...editForm, full_name: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                    </div>
                    <div>
                      <Label>Nova Password (deixar vazio para não alterar)</Label>
                      <Input type="password" value={editForm.password} onChange={(e) => setEditForm({...editForm, password: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" placeholder="Deixar vazio para não alterar" />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-[#0a0a0a] rounded-lg">
                      <Label className="cursor-pointer">Privilégios de Admin</Label>
                      <Switch checked={editForm.is_admin} onCheckedChange={(checked) => setEditForm({...editForm, is_admin: checked})} />
                    </div>
                    <Button onClick={handleUpdateUser} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-full">
                      {loading ? 'A atualizar...' : 'Atualizar Utilizador'}
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            {selectedUser && userEntries.length > 0 && (
              <div className="glass-effect p-6 rounded-xl mt-6">
                <h3 className="text-xl font-semibold text-white mb-4">Registos do Utilizador ({userEntries.length})</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {userEntries.map((entry) => (
                    <div key={entry.id} className="bg-[#1a1a1a] p-4 rounded-lg text-sm">
                      <div className="flex justify-between text-white">
                        <span>{entry.date}</span>
                        <span className="font-bold text-green-400">{entry.total_hours}h</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Notificações Tab Content */}
          <TabsContent value="notifications">
            <div className="space-y-6">
              {/* Verificações Manuais */}
              <div className="glass-effect p-6 rounded-xl">
                <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                  <Play className="w-6 h-6 text-blue-400" />
                  Verificações Manuais
                </h2>
                <p className="text-gray-400 mb-4">
                  As verificações automáticas executam às 09:30 (entrada) e 18:15 (saída) em dias úteis.
                  Use os botões abaixo para executar manualmente.
                </p>
                <div className="flex gap-4 flex-wrap">
                  <Button
                    onClick={handleRunClockInCheck}
                    disabled={runningCheck !== null}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    {runningCheck === 'clock_in' ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Clock className="w-4 h-4 mr-2" />
                    )}
                    Verificar Entradas (09:30)
                  </Button>
                  <Button
                    onClick={handleRunClockOutCheck}
                    disabled={runningCheck !== null}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {runningCheck === 'clock_out' ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Clock className="w-4 h-4 mr-2" />
                    )}
                    Verificar Saídas (18:15)
                  </Button>
                  <Button
                    onClick={() => {
                      fetchOvertimeAuthorizations(authStatusFilter);
                      fetchNotificationLogs();
                    }}
                    variant="outline"
                    className="border-gray-600"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Atualizar Dados
                  </Button>
                </div>
              </div>

              {/* Teste de Notificações Push */}
              <div className="glass-effect p-6 rounded-xl">
                <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                  <BellRing className="w-6 h-6 text-green-400" />
                  Testar Notificações Push
                </h2>
                <p className="text-gray-400 mb-4">
                  Teste as notificações push no seu dispositivo. Certifique-se de que ativou as notificações no sino.
                </p>
                <div className="flex gap-4 flex-wrap">
                  <Button
                    onClick={async () => {
                      try {
                        await axios.post(`${API}/notifications/test-push`);
                        toast.success('Notificação de teste enviada!');
                      } catch (error) {
                        toast.error('Erro ao enviar. Ative as notificações push primeiro.');
                      }
                    }}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Bell className="w-4 h-4 mr-2" />
                    Teste Simples
                  </Button>
                  <Button
                    onClick={async () => {
                      try {
                        await axios.post(`${API}/notifications/test-clock-in-reminder`);
                        toast.success('Notificação de lembrete de entrada enviada!');
                      } catch (error) {
                        toast.error('Erro ao enviar notificação');
                      }
                    }}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Testar "Não Iniciou Ponto"
                  </Button>
                  <Button
                    onClick={async () => {
                      try {
                        await axios.post(`${API}/notifications/test-clock-out-reminder`);
                        toast.success('Notificação de lembrete de saída enviada!');
                      } catch (error) {
                        toast.error('Erro ao enviar notificação');
                      }
                    }}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Testar "Não Parou Ponto"
                  </Button>
                  <Button
                    onClick={async () => {
                      try {
                        const response = await axios.post(`${API}/notifications/test-overtime-admin`);
                        toast.success(response.data.message);
                      } catch (error) {
                        toast.error('Erro ao enviar notificação');
                      }
                    }}
                    className="bg-yellow-600 hover:bg-yellow-700"
                  >
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Testar "Pedido Horas Extra"
                  </Button>
                </div>
              </div>

              {/* Autorizações de Horas Extra */}
              <div className="glass-effect p-6 rounded-xl">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
                    <AlertTriangle className="w-6 h-6 text-yellow-400" />
                    Autorizações de Horas Extra
                    {overtimeAuthorizations.filter(a => a.status === 'pending').length > 0 && (
                      <span className="bg-red-500 text-white text-sm px-2 py-1 rounded-full ml-2">
                        {overtimeAuthorizations.filter(a => a.status === 'pending').length} pendentes
                      </span>
                    )}
                  </h2>
                  <Select value={authStatusFilter} onValueChange={(value) => {
                    setAuthStatusFilter(value);
                    fetchOvertimeAuthorizations(value);
                  }}>
                    <SelectTrigger className="w-40 bg-[#1a1a1a] border-gray-700 text-white">
                      <SelectValue placeholder="Filtrar" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-gray-700">
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pending">Pendentes</SelectItem>
                      <SelectItem value="approved">Aprovados</SelectItem>
                      <SelectItem value="rejected">Rejeitados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {loadingNotifications ? (
                  <div className="text-center py-8">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-2" />
                    <p className="text-gray-400">A carregar...</p>
                  </div>
                ) : overtimeAuthorizations.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-2" />
                    <p className="text-gray-400">Nenhuma autorização {authStatusFilter !== 'all' ? authStatusFilter : ''}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {overtimeAuthorizations.map((auth) => (
                      <div
                        key={auth.id}
                        className={`p-4 rounded-lg border ${
                          auth.status === 'pending' ? 'bg-yellow-900/20 border-yellow-600' :
                          auth.status === 'approved' ? 'bg-green-900/20 border-green-600' :
                          'bg-red-900/20 border-red-600'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-semibold">{auth.user_name}</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                auth.status === 'pending' ? 'bg-yellow-600 text-white' :
                                auth.status === 'approved' ? 'bg-green-600 text-white' :
                                'bg-red-600 text-white'
                              }`}>
                                {auth.status === 'pending' ? 'Pendente' :
                                 auth.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                              </span>
                            </div>
                            <p className="text-gray-400 text-sm">
                              <span className="text-gray-500">Data:</span> {new Date(auth.date).toLocaleDateString('pt-PT')}
                              {auth.day_type && <span className="ml-2 text-yellow-400">({auth.day_type})</span>}
                            </p>
                            <p className="text-gray-400 text-sm">
                              <span className="text-gray-500">Hora:</span> {auth.start_time || auth.clock_in_time || 'N/A'}
                            </p>
                            <p className="text-gray-400 text-sm">
                              <span className="text-gray-500">Tipo:</span> {
                                auth.request_type === 'vacation_work' 
                                  ? 'Trabalho em férias' 
                                  : auth.request_type === 'overtime_start' 
                                    ? 'Início em dia especial' 
                                    : 'Horas extra após 18:00'
                              }
                            </p>
                            {auth.decided_by && (
                              <p className="text-gray-500 text-xs mt-2">
                                Decidido por {auth.decided_by} em {new Date(auth.decided_at).toLocaleString('pt-PT')}
                              </p>
                            )}
                          </div>
                          {auth.status === 'pending' && (
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleDecideAuthorization(auth.id, 'approve')}
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Autorizar
                              </Button>
                              <Button
                                onClick={() => handleDecideAuthorization(auth.id, 'reject')}
                                size="sm"
                                variant="outline"
                                className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Rejeitar
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Logs de Notificações */}
              <div className="glass-effect p-6 rounded-xl">
                <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                  <HistoryIcon className="w-6 h-6 text-gray-400" />
                  Histórico de Notificações
                </h2>
                
                {notificationLogs.length === 0 ? (
                  <p className="text-gray-400 text-center py-4">Nenhuma notificação enviada</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left text-gray-400 py-2 px-3">Data/Hora</th>
                          <th className="text-left text-gray-400 py-2 px-3">Tipo</th>
                          <th className="text-left text-gray-400 py-2 px-3">Utilizador</th>
                          <th className="text-left text-gray-400 py-2 px-3">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {notificationLogs.slice(0, 20).map((log, index) => (
                          <tr key={index} className="border-b border-gray-800">
                            <td className="py-2 px-3 text-gray-300 text-sm">
                              {new Date(log.sent_at).toLocaleString('pt-PT')}
                            </td>
                            <td className="py-2 px-3">
                              <span className={`text-xs px-2 py-1 rounded ${
                                log.type === 'clock_in_reminder' ? 'bg-orange-600/20 text-orange-400' :
                                log.type === 'clock_out_reminder' ? 'bg-purple-600/20 text-purple-400' :
                                log.type === 'overtime_start_request' ? 'bg-yellow-600/20 text-yellow-400' :
                                'bg-gray-600/20 text-gray-400'
                              }`}>
                                {log.type === 'clock_in_reminder' ? 'Lembrete Entrada' :
                                 log.type === 'clock_out_reminder' ? 'Lembrete Saída' :
                                 log.type === 'overtime_start_request' ? 'Pedido Horas Extra' :
                                 log.type}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-white text-sm">{log.user_name}</td>
                            <td className="py-2 px-3">
                              {log.success ? (
                                <CheckCircle className="w-4 h-4 text-green-400" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-400" />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Tarifas Tab Content */}
          <TabsContent value="tarifas">
            <div className="glass-effect p-6 rounded-xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-white">Tarifas ({tarifas.filter(t => t.ativo).length})</h2>
                <Button 
                  onClick={() => handleOpenTarifaDialog()}
                  className="bg-green-600 hover:bg-green-700 text-white rounded-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Tarifa
                </Button>
              </div>
              
              <p className="text-gray-400 text-sm mb-6">
                Configure as tarifas que serão utilizadas na Folha de Horas. Cada tarifa representa um valor por hora de trabalho. Associe a um código para aplicação automática.
              </p>
              
              {tarifas.filter(t => t.ativo).length > 0 ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tarifas.filter(t => t.ativo).map((tarifa) => (
                    <div key={tarifa.id} className="bg-[#1a1a1a] p-5 rounded-lg border border-gray-700">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-2 rounded-lg">
                            <DollarSign className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <div className="text-white font-semibold">{tarifa.nome}</div>
                            {tarifa.codigo && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold mt-1 ${
                                tarifa.codigo === '1' ? 'bg-green-500/20 text-green-400' :
                                tarifa.codigo === '2' ? 'bg-blue-500/20 text-blue-400' :
                                tarifa.codigo === 'S' ? 'bg-orange-500/20 text-orange-400' :
                                'bg-red-500/20 text-red-400'
                              }`}>
                                Código {tarifa.codigo}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-3xl font-bold text-amber-400 mb-2">
                        {tarifa.valor_por_hora.toFixed(2)}€<span className="text-lg text-gray-500">/hora</span>
                      </div>
                      {tarifa.codigo && (
                        <p className="text-xs text-gray-500 mb-3">
                          Aplica-se a: {tarifa.codigo === '1' ? 'Dias úteis (07h-19h)' :
                                        tarifa.codigo === '2' ? 'Dias úteis (19h-07h)' :
                                        tarifa.codigo === 'S' ? 'Sábados' : 'Domingos/Feriados'}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button 
                          onClick={() => handleOpenTarifaDialog(tarifa)} 
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-sm" 
                          size="sm"
                        >
                          <Edit className="w-3 h-3 mr-1" />Editar
                        </Button>
                        <Button 
                          onClick={() => handleDeleteTarifa(tarifa.id, tarifa.nome)} 
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-full text-sm" 
                          size="sm"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />Eliminar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-12">
                  <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma tarifa configurada</p>
                  <p className="text-sm mt-2">Crie tarifas para utilizar na Folha de Horas</p>
                </div>
              )}
              
              {/* Tarifas inativas */}
              {tarifas.filter(t => !t.ativo).length > 0 && (
                <div className="mt-8 pt-6 border-t border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-500 mb-4">Tarifas Inativas ({tarifas.filter(t => !t.ativo).length})</h3>
                  <div className="grid md:grid-cols-3 gap-3">
                    {tarifas.filter(t => !t.ativo).map((tarifa) => (
                      <div key={tarifa.id} className="bg-[#1a1a1a] p-3 rounded-lg border border-gray-800 opacity-60">
                        <div className="text-gray-500 text-sm">{tarifa.nome}</div>
                        <div className="text-gray-600">{tarifa.valor_por_hora.toFixed(2)}€/hora</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Dialog para criar/editar tarifa */}
            <Dialog open={showTarifaDialog} onOpenChange={(open) => {
              setShowTarifaDialog(open);
              if (!open) {
                setTarifaForm({ nome: '', valor_por_hora: '', codigo: '' });
                setEditingTarifa(null);
              }
            }}>
              <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-amber-400" />
                    {editingTarifa ? 'Editar Tarifa' : 'Nova Tarifa'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Nome da Tarifa *</Label>
                    <Input
                      value={tarifaForm.nome}
                      onChange={(e) => setTarifaForm({...tarifaForm, nome: e.target.value})}
                      className="bg-[#0a0a0a] border-gray-700 text-white"
                      placeholder="Ex: Viagem Tarifa 1, Mão de Obra..."
                    />
                    <p className="text-xs text-gray-500 mt-1">As tarifas serão ordenadas alfabeticamente</p>
                  </div>
                  <div>
                    <Label>Valor por Hora (€) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={tarifaForm.valor_por_hora}
                      onChange={(e) => setTarifaForm({...tarifaForm, valor_por_hora: e.target.value})}
                      className="bg-[#0a0a0a] border-gray-700 text-white"
                      placeholder="Ex: 35.00"
                    />
                  </div>
                  <div>
                    <Label>Código Horário</Label>
                    <select
                      value={tarifaForm.codigo}
                      onChange={(e) => setTarifaForm({...tarifaForm, codigo: e.target.value})}
                      className="w-full bg-[#0a0a0a] border border-gray-700 text-white rounded-md p-2"
                    >
                      <option value="">Todos os códigos</option>
                      <option value="1">1 - Dias úteis (07h-19h)</option>
                      <option value="2">2 - Dias úteis (19h-07h)</option>
                      <option value="S">S - Sábado</option>
                      <option value="D">D - Domingos/Feriados</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      A tarifa será aplicada automaticamente aos registos com este código na Folha de Horas
                    </p>
                  </div>
                  <Button 
                    onClick={handleSaveTarifa} 
                    disabled={loading}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-full"
                  >
                    {loading ? 'A guardar...' : (editingTarifa ? 'Atualizar Tarifa' : 'Criar Tarifa')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="reports">
            {reports && (
              <div className="glass-effect p-6 rounded-xl">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                  <h2 className="text-2xl font-semibold text-white">Relatório Consolidado</h2>
                  
                  {/* Seletor de Mês/Ano */}
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-[#1a1a1a] border-gray-700 text-white hover:bg-[#252525]"
                      onClick={() => {
                        let newMonth = reportMonth - 1;
                        let newYear = reportYear;
                        if (newMonth < 1) {
                          newMonth = 12;
                          newYear -= 1;
                        }
                        setReportMonth(newMonth);
                        setReportYear(newYear);
                        fetchReports(newMonth, newYear);
                      }}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    
                    <div className="flex items-center gap-2">
                      <Select
                        value={reportMonth.toString()}
                        onValueChange={(value) => {
                          const newMonth = parseInt(value);
                          setReportMonth(newMonth);
                          fetchReports(newMonth, reportYear);
                        }}
                      >
                        <SelectTrigger className="w-[130px] bg-[#1a1a1a] border-gray-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1a1a] border-gray-700 text-white">
                          <SelectItem value="1">Janeiro</SelectItem>
                          <SelectItem value="2">Fevereiro</SelectItem>
                          <SelectItem value="3">Março</SelectItem>
                          <SelectItem value="4">Abril</SelectItem>
                          <SelectItem value="5">Maio</SelectItem>
                          <SelectItem value="6">Junho</SelectItem>
                          <SelectItem value="7">Julho</SelectItem>
                          <SelectItem value="8">Agosto</SelectItem>
                          <SelectItem value="9">Setembro</SelectItem>
                          <SelectItem value="10">Outubro</SelectItem>
                          <SelectItem value="11">Novembro</SelectItem>
                          <SelectItem value="12">Dezembro</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Select
                        value={reportYear.toString()}
                        onValueChange={(value) => {
                          const newYear = parseInt(value);
                          setReportYear(newYear);
                          fetchReports(reportMonth, newYear);
                        }}
                      >
                        <SelectTrigger className="w-[100px] bg-[#1a1a1a] border-gray-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1a1a] border-gray-700 text-white">
                          {[2023, 2024, 2025, 2026].map(year => (
                            <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-[#1a1a1a] border-gray-700 text-white hover:bg-[#252525]"
                      onClick={() => {
                        let newMonth = reportMonth + 1;
                        let newYear = reportYear;
                        if (newMonth > 12) {
                          newMonth = 1;
                          newYear += 1;
                        }
                        setReportMonth(newMonth);
                        setReportYear(newYear);
                        fetchReports(newMonth, newYear);
                      }}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="text-gray-400 mb-6">
                  Período: {new Date(reports.start_date + 'T00:00:00').toLocaleDateString('pt-PT')} até {new Date(reports.end_date + 'T00:00:00').toLocaleDateString('pt-PT')}
                </div>
                
                <div className="space-y-4">
                  {reports.users && reports.users.length > 0 ? (
                    reports.users.map((u, idx) => (
                      <div key={idx} className="bg-[#1a1a1a] p-5 rounded-lg">
                        <div className="flex justify-between items-center mb-3">
                          <div className="text-white font-semibold text-lg">{u.username}</div>
                          <div className="flex items-center gap-3">
                            <div className="text-green-400 font-bold text-2xl">{u.total_hours.toFixed(2)}h</div>
                            <Button
                              onClick={async () => {
                                try {
                                  const response = await axios.get(
                                    `${API}/time-entries/reports/monthly-pdf?user_id=${u.user_id}&month=${reportMonth}&year=${reportYear}`,
                                    {
                                      responseType: 'blob'
                                    }
                                  );
                                  
                                  // Criar URL do blob e fazer download
                                  const blob = new Blob([response.data], { type: 'application/pdf' });
                                  const downloadUrl = window.URL.createObjectURL(blob);
                                  const link = document.createElement('a');
                                  link.href = downloadUrl;
                                  
                                  // Extrair nome do arquivo do header ou usar padrão
                                  const contentDisposition = response.headers['content-disposition'];
                                  let filename = `Relatorio_${u.username}_${reportMonth}_${reportYear}.pdf`;
                                  if (contentDisposition) {
                                    const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
                                    if (filenameMatch) {
                                      filename = filenameMatch[1];
                                    }
                                  }
                                  
                                  link.download = filename;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                  window.URL.revokeObjectURL(downloadUrl);
                                  
                                  toast.success('PDF baixado com sucesso!');
                                } catch (error) {
                                  toast.error('Erro ao baixar PDF: ' + (error.response?.data?.detail || error.message));
                                }
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white rounded-full"
                              size="sm"
                              title={`Download Relatório de ${['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][reportMonth-1]} ${reportYear}`}
                            >
                              <Download className="w-4 h-4 mr-1" />
                              PDF
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div><div className="text-gray-400">Horas Normais</div><div className="text-blue-400 font-semibold">{u.regular_hours.toFixed(2)}h</div></div>
                          <div><div className="text-gray-400">Horas Extras</div><div className="text-amber-400 font-semibold">{u.overtime_hours.toFixed(2)}h</div></div>
                          <div><div className="text-gray-400">Dias Trabalhados</div><div className="text-white font-semibold">{u.days_worked}</div></div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-gray-400 py-8">
                      Nenhum registo encontrado para este período
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;