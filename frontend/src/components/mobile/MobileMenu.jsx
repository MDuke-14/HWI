/**
 * MobileMenu - Página de menu completo para mobile
 * Acesso a todas as funcionalidades e configurações
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Clock, 
  TrendingUp, 
  Palmtree, 
  FileText, 
  CalendarDays, 
  Shield, 
  User, 
  LogOut, 
  Settings,
  Briefcase,
  Bell,
  Moon,
  Sun,
  ChevronRight,
  Wifi,
  WifiOff,
  RefreshCw,
  HelpCircle,
  Info
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useMobile } from '@/contexts/MobileContext';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const MobileMenu = ({ user, onLogout, isOnline, pendingSync, onForceSync }) => {
  const navigate = useNavigate();
  const { theme, setTheme, isDark, THEMES } = useTheme();
  const { isStandalone } = useMobile();

  // Grupos de menu
  const menuGroups = [
    {
      title: 'Principal',
      items: [
        { name: 'Dashboard', path: '/', icon: Clock, description: 'Relógio de ponto' },
        { name: 'Ordens de Trabalho', path: '/technical-reports', icon: Briefcase, description: 'Gestão de OTs' },
        { name: 'Calendário', path: '/calendar', icon: CalendarDays, description: 'Eventos e serviços' },
      ]
    },
    {
      title: 'Gestão Pessoal',
      items: [
        { name: 'Relatórios', path: '/reports', icon: TrendingUp, description: 'Consultar horas' },
        { name: 'Férias', path: '/vacations', icon: Palmtree, description: 'Marcação de férias' },
        { name: 'Faltas', path: '/absences', icon: FileText, description: 'Registo de ausências' },
      ]
    },
    ...(user?.is_admin ? [{
      title: 'Administração',
      items: [
        { name: 'Painel Admin', path: '/admin', icon: Shield, description: 'Gestão do sistema' },
      ]
    }] : [])
  ];

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
      navigate('/login');
    }
  };

  // Classes dinâmicas baseadas no tema
  const bgMain = isDark ? 'bg-gray-950' : 'bg-gray-100';
  const bgCard = isDark ? 'bg-gray-900' : 'bg-white';
  const bgCardHover = isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50';
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-600';
  const borderColor = isDark ? 'divide-gray-800' : 'divide-gray-200';

  return (
    <div className={`min-h-screen ${bgMain} pb-20 mobile-safe-top`}>
      {/* Header com perfil */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 px-4 pt-8 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
            <User className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">{user?.name || user?.username}</h2>
            <p className="text-blue-200 text-sm">{user?.email || 'Colaborador'}</p>
            {user?.is_admin && (
              <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-xs font-medium bg-white/20 text-white">
                <Shield className="w-3 h-3 mr-1" />
                Admin
              </span>
            )}
          </div>
        </div>
        
        {/* Status de conexão */}
        <div className="mt-4 flex items-center gap-2">
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
            isOnline 
              ? "bg-green-500/20 text-green-300" 
              : "bg-red-500/20 text-red-300"
          )}>
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isOnline ? 'Online' : 'Offline'}
          </div>
          
          {pendingSync > 0 && (
            <button 
              onClick={onForceSync}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-300"
            >
              <RefreshCw className="w-3 h-3" />
              {pendingSync} pendente(s)
            </button>
          )}
        </div>
      </div>

      {/* Menu Groups */}
      <div className="px-4 py-4 space-y-6">
        {menuGroups.map((group) => (
          <div key={group.title}>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
              {group.title}
            </h3>
            <div className={`${bgCard} rounded-xl overflow-hidden ${borderColor}`}>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-4 p-4 ${bgCardHover} transition-colors border-b last:border-b-0 ${isDark ? 'border-gray-800' : 'border-gray-100'}`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`${textPrimary} font-medium`}>{item.name}</p>
                      <p className={`${textSecondary} text-sm truncate`}>{item.description}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Configurações */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
            Configurações
          </h3>
          <div className={`${bgCard} rounded-xl overflow-hidden ${borderColor}`}>
            {/* Toggle de Tema */}
            <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  {isDark ? <Moon className="w-5 h-5 text-purple-400" /> : <Sun className="w-5 h-5 text-yellow-500" />}
                </div>
                <div>
                  <p className={`${textPrimary} font-medium`}>Tema Escuro</p>
                  <p className={`${textSecondary} text-sm`}>
                    {isDark ? 'Ativo' : 'Desativo'}
                  </p>
                </div>
              </div>
              <Switch 
                checked={isDark}
                onCheckedChange={(checked) => setTheme(checked ? THEMES.DARK : THEMES.LIGHT)}
              />
            </div>

            {/* Notificações */}
            <Link
              to="/settings/notifications"
              className={`flex items-center gap-4 p-4 ${bgCardHover} transition-colors border-b ${isDark ? 'border-gray-800' : 'border-gray-100'}`}
            >
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Bell className="w-5 h-5 text-orange-400" />
              </div>
              <div className="flex-1">
                <p className={`${textPrimary} font-medium`}>Notificações</p>
                <p className={`${textSecondary} text-sm`}>Gerir alertas</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </Link>

            {/* Alterar Password */}
            <Link
              to="/change-password"
              className={`flex items-center gap-4 p-4 ${bgCardHover} transition-colors`}
            >
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Settings className="w-5 h-5 text-green-400" />
              </div>
              <div className="flex-1">
                <p className={`${textPrimary} font-medium`}>Alterar Password</p>
                <p className={`${textSecondary} text-sm`}>Segurança da conta</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </Link>
          </div>
        </div>

        {/* Informações */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
            Informações
          </h3>
          <div className={`${bgCard} rounded-xl overflow-hidden`}>
            <div className="flex items-center gap-4 p-4">
              <div className="w-10 h-10 rounded-lg bg-gray-500/10 flex items-center justify-center">
                <Info className="w-5 h-5 text-gray-400" />
              </div>
              <div className="flex-1">
                <p className={`${textPrimary} font-medium`}>Versão</p>
                <p className={`${textSecondary} text-sm`}>
                  HWI Ponto v2.0 {isStandalone && '(PWA)'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Logout */}
        <Button
          onClick={handleLogout}
          variant="outline"
          className="w-full h-14 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          data-testid="mobile-logout-btn"
        >
          <LogOut className="w-5 h-5 mr-2" />
          Terminar Sessão
        </Button>
      </div>
    </div>
  );
};

export default MobileMenu;
