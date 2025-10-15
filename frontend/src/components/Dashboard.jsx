import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Clock, Play, Pause, Square, Coffee, MapPin } from 'lucide-react';

const Dashboard = ({ user, onLogout }) => {
  const [entry, setEntry] = useState(null);
  const [todayEntries, setTodayEntries] = useState([]);
  const [observations, setObservations] = useState('');
  const [endObservations, setEndObservations] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [elapsedTime, setElapsedTime] = useState(0);
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
      if (response.data.has_active === false) {
        // Multiple entries for today
        setEntry(null);
        setTodayEntries(response.data.entries || []);
      } else {
        // Active entry
        setEntry(response.data);
        setTodayEntries([]);
      }
    } catch (error) {
      console.error('Erro ao buscar entrada de hoje:', error);
    }
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
      setOutsideResidenceZone(false);
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
      fetchTodayEntry();
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
          <div className="glass-effect p-8 mb-6">
            {!entry ? (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="observations" className="text-gray-300 mb-2 block">
                    Observações (opcional)
                  </Label>
                  <Textarea
                    data-testid="observations-input"
                    id="observations"
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    placeholder="Ex: Entrada atrasada devido a reunião externa..."
                    className="bg-[#1a1a1a] border-gray-700 text-white focus:ring-blue-500 min-h-[100px]"
                  />
                </div>

                {/* Outside Residence Zone Checkbox */}
                <div className="flex items-start space-x-3 p-4 bg-[#1a1a1a] rounded-lg border border-gray-700">
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
                      className="text-gray-300 font-medium cursor-pointer flex items-center gap-2"
                    >
                      <MapPin className="w-4 h-4" />
                      Fora de Zona de Residência
                    </Label>
                    <p className="text-sm text-gray-400 mt-1">
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
              <div className="space-y-4">
                <div>
                  <Label htmlFor="end-observations" className="text-gray-300 mb-2 block">
                    Observações ao Finalizar (opcional)
                  </Label>
                  <Textarea
                    data-testid="end-observations-input"
                    id="end-observations"
                    value={endObservations}
                    onChange={(e) => setEndObservations(e.target.value)}
                    placeholder="Ex: Trabalho concluído, reunião realizada..."
                    className="bg-[#1a1a1a] border-gray-700 text-white focus:ring-blue-500 min-h-[100px]"
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
                          {e.total_hours}h
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
    </div>
  );
};

export default Dashboard;