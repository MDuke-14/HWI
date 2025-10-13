import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Clock, Play, Pause, Square, Coffee } from 'lucide-react';

const Dashboard = ({ user, onLogout }) => {
  const [entry, setEntry] = useState(null);
  const [todayEntries, setTodayEntries] = useState([]);
  const [observations, setObservations] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [elapsedTime, setElapsedTime] = useState(0);

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
        let elapsed = (now - start) / 1000;

        // Subtract pause time
        if (entry.pauses) {
          entry.pauses.forEach((pause) => {
            const pauseStart = new Date(pause.pause_start);
            const pauseEnd = pause.pause_end ? new Date(pause.pause_end) : now;
            elapsed -= (pauseEnd - pauseStart) / 1000;
          });
        }

        setElapsedTime(elapsed);
      }, 1000);

      return () => clearInterval(interval);
    } else if (entry && entry.status === 'paused') {
      // Check pause duration and show notification after 1 hour
      const pauses = entry.pauses || [];
      if (pauses.length > 0) {
        const lastPause = pauses[pauses.length - 1];
        if (!lastPause.pause_end) {
          const pauseStart = new Date(lastPause.pause_start);
          const checkPauseDuration = () => {
            const now = new Date();
            const pauseDuration = (now - pauseStart) / 1000 / 60; // minutes
            
            if (pauseDuration >= 60) {
              toast.warning('Atenção: Está em pausa há mais de 1 hora!', {
                duration: 10000,
              });
            }
          };

          pauseNotificationRef.current = setInterval(checkPauseDuration, 60000); // Check every minute
          checkPauseDuration(); // Check immediately
        }
      }

      return () => {
        if (pauseNotificationRef.current) {
          clearInterval(pauseNotificationRef.current);
        }
      };
    }
  }, [entry]);

  const fetchTodayEntry = async () => {
    try {
      const response = await axios.get(`${API}/time-entries/today`);
      setEntry(response.data);
    } catch (error) {
      console.error('Erro ao buscar entrada de hoje:', error);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/time-entries/start`, { observations });
      toast.success('Relógio iniciado!');
      setObservations('');
      fetchTodayEntry();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao iniciar');
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/time-entries/pause/${entry.id}`);
      toast.success('Pausa iniciada');
      fetchTodayEntry();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao pausar');
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/time-entries/resume/${entry.id}`);
      toast.success('Trabalho retomado!');
      fetchTodayEntry();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao retomar');
    } finally {
      setLoading(false);
    }
  };

  const handleEnd = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/time-entries/end/${entry.id}`);
      toast.success(`Relógio finalizado! Total: ${response.data.total_hours}h`);
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
      paused: { text: 'Em Pausa', class: 'status-paused pulse', icon: <Pause className="w-4 h-4" /> },
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
            {!entry || entry.status === 'completed' ? (
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
                <Button
                  data-testid="start-button"
                  onClick={handleStart}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-4 rounded-full text-lg"
                >
                  <Play className="w-6 h-6 mr-2" />
                  Iniciar Jornada
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {entry.status === 'active' && (
                  <>
                    <Button
                      data-testid="pause-button"
                      onClick={handlePause}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-semibold py-4 rounded-full text-lg"
                    >
                      <Coffee className="w-6 h-6 mr-2" />
                      Iniciar Pausa
                    </Button>
                    <Button
                      data-testid="end-button"
                      onClick={handleEnd}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-semibold py-4 rounded-full text-lg"
                    >
                      <Square className="w-6 h-6 mr-2" />
                      Finalizar Jornada
                    </Button>
                  </>
                )}
                {entry.status === 'paused' && (
                  <>
                    <Button
                      data-testid="resume-button"
                      onClick={handleResume}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-4 rounded-full text-lg"
                    >
                      <Play className="w-6 h-6 mr-2" />
                      Retomar Trabalho
                    </Button>
                    <Button
                      data-testid="end-button"
                      onClick={handleEnd}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-semibold py-4 rounded-full text-lg"
                    >
                      <Square className="w-6 h-6 mr-2" />
                      Finalizar Jornada
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Today's Entry Info */}
          {entry && (
            <div className="glass-effect p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Informações de Hoje</h3>
              
              {entry.is_overtime_day && (
                <div className="mb-4 p-3 bg-amber-900/30 border border-amber-600 rounded-lg flex items-center gap-2">
                  <Coffee className="w-5 h-5 text-amber-400" />
                  <div>
                    <div className="text-amber-400 font-semibold">Horas Extras</div>
                    <div className="text-amber-300 text-sm">{entry.overtime_reason}</div>
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
                {entry.end_time && (
                  <div className="flex justify-between">
                    <span>Fim:</span>
                    <span className="font-semibold text-white">
                      {new Date(entry.end_time).toLocaleTimeString('pt-PT')}
                    </span>
                  </div>
                )}
                {entry.pauses && entry.pauses.length > 0 && (
                  <div>
                    <div className="text-gray-400 mb-2">Pausas ({entry.pauses.length}):</div>
                    {entry.pauses.map((pause, idx) => (
                      <div key={idx} className="flex justify-between text-sm ml-4">
                        <span>Pausa {idx + 1}:</span>
                        <span>
                          {new Date(pause.pause_start).toLocaleTimeString('pt-PT')} - {' '}
                          {pause.pause_end ? new Date(pause.pause_end).toLocaleTimeString('pt-PT') : 'Em curso'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {entry.total_hours && (
                  <>
                    {entry.is_overtime_day ? (
                      <div className="flex justify-between pt-3 border-t border-gray-700">
                        <span className="font-semibold">Horas Extras:</span>
                        <span className="font-bold text-amber-400 text-lg">{entry.overtime_hours || entry.total_hours}h</span>
                      </div>
                    ) : (
                      <div className="flex justify-between pt-3 border-t border-gray-700">
                        <span className="font-semibold">Horas Normais:</span>
                        <span className="font-bold text-green-400 text-lg">{entry.regular_hours || entry.total_hours}h</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-400">Total:</span>
                      <span className="font-semibold text-white">{entry.total_hours}h</span>
                    </div>
                  </>
                )}
                {entry.observations && (
                  <div className="pt-3 border-t border-gray-700">
                    <div className="text-gray-400 mb-1">Observações:</div>
                    <div className="text-white italic">{entry.observations}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;