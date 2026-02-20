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

  // Detectar tipo de dispositivo
  const updateDeviceType = useCallback(() => {
    const width = window.innerWidth;
    setScreenWidth(width);
    setIsMobile(width < BREAKPOINTS.tablet);
    setIsTablet(width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop);
    setOrientation(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
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
  }, [updateDeviceType]);

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
