import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { X, Clock } from 'lucide-react';

const UserRealtimePopup = ({ onClose }) => {
  const [userData, setUserData] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    fetchMyStatus();
    
    // Atualizar a cada 1 minuto
    const interval = setInterval(() => {
      fetchMyStatus();
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

  const fetchMyStatus = async () => {
    try {
      const response = await axios.get(`${API}/time-entries/my-realtime-status`);
      setUserData(response.data);
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
      'trabalho_iniciado': '🟢 Trabalhando',
      'terminou': '🔵 Terminou',
      'falta': '🔴 Falta',
      'ferias': '🟣 Férias',
      'folga': '⚪ Folga',
      'feriado': '🟡 Feriado'
    };
    return labels[estado] || estado;
  };

  if (!userData) {
    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
        <div className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-8">
          <Clock className="w-12 h-12 text-blue-400 mx-auto mb-4 animate-spin" />
          <p className="text-gray-400">Carregando...</p>
        </div>
      </div>
    );
  }

  const totalMinutes = calculateTotalDay(userData.entradas || []);

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-gray-700 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between bg-[#0f0f0f]">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-blue-400" />
            <div>
              <h2 className="text-xl font-bold text-white">O Meu Dia de Trabalho</h2>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Nome e Estado */}
          <div className="bg-[#0f0f0f] border border-gray-700 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-white">{userData.nome}</h3>
              <span className={`px-4 py-2 rounded-full text-sm font-semibold text-white ${getStatusColor(userData.estado)}`}>
                {getStatusLabel(userData.estado)}
              </span>
            </div>

            {/* Total do Dia */}
            {totalMinutes > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 text-lg">Total de Hoje:</span>
                  <span className="text-blue-400 font-bold text-3xl">{formatMinutes(totalMinutes)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Entradas do Dia */}
          <div className="space-y-3">
            <h4 className="text-lg font-semibold text-white mb-3">Entradas de Hoje</h4>
            
            {userData.entradas && userData.entradas.length > 0 ? (
              userData.entradas.map((entrada, idx) => {
                const elapsed = calculateElapsed(entrada.inicio, entrada.fim);
                const isActive = entrada.estado === 'ativa';
                
                return (
                  <div
                    key={entrada.id}
                    className={`p-4 rounded-lg border ${isActive ? 'border-green-500 bg-green-500/10' : 'border-gray-700 bg-[#0f0f0f]'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-semibold">Entrada {idx + 1}</span>
                      {isActive && (
                        <span className="text-green-400 font-semibold text-sm animate-pulse">
                          ● ATIVA
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3 mb-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="text-white font-mono text-lg">
                        {entrada.inicio} → {entrada.fim || 'agora'}
                      </span>
                    </div>
                    
                    <div className={`text-sm ${isActive ? 'text-green-400' : 'text-gray-400'}`}>
                      {isActive ? 'Tempo Decorrido: ' : 'Duração: '}
                      <span className="font-semibold">{formatMinutes(elapsed)}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 bg-[#0f0f0f] rounded-lg border border-gray-700">
                <Clock className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">Sem entradas registadas hoje</p>
                <p className="text-gray-500 text-sm mt-2">Inicie o seu relógio de ponto</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserRealtimePopup;
