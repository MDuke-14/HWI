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
import PCStatusPage from '@/components/PCStatusPage';
import PublicReferencePage from '@/components/PublicReferencePage';
import ErrorLog from '@/components/ErrorLog';
import DespesasInternas from '@/components/DespesasInternas';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { MobileProvider } from '@/contexts/MobileContext';
import MobileLayout from '@/components/mobile/MobileLayout';
import MobileNotifications from '@/components/mobile/MobileNotifications';
import MobileProfile from '@/components/mobile/MobileProfile';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Redirect after login (supports redirect_after_login from PC status page)
function LoginRedirect() {
  const redirect = localStorage.getItem('redirect_after_login');
  if (redirect) {
    localStorage.removeItem('redirect_after_login');
    return <Navigate to={redirect} replace />;
  }
  return <Navigate to="/" replace />;
}

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

// Retry automático para erros transitórios de gateway (Cloudflare 520, 502, 503, 504)
const TRANSIENT_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524]);
const MAX_RETRIES = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config || {};
    const status = error.response?.status;

    // Retry somente para status transitórios, métodos idempotentes ou endpoints seguros,
    // e não para o próprio endpoint de logging (evita loops).
    // O login PERMITE retry porque é o caminho crítico de recuperação após o backend reiniciar.
    const url = config.url || '';
    const method = (config.method || 'get').toLowerCase();
    const isIdempotent = ['get', 'head', 'options', 'put', 'delete'].includes(method);
    const isLoginRequest = url.includes('/auth/login');
    const isLogEndpoint = url.includes('/errors/log');

    if (
      (status === undefined || TRANSIENT_STATUSES.has(status)) &&
      !isLogEndpoint &&
      (isIdempotent || method === 'post' || isLoginRequest)
    ) {
      config.__retryCount = config.__retryCount || 0;
      // Login tem mais retries (3) com mais delay para apanhar arranque do backend
      const maxRetries = isLoginRequest ? 4 : MAX_RETRIES;
      if (config.__retryCount < maxRetries) {
        config.__retryCount += 1;
        const delay = isLoginRequest
          ? 800 * config.__retryCount  // 800ms, 1.6s, 2.4s, 3.2s
          : 250 * 2 ** (config.__retryCount - 1); // 250ms, 500ms
        await sleep(delay);
        try {
          return await axios(config);
        } catch (_) { /* cai para o handler abaixo */ }
      }
    }
    return handleResponseError(error);
  }
);

// Extracted so retry path can still route to error-logging after final failure
async function handleResponseError(error) {
    const status = error.response?.status;
    const url = error.config?.url || '';
    const method = error.config?.method?.toUpperCase() || 'GET';

    // Capturar 4xx (warning) e 5xx (error), exceto 401 e o próprio endpoint de log
    const skipUrls = ['/errors/log', '/admin/errors', '/auth/login', '/auth/refresh'];
    const shouldLog = status >= 400
      && status !== 401
      && !skipUrls.some((u) => url.includes(u));

    if (shouldLog) {
      try {
        const detail = error.response?.data?.detail || error.message || 'Erro';
        const isWarning = status >= 400 && status < 500;
        const severity = isWarning ? 'warning' : 'error';

        // Derivar context legível
        let context = 'Sistema';
        let action = `${method} /${url.split('/api/')[1] || url}`;

        if (url.includes('relatorios-tecnicos')) {
          context = 'FS';
          if (url.includes('enviar-pdf')) action = 'Enviar PDF por Email';
          else if (url.includes('preview-pdf') || url.includes('pdf')) action = 'Gerar/Download PDF';
          else if (url.includes('criar-continuidade')) action = 'Criar Continuidade FS';
          else if (url.includes('cronometro')) action = 'Cronómetro';
          else if (url.includes('intervencoes')) action = 'Intervenções';
        } else if (url.includes('time-entries')) {
          context = 'Picagem de Ponto';
        } else if (url.includes('pedidos-cotacao')) {
          context = 'Pedido de Cotação';
        } else if (url.includes('equipamentos')) {
          context = 'Equipamentos';
        } else if (url.includes('vacations')) {
          context = 'Férias';
        } else if (url.includes('indisponibilidades')) {
          context = 'Indisponibilidades';
        } else if (url.includes('despesas-internas')) {
          context = 'Despesas Internas';
        } else if (url.includes('services')) {
          context = 'Serviços/Calendário';
        } else if (url.includes('clientes')) {
          context = 'Clientes';
        } else if (url.includes('users') || url.includes('admin')) {
          context = 'Admin';
        }

        await axios.post(`${API}/errors/log`, {
          context,
          action,
          error_message: String(detail).substring(0, 1500),
          severity,
          details: {
            status,
            method,
            url,
            response_data: typeof error.response?.data === 'object' ? error.response.data : undefined,
          },
        });
      } catch (_) { /* ignore logging failures */ }
    }
    return Promise.reject(error);
}

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
    
    // Check for pending redirect (e.g., from PC status page)
    const pendingRedirect = localStorage.getItem('redirect_after_login');
    if (pendingRedirect) {
      localStorage.removeItem('redirect_after_login');
      // Use timeout to ensure state is set before navigation
      setTimeout(() => {
        window.location.href = pendingRedirect;
      }, 100);
    }
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
    <ErrorBoundary>
    <ThemeProvider>
      <MobileProvider>
        <div className="App">
          <BrowserRouter>
            <Routes>
              <Route
                path="/login"
                element={
                  isAuthenticated ? (
                    <LoginRedirect />
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
              <Route
                path="/admin/errors"
                element={
                  isAuthenticated && user?.is_admin ? (
                    <MobileLayout user={user} onLogout={handleLogout}>
                      <ErrorLog user={user} onLogout={handleLogout} />
                    </MobileLayout>
                  ) : (
                    <Navigate to="/" replace />
                  )
                }
              />
              <Route
                path="/admin/despesas-internas"
                element={
                  isAuthenticated && user?.is_admin ? (
                    <MobileLayout user={user} onLogout={handleLogout}>
                      <DespesasInternas user={user} onLogout={handleLogout} />
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
              {/* Gestão de estado de PC via link direto (requer login admin) */}
              <Route
                path="/pc/:pcId/status"
                element={<PCStatusPage />}
              />
              {/* Página pública para cliente inserir referência interna */}
              <Route
                path="/reference/:token"
                element={<PublicReferencePage />}
              />
            </Routes>
          </BrowserRouter>
          <Toaster position="top-right" richColors />
        </div>
      </MobileProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;