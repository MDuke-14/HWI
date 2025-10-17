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
  X
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
  
  // Relatórios modals
  const [showAddRelatorioModal, setShowAddRelatorioModal] = useState(false);
  const [showViewRelatorioModal, setShowViewRelatorioModal] = useState(false);
  const [selectedRelatorio, setSelectedRelatorio] = useState(null);
  
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
    contacto_pedido: '',
    equipamento_tipologia: '',
    equipamento_marca: '',
    equipamento_modelo: '',
    equipamento_numero_serie: '',
    descricao_problema: ''
  });

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
      toast.error('Erro ao carregar relatórios');
      console.error(error);
    } finally {
      setLoading(false);
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
      contacto_pedido: '',
      equipamento_tipologia: '',
      equipamento_marca: '',
      equipamento_modelo: '',
      equipamento_numero_serie: '',
      descricao_problema: ''
    });
  };

  const handleAddRelatorio = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/relatorios-tecnicos`, relatorioFormData);
      toast.success('Relatório criado com sucesso!');
      setShowAddRelatorioModal(false);
      resetRelatorioForm();
      fetchRelatorios();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao criar relatório');
    }
  };

  const openViewRelatorioModal = (relatorio) => {
    setSelectedRelatorio(relatorio);
    setShowViewRelatorioModal(true);
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
              <h1 className="text-3xl font-bold text-white">Relatórios Técnicos</h1>
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
              Relatórios
            </button>
          </div>
        </div>

        {/* Clientes Section */}
        {activeTab === 'clientes' && (
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
                    
                    {user?.is_admin && (
                      <>
                        <Button
                          onClick={() => openEditModal(cliente)}
                          variant="outline"
                          size="sm"
                          className="border-gray-600 hover:border-blue-500 hover:bg-blue-500/10"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => openDeleteModal(cliente)}
                          variant="outline"
                          size="sm"
                          className="border-gray-600 hover:border-red-500 hover:bg-red-500/10 hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
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
              Novo Relatório
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
                  className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-4 hover:border-blue-500 transition cursor-pointer"
                  onClick={() => openViewRelatorioModal(relatorio)}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
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
                  </div>

                  {/* Cliente */}
                  <div className="mb-3">
                    <p className="text-white font-semibold">{relatorio.cliente_nome}</p>
                    <p className="text-sm text-gray-400">{relatorio.local_intervencao}</p>
                  </div>

                  {/* Equipamento */}
                  <div className="mb-3 pb-3 border-b border-gray-700">
                    <p className="text-xs text-gray-500 mb-1">Equipamento</p>
                    <p className="text-sm text-gray-300">
                      {relatorio.equipamento_marca} - {relatorio.equipamento_tipologia}
                    </p>
                  </div>

                  {/* Técnico */}
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <User className="w-4 h-4" />
                    <span>{relatorio.tecnico_nome}</span>
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
              Novo Relatório Técnico
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

            <div>
              <Label htmlFor="contacto_pedido" className="text-gray-300">
                Contacto do Solicitante
              </Label>
              <Input
                id="contacto_pedido"
                value={relatorioFormData.contacto_pedido}
                onChange={(e) => setRelatorioFormData({ ...relatorioFormData, contacto_pedido: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                placeholder="Telefone ou email"
              />
            </div>

            {/* Equipamento */}
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
              <h3 className="text-blue-400 font-semibold mb-4">Equipamento</h3>
              
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
                Criar Relatório
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Relatório Modal */}
      <Dialog open={showViewRelatorioModal} onOpenChange={setShowViewRelatorioModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <FileText className="w-5 h-5 text-blue-400" />
              Relatório #{selectedRelatorio?.numero_assistencia}
            </DialogTitle>
          </DialogHeader>

          {selectedRelatorio && (
            <div className="space-y-4 mt-4">
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
              <div className="bg-[#0f0f0f] p-4 rounded-lg">
                <h4 className="text-blue-400 font-semibold mb-2">Cliente</h4>
                <p className="text-white font-medium">{selectedRelatorio.cliente_nome}</p>
                <p className="text-gray-400 text-sm">Local: {selectedRelatorio.local_intervencao}</p>
                <p className="text-gray-400 text-sm">Pedido por: {selectedRelatorio.pedido_por}</p>
              </div>

              {/* Equipamento */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg">
                <h4 className="text-blue-400 font-semibold mb-2">Equipamento</h4>
                <p className="text-white">{selectedRelatorio.equipamento_marca} - {selectedRelatorio.equipamento_tipologia}</p>
                <p className="text-gray-400 text-sm">Modelo: {selectedRelatorio.equipamento_modelo}</p>
                {selectedRelatorio.equipamento_numero_serie && (
                  <p className="text-gray-400 text-sm">Série: {selectedRelatorio.equipamento_numero_serie}</p>
                )}
              </div>

              {/* Problema */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg">
                <h4 className="text-blue-400 font-semibold mb-2">Descrição do Problema</h4>
                <p className="text-gray-300">{selectedRelatorio.descricao_problema}</p>
              </div>

              {/* Técnico */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg">
                <h4 className="text-blue-400 font-semibold mb-2">Técnico Responsável</h4>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-white">{selectedRelatorio.tecnico_nome}</span>
                </div>
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

              {/* Actions for Admin */}
              {user?.is_admin && (
                <div className="flex gap-3 pt-4 border-t border-gray-700">
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
                </div>
              )}
            </div>
          )}
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
