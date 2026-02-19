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
  ChevronLeft, ChevronRight, User, FileText, AlertTriangle, Zap, MapPin, Map, ExternalLink 
} from 'lucide-react';
import LocationMap from '@/components/ui/location-map';

const AdminTimeEntries = ({ user, onLogout }) => {
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [entries, setEntries] = useState([]);
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

  // Group entries by date
  const groupEntriesByDate = (entries) => {
    if (!entries || entries.length === 0) return [];

    const grouped = entries.reduce((acc, entry) => {
      const date = entry.date;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(entry);
      return acc;
    }, {});

    const sortedDays = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

    return sortedDays.map(date => {
      const dayEntries = grouped[date];
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
      
      return {
        date,
        entries: dayEntries.sort((a, b) => {
          if (!a.start_time) return 1;
          if (!b.start_time) return -1;
          return new Date(a.start_time) - new Date(b.start_time);
        }),
        totalHours,
        locations,
        hasGeoData: locations.length > 0
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
    } catch (error) {
      toast.error('Erro ao carregar entradas do utilizador');
      setEntries([]);
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
      <Navigation user={user} onLogout={onLogout} activePage="admin" />
      
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="fade-in">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <FileText className="w-8 h-8" />
              Gestão de Entradas
            </h1>
            <Button
              onClick={() => window.location.href = '/admin'}
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              ← Voltar ao Admin
            </Button>
          </div>

          {/* User Selection Bar */}
          <div className="glass-effect p-4 rounded-xl mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-5 h-5 text-blue-400" />
              <span className="text-white font-semibold">Selecionar Utilizador:</span>
            </div>
            
            {loadingUsers ? (
              <div className="text-gray-400">A carregar utilizadores...</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allUsers.map((u) => (
                  <Button
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className={`${
                      selectedUser?.id === u.id
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                    }`}
                  >
                    <User className="w-4 h-4 mr-2" />
                    {u.full_name || u.username}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {selectedUser && (
            <>
              {/* Month/Year Navigation and Add Button */}
              <div className="glass-effect p-4 rounded-xl mb-6">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                  {/* Month Navigation */}
                  <div className="flex items-center gap-4">
                    <Button
                      onClick={() => changeMonth(-1)}
                      variant="outline"
                      size="icon"
                      className="border-gray-600"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                    
                    <div className="text-center min-w-[280px]">
                      <div className="text-2xl font-bold text-white">
                        {monthNames[selectedMonth - 1]} {selectedYear}
                      </div>
                      <div className="text-sm text-blue-400 mt-1">
                        {billingPeriod.from && billingPeriod.to && (
                          <>
                            {new Date(billingPeriod.from + 'T00:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                            {' → '}
                            {new Date(billingPeriod.to + 'T00:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                          </>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        {selectedUser.full_name || selectedUser.username}
                      </div>
                    </div>
                    
                    <Button
                      onClick={() => changeMonth(1)}
                      variant="outline"
                      size="icon"
                      className="border-gray-600"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </Button>
                  </div>
                  
                  {/* Add Entry Button */}
                  <Button
                    onClick={() => {
                      setAddForm({
                        ...addForm,
                        date: new Date().toISOString().split('T')[0]
                      });
                      setShowAddModal(true);
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Adicionar Entrada
                  </Button>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="glass-effect p-4 rounded-xl">
                  <div className="text-gray-400 text-sm mb-1">Total de Horas</div>
                  <div className="text-2xl font-bold text-green-400">{formatHours(totalHours)}</div>
                </div>
                <div className="glass-effect p-4 rounded-xl">
                  <div className="text-gray-400 text-sm mb-1">Dias com Registo</div>
                  <div className="text-2xl font-bold text-blue-400">{totalDays}</div>
                </div>
                <div className="glass-effect p-4 rounded-xl">
                  <div className="text-gray-400 text-sm mb-1">Total de Entradas</div>
                  <div className="text-2xl font-bold text-purple-400">{entries.length}</div>
                </div>
              </div>

              {/* Entries List */}
              <div className="glass-effect p-6 rounded-xl">
                <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Registos do Período de Faturação
                </h3>

                {loading ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
                    <p className="text-gray-400 mt-4">A carregar entradas...</p>
                  </div>
                ) : entries.length === 0 ? (
                  <div className="text-center py-12">
                    <Clock className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400 text-lg">Nenhuma entrada encontrada para este mês</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {groupEntriesByDate(entries).map((day) => (
                      <div
                        key={day.date}
                        className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-4"
                      >
                        {/* Day Header */}
                        <div className="flex justify-between items-center mb-3 pb-3 border-b border-gray-700">
                          <div className="flex items-center gap-3">
                            <div className="text-white font-bold text-lg">
                              {new Date(day.date + 'T00:00:00').toLocaleDateString('pt-PT', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric'
                              })}
                            </div>
                            {day.hasGeoData && (
                              <span className="text-xs bg-emerald-600/20 text-emerald-400 px-2 py-1 rounded-full flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                GPS
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {day.entries.length > 0 && (
                              <Button
                                onClick={() => handleAdjustTo8Hours(day.entries[0].id)}
                                className="bg-yellow-600 hover:bg-yellow-700 text-white text-sm"
                                title="Ajustar automaticamente para 8h totais no dia"
                              >
                                <Zap className="w-4 h-4 mr-1" />
                                Ajustar para 8h
                              </Button>
                            )}
                            <div className="text-green-400 font-bold text-xl">
                              {formatHours(day.totalHours)}
                            </div>
                          </div>
                        </div>

                        {/* Map with locations for this day */}
                        {day.hasGeoData && (
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

                        {/* Entries for this day */}
                        <div className="space-y-2">
                          {day.entries.map((entry, index) => (
                            <div
                              key={entry.id || index}
                              className="flex justify-between items-center bg-[#0f0f0f] p-3 rounded"
                            >
                              <div className="flex-1">
                                <div className="text-sm text-gray-400">
                                  <span className="text-blue-400 font-semibold">Entrada #{index + 1}</span>
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
                                    <span className="ml-2 text-emerald-400 text-xs">
                                      <MapPin className="w-3 h-3 inline mr-1" />
                                      GPS
                                    </span>
                                  )}
                                </div>
                                {entry.observations && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    💬 {entry.observations}
                                  </div>
                                )}
                                {entry.outside_residence_zone && (
                                  <div className="text-xs text-orange-400 mt-1">
                                    📍 Fora da zona de residência: {entry.location_description}
                                  </div>
                                )}
                                {entry.geo_location?.address && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    📍 {entry.geo_location.address.locality || entry.geo_location.address.city || entry.geo_location.address.formatted}
                                    {entry.geo_location.accuracy && (
                                      <span className="text-gray-600 ml-2">(±{Math.round(entry.geo_location.accuracy)}m)</span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 ml-4">
                                <div className="text-green-400 font-semibold mr-2">
                                  {formatHours(entry.total_hours)}
                                </div>
                                <Button
                                  onClick={() => handleEditEntry(entry)}
                                  size="sm"
                                  variant="outline"
                                  className="border-blue-500 text-blue-500 hover:bg-blue-500/10"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  onClick={() => handleDeleteEntry(entry.id)}
                                  size="sm"
                                  variant="outline"
                                  className="border-red-500 text-red-500 hover:bg-red-500/10"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
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
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Edit className="w-5 h-5 text-blue-400" />
              Editar Entrada
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-gray-300">Data</Label>
              <Input
                type="date"
                value={editForm.date}
                onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300">Hora Início</Label>
                <Input
                  type="time"
                  value={editForm.start_time}
                  onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-300">Hora Fim</Label>
                <Input
                  type="time"
                  value={editForm.end_time}
                  onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                />
              </div>
            </div>
            
            <div>
              <Label className="text-gray-300">Observações</Label>
              <Textarea
                value={editForm.observations}
                onChange={(e) => setEditForm({ ...editForm, observations: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                rows={2}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit_outside_zone"
                checked={editForm.outside_residence_zone}
                onChange={(e) => setEditForm({ ...editForm, outside_residence_zone: e.target.checked })}
                className="w-4 h-4"
              />
              <Label htmlFor="edit_outside_zone" className="text-gray-300">
                Fora da zona de residência
              </Label>
            </div>
            
            {editForm.outside_residence_zone && (
              <div>
                <Label className="text-gray-300">Local</Label>
                <Input
                  value={editForm.location_description}
                  onChange={(e) => setEditForm({ ...editForm, location_description: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Descreva o local"
                />
              </div>
            )}
            
            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => setShowEditModal(false)}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                <X className="w-4 h-4 mr-2" />
                Cancelar
              </Button>
              <Button
                onClick={handleSaveEdit}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                <Save className="w-4 h-4 mr-2" />
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Entry Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Plus className="w-5 h-5 text-green-400" />
              Adicionar Entrada para {selectedUser?.full_name || selectedUser?.username}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-gray-300">Data *</Label>
              <Input
                type="date"
                value={addForm.date}
                onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300">Hora Início *</Label>
                <Input
                  type="time"
                  value={addForm.start_time}
                  onChange={(e) => setAddForm({ ...addForm, start_time: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  required
                />
              </div>
              <div>
                <Label className="text-gray-300">Hora Fim *</Label>
                <Input
                  type="time"
                  value={addForm.end_time}
                  onChange={(e) => setAddForm({ ...addForm, end_time: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  required
                />
              </div>
            </div>
            
            <div>
              <Label className="text-gray-300">Observações</Label>
              <Textarea
                value={addForm.observations}
                onChange={(e) => setAddForm({ ...addForm, observations: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                rows={2}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="add_outside_zone"
                checked={addForm.outside_residence_zone}
                onChange={(e) => setAddForm({ ...addForm, outside_residence_zone: e.target.checked })}
                className="w-4 h-4"
              />
              <Label htmlFor="add_outside_zone" className="text-gray-300">
                Fora da zona de residência
              </Label>
            </div>
            
            {addForm.outside_residence_zone && (
              <div>
                <Label className="text-gray-300">Local</Label>
                <Input
                  value={addForm.location_description}
                  onChange={(e) => setAddForm({ ...addForm, location_description: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Descreva o local"
                />
              </div>
            )}
            
            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => setShowAddModal(false)}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                <X className="w-4 h-4 mr-2" />
                Cancelar
              </Button>
              <Button
                onClick={handleAddEntry}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTimeEntries;
