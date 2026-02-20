/**
 * MobileLayout - Layout wrapper que adiciona navegação mobile
 * Renderiza bottom nav em dispositivos móveis e gere estado offline
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useMobile } from '@/contexts/MobileContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useOfflineData } from '@/hooks/useOfflineData';
import { API } from '@/App';
import MobileBottomNav from './MobileBottomNav';
import MobileMenu from './MobileMenu';
import { cn } from '@/lib/utils';
import axios from 'axios';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MobileLayout = ({ children, user, onLogout, showBottomNav = true }) => {
  const location = useLocation();
  const { isMobile, isStandalone } = useMobile();
  const { isDark } = useTheme();
  const { isOnline, pendingCount, forceSync } = useOfflineData(API);
  const [activeTimer, setActiveTimer] = useState(null);

  // Verificar se há timer ativo
  const checkActiveTimer = async () => {
    try {
      const response = await axios.get(`${API}/time-entries/today`);
      const data = response.data;
      // Garantir que é um array
      const entries = Array.isArray(data) ? data : [];
      const active = entries.find(e => e.start_time && !e.end_time);
      setActiveTimer(active || null);
      return active;
    } catch (error) {
      console.error('Erro ao verificar timer:', error);
      return null;
    }
  };

  useEffect(() => {
    if (isOnline) {
      checkActiveTimer();
    }
  }, [isOnline, location.pathname]);

  // Handler para ação rápida de ponto (iniciar/parar)
  const handleQuickAction = async (action) => {
    try {
      // Se action não foi passado, determinar baseado no estado actual
      const currentAction = action || (activeTimer ? 'stop' : 'start');
      
      if (currentAction === 'start') {
        // Obter localização
        let locationData = null;
        if (navigator.geolocation) {
          try {
            const position = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 5000
              });
            });
            locationData = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy
            };
          } catch (geoError) {
            console.warn('Geolocalização não disponível:', geoError);
          }
        }

        const response = await axios.post(`${API}/time-entries/start`, {
          observations: 'Entrada via mobile',
          location: locationData
        });
        
        setActiveTimer(response.data);
        toast.success('Entrada registada!');
      } else {
        // Verificar novamente se há timer ativo
        let timerToEnd = activeTimer;
        if (!timerToEnd?.id) {
          // Buscar timer activo do servidor
          const active = await checkActiveTimer();
          if (!active?.id) {
            toast.error('Nenhum registo ativo para finalizar');
            return;
          }
          timerToEnd = active;
        }
        
        const response = await axios.post(`${API}/time-entries/end/${timerToEnd.id}`, {
          observations: 'Saída via mobile'
        });
        
        setActiveTimer(null);
        toast.success(`Saída registada! Total: ${response.data.total_hours || '0'}h`);
      }
    } catch (error) {
      console.error('Erro na ação rápida:', error);
      toast.error(error.response?.data?.detail || 'Erro ao registar ponto');
      // Recarregar estado do timer em caso de erro
      checkActiveTimer();
    }
  };

  // Handler para abrir modal de status em tempo real (redireciona para dashboard com modal)
  const handleOpenRealtimeStatus = () => {
    // Navegar para dashboard e abrir modal via URL param ou state
    window.location.href = '/?showRealtime=true';
  };

  // Se é a rota /menu em mobile, renderizar MobileMenu
  if (location.pathname === '/menu' && isMobile) {
    return (
      <div className={cn(
        "min-h-screen bg-background",
        isMobile && "has-bottom-nav"
      )}>
        <MobileMenu 
          user={user} 
          onLogout={onLogout}
          isOnline={isOnline}
          pendingSync={pendingCount}
          onForceSync={forceSync}
        />
        {showBottomNav && isMobile && (
          <MobileBottomNav 
            user={user}
            activeTimer={activeTimer}
            onQuickAction={handleQuickAction}
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "min-h-screen bg-background",
      isMobile && showBottomNav && "has-bottom-nav"
    )}>
      {children}
      
      {/* Floating Admin Button - Status em Tempo Real (apenas mobile + admin) */}
      {isMobile && user?.is_admin && location.pathname === '/' && (
        <Button
          onClick={handleOpenRealtimeStatus}
          className={cn(
            "fixed bottom-24 right-4 z-40",
            "bg-gradient-to-r from-purple-500 to-purple-600",
            "hover:from-purple-600 hover:to-purple-700",
            "text-white rounded-full p-3 shadow-xl",
            "transition-all duration-300 hover:scale-110"
          )}
          data-testid="mobile-realtime-btn"
        >
          <Users className="w-5 h-5" />
        </Button>
      )}
      
      {/* Bottom Navigation - apenas em mobile */}
      {showBottomNav && isMobile && (
        <MobileBottomNav 
          user={user}
          activeTimer={activeTimer}
          onQuickAction={handleQuickAction}
        />
      )}
    </div>
  );
};

export default MobileLayout;
