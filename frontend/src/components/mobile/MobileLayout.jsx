/**
 * MobileLayout - Layout wrapper que adiciona navegação mobile
 * Renderiza bottom nav em dispositivos móveis e gere estado offline
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useMobile } from '@/contexts/MobileContext';
import { useOfflineData } from '@/hooks/useOfflineData';
import { API } from '@/App';
import MobileBottomNav from './MobileBottomNav';
import MobileMenu from './MobileMenu';
import { cn } from '@/lib/utils';
import axios from 'axios';
import { toast } from 'sonner';

const MobileLayout = ({ children, user, onLogout, showBottomNav = true }) => {
  const location = useLocation();
  const { isMobile, isStandalone } = useMobile();
  const { isOnline, pendingCount, forceSync } = useOfflineData(API);
  const [activeTimer, setActiveTimer] = useState(null);

  // Verificar se há timer ativo
  useEffect(() => {
    const checkActiveTimer = async () => {
      try {
        const response = await axios.get(`${API}/time-entries/today`);
        const entries = response.data;
        const active = entries.find(e => e.start_time && !e.end_time);
        setActiveTimer(active || null);
      } catch (error) {
        console.error('Erro ao verificar timer:', error);
      }
    };

    if (isOnline) {
      checkActiveTimer();
    }
  }, [isOnline, location.pathname]);

  // Handler para ação rápida de ponto (iniciar/parar)
  const handleQuickAction = async (action) => {
    try {
      if (action === 'start') {
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
        const response = await axios.post(`${API}/time-entries/end`, {
          observations: 'Saída via mobile'
        });
        
        setActiveTimer(null);
        toast.success('Saída registada!');
      }
    } catch (error) {
      console.error('Erro na ação rápida:', error);
      toast.error(error.response?.data?.detail || 'Erro ao registar ponto');
    }
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
