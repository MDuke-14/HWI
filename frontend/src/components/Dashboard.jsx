import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import UserRealtimePopup from '@/components/UserRealtimePopup';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Clock, Play, Square, Coffee, MapPin, Clipboard, Users, RefreshCw } from 'lucide-react';
import { formatHours } from '@/utils/timeUtils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const Dashboard = ({ user, onLogout }) => {
  const [entry, setEntry] = useState(null);
  const [todayEntries, setTodayEntries] = useState([]);
  const [observations, setObservations] = useState('');
  const [endObservations, setEndObservations] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRealtimeModal, setShowRealtimeModal] = useState(false);
  const [realtimeData, setRealtimeData] = useState(null);
  const [realtimeLoading, setRealtimeLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showMyRealtimePopup, setShowMyRealtimePopup] = useState(false);
  const [adminClockLoading, setAdminClockLoading] = useState({});

  const [outsideResidenceZone, setOutsideResidenceZone] = useState(false);
  const [locationDescription, setLocationDescription] = useState('');

  // Helper function to format decimal hours as HH:MM
  const formatHours = (decimalHours) => {
    if (!decimalHours) return '0h00m';
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours}h${String(minutes).padStart(2, '0')}m`;
  };

  useEffect(() => {
    fetchTodayEntry();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);


  useEffect(() => {
    if (entry && entry.status === 'active') {
      const interval = setInterval(() => {
        const start = new Date(entry.start_time);
        const now = new Date();
        const elapsed = (now - start) / 1000;
        setElapsedTime(elapsed);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [entry]);

  const fetchTodayEntry = async () => {
    try {
      const response = await axios.get(`${API}/time-entries/today`);
      if (!response.data || response.data.has_active === false) {
        // No entry or multiple entries for today
        setEntry(null);
        setTodayEntries(response.data?.entries || []);
        // Se o dia já tem "Fora de Zona", marcar automaticamente para a próxima entrada
        if (response.data?.day_has_outside_zone) {
          setOutsideResidenceZone(true);
        }
      } else {
        // Active entry
        setEntry(response.data);
        setTodayEntries([]);
        // Se o dia já tem "Fora de Zona", marcar automaticamente
        if (response.data?.day_has_outside_zone) {
          setOutsideResidenceZone(true);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar entrada de hoje:', error);
    }
  };

  const fetchRealtimeStatus = async () => {
    setRealtimeLoading(true);
    try {
      const response = await axios.get(`${API}/admin/realtime-status`);
      setRealtimeData(response.data);
    } catch (error) {
      toast.error('Erro ao carregar status em tempo real');
      console.error(error);
    } finally {
      setRealtimeLoading(false);
    }
  };

  const openRealtimeModal = () => {
    setShowRealtimeModal(true);
    fetchRealtimeStatus();
  };

  // Funções Admin para controlar relógio de outros utilizadores
  const handleAdminStartClock = async (userId, userName) => {
    setAdminClockLoading(prev => ({ ...prev, [userId]: 'start' }));
    try {
      await axios.post(`${API}/admin/time-entries/start/${userId}`);
      toast.success(`Relógio iniciado para ${userName}`);
      fetchRealtimeStatus();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao iniciar relógio');
    } finally {
      setAdminClockLoading(prev => ({ ...prev, [userId]: null }));
    }
  };

  const handleAdminEndClock = async (userId, userName) => {
    setAdminClockLoading(prev => ({ ...prev, [userId]: 'end' }));
    try {
      const response = await axios.post(`${API}/admin/time-entries/end/${userId}`);
      toast.success(`Relógio finalizado para ${userName} (${response.data.total_hours}h)`);
      fetchRealtimeStatus();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao finalizar relógio');
    } finally {
      setAdminClockLoading(prev => ({ ...prev, [userId]: null }));
    }
  };

  const getStatusBadgeColor = (color) => {
    const colors = {
      green: 'bg-green-500/20 text-green-400 border-green-500',
      blue: 'bg-blue-500/20 text-blue-400 border-blue-500',
      purple: 'bg-purple-500/20 text-purple-400 border-purple-500',
      gray: 'bg-gray-500/20 text-gray-400 border-gray-500',
      amber: 'bg-amber-500/20 text-amber-400 border-amber-500',
      red: 'bg-red-500/20 text-red-400 border-red-500'
    };
    return colors[color] || colors.gray;
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/time-entries/start`, { 
        observations,
        outside_residence_zone: outsideResidenceZone,
        location_description: outsideResidenceZone ? locationDescription : null
      });
      toast.success('Relógio iniciado!');
      setObservations('');
      // Não resetar outsideResidenceZone se o dia já tem essa flag (será definido pelo fetchTodayEntry)
      setLocationDescription('');
      fetchTodayEntry();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao iniciar');
    } finally {
      setLoading(false);
    }
  };

  const handleEnd = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/time-entries/end/${entry.id}`, {
        observations: endObservations
      });
      toast.success(`Relógio finalizado! Total: ${formatHours(response.data.total_hours)}`);
      setEndObservations('');
      
      // Atualizar estado imediatamente
      setEntry(null);  // Limpar entrada ativa
      
      // Buscar estado atualizado
      await fetchTodayEntry();
      
      console.log('Estado atualizado após finalizar');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao finalizar');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = () => {
    if (!entry) return null;
    
    const badges = {
      active: { text: 'Ativo', class: 'status-active', icon: <Play className="w-4 h-4" /> },
      completed: { text: 'Concluído', class: 'status-completed', icon: <Square className="w-4 h-4" /> }
    };

    const badge = badges[entry.status];
    return (
      <div className={`${badge.class} px-6 py-3 rounded-full text-white font-semibold flex items-center gap-2 shadow-lg`}>
        {badge.icon}
        {badge.text}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navigation user={user} onLogout={onLogout} activePage="dashboard" />
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="fade-in">
          {/* Current Time Display */}
          <div className="text-center mb-8">
            <div className="text-6xl font-bold text-white mb-2" data-testid="current-time">
              {currentTime.toLocaleTimeString('pt-PT')}
            </div>
            <div className="text-gray-400 text-lg" data-testid="current-date">
              {currentTime.toLocaleDateString('pt-PT', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex justify-center mb-8" data-testid="status-badge">
            {getStatusBadge()}
          </div>

          {/* Elapsed Time */}
          {entry && entry.status !== 'completed' && entry.status !== 'not_started' && (
            <div className="text-center mb-8">
              <div className="glass-effect inline-block px-8 py-4 rounded-2xl">
                <div className="text-gray-400 text-sm mb-1">Tempo Trabalhado</div>
                <div className="text-4xl font-bold text-white" data-testid="elapsed-time">
                  {formatTime(elapsedTime)}
                </div>
              </div>
            </div>
          )}

          {/* Control Buttons */}
          <div className="glass-effect p-3 mb-6">
            {!entry ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="observations" className="text-gray-300 mb-1.5 block text-sm">
                    Observações (opcional)
                  </Label>
                  <Textarea
                    data-testid="observations-input"
                    id="observations"
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    placeholder="Ex: Entrada atrasada devido a reunião externa..."
                    className="bg-[#1a1a1a] border-gray-700 text-white focus:ring-blue-500 min-h-[50px] text-sm"
                  />
                </div>

                {/* Outside Residence Zone Checkbox */}
                <div className="flex items-start space-x-3 p-3 bg-[#1a1a1a] rounded-lg border border-gray-700">
                  <Checkbox
                    data-testid="outside-zone-checkbox"
                    id="outside-zone"
                    checked={outsideResidenceZone}
                    onCheckedChange={setOutsideResidenceZone}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor="outside-zone"
                      className="text-gray-300 font-medium cursor-pointer flex items-center gap-2 text-sm"
                    >
                      <MapPin className="w-4 h-4" />
                      Fora de Zona de Residência
                    </Label>
                    <p className="text-xs text-gray-400 mt-1">
                      Ativa Ajuda de Custas (em vez de Subsídio de Alimentação)
                    </p>
                  </div>
                </div>

                {/* Location Input - Only shown when checkbox is checked */}
                {outsideResidenceZone && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <Label htmlFor="location" className="text-gray-300 mb-2 block">
                      Local da Deslocação *
                    </Label>
                    <Input
                      data-testid="location-input"
                      id="location"
                      value={locationDescription}
                      onChange={(e) => setLocationDescription(e.target.value)}
                      placeholder="Ex: Lisboa, Madrid, Porto..."
                      className="bg-[#1a1a1a] border-gray-700 text-white focus:ring-blue-500"
                      required={outsideResidenceZone}
                    />
                  </div>
                )}

                <Button
                  data-testid="start-button"
                  onClick={handleStart}
                  disabled={loading || (outsideResidenceZone && !locationDescription.trim())}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-4 rounded-full text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-6 h-6 mr-2" />
                  Iniciar Relógio
                </Button>
              </div>
            ) : entry.status === 'active' ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="end-observations" className="text-gray-300 mb-1.5 block text-sm">
                    Observações ao Finalizar (opcional)
                  </Label>
                  <Textarea
                    data-testid="end-observations-input"
                    id="end-observations"
                    value={endObservations}
                    onChange={(e) => setEndObservations(e.target.value)}
                    placeholder="Ex: Trabalho concluído, reunião realizada..."
                    className="bg-[#1a1a1a] border-gray-700 text-white focus:ring-blue-500 min-h-[70px] text-sm"
                  />
                </div>
                <Button
                  data-testid="end-button"
                  onClick={handleEnd}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-semibold py-4 rounded-full text-lg"
                >
                  <Square className="w-6 h-6 mr-2" />
                  Finalizar Relógio
                </Button>
              </div>
            ) : null}
          </div>

          {/* Today's Entry Info */}
          {entry && (
            <div className="glass-effect p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Registo Ativo</h3>
              
              {entry.is_overtime_day && (
                <div className="mb-4 p-3 bg-amber-900/30 border border-amber-600 rounded-lg flex items-center gap-2">
                  <Coffee className="w-5 h-5 text-amber-400" />
                  <div>
                    <div className="text-amber-400 font-semibold">Horas Extras</div>
                    <div className="text-amber-300 text-sm">{entry.overtime_reason}</div>
                  </div>
                </div>
              )}

              {entry.outside_residence_zone && (
                <div className="mb-4 p-3 bg-blue-900/30 border border-blue-600 rounded-lg flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-400" />
                  <div className="flex-1">
                    <div className="text-blue-400 font-semibold">Fora de Zona de Residência</div>
                    <div className="text-blue-300 text-sm">{entry.location_description}</div>
                    <div className="text-xs text-gray-400 mt-1">Ajuda de Custas aplicável</div>
                  </div>
                </div>
              )}
              
              <div className="space-y-3 text-gray-300">
                <div className="flex justify-between">
                  <span>Início:</span>
                  <span className="font-semibold text-white">
                    {entry.start_time ? new Date(entry.start_time).toLocaleTimeString('pt-PT') : '-'}
                  </span>
                </div>
                {entry.observations && (
                  <div className="pt-3 border-t border-gray-700">
                    <div className="text-gray-400 mb-1">Observações:</div>
                    <div className="text-white italic">{entry.observations}</div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Today's Completed Entries */}
          {todayEntries.length > 0 && (
            <div className="glass-effect p-6 mt-6">
              <h3 className="text-xl font-semibold text-white mb-4">Registos de Hoje ({todayEntries.length})</h3>
              <div className="space-y-3">
                {todayEntries.map((e, idx) => (
                  <div key={e.id || idx} className="bg-[#1a1a1a] p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div className="text-gray-300">
                        <div className="text-sm">
                          {e.start_time ? new Date(e.start_time).toLocaleTimeString('pt-PT') : '-'} → {' '}
                          {e.end_time ? new Date(e.end_time).toLocaleTimeString('pt-PT') : '-'}
                        </div>
                        {e.is_overtime_day && (
                          <div className="text-xs text-amber-400 mt-1">{e.overtime_reason}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className={`font-bold text-lg ${e.is_overtime_day ? 'text-amber-400' : 'text-green-400'}`}>
                          {formatHours(e.total_hours)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Button - Admin Real-Time Status (Admin Only) */}
      {user?.is_admin && (
        <Button
          onClick={openRealtimeModal}
          className="fixed bottom-48 sm:bottom-36 right-4 sm:right-6 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-full p-3 sm:p-4 shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 hover:scale-110 z-50 group"
          title="Status em Tempo Real"
        >
          <Users className="w-5 h-5 sm:w-6 sm:h-6" />
          <span className="hidden sm:block absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-purple-600 text-white px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Status em Tempo Real
          </span>
        </Button>
      )}

      {/* Floating Action Button - OTs (Ordens de Trabalho) */}
      <a
        href="/technical-reports"
        className="fixed bottom-32 sm:bottom-20 right-4 sm:right-6 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-full p-3 sm:p-4 shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 hover:scale-110 z-50 group"
        title="OTs - Ordens de Trabalho"
      >
        <Clipboard className="w-5 h-5 sm:w-6 sm:h-6" />
        <span className="hidden sm:block absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          OTs - Ordens de Trabalho
        </span>
      </a>

      {/* Botão Flutuante Ver Minhas Entradas - Apenas para usuários normais */}
      {!user?.is_admin && (
        <Button
          onClick={() => setShowMyRealtimePopup(true)}
          className="fixed bottom-48 sm:bottom-36 right-4 sm:right-6 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-full p-3 sm:p-4 shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 hover:scale-110 z-50 group"
          title="Ver Minhas Entradas"
        >
          <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
          <span className="hidden sm:block absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-purple-600 text-white px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Ver Minhas Entradas
          </span>
        </Button>
      )}

      {/* Real-Time Status Modal */}
      <Dialog open={showRealtimeModal} onOpenChange={setShowRealtimeModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-white">
                <Users className="w-5 h-5 text-purple-400" />
                Status em Tempo Real - {realtimeData && new Date(realtimeData.date + 'T00:00:00').toLocaleDateString('pt-PT')}
              </DialogTitle>
              <Button
                onClick={fetchRealtimeStatus}
                disabled={realtimeLoading}
                size="sm"
                className="bg-purple-500 hover:bg-purple-600"
              >
                <RefreshCw className={`w-4 h-4 ${realtimeLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </DialogHeader>

          {realtimeLoading && !realtimeData ? (
            <div className="text-center py-12 text-gray-400">A carregar...</div>
          ) : realtimeData ? (
            <div className="space-y-4 mt-4">
              {/* Day Info */}
              {(realtimeData.is_weekend || realtimeData.is_holiday) && (
                <div className={`p-4 rounded-lg border ${
                  realtimeData.is_holiday ? 'bg-amber-900/20 border-amber-600' : 'bg-gray-800/30 border-gray-600'
                }`}>
                  <div className="text-center">
                    {realtimeData.is_holiday ? (
                      <p className="text-amber-400 font-semibold">🎉 Feriado: {realtimeData.holiday_name}</p>
                    ) : (
                      <p className="text-gray-400 font-semibold">🏖️ Fim de Semana</p>
                    )}
                  </div>
                </div>
              )}

              {/* Users Status Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {realtimeData.users.map((userStatus) => {
                  // Mapear estado antigo para novo
                  const estado = userStatus.status || userStatus.estado;
                  const nome = userStatus.full_name || userStatus.nome;
                  const username = userStatus.username || '';
                  
                  return (
                  <div
                    key={userStatus.user_id || userStatus.id}
                    className="bg-[#0f0f0f] border border-gray-700 rounded-lg p-4 hover:border-purple-500 transition"
                  >
                    {/* User Info */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-white font-semibold">{nome}</h3>
                        {username && <p className="text-gray-400 text-sm">@{username}</p>}
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeColor(userStatus.status_color || 'gray')}`}>
                        {estado}
                      </span>
                    </div>

                    {/* Status Details */}
                    <div className="space-y-2">
                      {/* Mostrar lista de entradas se admin e tiver entradas */}
                      {user?.is_admin && userStatus.entradas && userStatus.entradas.length > 0 && (
                        <div className="mb-3 space-y-2">
                          {userStatus.entradas.map((entrada, idx) => {
                            const isActive = entrada.estado === 'ativa';
                            return (
                              <div
                                key={entrada.id}
                                className={`p-2 rounded border text-sm ${isActive ? 'border-green-500 bg-green-500/10' : 'border-gray-600 bg-black/20'}`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-gray-400 text-xs">Entrada {idx + 1}</span>
                                  {isActive && <span className="text-green-400 text-xs font-semibold animate-pulse">ATIVA</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock className="w-3 h-3 text-gray-400" />
                                  <span className="text-white font-mono">
                                    {entrada.inicio} → {entrada.fim || 'agora'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {userStatus.status === 'TRABALHANDO' && (
                        <>
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="w-4 h-4 text-green-400" />
                            <span className="text-gray-300">Início:</span>
                            <span className="text-white font-semibold">{userStatus.clock_in_time}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-300">Tempo decorrido:</span>
                            <span className="text-green-400 font-semibold">{formatHours(userStatus.elapsed_hours)}</span>
                          </div>
                          {userStatus.outside_residence_zone && (
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="w-4 h-4 text-blue-400" />
                              <span className="text-blue-400">Ajuda de Custos</span>
                              {userStatus.location && <span className="text-gray-400">- {userStatus.location}</span>}
                            </div>
                          )}
                        </>
                      )}

                      {userStatus.status === 'TRABALHOU' && (
                        <>
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="w-4 h-4 text-blue-400" />
                            <span className="text-gray-300">Entrada:</span>
                            <span className="text-white font-semibold">{userStatus.clock_in_time}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="w-4 h-4 text-blue-400" />
                            <span className="text-gray-300">Saída:</span>
                            <span className="text-white font-semibold">{userStatus.clock_out_time}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-300">Total:</span>
                            <span className="text-blue-400 font-semibold">{formatHours(userStatus.total_hours)}</span>
                          </div>
                          {userStatus.outside_residence_zone && (
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="w-4 h-4 text-blue-400" />
                              <span className="text-blue-400">Ajuda de Custos</span>
                            </div>
                          )}
                        </>
                      )}

                      {userStatus.status === 'FALTA' && (
                        <p className="text-red-400 text-sm">Sem registo de ponto hoje</p>
                      )}

                      {userStatus.status === 'FÉRIAS' && (
                        <p className="text-purple-400 text-sm">De férias</p>
                      )}

                      {userStatus.status === 'FERIADO' && userStatus.holiday_name && (
                        <p className="text-amber-400 text-sm">{userStatus.holiday_name}</p>
                      )}
                    </div>

                    {/* Botões Admin para Iniciar/Finalizar Relógio */}
                    {user?.is_admin && (
                      <div className="pt-3 mt-3 border-t border-gray-700 flex gap-2">
                        {userStatus.status === 'TRABALHANDO' ? (
                          <Button
                            onClick={() => handleAdminEndClock(userStatus.user_id, nome)}
                            disabled={adminClockLoading[userStatus.user_id] === 'end'}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                            size="sm"
                          >
                            <Square className="w-4 h-4 mr-1" />
                            {adminClockLoading[userStatus.user_id] === 'end' ? 'A finalizar...' : 'Finalizar'}
                          </Button>
                        ) : !['FÉRIAS', 'FERIADO'].includes(userStatus.status) && (
                          <Button
                            onClick={() => handleAdminStartClock(userStatus.user_id, nome)}
                            disabled={adminClockLoading[userStatus.user_id] === 'start'}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                            size="sm"
                          >
                            <Play className="w-4 h-4 mr-1" />
                            {adminClockLoading[userStatus.user_id] === 'start' ? 'A iniciar...' : 'Iniciar'}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
                })}
              </div>

              {/* Summary */}
              <div className="bg-purple-900/20 border border-purple-600 rounded-lg p-4 mt-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-400">
                      {realtimeData.users.filter(u => u.status === 'TRABALHANDO').length}
                    </div>
                    <div className="text-xs text-gray-400">Trabalhando Agora</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-400">
                      {realtimeData.users.filter(u => u.status === 'TRABALHOU').length}
                    </div>
                    <div className="text-xs text-gray-400">Já Trabalharam</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-400">
                      {realtimeData.users.filter(u => u.status === 'FÉRIAS').length}
                    </div>
                    <div className="text-xs text-gray-400">De Férias</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-400">
                      {realtimeData.users.filter(u => u.status === 'FALTA').length}
                    </div>
                    <div className="text-xs text-gray-400">Faltas</div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Popup Realtime - Apenas para usuários */}
      {showMyRealtimePopup && !user?.is_admin && (
        <UserRealtimePopup onClose={() => setShowMyRealtimePopup(false)} />
      )}
    </div>
  );
};

export default Dashboard;