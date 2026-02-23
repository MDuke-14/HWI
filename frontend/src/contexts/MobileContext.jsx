/**
 * MobileContext - Gestão de estado mobile
 * Detecta dispositivos móveis e gere UI adaptativa
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const MobileContext = createContext(null);

// Breakpoints
const BREAKPOINTS = {
  mobile: 640,    // sm
  tablet: 768,    // md
  desktop: 1024,  // lg
};

export const MobileProvider = ({ children }) => {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [screenWidth, setScreenWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [orientation, setOrientation] = useState('portrait');
  const [isStandalone, setIsStandalone] = useState(false);
  const [bottomNavVisible, setBottomNavVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [forcedMode, setForcedMode] = useState(() => {
    // Carregar preferência guardada
    if (typeof window !== 'undefined') {
      return localStorage.getItem('forcedViewMode') || null;
    }
    return null;
  });

  // Detectar tipo de dispositivo
  const updateDeviceType = useCallback(() => {
    const width = window.innerWidth;
    setScreenWidth(width);
    
    // Se modo forçado está ativo, usar esse
    if (forcedMode === 'mobile') {
      setIsMobile(true);
      setIsTablet(false);
    } else if (forcedMode === 'desktop') {
      setIsMobile(false);
      setIsTablet(false);
    } else {
      // Detecção automática
      setIsMobile(width < BREAKPOINTS.tablet);
      setIsTablet(width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop);
    }
    
    setOrientation(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
  }, [forcedMode]);

  // Função para alternar modo
  const toggleViewMode = useCallback(() => {
    setForcedMode(prev => {
      let newMode;
      if (prev === 'mobile') {
        newMode = 'desktop';
      } else if (prev === 'desktop') {
        newMode = null; // auto
      } else {
        newMode = 'mobile';
      }
      
      // Guardar preferência
      if (newMode) {
        localStorage.setItem('forcedViewMode', newMode);
      } else {
        localStorage.removeItem('forcedViewMode');
      }
      
      return newMode;
    });
  }, []);

  // Função para definir modo específico
  const setViewMode = useCallback((mode) => {
    setForcedMode(mode);
    if (mode) {
      localStorage.setItem('forcedViewMode', mode);
    } else {
      localStorage.removeItem('forcedViewMode');
    }
  }, []);

  // Detectar se é PWA standalone
  useEffect(() => {
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
    };
    
    checkStandalone();
  }, []);

  // Listener de resize
  useEffect(() => {
    updateDeviceType();
    
    const handleResize = () => {
      updateDeviceType();
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [updateDeviceType, forcedMode]);

  // Esconder bottom nav ao scrollar para baixo (mobile UX)
  useEffect(() => {
    if (!isMobile) return;
    
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setBottomNavVisible(false);
      } else {
        setBottomNavVisible(true);
      }
      
      setLastScrollY(currentScrollY);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile, lastScrollY]);

  // Verificar se é touch device
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Utilidade para classes condicionais
  const mobileClass = (mobileClasses, desktopClasses = '') => {
    return isMobile ? mobileClasses : desktopClasses;
  };

  return (
    <MobileContext.Provider value={{
      isMobile,
      isTablet,
      isDesktop: !isMobile && !isTablet,
      screenWidth,
      orientation,
      isStandalone,
      isTouchDevice,
      bottomNavVisible,
      setBottomNavVisible,
      mobileClass,
      BREAKPOINTS
    }}>
      {children}
    </MobileContext.Provider>
  );
};

export const useMobile = () => {
  const context = useContext(MobileContext);
  if (!context) {
    throw new Error('useMobile must be used within a MobileProvider');
  }
  return context;
};

export default MobileContext;
