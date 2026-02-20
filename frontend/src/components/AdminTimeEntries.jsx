import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { 
  Users, Calendar, Clock, Edit, Trash2, Plus, Save, X, 
  ChevronLeft, ChevronRight, User, FileText, AlertTriangle, Zap, MapPin, Map, ExternalLink, Download 
} from 'lucide-react';
import LocationMap from '@/components/ui/location-map';
import { useMobile } from '@/contexts/MobileContext';

const AdminTimeEntries = ({ user, onLogout }) => {
  const { isMobile } = useMobile();
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [entries, setEntries] = useState([]);
  const [justifications, setJustifications] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  
  // Date range - usando período de faturação (26 a 25)
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [billingPeriod, setBillingPeriod] = useState({ from: '', to: '' });
  
  // Calcular período de faturação (26 do mês anterior a 25 do mês atual)
  const calculateBillingPeriod = (month, year) => {
    let fromYear = year;
    let fromMonth = month - 1;
    
    if (fromMonth === 0) {
      fromMonth = 12;
      fromYear = year - 1;
    }
    
    const fromDate = `${fromYear}-${String(fromMonth).padStart(2, '0')}-26`;
    const toDate = `${year}-${String(month).padStart(2, '0')}-25`;
    
    return { from: fromDate, to: toDate };
  };
  
  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editForm, setEditForm] = useState({
    date: '',
    start_time: '',
    end_time: '',
    observations: '',
    outside_residence_zone: false,
    location_description: ''
  });
  
  // Add entry modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    date: '',
    start_time: '',
    end_time: '',
    observations: '',
    outside_residence_zone: false,
    location_description: ''
  });

  // Justify Day modal
  const [showJustifyModal, setShowJustifyModal] = useState(false);
  const [justifyingDay, setJustifyingDay] = useState(null);
  const [justifyLoading, setJustifyLoading] = useState(false);

  // Helper function to format decimal hours as HH:MM
  const formatHours = (decimalHours) => {
    if (!decimalHours) return '0h00m';
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours}h${String(minutes).padStart(2, '0')}m`;
  };

  // Gerar todos os dias do período de faturação
  const generateAllDaysInPeriod = (fromDate, toDate) => {
    const days = [];
    const start = new Date(fromDate + 'T00:00:00');
    const end = new Date(toDate + 'T00:00:00');
    
    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      days.push(dateStr);
      current.setDate(current.getDate() + 1);
    }
    return days;
  };

  // Group entries by date - mostrando TODOS os dias do período
  const groupEntriesByDate = (entries, period, dayJustifications) => {
    // Gerar todos os dias do período de faturação
    const allDays = period.from && period.to 
      ? generateAllDaysInPeriod(period.from, period.to) 
      : [];

    // Agrupar entradas existentes por data
    const grouped = (entries || []).reduce((acc, entry) => {
      const date = entry.date;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(entry);
      return acc;
    }, {});

    // Ordenar todos os dias (mais recente primeiro)
    const sortedDays = allDays.sort((a, b) => new Date(b) - new Date(a));

    return sortedDays.map(date => {
      const dayEntries = grouped[date] || [];
      const totalHours = dayEntries.reduce((sum, entry) => sum + (entry.total_hours || 0), 0);
      
      // Extrair localizações GPS dos registos do dia
      const locations = dayEntries
        .filter(entry => entry.geo_location?.latitude && entry.geo_location?.longitude)
        .map((entry, idx) => ({
          id: `${entry.id}_${idx}`,
          latitude: entry.geo_location.latitude,
          longitude: entry.geo_location.longitude,
          accuracy: entry.geo_location.accuracy,
          timestamp: entry.start_time,
          address: entry.geo_location.address?.locality || 
                   entry.geo_location.address?.city || 
                   entry.geo_location.address?.formatted ||
                   entry.location_description,
          type: entry.status === 'active' ? 'Entrada' : 'Registo',
          color: entry.outside_residence_zone ? 'orange' : 'green',
          outside_residence_zone: entry.outside_residence_zone
        }));
      
      // Verificar se é fim de semana
      const dayOfWeek = new Date(date + 'T00:00:00').getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      // Obter justificação do dia (se existir)
      const justification = dayJustifications?.[date] || null;
      
      return {
        date,
        entries: dayEntries.sort((a, b) => {
          if (!a.start_time) return 1;
          if (!b.start_time) return -1;
          return new Date(a.start_time) - new Date(b.start_time);
        }),
        totalHours,
        locations,
        hasGeoData: locations.length > 0,
        hasEntries: dayEntries.length > 0,
        isWeekend,
        justification
      };
    });
  };

  useEffect(() => {
    fetchAllUsers();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchUserEntries();
    }
  }, [selectedUser, selectedMonth, selectedYear]);

  const fetchAllUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await axios.get(`${API}/admin/users`);
      setAllUsers(response.data);
      if (response.data.length > 0) {
        setSelectedUser(response.data[0]);
      }
    } catch (error) {
      toast.error('Erro ao carregar utilizadores');
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchUserEntries = async () => {
    if (!selectedUser) return;
    
    setLoading(true);
    try {
      const period = calculateBillingPeriod(selectedMonth, selectedYear);
      setBillingPeriod(period);
      
      const response = await axios.get(`${API}/admin/time-entries/user/${selectedUser.id}`, {
        params: {
          date_from: period.from,
          date_to: period.to
        }
      });
      setEntries(response.data.entries || []);
      setJustifications(response.data.justifications || {});
    } catch (error) {
      toast.error('Erro ao carregar entradas do utilizador');
      setEntries([]);
      setJustifications({});
    } finally {
      setLoading(false);
    }
  };

  const handleEditEntry = (entry) => {
    setEditingEntry(entry);
    setEditForm({
      date: entry.date,
      start_time: entry.start_time ? new Date(entry.start_time).toTimeString().slice(0, 5) : '',
      end_time: entry.end_time ? new Date(entry.end_time).toTimeString().slice(0, 5) : '',
      observations: entry.observations || '',
      outside_residence_zone: entry.outside_residence_zone || false,
      location_description: entry.location_description || ''
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;
    
    try {
      const updateData = {
        observations: editForm.observations,
        outside_residence_zone: editForm.outside_residence_zone,
        location_description: editForm.location_description
      };
      
      // Build datetime strings if times are provided
      if (editForm.start_time) {
        updateData.start_time = `${editForm.date}T${editForm.start_time}:00`;
      }
      if (editForm.end_time) {
        updateData.end_time = `${editForm.date}T${editForm.end_time}:00`;
      }
      
      await axios.put(`${API}/admin/time-entries/${editingEntry.id}`, updateData);
      
      toast.success('Entrada atualizada com sucesso!');
      setShowEditModal(false);
      setEditingEntry(null);
      fetchUserEntries();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao atualizar entrada');
    }
  };

  const handleDeleteEntry = async (entryId) => {
    if (!window.confirm('Tem certeza que deseja eliminar esta entrada?')) return;
    
    try {
      await axios.delete(`${API}/admin/time-entries/${entryId}`);
      toast.success('Entrada eliminada com sucesso!');
      fetchUserEntries();
    } catch (error) {
      toast.error('Erro ao eliminar entrada');
    }
  };

  const handleAdjustTo8Hours = async (entryId, dayDate) => {
    if (!window.confirm('Ajustar automaticamente este dia para 8 horas totais?')) {
      return;
    }

    try {
      await axios.post(`${API}/admin/time-entries/${entryId}/adjust-to-8h`, {
        register_observation: true,
        user_id: selectedUser?.id,
        date: dayDate
      });
      toast.success('Dia ajustado para 8 horas com sucesso!');
      fetchUserEntries();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao ajustar horas');
    }
  };

  // Abrir modal de justificar dia
  const openJustifyModal = (day) => {
    setJustifyingDay(day);
    setShowJustifyModal(true);
  };

  // Aplicar justificação ao dia
  const handleJustifyDay = async (justificationType) => {
    if (!selectedUser || !justifyingDay) return;

    setJustifyLoading(true);
    try {
      const response = await axios.post(`${API}/admin/time-entries/justify-day`, {
        user_id: selectedUser.id,
        date: justifyingDay.date,
        justification_type: justificationType
      });
      
      toast.success(response.data.message || 'Dia justificado com sucesso!');
      setShowJustifyModal(false);
      setJustifyingDay(null);
      fetchUserEntries();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao justificar dia');
    } finally {
      setJustifyLoading(false);
    }
  };

  // Download PDF do relatório mensal
  const handleDownloadPDF = async () => {
    if (!selectedUser) {
      toast.error('Selecione um utilizador');
      return;
    }

    try {
      const params = new URLSearchParams({
        month: selectedMonth,
        year: selectedYear,
        user_id: selectedUser.id
      });
      
      const token = localStorage.getItem('token');
      const url = `${API}/time-entries/reports/monthly-pdf?${params.toString()}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const blob = await response.blob();
      
      // Download
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      const userName = (selectedUser.full_name || selectedUser.username).replace(/\s+/g, '_');
      link.download = `Relatorio_${userName}_${selectedMonth}_${selectedYear}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      toast.success('PDF exportado com sucesso!');
    } catch (error) {
      console.error('Erro download PDF:', error);
      toast.error('Erro ao exportar PDF');
    }
  };

  const handleAddEntry = async () => {
    if (!selectedUser || !addForm.date || !addForm.start_time || !addForm.end_time) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    
    try {
      const entryData = {
        user_id: selectedUser.id,
        date: addForm.date,
        start_time: `${addForm.date}T${addForm.start_time}:00`,
        end_time: `${addForm.date}T${addForm.end_time}:00`,
        observations: addForm.observations,
        outside_residence_zone: addForm.outside_residence_zone,
        location_description: addForm.location_description
      };
      
      await axios.post(`${API}/admin/time-entries`, entryData);
      
      toast.success('Entrada adicionada com sucesso!');
      setShowAddModal(false);
      setAddForm({
        date: '',
        start_time: '',
        end_time: '',
        observations: '',
        outside_residence_zone: false,
        location_description: ''
      });
      fetchUserEntries();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao adicionar entrada');
    }
  };

  const changeMonth = (delta) => {
    let newMonth = selectedMonth + delta;
    let newYear = selectedYear;
    
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    
    setSelectedMonth(newMonth);
    setSelectedYear(newYear);
  };

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  // Calculate totals
  const totalHours = entries.reduce((sum, entry) => sum + (entry.total_hours || 0), 0);
  const totalDays = new Set(entries.map(e => e.date)).size;

  if (!user?.is_admin) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Acesso Negado</h1>
          <p className="text-gray-400">Esta página é apenas para administradores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {!isMobile && <Navigation user={user} onLogout={onLogout} activePage="admin" />}
      
      <div className={`container mx-auto ${isMobile ? 'px-3 py-4 pb-24' : 'px-4 py-8'} max-w-7xl`}>
        <div className="fade-in">
          {/* Header */}
          <div className={`flex ${isMobile ? 'flex-col gap-3' : 'justify-between items-center'} mb-6`}>
            <div className="flex items-center gap-3">
              <div className={`bg-gradient-to-br from-purple-500 to-purple-600 ${isMobile ? 'p-2' : 'p-2.5'} rounded-xl`}>
                <FileText className={`${isMobile ? 'w-5 h-5' : 'w-7 h-7'} text-white`} />
              </div>
              <h1 className={`${isMobile ? 'text-xl' : 'text-3xl'} font-bold text-white`}>
                {isMobile ? 'Entradas' : 'Gestão de Entradas'}
              </h1>
            </div>
            <Button
              onClick={() => window.location.href = '/admin'}
              variant="outline"
              className={`border-gray-600 text-gray-300 hover:bg-gray-800 ${isMobile ? 'w-full' : ''}`}
              size={isMobile ? 'sm' : 'default'}
            >
              ← {isMobile ? 'Admin' : 'Voltar ao Admin'}
            </Button>
          </div>

          {/* User Selection Bar */}
          <div className={`glass-effect ${isMobile ? 'p-3' : 'p-4'} rounded-xl mb-4`}>
            <div className={`flex items-center gap-2 ${isMobile ? 'mb-2' : 'mb-3'}`}>
              <Users className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-blue-400`} />
              <span className={`text-white font-semibold ${isMobile ? 'text-sm' : ''}`}>
                {isMobile ? 'Utilizador:' : 'Selecionar Utilizador:'}
              </span>
            </div>
            
            {loadingUsers ? (
              <div className={`text-gray-400 ${isMobile ? 'text-sm' : ''}`}>A carregar...</div>
            ) : (
              <div className={`flex ${isMobile ? 'overflow-x-auto pb-2 gap-2 -mx-3 px-3' : 'flex-wrap gap-2'}`}>
                {allUsers.map((u) => (
                  <Button
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className={`${
                      selectedUser?.id === u.id
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                    } ${isMobile ? 'flex-shrink-0 text-xs px-3 py-1.5' : ''}`}
                    size={isMobile ? 'sm' : 'default'}
                  >
                    <User className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'}`} />
                    {isMobile ? (u.full_name?.split(' ')[0] || u.username) : (u.full_name || u.username)}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {selectedUser && (
            <>
              {/* Month/Year Navigation and Add Button */}
              <div className={`glass-effect ${isMobile ? 'p-3' : 'p-4'} rounded-xl mb-4`}>
                <div className={`flex flex-col ${isMobile ? 'gap-3' : 'md:flex-row justify-between items-center gap-4'}`}>
                  {/* Month Navigation */}
                  <div className="flex items-center justify-center gap-2 w-full md:w-auto">
                    <Button
                      onClick={() => changeMonth(-1)}
                      variant="outline"
                      size="icon"
                      className={`border-gray-600 ${isMobile ? 'h-8 w-8' : ''}`}
                    >
                      <ChevronLeft className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
                    </Button>
                    
                    <div className={`text-center ${isMobile ? 'min-w-[180px]' : 'min-w-[280px]'}`}>
                      <div className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold text-white`}>
                        {isMobile ? monthNames[selectedMonth - 1].slice(0, 3) : monthNames[selectedMonth - 1]} {selectedYear}
                      </div>
                      <div className={`${isMobile ? 'text-[10px]' : 'text-sm'} text-blue-400 mt-0.5`}>
                        {billingPeriod.from && billingPeriod.to && (
                          <>
                            {new Date(billingPeriod.from + 'T00:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                            {' → '}
                            {new Date(billingPeriod.to + 'T00:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                          </>
                        )}
                      </div>
                      {!isMobile && (
                        <div className="text-xs text-gray-400">
                          {selectedUser.full_name || selectedUser.username}
                        </div>
                      )}
                    </div>
                    
                    <Button
                      onClick={() => changeMonth(1)}
                      variant="outline"
                      size="icon"
                      className={`border-gray-600 ${isMobile ? 'h-8 w-8' : ''}`}
                    >
                      <ChevronRight className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
                    </Button>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className={`flex ${isMobile ? 'w-full' : ''} gap-2`}>
                    <Button
                      onClick={() => {
                        setAddForm({
                          ...addForm,
                          date: new Date().toISOString().split('T')[0]
                        });
                        setShowAddModal(true);
                      }}
                      className={`bg-green-600 hover:bg-green-700 text-white ${isMobile ? 'flex-1 text-xs py-2' : ''}`}
                      size={isMobile ? 'sm' : 'default'}
                    >
                      <Plus className={`${isMobile ? 'w-3.5 h-3.5 mr-1' : 'w-5 h-5 mr-2'}`} />
                      {isMobile ? 'Adicionar' : 'Adicionar Entrada'}
                    </Button>
                    <Button
                      onClick={handleDownloadPDF}
                      className={`bg-blue-600 hover:bg-blue-700 text-white ${isMobile ? 'flex-1 text-xs py-2' : ''}`}
                      size={isMobile ? 'sm' : 'default'}
                      data-testid="download-pdf-btn"
                    >
                      <Download className={`${isMobile ? 'w-3.5 h-3.5 mr-1' : 'w-5 h-5 mr-2'}`} />
                      {isMobile ? 'PDF' : 'Download PDF'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className={`grid ${isMobile ? 'grid-cols-3 gap-2' : 'grid-cols-1 md:grid-cols-3 gap-4'} mb-4`}>
                <div className={`glass-effect ${isMobile ? 'p-2.5' : 'p-4'} rounded-xl`}>
                  <div className={`text-gray-400 ${isMobile ? 'text-[10px]' : 'text-sm'} mb-0.5`}>Total Horas</div>
                  <div className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold text-green-400`}>{formatHours(totalHours)}</div>
                </div>
                <div className={`glass-effect ${isMobile ? 'p-2.5' : 'p-4'} rounded-xl`}>
                  <div className={`text-gray-400 ${isMobile ? 'text-[10px]' : 'text-sm'} mb-0.5`}>Dias</div>
                  <div className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold text-blue-400`}>{totalDays}</div>
                </div>
                <div className={`glass-effect ${isMobile ? 'p-2.5' : 'p-4'} rounded-xl`}>
                  <div className={`text-gray-400 ${isMobile ? 'text-[10px]' : 'text-sm'} mb-0.5`}>Entradas</div>
                  <div className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold text-purple-400`}>{entries.length}</div>
                </div>
              </div>

              {/* Entries List */}
              <div className={`glass-effect ${isMobile ? 'p-3' : 'p-6'} rounded-xl`}>
                <h3 className={`${isMobile ? 'text-base' : 'text-xl'} font-semibold text-white ${isMobile ? 'mb-3' : 'mb-4'} flex items-center gap-2`}>
                  <Calendar className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
                  {isMobile ? 'Registos' : 'Registos do Período de Faturação'}
                </h3>

                {loading ? (
                  <div className={`text-center ${isMobile ? 'py-8' : 'py-12'}`}>
                    <div className={`inline-block animate-spin rounded-full ${isMobile ? 'h-8 w-8' : 'h-12 w-12'} border-4 border-blue-500 border-t-transparent`}></div>
                    <p className={`text-gray-400 ${isMobile ? 'mt-2 text-sm' : 'mt-4'}`}>A carregar...</p>
                  </div>
                ) : (
                  <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
                    {groupEntriesByDate(entries, billingPeriod, justifications).map((day) => (
                      <div
                        key={day.date}
                        className={`rounded-lg ${isMobile ? 'p-3' : 'p-4'} border ${
                          day.justification?.type === 'ferias' 
                            ? 'bg-blue-950/40 border-blue-700/50'
                            : day.justification?.type === 'folga'
                              ? 'bg-amber-950/40 border-amber-700/50'
                              : day.justification?.type === 'falta'
                                ? 'bg-red-950/40 border-red-700/50'
                                : day.justification?.type === 'cancelamento_ferias'
                                  ? 'bg-cyan-950/40 border-cyan-700/50'
                                  : day.isWeekend 
                                    ? 'bg-[#1a1a2e] border-indigo-900/50' 
                                    : day.hasEntries 
                                      ? 'bg-[#1a1a1a] border-gray-700' 
                                      : 'bg-[#151515] border-gray-800'
                        }`}
                      >
                        {/* Day Header */}
                        <div className={`flex ${isMobile ? 'flex-col gap-2' : 'justify-between items-center'} ${day.hasEntries || day.justification ? `${isMobile ? 'mb-2 pb-2' : 'mb-3 pb-3'} border-b border-gray-700` : ''}`}>
                          <div className={`flex ${isMobile ? 'flex-wrap' : ''} items-center gap-2`}>
                            <div className={`font-bold ${isMobile ? 'text-sm' : 'text-lg'} ${
                              day.justification?.type === 'ferias' 
                                ? 'text-blue-300'
                                : day.justification?.type === 'folga'
                                  ? 'text-amber-300'
                                  : day.justification?.type === 'falta'
                                    ? 'text-red-300'
                                    : day.justification?.type === 'cancelamento_ferias'
                                      ? 'text-cyan-300'
                                      : day.isWeekend 
                                        ? 'text-indigo-300' 
                                        : day.hasEntries 
                                          ? 'text-white' 
                                          : 'text-gray-400'
                            }`}>
                              {new Date(day.date + 'T00:00:00').toLocaleDateString('pt-PT', {
                                weekday: isMobile ? 'short' : 'long',
                                day: 'numeric',
                                month: isMobile ? 'short' : 'long',
                                year: isMobile ? '2-digit' : 'numeric'
                              })}
                            </div>
                            {/* Badges */}
                            {day.justification?.type === 'ferias' && (
                              <span className={`${isMobile ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} bg-blue-600/30 text-blue-300 rounded-full font-medium`}>
                                {isMobile ? 'Férias' : day.justification.label}
                              </span>
                            )}
                            {day.justification?.type === 'folga' && (
                              <span className={`${isMobile ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} bg-amber-600/30 text-amber-300 rounded-full font-medium`}>
                                {isMobile ? 'Folga' : day.justification.label}
                              </span>
                            )}
                            {day.justification?.type === 'falta' && (
                              <span className={`${isMobile ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} bg-red-600/30 text-red-300 rounded-full font-medium`}>
                                Falta
                              </span>
                            )}
                            {day.justification?.type === 'cancelamento_ferias' && (
                              <span className={`${isMobile ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} bg-cyan-600/30 text-cyan-300 rounded-full font-medium`}>
                                {isMobile ? 'Canc.' : day.justification.label}
                              </span>
                            )}
                            {!day.justification && day.isWeekend && (
                              <span className={`${isMobile ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} bg-indigo-600/20 text-indigo-400 rounded-full`}>
                                {isMobile ? 'F.S.' : 'Fim de semana'}
                              </span>
                            )}
                            {!day.justification && !day.hasEntries && !day.isWeekend && (
                              <span className={`${isMobile ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} bg-gray-700/50 text-gray-400 rounded-full`}>
                                {isMobile ? 'S/reg' : 'Sem registo'}
                              </span>
                            )}
                            {day.hasGeoData && (
                              <span className={`${isMobile ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} bg-emerald-600/20 text-emerald-400 rounded-full flex items-center gap-1`}>
                                <MapPin className={isMobile ? 'w-2 h-2' : 'w-3 h-3'} />
                                GPS
                              </span>
                            )}
                          </div>
                          <div className={`flex items-center ${isMobile ? 'justify-between w-full' : 'gap-3'}`}>
                            <div className="flex gap-1.5">
                              {day.entries.length > 0 && (
                                <Button
                                  onClick={() => handleAdjustTo8Hours(day.entries[0].id, day.date)}
                                  className={`bg-yellow-600 hover:bg-yellow-700 text-white ${isMobile ? 'text-[10px] px-2 py-1 h-7' : 'text-sm'}`}
                                  size={isMobile ? 'sm' : 'default'}
                                  title="Ajustar para 8h"
                                >
                                  <Zap className={isMobile ? 'w-3 h-3' : 'w-4 h-4 mr-1'} />
                                  {!isMobile && '8h'}
                                </Button>
                              )}
                              <Button
                                onClick={() => openJustifyModal(day)}
                                className={`bg-purple-600 hover:bg-purple-700 text-white ${isMobile ? 'text-[10px] px-2 py-1 h-7' : 'text-sm'}`}
                                size={isMobile ? 'sm' : 'default'}
                                data-testid={`justify-day-btn-${day.date}`}
                              >
                                <FileText className={isMobile ? 'w-3 h-3' : 'w-4 h-4 mr-1'} />
                                {!isMobile && 'Justificar'}
                              </Button>
                            </div>
                            <div className={`font-bold ${isMobile ? 'text-base' : 'text-xl'} ${day.totalHours > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                              {formatHours(day.totalHours)}
                            </div>
                          </div>
                        </div>

                        {/* Map with locations for this day */}
                        {day.hasGeoData && !isMobile && (
                          <div className="mb-4 space-y-2">
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                              <Map className="w-4 h-4 text-emerald-400" />
                              <span>Localização GPS do dia</span>
                            </div>
                            <LocationMap
                              locations={day.locations}
                              height="200px"
                              zoom={14}
                            />
                            {/* Location details */}
                            <div className="flex flex-wrap gap-2 mt-2">
                              {day.locations.map((loc, idx) => (
                                <div key={loc.id || idx} className="flex items-center gap-2 bg-[#0f0f0f] px-3 py-2 rounded-lg text-xs">
                                  <div className={`w-2 h-2 rounded-full ${loc.outside_residence_zone ? 'bg-orange-500' : 'bg-emerald-500'}`} />
                                  <div>
                                    <span className="text-white">
                                      {loc.timestamp ? new Date(loc.timestamp).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                    </span>
                                    {loc.address && (
                                      <span className="text-gray-400 ml-2">{loc.address}</span>
                                    )}
                                    {loc.outside_residence_zone && (
                                      <span className="text-orange-400 ml-2">(Fora de zona)</span>
                                    )}
                                  </div>
                                  <a
                                    href={`https://www.openstreetmap.org/?mlat=${loc.latitude}&mlon=${loc.longitude}&zoom=17`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 ml-2"
                                    title="Ver no OpenStreetMap"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Mobile: GPS summary */}
                        {day.hasGeoData && isMobile && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {day.locations.slice(0, 2).map((loc, idx) => (
                              <a
                                key={loc.id || idx}
                                href={`https://www.openstreetmap.org/?mlat=${loc.latitude}&mlon=${loc.longitude}&zoom=17`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 bg-[#0f0f0f] px-2 py-1 rounded text-[10px] text-emerald-400"
                              >
                                <MapPin className="w-2.5 h-2.5" />
                                {loc.timestamp ? new Date(loc.timestamp).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : 'GPS'}
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            ))}
                            {day.locations.length > 2 && (
                              <span className="text-[10px] text-gray-500 px-2 py-1">+{day.locations.length - 2}</span>
                            )}
                          </div>
                        )}

                        {/* Entries for this day */}
                        {day.hasEntries && (
                          <div className={`space-y-2 ${isMobile ? 'mt-2' : 'mt-3'}`}>
                            {day.entries.map((entry, index) => (
                              <div
                                key={entry.id || index}
                                className={`flex ${isMobile ? 'flex-col gap-2' : 'justify-between items-center'} bg-[#0f0f0f] ${isMobile ? 'p-2.5' : 'p-3'} rounded`}
                              >
                                <div className="flex-1">
                                  <div className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-400`}>
                                    <span className="text-blue-400 font-semibold">#{index + 1}</span>
                                    {' • '}
                                    {entry.start_time ? new Date(entry.start_time).toLocaleTimeString('pt-PT', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    }) : '-'}
                                    {' → '}
                                    {entry.end_time ? new Date(entry.end_time).toLocaleTimeString('pt-PT', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    }) : '-'}
                                    {entry.geo_location?.latitude && (
                                      <span className={`ml-2 text-emerald-400 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
                                        <MapPin className={`${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'} inline mr-0.5`} />
                                        GPS
                                      </span>
                                    )}
                                  </div>
                                  {entry.observations && !isMobile && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      💬 {entry.observations}
                                    </div>
                                  )}
                                  {entry.outside_residence_zone && (
                                    <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-orange-400 mt-0.5`}>
                                      📍 {isMobile ? 'Fora zona' : `Fora da zona: ${entry.location_description}`}
                                    </div>
                                  )}
                                  {entry.geo_location?.address && !isMobile && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      📍 {entry.geo_location.address.locality || entry.geo_location.address.city || entry.geo_location.address.formatted}
                                      {entry.geo_location.accuracy && (
                                        <span className="text-gray-600 ml-2">(±{Math.round(entry.geo_location.accuracy)}m)</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className={`flex items-center ${isMobile ? 'justify-between w-full' : 'gap-2 ml-4'}`}>
                                  <div className={`text-green-400 font-semibold ${isMobile ? 'text-sm' : 'mr-2'}`}>
                                    {formatHours(entry.total_hours)}
                                  </div>
                                  <div className="flex gap-1.5">
                                    <Button
                                      onClick={() => handleEditEntry(entry)}
                                      size="sm"
                                      variant="outline"
                                      className={`border-blue-500 text-blue-500 hover:bg-blue-500/10 ${isMobile ? 'h-7 w-7 p-0' : ''}`}
                                    >
                                      <Edit className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                                    </Button>
                                    <Button
                                      onClick={() => handleDeleteEntry(entry.id)}
                                      size="sm"
                                      variant="outline"
                                      className={`border-red-500 text-red-500 hover:bg-red-500/10 ${isMobile ? 'h-7 w-7 p-0' : ''}`}
                                    >
                                      <Trash2 className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Edit Entry Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className={`bg-[#1a1a1a] border-gray-700 text-white ${isMobile ? 'max-w-[95vw] max-h-[85vh] overflow-y-auto rounded-xl' : 'max-w-md'}`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 text-white ${isMobile ? 'text-base' : ''}`}>
              <Edit className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-blue-400`} />
              Editar Entrada
            </DialogTitle>
          </DialogHeader>

          <div className={`space-y-3 ${isMobile ? 'mt-2' : 'mt-4'}`}>
            <div>
              <Label className={`text-gray-300 ${isMobile ? 'text-xs' : ''}`}>Data</Label>
              <Input
                type="date"
                value={editForm.date}
                onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                className={`bg-[#0f0f0f] border-gray-700 text-white ${isMobile ? 'text-sm' : ''}`}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={`text-gray-300 ${isMobile ? 'text-xs' : ''}`}>Início</Label>
                <Input
                  type="time"
                  value={editForm.start_time}
                  onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                  className={`bg-[#0f0f0f] border-gray-700 text-white ${isMobile ? 'text-sm' : ''}`}
                />
              </div>
              <div>
                <Label className={`text-gray-300 ${isMobile ? 'text-xs' : ''}`}>Fim</Label>
                <Input
                  type="time"
                  value={editForm.end_time}
                  onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                  className={`bg-[#0f0f0f] border-gray-700 text-white ${isMobile ? 'text-sm' : ''}`}
                />
              </div>
            </div>
            
            {!isMobile && (
              <div>
                <Label className="text-gray-300">Observações</Label>
                <Textarea
                  value={editForm.observations}
                  onChange={(e) => setEditForm({ ...editForm, observations: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  rows={2}
                />
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit_outside_zone"
                checked={editForm.outside_residence_zone}
                onChange={(e) => setEditForm({ ...editForm, outside_residence_zone: e.target.checked })}
                className="w-4 h-4"
              />
              <Label htmlFor="edit_outside_zone" className={`text-gray-300 ${isMobile ? 'text-xs' : ''}`}>
                Fora da zona
              </Label>
            </div>
            
            {editForm.outside_residence_zone && (
              <div>
                <Label className={`text-gray-300 ${isMobile ? 'text-xs' : ''}`}>Local</Label>
                <Input
                  value={editForm.location_description}
                  onChange={(e) => setEditForm({ ...editForm, location_description: e.target.value })}
                  className={`bg-[#0f0f0f] border-gray-700 text-white ${isMobile ? 'text-sm' : ''}`}
                  placeholder="Descreva o local"
                />
              </div>
            )}
            
            <div className={`flex gap-2 ${isMobile ? 'pt-2' : 'pt-4'}`}>
              <Button
                onClick={() => setShowEditModal(false)}
                variant="outline"
                className={`flex-1 border-gray-600 ${isMobile ? 'text-sm' : ''}`}
                size={isMobile ? 'sm' : 'default'}
              >
                <X className={`${isMobile ? 'w-3.5 h-3.5 mr-1' : 'w-4 h-4 mr-2'}`} />
                Cancelar
              </Button>
              <Button
                onClick={handleSaveEdit}
                className={`flex-1 bg-blue-600 hover:bg-blue-700 ${isMobile ? 'text-sm' : ''}`}
                size={isMobile ? 'sm' : 'default'}
              >
                <Save className={`${isMobile ? 'w-3.5 h-3.5 mr-1' : 'w-4 h-4 mr-2'}`} />
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Entry Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className={`bg-[#1a1a1a] border-gray-700 text-white ${isMobile ? 'max-w-[95vw] max-h-[85vh] overflow-y-auto rounded-xl' : 'max-w-md'}`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 text-white ${isMobile ? 'text-base' : ''}`}>
              <Plus className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-green-400`} />
              {isMobile ? 'Adicionar' : `Adicionar Entrada para ${selectedUser?.full_name || selectedUser?.username}`}
            </DialogTitle>
          </DialogHeader>

          <div className={`space-y-3 ${isMobile ? 'mt-2' : 'mt-4'}`}>
            <div>
              <Label className={`text-gray-300 ${isMobile ? 'text-xs' : ''}`}>Data *</Label>
              <Input
                type="date"
                value={addForm.date}
                onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                className={`bg-[#0f0f0f] border-gray-700 text-white ${isMobile ? 'text-sm' : ''}`}
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={`text-gray-300 ${isMobile ? 'text-xs' : ''}`}>Início *</Label>
                <Input
                  type="time"
                  value={addForm.start_time}
                  onChange={(e) => setAddForm({ ...addForm, start_time: e.target.value })}
                  className={`bg-[#0f0f0f] border-gray-700 text-white ${isMobile ? 'text-sm' : ''}`}
                  required
                />
              </div>
              <div>
                <Label className={`text-gray-300 ${isMobile ? 'text-xs' : ''}`}>Fim *</Label>
                <Input
                  type="time"
                  value={addForm.end_time}
                  onChange={(e) => setAddForm({ ...addForm, end_time: e.target.value })}
                  className={`bg-[#0f0f0f] border-gray-700 text-white ${isMobile ? 'text-sm' : ''}`}
                  required
                />
              </div>
            </div>
            
            {!isMobile && (
              <div>
                <Label className="text-gray-300">Observações</Label>
                <Textarea
                  value={addForm.observations}
                  onChange={(e) => setAddForm({ ...addForm, observations: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  rows={2}
                />
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="add_outside_zone"
                checked={addForm.outside_residence_zone}
                onChange={(e) => setAddForm({ ...addForm, outside_residence_zone: e.target.checked })}
                className="w-4 h-4"
              />
              <Label htmlFor="add_outside_zone" className={`text-gray-300 ${isMobile ? 'text-xs' : ''}`}>
                Fora da zona
              </Label>
            </div>
            
            {addForm.outside_residence_zone && (
              <div>
                <Label className={`text-gray-300 ${isMobile ? 'text-xs' : ''}`}>Local</Label>
                <Input
                  value={addForm.location_description}
                  onChange={(e) => setAddForm({ ...addForm, location_description: e.target.value })}
                  className={`bg-[#0f0f0f] border-gray-700 text-white ${isMobile ? 'text-sm' : ''}`}
                  placeholder="Descreva o local"
                />
              </div>
            )}
            
            <div className={`flex gap-2 ${isMobile ? 'pt-2' : 'pt-4'}`}>
              <Button
                onClick={() => setShowAddModal(false)}
                variant="outline"
                className={`flex-1 border-gray-600 ${isMobile ? 'text-sm' : ''}`}
                size={isMobile ? 'sm' : 'default'}
              >
                <X className={`${isMobile ? 'w-3.5 h-3.5 mr-1' : 'w-4 h-4 mr-2'}`} />
                Cancelar
              </Button>
              <Button
                onClick={handleAddEntry}
                className={`flex-1 bg-green-600 hover:bg-green-700 ${isMobile ? 'text-sm' : ''}`}
                size={isMobile ? 'sm' : 'default'}
              >
                <Plus className={`${isMobile ? 'w-3.5 h-3.5 mr-1' : 'w-4 h-4 mr-2'}`} />
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Justificar Dia */}
      <Dialog open={showJustifyModal} onOpenChange={setShowJustifyModal}>
        <DialogContent className={`bg-[#1a1a1a] border-gray-700 text-white ${isMobile ? 'max-w-[95vw] rounded-xl' : 'max-w-md'}`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${isMobile ? 'text-base' : ''}`}>
              <FileText className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-purple-400`} />
              Justificar Dia
            </DialogTitle>
          </DialogHeader>

          <div className={`space-y-3 ${isMobile ? 'mt-2' : 'mt-4'}`}>
            {justifyingDay && (
              <div className={`bg-[#0f0f0f] ${isMobile ? 'p-2.5' : 'p-3'} rounded-lg`}>
                <p className={`text-gray-400 ${isMobile ? 'text-[10px]' : 'text-sm'}`}>Utilizador</p>
                <p className={`text-white font-semibold ${isMobile ? 'text-sm' : ''}`}>{selectedUser?.full_name || selectedUser?.username}</p>
                <p className={`text-gray-400 ${isMobile ? 'text-[10px]' : 'text-sm'} mt-1`}>Data</p>
                <p className={`text-white font-semibold ${isMobile ? 'text-sm' : ''}`}>
                  {new Date(justifyingDay.date + 'T00:00:00').toLocaleDateString('pt-PT', {
                    weekday: isMobile ? 'short' : 'long',
                    day: 'numeric',
                    month: isMobile ? 'short' : 'long',
                    year: isMobile ? '2-digit' : 'numeric'
                  })}
                </p>
              </div>
            )}

            <p className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-sm'}`}>Selecione o tipo:</p>

            <div className={`grid ${isMobile ? 'grid-cols-2' : ''} gap-2`}>
              <Button
                onClick={() => handleJustifyDay('ferias')}
                disabled={justifyLoading}
                className={`${isMobile ? '' : 'w-full'} bg-blue-600 hover:bg-blue-700 text-white justify-start ${isMobile ? 'text-xs py-2' : ''}`}
                size={isMobile ? 'sm' : 'default'}
              >
                <Calendar className={`${isMobile ? 'w-3.5 h-3.5 mr-1.5' : 'w-5 h-5 mr-3'}`} />
                Férias
              </Button>

              <Button
                onClick={() => handleJustifyDay('dar_dia')}
                disabled={justifyLoading}
                className={`${isMobile ? '' : 'w-full'} bg-green-600 hover:bg-green-700 text-white justify-start ${isMobile ? 'text-xs py-2' : ''}`}
                size={isMobile ? 'sm' : 'default'}
              >
                <Plus className={`${isMobile ? 'w-3.5 h-3.5 mr-1.5' : 'w-5 h-5 mr-3'}`} />
                {isMobile ? 'Dar 8h' : 'Dar Dia (8h automáticas)'}
              </Button>

              <Button
                onClick={() => handleJustifyDay('folga')}
                disabled={justifyLoading}
                className={`${isMobile ? '' : 'w-full'} bg-amber-600 hover:bg-amber-700 text-white justify-start ${isMobile ? 'text-xs py-2' : ''}`}
                size={isMobile ? 'sm' : 'default'}
              >
                <Clock className={`${isMobile ? 'w-3.5 h-3.5 mr-1.5' : 'w-5 h-5 mr-3'}`} />
                Folga
              </Button>

              <Button
                onClick={() => handleJustifyDay('falta')}
                disabled={justifyLoading}
                className={`${isMobile ? '' : 'w-full'} bg-red-600 hover:bg-red-700 text-white justify-start ${isMobile ? 'text-xs py-2' : ''}`}
                size={isMobile ? 'sm' : 'default'}
              >
                <AlertTriangle className={`${isMobile ? 'w-3.5 h-3.5 mr-1.5' : 'w-5 h-5 mr-3'}`} />
                Falta
              </Button>

              <Button
                onClick={() => handleJustifyDay('cancelamento_ferias')}
                disabled={justifyLoading}
                className={`${isMobile ? 'col-span-2' : 'w-full'} bg-gray-600 hover:bg-gray-700 text-white justify-start ${isMobile ? 'text-xs py-2' : ''}`}
                size={isMobile ? 'sm' : 'default'}
              >
                <X className={`${isMobile ? 'w-3.5 h-3.5 mr-1.5' : 'w-5 h-5 mr-3'}`} />
                {isMobile ? 'Cancelar Férias' : 'Cancelamento de Férias'}
              </Button>
            </div>

            {justifyLoading && (
              <div className="flex items-center justify-center py-3">
                <div className={`animate-spin rounded-full ${isMobile ? 'h-5 w-5' : 'h-6 w-6'} border-b-2 border-purple-400`}></div>
                <span className={`ml-2 text-gray-400 ${isMobile ? 'text-xs' : ''}`}>A processar...</span>
              </div>
            )}

            <div className={`flex justify-end ${isMobile ? 'pt-2' : 'pt-4'} border-t border-gray-700`}>
              <Button
                onClick={() => {
                  setShowJustifyModal(false);
                  setJustifyingDay(null);
                }}
                variant="outline"
                className={`border-gray-600 text-gray-300 ${isMobile ? 'text-sm' : ''}`}
                disabled={justifyLoading}
                size={isMobile ? 'sm' : 'default'}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTimeEntries;
