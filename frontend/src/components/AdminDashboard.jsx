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
import { Shield, Users, Calendar, TrendingUp, CheckCircle, XCircle, Plus, Edit, Trash2, Download, Clock, Minus, FileText, History as HistoryIcon, RefreshCw, ChevronLeft, ChevronRight, DollarSign, Bell, AlertTriangle, Play, BellRing, MapPin, Map } from 'lucide-react';
import HelpTooltip from '@/components/HelpTooltip';
import LocationMap from '@/components/ui/location-map';
import { useMobile } from '@/contexts/MobileContext';

const AdminDashboard = ({ user, onLogout }) => {
  const { isMobile } = useMobile();
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

  // Estados para Tabelas de Preço e Tarifas
  const [tabelasPreco, setTabelasPreco] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState(1);  // Tabela de preço ativa
  const [showTarifaDialog, setShowTarifaDialog] = useState(false);
  const [showTabelaDialog, setShowTabelaDialog] = useState(false);  // Dialog para editar config da tabela
  const [editingTarifa, setEditingTarifa] = useState(null);
  const [tarifaForm, setTarifaForm] = useState({
    nome: '',
    valor_por_hora: '',
    codigo: '',  // "1", "2", "S", "D" ou vazio para todos
    tipo_registo: '',  // "trabalho", "viagem" ou vazio para ambos
    tipo_colaborador: ''  // "junior", "tecnico", "senior" ou vazio para todos
  });
  const [tabelaForm, setTabelaForm] = useState({
    nome: '',
    valor_km: '',
    valor_dieta: ''
  });

  // Estados para Notificações e Autorizações
  const [overtimeAuthorizations, setOvertimeAuthorizations] = useState([]);
  const [vacationWorkRequests, setVacationWorkRequests] = useState([]); // Pedidos de trabalho em férias
  const [notificationLogs, setNotificationLogs] = useState([]);
  const [authStatusFilter, setAuthStatusFilter] = useState('all');
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [runningCheck, setRunningCheck] = useState(null);

  // Estados para Geolocalização em Tempo Real
  const [allCurrentLocations, setAllCurrentLocations] = useState([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [showAllLocationsDialog, setShowAllLocationsDialog] = useState(false);

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
    fetchTabelasPreco();
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

  // ============ Tabelas de Preço Functions ============
  const fetchTabelasPreco = async () => {
    try {
      const response = await axios.get(`${API}/tabelas-preco`);
      setTabelasPreco(response.data);
    } catch (error) {
      console.error('Erro ao carregar tabelas de preço');
    }
  };

  const handleOpenTabelaDialog = (tabela) => {
    setTabelaForm({
      nome: tabela.nome || `Tabela ${tabela.table_id}`,
      valor_km: tabela.valor_km?.toString() || '0.65',
      valor_dieta: tabela.valor_dieta?.toString() || '0'
    });
    setShowTabelaDialog(tabela.table_id);
  };

  const handleOpenCreateTabelaDialog = () => {
    setTabelaForm({
      nome: '',
      valor_km: '0.65',
      valor_dieta: '0'
    });
    setShowTabelaDialog('new');
  };

  const handleSaveTabela = async () => {
    if (!tabelaForm.valor_km) {
      toast.error('Preencha o valor por Km');
      return;
    }

    setLoading(true);
    try {
      if (showTabelaDialog === 'new') {
        // Criar nova tabela
        if (!tabelaForm.nome) {
          toast.error('Preencha o nome da tabela');
          setLoading(false);
          return;
        }
        await axios.post(`${API}/tabelas-preco`, {
          nome: tabelaForm.nome,
          valor_km: parseFloat(tabelaForm.valor_km),
          valor_dieta: parseFloat(tabelaForm.valor_dieta) || 0
        });
        toast.success('Nova Tabela de Preço criada!');
      } else {
        // Atualizar tabela existente
        await axios.put(`${API}/tabelas-preco/${showTabelaDialog}`, {
          nome: tabelaForm.nome,
          valor_km: parseFloat(tabelaForm.valor_km),
          valor_dieta: parseFloat(tabelaForm.valor_dieta) || 0
        });
        toast.success('Tabela de Preço atualizada!');
      }
      setShowTabelaDialog(false);
      fetchTabelasPreco();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao guardar tabela');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTabela = async (tableId, tableName) => {
    if (!confirm(`Tem certeza que deseja eliminar a tabela "${tableName}"?`)) {
      return;
    }

    setLoading(true);
    try {
      await axios.delete(`${API}/tabelas-preco/${tableId}`);
      toast.success('Tabela eliminada!');
      // Se a tabela eliminada era a selecionada, selecionar a primeira disponível
      if (selectedTableId === tableId) {
        const remaining = tabelasPreco.filter(t => t.table_id !== tableId);
        if (remaining.length > 0) {
          setSelectedTableId(remaining[0].table_id);
        }
      }
      fetchTabelasPreco();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao eliminar tabela');
    } finally {
      setLoading(false);
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
      
      // Buscar de ambas as coleções: overtime_authorizations e day_authorizations
      const [overtimeRes, dayAuthRes] = await Promise.all([
        axios.get(status && status !== 'all' 
          ? `${API}/overtime/authorizations?status=${status}`
          : `${API}/overtime/authorizations`
        ),
        axios.get(`${API}/admin/day-authorizations${status && status !== 'all' ? `?status=${status}` : ''}`)
      ]);
      
      // Adicionar tipo de autorização para saber qual endpoint usar
      const overtimeAuths = (overtimeRes.data || []).map(a => ({ ...a, authType: 'overtime' }));
      const dayAuths = (dayAuthRes.data || []).map(a => ({ ...a, authType: 'day' }));
      
      // Combinar e processar autorizações
      const allAuths = [...overtimeAuths, ...dayAuths];
      
      // Separar pedidos de trabalho em férias dos outros
      const vacationWork = allAuths.filter(a => a.request_type === 'vacation_work' || a.day_type === 'ferias');
      const overtimeOnly = allAuths.filter(a => a.request_type !== 'vacation_work' && a.day_type !== 'ferias');
      
      setVacationWorkRequests(vacationWork);
      setOvertimeAuthorizations(overtimeOnly);
    } catch (error) {
      console.error('Erro ao carregar autorizações:', error);
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

  // ============ Geolocation Functions ============
  const fetchAllCurrentLocations = async () => {
    setLocationLoading(true);
    try {
      const response = await axios.get(`${API}/admin/all-current-locations`);
      setAllCurrentLocations(response.data.locations || []);
      return response.data;
    } catch (error) {
      console.error('Erro ao carregar localizações atuais:', error);
      toast.error('Erro ao carregar localizações');
      setAllCurrentLocations([]);
    } finally {
      setLocationLoading(false);
    }
  };

  const handleOpenAllLocations = async () => {
    setShowAllLocationsDialog(true);
    await fetchAllCurrentLocations();
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

  const handleDecideAuthorization = async (authId, action, authType = 'overtime') => {
    try {
      // Usar endpoint correto baseado no tipo de autorização
      let endpoint;
      if (authType === 'day') {
        endpoint = `${API}/admin/day-authorizations/${authId}/decide`;
      } else {
        endpoint = `${API}/overtime/authorization/${authId}/decide`;
      }
      
      const response = await axios.post(endpoint, { action });
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
        codigo: tarifa.codigo || '',
        tipo_registo: tarifa.tipo_registo || '',
        tipo_colaborador: tarifa.tipo_colaborador || ''
      });
    } else {
      setEditingTarifa(null);
      setTarifaForm({
        nome: '',
        valor_por_hora: '',
        codigo: '',
        tipo_registo: '',
        tipo_colaborador: ''
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
        codigo: tarifaForm.codigo || null,
        tipo_registo: tarifaForm.tipo_registo || null,
        tipo_colaborador: tarifaForm.tipo_colaborador || null,
        table_id: selectedTableId
      };

      if (editingTarifa) {
        await axios.put(`${API}/tarifas/${editingTarifa.id}`, data);
        toast.success('Tarifa atualizada!');
      } else {
        await axios.post(`${API}/tarifas`, data);
        toast.success('Tarifa criada!');
      }
      
      setShowTarifaDialog(false);
      setTarifaForm({ nome: '', valor_por_hora: '', codigo: '', tipo_registo: '', tipo_colaborador: '' });
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
      is_admin: user.is_admin || false,
      tipo_colaborador: user.tipo_colaborador || ''
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
    <div className={`min-h-screen bg-[#0a0a0a] ${isMobile ? 'mobile-safe-top' : ''}`}>
      {!isMobile && <Navigation user={user} onLogout={onLogout} activePage="admin" />}
      <div className={`container mx-auto ${isMobile ? 'px-3 py-4 pb-24' : 'px-4 py-8'} max-w-7xl fade-in`}>
        <div className={`flex ${isMobile ? 'flex-col gap-3' : 'flex-col md:flex-row justify-between items-start md:items-center gap-4'} mb-6`}>
          <div className="flex items-center gap-3">
            <div className={`bg-gradient-to-br from-red-500 to-pink-600 ${isMobile ? 'p-2' : 'p-3'} rounded-xl`}>
              <Shield className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} text-white`} />
            </div>
            <h1 className={`${isMobile ? 'text-xl' : 'text-4xl'} font-bold text-white`}>
              {isMobile ? 'Admin' : 'Painel de Administração'}
            </h1>
          </div>
          
          {/* Quick Access Button */}
          <Button
            onClick={() => window.location.href = '/admin/time-entries'}
            className={`bg-purple-600 hover:bg-purple-700 text-white ${isMobile ? 'w-full py-2.5' : ''}`}
          >
            <Clock className={`${isMobile ? 'w-4 h-4 mr-1.5' : 'w-5 h-5 mr-2'}`} />
            {isMobile ? 'Gestão Entradas' : 'Gestão de Entradas'}
          </Button>
        </div>

        <Tabs defaultValue="vacations" className="w-full">
          <div className={`overflow-x-auto ${isMobile ? 'pb-2 mb-4 -mx-3 px-3' : 'pb-2 mb-6 -mx-4 px-4 md:mx-0 md:px-0'}`}>
            <TabsList className={`inline-flex min-w-max gap-1 bg-[#1a1a1a] p-1 rounded-lg ${isMobile ? '' : 'md:grid md:grid-cols-6 md:w-full md:max-w-5xl md:mx-auto'}`}>
              <TabsTrigger value="vacations" className={`whitespace-nowrap ${isMobile ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'} data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400 relative`}>
                <Calendar className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-1.5'} flex-shrink-0`} />
                <span>{isMobile ? 'Férias' : 'Férias'}</span>
                {(pendingVacations.length + vacationWorkRequests.filter(r => r.status === 'pending').length) > 0 && (
                  <span className={`absolute -top-1 -right-1 text-white text-xs rounded-full ${isMobile ? 'w-4 h-4 text-[10px]' : 'w-5 h-5'} flex items-center justify-center ${
                    vacationWorkRequests.filter(r => r.status === 'pending').length > 0 ? 'bg-orange-500' : 'bg-blue-500'
                  }`}>
                    {pendingVacations.length + vacationWorkRequests.filter(r => r.status === 'pending').length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="absences" className={`whitespace-nowrap ${isMobile ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'} data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400`}>
                <Users className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-1.5'} flex-shrink-0`} />
                <span>Faltas</span>
              </TabsTrigger>
              <TabsTrigger value="users" className={`whitespace-nowrap ${isMobile ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'} data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400`}>
                <Users className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-1.5'} flex-shrink-0`} />
                <span>{isMobile ? 'Users' : 'Utilizadores'}</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className={`whitespace-nowrap ${isMobile ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'} data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400 relative`}>
                <Bell className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-1.5'} flex-shrink-0`} />
                <span>{isMobile ? 'Notif.' : 'Notificações'}</span>
                {overtimeAuthorizations.filter(a => a.status === 'pending').length > 0 && (
                  <span className={`absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full ${isMobile ? 'w-4 h-4 text-[10px]' : 'w-5 h-5'} flex items-center justify-center`}>
                    {overtimeAuthorizations.filter(a => a.status === 'pending').length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="tarifas" className={`whitespace-nowrap ${isMobile ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'} data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400`}>
                <DollarSign className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-1.5'} flex-shrink-0`} />
                <span>{isMobile ? 'Preços' : 'Tabela de Preço'}</span>
              </TabsTrigger>
              <TabsTrigger value="reports" className={`whitespace-nowrap ${isMobile ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'} data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400`}>
                <TrendingUp className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-1.5'} flex-shrink-0`} />
                <span>{isMobile ? 'Relat.' : 'Relatórios'}</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="vacations">
            <div className={isMobile ? 'space-y-4' : 'space-y-6'}>
              {/* Header com ajuda */}
              <div className="flex items-center gap-2 mb-2">
                <h2 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-semibold text-white`}>Gestão de Férias</h2>
                {!isMobile && <HelpTooltip section="admin_ferias" />}
              </div>
              
              {/* Secção: Trabalho em Férias (pedidos prioritários) */}
              {vacationWorkRequests.filter(r => r.status === 'pending').length > 0 && (
                <div className={`glass-effect ${isMobile ? 'p-4' : 'p-6'} rounded-xl border-2 border-orange-500/50`}>
                  <div className={`flex items-center gap-2 ${isMobile ? 'mb-3' : 'mb-6'}`}>
                    <AlertTriangle className={`${isMobile ? 'w-5 h-5' : 'w-6 h-6'} text-orange-400`} />
                    <h2 className={`${isMobile ? 'text-base' : 'text-2xl'} font-semibold text-orange-400`}>
                      Trabalho em Férias ({vacationWorkRequests.filter(r => r.status === 'pending').length})
                    </h2>
                  </div>
                  {!isMobile && (
                    <p className="text-gray-400 text-sm mb-4">
                      Utilizadores que iniciaram ponto durante período de férias aprovadas. Se autorizado, 1 dia de férias será devolvido ao saldo.
                    </p>
                  )}
                  <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
                    {vacationWorkRequests.filter(r => r.status === 'pending').map((req) => (
                      <div key={req.id} className={`bg-orange-900/20 border border-orange-600/50 ${isMobile ? 'p-3' : 'p-5'} rounded-lg`}>
                        <div className={`flex ${isMobile ? 'flex-col gap-3' : 'justify-between items-start'}`}>
                          <div>
                            <div className={`text-white font-semibold ${isMobile ? 'text-base' : 'text-lg'}`}>{req.user_name}</div>
                            <div className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                              Data: {new Date(req.date).toLocaleDateString('pt-PT')}
                            </div>
                            <div className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                              Entrada: {req.start_time || req.clock_in_time || 'N/A'}
                            </div>
                            {req.day_type && (
                              <div className={`text-orange-400 font-semibold mt-1 ${isMobile ? 'text-sm' : ''}`}>{req.day_type}</div>
                            )}
                          </div>
                          <div className={`flex gap-2 ${isMobile ? 'w-full' : ''}`}>
                            <Button 
                              onClick={() => handleDecideAuthorization(req.id, 'approve', req.authType)} 
                              className={`bg-green-600 hover:bg-green-700 text-white ${isMobile ? 'flex-1 text-xs py-2' : ''}`}
                              size={isMobile ? 'sm' : 'default'}
                            >
                              <CheckCircle className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-1'}`} />
                              {isMobile ? 'OK' : 'Autorizar'}
                            </Button>
                            <Button 
                              onClick={() => handleDecideAuthorization(req.id, 'reject', req.authType)} 
                              variant="outline"
                              className={`border-red-600 text-red-400 hover:bg-red-600 hover:text-white ${isMobile ? 'flex-1 text-xs py-2' : ''}`}
                              size={isMobile ? 'sm' : 'default'}
                            >
                              <XCircle className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-1'}`} />
                              {isMobile ? 'Não' : 'Rejeitar'}
                            </Button>
                          </div>
                        </div>
                        {!isMobile && (
                          <div className="mt-3 pt-3 border-t border-orange-600/30 text-sm">
                            <span className="text-green-400">✓ Autorizar:</span> <span className="text-gray-400">Devolve 1 dia de férias</span>
                            <span className="mx-2 text-gray-600">|</span>
                            <span className="text-red-400">✗ Rejeitar:</span> <span className="text-gray-400">Elimina entrada de ponto</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Secção: Pedidos de Férias Pendentes */}
              <div className={`glass-effect ${isMobile ? 'p-4' : 'p-6'} rounded-xl`}>
                <h2 className={`${isMobile ? 'text-base' : 'text-2xl'} font-semibold text-white ${isMobile ? 'mb-3' : 'mb-6'}`}>
                  Pedidos Pendentes ({pendingVacations.length})
                </h2>
                {pendingVacations.length > 0 ? (
                  <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
                    {pendingVacations.map((req) => (
                      <div key={req.id} className={`bg-[#1a1a1a] ${isMobile ? 'p-3' : 'p-5'} rounded-lg`}>
                        <div className={`flex ${isMobile ? 'flex-col gap-2' : 'justify-between items-start'} mb-3`}>
                          <div>
                            <div className={`text-white font-semibold ${isMobile ? 'text-base' : 'text-lg'}`}>{req.username}</div>
                            <div className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                              {new Date(req.start_date + 'T00:00:00').toLocaleDateString('pt-PT')} até {new Date(req.end_date + 'T00:00:00').toLocaleDateString('pt-PT')}
                            </div>
                            <div className={`text-amber-400 font-semibold mt-1 ${isMobile ? 'text-sm' : ''}`}>{req.days_requested} dias</div>
                          </div>
                          <div className={`flex gap-2 ${isMobile ? 'w-full mt-2' : ''}`}>
                            <Button 
                              onClick={() => handleVacationApproval(req.id, true)} 
                              className={`bg-green-600 hover:bg-green-700 text-white rounded-full ${isMobile ? 'flex-1 text-xs' : ''}`}
                              size={isMobile ? 'sm' : 'default'}
                            >
                              <CheckCircle className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-1'}`} />
                              {isMobile ? 'OK' : 'Aprovar'}
                            </Button>
                            <Button 
                              onClick={() => handleVacationApproval(req.id, false)} 
                              className={`bg-red-600 hover:bg-red-700 text-white rounded-full ${isMobile ? 'flex-1 text-xs' : ''}`}
                              size={isMobile ? 'sm' : 'default'}
                            >
                              <XCircle className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-1'}`} />
                              {isMobile ? 'Não' : 'Rejeitar'}
                            </Button>
                          </div>
                        </div>
                        {req.reason && <div className={`text-gray-300 ${isMobile ? 'text-xs' : 'text-sm'} mt-2 pt-2 border-t border-gray-700`}>Motivo: {req.reason}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`text-center text-gray-400 ${isMobile ? 'py-8 text-sm' : 'py-12'}`}>Não há pedidos de férias pendentes</div>
                )}
              </div>

              {/* Histórico de Trabalho em Férias (decididos) */}
              {vacationWorkRequests.filter(r => r.status !== 'pending').length > 0 && (
                <div className={`glass-effect ${isMobile ? 'p-4' : 'p-6'} rounded-xl`}>
                  <h2 className={`${isMobile ? 'text-base' : 'text-xl'} font-semibold text-gray-400 ${isMobile ? 'mb-3' : 'mb-4'}`}>Histórico - Trabalho em Férias</h2>
                  <div className="space-y-2">
                    {vacationWorkRequests.filter(r => r.status !== 'pending').slice(0, isMobile ? 5 : 10).map((req) => (
                      <div key={req.id} className={`bg-[#1a1a1a] ${isMobile ? 'p-2.5' : 'p-3'} rounded-lg flex ${isMobile ? 'flex-col gap-1' : 'justify-between items-center'}`}>
                        <div className={isMobile ? 'flex items-center gap-2 flex-wrap' : ''}>
                          <span className={`text-white ${isMobile ? 'text-sm' : ''}`}>{req.user_name}</span>
                          <span className="text-gray-500 mx-2">•</span>
                          <span className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-sm'}`}>{new Date(req.date).toLocaleDateString('pt-PT')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} px-2 py-1 rounded ${
                            req.status === 'approved' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                          }`}>
                            {req.status === 'approved' ? 'Autorizado' : 'Rejeitado'}
                          </span>
                          {req.decided_by && !isMobile && (
                            <span className="text-gray-500 text-xs">por {req.decided_by}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="absences">
            <div className={`glass-effect ${isMobile ? 'p-4' : 'p-6'} rounded-xl`}>
              <h2 className={`${isMobile ? 'text-base' : 'text-2xl'} font-semibold text-white ${isMobile ? 'mb-3' : 'mb-6'} flex items-center gap-2`}>
                Faltas ({allAbsences.length})
                {!isMobile && <HelpTooltip section="admin_faltas" />}
              </h2>
              {allAbsences.length > 0 ? (
                <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
                  {allAbsences.map((absence) => (
                    <div key={absence.id} className={`bg-[#1a1a1a] ${isMobile ? 'p-3' : 'p-5'} rounded-lg`}>
                      <div className={`flex ${isMobile ? 'flex-col gap-2' : 'justify-between items-start'} mb-3`}>
                        <div className="flex-1">
                          <div className={`text-white font-semibold ${isMobile ? 'text-base' : 'text-lg'}`}>{absence.username}</div>
                          <div className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-sm'}`}>{new Date(absence.date + 'T00:00:00').toLocaleDateString('pt-PT')}</div>
                          <div className={`text-amber-400 font-semibold mt-1 ${isMobile ? 'text-sm' : ''}`}>{absence.hours}h - {absence.is_justified ? 'Justificada' : 'Injustificada'}</div>
                          {absence.reason && <div className={`text-gray-300 ${isMobile ? 'text-xs' : 'text-sm'} mt-1`}>Motivo: {absence.reason}</div>}
                          {absence.justification_file && (
                            <div className="mt-2">
                              <Button 
                                onClick={() => downloadJustificationFile(absence.justification_file)}
                                className={`bg-blue-600 hover:bg-blue-700 text-white rounded-full ${isMobile ? 'text-[10px]' : 'text-xs'}`}
                                size="sm"
                              >
                                <Download className="w-3 h-3 mr-1" />
                                {isMobile ? 'Ver' : 'Ver Justificação'}
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className={`flex ${isMobile ? 'flex-row items-center justify-between w-full' : 'flex-col'} gap-2`}>
                          <span className={`${isMobile ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'} rounded-full font-semibold ${
                            absence.status === 'approved' ? 'bg-green-700 text-green-200' :
                            absence.status === 'rejected' ? 'bg-red-700 text-red-200' :
                            'bg-amber-700 text-amber-200'
                          }`}>
                            {absence.status === 'approved' ? 'Aprovado' : absence.status === 'rejected' ? 'Rejeitado' : 'Pendente'}
                          </span>
                          {absence.status === 'pending' && (
                            <div className="flex gap-2">
                              <Button 
                                onClick={() => handleAbsenceReview(absence.id, true)} 
                                className={`bg-green-600 hover:bg-green-700 text-white rounded-full ${isMobile ? 'text-[10px] px-2' : 'text-xs'}`}
                                size="sm"
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />{isMobile ? 'OK' : 'Aprovar'}
                              </Button>
                              <Button 
                                onClick={() => handleAbsenceReview(absence.id, false)} 
                                className={`bg-red-600 hover:bg-red-700 text-white rounded-full ${isMobile ? 'text-[10px] px-2' : 'text-xs'}`}
                                size="sm"
                              >
                                <XCircle className="w-3 h-3 mr-1" />{isMobile ? 'Não' : 'Rejeitar'}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                      {absence.reviewed_by && !isMobile && <div className="text-gray-500 text-xs mt-2 pt-2 border-t border-gray-700">Revisto por: {absence.reviewed_by}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`text-center text-gray-400 ${isMobile ? 'py-8 text-sm' : 'py-12'}`}>Não há faltas registadas</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="users">
            <div className={`glass-effect ${isMobile ? 'p-4' : 'p-6'} rounded-xl`}>
              <div className={`flex ${isMobile ? 'flex-col gap-3' : 'justify-between items-center'} ${isMobile ? 'mb-4' : 'mb-6'}`}>
                <h2 className={`${isMobile ? 'text-base' : 'text-2xl'} font-semibold text-white flex items-center gap-2`}>
                  Utilizadores ({users.length})
                  {!isMobile && <HelpTooltip section="admin_utilizadores" />}
                </h2>
                <div className={`flex ${isMobile ? 'flex-col w-full' : 'flex-wrap'} gap-2`}>
                  {/* Mapa de Localizações Atuais */}
                  <Button 
                    onClick={handleOpenAllLocations}
                    className={`bg-emerald-600 hover:bg-emerald-700 text-white rounded-full ${isMobile ? 'w-full text-sm py-2' : ''}`}
                    data-testid="view-all-locations-btn"
                    size={isMobile ? 'sm' : 'default'}
                  >
                    <Map className={`${isMobile ? 'w-3.5 h-3.5 mr-1.5' : 'w-4 h-4 mr-2'}`} />
                    {isMobile ? 'Mapa' : 'Mapa em Tempo Real'}
                  </Button>
                  
                  <Dialog open={showManualEntryDialog} onOpenChange={setShowManualEntryDialog}>
                    <DialogTrigger asChild>
                      <Button className={`bg-blue-600 hover:bg-blue-700 text-white rounded-full ${isMobile ? 'w-full text-sm py-2' : ''}`} size={isMobile ? 'sm' : 'default'}>
                        <Clock className={`${isMobile ? 'w-3.5 h-3.5 mr-1.5' : 'w-4 h-4 mr-2'}`} />
                        {isMobile ? 'Add Entrada' : 'Adicionar Entrada'}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className={`bg-[#1a1a1a] border-gray-700 text-white ${isMobile ? 'max-w-[95vw] max-h-[85vh] overflow-y-auto rounded-xl' : 'max-w-md'}`}>
                      <DialogHeader><DialogTitle className={isMobile ? 'text-base' : ''}>Adicionar Entrada Manual</DialogTitle></DialogHeader>
                      <div className={`space-y-3 ${isMobile ? 'mt-2' : 'mt-4'}`}>
                        <div>
                          <Label className={isMobile ? 'text-xs' : ''}>Utilizador</Label>
                          <select
                            value={manualEntryForm.user_id}
                            onChange={(e) => setManualEntryForm({...manualEntryForm, user_id: e.target.value})}
                            className={`w-full bg-[#0a0a0a] border border-gray-700 text-white rounded-md px-3 py-2 ${isMobile ? 'text-sm' : ''}`}
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
                    <DialogHeader><DialogTitle className={isMobile ? 'text-base' : ''}>Criar Novo Utilizador</DialogTitle></DialogHeader>
                    <div className={`space-y-3 ${isMobile ? 'mt-2' : 'mt-4'}`}>
                      <div>
                        <Label className={isMobile ? 'text-xs' : ''}>Username</Label>
                        <Input value={createForm.username} onChange={(e) => setCreateForm({...createForm, username: e.target.value})} className={`bg-[#0a0a0a] border-gray-700 text-white ${isMobile ? 'text-sm' : ''}`} />
                      </div>
                      <div>
                        <Label className={isMobile ? 'text-xs' : ''}>Email</Label>
                        <Input type="email" value={createForm.email} onChange={(e) => setCreateForm({...createForm, email: e.target.value})} className={`bg-[#0a0a0a] border-gray-700 text-white ${isMobile ? 'text-sm' : ''}`} />
                      </div>
                      <div>
                        <Label className={isMobile ? 'text-xs' : ''}>Telefone</Label>
                        <Input type="tel" placeholder="+351 912 345 678" value={createForm.phone} onChange={(e) => setCreateForm({...createForm, phone: e.target.value})} className={`bg-[#0a0a0a] border-gray-700 text-white ${isMobile ? 'text-sm' : ''}`} />
                      </div>
                      <div>
                        <Label className={isMobile ? 'text-xs' : ''}>Nome Completo</Label>
                        <Input value={createForm.full_name} onChange={(e) => setCreateForm({...createForm, full_name: e.target.value})} className={`bg-[#0a0a0a] border-gray-700 text-white ${isMobile ? 'text-sm' : ''}`} />
                      </div>
                      <div>
                        <Label className={isMobile ? 'text-xs' : ''}>Password</Label>
                        <Input type="password" value={createForm.password} onChange={(e) => setCreateForm({...createForm, password: e.target.value})} className={`bg-[#0a0a0a] border-gray-700 text-white ${isMobile ? 'text-sm' : ''}`} />
                      </div>
                      <Button onClick={handleCreateUser} disabled={loading} className={`w-full bg-green-600 hover:bg-green-700 text-white rounded-full ${isMobile ? 'text-sm py-2' : ''}`}>
                        {loading ? 'A criar...' : 'Criar Utilizador'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              </div>
              
              <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'md:grid-cols-2 gap-4'}`}>
                {users.map((u) => (
                  <div key={u.id} className={`bg-[#1a1a1a] ${isMobile ? 'p-3' : 'p-4'} rounded-lg`}>
                    <div className={`flex items-start ${isMobile ? 'gap-2.5' : 'gap-3'} mb-2`}>
                      <div className={`${isMobile ? 'w-10 h-10' : 'w-12 h-12'} rounded-full flex items-center justify-center flex-shrink-0 ${u.is_admin ? 'bg-gradient-to-br from-red-500 to-pink-600' : 'bg-gradient-to-br from-blue-500 to-purple-600'}`}>
                        <span className={`text-white font-bold ${isMobile ? 'text-base' : 'text-lg'}`}>{u.username.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-white font-semibold ${isMobile ? 'text-sm' : ''} truncate`}>
                          {u.username}
                          {u.is_admin && <span className={`ml-1.5 ${isMobile ? 'text-[10px]' : 'text-xs'} bg-red-600 px-1.5 py-0.5 rounded`}>ADMIN</span>}
                        </div>
                        <div className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-sm'} truncate`}>{u.email}</div>
                        {!isMobile && u.phone && <div className="text-gray-500 text-xs">📞 {u.phone}</div>}
                        {!isMobile && u.full_name && <div className="text-gray-500 text-xs">{u.full_name}</div>}
                        {u.tipo_colaborador && (
                          <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded ${
                            u.tipo_colaborador === 'senior' ? 'bg-purple-600/30 text-purple-300' :
                            u.tipo_colaborador === 'tecnico' ? 'bg-cyan-600/30 text-cyan-300' :
                            'bg-yellow-600/30 text-yellow-300'
                          }`} data-testid="user-tipo-colaborador-badge">
                            {u.tipo_colaborador === 'junior' ? 'Téc. Júnior' : u.tipo_colaborador === 'tecnico' ? 'Técnico' : 'Téc. Sénior'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`flex gap-2 ${isMobile ? 'mt-2' : 'mt-2'}`}>
                      <Button 
                        onClick={() => handleVerifyHours(u)}
                        className={`flex-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-full ${isMobile ? 'text-xs py-1.5' : 'text-sm'}`}
                        size="sm"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />{isMobile ? 'Verificar' : 'Verificar Horas'}
                      </Button>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button onClick={() => handleEditUser(u)} className={`flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-full ${isMobile ? 'text-xs py-1.5' : 'text-sm'}`} size="sm">
                        <Edit className="w-3 h-3 mr-1" />Editar
                      </Button>
                      <Button onClick={() => handleDeleteUser(u.id, u.username)} className={`flex-1 bg-red-600 hover:bg-red-700 text-white rounded-full ${isMobile ? 'text-xs py-1.5' : 'text-sm'}`} size="sm">
                        <Trash2 className="w-3 h-3 mr-1" />{isMobile ? 'Elim.' : 'Eliminar'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Verify Hours Dialog */}
            <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
              <DialogContent className={`bg-[#1a1a1a] border-gray-700 text-white ${isMobile ? 'max-w-[95vw] max-h-[85vh] overflow-y-auto rounded-xl' : 'max-w-2xl'}`}>
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
                      <Label>Password Actual</Label>
                      <Input
                        value={editingUser?.plain_password || '(não disponível)'}
                        readOnly
                        className="bg-[#0a0a0a] border-gray-700 text-gray-400 cursor-default"
                        data-testid="current-password-field"
                      />
                    </div>
                    <div>
                      <Label>Nova Password (deixar vazio para não alterar)</Label>
                      <Input type="password" value={editForm.password} onChange={(e) => setEditForm({...editForm, password: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" placeholder="Deixar vazio para não alterar" />
                    </div>
                    <div>
                      <Label>Tipo de Colaborador (para FS's)</Label>
                      <select
                        value={editForm.tipo_colaborador || ''}
                        onChange={(e) => setEditForm({...editForm, tipo_colaborador: e.target.value})}
                        className="w-full bg-[#0a0a0a] border border-gray-700 text-white rounded-md px-3 py-2 mt-1"
                        data-testid="edit-user-tipo-colaborador"
                      >
                        <option value="">Sem tipo definido</option>
                        <option value="junior">Téc. Júnior</option>
                        <option value="tecnico">Técnico</option>
                        <option value="senior">Téc. Sénior</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">Define automaticamente a função ao adicionar este utilizador a uma FS</p>
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
              {/* Header com ajuda */}
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-2xl font-semibold text-white">Sistema de Notificações</h2>
                <HelpTooltip section="admin_notificacoes" />
              </div>
              
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
                  <div className="flex gap-2 items-center">
                    {overtimeAuthorizations.length > 0 && (
                      <Button
                        onClick={async () => {
                          try {
                            await axios.delete(`${API}/admin/overtime-authorizations/all`);
                            toast.success('Todas as autorizações removidas');
                            fetchOvertimeAuthorizations(authStatusFilter);
                          } catch (error) {
                            toast.error('Erro ao remover autorizações');
                          }
                        }}
                        size="sm"
                        variant="outline"
                        className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white text-xs"
                        data-testid="clear-all-authorizations"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Limpar todas
                      </Button>
                    )}
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
                                onClick={() => handleDecideAuthorization(auth.id, 'approve', auth.authType)}
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Autorizar
                              </Button>
                              <Button
                                onClick={() => handleDecideAuthorization(auth.id, 'reject', auth.authType)}
                                size="sm"
                                variant="outline"
                                className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Rejeitar
                              </Button>
                            </div>
                          )}
                          {auth.status !== 'pending' && (
                            <Button
                              onClick={async () => {
                                try {
                                  await axios.delete(`${API}/admin/overtime-authorizations/${auth.id}`);
                                  toast.success('Autorização removida');
                                  fetchOvertimeAuthorizations(authStatusFilter);
                                } catch (error) {
                                  toast.error('Erro ao remover');
                                }
                              }}
                              size="sm"
                              variant="ghost"
                              className="text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
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
                                log.type === 'vacation_work_request' ? 'bg-red-600/20 text-red-400' :
                                'bg-gray-600/20 text-gray-400'
                              }`}>
                                {log.type === 'clock_in_reminder' ? 'Lembrete Entrada' :
                                 log.type === 'clock_out_reminder' ? 'Lembrete Saída' :
                                 log.type === 'overtime_start_request' ? 'Pedido Horas Extra' :
                                 log.type === 'vacation_work_request' ? 'Trabalho em Férias' :
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

          {/* Tabela de Preço Tab Content */}
          <TabsContent value="tarifas">
            <div className="glass-effect p-6 rounded-xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
                  Tabela de Preço
                  <HelpTooltip section="admin_tarifas" />
                </h2>
              </div>
              
              <p className="text-gray-400 text-sm mb-6">
                Configure diferentes tabelas de preço com tarifas e valores de Km específicos. Selecione a tabela adequada ao gerar a Folha de Horas de cada OT.
              </p>
              
              {/* Sub-tabs para as 3 tabelas de preço */}
              <div className="flex gap-2 mb-6 flex-wrap">
                {tabelasPreco.map((tabela) => {
                  const tarifasCount = tarifas.filter(t => (t.table_id || 1) === tabela.table_id && t.ativo).length;
                  return (
                    <button
                      key={tabela.table_id}
                      onClick={() => setSelectedTableId(tabela.table_id)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                        selectedTableId === tabela.table_id
                          ? 'bg-amber-600 text-white'
                          : 'bg-[#1a1a1a] text-gray-400 hover:bg-[#252525] border border-gray-700'
                      }`}
                    >
                      <DollarSign className="w-4 h-4" />
                      {tabela.nome || `Tabela ${tabela.table_id}`}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        selectedTableId === tabela.table_id ? 'bg-amber-700' : 'bg-gray-700'
                      }`}>
                        {tarifasCount}
                      </span>
                    </button>
                  );
                })}
                {/* Botão para criar nova tabela */}
                <button
                  onClick={handleOpenCreateTabelaDialog}
                  className="px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-600/50"
                >
                  <Plus className="w-4 h-4" />
                  Nova Tabela
                </button>
              </div>
              
              {/* Configuração da tabela selecionada */}
              {(() => {
                const tabelaAtual = tabelasPreco.find(t => t.table_id === selectedTableId);
                const tarifasDaTabela = tarifas.filter(t => (t.table_id || 1) === selectedTableId);
                const tarifasAtivas = tarifasDaTabela.filter(t => t.ativo);
                const tarifasInativas = tarifasDaTabela.filter(t => !t.ativo);
                
                return (
                  <>
                    {/* Card de configuração da tabela */}
                    <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 p-4 rounded-lg border border-amber-500/30 mb-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="bg-amber-500/20 p-3 rounded-lg">
                            <DollarSign className="w-6 h-6 text-amber-400" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-amber-400">
                              {tabelaAtual?.nome || `Tabela ${selectedTableId}`}
                            </h3>
                            <p className="text-gray-400 text-sm">
                              Valor por Km: <span className="text-amber-400 font-bold">{(tabelaAtual?.valor_km || 0.65).toFixed(2)}€</span>
                              {' | '}Dieta: <span className="text-amber-400 font-bold">{(tabelaAtual?.valor_dieta || 0).toFixed(2)}€/dia</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => tabelaAtual && handleOpenTabelaDialog(tabelaAtual)}
                            className="bg-amber-600 hover:bg-amber-700 text-white rounded-full"
                            size="sm"
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </Button>
                          {tabelasPreco.length > 1 && (
                            <Button 
                              onClick={() => tabelaAtual && handleDeleteTabela(tabelaAtual.table_id, tabelaAtual.nome)}
                              className="bg-red-600 hover:bg-red-700 text-white rounded-full"
                              size="sm"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Eliminar
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Header das tarifas */}
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold text-white">
                        Tarifas ({tarifasAtivas.length})
                      </h3>
                      <Button 
                        onClick={() => handleOpenTarifaDialog()}
                        className="bg-green-600 hover:bg-green-700 text-white rounded-full"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Nova Tarifa
                      </Button>
                    </div>
                    
                    {/* Grid de tarifas */}
                    {tarifasAtivas.length > 0 ? (
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {tarifasAtivas.map((tarifa) => (
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
                                      tarifa.codigo === 'D' ? 'bg-red-500/20 text-red-400' :
                                      'bg-gray-500/20 text-gray-400'
                                    }`}>
                                      {tarifa.codigo === 'manual' ? 'Manual' : `Código ${tarifa.codigo}`}
                                    </span>
                                  )}
                                  {tarifa.tipo_registo && (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold mt-1 ml-1 ${
                                      tarifa.tipo_registo === 'trabalho' ? 'bg-cyan-500/20 text-cyan-400' :
                                      'bg-purple-500/20 text-purple-400'
                                    }`}>
                                      {tarifa.tipo_registo === 'trabalho' ? 'Trabalho/Oficina' : 'Viagem'}
                                    </span>
                                  )}
                                  {tarifa.tipo_colaborador && (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold mt-1 ml-1 ${
                                      tarifa.tipo_colaborador === 'senior' ? 'bg-purple-600/20 text-purple-300' :
                                      tarifa.tipo_colaborador === 'tecnico' ? 'bg-cyan-600/20 text-cyan-300' :
                                      'bg-yellow-500/20 text-yellow-400'
                                    }`}>
                                      {tarifa.tipo_colaborador === 'senior' ? 'Téc. Sénior' : tarifa.tipo_colaborador === 'tecnico' ? 'Técnico' : 'Téc. Júnior'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-3xl font-bold text-amber-400 mb-2">
                              {tarifa.valor_por_hora.toFixed(2)}€<span className="text-lg text-gray-500">/hora</span>
                            </div>
                            {tarifa.codigo && tarifa.codigo !== 'manual' && (
                              <p className="text-xs text-gray-500 mb-3">
                                Aplica-se a: {tarifa.codigo === '1' ? 'Dias úteis (07h-19h)' :
                                              tarifa.codigo === '2' ? 'Dias úteis (19h-07h)' :
                                              tarifa.codigo === 'S' ? 'Sábados' : 'Domingos/Feriados'}
                                {tarifa.tipo_registo && ` (${tarifa.tipo_registo === 'trabalho' ? 'apenas trabalho/oficina' : 'apenas viagem'})`}
                              </p>
                            )}
                            {tarifa.codigo === 'manual' && (
                              <p className="text-xs text-gray-500 mb-3">
                                Aplicação manual na Folha de Horas
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
                      <div className="text-center text-gray-400 py-12 bg-[#1a1a1a] rounded-lg border border-gray-700">
                        <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Nenhuma tarifa configurada nesta tabela</p>
                        <p className="text-sm mt-2">Crie tarifas para utilizar na Folha de Horas</p>
                      </div>
                    )}
                    
                    {/* Tarifas inativas */}
                    {tarifasInativas.length > 0 && (
                      <div className="mt-8 pt-6 border-t border-gray-700">
                        <h3 className="text-lg font-semibold text-gray-500 mb-4">Tarifas Inativas ({tarifasInativas.length})</h3>
                        <div className="grid md:grid-cols-3 gap-3">
                          {tarifasInativas.map((tarifa) => (
                            <div key={tarifa.id} className="bg-[#1a1a1a] p-3 rounded-lg border border-gray-800 opacity-60">
                              <div className="text-gray-500 text-sm">{tarifa.nome}</div>
                              <div className="text-gray-600">{tarifa.valor_por_hora.toFixed(2)}€/hora</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            
            {/* Dialog para editar/criar configuração da tabela */}
            <Dialog open={!!showTabelaDialog} onOpenChange={(open) => {
              if (!open) setShowTabelaDialog(false);
            }}>
              <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-amber-400" />
                    {showTabelaDialog === 'new' ? 'Nova Tabela de Preço' : `Configuração da Tabela`}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Nome da Tabela {showTabelaDialog === 'new' && '*'}</Label>
                    <Input
                      value={tabelaForm.nome}
                      onChange={(e) => setTabelaForm({...tabelaForm, nome: e.target.value})}
                      className="bg-[#0a0a0a] border-gray-700 text-white"
                      placeholder="Ex: Tabela Standard, Premium..."
                    />
                  </div>
                  <div>
                    <Label>Valor por Km (€) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={tabelaForm.valor_km}
                      onChange={(e) => setTabelaForm({...tabelaForm, valor_km: e.target.value})}
                      className="bg-[#0a0a0a] border-gray-700 text-white"
                      placeholder="Ex: 0.65"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Este valor será usado para calcular o custo dos quilómetros na Folha de Horas
                    </p>
                  </div>
                  <div>
                    <Label>Valor Dieta (€/dia)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={tabelaForm.valor_dieta}
                      onChange={(e) => setTabelaForm({...tabelaForm, valor_dieta: e.target.value})}
                      className="bg-[#0a0a0a] border-gray-700 text-white"
                      placeholder="Ex: 15.00"
                      data-testid="tabela-valor-dieta"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Aplicado automaticamente por dia/técnico na Folha de Horas
                    </p>
                  </div>
                  {showTabelaDialog && showTabelaDialog !== 'new' && (
                    <div>
                      <Label>Imagem da Tabela de Preços</Label>
                      <p className="text-xs text-gray-500 mb-2">
                        Esta imagem será anexada na última página da Folha de Horas
                      </p>
                      <div className="flex gap-2">
                        <Input
                          type="file"
                          accept="image/*"
                          data-testid="tabela-imagem-upload"
                          onChange={async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            const formData = new FormData();
                            formData.append('file', file);
                            try {
                              await axios.post(`${API}/tabelas-preco/${showTabelaDialog}/imagem`, formData, {
                                headers: { 'Content-Type': 'multipart/form-data' }
                              });
                              toast.success('Imagem carregada com sucesso');
                              fetchTabelasPreco();
                            } catch {
                              toast.error('Erro ao carregar imagem');
                            }
                          }}
                          className="bg-[#0a0a0a] border-gray-700 text-white text-xs"
                        />
                      </div>
                      {tabelasPreco.find(t => t.table_id === showTabelaDialog)?.has_imagem && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-green-400">Imagem carregada</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 h-6 px-2 text-xs"
                            onClick={async () => {
                              try {
                                await axios.delete(`${API}/tabelas-preco/${showTabelaDialog}/imagem`);
                                toast.success('Imagem eliminada');
                                fetchTabelasPreco();
                              } catch {
                                toast.error('Erro ao eliminar imagem');
                              }
                            }}
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Remover
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  <Button 
                    onClick={handleSaveTabela} 
                    disabled={loading}
                    className={`w-full text-white rounded-full ${showTabelaDialog === 'new' ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                  >
                    {loading ? 'A guardar...' : (showTabelaDialog === 'new' ? 'Criar Tabela' : 'Guardar Configuração')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
            {/* Dialog para criar/editar tarifa */}
            <Dialog open={showTarifaDialog} onOpenChange={(open) => {
              setShowTarifaDialog(open);
              if (!open) {
                setTarifaForm({ nome: '', valor_por_hora: '', codigo: '', tipo_registo: '', tipo_colaborador: '' });
                setEditingTarifa(null);
              }
            }}>
              <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-amber-400" />
                    {editingTarifa ? 'Editar Tarifa' : `Nova Tarifa (${tabelasPreco.find(t => t.table_id === selectedTableId)?.nome || `Tabela ${selectedTableId}`})`}
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Tipo de Registo</Label>
                      <select
                        value={tarifaForm.tipo_registo}
                        onChange={(e) => setTarifaForm({...tarifaForm, tipo_registo: e.target.value})}
                        className="w-full bg-[#0a0a0a] border border-gray-700 text-white rounded-md p-2"
                      >
                        <option value="">Trabalho/Oficina + Viagem</option>
                        <option value="trabalho">Apenas Trabalho/Oficina</option>
                        <option value="viagem">Apenas Viagem</option>
                      </select>
                    </div>
                    <div>
                      <Label>Código Horário</Label>
                      <select
                        value={tarifaForm.codigo}
                        onChange={(e) => setTarifaForm({...tarifaForm, codigo: e.target.value})}
                        className="w-full bg-[#0a0a0a] border border-gray-700 text-white rounded-md p-2"
                      >
                        <option value="">Todos os códigos</option>
                        <option value="manual">Apenas Selecionar (manual)</option>
                        <option value="1">1 - Dias úteis (07h-19h)</option>
                        <option value="2">2 - Dias úteis (19h-07h)</option>
                        <option value="S">S - Sábado</option>
                        <option value="D">D - Domingos/Feriados</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label>Tipo de Colaborador</Label>
                    <select
                      value={tarifaForm.tipo_colaborador}
                      onChange={(e) => setTarifaForm({...tarifaForm, tipo_colaborador: e.target.value})}
                      className="w-full bg-[#0a0a0a] border border-gray-700 text-white rounded-md p-2"
                      data-testid="tarifa-tipo-colaborador-select"
                    >
                      <option value="">Todas as Funções</option>
                      <option value="junior">Apenas Téc. Júnior</option>
                      <option value="tecnico">Apenas Técnico</option>
                      <option value="senior">Apenas Téc. Sénior</option>
                    </select>
                  </div>
                  <p className="text-xs text-gray-500">
                    {tarifaForm.codigo === 'manual' 
                      ? 'Esta tarifa só será aplicada quando selecionada manualmente na Folha de Horas'
                      : `A tarifa será aplicada automaticamente aos registos ${tarifaForm.tipo_registo ? `de ${tarifaForm.tipo_registo}` : ''} com ${tarifaForm.codigo ? `código ${tarifaForm.codigo}` : 'qualquer código'}`}
                  </p>
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
                  <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
                    Relatório Consolidado
                    <HelpTooltip section="admin_relatorios" />
                  </h2>
                  
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

        {/* All Current Locations Dialog */}
        <Dialog open={showAllLocationsDialog} onOpenChange={setShowAllLocationsDialog}>
          <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Map className="w-5 h-5 text-emerald-400" />
                Mapa de Localizações em Tempo Real
              </DialogTitle>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              {/* Refresh Button */}
              <div className="flex justify-between items-center">
                <p className="text-gray-400 text-sm">
                  Última atualização: {new Date().toLocaleTimeString('pt-PT')}
                </p>
                <Button
                  onClick={fetchAllCurrentLocations}
                  variant="outline"
                  size="sm"
                  className="border-gray-600 text-gray-300"
                  disabled={locationLoading}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${locationLoading ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
              </div>

              {/* Legend */}
              <div className="flex gap-4 text-sm bg-[#0f0f0f] p-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-gray-400">A trabalhar</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-gray-400">Último registo</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <span className="text-gray-400">Fora de zona</span>
                </div>
              </div>

              {/* Map */}
              {locationLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                  <span className="ml-3 text-gray-400">A carregar localizações...</span>
                </div>
              ) : allCurrentLocations.length > 0 ? (
                <div className="space-y-4">
                  <LocationMap
                    locations={allCurrentLocations.map(loc => ({
                      id: loc.user_id || loc.id,
                      latitude: loc.latitude,
                      longitude: loc.longitude,
                      userName: loc.userName,
                      address: loc.address || 'Localização sem endereço',
                      timestamp: loc.timestamp,
                      type: loc.type || (loc.is_active ? 'Entrada' : 'Saída'),
                      isEnd: !loc.is_active,
                    }))}
                    height="400px"
                    zoom={10}
                    useInitials={true}
                  />
                  
                  {/* Legenda */}
                  <div className="bg-gray-800 px-4 py-2 flex items-center justify-center gap-6 text-xs rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">P</div>
                      <span className="text-gray-400">Entrada</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-[10px] font-bold">P</div>
                      <span className="text-gray-400">Saída</span>
                    </div>
                  </div>
                  
                  {/* User List */}
                  <div className="bg-[#0f0f0f] rounded-lg p-4 max-h-48 overflow-y-auto">
                    <h4 className="text-sm font-semibold text-gray-400 mb-3">
                      Colaboradores com localização hoje ({allCurrentLocations.length})
                    </h4>
                    <div className="grid md:grid-cols-2 gap-2">
                      {allCurrentLocations.map((loc, idx) => (
                        <div key={loc.user_id || idx} className="flex items-center justify-between bg-[#1a1a1a] p-3 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${
                              loc.outside_residence_zone ? 'bg-orange-500' : 
                              (loc.is_active ? 'bg-emerald-500' : 'bg-blue-500')
                            }`} />
                            <div>
                              <p className="text-white text-sm font-medium">{loc.userName}</p>
                              <p className="text-gray-400 text-xs">
                                {loc.address || 'Sem endereço'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`text-xs px-2 py-1 rounded ${
                              loc.is_active ? 'bg-emerald-600/20 text-emerald-400' : 'bg-blue-600/20 text-blue-400'
                            }`}>
                              {loc.type}
                            </span>
                            {loc.timestamp && (
                              <p className="text-gray-500 text-xs mt-1">
                                {new Date(loc.timestamp).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <Map className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Sem localizações registadas hoje</p>
                  <p className="text-sm mt-2">Os colaboradores ainda não iniciaram ponto com geolocalização ativa</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AdminDashboard;