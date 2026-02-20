/**
 * ThemeContext - Gestão de tema claro/escuro
 * Com persistência em localStorage
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export const THEMES = {
  DARK: 'dark',
  LIGHT: 'light',
  SYSTEM: 'system'
};

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => {
    // Carregar tema guardado ou usar 'dark' por defeito
    const saved = localStorage.getItem('hwi-theme');
    return saved || THEMES.DARK;
  });
  
  const [resolvedTheme, setResolvedTheme] = useState(THEMES.DARK);

  // Aplicar tema ao documento
  useEffect(() => {
    const root = document.documentElement;
    let effectiveTheme = theme;
    
    if (theme === THEMES.SYSTEM) {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches 
        ? THEMES.DARK 
        : THEMES.LIGHT;
    }
    
    setResolvedTheme(effectiveTheme);
    
    // Remover ambas as classes e adicionar a correta
    root.classList.remove('dark', 'light');
    root.classList.add(effectiveTheme);
    
    // Atualizar meta theme-color para PWA
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute(
        'content', 
        effectiveTheme === THEMES.DARK ? '#0a0a0a' : '#ffffff'
      );
    }
    
    // Guardar preferência
    localStorage.setItem('hwi-theme', theme);
  }, [theme]);

  // Ouvir mudanças do sistema
  useEffect(() => {
    if (theme !== THEMES.SYSTEM) return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => {
      setResolvedTheme(e.matches ? THEMES.DARK : THEMES.LIGHT);
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(e.matches ? THEMES.DARK : THEMES.LIGHT);
    };
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = (newTheme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState(prev => prev === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK);
  };

  const isDark = resolvedTheme === THEMES.DARK;

  return (
    <ThemeContext.Provider value={{ 
      theme, 
      resolvedTheme, 
      setTheme, 
      toggleTheme, 
      isDark,
      THEMES 
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;
