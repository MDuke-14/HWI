import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Shield, Users, Calendar, TrendingUp, CheckCircle, XCircle } from 'lucide-react';

const AdminDashboard = ({ user, onLogout }) => {
  const [users, setUsers] = useState([]);
  const [pendingVacations, setPendingVacations] = useState([]);
  const [reports, setReports] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userEntries, setUserEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchPendingVacations();
    fetchReports();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API}/admin/users`);
      setUsers(response.data);
    } catch (error) {
      toast.error('Erro ao carregar utilizadores');
    }
  };

  const fetchPendingVacations = async () => {
    try {
      const response = await axios.get(`${API}/admin/vacations/pending`);
      setPendingVacations(response.data);
    } catch (error) {
      console.error('Erro ao carregar férias pendentes');
    }
  };

  const fetchReports = async () => {
    try {
      const response = await axios.get(`${API}/admin/reports/all?period=billing`);
      setReports(response.data);
    } catch (error) {
      console.error('Erro ao carregar relatórios');
    }
  };

  const fetchUserEntries = async (userId) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/admin/user/${userId}/time-entries`);
      setUserEntries(response.data);
      setSelectedUser(userId);
    } catch (error) {
      toast.error('Erro ao carregar registos');
    } finally {
      setLoading(false);
    }
  };

  const handleVacationApproval = async (requestId, approved) => {
    try {
      await axios.post(`${API}/admin/vacations/${requestId}/approve?approved=${approved}`);
      toast.success(approved ? 'Férias aprovadas!' : 'Férias rejeitadas');
      fetchPendingVacations();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao processar');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navigation user={user} onLogout={onLogout} activePage="admin" />
      <div className="container mx-auto px-4 py-8 max-w-7xl fade-in">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-gradient-to-br from-red-500 to-pink-600 p-3 rounded-xl"><Shield className="w-8 h-8 text-white" /></div>
          <h1 className="text-4xl font-bold text-white">Painel de Administração</h1>
        </div>

        <Tabs defaultValue="vacations" className="w-full">
          <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-3 bg-[#1a1a1a] mb-8">
            <TabsTrigger value="vacations" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400"><Calendar className="w-4 h-4 mr-2" />Férias Pendentes</TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400"><Users className="w-4 h-4 mr-2" />Utilizadores</TabsTrigger>
            <TabsTrigger value="reports" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400"><TrendingUp className="w-4 h-4 mr-2" />Relatórios</TabsTrigger>
          </TabsList>

          <TabsContent value="vacations">
            <div className="glass-effect p-6 rounded-xl">
              <h2 className="text-2xl font-semibold text-white mb-6">Pedidos Pendentes ({pendingVacations.length})</h2>
              {pendingVacations.length > 0 ? (
                <div className="space-y-4">
                  {pendingVacations.map((req) => (
                    <div key={req.id} className="bg-[#1a1a1a] p-5 rounded-lg">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="text-white font-semibold text-lg">{req.username}</div>
                          <div className="text-gray-400 text-sm">{new Date(req.start_date + 'T00:00:00').toLocaleDateString('pt-PT')} até {new Date(req.end_date + 'T00:00:00').toLocaleDateString('pt-PT')}</div>
                          <div className="text-amber-400 font-semibold mt-1">{req.days_requested} dias</div>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={() => handleVacationApproval(req.id, true)} className="bg-green-600 hover:bg-green-700 text-white rounded-full"><CheckCircle className="w-4 h-4 mr-1" />Aprovar</Button>
                          <Button onClick={() => handleVacationApproval(req.id, false)} className="bg-red-600 hover:bg-red-700 text-white rounded-full"><XCircle className="w-4 h-4 mr-1" />Rejeitar</Button>
                        </div>
                      </div>
                      {req.reason && <div className="text-gray-300 text-sm mt-2 pt-2 border-t border-gray-700">Motivo: {req.reason}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-12">Não há pedidos pendentes</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="users">
            <div className="glass-effect p-6 rounded-xl">
              <h2 className="text-2xl font-semibold text-white mb-6">Utilizadores ({users.length})</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {users.map((u) => (
                  <div key={u.id} className="bg-[#1a1a1a] p-4 rounded-lg hover:bg-[#252525] transition-colors cursor-pointer" onClick={() => fetchUserEntries(u.id)}>
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${u.is_admin ? 'bg-gradient-to-br from-red-500 to-pink-600' : 'bg-gradient-to-br from-blue-500 to-purple-600'}`}>
                        <span className="text-white font-bold text-lg">{u.username.charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <div className="text-white font-semibold">{u.username}{u.is_admin && <span className="ml-2 text-xs bg-red-600 px-2 py-1 rounded">ADMIN</span>}</div>
                        <div className="text-gray-400 text-sm">{u.email}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {selectedUser && userEntries.length > 0 && (
              <div className="glass-effect p-6 rounded-xl mt-6">
                <h3 className="text-xl font-semibold text-white mb-4">Registos do Utilizador ({userEntries.length})</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {userEntries.map((entry) => (
                    <div key={entry.id} className="bg-[#1a1a1a] p-4 rounded-lg text-sm">
                      <div className="flex justify-between text-white">
                        <span>{entry.date}</span>
                        <span className="font-bold text-green-400">{entry.total_hours}h</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="reports">
            {reports && (
              <div className="glass-effect p-6 rounded-xl">
                <h2 className="text-2xl font-semibold text-white mb-6">Relatório Consolidado</h2>
                <div className="text-gray-400 mb-6">Período: {new Date(reports.start_date + 'T00:00:00').toLocaleDateString('pt-PT')} até {new Date(reports.end_date + 'T00:00:00').toLocaleDateString('pt-PT')}</div>
                <div className="space-y-4">
                  {reports.users.map((u, idx) => (
                    <div key={idx} className="bg-[#1a1a1a] p-5 rounded-lg">
                      <div className="flex justify-between items-center mb-3">
                        <div className="text-white font-semibold text-lg">{u.username}</div>
                        <div className="text-green-400 font-bold text-2xl">{u.total_hours.toFixed(2)}h</div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div><div className="text-gray-400">Horas Normais</div><div className="text-blue-400 font-semibold">{u.regular_hours.toFixed(2)}h</div></div>
                        <div><div className="text-gray-400">Horas Extras</div><div className="text-amber-400 font-semibold">{u.overtime_hours.toFixed(2)}h</div></div>
                        <div><div className="text-gray-400">Dias Trabalhados</div><div className="text-white font-semibold">{u.days_worked}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;