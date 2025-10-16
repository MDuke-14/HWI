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
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    morada: '',
    nif: '',
    emails_adicionais: ''
  });

  useEffect(() => {
    fetchClientes();
  }, []);

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

  const handleDeleteCliente = async (clienteId) => {
    if (!window.confirm('Tem certeza que deseja deletar este cliente?')) {
      return;
    }

    try {
      await axios.delete(`${API}/clientes/${clienteId}`);
      toast.success('Cliente deletado com sucesso!');
      fetchClientes();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao deletar cliente');
    }
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
            <button className="px-4 py-3 text-blue-400 border-b-2 border-blue-400 font-semibold">
              <Building2 className="w-4 h-4 inline mr-2" />
              Clientes
            </button>
            <button className="px-4 py-3 text-gray-400 hover:text-white transition">
              <FileText className="w-4 h-4 inline mr-2" />
              Relatórios
            </button>
          </div>
        </div>

        {/* Clientes Section */}
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
                      onClick={() => openEditModal(cliente)}
                      variant="outline"
                      size="sm"
                      className="flex-1 border-gray-600 hover:border-blue-500 hover:bg-blue-500/10"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Editar
                    </Button>
                    <Button
                      onClick={() => handleDeleteCliente(cliente.id)}
                      variant="outline"
                      size="sm"
                      className="border-gray-600 hover:border-red-500 hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
    </div>
  );
};

export default TechnicalReports;
