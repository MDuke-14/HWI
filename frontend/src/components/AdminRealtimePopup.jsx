import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { X, Clock, Users as UsersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const AdminRealtimePopup = ({ onClose }) => {
  const [users, setUsers] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    fetchRealtimeStatus();
    
    // Atualizar a cada 1 minuto
    const interval = setInterval(() => {
      fetchRealtimeStatus();
      setCurrentTime(new Date());
    }, 60000);
    
    // Atualizar relógio a cada segundo
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(clockInterval);
    };
  }, []);

  const fetchRealtimeStatus = async () => {
    try {
      const response = await axios.get(`${API}/admin/realtime-status`);
      setUsers(response.data);
    } catch (error) {
      console.error('Erro ao buscar status:', error);
    }
  };

  const parseTime = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  const calculateElapsed = (inicio, fim = null) => {
    if (!inicio) return 0;
    
    const inicioMin = parseTime(inicio);
    const fimMin = fim ? parseTime(fim) : (currentTime.getHours() * 60 + currentTime.getMinutes());
    
    return fimMin - inicioMin;
  };

  const formatMinutes = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  };

  const calculateTotalDay = (entradas) => {
    let total = 0;
    entradas.forEach(entrada => {
      total += calculateElapsed(entrada.inicio, entrada.fim);
    });
    return total;
  };

  const getStatusColor = (estado) => {
    const colors = {
      'trabalho_iniciado': 'bg-green-500',
      'terminou': 'bg-blue-500',
      'falta': 'bg-red-500',
      'ferias': 'bg-purple-500',
      'folga': 'bg-gray-500',
      'feriado': 'bg-amber-500'
    };
    return colors[estado] || 'bg-gray-500';
  };

  const getStatusLabel = (estado) => {
    const labels = {
      'trabalho_iniciado': 'Trabalhando',
      'terminou': 'Terminou',
      'falta': 'Falta',
      'ferias': 'Férias',
      'folga': 'Folga',
      'feriado': 'Feriado'
    };
    return labels[estado] || estado;
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-gray-700 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between bg-[#0f0f0f]">
          <div className="flex items-center gap-3">
            <UsersIcon className="w-6 h-6 text-blue-400" />
            <div>
              <h2 className="text-xl font-bold text-white">Status em Tempo Real</h2>
              <p className="text-sm text-gray-400">
                {currentTime.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })} - {currentTime.toLocaleTimeString('pt-PT')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-full transition"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {/* User Cards */}
        <div className="flex-1 overflow-y-auto p-4">
          {users && users.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.map((user) => {
                const totalMinutes = calculateTotalDay(user.entradas || []);
                
                return (
                  <div key={user.id} className="bg-[#0f0f0f] border border-gray-700 rounded-lg p-4">
                    {/* Nome e Estado */}
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-white font-semibold">{user.nome}</h3>
                      <span className={`px-3 py-1 rounded text-xs font-semibold text-white ${getStatusColor(user.estado)}`}>
                        {getStatusLabel(user.estado)}
                      </span>
                    </div>

                    {/* Entradas */}
                    {user.entradas && user.entradas.length > 0 ? (
                      <div className="space-y-2 mb-3">
                        {user.entradas.map((entrada, idx) => {
                        const elapsed = calculateElapsed(entrada.inicio, entrada.fim);
                        const isActive = entrada.estado === 'ativa';
                        
                        return (
                          <div
                            key={entrada.id}
                            className={`p-2 rounded border ${isActive ? 'border-green-500 bg-green-500/10' : 'border-gray-700 bg-black/30'}`}
                          >
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-gray-400">Entrada {idx + 1}</span>
                              {isActive && (
                                <span className="text-green-400 font-semibold animate-pulse">ATIVA</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Clock className="w-3 h-3 text-gray-400" />
                              <span className="text-white font-mono">
                                {entrada.inicio} → {entrada.fim || 'agora'}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {isActive ? 'Decorrido: ' : 'Total: '}{formatMinutes(elapsed)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      Sem entradas hoje
                    </div>
                  )}

                  {/* Total do Dia */}
                  {totalMinutes > 0 && (
                    <div className="pt-3 border-t border-gray-700">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">Total do Dia:</span>
                        <span className="text-blue-400 font-bold">{formatMinutes(totalMinutes)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Clock className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Carregando status dos utilizadores...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminRealtimePopup;
