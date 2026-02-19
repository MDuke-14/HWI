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
import { 
  CalendarIcon, Plus, ChevronLeft, ChevronRight, Users, MapPin, Wrench, 
  Edit2, Trash2, Search, Building2, Clock, CalendarDays, List, 
  Sparkles, Sun, Umbrella
} from 'lucide-react';
import HelpTooltip from '@/components/HelpTooltip';

const Calendar = ({ user, onLogout }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [services, setServices] = useState([]);
  const [vacations, setVacations] = useState([]);
  const [ots, setOts] = useState([]);  // OTs para mostrar no calendário
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clientSelectOpen, setClientSelectOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [editingService, setEditingService] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [dayDetailOpen, setDayDetailOpen] = useState(false);
  const [serviceForm, setServiceForm] = useState({
    client_name: '',
    client_id: '',  // ID do cliente para criar OT
    location: '',
    service_type: 'assistencia',  // 'assistencia' ou 'montagem'
    service_reason: '',
    technician_ids: [],
    date: '',
    date_end: '',  // Data "Até"
    time_slot: '',
    observations: '',
    status: 'scheduled'
  });

  // Feriados portugueses
  const getHolidays = (year) => {
    const fixedHolidays = [
      { date: `${year}-01-01`, name: 'Ano Novo' },
      { date: `${year}-04-25`, name: 'Dia da Liberdade' },
      { date: `${year}-05-01`, name: 'Dia do Trabalhador' },
      { date: `${year}-06-10`, name: 'Dia de Portugal' },
      { date: `${year}-08-15`, name: 'Assunção de Nossa Senhora' },
      { date: `${year}-10-05`, name: 'Implantação da República' },
      { date: `${year}-11-01`, name: 'Todos os Santos' },
      { date: `${year}-12-01`, name: 'Restauração da Independência' },
      { date: `${year}-12-08`, name: 'Imaculada Conceição' },
      { date: `${year}-12-25`, name: 'Natal' },
    ];

    const easterHolidays = {
      2024: [
        { date: '2024-03-29', name: 'Sexta-feira Santa' },
        { date: '2024-03-31', name: 'Páscoa' },
        { date: '2024-05-30', name: 'Corpo de Deus' },
      ],
      2025: [
        { date: '2025-04-18', name: 'Sexta-feira Santa' },
        { date: '2025-04-20', name: 'Páscoa' },
        { date: '2025-06-19', name: 'Corpo de Deus' },
      ],
      2026: [
        { date: '2026-04-03', name: 'Sexta-feira Santa' },
        { date: '2026-04-05', name: 'Páscoa' },
        { date: '2026-06-04', name: 'Corpo de Deus' },
      ],
    };

    return [...fixedHolidays, ...(easterHolidays[year] || [])];
  };

  const getHolidayForDate = (dateStr) => {
    if (!dateStr) return null;
    const year = parseInt(dateStr.split('-')[0]);
    const holidays = getHolidays(year);
    return holidays.find(h => h.date === dateStr);
  };

  useEffect(() => {
    fetchCalendarData();
    fetchUsers();
    fetchClients();
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
      setOts(response.data.ots || []);
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

  const fetchClients = async () => {
    try {
      const response = await axios.get(`${API}/clientes`);
      setClients(response.data);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const handleSelectClient = (client) => {
    setServiceForm({
      ...serviceForm,
      client_name: client.nome,
      client_id: client.id,
      // Não preencher localidade automaticamente - deve ser manual
      location: ''
    });
    setClientSelectOpen(false);
    setClientSearch('');
  };

  const filteredClients = clients.filter(client =>
    client.nome?.toLowerCase().includes(clientSearch.toLowerCase()) ||
    client.morada?.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const handlePreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleCreateService = async () => {
    // Validação - service_reason já não é obrigatório
    if (!serviceForm.client_name || !serviceForm.location || serviceForm.technician_ids.length === 0 || !serviceForm.date) {
      toast.error('Por favor preencha todos os campos obrigatórios (Cliente, Localidade, Data e Técnicos)');
      return;
    }

    try {
      if (editingService) {
        await axios.put(`${API}/services/${editingService.id}`, serviceForm);
        toast.success('Serviço atualizado com sucesso!');
      } else {
        // Criar serviço e OT associada
        await axios.post(`${API}/services/with-ot`, serviceForm);
        toast.success('Serviço e OT criados com sucesso!');
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
      client_id: '',
      location: '',
      service_type: 'assistencia',
      service_reason: '',
      technician_ids: [],
      date: '',
      date_end: '',
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
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    return days;
  };

  const getDateString = (day) => {
    if (!day) return '';
    return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const getServicesForDate = (dateStr) => {
    if (!dateStr) return [];
    return services.filter(s => s.date === dateStr);
  };

  const getVacationsForDate = (dateStr) => {
    if (!dateStr) return [];
    return vacations.filter(v => dateStr >= v.start_date && dateStr <= v.end_date);
  };

  const getOtsForDate = (dateStr) => {
    if (!dateStr) return [];
    return ots.filter(ot => ot.date === dateStr);
  };

  const openDayDetail = (day) => {
    const dateStr = getDateString(day);
    setSelectedDay({
      day,
      dateStr,
      services: getServicesForDate(dateStr),
      vacations: getVacationsForDate(dateStr),
      ots: getOtsForDate(dateStr),
      holiday: getHolidayForDate(dateStr)
    });
    setDayDetailOpen(true);
  };

  // Statistics
  const totalServicesThisMonth = services.length;
  const scheduledServices = services.filter(s => s.status === 'scheduled').length;
  const completedServices = services.filter(s => s.status === 'completed').length;
  const totalOtsThisMonth = [...new Set(ots.map(o => o.id))].length; // OTs únicas

  const MonthView = () => {
    const days = getDaysInMonth();
    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const today = new Date();

    return (
      <div className="space-y-6">
        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#121212] border border-white/10 rounded-xl p-4">
            <div className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">Total OTs</div>
            <div className="text-3xl font-bold text-white font-mono">{totalServicesThisMonth}</div>
          </div>
          <div className="bg-[#121212] border border-white/10 rounded-xl p-4">
            <div className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">Agendados</div>
            <div className="text-3xl font-bold text-sky-400 font-mono">{scheduledServices}</div>
          </div>
          <div className="bg-[#121212] border border-white/10 rounded-xl p-4">
            <div className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">Concluídos</div>
            <div className="text-3xl font-bold text-emerald-400 font-mono">{completedServices}</div>
          </div>
          <div className="bg-[#121212] border border-white/10 rounded-xl p-4">
            <div className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">Férias Ativas</div>
            <div className="text-3xl font-bold text-purple-400 font-mono">{vacations.length}</div>
          </div>
        </div>

        {/* Calendar Container */}
        <div className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden">
          {/* Month Navigation */}
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <Button 
              onClick={handlePreviousMonth} 
              variant="ghost" 
              className="text-gray-400 hover:text-white hover:bg-white/10"
              data-testid="prev-month-btn"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: "'Chivo', sans-serif" }}>
                {currentDate.toLocaleDateString('pt-PT', { month: 'long' })}
              </h2>
              <div className="text-sm font-mono text-gray-500">{currentDate.getFullYear()}</div>
            </div>
            <Button 
              onClick={handleNextMonth} 
              variant="ghost" 
              className="text-gray-400 hover:text-white hover:bg-white/10"
              data-testid="next-month-btn"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-6 px-6 py-3 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-orange-500"></div>
              <span className="text-xs text-gray-400">Ordens de Trabalho</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-purple-500"></div>
              <span className="text-xs text-gray-400">Férias</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-amber-500"></div>
              <span className="text-xs text-gray-400">Feriados</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <span className="text-xs text-gray-400">Hoje</span>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 bg-[#0a0a0a]">
            {/* Week Headers */}
            {weekDays.map((day, i) => (
              <div 
                key={day} 
                className={`text-center font-medium text-xs uppercase tracking-widest py-4 border-b border-white/10 ${
                  i === 0 || i === 6 ? 'text-gray-500' : 'text-gray-400'
                }`}
              >
                {day}
              </div>
            ))}
            
            {/* Calendar Days */}
            {days.map((day, index) => {
              const dateStr = getDateString(day);
              const dayServices = getServicesForDate(dateStr);
              const dayVacations = getVacationsForDate(dateStr);
              const dayOts = getOtsForDate(dateStr);
              const holiday = getHolidayForDate(dateStr);
              const isToday = day && 
                day === today.getDate() && 
                currentDate.getMonth() === today.getMonth() && 
                currentDate.getFullYear() === today.getFullYear();
              const isWeekend = index % 7 === 0 || index % 7 === 6;
              const hasEvents = dayServices.length > 0 || dayVacations.length > 0 || dayOts.length > 0 || holiday;

              return (
                <div
                  key={index}
                  onClick={() => day && openDayDetail(day)}
                  className={`
                    min-h-[120px] p-2 border-b border-r border-white/5 relative group
                    ${day ? 'cursor-pointer hover:bg-white/[0.03] transition-colors' : ''}
                    ${holiday ? 'bg-amber-500/5' : ''}
                    ${isWeekend && day && !holiday ? 'bg-white/[0.01]' : ''}
                  `}
                  data-testid={day ? `calendar-day-${day}` : undefined}
                >
                  {day && (
                    <>
                      {/* Day Number */}
                      <div className={`
                        text-sm font-mono mb-2 flex items-center justify-between
                        ${holiday ? 'text-amber-400' : isToday ? 'text-white' : isWeekend ? 'text-gray-600' : 'text-gray-400'}
                      `}>
                        <span className={`
                          ${isToday ? 'bg-emerald-500 text-white w-7 h-7 rounded-full flex items-center justify-center font-bold' : ''}
                        `}>
                          {day}
                        </span>
                        {hasEvents && !isToday && (
                          <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
                        )}
                      </div>
                      
                      {/* Holiday Badge */}
                      {holiday && (
                        <div className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border-l-2 border-amber-500 truncate mb-1">
                          {holiday.name}
                        </div>
                      )}
                      
                      {/* OTs */}
                      {dayOts.slice(0, 2).map(ot => (
                        <div
                          key={`ot-${ot.id}-${dateStr}`}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-300 border-l-2 border-orange-500 truncate mb-1 hover:bg-orange-500/20 transition-colors"
                          title={`${ot.cliente_nome} - OT#${ot.numero_ot} - ${ot.local}`}
                        >
                          {ot.cliente_nome} OT#{ot.numero_ot}
                        </div>
                      ))}
                      
                      {/* Services - mesma cor das OTs */}
                      {dayServices.slice(0, dayOts.length > 0 ? 1 : 2).map(service => (
                        <div
                          key={service.id}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-300 border-l-2 border-orange-500 truncate mb-1 hover:bg-orange-500/20 transition-colors"
                          title={`${service.client_name} - ${service.ot_numero ? `OT#${service.ot_numero}` : 'Serviço'} - ${service.location}`}
                        >
                          {service.client_name} {service.ot_numero ? `OT#${service.ot_numero}` : ''}
                        </div>
                      ))}
                      
                      {/* Vacations */}
                      {dayVacations.slice(0, 1).map(vacation => (
                        <div
                          key={vacation.id}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border-l-2 border-purple-500 truncate mb-1"
                        >
                          <Umbrella className="w-2.5 h-2.5 inline mr-1" />
                          {vacation.username}
                        </div>
                      ))}
                      
                      {/* More Indicator */}
                      {(dayOts.length > 2 || dayServices.length > (dayOts.length > 0 ? 1 : 2) || dayVacations.length > 1) && (
                        <div className="text-[10px] text-gray-500 font-medium">
                          +{Math.max(0, dayOts.length - 2) + Math.max(0, dayServices.length - (dayOts.length > 0 ? 1 : 2)) + Math.max(0, dayVacations.length - 1)} mais
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const ListView = () => {
    // Combinar serviços e OTs numa lista unificada
    const serviceItems = services.map(s => ({
      type: 'service',
      id: s.id,
      client_name: s.client_name,
      location: s.location,
      date: s.date,
      ot_numero: s.ot_numero,
      ot_id: s.ot_id,
      service_reason: s.service_reason,
      technician_names: s.technician_names,
      status: s.status,
      observations: s.observations,
      time_slot: s.time_slot
    }));

    const otItems = ots.map(ot => ({
      type: 'ot',
      id: ot.id,
      client_name: ot.cliente_nome,
      location: ot.local,
      date: ot.date,
      ot_numero: ot.numero_ot,
      ot_id: ot.id,
      service_reason: ot.motivo,
      technician_names: [],
      status: ot.status,
      observations: null,
      time_slot: null,
      data_inicio: ot.data_inicio,
      data_fim: ot.data_fim
    }));

    // Combinar e remover duplicados (serviços que já têm OT associada)
    const serviceOtIds = new Set(services.filter(s => s.ot_id).map(s => s.ot_id));
    const uniqueOtItems = otItems.filter(ot => !serviceOtIds.has(ot.id));
    
    const allItems = [...serviceItems, ...uniqueOtItems].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    return (
      <div className="space-y-4">
        {allItems.length === 0 ? (
          <div className="bg-[#121212] border border-white/10 rounded-xl p-12 text-center">
            <CalendarDays className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">Nenhuma OT agendada este mês</p>
          </div>
        ) : (
          allItems.map(item => (
            <div 
              key={`${item.type}-${item.id}-${item.date}`} 
              className="bg-[#121212] border border-orange-500/30 rounded-xl p-6 hover:border-orange-500/50 transition-all group cursor-pointer"
              data-testid={`${item.type}-card-${item.id}`}
              onClick={() => {
                // Abrir OT ao clicar - usar ot_id para serviços ou id para OTs
                const otIdToOpen = item.ot_id || (item.type === 'ot' ? item.id : null);
                if (otIdToOpen) {
                  window.location.href = `/technical-reports?ot=${otIdToOpen}`;
                }
              }}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: "'Chivo', sans-serif" }}>
                      {item.client_name}
                    </h3>
                    {item.ot_numero && (
                      <span className="px-2.5 py-1 rounded-md text-sm font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                        OT#{item.ot_numero}
                      </span>
                    )}
                    <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                      item.status === 'completed' || item.status === 'concluido' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                      item.status === 'in_progress' || item.status === 'em_execucao' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                      item.status === 'agendado' || item.status === 'scheduled' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' :
                      item.status === 'orcamento' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                      item.status === 'cancelled' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                      'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                    }`}>
                      {item.status === 'agendado' || item.status === 'scheduled' ? 'Agendado' :
                       item.status === 'in_progress' || item.status === 'em_execucao' ? 'Em Execução' :
                       item.status === 'completed' || item.status === 'concluido' ? 'Concluído' : 
                       item.status === 'orcamento' ? 'Orçamento' :
                       item.status === 'cancelled' ? 'Cancelado' : item.status}
                    </span>
                  </div>
                </div>
                {user.is_admin && item.type === 'service' && (
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      onClick={(e) => { e.stopPropagation(); handleEditService(item); }}
                      variant="ghost"
                      size="sm"
                      className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                      data-testid={`edit-service-${item.id}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={(e) => { e.stopPropagation(); handleDeleteService(item.id); }}
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      data-testid={`delete-service-${item.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" />
                    Localização
                  </div>
                  <div className="text-white font-medium">{item.location}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
                    <CalendarIcon className="w-3 h-3" />
                    Data
                  </div>
                  <div className="text-orange-300 font-mono">
                    {new Date(item.date + 'T00:00:00').toLocaleDateString('pt-PT', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    })}
                    {item.data_fim && (
                      <span className="text-gray-500"> → {new Date(item.data_fim).toLocaleDateString('pt-PT', {
                        day: '2-digit',
                        month: 'short'
                      })}</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
                    <Wrench className="w-3 h-3" />
                    Motivo
                  </div>
                  <div className="text-white">{item.service_reason || '-'}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
                    <Users className="w-3 h-3" />
                    Técnicos
                  </div>
                  <div className="text-white">
                    {item.technician_names?.join(', ') || '-'}
                  </div>
                </div>
              </div>

              {item.observations && (
                <div className="mt-4 pt-4 border-t border-orange-500/10">
                  <div className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">Observações</div>
                  <div className="text-gray-300 italic text-sm">{item.observations}</div>
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
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div>
              <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-3" style={{ fontFamily: "'Chivo', sans-serif" }}>
                <CalendarDays className="w-10 h-10 text-sky-400" />
                Calendário
                <HelpTooltip section="calendario_geral" />
              </h1>
              <p className="text-gray-500 mt-1">Gestão de serviços e disponibilidade da equipa</p>
            </div>
            {user.is_admin && (
              <Dialog open={dialogOpen} onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button 
                    className="bg-sky-500 hover:bg-sky-600 text-white font-semibold px-6"
                    data-testid="new-service-btn"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Nova OT
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#0a0a0a] border border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold tracking-tight flex items-center gap-2" style={{ fontFamily: "'Chivo', sans-serif" }}>
                      {editingService ? 'Editar OT' : 'Nova OT'}
                      <HelpTooltip section="calendario_servicos" />
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs uppercase tracking-widest text-gray-400">Nome do Cliente *</Label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            value={serviceForm.client_name}
                            onChange={(e) => setServiceForm({...serviceForm, client_name: e.target.value, client_id: ''})}
                            className="bg-[#121212] border-white/10 text-white flex-1"
                            placeholder="Ex: João Silva"
                            data-testid="service-client-name"
                          />
                          <Dialog open={clientSelectOpen} onOpenChange={setClientSelectOpen}>
                            <DialogTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                className="bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/30 text-sky-400"
                                title="Selecionar cliente existente"
                              >
                                <Building2 className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-[#0a0a0a] border border-white/10 text-white max-w-lg max-h-[80vh]">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <Building2 className="w-5 h-5 text-sky-400" />
                                  Selecionar Cliente
                                </DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 mt-4">
                                <div className="relative">
                                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                                  <Input
                                    value={clientSearch}
                                    onChange={(e) => setClientSearch(e.target.value)}
                                    className="bg-[#121212] border-white/10 text-white pl-10"
                                    placeholder="Pesquisar cliente..."
                                  />
                                </div>
                                
                                <div className="max-h-[400px] overflow-y-auto space-y-2">
                                  {filteredClients.length === 0 ? (
                                    <div className="text-center text-gray-500 py-8">
                                      {clientSearch ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
                                    </div>
                                  ) : (
                                    filteredClients.map(client => (
                                      <div
                                        key={client.id}
                                        onClick={() => handleSelectClient(client)}
                                        className="p-3 bg-[#121212] border border-white/10 rounded-lg cursor-pointer hover:border-sky-500/50 hover:bg-sky-500/5 transition"
                                      >
                                        <div className="font-semibold text-white">{client.nome}</div>
                                        {client.morada && (
                                          <div className="text-sm text-gray-400 flex items-center gap-1 mt-1">
                                            <MapPin className="w-3 h-3" />
                                            {client.morada}
                                          </div>
                                        )}
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs uppercase tracking-widest text-gray-400">Localidade *</Label>
                        <Input
                          value={serviceForm.location}
                          onChange={(e) => setServiceForm({...serviceForm, location: e.target.value})}
                          className="bg-[#121212] border-white/10 text-white mt-1"
                          placeholder="Ex: Lisboa"
                          data-testid="service-location"
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs uppercase tracking-widest text-gray-400">Tipo de Serviço *</Label>
                        <Select
                          value={serviceForm.service_type}
                          onValueChange={(value) => setServiceForm({...serviceForm, service_type: value})}
                        >
                          <SelectTrigger className="bg-[#121212] border-white/10 text-white mt-1" data-testid="service-type-select">
                            <SelectValue placeholder="Selecionar tipo" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#121212] border-white/10 text-white">
                            <SelectItem value="assistencia">Assistência</SelectItem>
                            <SelectItem value="montagem">Montagem</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs uppercase tracking-widest text-gray-400">Motivo de Assistência</Label>
                        <Input
                          value={serviceForm.service_reason}
                          onChange={(e) => setServiceForm({...serviceForm, service_reason: e.target.value})}
                          className="bg-[#121212] border-white/10 text-white mt-1"
                          placeholder="Ex: Instalação de equipamento (opcional)"
                          data-testid="service-reason"
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs uppercase tracking-widest text-gray-400">Data *</Label>
                        <Input
                          type="date"
                          value={serviceForm.date}
                          onChange={(e) => setServiceForm({...serviceForm, date: e.target.value})}
                          className="bg-[#121212] border-white/10 text-white mt-1"
                          data-testid="service-date"
                        />
                      </div>
                      <div>
                        <Label className="text-xs uppercase tracking-widest text-gray-400">Até (opcional)</Label>
                        <Input
                          type="date"
                          value={serviceForm.date_end}
                          onChange={(e) => setServiceForm({...serviceForm, date_end: e.target.value})}
                          className="bg-[#121212] border-white/10 text-white mt-1"
                          data-testid="service-date-end"
                          min={serviceForm.date || undefined}
                        />
                      </div>
                      <div>
                        <Label className="text-xs uppercase tracking-widest text-gray-400">Horário (opcional)</Label>
                        <Input
                          value={serviceForm.time_slot}
                          onChange={(e) => setServiceForm({...serviceForm, time_slot: e.target.value})}
                          className="bg-[#121212] border-white/10 text-white mt-1"
                          placeholder="Ex: 09:00-12:00"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs uppercase tracking-widest text-gray-400">Técnicos *</Label>
                      <Select
                        value={serviceForm.technician_ids[0] || ''}
                        onValueChange={(value) => {
                          const currentIds = serviceForm.technician_ids;
                          if (!currentIds.includes(value)) {
                            setServiceForm({...serviceForm, technician_ids: [...currentIds, value]});
                          }
                        }}
                      >
                        <SelectTrigger className="bg-[#121212] border-white/10 text-white mt-1">
                          <SelectValue placeholder="Selecionar técnico" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#121212] border-white/10 text-white">
                          {users.map(u => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name || u.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      {serviceForm.technician_ids.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {serviceForm.technician_ids.map(techId => {
                            const tech = users.find(u => u.id === techId);
                            return tech ? (
                              <div key={techId} className="bg-sky-500/10 border border-sky-500/30 rounded-md px-3 py-1 text-sm flex items-center gap-2 text-sky-300">
                                {tech.full_name || tech.username}
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
                        <Label className="text-xs uppercase tracking-widest text-gray-400">Estado</Label>
                        <Select
                          value={serviceForm.status}
                          onValueChange={(value) => setServiceForm({...serviceForm, status: value})}
                        >
                          <SelectTrigger className="bg-[#121212] border-white/10 text-white mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#121212] border-white/10 text-white">
                            <SelectItem value="scheduled">Agendado</SelectItem>
                            <SelectItem value="in_progress">Em Progresso</SelectItem>
                            <SelectItem value="completed">Concluído</SelectItem>
                            <SelectItem value="cancelled">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div>
                      <Label className="text-xs uppercase tracking-widest text-gray-400">Observações</Label>
                      <Textarea
                        value={serviceForm.observations}
                        onChange={(e) => setServiceForm({...serviceForm, observations: e.target.value})}
                        className="bg-[#121212] border-white/10 text-white mt-1"
                        placeholder="Notas adicionais..."
                        rows={3}
                      />
                    </div>

                    <Button
                      onClick={handleCreateService}
                      className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3"
                      data-testid="submit-service-btn"
                    >
                      {editingService ? 'Atualizar Serviço' : 'Criar Serviço'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {/* Day Detail Modal */}
          <Dialog open={dayDetailOpen} onOpenChange={setDayDetailOpen}>
            <DialogContent className="bg-[#0a0a0a] border border-white/10 text-white max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold tracking-tight flex items-center gap-2" style={{ fontFamily: "'Chivo', sans-serif" }}>
                  <CalendarIcon className="w-5 h-5 text-orange-400" />
                  {selectedDay && new Date(selectedDay.dateStr + 'T00:00:00').toLocaleDateString('pt-PT', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long'
                  })}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                {/* Holiday */}
                {selectedDay?.holiday && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-amber-300">
                      <Sun className="w-4 h-4" />
                      <span className="font-medium">{selectedDay.holiday.name}</span>
                    </div>
                  </div>
                )}
                
                {/* OTs - Mostra todas as OTs incluindo as criadas via serviços */}
                {selectedDay?.ots?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs uppercase tracking-widest text-gray-500 flex items-center gap-2">
                      <Wrench className="w-3 h-3" />
                      Ordens de Trabalho ({selectedDay.ots.length})
                    </h4>
                    {selectedDay.ots.map(ot => (
                      <div 
                        key={`ot-detail-${ot.id}-${selectedDay.dateStr}`} 
                        className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 cursor-pointer hover:bg-orange-500/20 transition-colors"
                        onClick={() => {
                          setDayDetailOpen(false);
                          window.location.href = `/technical-reports?ot=${ot.id}`;
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">{ot.cliente_nome}</span>
                          <span className="font-bold text-orange-400">OT#{ot.numero_ot}</span>
                        </div>
                        <div className="text-sm text-gray-400 flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3" />
                          {ot.local}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded mt-1 inline-block ${
                          ot.status === 'concluido' ? 'bg-green-500/20 text-green-400' :
                          ot.status === 'em_execucao' ? 'bg-blue-500/20 text-blue-400' :
                          ot.status === 'agendado' ? 'bg-cyan-500/20 text-cyan-400' :
                          ot.status === 'orcamento' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {ot.status === 'agendado' ? 'Agendado' :
                           ot.status === 'concluido' ? 'Concluído' : 
                           ot.status === 'em_execucao' ? 'Em Execução' : 
                           ot.status === 'orcamento' ? 'Orçamento' : 
                           ot.status === 'facturado' ? 'Facturado' : ot.status}
                        </span>
                        {ot.data_fim && (
                          <div className="text-xs text-orange-400/70 mt-1">
                            {new Date(ot.data_inicio).toLocaleDateString('pt-PT')} → {new Date(ot.data_fim).toLocaleDateString('pt-PT')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Vacations */}
                {selectedDay?.vacations.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs uppercase tracking-widest text-gray-500 flex items-center gap-2">
                      <Umbrella className="w-3 h-3" />
                      Férias ({selectedDay.vacations.length})
                    </h4>
                    {selectedDay.vacations.map(vacation => (
                      <div key={vacation.id} className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                        <div className="font-semibold text-white flex items-center gap-2">
                          <Users className="w-4 h-4 text-purple-400" />
                          {vacation.username}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Empty State */}
                {!selectedDay?.holiday && selectedDay?.services.length === 0 && selectedDay?.vacations.length === 0 && (!selectedDay?.ots || selectedDay?.ots.length === 0) && (
                  <div className="text-center py-8 text-gray-500">
                    <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhum evento neste dia</p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-400"></div>
            </div>
          ) : (
            <Tabs defaultValue="month" className="w-full">
              <TabsList className="grid w-full max-w-sm mx-auto grid-cols-2 bg-[#121212] border border-white/10 mb-8 p-1 rounded-lg">
                <TabsTrigger
                  value="month"
                  className="data-[state=active]:bg-sky-500 data-[state=active]:text-white text-gray-400 rounded-md transition-all"
                  data-testid="month-view-tab"
                >
                  <CalendarDays className="w-4 h-4 mr-2" />
                  Mensal
                </TabsTrigger>
                <TabsTrigger
                  value="list"
                  className="data-[state=active]:bg-sky-500 data-[state=active]:text-white text-gray-400 rounded-md transition-all"
                  data-testid="list-view-tab"
                >
                  <List className="w-4 h-4 mr-2" />
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
