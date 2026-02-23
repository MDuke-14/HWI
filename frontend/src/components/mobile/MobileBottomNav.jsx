/**
 * MobileBottomNav - Navegação inferior para dispositivos móveis
 * Acesso rápido às principais funcionalidades
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  FileText, 
  Calendar, 
  Briefcase, 
  Menu,
  Play,
  Square,
  Clock
} from 'lucide-react';
import { useMobile } from '@/contexts/MobileContext';
import { cn } from '@/lib/utils';

const MobileBottomNav = ({ user, activeTimer, onQuickAction }) => {
  const location = useLocation();
  const { bottomNavVisible, isStandalone, forcedMode } = useMobile();

  // Items de navegação base
  const navItems = [
    { 
      name: 'Início', 
      path: '/', 
      icon: Home,
      testId: 'mobile-nav-home'
    },
    { 
      name: 'OTs', 
      path: '/technical-reports', 
      icon: Briefcase,
      testId: 'mobile-nav-ots'
    },
    { 
      name: 'Ponto', 
      path: null, // Ação especial
      icon: activeTimer ? Square : Play,
      isAction: true,
      highlight: true,
      testId: 'mobile-nav-ponto'
    },
    { 
      name: 'Calendário', 
      path: '/calendar', 
      icon: Calendar,
      testId: 'mobile-nav-calendar'
    },
    { 
      name: 'Menu', 
      path: '/menu', 
      icon: Menu,
      testId: 'mobile-nav-menu'
    }
  ];

  const handleNavClick = (item) => {
    if (item.isAction && onQuickAction) {
      onQuickAction(activeTimer ? 'stop' : 'start');
    }
  };

  return (
    <nav 
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 md:hidden",
        "transition-transform duration-300 ease-in-out",
        !bottomNavVisible && "translate-y-full",
        // Padding extra para safe area em iPhones
        isStandalone && "pb-safe"
      )}
      data-testid="mobile-bottom-nav"
    >
      {/* Blur background */}
      <div className="absolute inset-0 bg-gray-900/95 dark:bg-gray-900/95 light:bg-white/95 backdrop-blur-lg border-t border-gray-800 dark:border-gray-800 light:border-gray-200" />
      
      <div className="relative flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.path && location.pathname === item.path;
          
          if (item.isAction) {
            // Botão central de ação rápida (Ponto)
            return (
              <button
                key={item.name}
                onClick={() => handleNavClick(item)}
                data-testid={item.testId}
                className={cn(
                  "relative flex flex-col items-center justify-center",
                  "-mt-6 w-16 h-16 rounded-full",
                  "shadow-lg shadow-blue-500/30",
                  activeTimer 
                    ? "bg-red-500 hover:bg-red-600" 
                    : "bg-blue-500 hover:bg-blue-600",
                  "text-white transition-all duration-200",
                  "active:scale-95"
                )}
              >
                <Icon className="w-7 h-7" />
                {activeTimer && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 items-center justify-center">
                      <Clock className="w-2.5 h-2.5 text-white" />
                    </span>
                  </span>
                )}
              </button>
            );
          }
          
          // Links normais
          return (
            <Link
              key={item.name}
              to={item.path}
              data-testid={item.testId}
              className={cn(
                "flex flex-col items-center justify-center py-2 px-3 rounded-lg",
                "transition-colors duration-200",
                isActive 
                  ? "text-blue-400" 
                  : "text-gray-400 hover:text-gray-200"
              )}
            >
              <Icon className={cn(
                "w-6 h-6 mb-1",
                isActive && "text-blue-400"
              )} />
              <span className={cn(
                "text-xs font-medium",
                isActive && "text-blue-400"
              )}>
                {item.name}
              </span>
              {isActive && (
                <div className="absolute bottom-1 w-1 h-1 rounded-full bg-blue-400" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
