import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Clock, TrendingUp, LogOut, User, Palmtree, Shield, FileText, CalendarDays } from 'lucide-react';

const Navigation = ({ user, onLogout, activePage }) => {
  const location = useLocation();

  const baseNavItems = [
    { name: 'Dashboard', path: '/', icon: Clock, key: 'dashboard' },
    { name: 'Relatórios', path: '/reports', icon: TrendingUp, key: 'reports' },
    { name: 'Horas Extras', path: '/overtime', icon: TrendingUp, key: 'overtime' },
    { name: 'Férias', path: '/vacations', icon: Palmtree, key: 'vacations' },
    { name: 'Faltas', path: '/absences', icon: FileText, key: 'absences' },
    { name: 'Calendário', path: '/calendar', icon: CalendarDays, key: 'calendar' }
  ];
  
  const adminNavItem = { name: 'Admin', path: '/admin', icon: Shield, key: 'admin' };
  
  const navItems = user?.is_admin ? [...baseNavItems, adminNavItem] : baseNavItems;

  return (
    <nav className="glass-effect border-b border-gray-800">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 text-white hover:text-blue-400 transition-colors">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-2 rounded-lg">
                <Clock className="w-6 h-6" />
              </div>
              <span className="font-bold text-xl">HWI Ponto</span>
            </Link>

            <div className="hidden md:flex gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link key={item.key} to={item.path}>
                    <Button
                      data-testid={`nav-${item.key}`}
                      className={`${
                        isActive
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-transparent text-gray-400 hover:text-white hover:bg-gray-800'
                      } rounded-full`}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {item.name}
                    </Button>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-gray-300">
              <User className="w-4 h-4" />
              <span className="hidden md:inline" data-testid="user-name">{user?.username}</span>
            </div>
            <Button
              data-testid="logout-button"
              onClick={onLogout}
              className="bg-red-600 hover:bg-red-700 text-white rounded-full"
            >
              <LogOut className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Sair</span>
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden flex gap-2 pb-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.key} to={item.path} className="flex-1">
                <Button
                  className={`w-full ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-transparent text-gray-400 hover:text-white'
                  }`}
                  size="sm"
                >
                  <Icon className="w-4 h-4" />
                </Button>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default Navigation;