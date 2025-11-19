import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from './Navigation';
import { toast } from 'sonner';
import {
  Building2,
  Plus,
  Search,
  Mail,
  Phone,
  MapPin,
  Edit,
  Trash2,
  User,
  FileText,
  X,
  Clock,
  Settings,
  Car,
  Users,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const TechnicalReports = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('clientes');
  const [clientes, setClientes] = useState([]);
  const [relatorios, setRelatorios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Clientes modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [clienteToDelete, setClienteToDelete] = useState(null);
  const [clienteRelatorios, setClienteRelatorios] = useState([]);
  const [showClienteRelatoriosModal, setShowClienteRelatoriosModal] = useState(false);
  const [showClienteEquipamentosModal, setShowClienteEquipamentosModal] = useState(false);
  const [clienteEquipamentos, setClienteEquipamentos] = useState([]);
  const [showEquipamentoOTsModal, setShowEquipamentoOTsModal] = useState(false);
  const [equipamentoOTs, setEquipamentoOTs] = useState([]);
  const [selectedEquipamento, setSelectedEquipamento] = useState(null);
  
  // Relatórios modals
  const [showAddRelatorioModal, setShowAddRelatorioModal] = useState(false);
  const [showViewRelatorioModal, setShowViewRelatorioModal] = useState(false);
  const [showEditRelatorioModal, setShowEditRelatorioModal] = useState(false);
  const [showDeleteRelatorioModal, setShowDeleteRelatorioModal] = useState(false);
  const [selectedRelatorio, setSelectedRelatorio] = useState(null);
  const [relatorioToDelete, setRelatorioToDelete] = useState(null);
  const [tecnicos, setTecnicos] = useState([]);
  const [showAddTecnicoModal, setShowAddTecnicoModal] = useState(false);
  const [showEditTecnicoModal, setShowEditTecnicoModal] = useState(false);
  const [selectedTecnico, setSelectedTecnico] = useState(null);
  const [tecnicoFormData, setTecnicoFormData] = useState({
    tecnico_nome: '',
    horas_cliente: 0,
    kms_deslocacao: 0,
    tipo_horario: 'diurno'
  });
  
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    morada: '',
    nif: '',
    emails_adicionais: ''
  });
  
  const [relatorioFormData, setRelatorioFormData] = useState({
    cliente_id: '',
    data_servico: new Date().toISOString().split('T')[0],
    local_intervencao: '',
    pedido_por: '',
    equipamento_tipologia: '',
    equipamento_marca: '',
    equipamento_modelo: '',
    equipamento_numero_serie: '',
    descricao_problema: ''
  });

  // Equipamentos
  const [equipamentos, setEquipamentos] = useState([]);
  const [equipamentoSelecionado, setEquipamentoSelecionado] = useState('');
  const [modoNovoEquipamento, setModoNovoEquipamento] = useState(false);

  useEffect(() => {
    if (activeTab === 'clientes') {
      fetchClientes();
    } else if (activeTab === 'relatorios') {
      fetchRelatorios();
    }
  }, [activeTab]);
  
  // Buscar clientes quando abre modal de criar relatório
  useEffect(() => {
    if (showAddRelatorioModal && clientes.length === 0) {
      fetchClientes();
    }
  }, [showAddRelatorioModal]);

  const fetchClientes = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/clientes`);
      setClientes(response.data);
    } catch (error) {
      toast.error('Erro ao carregar clientes');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatorios = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/relatorios-tecnicos`);
      setRelatorios(response.data);
    } catch (error) {
      toast.error('Erro ao carregar OTs');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEquipamentos = async (clienteId) => {
    try {
      const response = await axios.get(`${API}/equipamentos?cliente_id=${clienteId}`);
      setEquipamentos(response.data);
    } catch (error) {
      console.error('Erro ao carregar equipamentos:', error);
      setEquipamentos([]);
    }
  };

  const handleEquipamentoChange = (equipamentoId) => {
    setEquipamentoSelecionado(equipamentoId);
    
    if (equipamentoId === 'novo') {
      setModoNovoEquipamento(true);
      // Limpar campos de equipamento
      setRelatorioFormData({
        ...relatorioFormData,
        equipamento_tipologia: '',
        equipamento_marca: '',
        equipamento_modelo: '',
        equipamento_numero_serie: ''
      });
    } else if (equipamentoId) {
      setModoNovoEquipamento(false);
      const equipamento = equipamentos.find(e => e.id === equipamentoId);
      if (equipamento) {
        setRelatorioFormData({
          ...relatorioFormData,
          equipamento_tipologia: equipamento.tipologia,
          equipamento_marca: equipamento.marca,
          equipamento_modelo: equipamento.modelo,
          equipamento_numero_serie: equipamento.numero_serie || ''
        });
      }
    }
  };

  const handleAddCliente = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/clientes`, formData);
      toast.success('Cliente adicionado com sucesso!');
      setShowAddModal(false);
      resetForm();
      fetchClientes();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao adicionar cliente');
    }
  };

  const handleEditCliente = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API}/clientes/${selectedCliente.id}`, formData);
      toast.success('Cliente atualizado com sucesso!');
      setShowEditModal(false);
      resetForm();
      fetchClientes();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao atualizar cliente');
    }
  };

  const handleDeleteCliente = async () => {
    if (!clienteToDelete) return;

    try {
      await axios.delete(`${API}/clientes/${clienteToDelete.id}`);
      toast.success('Cliente eliminado com sucesso!');
      setShowDeleteModal(false);
      setClienteToDelete(null);
      fetchClientes();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao eliminar cliente');
    }
  };

  const openViewModal = (cliente) => {
    setSelectedCliente(cliente);
    setShowViewModal(true);
  };

  const openEditModal = (cliente) => {
    setSelectedCliente(cliente);
    setFormData({
      nome: cliente.nome,
      email: cliente.email || '',
      telefone: cliente.telefone || '',
      morada: cliente.morada || '',
      nif: cliente.nif || '',
      emails_adicionais: cliente.emails_adicionais || ''
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (cliente) => {
    setClienteToDelete(cliente);
    setShowDeleteModal(true);
  };

  const handleAddRelatorioFromCliente = (cliente) => {
    // Fechar modal de visualização do cliente
    setShowViewModal(false);
    
    // Pré-selecionar o cliente no formulário de relatório
    setRelatorioFormData({
      ...relatorioFormData,
      cliente_id: cliente.id
    });
    
    // Carregar equipamentos do cliente
    fetchEquipamentos(cliente.id);
    
    // Abrir modal de criação de relatório
    setShowAddRelatorioModal(true);
  };

  const fetchClienteRelatorios = async (clienteId) => {
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos`);
      const relatoriosDoCliente = response.data.filter(r => r.cliente_id === clienteId);
      setClienteRelatorios(relatoriosDoCliente);
      setShowClienteRelatoriosModal(true);
    } catch (error) {
      toast.error('Erro ao carregar relatórios do cliente');
    }
  };

  const fetchClienteEquipamentosDetalhado = async (clienteId) => {
    try {
      const response = await axios.get(`${API}/equipamentos?cliente_id=${clienteId}`);
      setClienteEquipamentos(response.data);
      setShowClienteEquipamentosModal(true);
    } catch (error) {
      toast.error('Erro ao carregar equipamentos do cliente');
    }
  };

  const fetchEquipamentoOTs = async (equipamento) => {
    try {
      // Buscar todas as OTs
      const response = await axios.get(`${API}/relatorios-tecnicos`);
      
      // Filtrar OTs que usam este equipamento (comparar marca, modelo e número de série)
      const otsDoEquipamento = response.data.filter(r => {
        const marcaMatch = r.equipamento_marca === equipamento.marca;
        const modeloMatch = r.equipamento_modelo === equipamento.modelo;
        const serieMatch = (!equipamento.numero_serie && !r.equipamento_numero_serie) || 
                          (r.equipamento_numero_serie === equipamento.numero_serie);
        
        return marcaMatch && modeloMatch && serieMatch && r.cliente_id === equipamento.cliente_id;
      });
      
      setEquipamentoOTs(otsDoEquipamento);
      setSelectedEquipamento(equipamento);
      setShowEquipamentoOTsModal(true);
    } catch (error) {
      toast.error('Erro ao carregar OTs do equipamento');
    }
  };

  const handleDownloadAllClienteRelatorios = async (cliente) => {
    try {
      // Por enquanto, apenas mostra os relatórios
      // TODO: Implementar geração de PDF para relatórios técnicos
      toast.info('Funcionalidade de download em desenvolvimento');
      
      // Abrir modal de visualização dos relatórios
      fetchClienteRelatorios(cliente.id);
    } catch (error) {
      toast.error('Erro ao processar relatórios');
    }
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      email: '',
      telefone: '',
      morada: '',
      nif: '',
      emails_adicionais: ''
    });
    setSelectedCliente(null);
  };
  
  const resetRelatorioForm = () => {
    setRelatorioFormData({
      cliente_id: '',
      data_servico: new Date().toISOString().split('T')[0],
      local_intervencao: '',
      pedido_por: '',
      equipamento_tipologia: '',
      equipamento_marca: '',
      equipamento_modelo: '',
      equipamento_numero_serie: '',
      descricao_problema: ''
    });
    setEquipamentos([]);
    setEquipamentoSelecionado('');
    setModoNovoEquipamento(false);
  };

  const handleAddRelatorio = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/relatorios-tecnicos`, relatorioFormData);
      toast.success('OT criada com sucesso!');
      setShowAddRelatorioModal(false);
      resetRelatorioForm();
      fetchRelatorios();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao criar OT');
    }
  };

  const openViewRelatorioModal = async (relatorio) => {
    setSelectedRelatorio(relatorio);
    setShowViewRelatorioModal(true);
    // Buscar técnicos do relatório
    await fetchTecnicosRelatorio(relatorio.id);
  };

  const openEditRelatorioModal = async (relatorio, e) => {
    if (e) e.stopPropagation(); // Prevenir abertura do modal de visualização
    
    // Buscar clientes se ainda não foram carregados
    if (clientes.length === 0) {
      await fetchClientes();
    }
    
    setSelectedRelatorio(relatorio);
    setRelatorioFormData({
      cliente_id: relatorio.cliente_id,
      data_servico: relatorio.data_servico.split('T')[0], // Formato YYYY-MM-DD
      local_intervencao: relatorio.local_intervencao,
      pedido_por: relatorio.pedido_por,
      equipamento_tipologia: relatorio.equipamento_tipologia,
      equipamento_marca: relatorio.equipamento_marca,
      equipamento_modelo: relatorio.equipamento_modelo,
      equipamento_numero_serie: relatorio.equipamento_numero_serie || '',
      motivo_assistencia: relatorio.motivo_assistencia
    });
    setShowEditRelatorioModal(true);
  };

  const openDeleteRelatorioModal = (relatorio, e) => {
    if (e) e.stopPropagation(); // Prevenir abertura do modal de visualização
    setRelatorioToDelete(relatorio);
    setShowDeleteRelatorioModal(true);
  };

  const handleEditRelatorio = async (e) => {
    e.preventDefault();
    if (!selectedRelatorio) return;

    try {
      await axios.put(`${API}/relatorios-tecnicos/${selectedRelatorio.id}`, relatorioFormData);
      toast.success('OT atualizada com sucesso!');
      setShowEditRelatorioModal(false);
      setSelectedRelatorio(null);
      fetchRelatorios();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao atualizar OT');
    }
  };

  const handleDeleteRelatorio = async () => {
    if (!relatorioToDelete) return;

    try {
      await axios.delete(`${API}/relatorios-tecnicos/${relatorioToDelete.id}`);
      toast.success('OT eliminada com sucesso!');
      setShowDeleteRelatorioModal(false);
      setRelatorioToDelete(null);
      fetchRelatorios();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao eliminar OT');
    }
  };
  
  const fetchTecnicosRelatorio = async (relatorioId) => {
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos/${relatorioId}/tecnicos`);
      setTecnicos(response.data);
    } catch (error) {
      console.error('Erro ao carregar técnicos:', error);
      toast.error('Erro ao carregar técnicos');
    }
  };

  const handleAddTecnico = async (e) => {
    e.preventDefault();
    if (!selectedRelatorio) return;

    try {
      await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/tecnicos`, tecnicoFormData);
      toast.success('Técnico adicionado com sucesso!');
      setShowAddTecnicoModal(false);
      resetTecnicoForm();
      await fetchTecnicosRelatorio(selectedRelatorio.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao adicionar técnico');
    }
  };

  const openEditTecnicoModal = (tecnico) => {
    setSelectedTecnico(tecnico);
    setTecnicoFormData({
      tecnico_nome: tecnico.tecnico_nome,
      horas_cliente: tecnico.horas_cliente,
      kms_deslocacao: tecnico.kms_deslocacao,
      tipo_horario: tecnico.tipo_horario
    });
    setShowEditTecnicoModal(true);
  };

  const handleEditTecnico = async (e) => {
    e.preventDefault();
    if (!selectedRelatorio || !selectedTecnico) return;

    try {
      await axios.put(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/tecnicos/${selectedTecnico.id}`,
        tecnicoFormData
      );
      toast.success('Técnico atualizado com sucesso!');
      setShowEditTecnicoModal(false);
      setSelectedTecnico(null);
      resetTecnicoForm();
      await fetchTecnicosRelatorio(selectedRelatorio.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao atualizar técnico');
    }
  };

  const resetTecnicoForm = () => {
    setTecnicoFormData({
      tecnico_nome: '',
      horas_cliente: 0,
      kms_deslocacao: 0,
      tipo_horario: 'diurno'
    });
  };

  const getTipoHorarioLabel = (tipo) => {
    const labels = {
      'diurno': 'Diurno (07h-19h)',
      'noturno': 'Noturno (19h-07h)',
      'sabado': 'Sábado',
      'domingo_feriado': 'Domingo/Feriado'
    };
    return labels[tipo] || tipo;
  };

  const getTipoHorarioCodigo = (tipo) => {
    const codigos = {
      'diurno': '1',
      'noturno': '2',
      'sabado': 'S',
      'domingo_feriado': 'D'
    };
    return codigos[tipo] || '-';
  };

  const getStatusColor = (status) => {
    const colors = {
      'rascunho': 'text-gray-400 bg-gray-500/10',
      'em_andamento': 'text-blue-400 bg-blue-500/10',
      'concluido': 'text-green-400 bg-green-500/10',
      'enviado': 'text-purple-400 bg-purple-500/10'
    };
    return colors[status] || 'text-gray-400 bg-gray-500/10';
  };

  const getStatusLabel = (status) => {
    const labels = {
      'rascunho': 'Rascunho',
      'em_andamento': 'Em Andamento',
      'concluido': 'Concluído',
      'enviado': 'Enviado'
    };
    return labels[status] || status;
  };

  const filteredClientes = clientes.filter(cliente =>
    cliente.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (cliente.email && cliente.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (cliente.nif && cliente.nif.includes(searchTerm))
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navigation user={user} onLogout={onLogout} />
      
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-3 rounded-xl">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">OTs - Ordens de Trabalho</h1>
              <p className="text-gray-400">Gestão de Assistências Técnicas</p>
            </div>
          </div>
        </div>

        {/* Tabs/Sections */}
        <div className="mb-6">
          <div className="flex gap-4 border-b border-gray-700">
            <button
              onClick={() => setActiveTab('clientes')}
              className={`px-4 py-3 font-semibold transition ${
                activeTab === 'clientes'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Building2 className="w-4 h-4 inline mr-2" />
              Clientes
            </button>
            <button
              onClick={() => setActiveTab('relatorios')}
              className={`px-4 py-3 font-semibold transition ${
                activeTab === 'relatorios'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-2" />
              Ordens de Trabalho
            </button>
          </div>
        </div>

        {/* Clientes Section */}
        {activeTab === 'clientes' && (
        <div className="glass-effect p-6 rounded-xl">
          {/* Search and Add */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                type="text"
                placeholder="Buscar cliente por nome, email ou NIF..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-[#1a1a1a] border-gray-700 text-white"
              />
            </div>
            <Button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              <Plus className="w-5 h-5 mr-2" />
              Adicionar Cliente
            </Button>
          </div>

          {/* Clientes List */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
              <p className="text-gray-400 mt-4">A carregar clientes...</p>
            </div>
          ) : filteredClientes.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg">
                {searchTerm ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
              </p>
              {!searchTerm && (
                <Button
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 bg-blue-500 hover:bg-blue-600"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Adicionar Primeiro Cliente
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredClientes.map((cliente) => (
                <div
                  key={cliente.id}
                  className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-4 hover:border-blue-500 transition"
                >
                  {/* Cliente Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-500/10 p-2 rounded-lg">
                        <Building2 className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <h3 className="text-white font-semibold">{cliente.nome}</h3>
                        {cliente.nif && (
                          <p className="text-xs text-gray-400">NIF: {cliente.nif}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Cliente Info */}
                  <div className="space-y-2 mb-4">
                    {cliente.email && (
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <Mail className="w-4 h-4 text-gray-400" />
                        <span className="truncate">{cliente.email}</span>
                      </div>
                    )}
                    {cliente.telefone && (
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <span>{cliente.telefone}</span>
                      </div>
                    )}
                    {cliente.morada && (
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="truncate">{cliente.morada}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-3 border-t border-gray-700">
                    <Button
                      onClick={() => openViewModal(cliente)}
                      variant="outline"
                      size="sm"
                      className="flex-1 border-gray-600 hover:border-blue-500 hover:bg-blue-500/10"
                    >
                      <User className="w-4 h-4 mr-1" />
                      Ver
                    </Button>
                    
                    <Button
                      onClick={() => openEditModal(cliente)}
                      variant="outline"
                      size="sm"
                      className="border-gray-600 hover:border-blue-500 hover:bg-blue-500/10"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    
                    {user?.is_admin && (
                      <Button
                        onClick={() => openDeleteModal(cliente)}
                        variant="outline"
                        size="sm"
                        className="border-gray-600 hover:border-red-500 hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Relatórios Section */}
        {activeTab === 'relatorios' && (
        <div className="glass-effect p-6 rounded-xl">
          {/* Search and Add */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                type="text"
                placeholder="Buscar relatório por número, cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-[#1a1a1a] border-gray-700 text-white"
              />
            </div>
            <Button
              onClick={() => setShowAddRelatorioModal(true)}
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              <Plus className="w-5 h-5 mr-2" />
              Nova OT
            </Button>
          </div>

          {/* Relatórios List */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
              <p className="text-gray-400 mt-4">A carregar relatórios...</p>
            </div>
          ) : relatorios.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg">Nenhum relatório criado</p>
              <Button
                onClick={() => setShowAddRelatorioModal(true)}
                className="mt-4 bg-blue-500 hover:bg-blue-600"
              >
                <Plus className="w-5 h-5 mr-2" />
                Criar Primeiro Relatório
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {relatorios.map((relatorio) => (
                <div
                  key={relatorio.id}
                  className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-4 hover:border-blue-500 transition"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="cursor-pointer flex-1" onClick={() => openViewRelatorioModal(relatorio)}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-blue-400 font-bold text-lg">
                          #{relatorio.numero_assistencia}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${getStatusColor(relatorio.status)}`}>
                          {getStatusLabel(relatorio.status)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400">
                        {new Date(relatorio.data_servico).toLocaleDateString('pt-PT')}
                      </p>
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex gap-1 ml-2">
                      <Button
                        onClick={(e) => openEditRelatorioModal(relatorio, e)}
                        variant="outline"
                        size="sm"
                        className="border-gray-600 hover:border-blue-500 hover:bg-blue-500/10 p-2"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      
                      {user?.is_admin && (
                        <Button
                          onClick={(e) => openDeleteRelatorioModal(relatorio, e)}
                          variant="outline"
                          size="sm"
                          className="border-gray-600 hover:border-red-500 hover:bg-red-500/10 hover:text-red-400 p-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Cliente */}
                  <div className="mb-3 cursor-pointer" onClick={() => openViewRelatorioModal(relatorio)}>
                    <p className="text-white font-semibold">{relatorio.cliente_nome}</p>
                    <p className="text-sm text-gray-400">{relatorio.local_intervencao}</p>
                  </div>

                  {/* Equipamento */}
                  <div className="mb-3 pb-3 border-b border-gray-700 cursor-pointer" onClick={() => openViewRelatorioModal(relatorio)}>
                    <p className="text-xs text-gray-500 mb-1">Equipamento</p>
                    <p className="text-sm text-gray-300">
                      {relatorio.equipamento_marca} - {relatorio.equipamento_tipologia}
                    </p>
                  </div>

                  {/* Técnico */}
                  <div className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer" onClick={() => openViewRelatorioModal(relatorio)}>
                    <User className="w-4 h-4" />
                    <span>{relatorio.cliente_nome}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      {/* Add Relatório Modal */}
      <Dialog open={showAddRelatorioModal} onOpenChange={setShowAddRelatorioModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Plus className="w-5 h-5 text-blue-400" />
              Nova Ordem de Trabalho
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddRelatorio} className="space-y-6 mt-4">
            {/* Cliente e Data */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cliente_id" className="text-gray-300">
                  Cliente *
                </Label>
                <select
                  id="cliente_id"
                  value={relatorioFormData.cliente_id}
                  onChange={(e) => {
                    const clienteId = e.target.value;
                    setRelatorioFormData({ ...relatorioFormData, cliente_id: clienteId });
                    if (clienteId) {
                      fetchEquipamentos(clienteId);
                    } else {
                      setEquipamentos([]);
                    }
                    setEquipamentoSelecionado('');
                    setModoNovoEquipamento(false);
                  }}
                  className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2"
                  required
                >
                  <option value="">Selecione um cliente</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="data_servico" className="text-gray-300">
                  Data do Serviço *
                </Label>
                <Input
                  id="data_servico"
                  type="date"
                  value={relatorioFormData.data_servico}
                  onChange={(e) => setRelatorioFormData({ ...relatorioFormData, data_servico: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  required
                />
              </div>
            </div>

            {/* Local e Pedido */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="local_intervencao" className="text-gray-300">
                  Local de Intervenção *
                </Label>
                <Input
                  id="local_intervencao"
                  value={relatorioFormData.local_intervencao}
                  onChange={(e) => setRelatorioFormData({ ...relatorioFormData, local_intervencao: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Ex: Braga (Lavandaria Binco)"
                  required
                />
              </div>

              <div>
                <Label htmlFor="pedido_por" className="text-gray-300">
                  Pedido por *
                </Label>
                <Input
                  id="pedido_por"
                  value={relatorioFormData.pedido_por}
                  onChange={(e) => setRelatorioFormData({ ...relatorioFormData, pedido_por: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Nome da pessoa que solicitou"
                  required
                />
              </div>
            </div>

            {/* Equipamento */}
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
              <h3 className="text-blue-400 font-semibold mb-4">Equipamento</h3>
              
              {/* Dropdown de equipamentos existentes */}
              {relatorioFormData.cliente_id && equipamentos.length > 0 && (
                <div className="mb-4">
                  <Label htmlFor="equipamento_select" className="text-gray-300">
                    Selecionar Equipamento Existente
                  </Label>
                  <select
                    id="equipamento_select"
                    value={equipamentoSelecionado}
                    onChange={(e) => handleEquipamentoChange(e.target.value)}
                    className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Selecione ou crie novo...</option>
                    {equipamentos.map(eq => (
                      <option key={eq.id} value={eq.id}>
                        {eq.marca} - {eq.modelo} {eq.numero_serie ? `(#${eq.numero_serie})` : ''}
                      </option>
                    ))}
                    <option value="novo">➕ Novo Equipamento</option>
                  </select>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="equipamento_tipologia" className="text-gray-300">
                    Tipologia *
                  </Label>
                  <Input
                    id="equipamento_tipologia"
                    value={relatorioFormData.equipamento_tipologia}
                    onChange={(e) => setRelatorioFormData({ ...relatorioFormData, equipamento_tipologia: e.target.value })}
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                    placeholder="Ex: Dobradora, Secadora"
                    required
                    disabled={equipamentoSelecionado && equipamentoSelecionado !== 'novo'}
                  />
                </div>

                <div>
                  <Label htmlFor="equipamento_marca" className="text-gray-300">
                    Marca *
                  </Label>
                  <Input
                    id="equipamento_marca"
                    value={relatorioFormData.equipamento_marca}
                    onChange={(e) => setRelatorioFormData({ ...relatorioFormData, equipamento_marca: e.target.value })}
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                    disabled={equipamentoSelecionado && equipamentoSelecionado !== 'novo'}
                    placeholder="Ex: Kannegiesser"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="equipamento_modelo" className="text-gray-300">
                    Modelo *
                  </Label>
                  <Input
                    id="equipamento_modelo"
                    value={relatorioFormData.equipamento_modelo}
                    onChange={(e) => setRelatorioFormData({ ...relatorioFormData, equipamento_modelo: e.target.value })}
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                    placeholder="Modelo do equipamento"
                    required
                    disabled={equipamentoSelecionado && equipamentoSelecionado !== 'novo'}
                  />
                </div>

                <div>
                  <Label htmlFor="equipamento_numero_serie" className="text-gray-300">
                    Número de Série
                  </Label>
                  <Input
                    id="equipamento_numero_serie"
                    value={relatorioFormData.equipamento_numero_serie}
                    onChange={(e) => setRelatorioFormData({ ...relatorioFormData, equipamento_numero_serie: e.target.value })}
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                    placeholder="Opcional"
                    disabled={equipamentoSelecionado && equipamentoSelecionado !== 'novo'}
                  />
                </div>
              </div>
            </div>

            {/* Descrição do Problema */}
            <div>
              <Label htmlFor="descricao_problema" className="text-gray-300">
                Descrição do Problema *
              </Label>
              <textarea
                id="descricao_problema"
                value={relatorioFormData.descricao_problema}
                onChange={(e) => setRelatorioFormData({ ...relatorioFormData, descricao_problema: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3 min-h-[100px]"
                placeholder="Descreva o problema relatado..."
                required
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={() => {
                  setShowAddRelatorioModal(false);
                  resetRelatorioForm();
                }}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-blue-500 hover:bg-blue-600"
              >
                Criar OT
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Relatório Modal */}
      <Dialog open={showViewRelatorioModal} onOpenChange={setShowViewRelatorioModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between w-full pr-8">
              <DialogTitle className="flex items-center gap-2 text-white">
                <FileText className="w-5 h-5 text-blue-400" />
                OT #{selectedRelatorio?.numero_assistencia}
              </DialogTitle>
              <Button
                onClick={() => {
                  setShowViewRelatorioModal(false);
                  openEditRelatorioModal(selectedRelatorio);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-full"
                size="sm"
              >
                <Edit className="w-4 h-4 mr-2" />
                Editar OT
              </Button>
            </div>
          </DialogHeader>

          {selectedRelatorio && (
            <div className="space-y-6 mt-4">
              {/* Status e Data */}
              <div className="flex items-center justify-between">
                <span className={`px-3 py-1 rounded text-sm ${getStatusColor(selectedRelatorio.status)}`}>
                  {getStatusLabel(selectedRelatorio.status)}
                </span>
                <span className="text-gray-400 text-sm">
                  {new Date(selectedRelatorio.data_servico).toLocaleDateString('pt-PT')}
                </span>
              </div>

              {/* Cliente */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <h4 className="text-blue-400 font-semibold mb-2 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Dados do Cliente
                </h4>
                <p className="text-white font-medium">{selectedRelatorio.cliente_nome}</p>
                <p className="text-gray-400 text-sm">Local: {selectedRelatorio.local_intervencao}</p>
                <p className="text-gray-400 text-sm">Pedido por: {selectedRelatorio.pedido_por}</p>
              </div>

              {/* Equipamento */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <h4 className="text-blue-400 font-semibold mb-2">Equipamento</h4>
                <p className="text-white">{selectedRelatorio.equipamento_marca} - {selectedRelatorio.equipamento_tipologia}</p>
                <p className="text-gray-400 text-sm">Modelo: {selectedRelatorio.equipamento_modelo}</p>
                {selectedRelatorio.equipamento_numero_serie && (
                  <p className="text-gray-400 text-sm">Série: {selectedRelatorio.equipamento_numero_serie}</p>
                )}
              </div>

              {/* Problema */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <h4 className="text-blue-400 font-semibold mb-2">Motivo da Assistência</h4>
                <p className="text-gray-300">{selectedRelatorio.motivo_assistencia}</p>
              </div>

              {/* Mão de Obra / Deslocação */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-blue-400 font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Mão de Obra / Deslocação
                  </h4>
                  <Button
                    onClick={() => setShowAddTecnicoModal(true)}
                    size="sm"
                    className="bg-blue-500 hover:bg-blue-600"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar Técnico
                  </Button>
                </div>

                {/* Tabela de Técnicos */}
                {tecnicos.length > 0 ? (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="text-left py-2 px-3 text-gray-400 text-sm font-medium">Técnico</th>
                            <th className="text-center py-2 px-3 text-gray-400 text-sm font-medium">Horas</th>
                            <th className="text-center py-2 px-3 text-gray-400 text-sm font-medium">Deslocação (km)</th>
                            <th className="text-center py-2 px-3 text-gray-400 text-sm font-medium">Código</th>
                            <th className="text-center py-2 px-3 text-gray-400 text-sm font-medium">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tecnicos.map((tec) => (
                            <tr key={tec.id} className="border-b border-gray-700/50">
                              <td className="py-3 px-3 text-white">{tec.tecnico_nome}</td>
                              <td className="py-3 px-3 text-center text-gray-300">{tec.horas_cliente}h</td>
                              <td className="py-3 px-3 text-center text-gray-300">
                                {tec.kms_deslocacao} km 
                                <span className="text-xs text-gray-500 ml-1">(x2 = {tec.kms_deslocacao * 2} km)</span>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded text-sm">
                                  {getTipoHorarioCodigo(tec.tipo_horario)}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <Button
                                  onClick={() => openEditTecnicoModal(tec)}
                                  variant="outline"
                                  size="sm"
                                  className="border-gray-600 hover:border-blue-500 hover:bg-blue-500/10 p-2"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Legenda dos Códigos */}
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded p-3">
                      <p className="text-xs text-gray-400 mb-2 font-semibold">Tipos de Trabalho:</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded font-mono">1</span>
                          <span className="text-gray-300">Dias úteis (07h-19h)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded font-mono">2</span>
                          <span className="text-gray-300">Dias úteis (19h-07h)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded font-mono">S</span>
                          <span className="text-gray-300">Sábado</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded font-mono">D</span>
                          <span className="text-gray-300">Domingos/Feriados</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">Nenhum técnico atribuído</p>
                  </div>
                )}
              </div>

              {/* Relatório de Assistência */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <h4 className="text-blue-400 font-semibold mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Relatório de Assistência
                </h4>
                {selectedRelatorio.relatorio_assistencia ? (
                  <div className="text-gray-300 whitespace-pre-wrap bg-[#1a1a1a] p-3 rounded border border-gray-700">
                    {selectedRelatorio.relatorio_assistencia}
                  </div>
                ) : (
                  <p className="text-gray-500 italic text-sm">Nenhum relatório registado</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Técnico Modal */}
      <Dialog open={showAddTecnicoModal} onOpenChange={setShowAddTecnicoModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Plus className="w-5 h-5 text-blue-400" />
              Adicionar Técnico
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddTecnico} className="space-y-4 mt-4">
            <div>
              <Label htmlFor="tecnico_nome" className="text-gray-300">
                Nome do Técnico *
              </Label>
              <Input
                id="tecnico_nome"
                value={tecnicoFormData.tecnico_nome}
                onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, tecnico_nome: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                placeholder="Ex: Pedro Duarte"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="horas_cliente" className="text-gray-300 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Horas no Cliente *
                </Label>
                <Input
                  id="horas_cliente"
                  type="number"
                  step="0.5"
                  min="0"
                  value={tecnicoFormData.horas_cliente}
                  onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, horas_cliente: parseFloat(e.target.value) || 0 })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Ex: 8"
                  required
                />
              </div>

              <div>
                <Label htmlFor="kms_deslocacao" className="text-gray-300 flex items-center gap-2">
                  <Car className="w-4 h-4" />
                  Quilómetros (só ida) *
                </Label>
                <Input
                  id="kms_deslocacao"
                  type="number"
                  step="1"
                  min="0"
                  value={tecnicoFormData.kms_deslocacao}
                  onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, kms_deslocacao: parseFloat(e.target.value) || 0 })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Ex: 150"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Total ida e volta: {(tecnicoFormData.kms_deslocacao * 2).toFixed(0)} km
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="tipo_horario" className="text-gray-300">
                Tipo de Horário *
              </Label>
              <select
                id="tipo_horario"
                value={tecnicoFormData.tipo_horario}
                onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, tipo_horario: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2"
                required
              >
                <option value="diurno">Diurno (07h-19h) - Código 1</option>
                <option value="noturno">Noturno (19h-07h) - Código 2</option>
                <option value="sabado">Sábado - Código S</option>
                <option value="domingo_feriado">Domingo/Feriado - Código D</option>
              </select>
            </div>

            <div className="bg-blue-500/5 border border-blue-500/20 rounded p-3">
              <p className="text-xs text-gray-400">
                <strong>Nota:</strong> Os quilómetros serão automaticamente multiplicados por 2 (ida e volta) nos cálculos finais.
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={() => {
                  setShowAddTecnicoModal(false);
                  resetTecnicoForm();
                }}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-blue-500 hover:bg-blue-600"
              >
                Adicionar Técnico
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Técnico Modal */}
      <Dialog open={showEditTecnicoModal} onOpenChange={setShowEditTecnicoModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Edit className="w-5 h-5 text-blue-400" />
              Editar Técnico
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEditTecnico} className="space-y-4 mt-4">
            <div>
              <Label htmlFor="edit_tecnico_nome" className="text-gray-300">
                Nome do Técnico *
              </Label>
              <Input
                id="edit_tecnico_nome"
                value={tecnicoFormData.tecnico_nome}
                onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, tecnico_nome: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                placeholder="Ex: Pedro Duarte"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_horas_cliente" className="text-gray-300 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Horas no Cliente *
                </Label>
                <Input
                  id="edit_horas_cliente"
                  type="number"
                  step="0.5"
                  min="0"
                  value={tecnicoFormData.horas_cliente}
                  onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, horas_cliente: parseFloat(e.target.value) || 0 })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Ex: 8"
                  required
                />
              </div>

              <div>
                <Label htmlFor="edit_kms_deslocacao" className="text-gray-300 flex items-center gap-2">
                  <Car className="w-4 h-4" />
                  Quilómetros (só ida) *
                </Label>
                <Input
                  id="edit_kms_deslocacao"
                  type="number"
                  step="1"
                  min="0"
                  value={tecnicoFormData.kms_deslocacao}
                  onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, kms_deslocacao: parseFloat(e.target.value) || 0 })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Ex: 150"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Total ida e volta: {(tecnicoFormData.kms_deslocacao * 2).toFixed(0)} km
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="edit_tipo_horario" className="text-gray-300">
                Tipo de Horário *
              </Label>
              <select
                id="edit_tipo_horario"
                value={tecnicoFormData.tipo_horario}
                onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, tipo_horario: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2"
                required
              >
                <option value="diurno">Diurno (07h-19h) - Código 1</option>
                <option value="noturno">Noturno (19h-07h) - Código 2</option>
                <option value="sabado">Sábado - Código S</option>
                <option value="domingo_feriado">Domingo/Feriado - Código D</option>
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={() => {
                  setShowEditTecnicoModal(false);
                  setSelectedTecnico(null);
                  resetTecnicoForm();
                }}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-blue-500 hover:bg-blue-600"
              >
                Salvar Alterações
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Relatório Modal */}
      <Dialog open={showEditRelatorioModal} onOpenChange={setShowEditRelatorioModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Edit className="w-5 h-5 text-blue-400" />
              Editar Relatório #{selectedRelatorio?.numero_assistencia}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEditRelatorio} className="space-y-6 mt-4">
            {/* Cliente e Data */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_cliente_id" className="text-gray-300">
                  Cliente *
                </Label>
                <select
                  id="edit_cliente_id"
                  value={relatorioFormData.cliente_id}
                  onChange={(e) => setRelatorioFormData({ ...relatorioFormData, cliente_id: e.target.value })}
                  className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2"
                  required
                >
                  <option value="">Selecione um cliente</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="edit_data_servico" className="text-gray-300">
                  Data do Serviço *
                </Label>
                <Input
                  id="edit_data_servico"
                  type="date"
                  value={relatorioFormData.data_servico}
                  onChange={(e) => setRelatorioFormData({ ...relatorioFormData, data_servico: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  required
                />
              </div>
            </div>

            {/* Local e Pedido */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_local_intervencao" className="text-gray-300">
                  Local de Intervenção *
                </Label>
                <Input
                  id="edit_local_intervencao"
                  value={relatorioFormData.local_intervencao}
                  onChange={(e) => setRelatorioFormData({ ...relatorioFormData, local_intervencao: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  required
                />
              </div>

              <div>
                <Label htmlFor="edit_pedido_por" className="text-gray-300">
                  Pedido por *
                </Label>
                <Input
                  id="edit_pedido_por"
                  value={relatorioFormData.pedido_por}
                  onChange={(e) => setRelatorioFormData({ ...relatorioFormData, pedido_por: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  required
                />
              </div>
            </div>

            {/* Equipamento */}
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
              <h3 className="text-blue-400 font-semibold mb-4">Equipamento</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit_equipamento_tipologia" className="text-gray-300">
                    Tipologia *
                  </Label>
                  <Input
                    id="edit_equipamento_tipologia"
                    value={relatorioFormData.equipamento_tipologia}
                    onChange={(e) => setRelatorioFormData({ ...relatorioFormData, equipamento_tipologia: e.target.value })}
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="edit_equipamento_marca" className="text-gray-300">
                    Marca *
                  </Label>
                  <Input
                    id="edit_equipamento_marca"
                    value={relatorioFormData.equipamento_marca}
                    onChange={(e) => setRelatorioFormData({ ...relatorioFormData, equipamento_marca: e.target.value })}
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="edit_equipamento_modelo" className="text-gray-300">
                    Modelo *
                  </Label>
                  <Input
                    id="edit_equipamento_modelo"
                    value={relatorioFormData.equipamento_modelo}
                    onChange={(e) => setRelatorioFormData({ ...relatorioFormData, equipamento_modelo: e.target.value })}
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="edit_equipamento_numero_serie" className="text-gray-300">
                    Número de Série
                  </Label>
                  <Input
                    id="edit_equipamento_numero_serie"
                    value={relatorioFormData.equipamento_numero_serie}
                    onChange={(e) => setRelatorioFormData({ ...relatorioFormData, equipamento_numero_serie: e.target.value })}
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Motivo da Assistência */}
            <div>
              <Label htmlFor="edit_motivo_assistencia" className="text-gray-300">
                Motivo da Assistência *
              </Label>
              <textarea
                id="edit_motivo_assistencia"
                value={relatorioFormData.motivo_assistencia}
                onChange={(e) => setRelatorioFormData({ ...relatorioFormData, motivo_assistencia: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3 min-h-[100px]"
                required
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={() => {
                  setShowEditRelatorioModal(false);
                  setSelectedRelatorio(null);
                }}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-blue-500 hover:bg-blue-600"
              >
                Salvar Alterações
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Relatório Confirmation Modal */}
      <Dialog open={showDeleteRelatorioModal} onOpenChange={setShowDeleteRelatorioModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" />
              Confirmar Eliminação
            </DialogTitle>
          </DialogHeader>

          {relatorioToDelete && (
            <div className="space-y-4 mt-4">
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <p className="text-white mb-2">
                  Tem certeza que deseja eliminar esta OT?
                </p>
                <div className="bg-[#0f0f0f] p-3 rounded mt-3">
                  <p className="text-white font-semibold">
                    Relatório #{relatorioToDelete.numero_assistencia}
                  </p>
                  <p className="text-gray-400 text-sm">{relatorioToDelete.cliente_nome}</p>
                  <p className="text-gray-400 text-sm">
                    {new Date(relatorioToDelete.data_servico).toLocaleDateString('pt-PT')}
                  </p>
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <p className="text-amber-200 text-sm">
                  <strong>⚠️ Atenção:</strong> Esta ação não pode ser desfeita. A OT e todos os dados associados (técnicos, fotos, materiais) serão permanentemente eliminados.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  onClick={() => {
                    setShowDeleteRelatorioModal(false);
                    setRelatorioToDelete(null);
                  }}
                  variant="outline"
                  className="flex-1 border-gray-600"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleDeleteRelatorio}
                  className="flex-1 bg-red-500 hover:bg-red-600"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar OT
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Cliente Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Plus className="w-5 h-5 text-blue-400" />
              Adicionar Novo Cliente
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddCliente} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="nome" className="text-gray-300">
                  Nome / Empresa *
                </Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  required
                />
              </div>

              <div>
                <Label htmlFor="nif" className="text-gray-300">
                  NIF/NIPC
                </Label>
                <Input
                  id="nif"
                  value={formData.nif}
                  onChange={(e) => setFormData({ ...formData, nif: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                />
              </div>

              <div>
                <Label htmlFor="email" className="text-gray-300">
                  Email Principal
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                />
              </div>

              <div>
                <Label htmlFor="telefone" className="text-gray-300">
                  Telefone
                </Label>
                <Input
                  id="telefone"
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="morada" className="text-gray-300">
                Morada
              </Label>
              <Input
                id="morada"
                value={formData.morada}
                onChange={(e) => setFormData({ ...formData, morada: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
              />
            </div>

            <div>
              <Label htmlFor="emails_adicionais" className="text-gray-300">
                Emails Adicionais
              </Label>
              <Input
                id="emails_adicionais"
                value={formData.emails_adicionais}
                onChange={(e) => setFormData({ ...formData, emails_adicionais: e.target.value })}
                placeholder="Separar com vírgulas"
                className="bg-[#0f0f0f] border-gray-700 text-white"
              />
              <p className="text-xs text-gray-500 mt-1">
                Exemplo: email1@exemplo.com, email2@exemplo.com
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-blue-500 hover:bg-blue-600"
              >
                Adicionar Cliente
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Cliente Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Edit className="w-5 h-5 text-blue-400" />
              Editar Cliente
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEditCliente} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-nome" className="text-gray-300">
                  Nome / Empresa *
                </Label>
                <Input
                  id="edit-nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  required
                />
              </div>

              <div>
                <Label htmlFor="edit-nif" className="text-gray-300">
                  NIF/NIPC
                </Label>
                <Input
                  id="edit-nif"
                  value={formData.nif}
                  onChange={(e) => setFormData({ ...formData, nif: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                />
              </div>

              <div>
                <Label htmlFor="edit-email" className="text-gray-300">
                  Email Principal
                </Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                />
              </div>

              <div>
                <Label htmlFor="edit-telefone" className="text-gray-300">
                  Telefone
                </Label>
                <Input
                  id="edit-telefone"
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-morada" className="text-gray-300">
                Morada
              </Label>
              <Input
                id="edit-morada"
                value={formData.morada}
                onChange={(e) => setFormData({ ...formData, morada: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
              />
            </div>

            <div>
              <Label htmlFor="edit-emails-adicionais" className="text-gray-300">
                Emails Adicionais
              </Label>
              <Input
                id="edit-emails-adicionais"
                value={formData.emails_adicionais}
                onChange={(e) => setFormData({ ...formData, emails_adicionais: e.target.value })}
                placeholder="Separar com vírgulas"
                className="bg-[#0f0f0f] border-gray-700 text-white"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  resetForm();
                }}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-blue-500 hover:bg-blue-600"
              >
                Salvar Alterações
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Cliente Modal */}
      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <User className="w-5 h-5 text-blue-400" />
              Detalhes do Cliente
            </DialogTitle>
          </DialogHeader>

          {selectedCliente && (
            <div className="space-y-4 mt-4">
              {/* Nome */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-gray-400">Nome / Empresa</span>
                </div>
                <p className="text-white font-medium">{selectedCliente.nome}</p>
              </div>

              {/* NIF */}
              {selectedCliente.nif && (
                <div className="bg-[#0f0f0f] p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-gray-400">NIF/NIPC</span>
                  </div>
                  <p className="text-white font-medium">{selectedCliente.nif}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Email */}
                {selectedCliente.email && (
                  <div className="bg-[#0f0f0f] p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Mail className="w-4 h-4 text-blue-400" />
                      <span className="text-sm text-gray-400">Email</span>
                    </div>
                    <p className="text-white break-words">{selectedCliente.email}</p>
                  </div>
                )}

                {/* Telefone */}
                {selectedCliente.telefone && (
                  <div className="bg-[#0f0f0f] p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Phone className="w-4 h-4 text-blue-400" />
                      <span className="text-sm text-gray-400">Telefone</span>
                    </div>
                    <p className="text-white">{selectedCliente.telefone}</p>
                  </div>
                )}
              </div>

              {/* Morada */}
              {selectedCliente.morada && (
                <div className="bg-[#0f0f0f] p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-gray-400">Morada</span>
                  </div>
                  <p className="text-white">{selectedCliente.morada}</p>
                </div>
              )}

              {/* Emails Adicionais */}
              {selectedCliente.emails_adicionais && (
                <div className="bg-[#0f0f0f] p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-gray-400">Emails Adicionais</span>
                  </div>
                  <p className="text-white break-words">{selectedCliente.emails_adicionais}</p>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-3 pt-4 border-t border-gray-700">
                {/* Relatórios Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button
                    onClick={() => handleAddRelatorioFromCliente(selectedCliente)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Relatório
                  </Button>
                  
                  <Button
                    onClick={() => {
                      setShowViewModal(false);
                      fetchClienteRelatorios(selectedCliente.id);
                    }}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Ver Relatórios
                  </Button>
                  
                  <Button
                    onClick={() => {
                      setShowViewModal(false);
                      fetchClienteEquipamentosDetalhado(selectedCliente.id);
                    }}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Ver Equipamentos
                  </Button>
                  
                  <Button
                    onClick={() => handleDownloadAllClienteRelatorios(selectedCliente)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Todos
                  </Button>
                </div>

                {/* Cliente Actions */}
                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      setShowViewModal(false);
                      openEditModal(selectedCliente);
                    }}
                    className="flex-1 bg-blue-500 hover:bg-blue-600"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Editar Cliente
                  </Button>
                  
                  {user?.is_admin && (
                    <Button
                      onClick={() => {
                        setShowViewModal(false);
                        openDeleteModal(selectedCliente);
                      }}
                      variant="outline"
                      className="border-red-500 text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Equipamentos do Cliente Modal */}
      <Dialog open={showClienteEquipamentosModal} onOpenChange={setShowClienteEquipamentosModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Settings className="w-5 h-5 text-amber-400" />
              Equipamentos do Cliente
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4">
            {clienteEquipamentos.length === 0 ? (
              <div className="text-center py-12">
                <Settings className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">Nenhum equipamento cadastrado para este cliente</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-gray-400 text-sm mb-4">
                  Total: {clienteEquipamentos.length} equipamento(s)
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {clienteEquipamentos.map((equipamento) => (
                    <div
                      key={equipamento.id}
                      className="bg-[#0f0f0f] border border-gray-700 rounded-lg p-4 hover:border-amber-500 transition"
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Settings className="w-5 h-5 text-amber-400" />
                            <span className="text-white font-bold text-lg">
                              {equipamento.marca}
                            </span>
                          </div>
                          <p className="text-sm text-gray-400">{equipamento.tipologia}</p>
                        </div>
                      </div>

                      {/* Detalhes */}
                      <div className="space-y-2 mb-3 pb-3 border-b border-gray-700">
                        <div>
                          <span className="text-xs text-gray-500">Modelo:</span>
                          <p className="text-sm text-gray-300">{equipamento.modelo}</p>
                        </div>
                        
                        {equipamento.numero_serie && (
                          <div>
                            <span className="text-xs text-gray-500">Nº Série:</span>
                            <p className="text-sm text-gray-300 font-mono">{equipamento.numero_serie}</p>
                          </div>
                        )}
                        
                        {equipamento.last_used && (
                          <div>
                            <span className="text-xs text-gray-500">Último uso:</span>
                            <p className="text-sm text-gray-300">
                              {new Date(equipamento.last_used).toLocaleDateString('pt-PT')}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Ver OTs Button */}
                      <Button
                        onClick={() => {
                          setShowClienteEquipamentosModal(false);
                          fetchEquipamentoOTs(equipamento);
                        }}
                        size="sm"
                        className="w-full bg-purple-600 hover:bg-purple-700"
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        Ver OTs deste Equipamento
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Relatórios do Cliente Modal */}
      <Dialog open={showClienteRelatoriosModal} onOpenChange={setShowClienteRelatoriosModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <FileText className="w-5 h-5 text-purple-400" />
              Relatórios do Cliente
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4">
            {clienteRelatorios.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">Nenhum relatório encontrado para este cliente</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-gray-400 text-sm mb-4">
                  Total: {clienteRelatorios.length} relatório(s)
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {clienteRelatorios.map((relatorio) => (
                    <div
                      key={relatorio.id}
                      className="bg-[#0f0f0f] border border-gray-700 rounded-lg p-4 hover:border-purple-500 transition cursor-pointer"
                      onClick={() => {
                        setShowClienteRelatoriosModal(false);
                        openViewRelatorioModal(relatorio);
                      }}
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-purple-400 font-bold text-lg">
                              #{relatorio.numero_assistencia}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded ${getStatusColor(relatorio.status)}`}>
                              {getStatusLabel(relatorio.status)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-400">
                            {new Date(relatorio.data_servico).toLocaleDateString('pt-PT')}
                          </p>
                        </div>
                      </div>

                      {/* Local */}
                      <div className="mb-3">
                        <p className="text-sm text-gray-400">{relatorio.local_intervencao}</p>
                      </div>

                      {/* Equipamento */}
                      <div className="mb-3 pb-3 border-b border-gray-700">
                        <p className="text-xs text-gray-500 mb-1">Equipamento</p>
                        <p className="text-sm text-gray-300">
                          {relatorio.equipamento_marca} - {relatorio.equipamento_tipologia}
                        </p>
                      </div>

                      {/* View Button */}
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowClienteRelatoriosModal(false);
                          openViewRelatorioModal(relatorio);
                        }}
                        size="sm"
                        className="w-full bg-purple-600 hover:bg-purple-700 mt-2"
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        Ver Detalhes
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* OTs do Equipamento Modal */}
      <Dialog open={showEquipamentoOTsModal} onOpenChange={setShowEquipamentoOTsModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <FileText className="w-5 h-5 text-purple-400" />
              OTs do Equipamento
              {selectedEquipamento && (
                <span className="text-sm text-gray-400 ml-2">
                  ({selectedEquipamento.marca} - {selectedEquipamento.modelo})
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4">
            {equipamentoOTs.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">Nenhuma OT encontrada para este equipamento</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-gray-400 text-sm mb-4">
                  Total: {equipamentoOTs.length} OT(s) para este equipamento
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {equipamentoOTs.map((relatorio) => (
                    <div
                      key={relatorio.id}
                      className="bg-[#0f0f0f] border border-gray-700 rounded-lg p-4 hover:border-purple-500 transition cursor-pointer"
                      onClick={() => {
                        setShowEquipamentoOTsModal(false);
                        openViewRelatorioModal(relatorio);
                      }}
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-purple-400 font-bold text-lg">
                              #{relatorio.numero_assistencia}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded ${getStatusColor(relatorio.status)}`}>
                              {getStatusLabel(relatorio.status)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-400">
                            {new Date(relatorio.data_servico).toLocaleDateString('pt-PT')}
                          </p>
                        </div>
                      </div>

                      {/* Local */}
                      <div className="mb-3">
                        <p className="text-sm text-gray-400">{relatorio.local_intervencao}</p>
                      </div>

                      {/* Problema */}
                      <div className="mb-3 pb-3 border-b border-gray-700">
                        <p className="text-xs text-gray-500 mb-1">Motivo</p>
                        <p className="text-sm text-gray-300 line-clamp-2">
                          {relatorio.motivo_assistencia || relatorio.descricao_problema}
                        </p>
                      </div>

                      {/* View Button */}
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowEquipamentoOTsModal(false);
                          openViewRelatorioModal(relatorio);
                        }}
                        size="sm"
                        className="w-full bg-purple-600 hover:bg-purple-700 mt-2"
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        Ver Detalhes
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" />
              Confirmar Eliminação
            </DialogTitle>
          </DialogHeader>

          {clienteToDelete && (
            <div className="space-y-4 mt-4">
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <p className="text-white mb-2">
                  Tem certeza que deseja eliminar este cliente?
                </p>
                <div className="bg-[#0f0f0f] p-3 rounded mt-3">
                  <p className="text-white font-semibold">{clienteToDelete.nome}</p>
                  {clienteToDelete.nif && (
                    <p className="text-gray-400 text-sm">NIF: {clienteToDelete.nif}</p>
                  )}
                  {clienteToDelete.email && (
                    <p className="text-gray-400 text-sm">{clienteToDelete.email}</p>
                  )}
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <p className="text-amber-200 text-sm">
                  <strong>⚠️ Atenção:</strong> Esta ação não pode ser desfeita. O cliente será marcado como inativo.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setClienteToDelete(null);
                  }}
                  variant="outline"
                  className="flex-1 border-gray-600"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleDeleteCliente}
                  className="flex-1 bg-red-500 hover:bg-red-600"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar Cliente
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TechnicalReports;
