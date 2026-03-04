import { useState, useEffect } from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Login from '@/components/Login';
import ChangePassword from '@/components/ChangePassword';
import Dashboard from '@/components/Dashboard';
import Reports from '@/components/Reports';
import Vacations from '@/components/Vacations';
import Absences from '@/components/Absences';
import AdminDashboard from '@/components/AdminDashboard';
import AdminTimeEntries from '@/components/AdminTimeEntries';
import Calendar from '@/components/Calendar';
import TechnicalReports from '@/components/TechnicalReports';
import OvertimeAuthorization from '@/components/OvertimeAuthorization';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { MobileProvider } from '@/contexts/MobileContext';
import MobileLayout from '@/components/mobile/MobileLayout';
import MobileNotifications from '@/components/mobile/MobileNotifications';
import MobileProfile from '@/components/mobile/MobileProfile';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Axios interceptor for adding auth token
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      const userData = JSON.parse(savedUser);
      setIsAuthenticated(true);
      setUser(userData);
      setMustChangePassword(userData.must_change_password || false);
    }
    setLoading(false);
  }, []);

  const handleLogin = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setIsAuthenticated(true);
    setUser(userData);
    setMustChangePassword(userData.must_change_password || false);
  };

  const handlePasswordChanged = () => {
    // Update user data to clear must_change_password flag
    const updatedUser = { ...user, must_change_password: false };
    localStorage.setItem('user', JSON.stringify(updatedUser));
    setUser(updatedUser);
    setMustChangePassword(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
    setMustChangePassword(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-white text-lg">A carregar...</div>
      </div>
    );
  }

  // If authenticated but must change password, force password change screen
  if (isAuthenticated && mustChangePassword) {
    return (
      <div className="App">
        <ChangePassword onPasswordChanged={handlePasswordChanged} />
        <Toaster position="top-right" />
      </div>
    );
  }

  return (
    <ThemeProvider>
      <MobileProvider>
        <div className="App">
          <BrowserRouter>
            <Routes>
              <Route
                path="/login"
                element={
                  isAuthenticated ? (
                    <Navigate to="/" replace />
                  ) : (
                    <Login onLogin={handleLogin} />
                  )
                }
              />
              <Route
                path="/"
                element={
                  isAuthenticated ? (
                    <MobileLayout user={user} onLogout={handleLogout}>
                      <Dashboard user={user} onLogout={handleLogout} />
                    </MobileLayout>
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/reports"
                element={
                  isAuthenticated ? (
                    <MobileLayout user={user} onLogout={handleLogout}>
                      <Reports user={user} onLogout={handleLogout} />
                    </MobileLayout>
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/vacations"
                element={
                  isAuthenticated ? (
                    <MobileLayout user={user} onLogout={handleLogout}>
                      <Vacations user={user} onLogout={handleLogout} />
                    </MobileLayout>
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/absences"
                element={
                  isAuthenticated ? (
                    <MobileLayout user={user} onLogout={handleLogout}>
                      <Absences user={user} onLogout={handleLogout} />
                    </MobileLayout>
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/calendar"
                element={
                  isAuthenticated ? (
                    <MobileLayout user={user} onLogout={handleLogout}>
                      <Calendar user={user} onLogout={handleLogout} />
                    </MobileLayout>
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/technical-reports"
                element={
                  isAuthenticated ? (
                    <MobileLayout user={user} onLogout={handleLogout}>
                      <TechnicalReports user={user} onLogout={handleLogout} />
                    </MobileLayout>
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/settings/notifications"
                element={
                  isAuthenticated ? (
                    <MobileLayout user={user} onLogout={handleLogout}>
                      <MobileNotifications user={user} />
                    </MobileLayout>
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/change-password"
                element={
                  isAuthenticated ? (
                    <MobileLayout user={user} onLogout={handleLogout}>
                      <MobileProfile />
                    </MobileLayout>
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/menu"
                element={
                  isAuthenticated ? (
                    <MobileLayout user={user} onLogout={handleLogout} showBottomNav={true}>
                      {/* MobileMenu is rendered inside MobileLayout for /menu route */}
                    </MobileLayout>
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/admin"
                element={
                  isAuthenticated && user?.is_admin ? (
                    <MobileLayout user={user} onLogout={handleLogout}>
                      <AdminDashboard user={user} onLogout={handleLogout} />
                    </MobileLayout>
                  ) : (
                    <Navigate to="/" replace />
                  )
                }
              />
              <Route
                path="/admin/time-entries"
                element={
                  isAuthenticated && user?.is_admin ? (
                    <MobileLayout user={user} onLogout={handleLogout}>
                      <AdminTimeEntries user={user} onLogout={handleLogout} />
                    </MobileLayout>
                  ) : (
                    <Navigate to="/" replace />
                  )
                }
              />
              {/* Rota pública para autorização de horas extra (requer login admin) */}
              <Route
                path="/authorize/:token"
                element={<OvertimeAuthorization />}
              />
            </Routes>
          </BrowserRouter>
          <Toaster position="top-right" richColors />
        </div>
      </MobileProvider>
    </ThemeProvider>
  );
}

export default App;