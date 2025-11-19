import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Clock, TrendingUp, LogOut, User, Palmtree, Shield, FileText, CalendarDays, Menu, ChevronDown } from 'lucide-react';

const Navigation = ({ user, onLogout, activePage }) => {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

  // Get current page name
  const currentPage = navItems.find(item => item.path === location.pathname);
  const currentPageName = currentPage ? currentPage.name : 'Menu';
  const CurrentIcon = currentPage ? currentPage.icon : Menu;

  return (
    <nav className="glass-effect border-b border-gray-800">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 text-white hover:text-blue-400 transition-colors">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-2 rounded-lg">
                <Clock className="w-6 h-6" />
              </div>
              <span className="font-bold text-xl">HWI Ponto</span>
            </Link>

            {/* Dropdown Menu */}
            <div className="relative">
              <Button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="bg-gray-800 hover:bg-gray-700 text-white rounded-full flex items-center gap-2"
              >
                <CurrentIcon className="w-4 h-4" />
                <span className="hidden sm:inline">{currentPageName}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
              </Button>

              {/* Dropdown Content */}
              {isMenuOpen && (
                <>
                  {/* Overlay to close menu when clicking outside */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsMenuOpen(false)}
                  />
                  
                  <div className="absolute left-0 mt-2 w-56 bg-[#1a1a1a] border border-gray-700 rounded-lg shadow-2xl z-50 overflow-hidden">
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.path;
                      return (
                        <Link 
                          key={item.key} 
                          to={item.path}
                          onClick={() => setIsMenuOpen(false)}
                          className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                          <span className="font-medium">{item.name}</span>
                          {isActive && (
                            <div className="ml-auto w-2 h-2 bg-white rounded-full" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
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
      </div>
    </nav>
  );
};

export default Navigation;