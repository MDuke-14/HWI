import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Shield, Users, Calendar, TrendingUp, CheckCircle, XCircle, Plus, Edit, Trash2, Download, Clock, Minus, FileText, History } from 'lucide-react';

const AdminDashboard = ({ user, onLogout }) => {
  const [users, setUsers] = useState([]);
  const [pendingVacations, setPendingVacations] = useState([]);
  const [allAbsences, setAllAbsences] = useState([]);
  const [reports, setReports] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userEntries, setUserEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [createForm, setCreateForm] = useState({
    username: '',
    email: '',
    phone: '',
    full_name: '',
    password: '',
    company_start_date: '',
    vacation_days_taken: 0
  });
  const [editForm, setEditForm] = useState({
    username: '',
    email: '',
    phone: '',
    full_name: '',
    password: '',
    is_admin: false
  });
  const [showManualEntryDialog, setShowManualEntryDialog] = useState(false);
  const [manualEntryForm, setManualEntryForm] = useState({
    user_id: '',
    date: '',
    time_entries: [{ start_time: '', end_time: '' }],
    observations: '',
    outside_residence_zone: false,
    location_description: ''
  });
  
  // States for viewing user reports/history
  const [viewingUserReports, setViewingUserReports] = useState(null);
  const [viewingUserHistory, setViewingUserHistory] = useState(null);

  useEffect(() => {
    fetchUsers();
    fetchPendingVacations();
    fetchAllAbsences();
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

  const fetchAllAbsences = async () => {
    try {
      const response = await axios.get(`${API}/admin/absences/all`);
      setAllAbsences(response.data);
    } catch (error) {
      console.error('Erro ao carregar faltas');
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

  const handleAbsenceReview = async (absenceId, approved) => {
    try {
      await axios.post(`${API}/admin/absences/${absenceId}/review?approved=${approved}`);
      toast.success(approved ? 'Falta aprovada!' : 'Falta rejeitada');
      fetchAllAbsences();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao processar');
    }
  };

  const handleCreateUser = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/admin/users/create`, createForm);
      toast.success('Utilizador criado com sucesso!');
      setShowCreateDialog(false);
      setCreateForm({ username: '', email: '', phone: '', full_name: '', password: '', company_start_date: '', vacation_days_taken: 0 });
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao criar utilizador');
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setEditForm({
      username: user.username,
      email: user.email,
      phone: user.phone || '',
      full_name: user.full_name || '',
      password: '',
      is_admin: user.is_admin || false
    });
    setShowEditDialog(true);
  };

  const handleUpdateUser = async () => {
    setLoading(true);
    try {
      const updateData = { ...editForm };
      if (!updateData.password) delete updateData.password;
      
      await axios.put(`${API}/admin/users/${editingUser.id}`, updateData);
      toast.success('Utilizador atualizado!');
      setShowEditDialog(false);
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao atualizar');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Tem certeza que deseja eliminar o utilizador ${username}? Todos os seus dados serão perdidos!`)) return;
    
    try {
      await axios.delete(`${API}/admin/users/${userId}`);
      toast.success('Utilizador eliminado!');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao eliminar');
    }
  };

  const handleCreateManualEntry = async () => {
    setLoading(true);
    try {
      if (!manualEntryForm.user_id || !manualEntryForm.date || manualEntryForm.time_entries.length === 0) {
        toast.error('Preencha todos os campos obrigatórios');
        setLoading(false);
        return;
      }
      
      // Validate all time entries
      for (let i = 0; i < manualEntryForm.time_entries.length; i++) {
        const entry = manualEntryForm.time_entries[i];
        if (!entry.start_time || !entry.end_time) {
          toast.error(`Entrada ${i+1}: preencha início e fim`);
          setLoading(false);
          return;
        }
      }
      
      await axios.post(`${API}/admin/time-entries/manual`, manualEntryForm);
      toast.success('Entrada(s) adicionada(s) com sucesso!');
      setShowManualEntryDialog(false);
      setManualEntryForm({
        user_id: '',
        date: '',
        time_entries: [{ start_time: '', end_time: '' }],
        observations: '',
        outside_residence_zone: false,
        location_description: ''
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao adicionar entrada');
    } finally {
      setLoading(false);
    }
  };

  const addTimeEntry = () => {
    setManualEntryForm({
      ...manualEntryForm,
      time_entries: [...manualEntryForm.time_entries, { start_time: '', end_time: '' }]
    });
  };

  const removeTimeEntry = (index) => {
    if (manualEntryForm.time_entries.length > 1) {
      const newEntries = manualEntryForm.time_entries.filter((_, i) => i !== index);
      setManualEntryForm({
        ...manualEntryForm,
        time_entries: newEntries
      });
    }
  };

  const updateTimeEntry = (index, field, value) => {
    const newEntries = [...manualEntryForm.time_entries];
    newEntries[index][field] = value;
    setManualEntryForm({
      ...manualEntryForm,
      time_entries: newEntries
    });
  };

  const handleDeleteDayEntries = async () => {
    if (!manualEntryForm.user_id || !manualEntryForm.date) {
      toast.error('Selecione utilizador e data primeiro');
      return;
    }
    
    if (!window.confirm('Tem certeza que deseja eliminar TODAS as entradas deste dia?')) {
      return;
    }
    
    setLoading(true);
    try {
      const response = await axios.delete(`${API}/admin/time-entries/date/${manualEntryForm.user_id}/${manualEntryForm.date}`);
      toast.success(response.data.message || 'Entradas eliminadas com sucesso!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao eliminar entradas');
    } finally {
      setLoading(false);
    }
  };

  // handleImportExcel function removed

  const downloadJustificationFile = async (filename) => {
    try {
      const response = await axios.get(`${API}/absences/file/${filename}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Ficheiro descarregado com sucesso!');
    } catch (error) {
      toast.error('Erro ao descarregar ficheiro');
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
          <TabsList className="grid w-full max-w-3xl mx-auto grid-cols-4 bg-[#1a1a1a] mb-8">
            <TabsTrigger value="vacations" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400"><Calendar className="w-4 h-4 mr-2" />Férias</TabsTrigger>
            <TabsTrigger value="absences" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400"><Users className="w-4 h-4 mr-2" />Faltas</TabsTrigger>
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

          <TabsContent value="absences">
            <div className="glass-effect p-6 rounded-xl">
              <h2 className="text-2xl font-semibold text-white mb-6">Todas as Faltas ({allAbsences.length})</h2>
              {allAbsences.length > 0 ? (
                <div className="space-y-4">
                  {allAbsences.map((absence) => (
                    <div key={absence.id} className="bg-[#1a1a1a] p-5 rounded-lg">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <div className="text-white font-semibold text-lg">{absence.username}</div>
                          <div className="text-gray-400 text-sm">{new Date(absence.date + 'T00:00:00').toLocaleDateString('pt-PT')}</div>
                          <div className="text-amber-400 font-semibold mt-1">{absence.hours}h - {absence.is_justified ? 'Justificada' : 'Injustificada'}</div>
                          {absence.reason && <div className="text-gray-300 text-sm mt-1">Motivo: {absence.reason}</div>}
                          {absence.justification_file && (
                            <div className="mt-2">
                              <Button 
                                onClick={() => downloadJustificationFile(absence.justification_file)}
                                className="bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs"
                                size="sm"
                              >
                                <Download className="w-3 h-3 mr-1" />
                                Ver Justificação
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            absence.status === 'approved' ? 'bg-green-700 text-green-200' :
                            absence.status === 'rejected' ? 'bg-red-700 text-red-200' :
                            'bg-amber-700 text-amber-200'
                          }`}>
                            {absence.status === 'approved' ? 'Aprovado' : absence.status === 'rejected' ? 'Rejeitado' : 'Pendente'}
                          </span>
                          {absence.status === 'pending' && (
                            <div className="flex gap-2">
                              <Button onClick={() => handleAbsenceReview(absence.id, true)} className="bg-green-600 hover:bg-green-700 text-white rounded-full text-xs" size="sm">
                                <CheckCircle className="w-3 h-3 mr-1" />Aprovar
                              </Button>
                              <Button onClick={() => handleAbsenceReview(absence.id, false)} className="bg-red-600 hover:bg-red-700 text-white rounded-full text-xs" size="sm">
                                <XCircle className="w-3 h-3 mr-1" />Rejeitar
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                      {absence.reviewed_by && <div className="text-gray-500 text-xs mt-2 pt-2 border-t border-gray-700">Revisto por: {absence.reviewed_by}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-12">Não há faltas registadas</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="users">
            <div className="glass-effect p-6 rounded-xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-white">Utilizadores ({users.length})</h2>
                <div className="flex gap-3">
                  <Dialog open={showManualEntryDialog} onOpenChange={setShowManualEntryDialog}>
                    <DialogTrigger asChild>
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full">
                        <Clock className="w-4 h-4 mr-2" />Adicionar Entrada
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
                      <DialogHeader><DialogTitle>Adicionar Entrada Manual</DialogTitle></DialogHeader>
                      <div className="space-y-3 mt-4">
                        <div>
                          <Label>Utilizador</Label>
                          <select
                            value={manualEntryForm.user_id}
                            onChange={(e) => setManualEntryForm({...manualEntryForm, user_id: e.target.value})}
                            className="w-full bg-[#0a0a0a] border border-gray-700 text-white rounded-md px-3 py-2"
                          >
                            <option value="">Selecione um utilizador</option>
                            {users.map(u => (
                              <option key={u.id} value={u.id}>{u.username} - {u.full_name || u.email}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label>Data</Label>
                          <Input
                            type="date"
                            value={manualEntryForm.date}
                            onChange={(e) => setManualEntryForm({...manualEntryForm, date: e.target.value})}
                            className="bg-[#0a0a0a] border-gray-700 text-white"
                          />
                        </div>
                        
                        {/* Multiple Time Entries */}
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <Label>Horários de Trabalho</Label>
                            <Button
                              type="button"
                              onClick={addTimeEntry}
                              className="bg-green-600 hover:bg-green-700 text-white rounded-full text-xs"
                              size="sm"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Adicionar Período
                            </Button>
                          </div>
                          
                          {manualEntryForm.time_entries.map((entry, index) => (
                            <div key={index} className="bg-[#0a0a0a] p-3 rounded-lg space-y-2">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-xs text-gray-400">Período {index + 1}</span>
                                {manualEntryForm.time_entries.length > 1 && (
                                  <Button
                                    type="button"
                                    onClick={() => removeTimeEntry(index)}
                                    className="bg-red-600 hover:bg-red-700 text-white rounded-full text-xs"
                                    size="sm"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs">Início</Label>
                                  <Input
                                    type="time"
                                    value={entry.start_time}
                                    onChange={(e) => updateTimeEntry(index, 'start_time', e.target.value)}
                                    className="bg-[#0a0a0a] border-gray-700 text-white"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Fim</Label>
                                  <Input
                                    type="time"
                                    value={entry.end_time}
                                    onChange={(e) => updateTimeEntry(index, 'end_time', e.target.value)}
                                    className="bg-[#0a0a0a] border-gray-700 text-white"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div>
                          <Label>Observações (opcional)</Label>
                          <Input
                            value={manualEntryForm.observations}
                            onChange={(e) => setManualEntryForm({...manualEntryForm, observations: e.target.value})}
                            className="bg-[#0a0a0a] border-gray-700 text-white"
                            placeholder="Entrada manual pelo admin"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={manualEntryForm.outside_residence_zone}
                            onCheckedChange={(checked) => setManualEntryForm({...manualEntryForm, outside_residence_zone: checked})}
                          />
                          <Label>Fora de Zona de Residência</Label>
                        </div>
                        {manualEntryForm.outside_residence_zone && (
                          <div>
                            <Label>Localização</Label>
                            <Input
                              value={manualEntryForm.location_description}
                              onChange={(e) => setManualEntryForm({...manualEntryForm, location_description: e.target.value})}
                              className="bg-[#0a0a0a] border-gray-700 text-white"
                              placeholder="Ex: Madrid, Espanha"
                            />
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button 
                            onClick={handleDeleteDayEntries} 
                            disabled={loading || !manualEntryForm.user_id || !manualEntryForm.date} 
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-full"
                          >
                            🗑️ Limpar Dia
                          </Button>
                          <Button 
                            onClick={handleCreateManualEntry} 
                            disabled={loading} 
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-full"
                          >
                            {loading ? 'A adicionar...' : 'Adicionar Entrada'}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  
                  <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                    <DialogTrigger asChild>
                      <Button className="bg-green-600 hover:bg-green-700 text-white rounded-full">
                        <Plus className="w-4 h-4 mr-2" />Criar Utilizador
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
                    <DialogHeader><DialogTitle>Criar Novo Utilizador</DialogTitle></DialogHeader>
                    <div className="space-y-3 mt-4">
                      <div>
                        <Label>Username</Label>
                        <Input value={createForm.username} onChange={(e) => setCreateForm({...createForm, username: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                      </div>
                      <div>
                        <Label>Email</Label>
                        <Input type="email" value={createForm.email} onChange={(e) => setCreateForm({...createForm, email: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                      </div>
                      <div>
                        <Label>Contacto Telefónico</Label>
                        <Input type="tel" placeholder="+351 912 345 678" value={createForm.phone} onChange={(e) => setCreateForm({...createForm, phone: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                      </div>
                      <div>
                        <Label>Nome Completo</Label>
                        <Input value={createForm.full_name} onChange={(e) => setCreateForm({...createForm, full_name: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                      </div>
                      <div>
                        <Label>Password</Label>
                        <Input type="password" value={createForm.password} onChange={(e) => setCreateForm({...createForm, password: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                      </div>
                      <Button onClick={handleCreateUser} disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white rounded-full">
                        {loading ? 'A criar...' : 'Criar Utilizador'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                {users.map((u) => (
                  <div key={u.id} className="bg-[#1a1a1a] p-4 rounded-lg">
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${u.is_admin ? 'bg-gradient-to-br from-red-500 to-pink-600' : 'bg-gradient-to-br from-blue-500 to-purple-600'}`}>
                        <span className="text-white font-bold text-lg">{u.username.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-semibold">{u.username}{u.is_admin && <span className="ml-2 text-xs bg-red-600 px-2 py-1 rounded">ADMIN</span>}</div>
                        <div className="text-gray-400 text-sm">{u.email}</div>
                        {u.phone && <div className="text-gray-500 text-xs">📞 {u.phone}</div>}
                        {u.full_name && <div className="text-gray-500 text-xs">{u.full_name}</div>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => handleEditUser(u)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-sm" size="sm">
                        <Edit className="w-3 h-3 mr-1" />Editar
                      </Button>
                      <Button onClick={() => handleDeleteUser(u.id, u.username)} className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-full text-sm" size="sm">
                        <Trash2 className="w-3 h-3 mr-1" />Eliminar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Edit User Dialog */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
              <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
                <DialogHeader><DialogTitle>Editar Utilizador</DialogTitle></DialogHeader>
                {editingUser && (
                  <div className="space-y-3 mt-4">
                    <div>
                      <Label>Username</Label>
                      <Input value={editForm.username} onChange={(e) => setEditForm({...editForm, username: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input type="email" value={editForm.email} onChange={(e) => setEditForm({...editForm, email: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                    </div>
                    <div>
                      <Label>Contacto Telefónico</Label>
                      <Input type="tel" placeholder="+351 912 345 678" value={editForm.phone} onChange={(e) => setEditForm({...editForm, phone: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                    </div>
                    <div>
                      <Label>Nome Completo</Label>
                      <Input value={editForm.full_name} onChange={(e) => setEditForm({...editForm, full_name: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" />
                    </div>
                    <div>
                      <Label>Nova Password (deixar vazio para não alterar)</Label>
                      <Input type="password" value={editForm.password} onChange={(e) => setEditForm({...editForm, password: e.target.value})} className="bg-[#0a0a0a] border-gray-700 text-white" placeholder="Deixar vazio para não alterar" />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-[#0a0a0a] rounded-lg">
                      <Label className="cursor-pointer">Privilégios de Admin</Label>
                      <Switch checked={editForm.is_admin} onCheckedChange={(checked) => setEditForm({...editForm, is_admin: checked})} />
                    </div>
                    <Button onClick={handleUpdateUser} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-full">
                      {loading ? 'A atualizar...' : 'Atualizar Utilizador'}
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
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