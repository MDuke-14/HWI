import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CalendarIcon, Plus, ChevronLeft, ChevronRight, Users, MapPin, Wrench, Edit2, Trash2 } from 'lucide-react';

const Calendar = ({ user, onLogout }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [services, setServices] = useState([]);
  const [vacations, setVacations] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [serviceForm, setServiceForm] = useState({
    client_name: '',
    location: '',
    service_reason: '',
    technician_ids: [],
    date: '',
    time_slot: '',
    observations: '',
    status: 'scheduled'
  });

  useEffect(() => {
    fetchCalendarData();
    fetchUsers();
  }, [currentDate]);

  const fetchCalendarData = async () => {
    setLoading(true);
    try {
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      const response = await axios.get(`${API}/services/calendar`, {
        params: { month, year }
      });
      setServices(response.data.services || []);
      setVacations(response.data.vacations || []);
    } catch (error) {
      toast.error('Erro ao carregar calendário');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API}/admin/users`);
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handlePreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleCreateService = async () => {
    if (!serviceForm.client_name || !serviceForm.location || !serviceForm.service_reason || serviceForm.technician_ids.length === 0 || !serviceForm.date) {
      toast.error('Por favor preencha todos os campos obrigatórios');
      return;
    }

    try {
      if (editingService) {
        await axios.put(`${API}/services/${editingService.id}`, serviceForm);
        toast.success('Serviço atualizado com sucesso!');
      } else {
        await axios.post(`${API}/services`, serviceForm);
        toast.success('Serviço criado e notificações enviadas!');
      }
      setDialogOpen(false);
      resetForm();
      fetchCalendarData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao salvar serviço');
    }
  };

  const handleDeleteService = async (serviceId) => {
    if (!window.confirm('Tem certeza que deseja cancelar este serviço? Os técnicos serão notificados.')) return;
    
    try {
      await axios.delete(`${API}/services/${serviceId}`);
      toast.success('Serviço cancelado!');
      fetchCalendarData();
    } catch (error) {
      toast.error('Erro ao cancelar serviço');
    }
  };

  const handleEditService = (service) => {
    setEditingService(service);
    setServiceForm({
      client_name: service.client_name,
      location: service.location,
      service_reason: service.service_reason,
      technician_ids: service.technician_ids,
      date: service.date,
      time_slot: service.time_slot || '',
      observations: service.observations || '',
      status: service.status
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingService(null);
    setServiceForm({
      client_name: '',
      location: '',
      service_reason: '',
      technician_ids: [],
      date: '',
      time_slot: '',
      observations: '',
      status: 'scheduled'
    });
  };

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    
    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add days of month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    return days;
  };

  const getServicesForDate = (day) => {
    if (!day) return [];
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return services.filter(s => s.date === dateStr);
  };

  const getVacationsForDate = (day) => {
    if (!day) return [];
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return vacations.filter(v => {
      return dateStr >= v.start_date && dateStr <= v.end_date;
    });
  };

  const MonthView = () => {
    const days = getDaysInMonth();
    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    return (
      <div className="glass-effect p-6">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-6">
          <Button onClick={handlePreviousMonth} variant="outline" className="bg-[#1a1a1a] border-gray-700 text-white hover:bg-[#252525]">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-2xl font-bold text-white">
            {currentDate.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}
          </h2>
          <Button onClick={handleNextMonth} variant="outline" className="bg-[#1a1a1a] border-gray-700 text-white hover:bg-[#252525]">
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Legend */}
        <div className="flex gap-4 mb-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-600 rounded"></div>
            <span className="text-gray-300">Serviços</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-amber-600 rounded"></div>
            <span className="text-gray-300">Férias</span>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-2">
          {/* Week day headers */}
          {weekDays.map(day => (
            <div key={day} className="text-center font-semibold text-gray-400 py-2">
              {day}
            </div>
          ))}
          
          {/* Calendar days */}
          {days.map((day, index) => {
            const dayServices = getServicesForDate(day);
            const dayVacations = getVacationsForDate(day);
            const today = new Date();
            const isToday = day && 
              day === today.getDate() && 
              currentDate.getMonth() === today.getMonth() && 
              currentDate.getFullYear() === today.getFullYear();

            return (
              <div
                key={index}
                className={`min-h-[100px] p-2 rounded-lg border ${
                  day ? 'bg-[#1a1a1a] border-gray-700' : 'border-transparent'
                } ${isToday ? 'ring-2 ring-blue-500' : ''}`}
              >
                {day && (
                  <>
                    <div className={`text-sm font-semibold mb-1 ${isToday ? 'text-blue-400' : 'text-gray-300'}`}>
                      {day}
                    </div>
                    
                    {/* Services */}
                    {dayServices.map(service => (
                      <div
                        key={service.id}
                        className="text-xs bg-blue-900/30 border border-blue-600 rounded px-1 py-0.5 mb-1 cursor-pointer hover:bg-blue-900/50"
                        onClick={() => user.is_admin && handleEditService(service)}
                      >
                        <div className="text-blue-400 font-semibold truncate">{service.client_name}</div>
                        <div className="text-blue-300 truncate">{service.location}</div>
                      </div>
                    ))}
                    
                    {/* Vacations */}
                    {dayVacations.map(vacation => (
                      <div
                        key={vacation.id}
                        className="text-xs bg-amber-900/30 border border-amber-600 rounded px-1 py-0.5 mb-1"
                      >
                        <div className="text-amber-400 truncate">🏖️ {vacation.username}</div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const ListView = () => {
    return (
      <div className="space-y-4">
        {services.length === 0 ? (
          <div className="glass-effect p-12 text-center">
            <p className="text-gray-400 text-lg">Nenhum serviço agendado</p>
          </div>
        ) : (
          services.map(service => (
            <div key={service.id} className="glass-effect p-6 hover:bg-[#1f1f1f] transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-white mb-1">{service.client_name}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      service.status === 'completed' ? 'bg-green-700 text-green-200' :
                      service.status === 'in_progress' ? 'bg-blue-700 text-blue-200' :
                      service.status === 'cancelled' ? 'bg-red-700 text-red-200' :
                      'bg-gray-700 text-gray-300'
                    }`}>
                      {service.status === 'scheduled' ? 'Agendado' :
                       service.status === 'in_progress' ? 'Em Progresso' :
                       service.status === 'completed' ? 'Concluído' : 'Cancelado'}
                    </span>
                  </div>
                </div>
                {user.is_admin && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleEditService(service)}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2"
                      size="sm"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => handleDeleteService(service.id)}
                      className="bg-red-600 hover:bg-red-700 text-white rounded-full p-2"
                      size="sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-4 text-gray-300">
                <div>
                  <div className="text-sm text-gray-400 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Localidade
                  </div>
                  <div className="font-semibold text-white">{service.location}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    Data
                  </div>
                  <div className="font-semibold text-white">
                    {new Date(service.date + 'T00:00:00').toLocaleDateString('pt-PT', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                    {service.time_slot && ` - ${service.time_slot}`}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 flex items-center gap-2">
                    <Wrench className="w-4 h-4" />
                    Motivo
                  </div>
                  <div className="font-semibold text-white">{service.service_reason}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Técnicos
                  </div>
                  <div className="font-semibold text-white">
                    {service.technicians?.map(t => t.username).join(', ') || service.technician_names?.join(', ')}
                  </div>
                </div>
              </div>

              {service.observations && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="text-sm text-gray-400 mb-1">Observações</div>
                  <div className="text-white italic">{service.observations}</div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navigation user={user} onLogout={onLogout} activePage="calendar" />
      
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="fade-in">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-white flex items-center gap-3">
              <CalendarIcon className="w-10 h-10" />
              Calendário de Serviços
            </h1>
            {user.is_admin && (
              <Dialog open={dialogOpen} onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button className="bg-green-600 hover:bg-green-700 text-white rounded-full">
                    <Plus className="w-5 h-5 mr-2" />
                    Novo Serviço
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingService ? 'Editar Serviço' : 'Novo Serviço'}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label>Nome do Cliente *</Label>
                        <Input
                          value={serviceForm.client_name}
                          onChange={(e) => setServiceForm({...serviceForm, client_name: e.target.value})}
                          className="bg-[#0a0a0a] border-gray-700 text-white"
                          placeholder="Ex: João Silva"
                        />
                      </div>
                      <div>
                        <Label>Localidade *</Label>
                        <Input
                          value={serviceForm.location}
                          onChange={(e) => setServiceForm({...serviceForm, location: e.target.value})}
                          className="bg-[#0a0a0a] border-gray-700 text-white"
                          placeholder="Ex: Lisboa"
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Motivo de Assistência *</Label>
                      <Input
                        value={serviceForm.service_reason}
                        onChange={(e) => setServiceForm({...serviceForm, service_reason: e.target.value})}
                        className="bg-[#0a0a0a] border-gray-700 text-white"
                        placeholder="Ex: Instalação de equipamento"
                      />
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label>Data *</Label>
                        <Input
                          type="date"
                          value={serviceForm.date}
                          onChange={(e) => setServiceForm({...serviceForm, date: e.target.value})}
                          className="bg-[#0a0a0a] border-gray-700 text-white"
                        />
                      </div>
                      <div>
                        <Label>Horário (opcional)</Label>
                        <Input
                          value={serviceForm.time_slot}
                          onChange={(e) => setServiceForm({...serviceForm, time_slot: e.target.value})}
                          className="bg-[#0a0a0a] border-gray-700 text-white"
                          placeholder="Ex: 09:00-12:00"
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Técnicos *</Label>
                      <Select
                        value={serviceForm.technician_ids[0] || ''}
                        onValueChange={(value) => {
                          const currentIds = serviceForm.technician_ids;
                          if (!currentIds.includes(value)) {
                            setServiceForm({...serviceForm, technician_ids: [...currentIds, value]});
                          }
                        }}
                      >
                        <SelectTrigger className="bg-[#0a0a0a] border-gray-700 text-white">
                          <SelectValue placeholder="Selecionar técnico" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1a1a] border-gray-700 text-white">
                          {users.map(user => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      {/* Selected technicians */}
                      {serviceForm.technician_ids.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {serviceForm.technician_ids.map(techId => {
                            const tech = users.find(u => u.id === techId);
                            return tech ? (
                              <div key={techId} className="bg-blue-900/30 border border-blue-600 rounded px-3 py-1 text-sm flex items-center gap-2">
                                {tech.username}
                                <button
                                  onClick={() => setServiceForm({
                                    ...serviceForm,
                                    technician_ids: serviceForm.technician_ids.filter(id => id !== techId)
                                  })}
                                  className="text-red-400 hover:text-red-300"
                                >
                                  ×
                                </button>
                              </div>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>

                    {editingService && (
                      <div>
                        <Label>Estado</Label>
                        <Select
                          value={serviceForm.status}
                          onValueChange={(value) => setServiceForm({...serviceForm, status: value})}
                        >
                          <SelectTrigger className="bg-[#0a0a0a] border-gray-700 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#1a1a1a] border-gray-700 text-white">
                            <SelectItem value="scheduled">Agendado</SelectItem>
                            <SelectItem value="in_progress">Em Progresso</SelectItem>
                            <SelectItem value="completed">Concluído</SelectItem>
                            <SelectItem value="cancelled">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div>
                      <Label>Observações</Label>
                      <Textarea
                        value={serviceForm.observations}
                        onChange={(e) => setServiceForm({...serviceForm, observations: e.target.value})}
                        className="bg-[#0a0a0a] border-gray-700 text-white"
                        placeholder="Notas adicionais..."
                        rows={3}
                      />
                    </div>

                    <Button
                      onClick={handleCreateService}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-full py-3"
                    >
                      {editingService ? 'Atualizar Serviço' : 'Criar Serviço'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-12">A carregar calendário...</div>
          ) : (
            <Tabs defaultValue="month" className="w-full">
              <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 bg-[#1a1a1a] mb-8">
                <TabsTrigger
                  value="month"
                  className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400"
                >
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  Vista Mensal
                </TabsTrigger>
                <TabsTrigger
                  value="list"
                  className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400"
                >
                  Lista
                </TabsTrigger>
              </TabsList>

              <TabsContent value="month">
                <MonthView />
              </TabsContent>

              <TabsContent value="list">
                <ListView />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
};

export default Calendar;
