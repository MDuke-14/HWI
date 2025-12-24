import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from './Navigation';
import { toast } from 'sonner';
import SignatureCanvas from 'react-signature-canvas';
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
  Download,
  Image as ImageIcon,
  PenTool,
  Send,
  Package,
  ChevronRight,
  PlayCircle,
  StopCircle
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

// Helper function to format error messages from FastAPI validation errors
const formatErrorMessage = (error) => {
  if (!error.response) {
    return 'Erro de conexão';
  }
  
  const data = error.response.data;
  
  // Se detail é uma string, retorne-a diretamente
  if (typeof data.detail === 'string') {
    return data.detail;
  }
  
  // Se detail é um array (erros de validação do Pydantic)
  if (Array.isArray(data.detail)) {
    return data.detail.map(err => {
      const field = err.loc ? err.loc[err.loc.length - 1] : 'campo';
      return `${field}: ${err.msg}`;
    }).join(', ');
  }
  
  // Fallback
  return 'Erro ao processar solicitação';
};

const TechnicalReports = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('clientes'); // 'relatorios', 'clientes', ou 'pesquisa'
  const [clientes, setClientes] = useState([]);
  const [relatorios, setRelatorios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filteredByStatus, setFilteredByStatus] = useState([]);
  
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
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedStatusRelatorio, setSelectedStatusRelatorio] = useState(null);
  const [tecnicos, setTecnicos] = useState([]);
  const [showAddTecnicoModal, setShowAddTecnicoModal] = useState(false);
  const [showEditTecnicoModal, setShowEditTecnicoModal] = useState(false);
  const [selectedTecnico, setSelectedTecnico] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  
  // Intervenções
  const [intervencoes, setIntervencoes] = useState([]);
  const [showAddIntervencaoModal, setShowAddIntervencaoModal] = useState(false);
  const [showEditIntervencaoModal, setShowEditIntervencaoModal] = useState(false);
  const [selectedIntervencao, setSelectedIntervencao] = useState(null);
  const [intervencaoFormData, setIntervencaoFormData] = useState({
    data_intervencao: new Date().toISOString().split('T')[0],
    motivo_assistencia: '',
    relatorio_assistencia: ''
  });
  
  // Fotografias
  const [fotografias, setFotografias] = useState([]);
  const [showAddFotoModal, setShowAddFotoModal] = useState(false);
  const [selectedFoto, setSelectedFoto] = useState(null);
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoDescricao, setFotoDescricao] = useState('');
  const [uploadingFoto, setUploadingFoto] = useState(false);

  // Assinatura
  const [assinatura, setAssinatura] = useState(null);
  const [showAssinaturaModal, setShowAssinaturaModal] = useState(false);
  const [assinaturaCanvas, setAssinaturaCanvas] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [assinaturaNome, setAssinaturaNome] = useState({ primeiro: '', ultimo: '' });
  const [uploadingAssinatura, setUploadingAssinatura] = useState(false);

  // Email PDF
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailsCliente, setEmailsCliente] = useState([]);
  const [emailsAdicionais, setEmailsAdicionais] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // Material OT
  const [materiais, setMateriais] = useState([]);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [showEditMaterialModal, setShowEditMaterialModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [materialFormData, setMaterialFormData] = useState({
    descricao: '',
    quantidade: 1,
    fornecido_por: 'Cliente'
  });

  // Pedidos de Cotação
  const [pedidosCotacao, setPedidosCotacao] = useState([]);
  const [showPCModal, setShowPCModal] = useState(false);
  const [selectedPC, setSelectedPC] = useState(null);
  const [pcFormData, setPCFormData] = useState({
    status: 'Em Espera',
    observacoes: ''
  });
  const [fotografiasPC, setFotografiasPC] = useState([]);
  const [showAddFotoPCModal, setShowAddFotoPCModal] = useState(false);
  const [fotoPCFile, setFotoPCFile] = useState(null);
  const [fotoPCDescricao, setFotoPCDescricao] = useState('');
  const [uploadingFotoPC, setUploadingFotoPC] = useState(false);
  const [showEmailPCModal, setShowEmailPCModal] = useState(false);
  const [sendingEmailPC, setSendingEmailPC] = useState(false);

  // Todos os PCs (para aba Pedidos de Cotação)
  const [allPCs, setAllPCs] = useState([]);
  const [loadingPCs, setLoadingPCs] = useState(false);

  // Cronómetros
  const [cronometrosAtivos, setCronometrosAtivos] = useState([]);
  const [registosTecnicos, setRegistosTecnicos] = useState([]);
  const [timers, setTimers] = useState({}); // Para contar tempo em tempo real
  
  // Todos os utilizadores do sistema (para cronómetros)
  const [allSystemUsers, setAllSystemUsers] = useState([]);
  const [selectedCronoUsers, setSelectedCronoUsers] = useState({});
  
  // Edição de registos de cronómetro
  const [showEditRegistoModal, setShowEditRegistoModal] = useState(false);
  const [editingRegisto, setEditingRegisto] = useState(null);
  const [editRegistoForm, setEditRegistoForm] = useState({
    horas_arredondadas: 0,
    km: 0,
    codigo: ''
  });

  
  const [tecnicoFormData, setTecnicoFormData] = useState({
    tecnico_id: '',
    tecnico_nome: '',
    horas_cliente: 0,
    kms_deslocacao: 0,
    tipo_horario: 'diurno',
    data_trabalho: new Date().toISOString().split('T')[0]
  });

  const [showCodigoModal, setShowCodigoModal] = useState(false);
  const [selectedTecnicoForCodigo, setSelectedTecnicoForCodigo] = useState(null);
  
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
    equipamento_ano_fabrico: '',
    descricao_problema: ''
  });

  // Intervenções no formulário de criação
  const [intervencoesForm, setIntervencoesForm] = useState([{
    id: Date.now(),
    data_intervencao: new Date().toISOString().split('T')[0],
    motivo_assistencia: '',
    relatorio_assistencia: ''
  }]);

  // Equipamentos
  const [equipamentos, setEquipamentos] = useState([]);
  
  // Equipamentos da OT
  const [equipamentosOT, setEquipamentosOT] = useState([]);
  const [showAddEquipamentoModal, setShowAddEquipamentoModal] = useState(false);
  const [equipamentoFormData, setEquipamentoFormData] = useState({
    tipologia: '',
    marca: '',
    modelo: '',
    numero_serie: '',
    ano_fabrico: ''
  });

  const [equipamentoSelecionado, setEquipamentoSelecionado] = useState('');
  const [modoNovoEquipamento, setModoNovoEquipamento] = useState(false);

  useEffect(() => {
    if (activeTab === 'clientes') {
      fetchClientes();
    } else if (activeTab === 'relatorios') {
      fetchRelatorios();
    } else if (activeTab === 'pesquisa') {
      fetchRelatorios(); // Carregar relatórios para filtrar
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
        equipamento_numero_serie: '',
        equipamento_ano_fabrico: ''
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
          equipamento_numero_serie: equipamento.numero_serie || '',
          equipamento_ano_fabrico: equipamento.ano_fabrico || ''
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
      toast.error(formatErrorMessage(error));
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
      toast.error(formatErrorMessage(error));
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
      toast.error(formatErrorMessage(error));
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
      equipamento_ano_fabrico: '',
      descricao_problema: ''
    });
    setEquipamentos([]);
    setEquipamentoSelecionado('');
    setModoNovoEquipamento(false);
    setIntervencoesForm([{
      id: Date.now(),
      data_intervencao: new Date().toISOString().split('T')[0],
      motivo_assistencia: '',
      relatorio_assistencia: ''
    }]);
  };

  const addIntervencaoForm = () => {
    setIntervencoesForm([...intervencoesForm, {
      id: Date.now(),
      data_intervencao: new Date().toISOString().split('T')[0],
      motivo_assistencia: '',
      relatorio_assistencia: ''
    }]);
  };

  const removeIntervencaoForm = (id) => {
    if (intervencoesForm.length > 1) {
      setIntervencoesForm(intervencoesForm.filter(i => i.id !== id));
    }
  };

  const updateIntervencaoForm = (id, field, value) => {
    setIntervencoesForm(intervencoesForm.map(i => 
      i.id === id ? { ...i, [field]: value } : i
    ));
  };

  const handleAddRelatorio = async (e) => {
    e.preventDefault();
    
    // Validar que pelo menos uma intervenção tem motivo preenchido
    const intervencoesValidas = intervencoesForm.filter(i => i.motivo_assistencia.trim());
    if (intervencoesValidas.length === 0) {
      toast.error('Adicione pelo menos um motivo de assistência');
      return;
    }
    
    try {
      // Criar o relatório técnico com motivo_assistencia da primeira intervenção
      const relatorioData = {
        ...relatorioFormData,
        motivo_assistencia: intervencoesValidas[0].motivo_assistencia
      };
      const response = await axios.post(`${API}/relatorios-tecnicos`, relatorioData);
      const relatorioId = response.data.id;
      
      // Criar as intervenções
      for (let i = 0; i < intervencoesValidas.length; i++) {
        const intervencao = intervencoesValidas[i];
        await axios.post(`${API}/relatorios-tecnicos/${relatorioId}/intervencoes`, {
          relatorio_id: relatorioId,
          data_intervencao: intervencao.data_intervencao,
          motivo_assistencia: intervencao.motivo_assistencia,
          relatorio_assistencia: intervencao.relatorio_assistencia || null,
          ordem: i
        });
      }
      
      toast.success('OT criada com sucesso!');
      setShowAddRelatorioModal(false);
      resetRelatorioForm();
      fetchRelatorios();
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const openViewRelatorioModal = async (relatorio) => {
    setSelectedRelatorio(relatorio);
    setShowViewRelatorioModal(true);
    // Buscar técnicos, intervenções, fotografias, assinatura, equipamentos, materiais, PCs, cronómetros e registos
    await fetchTecnicosRelatorio(relatorio.id);
    await fetchIntervencoesRelatorio(relatorio.id);
    await fetchFotografiasRelatorio(relatorio.id);
    await fetchAssinatura(relatorio.id);
    await fetchEquipamentosOT(relatorio.id);
    await fetchMateriais(relatorio.id);
    await fetchPedidosCotacao(relatorio.id);
    await fetchCronometros(relatorio.id);
    await fetchRegistosTecnicos(relatorio.id);
    await fetchAllSystemUsers(); // Buscar todos os utilizadores do sistema para cronómetros
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
      equipamento_ano_fabrico: relatorio.equipamento_ano_fabrico || ''
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
      toast.error(formatErrorMessage(error));
    }
  };

  const handleDeleteRelatorio = async () => {
    if (!relatorioToDelete) return;

    try {
      await axios.delete(`${API}/relatorios-tecnicos/${relatorioToDelete.id}`);
      toast.success('OT deletada com sucesso!');
      setShowDeleteRelatorioModal(false);
      setRelatorioToDelete(null);
      fetchRelatorios();
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const openStatusModal = (relatorio, e) => {
    if (e) e.stopPropagation();
    setSelectedStatusRelatorio(relatorio);
    setShowStatusModal(true);
  };

  const handleChangeStatus = async (newStatus) => {
    if (!selectedStatusRelatorio) return;

    try {
      await axios.put(`${API}/relatorios-tecnicos/${selectedStatusRelatorio.id}`, {
        status: newStatus
      });
      toast.success('Status atualizado com sucesso!');
      setShowStatusModal(false);
      setSelectedStatusRelatorio(null);
      fetchRelatorios();
    } catch (error) {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleStatusFilterChange = (status) => {
    setStatusFilter(status);
    if (status) {
      const filtered = relatorios.filter(r => r.status === status);
      setFilteredByStatus(filtered);
    } else {
      setFilteredByStatus([]);
    }
  };
  
  const fetchTecnicosRelatorio = async (relatorioId) => {
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos/${relatorioId}/tecnicos`);
      setTecnicos(response.data);
    } catch (error) {
      console.error('Erro ao carregar técnicos:', error);
      setTecnicos([]);
    }
  };

  const fetchUsuarios = async () => {
    try {
      console.log('Buscando usuários...');
      const response = await axios.get(`${API}/users`);
      console.log('Usuários recebidos:', response.data);
      setUsuarios(response.data);
      
      if (response.data.length === 0) {
        toast.warning('Nenhum usuário encontrado no sistema. Contacte o administrador.');
      }
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      toast.error('Erro ao carregar lista de técnicos');
      setUsuarios([]);
    }
  };

  const fetchIntervencoesRelatorio = async (relatorioId) => {
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos/${relatorioId}/intervencoes`);
      setIntervencoes(response.data);
    } catch (error) {
      console.error('Erro ao carregar intervenções:', error);
      setIntervencoes([]);
    }
  };

  const handleAddIntervencao = async (e) => {
    e.preventDefault();
    if (!selectedRelatorio) return;

    try {
      await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/intervencoes`, {
        ...intervencaoFormData,
        relatorio_id: selectedRelatorio.id,
        ordem: intervencoes.length
      });
      
      toast.success('Intervenção adicionada com sucesso!');
      setShowAddIntervencaoModal(false);
      setIntervencaoFormData({
        data_intervencao: new Date().toISOString().split('T')[0],
        motivo_assistencia: '',
        relatorio_assistencia: ''
      });
      fetchIntervencoesRelatorio(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const openEditIntervencaoModal = (intervencao) => {
    setSelectedIntervencao(intervencao);
    setIntervencaoFormData({
      data_intervencao: intervencao.data_intervencao.split('T')[0],
      motivo_assistencia: intervencao.motivo_assistencia,
      relatorio_assistencia: intervencao.relatorio_assistencia || ''
    });
    setShowEditIntervencaoModal(true);
  };

  const handleEditIntervencao = async (e) => {
    e.preventDefault();
    if (!selectedIntervencao || !selectedRelatorio) return;

    try {
      await axios.put(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/intervencoes/${selectedIntervencao.id}`,
        intervencaoFormData
      );
      
      toast.success('Intervenção atualizada com sucesso!');
      setShowEditIntervencaoModal(false);
      setSelectedIntervencao(null);
      fetchIntervencoesRelatorio(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const handleDeleteIntervencao = async (intervencaoId) => {
    if (!window.confirm('Tem certeza que deseja remover esta intervenção?')) return;

    try {
      await axios.delete(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/intervencoes/${intervencaoId}`);
      toast.success('Intervenção removida com sucesso!');
      fetchIntervencoesRelatorio(selectedRelatorio.id);
    } catch (error) {
      toast.error('Erro ao remover intervenção');
    }
  };

  const openAddTecnicoModal = () => {
    setShowAddTecnicoModal(true);
  };

  const calcularCodigoAutomatico = (dataTrabalho) => {
    const data = new Date(dataTrabalho + 'T12:00:00'); // Meio-dia para evitar problemas de timezone
    const diaSemana = data.getDay(); // 0 = Domingo, 6 = Sábado
    
    // Verificar se é domingo ou feriado
    if (diaSemana === 0) {
      return 'domingo_feriado'; // D
    }
    
    // Verificar se é sábado
    if (diaSemana === 6) {
      return 'sabado'; // S
    }
    
    // Dias úteis - por padrão usa horário diurno (1)
    return 'diurno'; // 1 (7h01-19h00)
  };

  const handleDataTrabalhoChange = (novaData) => {
    const codigoAuto = calcularCodigoAutomatico(novaData);
    setTecnicoFormData({
      ...tecnicoFormData,
      data_trabalho: novaData,
      tipo_horario: codigoAuto
    });
  };

  const openCodigoModal = (tecnico, e) => {
    if (e) e.stopPropagation();
    setSelectedTecnicoForCodigo(tecnico);
    setShowCodigoModal(true);
  };

  const handleChangeCodigo = async (novoCodigo) => {
    if (!selectedTecnicoForCodigo || !selectedRelatorio) return;

    try {
      await axios.put(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/tecnicos/${selectedTecnicoForCodigo.id}`,
        { tipo_horario: novoCodigo }
      );
      toast.success('Código atualizado com sucesso!');
      setShowCodigoModal(false);
      setSelectedTecnicoForCodigo(null);
      fetchTecnicosRelatorio(selectedRelatorio.id);
    } catch (error) {
      toast.error('Erro ao atualizar código');
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
      toast.error(formatErrorMessage(error));
    }
  };

  const openEditTecnicoModal = (tecnico) => {
    setSelectedTecnico(tecnico);
    setTecnicoFormData({
      tecnico_id: tecnico.tecnico_id || '',
      tecnico_nome: tecnico.tecnico_nome,
      horas_cliente: tecnico.horas_cliente,
      kms_deslocacao: tecnico.kms_deslocacao,
      tipo_horario: tecnico.tipo_horario,
      data_trabalho: tecnico.data_trabalho ? tecnico.data_trabalho.split('T')[0] : new Date().toISOString().split('T')[0]
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
      toast.error(formatErrorMessage(error));
    }
  };

  const resetTecnicoForm = () => {
    setTecnicoFormData({
      tecnico_id: '',
      tecnico_nome: '',
      horas_cliente: 0,
      kms_deslocacao: 0,
      tipo_horario: 'diurno',
      data_trabalho: new Date().toISOString().split('T')[0]
    });
  };


  // ========== Fotografias Functions ==========
  
  const fetchFotografiasRelatorio = async (relatorioId) => {
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos/${relatorioId}/fotografias`);
      setFotografias(response.data);
    } catch (error) {
      console.error('Erro ao buscar fotografias:', error);
      toast.error('Erro ao carregar fotografias');
    }
  };

  const openAddFotoModal = () => {
    setFotoFile(null);
    setFotoDescricao('');
    setShowAddFotoModal(true);
  };

  // Função para comprimir imagem antes do upload
  const compressImage = (file, maxWidth = 1200, maxHeight = 1200, quality = 0.7) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Redimensionar mantendo proporção
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Converter para blob comprimido
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                reject(new Error('Erro ao comprimir imagem'));
              }
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = () => reject(new Error('Erro ao carregar imagem'));
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    });
  };

  const handleFotoFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validar tipo de arquivo
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Tipo de arquivo não permitido. Use: JPG, PNG, GIF, WEBP');
        return;
      }
      // Validar tamanho (máximo 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Arquivo muito grande. Tamanho máximo: 10MB');
        return;
      }
      
      // Comprimir imagem se for maior que 500KB
      if (file.size > 500 * 1024) {
        try {
          toast.info('A comprimir imagem...');
          const compressedFile = await compressImage(file, 1200, 1200, 0.7);
          const savedPercent = Math.round((1 - compressedFile.size / file.size) * 100);
          toast.success(`Imagem comprimida! Redução de ${savedPercent}%`);
          setFotoFile(compressedFile);
        } catch (error) {
          console.error('Erro ao comprimir:', error);
          // Se falhar compressão, usa original
          setFotoFile(file);
        }
      } else {
        setFotoFile(file);
      }
    }
  };

  const handleUploadFoto = async (e) => {
    e.preventDefault();
    
    if (!fotoFile) {
      toast.error('Selecione uma fotografia');
      return;
    }
    
    // Capturar valor diretamente do textarea para evitar problemas com estado
    const descricaoElement = document.getElementById('foto_descricao');
    const descricao = descricaoElement ? descricaoElement.value.trim() : fotoDescricao.trim();
    
    if (!descricao) {
      toast.error('Adicione uma descrição para a fotografia');
      return;
    }
    
    setUploadingFoto(true);
    
    try {
      const formData = new FormData();
      formData.append('file', fotoFile);
      formData.append('descricao', descricao);
      
      await axios.post(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/fotografias`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      
      toast.success('Fotografia adicionada com sucesso!');
      setShowAddFotoModal(false);
      setFotoFile(null);
      setFotoDescricao('');
      fetchFotografiasRelatorio(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setUploadingFoto(false);
    }
  };

  const handleDeleteFoto = async (fotoId) => {
    console.log('handleDeleteFoto chamado com ID:', fotoId);
    console.log('selectedRelatorio:', selectedRelatorio);
    
    try {
      console.log('Tentando deletar foto...');
      const url = `${API}/relatorios-tecnicos/${selectedRelatorio.id}/fotografias/${fotoId}`;
      console.log('URL:', url);
      
      await axios.delete(url);
      console.log('Foto deletada com sucesso!');
      toast.success('Fotografia removida com sucesso!');
      fetchFotografiasRelatorio(selectedRelatorio.id);
    } catch (error) {
      console.error('Erro ao deletar foto:', error);
      toast.error(formatErrorMessage(error));
    }
  };

  // ========== Equipamentos OT Functions ==========
  
  const fetchEquipamentosOT = async (relatorioId) => {
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos/${relatorioId}/equipamentos`);
      setEquipamentosOT(response.data);
    } catch (error) {
      console.error('Erro ao buscar equipamentos:', error);
    }
  };

  const handleAddEquipamento = async (e) => {
    e.preventDefault();
    
    try {
      await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/equipamentos`, equipamentoFormData);
      toast.success('Equipamento adicionado!');
      setShowAddEquipamentoModal(false);
      setEquipamentoFormData({
        tipologia: '',
        marca: '',
        modelo: '',
        numero_serie: '',
        ano_fabrico: ''
      });
      fetchEquipamentosOT(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const handleDeleteEquipamento = async (equipId) => {
    try {
      await axios.delete(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/equipamentos/${equipId}`);
      toast.success('Equipamento removido!');
      fetchEquipamentosOT(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  // ========== Material OT Functions ==========

  const fetchMateriais = async (relatorioId) => {
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos/${relatorioId}/materiais`);
      setMateriais(response.data);
    } catch (error) {
      console.error('Erro ao buscar materiais:', error);
    }
  };

  const handleAddMaterial = async (e) => {
    e.preventDefault();
    
    try {
      await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/materiais`, materialFormData);
      toast.success('Material adicionado!');
      fetchMateriais(selectedRelatorio.id);
      setShowAddMaterialModal(false);
      setMaterialFormData({ descricao: '', quantidade: 1, fornecido_por: 'Cliente' });
      
      // Se foi marcado como "Cotação", atualizar lista de PCs
      if (materialFormData.fornecido_por === 'Cotação') {
        fetchPedidosCotacao(selectedRelatorio.id);
      }
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const handleUpdateMaterial = async (e) => {
    e.preventDefault();
    
    try {
      await axios.put(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/materiais/${selectedMaterial.id}`,
        materialFormData
      );
      toast.success('Material atualizado!');
      fetchMateriais(selectedRelatorio.id);
      setShowEditMaterialModal(false);
      setSelectedMaterial(null);
      
      if (materialFormData.fornecido_por === 'Cotação') {
        fetchPedidosCotacao(selectedRelatorio.id);
      }
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const handleDeleteMaterial = async (materialId) => {
    try {
      await axios.delete(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/materiais/${materialId}`);
      toast.success('Material removido!');
      fetchMateriais(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const openEditMaterialModal = (material) => {
    setSelectedMaterial(material);
    setMaterialFormData({
      descricao: material.descricao,
      quantidade: material.quantidade,
      fornecido_por: material.fornecido_por
    });
    setShowEditMaterialModal(true);
  };

  // ========== Pedidos de Cotação Functions ==========

  const fetchPedidosCotacao = async (relatorioId) => {
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos/${relatorioId}/pedidos-cotacao`);
      setPedidosCotacao(response.data);
    } catch (error) {
      console.error('Erro ao buscar PCs:', error);
    }
  };

  const fetchPCDetalhes = async (pcId) => {
    try {
      const response = await axios.get(`${API}/pedidos-cotacao/${pcId}`);
      setSelectedPC(response.data);
      setPCFormData({
        status: response.data.status,
        observacoes: response.data.observacoes || ''
      });
      setFotografiasPC(response.data.fotografias || []);
    } catch (error) {
      console.error('Erro ao buscar detalhes do PC:', error);
      toast.error('Erro ao carregar detalhes do PC');
    }
  };

  const handleUpdatePC = async () => {
    try {
      await axios.put(`${API}/pedidos-cotacao/${selectedPC.id}`, pcFormData);
      toast.success('PC atualizado!');
      fetchPedidosCotacao(selectedRelatorio.id);
      setShowPCModal(false);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  // Handler para upload de foto no PC com compressão
  const handleFotoPCFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validar tipo de arquivo
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Tipo de arquivo não permitido. Use: JPG, PNG, GIF, WEBP');
        return;
      }
      // Validar tamanho (máximo 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Arquivo muito grande. Tamanho máximo: 10MB');
        return;
      }
      
      // Comprimir imagem se for maior que 500KB
      if (file.size > 500 * 1024) {
        try {
          toast.info('A comprimir imagem...');
          const compressedFile = await compressImage(file, 1200, 1200, 0.7);
          const savedPercent = Math.round((1 - compressedFile.size / file.size) * 100);
          toast.success(`Imagem comprimida! Redução de ${savedPercent}%`);
          setFotoPCFile(compressedFile);
        } catch (error) {
          console.error('Erro ao comprimir:', error);
          setFotoPCFile(file);
        }
      } else {
        setFotoPCFile(file);
      }
    }
  };

  const handleUploadFotoPC = async (e) => {
    e.preventDefault();
    if (!fotoPCFile) {
      toast.error('Selecione uma imagem');
      return;
    }

    setUploadingFotoPC(true);
    try {
      const formData = new FormData();
      formData.append('file', fotoPCFile);
      formData.append('descricao', fotoPCDescricao);

      await axios.post(`${API}/pedidos-cotacao/${selectedPC.id}/fotografias`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Fotografia adicionada!');
      fetchPCDetalhes(selectedPC.id);
      setShowAddFotoPCModal(false);
      setFotoPCFile(null);
      setFotoPCDescricao('');
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setUploadingFotoPC(false);
    }
  };

  const handleDeleteFotoPC = async (fotoId) => {
    try {
      await axios.delete(`${API}/pedidos-cotacao/${selectedPC.id}/fotografias/${fotoId}`);
      toast.success('Fotografia removida!');
      fetchPCDetalhes(selectedPC.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const handleDownloadPDFPC = async (pcId) => {
    try {
      const response = await axios.get(`${API}/pedidos-cotacao/${pcId}/preview-pdf`, {
        responseType: 'blob'
      });
      
      const pc = pedidosCotacao.find(p => p.id === pcId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `PC_${pc?.numero_pc || pcId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('PDF baixado com sucesso!');
    } catch (error) {
      toast.error('Erro ao baixar PDF');
    }
  };

  const handleSendEmailPC = async (email) => {
    setSendingEmailPC(true);
    try {
      await axios.post(`${API}/pedidos-cotacao/${selectedPC.id}/send-email?email_destinatario=${email}`);
      toast.success(`Email enviado para ${email}`);
      setShowEmailPCModal(false);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setSendingEmailPC(false);
    }
  };

  const fetchAllPCs = async () => {
    setLoadingPCs(true);
    try {
      const response = await axios.get(`${API}/pedidos-cotacao`);
      setAllPCs(response.data);
    } catch (error) {
      console.error('Erro ao buscar todos os PCs:', error);
      toast.error('Erro ao carregar Pedidos de Cotação');
    } finally {
      setLoadingPCs(false);
    }
  };

  const openPCFromList = async (pc) => {
    await fetchPCDetalhes(pc.id);
    setShowPCModal(true);
  };

  // ========== Assinatura Functions ==========
  
  const fetchAssinatura = async (relatorioId) => {
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos/${relatorioId}/assinatura`);
      setAssinatura(response.data);
    } catch (error) {
      console.error('Erro ao buscar assinatura:', error);
    }
  };

  // ========== Fetch All System Users (para Cronómetros) ==========
  
  const fetchAllSystemUsers = async () => {
    try {
      const response = await axios.get(`${API}/admin/users`);
      setAllSystemUsers(response.data);
    } catch (error) {
      console.error('Erro ao buscar utilizadores do sistema:', error);
      // Fallback para utilizadores da OT se não tiver permissão admin
      setAllSystemUsers([]);
    }
  };

  // ========== Cronómetro Functions ==========

  const fetchCronometros = async (relatorioId) => {
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos/${relatorioId}/cronometros`);
      setCronometrosAtivos(response.data);
      
      // Iniciar timers para cronómetros ativos
      const newTimers = {};
      response.data.forEach(crono => {
        const horaInicio = new Date(crono.hora_inicio);
        const agora = new Date();
        const diffMs = agora - horaInicio;
        newTimers[`${crono.tecnico_id}_${crono.tipo}`] = Math.floor(diffMs / 1000);
      });
      setTimers(newTimers);
    } catch (error) {
      console.error('Erro ao buscar cronómetros:', error);
    }
  };

  const fetchRegistosTecnicos = async (relatorioId) => {
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos/${relatorioId}/registos-tecnicos`);
      setRegistosTecnicos(response.data);
    } catch (error) {
      console.error('Erro ao buscar registos:', error);
    }
  };

  const handleIniciarCronometro = async (tecnico, tipo) => {
    try {
      await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/cronometro/iniciar`, {
        tipo,
        tecnico_id: tecnico.tecnico_id || tecnico.id,
        tecnico_nome: tecnico.tecnico_nome
      });
      
      toast.success(`Cronómetro de ${tipo} iniciado!`);
      fetchCronometros(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const handlePararCronometro = async (tecnico, tipo) => {
    try {
      const response = await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/cronometro/parar`, {
        tipo,
        tecnico_id: tecnico.tecnico_id || tecnico.id
      });
      
      toast.success(response.data.message);
      fetchCronometros(selectedRelatorio.id);
      fetchRegistosTecnicos(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const handleDeleteRegisto = async (registoId) => {
    try {
      await axios.delete(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/registos-tecnicos/${registoId}`);
      toast.success('Registo removido!');
      fetchRegistosTecnicos(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const openEditRegistoModal = (registo) => {
    setEditingRegisto(registo);
    setEditRegistoForm({
      horas_arredondadas: registo.horas_arredondadas || 0,
      km: registo.km || 0,
      codigo: registo.codigo || ''
    });
    setShowEditRegistoModal(true);
  };

  const handleUpdateRegisto = async () => {
    if (!editingRegisto) return;
    
    try {
      await axios.put(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/registos-tecnicos/${editingRegisto.id}`, {
        horas_arredondadas: parseFloat(editRegistoForm.horas_arredondadas),
        km: parseFloat(editRegistoForm.km),
        codigo: editRegistoForm.codigo
      });
      
      toast.success('Registo atualizado!');
      setShowEditRegistoModal(false);
      setEditingRegisto(null);
      fetchRegistosTecnicos(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const getCronometroStatus = (tecnico, tipo) => {
    return cronometrosAtivos.find(
      c => (c.tecnico_id === tecnico.tecnico_id || c.tecnico_id === tecnico.id) && c.tipo === tipo && c.ativo
    );
  };

  const formatTimer = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Atualizar timers a cada segundo
  useEffect(() => {
    if (cronometrosAtivos.length === 0) return;
    
    const interval = setInterval(() => {
      setTimers(prevTimers => {
        const newTimers = { ...prevTimers };
        Object.keys(newTimers).forEach(key => {
          newTimers[key] = newTimers[key] + 1;
        });
        return newTimers;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [cronometrosAtivos]);

  // ========== Assinatura Functions ==========

  const openAssinaturaModal = () => {
    setAssinaturaNome({ primeiro: '', ultimo: '' });
    setShowAssinaturaModal(true);
  };

  const clearCanvas = () => {
    if (assinaturaCanvas) {
      assinaturaCanvas.clear();
    }
  };

  const handleSaveAssinaturaDigital = async () => {
    if (!assinaturaCanvas || assinaturaCanvas.isEmpty()) {
      toast.error('Por favor, desenhe sua assinatura');
      return;
    }

    if (!assinaturaNome.primeiro.trim() || !assinaturaNome.ultimo.trim()) {
      toast.error('Por favor, preencha primeiro e último nome');
      return;
    }

    setUploadingAssinatura(true);

    try {
      // Converter canvas para blob
      const canvas = assinaturaCanvas.getCanvas();
      canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('file', blob, 'assinatura.png');
        formData.append('primeiro_nome', assinaturaNome.primeiro);
        formData.append('ultimo_nome', assinaturaNome.ultimo);

        try {
          await axios.post(
            `${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinatura-digital`,
            formData,
            {
              headers: {
                'Content-Type': 'multipart/form-data'
              }
            }
          );

          toast.success('Assinatura digital salva com sucesso!');
          setShowAssinaturaModal(false);
          fetchAssinatura(selectedRelatorio.id);
        } catch (error) {
          toast.error(formatErrorMessage(error));
        } finally {
          setUploadingAssinatura(false);
        }
      }, 'image/png');
    } catch (error) {
      toast.error('Erro ao processar assinatura');
      setUploadingAssinatura(false);
    }
  };

  const handleSaveAssinaturaManual = async () => {
    if (!assinaturaNome.primeiro.trim() || !assinaturaNome.ultimo.trim()) {
      toast.error('Por favor, preencha primeiro e último nome');
      return;
    }

    setUploadingAssinatura(true);

    try {
      const formData = new FormData();
      formData.append('primeiro_nome', assinaturaNome.primeiro);
      formData.append('ultimo_nome', assinaturaNome.ultimo);

      await axios.post(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinatura-manual`,
        formData
      );

      toast.success('Assinatura manual salva com sucesso!');
      setShowAssinaturaModal(false);
      fetchAssinatura(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setUploadingAssinatura(false);
    }
  };

  const handleDeleteAssinatura = async () => {
    try {
      await axios.delete(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinatura`);
      toast.success('Assinatura removida com sucesso!');
      setAssinatura(null);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };


  // ========== Email PDF Functions ==========
  
  const openEmailModal = async () => {
    // Buscar cliente para pegar todos os emails
    try {
      const response = await axios.get(`${API}/clientes/${selectedRelatorio.cliente_id}`);
      const cliente = response.data;
      
      const emails = [];
      if (cliente.email) {
        emails.push({ email: cliente.email, selected: true });
      }
      
      // Adicionar emails adicionais se existirem
      if (cliente.emails_adicionais) {
        const emailsList = cliente.emails_adicionais.split(/[;,]/).map(e => e.trim()).filter(e => e);
        emailsList.forEach(email => {
          emails.push({ email, selected: true });
        });
      }
      
      setEmailsCliente(emails);
      setEmailsAdicionais('');
      setShowEmailModal(true);
    } catch (error) {
      toast.error('Erro ao carregar emails do cliente');
    }
  };

  const handleSendEmail = async () => {
    // Coletar emails selecionados
    const emailsSelecionados = emailsCliente.filter(e => e.selected).map(e => e.email);
    
    // Adicionar emails adicionais
    if (emailsAdicionais.trim()) {
      const emailsExtras = emailsAdicionais.split(/[;,]/).map(e => e.trim()).filter(e => e);
      emailsSelecionados.push(...emailsExtras);
    }
    
    if (emailsSelecionados.length === 0) {
      toast.error('Selecione pelo menos um email');
      return;
    }
    
    setSendingEmail(true);
    
    try {
      const response = await axios.post(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/enviar-pdf`,
        { emails: emailsSelecionados }
      );
      
      const { emails_enviados, emails_falhados } = response.data;
      
      if (emails_falhados && emails_falhados.length > 0) {
        toast.warning(`PDF enviado para ${emails_enviados.length} email(s). ${emails_falhados.length} falharam.`);
      } else {
        toast.success(`PDF enviado com sucesso para ${emails_enviados.length} email(s)!`);
      }
      
      setShowEmailModal(false);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setSendingEmail(false);
    }
  };

  const toggleEmailSelection = (index) => {
    const novosEmails = [...emailsCliente];
    novosEmails[index].selected = !novosEmails[index].selected;
    setEmailsCliente(novosEmails);
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
      'orcamento': 'text-amber-400 bg-amber-500/10',
      'em_execucao': 'text-blue-400 bg-blue-500/10',
      'em_andamento': 'text-blue-400 bg-blue-500/10', // Backward compatibility
      'concluido': 'text-green-400 bg-green-500/10',
      'facturado': 'text-purple-400 bg-purple-500/10'
    };
    return colors[status] || 'text-gray-400 bg-gray-500/10';
  };

  const getStatusLabel = (status) => {
    const labels = {
      'orcamento': 'Orçamento',
      'em_execucao': 'Em Execução',
      'em_andamento': 'Em Execução', // Backward compatibility
      'concluido': 'Concluído',
      'facturado': 'Facturado'
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
            <button
              onClick={() => setActiveTab('pesquisa')}
              className={`px-4 py-3 font-semibold transition ${
                activeTab === 'pesquisa'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Search className="w-4 h-4 inline mr-2" />
              Pesquisa por Estado
            </button>
            <button
              onClick={() => {
                setActiveTab('pedidos-cotacao');
                fetchAllPCs();
              }}
              className={`px-4 py-3 font-semibold transition ${
                activeTab === 'pedidos-cotacao'
                  ? 'text-yellow-400 border-b-2 border-yellow-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-2" />
              Pedidos de Cotação
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
                        <span 
                          className={`text-xs px-2 py-1 rounded cursor-pointer hover:opacity-80 transition ${getStatusColor(relatorio.status)}`}
                          onClick={(e) => openStatusModal(relatorio, e)}
                          title="Clique para alterar status"
                        >
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

        {/* Pesquisa por Estado Section */}
        {activeTab === 'pesquisa' && (
        <div className="glass-effect p-6 rounded-xl">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">Pesquisa por Estado</h2>
            
            {/* Status Dropdown */}
            <div className="max-w-md">
              <Label className="text-gray-300 mb-2 block">Selecione o Estado</Label>
              <select
                value={statusFilter}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Selecione um estado --</option>
                <option value="orcamento">🟡 Orçamento</option>
                <option value="em_execucao">🔵 Em Execução</option>
                <option value="concluido">🟢 Concluído</option>
                <option value="facturado">🟣 Facturado</option>
              </select>
            </div>
          </div>

          {/* Results */}
          {statusFilter && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold">
                  Resultados: {filteredByStatus.length} OT(s) com status "{getStatusLabel(statusFilter)}"
                </h3>
              </div>

              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="text-gray-400 mt-4">A carregar...</p>
                </div>
              ) : filteredByStatus.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg">Nenhuma OT encontrada com este estado</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredByStatus.map((relatorio) => (
                    <div
                      key={relatorio.id}
                      className="bg-[#0f0f0f] border border-gray-700 rounded-lg p-4 hover:border-blue-500 transition cursor-pointer"
                      onClick={() => openViewRelatorioModal(relatorio)}
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="cursor-pointer flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-blue-400 font-bold text-lg">
                              #{relatorio.numero_assistencia}
                            </span>
                            <span 
                              className={`text-xs px-2 py-1 rounded cursor-pointer hover:opacity-80 transition ${getStatusColor(relatorio.status)}`}
                              onClick={(e) => openStatusModal(relatorio, e)}
                              title="Clique para alterar status"
                            >
                              {getStatusLabel(relatorio.status)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-400">
                            {new Date(relatorio.data_servico).toLocaleDateString('pt-PT')}
                          </p>
                        </div>
                        
                        <div className="flex gap-1">
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditRelatorioModal(relatorio);
                            }}
                            variant="outline"
                            size="sm"
                            className="border-gray-600 hover:border-blue-500 hover:bg-blue-500/10 p-2"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          
                          {user?.is_admin && (
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRelatorioToDelete(relatorio);
                                setShowDeleteRelatorioModal(true);
                              }}
                              variant="outline"
                              size="sm"
                              className="border-gray-600 hover:border-red-500 hover:bg-red-500/10 p-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Cliente */}
                      <div className="mb-3 pb-3 border-b border-gray-700">
                        <p className="text-xs text-gray-500 mb-1">Cliente</p>
                        <p className="text-white font-medium">{relatorio.cliente_nome}</p>
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
                        <span>{relatorio.cliente_nome}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!statusFilter && (
            <div className="text-center py-12">
              <Search className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg">Selecione um estado para pesquisar</p>
            </div>
          )}
        </div>
        )}

        {/* Pedidos de Cotação Section */}
        {activeTab === 'pedidos-cotacao' && (
        <div className="glass-effect p-6 rounded-xl">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <FileText className="w-6 h-6 text-yellow-400" />
            Pedidos de Cotação
          </h2>

          {loadingPCs ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400 mx-auto"></div>
              <p className="text-gray-400 mt-4">Carregando...</p>
            </div>
          ) : allPCs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg">Nenhum Pedido de Cotação encontrado</p>
              <p className="text-gray-500 text-sm mt-2">
                PCs são criados automaticamente quando adiciona material com "Fornecido Por: Cotação" a uma OT
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allPCs.map((pc) => (
                <div
                  key={pc.id}
                  className="bg-[#0f0f0f] border border-gray-700 rounded-lg p-5 hover:border-yellow-500 transition cursor-pointer"
                  onClick={() => openPCFromList(pc)}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="w-5 h-5 text-yellow-400" />
                        <span className="text-yellow-400 font-bold text-lg">
                          {pc.numero_pc}
                        </span>
                      </div>
                      <span 
                        className={`text-xs px-2 py-1 rounded inline-block ${
                          pc.status === 'Em Espera' ? 'bg-gray-600/20 text-gray-400' :
                          pc.status === 'Cotação Pedida' ? 'bg-yellow-600/20 text-yellow-400' :
                          pc.status === 'A Caminho' ? 'bg-blue-600/20 text-blue-400' :
                          'bg-green-600/20 text-green-400'
                        }`}
                      >
                        {pc.status}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>

                  {/* Info */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-300">
                      <FileText className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-400">OT:</span>
                      <span className="text-white font-medium">{pc.ot_numero}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-gray-300">
                      <User className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-400">Cliente:</span>
                      <span className="text-white">{pc.cliente_nome}</span>
                    </div>

                    <div className="flex items-center gap-2 text-gray-300">
                      <Package className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-400">Materiais:</span>
                      <span className="text-white font-medium">{pc.materiais_count || 0}</span>
                    </div>

                    <div className="flex items-center gap-2 text-gray-300">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-400">Criado:</span>
                      <span className="text-white text-xs">
                        {new Date(pc.created_at).toLocaleDateString('pt-PT')}
                      </span>
                    </div>
                  </div>

                  {/* Actions Preview */}
                  <div className="flex gap-2 mt-4 pt-3 border-t border-gray-700">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadPDFPC(pc.id);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded transition text-sm"
                    >
                      <Download className="w-4 h-4" />
                      PDF
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        fetchPCDetalhes(pc.id);
                        setShowEmailPCModal(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded transition text-sm"
                    >
                      <Send className="w-4 h-4" />
                      Email
                    </button>
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
                    Tipologia
                  </Label>
                  <Input
                    id="equipamento_tipologia"
                    value={relatorioFormData.equipamento_tipologia}
                    onChange={(e) => setRelatorioFormData({ ...relatorioFormData, equipamento_tipologia: e.target.value })}
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                    placeholder="Ex: Dobradora, Secadora"
                    disabled={equipamentoSelecionado && equipamentoSelecionado !== 'novo'}
                  />
                </div>

                <div>
                  <Label htmlFor="equipamento_marca" className="text-gray-300">
                    Marca
                  </Label>
                  <Input
                    id="equipamento_marca"
                    value={relatorioFormData.equipamento_marca}
                    onChange={(e) => setRelatorioFormData({ ...relatorioFormData, equipamento_marca: e.target.value })}
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                    disabled={equipamentoSelecionado && equipamentoSelecionado !== 'novo'}
                    placeholder="Ex: Kannegiesser"
                  />
                </div>

                <div>
                  <Label htmlFor="equipamento_modelo" className="text-gray-300">
                    Modelo
                  </Label>
                  <Input
                    id="equipamento_modelo"
                    value={relatorioFormData.equipamento_modelo}
                    onChange={(e) => setRelatorioFormData({ ...relatorioFormData, equipamento_modelo: e.target.value })}
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                    placeholder="Modelo do equipamento"
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

                <div>
                  <Label htmlFor="equipamento_ano_fabrico" className="text-gray-300">
                    Ano de Fabrico
                  </Label>
                  <Input
                    id="equipamento_ano_fabrico"
                    type="text"
                    value={relatorioFormData.equipamento_ano_fabrico}
                    onChange={(e) => setRelatorioFormData({ ...relatorioFormData, equipamento_ano_fabrico: e.target.value })}
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                    placeholder="Ex: 2020, 03/2020, 03-2020"
                    disabled={equipamentoSelecionado && equipamentoSelecionado !== 'novo'}
                  />
                </div>
              </div>
            </div>

            {/* Intervenções / Assistências */}
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-blue-400 font-semibold">Intervenções / Assistências</h3>
                <Button
                  type="button"
                  onClick={addIntervencaoForm}
                  size="sm"
                  className="bg-green-500 hover:bg-green-600"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar Intervenção
                </Button>
              </div>

              <div className="space-y-4">
                {intervencoesForm.map((intervencao, index) => (
                  <div key={intervencao.id} className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-white font-semibold">Intervenção {index + 1}</span>
                      {intervencoesForm.length > 1 && (
                        <Button
                          type="button"
                          onClick={() => removeIntervencaoForm(intervencao.id)}
                          variant="outline"
                          size="sm"
                          className="border-red-500 text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <Label className="text-gray-300">
                          Data da Intervenção *
                        </Label>
                        <Input
                          type="date"
                          value={intervencao.data_intervencao}
                          onChange={(e) => updateIntervencaoForm(intervencao.id, 'data_intervencao', e.target.value)}
                          className="bg-[#1a1a1a] border-gray-700 text-white"
                          required
                        />
                      </div>

                      <div>
                        <Label className="text-gray-300">
                          Motivo da Assistência *
                        </Label>
                        <textarea
                          value={intervencao.motivo_assistencia}
                          onChange={(e) => updateIntervencaoForm(intervencao.id, 'motivo_assistencia', e.target.value)}
                          className="w-full bg-[#1a1a1a] border border-gray-700 text-white rounded-md p-3 min-h-[80px]"
                          placeholder="Descreva o motivo da assistência..."
                          required
                        />
                      </div>

                      <div>
                        <Label className="text-gray-300">
                          Relatório de Assistência
                        </Label>
                        <textarea
                          value={intervencao.relatorio_assistencia}
                          onChange={(e) => updateIntervencaoForm(intervencao.id, 'relatorio_assistencia', e.target.value)}
                          className="w-full bg-[#1a1a1a] border border-gray-700 text-white rounded-md p-3 min-h-[100px]"
                          placeholder="Descreva o trabalho realizado (opcional)..."
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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

              {/* Mão de Obra / Cronómetros - Card Unificado */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-green-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-green-400 font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Mão de Obra / Deslocação
                  </h4>
                  <Button
                    onClick={() => openAddTecnicoModal()}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar Registo Manual
                  </Button>
                </div>

                {/* Cronómetros */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="text-white font-medium flex items-center gap-2">
                      <PlayCircle className="w-4 h-4 text-green-400" />
                      Cronómetros
                    </h5>
                    <div className="text-gray-400 text-xs">
                      Selecionados: {Object.values(selectedCronoUsers).filter(Boolean).length}/{allSystemUsers.length}{' '}
                      <button 
                        onClick={() => {
                          const all = {};
                          allSystemUsers.forEach(u => { all[u.id] = true; });
                          setSelectedCronoUsers(all);
                        }}
                        className="text-blue-400 hover:text-blue-300 ml-2"
                      >
                        Todos
                      </button>
                      {' | '}
                      <button 
                        onClick={() => setSelectedCronoUsers({})}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        Nenhum
                      </button>
                    </div>
                  </div>

                  {/* Botões de Trabalho e Viagem (Iniciar/Parar automático) */}
                  <div className="flex gap-3 mb-4">
                    {/* Botão Trabalho - alterna entre iniciar e parar */}
                    {(() => {
                      const selectedUsers = allSystemUsers.filter(u => selectedCronoUsers[u.id]);
                      const hasAnyActiveTrabalho = selectedUsers.some(u => getCronometroStatus(u, 'trabalho'));
                      
                      return (
                        <Button
                          onClick={async () => {
                            if (selectedUsers.length === 0) {
                              toast.error('Selecione pelo menos um técnico');
                              return;
                            }
                            for (const user of selectedUsers) {
                              const hasActive = getCronometroStatus(user, 'trabalho');
                              if (hasAnyActiveTrabalho) {
                                // Parar todos os ativos
                                if (hasActive) {
                                  await handlePararCronometro({
                                    id: user.id,
                                    tecnico_id: user.id,
                                    tecnico_nome: user.full_name || user.username
                                  }, 'trabalho');
                                }
                              } else {
                                // Iniciar para todos
                                if (!hasActive) {
                                  await handleIniciarCronometro({
                                    id: user.id,
                                    tecnico_id: user.id,
                                    tecnico_nome: user.full_name || user.username
                                  }, 'trabalho');
                                }
                              }
                            }
                          }}
                          className={`flex-1 ${hasAnyActiveTrabalho ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white`}
                          disabled={Object.values(selectedCronoUsers).filter(Boolean).length === 0}
                        >
                          {hasAnyActiveTrabalho ? (
                            <>
                              <StopCircle className="w-4 h-4 mr-2" />
                              Parar Trabalho
                            </>
                          ) : (
                            <>
                              <PlayCircle className="w-4 h-4 mr-2" />
                              Iniciar Trabalho
                            </>
                          )}
                        </Button>
                      );
                    })()}

                    {/* Botão Viagem - alterna entre iniciar e parar */}
                    {(() => {
                      const selectedUsers = allSystemUsers.filter(u => selectedCronoUsers[u.id]);
                      const hasAnyActiveViagem = selectedUsers.some(u => getCronometroStatus(u, 'viagem'));
                      
                      return (
                        <Button
                          onClick={async () => {
                            if (selectedUsers.length === 0) {
                              toast.error('Selecione pelo menos um técnico');
                              return;
                            }
                            for (const user of selectedUsers) {
                              const hasActive = getCronometroStatus(user, 'viagem');
                              if (hasAnyActiveViagem) {
                                // Parar todos os ativos
                                if (hasActive) {
                                  await handlePararCronometro({
                                    id: user.id,
                                    tecnico_id: user.id,
                                    tecnico_nome: user.full_name || user.username
                                  }, 'viagem');
                                }
                              } else {
                                // Iniciar para todos
                                if (!hasActive) {
                                  await handleIniciarCronometro({
                                    id: user.id,
                                    tecnico_id: user.id,
                                    tecnico_nome: user.full_name || user.username
                                  }, 'viagem');
                                }
                              }
                            }
                          }}
                          className={`flex-1 ${hasAnyActiveViagem ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                          disabled={Object.values(selectedCronoUsers).filter(Boolean).length === 0}
                        >
                          {hasAnyActiveViagem ? (
                            <>
                              <StopCircle className="w-4 h-4 mr-2" />
                              Parar Viagem
                            </>
                          ) : (
                            <>
                              <Car className="w-4 h-4 mr-2" />
                              Iniciar Viagem
                            </>
                          )}
                        </Button>
                      );
                    })()}
                  </div>

                  {/* Lista de Técnicos */}
                  {allSystemUsers.length > 0 ? (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {allSystemUsers.map((userItem) => {
                        const cronoTrabalho = getCronometroStatus(userItem, 'trabalho');
                        const cronoViagem = getCronometroStatus(userItem, 'viagem');
                        const timerKeyTrabalho = `${userItem.id}_trabalho`;
                        const timerKeyViagem = `${userItem.id}_viagem`;

                        return (
                          <div key={userItem.id} className="flex items-center justify-between bg-gray-800/50 p-2 rounded-lg border border-gray-700">
                            <div className="flex items-center gap-2">
                              <input 
                                type="checkbox" 
                                checked={selectedCronoUsers[userItem.id] || false}
                                onChange={(e) => {
                                  setSelectedCronoUsers(prev => ({
                                    ...prev,
                                    [userItem.id]: e.target.checked
                                  }));
                                }}
                                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500"
                              />
                              <User className="w-4 h-4 text-gray-400" />
                              <span className="text-white text-sm">{userItem.full_name || userItem.username}</span>
                              {userItem.is_admin && (
                                <span className="text-orange-400 text-xs">(Admin)</span>
                              )}
                            </div>

                            {/* Indicadores de cronómetros ativos */}
                            <div className="flex items-center gap-2">
                              {cronoTrabalho && (
                                <span className="flex items-center gap-1 text-green-400 font-mono text-xs bg-green-900/30 px-2 py-1 rounded">
                                  <PlayCircle className="w-3 h-3" />
                                  {formatTimer(timers[timerKeyTrabalho] || 0)}
                                </span>
                              )}
                              {cronoViagem && (
                                <span className="flex items-center gap-1 text-blue-400 font-mono text-xs bg-blue-900/30 px-2 py-1 rounded">
                                  <Car className="w-3 h-3" />
                                  {formatTimer(timers[timerKeyViagem] || 0)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm text-center py-2">Nenhum utilizador registado</p>
                  )}
                </div>

                {/* Separador */}
                <div className="border-t border-gray-700 my-4"></div>

                {/* Tabela de Registos (Manuais + Automáticos do Cronómetro) */}
                <div>
                  <h5 className="text-white font-medium flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-blue-400" />
                    Registos de Mão de Obra
                  </h5>

                  {(tecnicos.length > 0 || registosTecnicos.length > 0) ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="text-left py-2 px-2 text-gray-400">Técnico</th>
                            <th className="text-center py-2 px-2 text-gray-400">Tipo</th>
                            <th className="text-center py-2 px-2 text-gray-400">Data</th>
                            <th className="text-center py-2 px-2 text-gray-400">Horas</th>
                            <th className="text-center py-2 px-2 text-gray-400">KM</th>
                            <th className="text-center py-2 px-2 text-gray-400">Código</th>
                            <th className="text-center py-2 px-2 text-gray-400">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Registos Manuais (técnicos) */}
                          {tecnicos.map((tec) => (
                            <tr key={`manual-${tec.id}`} className="border-b border-gray-800 hover:bg-gray-800/50">
                              <td className="py-2 px-2 text-white">{tec.tecnico_nome}</td>
                              <td className="py-2 px-2 text-center">
                                <span className="px-2 py-1 rounded text-xs bg-gray-600/30 text-gray-300">Manual</span>
                              </td>
                              <td className="py-2 px-2 text-center text-gray-300">
                                {tec.data_trabalho ? new Date(tec.data_trabalho).toLocaleDateString('pt-PT') : '-'}
                              </td>
                              <td className="py-2 px-2 text-center text-white font-medium">{tec.horas_cliente}h</td>
                              <td className="py-2 px-2 text-center text-gray-300">{tec.kms_deslocacao * 2}</td>
                              <td className="py-2 px-2 text-center">
                                <span 
                                  className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded text-xs cursor-pointer hover:bg-blue-500/20"
                                  onClick={(e) => openCodigoModal(tec, e)}
                                >
                                  {getTipoHorarioCodigo(tec.tipo_horario)}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-center">
                                <Button
                                  onClick={() => openEditTecnicoModal(tec)}
                                  variant="ghost"
                                  size="sm"
                                  className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 p-1"
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                              </td>
                            </tr>
                          ))}

                          {/* Registos do Cronómetro (automáticos) */}
                          {registosTecnicos.map((reg) => (
                            <tr key={`crono-${reg.id}`} className="border-b border-gray-800 hover:bg-gray-800/50">
                              <td className="py-2 px-2 text-white">{reg.tecnico_nome}</td>
                              <td className="py-2 px-2 text-center">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  reg.tipo === 'trabalho' ? 'bg-green-600/20 text-green-400' : 'bg-blue-600/20 text-blue-400'
                                }`}>
                                  {reg.tipo === 'trabalho' ? 'Trabalho' : 'Viagem'}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-center text-gray-300">
                                {new Date(reg.data).toLocaleDateString('pt-PT')}
                              </td>
                              <td className="py-2 px-2 text-center text-white font-medium">{reg.horas_arredondadas}h</td>
                              <td className="py-2 px-2 text-center text-gray-300">{reg.km || 0}</td>
                              <td className="py-2 px-2 text-center">
                                <span className="font-mono text-purple-400">{reg.codigo}</span>
                              </td>
                              <td className="py-2 px-2 text-center flex items-center justify-center gap-1">
                                <Button
                                  onClick={() => openEditRegistoModal(reg)}
                                  variant="ghost"
                                  size="sm"
                                  className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 p-1"
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button
                                  onClick={() => handleDeleteRegisto(reg.id)}
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20 p-1"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <Users className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm">Nenhum registo de mão de obra</p>
                    </div>
                  )}
                </div>

                {/* Legenda Tipos de Trabalho */}
                <div className="mt-4 bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-3 font-semibold">Tipos de Trabalho:</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-600 text-white px-2 py-1 rounded font-mono font-bold text-xs">1</span>
                      <span className="text-white">Dias úteis (07h-19h)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-600 text-white px-2 py-1 rounded font-mono font-bold text-xs">2</span>
                      <span className="text-white">Dias úteis (19h-07h)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-600 text-white px-2 py-1 rounded font-mono font-bold text-xs">S</span>
                      <span className="text-white">Sábado</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-600 text-white px-2 py-1 rounded font-mono font-bold text-xs">D</span>
                      <span className="text-white">Domingos/Feriados</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Equipamentos */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-blue-400 font-semibold">Equipamentos</h4>
                  <Button
                    onClick={() => setShowAddEquipamentoModal(true)}
                    size="sm"
                    className="bg-blue-500 hover:bg-blue-600"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar Equipamento
                  </Button>
                </div>
                
                {/* Lista de Equipamentos */}
                <div className="space-y-2">
                  {/* Equipamento principal (da OT) */}
                  <div className="bg-black/30 p-3 rounded border border-gray-600">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{selectedRelatorio.equipamento_marca} - {selectedRelatorio.equipamento_tipologia}</p>
                        <p className="text-gray-400 text-sm">Modelo: {selectedRelatorio.equipamento_modelo}</p>
                        {selectedRelatorio.equipamento_numero_serie && (
                          <p className="text-gray-400 text-xs">Série: {selectedRelatorio.equipamento_numero_serie}</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded">Principal</span>
                    </div>
                  </div>
                  
                  {/* Equipamentos adicionais */}
                  {equipamentosOT.map((equip) => (
                    <div key={equip.id} className="bg-black/30 p-3 rounded border border-blue-500/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">{equip.marca} - {equip.tipologia}</p>
                          <p className="text-gray-400 text-sm">Modelo: {equip.modelo}</p>
                          {equip.numero_serie && (
                            <p className="text-gray-400 text-xs">Série: {equip.numero_serie}</p>
                          )}
                          {equip.ano_fabrico && (
                            <p className="text-gray-400 text-xs">Ano: {equip.ano_fabrico}</p>
                          )}
                        </div>
                        <Button
                          onClick={() => handleDeleteEquipamento(equip.id)}
                          size="sm"
                          variant="outline"
                          className="border-red-500 text-red-500 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Intervenções */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-blue-400 font-semibold flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Intervenções / Assistências
                  </h4>
                  <Button
                    onClick={() => setShowAddIntervencaoModal(true)}
                    size="sm"
                    className="bg-green-500 hover:bg-green-600"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar Intervenção
                  </Button>
                </div>

                {intervencoes.length > 0 ? (
                  <div className="space-y-3">
                    {intervencoes.map((intervencao) => (
                      <div key={intervencao.id} className="bg-[#1a1a1a] p-4 rounded border border-gray-700">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-400" />
                            <span className="text-white font-semibold">
                              {new Date(intervencao.data_intervencao).toLocaleDateString('pt-PT')}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              onClick={() => openEditIntervencaoModal(intervencao)}
                              variant="outline"
                              size="sm"
                              className="border-gray-600 hover:border-blue-500 hover:bg-blue-500/10 p-2"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              onClick={() => handleDeleteIntervencao(intervencao.id)}
                              variant="outline"
                              size="sm"
                              className="border-gray-600 hover:border-red-500 hover:bg-red-500/10 p-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Motivo:</p>
                            <p className="text-gray-300 text-sm">{intervencao.motivo_assistencia}</p>
                          </div>
                          
                          {intervencao.relatorio_assistencia && (
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Relatório:</p>
                              <p className="text-gray-300 text-sm whitespace-pre-wrap">
                                {intervencao.relatorio_assistencia}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">Nenhuma intervenção registada</p>
                  </div>
                )}
              </div>

              {/* Componentes Adicionais (Fotografias) */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-blue-400 font-semibold flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Componentes Adicionais
                  </h4>
                  <Button
                    onClick={() => openAddFotoModal()}
                    size="sm"
                    className="bg-blue-500 hover:bg-blue-600"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar Componentes
                  </Button>
                </div>

                {/* Galeria de Fotografias */}
                {fotografias.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {fotografias.map((foto) => (
                      <div key={foto.id} className="bg-black/30 rounded-lg overflow-hidden border border-gray-700 hover:border-blue-500/50 transition">
                        {/* Imagem */}
                        <div className="relative aspect-video bg-gray-800">
                          <img
                            src={`${API}${foto.foto_url}`}
                            alt={foto.descricao || 'Fotografia'}
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => window.open(`${API}${foto.foto_url}`, '_blank')}
                            onError={(e) => {
                              console.log('Erro ao carregar imagem:', `${API}${foto.foto_url}`);
                              console.log('Foto objeto:', foto);
                              e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23333" width="100" height="100"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ESem Imagem%3C/text%3E%3C/svg%3E';
                            }}
                            onLoad={() => console.log('Imagem carregada com sucesso:', foto.foto_url)}
                            title="Clique para ampliar"
                          />
                          {/* Botão de remover */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFoto(foto.id);
                            }}
                            className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-600 text-white p-1.5 rounded-full transition"
                            title="Remover fotografia"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {/* Descrição */}
                        <div className="p-3">
                          <p className="text-sm text-gray-300">
                            {foto.descricao || 'Sem descrição'}
                          </p>
                          <p className="text-xs text-gray-500 mt-2">
                            {new Date(foto.uploaded_at).toLocaleString('pt-PT')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <ImageIcon className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">Nenhuma fotografia adicionada</p>
                    <p className="text-gray-500 text-xs mt-1">Clique em "Adicionar Componentes" para começar</p>
                  </div>
                )}
              </div>

              {/* Material */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-blue-400 font-semibold flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Material
                  </h4>
                  <Button
                    onClick={() => setShowAddMaterialModal(true)}
                    size="sm"
                    className="bg-blue-500 hover:bg-blue-600"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar Material
                  </Button>
                </div>

                {materiais.length > 0 ? (
                  <div className="space-y-2">
                    {materiais.map((material) => (
                      <div
                        key={material.id}
                        className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700"
                      >
                        <div className="flex-1">
                          <p className="text-white font-medium">{material.descricao}</p>
                          <div className="flex gap-4 mt-1 text-sm text-gray-400">
                            <span>Qtd: {material.quantidade}</span>
                            <span className={`px-2 py-0.5 rounded ${
                              material.fornecido_por === 'Cliente' ? 'bg-green-600/20 text-green-400' :
                              material.fornecido_por === 'HWI' ? 'bg-blue-600/20 text-blue-400' :
                              'bg-yellow-600/20 text-yellow-400'
                            }`}>
                              {material.fornecido_por}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => openEditMaterialModal(material)}
                            size="sm"
                            variant="outline"
                            className="border-blue-500 text-blue-500"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => handleDeleteMaterial(material.id)}
                            size="sm"
                            variant="outline"
                            className="border-red-500 text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm text-center py-4">
                    Nenhum material adicionado
                  </p>
                )}
              </div>

              {/* Pedidos de Cotação */}
              {pedidosCotacao.length > 0 && (
                <div className="bg-[#0f0f0f] p-4 rounded-lg border border-yellow-600">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-yellow-400 font-semibold flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Pedidos de Cotação ({pedidosCotacao.length})
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {pedidosCotacao.map((pc) => (
                      <div
                        key={pc.id}
                        onClick={() => {
                          fetchPCDetalhes(pc.id);
                          setShowPCModal(true);
                        }}
                        className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700 hover:border-yellow-600 cursor-pointer transition-colors"
                      >
                        <div>
                          <p className="text-white font-medium">{pc.numero_pc}</p>
                          <p className="text-sm text-gray-400">
                            Status: <span className={`px-2 py-0.5 rounded ${
                              pc.status === 'Em Espera' ? 'bg-gray-600/20 text-gray-400' :
                              pc.status === 'Cotação Pedida' ? 'bg-yellow-600/20 text-yellow-400' :
                              pc.status === 'A Caminho' ? 'bg-blue-600/20 text-blue-400' :
                              'bg-green-600/20 text-green-400'
                            }`}>{pc.status}</span>
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Assinatura */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-blue-400 font-semibold flex items-center gap-2">
                    <PenTool className="w-4 h-4" />
                    Assinatura do Cliente
                  </h4>
                  {!assinatura ? (
                    <Button
                      onClick={() => openAssinaturaModal()}
                      size="sm"
                      className="bg-green-500 hover:bg-green-600"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Adicionar Assinatura
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleDeleteAssinatura()}
                      size="sm"
                      variant="outline"
                      className="border-red-500 text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Remover Assinatura
                    </Button>
                  )}
                </div>

                {assinatura ? (
                  <div className="bg-black/30 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-start gap-4">
                      {/* Assinatura Digital - Sempre mostrar se tiver URL */}
                      {assinatura.assinatura_url && (
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 mb-2">
                            {assinatura.tipo === 'digital' ? 'Assinatura Digital:' : 'Assinatura:'}
                          </p>
                          <div className="bg-white p-3 rounded border-2 border-gray-300">
                            <img
                              src={`${API}${assinatura.assinatura_url}`}
                              alt="Assinatura"
                              className="max-h-40 w-full object-contain"
                              onError={(e) => {
                                console.log('Erro ao carregar assinatura:', `${API}${assinatura.assinatura_url}`);
                                e.target.style.display = 'none';
                                e.target.parentElement.innerHTML = '<p class="text-gray-600 text-sm text-center py-4">Erro ao carregar imagem</p>';
                              }}
                              onLoad={() => console.log('✓ Assinatura carregada')}
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* Informações */}
                      <div className={assinatura.assinatura_url ? 'flex-1' : 'w-full'}>
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs text-gray-500">Tipo:</p>
                            <p className="text-white">
                              {assinatura.tipo === 'digital' ? 'Assinatura Digital' : 'Assinatura Manual'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Nome:</p>
                            <p className="text-white font-semibold">
                              {assinatura.assinado_por || `${assinatura.primeiro_nome} ${assinatura.ultimo_nome}`}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Data:</p>
                            <p className="text-gray-300">
                              {new Date(assinatura.data_assinatura).toLocaleString('pt-PT')}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <PenTool className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">OT ainda não assinada</p>
                    <p className="text-gray-500 text-xs mt-1">Clique em "Adicionar Assinatura" para o cliente assinar</p>
                  </div>
                )}
              </div>


              {/* Botões de Ação */}
              <div className="flex gap-4 justify-center pt-6">
                <Button
                  onClick={async () => {
                    try {
                      const response = await axios.get(
                        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/preview-pdf`,
                        { responseType: 'blob' }
                      );
                      
                      const blob = new Blob([response.data], { type: 'application/pdf' });
                      const url = window.URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `OT_${selectedRelatorio.numero_assistencia}.pdf`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      window.URL.revokeObjectURL(url);
                      
                      toast.success('PDF baixado com sucesso!');
                    } catch (error) {
                      toast.error('Erro ao baixar PDF');
                    }
                  }}
                  size="lg"
                  className="bg-red-600 hover:bg-red-700 text-white px-8 py-4"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Download PDF
                </Button>
                <Button
                  onClick={() => openEmailModal()}
                  size="lg"
                  className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white px-8 py-4"
                >
                  <Send className="w-5 h-5 mr-2" />
                  Enviar PDF por Email
                </Button>
              </div>


            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Intervenção Modal */}
      <Dialog open={showAddIntervencaoModal} onOpenChange={setShowAddIntervencaoModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Plus className="w-5 h-5 text-green-400" />
              Adicionar Intervenção
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddIntervencao} className="space-y-4 mt-4">
            <div>
              <Label htmlFor="data_intervencao" className="text-gray-300">
                Data da Intervenção *
              </Label>
              <Input
                id="data_intervencao"
                type="date"
                value={intervencaoFormData.data_intervencao}
                onChange={(e) => setIntervencaoFormData({ ...intervencaoFormData, data_intervencao: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                required
              />
            </div>

            <div>
              <Label htmlFor="motivo_assistencia" className="text-gray-300">
                Motivo da Assistência *
              </Label>
              <textarea
                id="motivo_assistencia"
                value={intervencaoFormData.motivo_assistencia}
                onChange={(e) => setIntervencaoFormData({ ...intervencaoFormData, motivo_assistencia: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3 min-h-[100px]"
                placeholder="Descreva o motivo da assistência..."
                required
              />
            </div>

            <div>
              <Label htmlFor="relatorio_assistencia" className="text-gray-300">
                Relatório de Assistência
              </Label>
              <p className="text-xs text-gray-500 mb-2">
                Descreva o trabalho realizado durante esta intervenção
              </p>
              <textarea
                id="relatorio_assistencia"
                value={intervencaoFormData.relatorio_assistencia}
                onChange={(e) => setIntervencaoFormData({ ...intervencaoFormData, relatorio_assistencia: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3 min-h-[150px]"
                placeholder="Ex: Substituição do motor principal, limpeza e lubrificação..."
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={() => {
                  setShowAddIntervencaoModal(false);
                  setIntervencaoFormData({
                    data_intervencao: new Date().toISOString().split('T')[0],
                    motivo_assistencia: '',
                    relatorio_assistencia: ''
                  });
                }}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1 bg-green-500 hover:bg-green-600">
                <Plus className="w-4 h-4 mr-2" />
                Adicionar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Intervenção Modal */}
      <Dialog open={showEditIntervencaoModal} onOpenChange={setShowEditIntervencaoModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Edit className="w-5 h-5 text-blue-400" />
              Editar Intervenção
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEditIntervencao} className="space-y-4 mt-4">
            <div>
              <Label htmlFor="edit_data_intervencao" className="text-gray-300">
                Data da Intervenção *
              </Label>
              <Input
                id="edit_data_intervencao"
                type="date"
                value={intervencaoFormData.data_intervencao}
                onChange={(e) => setIntervencaoFormData({ ...intervencaoFormData, data_intervencao: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                required
              />
            </div>

            <div>
              <Label htmlFor="edit_motivo_assistencia_int" className="text-gray-300">
                Motivo da Assistência *
              </Label>
              <textarea
                id="edit_motivo_assistencia_int"
                value={intervencaoFormData.motivo_assistencia}
                onChange={(e) => setIntervencaoFormData({ ...intervencaoFormData, motivo_assistencia: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3 min-h-[100px]"
                required
              />
            </div>

            <div>
              <Label htmlFor="edit_relatorio_assistencia_int" className="text-gray-300">
                Relatório de Assistência
              </Label>
              <textarea
                id="edit_relatorio_assistencia_int"
                value={intervencaoFormData.relatorio_assistencia}
                onChange={(e) => setIntervencaoFormData({ ...intervencaoFormData, relatorio_assistencia: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3 min-h-[150px]"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={() => {
                  setShowEditIntervencaoModal(false);
                  setSelectedIntervencao(null);
                }}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1 bg-blue-500 hover:bg-blue-600">
                <Edit className="w-4 h-4 mr-2" />
                Guardar
              </Button>
            </div>
          </form>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tecnico_nome" className="text-gray-300">
                  Nome do Técnico *
                </Label>
                <Input
                  id="tecnico_nome"
                  type="text"
                  value={tecnicoFormData.tecnico_nome}
                  onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, tecnico_nome: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Digite o nome do técnico"
                  required
                />
              </div>

              <div>
                <Label htmlFor="data_trabalho" className="text-gray-300">
                  Data do Trabalho *
                </Label>
                <Input
                  id="data_trabalho"
                  type="date"
                  value={tecnicoFormData.data_trabalho}
                  onChange={(e) => handleDataTrabalhoChange(e.target.value)}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Código calculado automaticamente: <span className="text-blue-400 font-semibold">{getTipoHorarioCodigo(tecnicoFormData.tipo_horario)}</span>
                </p>
              </div>
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
                  Será multiplicado por 2 (ida e volta)
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_tecnico_nome" className="text-gray-300">
                  Nome do Técnico *
                </Label>
                <Input
                  id="edit_tecnico_nome"
                  type="text"
                  value={tecnicoFormData.tecnico_nome}
                  onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, tecnico_nome: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Digite o nome do técnico"
                  required
                />
              </div>

              <div>
                <Label htmlFor="edit_data_trabalho" className="text-gray-300">
                  Data do Trabalho *
                </Label>
                <Input
                  id="edit_data_trabalho"
                  type="date"
                  value={tecnicoFormData.data_trabalho}
                  onChange={(e) => handleDataTrabalhoChange(e.target.value)}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Código: <span className="text-blue-400 font-semibold">{getTipoHorarioCodigo(tecnicoFormData.tipo_horario)}</span>
                </p>
              </div>
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
                  Será multiplicado por 2 (ida e volta)
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


      {/* Add Fotografia Modal */}
      <Dialog open={showAddFotoModal} onOpenChange={setShowAddFotoModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <ImageIcon className="w-5 h-5 text-blue-400" />
              Adicionar Fotografia
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleUploadFoto} className="space-y-4 mt-4">
            {/* Upload de arquivo */}
            <div>
              <Label htmlFor="foto_file" className="text-gray-300">
                Selecionar Fotografia *
              </Label>
              <Input
                id="foto_file"
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/heic,image/heif"
                onChange={handleFotoFileChange}
                className="bg-[#0f0f0f] border-gray-700 text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-500 file:text-white hover:file:bg-blue-600"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Formatos aceitos: JPG, PNG, GIF, WEBP, HEIC, HEIF (máximo 10MB)
              </p>
              {fotoFile && (
                <p className="text-sm text-green-400 mt-2">
                  ✓ {fotoFile.name} ({(fotoFile.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>

            {/* Preview da imagem */}
            {fotoFile && (
              <div className="bg-black/30 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-2">Pré-visualização:</p>
                <img
                  src={URL.createObjectURL(fotoFile)}
                  alt="Preview"
                  className="w-full max-h-64 object-contain rounded"
                />
              </div>
            )}

            {/* Descrição - usando ref para evitar re-renders em mobile */}
            <div>
              <Label htmlFor="foto_descricao" className="text-gray-300">
                Descrição / Observações *
              </Label>
              <textarea
                id="foto_descricao"
                defaultValue={fotoDescricao}
                onBlur={(e) => setFotoDescricao(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3 min-h-[100px]"
                placeholder="Descreva o componente ou situação na fotografia..."
                required
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={() => {
                  setShowAddFotoModal(false);
                  setFotoFile(null);
                  setFotoDescricao('');
                }}
                variant="outline"
                className="flex-1 border-gray-600"
                disabled={uploadingFoto}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-blue-500 hover:bg-blue-600"
                disabled={uploadingFoto}
              >
                {uploadingFoto ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Enviando...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Material Modal */}
      <Dialog open={showAddMaterialModal} onOpenChange={setShowAddMaterialModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Adicionar Material</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddMaterial} className="space-y-4">
            <div>
              <Label htmlFor="descricao_material" className="text-gray-300">Descrição do Material</Label>
              <Input
                id="descricao_material"
                value={materialFormData.descricao}
                onChange={(e) => setMaterialFormData({ ...materialFormData, descricao: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                required
              />
            </div>

            <div>
              <Label htmlFor="quantidade_material" className="text-gray-300">Quantidade</Label>
              <Input
                id="quantidade_material"
                type="number"
                min="1"
                value={materialFormData.quantidade}
                onChange={(e) => setMaterialFormData({ ...materialFormData, quantidade: parseInt(e.target.value) })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                required
              />
            </div>

            <div>
              <Label htmlFor="fornecido_por" className="text-gray-300">Fornecido Por</Label>
              <select
                id="fornecido_por"
                value={materialFormData.fornecido_por}
                onChange={(e) => setMaterialFormData({ ...materialFormData, fornecido_por: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2"
                required
              >
                <option value="Cliente">Cliente</option>
                <option value="HWI">HWI</option>
                <option value="Cotação">Cotação</option>
              </select>
            </div>

            {materialFormData.fornecido_por === 'Cotação' && (
              <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-3">
                <p className="text-yellow-400 text-sm">
                  ℹ️ Um Pedido de Cotação será criado automaticamente para este material
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={() => {
                  setShowAddMaterialModal(false);
                  setMaterialFormData({ descricao: '', quantidade: 1, fornecido_por: 'Cliente' });
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
                <Plus className="w-4 h-4 mr-1" />
                Adicionar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Material Modal */}
      <Dialog open={showEditMaterialModal} onOpenChange={setShowEditMaterialModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Editar Material</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateMaterial} className="space-y-4">
            <div>
              <Label htmlFor="edit_descricao_material" className="text-gray-300">Descrição do Material</Label>
              <Input
                id="edit_descricao_material"
                value={materialFormData.descricao}
                onChange={(e) => setMaterialFormData({ ...materialFormData, descricao: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                required
              />
            </div>

            <div>
              <Label htmlFor="edit_quantidade_material" className="text-gray-300">Quantidade</Label>
              <Input
                id="edit_quantidade_material"
                type="number"
                min="1"
                value={materialFormData.quantidade}
                onChange={(e) => setMaterialFormData({ ...materialFormData, quantidade: parseInt(e.target.value) })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                required
              />
            </div>

            <div>
              <Label htmlFor="edit_fornecido_por" className="text-gray-300">Fornecido Por</Label>
              <select
                id="edit_fornecido_por"
                value={materialFormData.fornecido_por}
                onChange={(e) => setMaterialFormData({ ...materialFormData, fornecido_por: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2"
                required
              >
                <option value="Cliente">Cliente</option>
                <option value="HWI">HWI</option>
                <option value="Cotação">Cotação</option>
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={() => {
                  setShowEditMaterialModal(false);
                  setSelectedMaterial(null);
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
                Salvar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* PC Modal */}
      <Dialog open={showPCModal} onOpenChange={(open) => {
        setShowPCModal(open);
        if (!open) {
          setSelectedPC(null);
          setFotografiasPC([]);
        }
      }}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-white">
              <span className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-yellow-400" />
                {selectedPC?.numero_pc} - Pedido de Cotação
              </span>
              <div className="flex gap-2">
                <Button
                  onClick={handleDownloadPDFPC.bind(null, selectedPC?.id)}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Download PDF
                </Button>
                <Button
                  onClick={() => setShowEmailPCModal(true)}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Send className="w-4 h-4 mr-1" />
                  Enviar Email
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedPC && (
            <div className="space-y-4 mt-4">
              {/* Informações da OT */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-blue-700">
                <h4 className="text-blue-400 font-semibold mb-3">Informações da Ordem de Trabalho</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Número OT:</span>
                    <span className="text-white ml-2 font-medium">#{selectedPC.numero_ot || selectedPC.ot_numero || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Cliente:</span>
                    <span className="text-white ml-2">{selectedPC.cliente_nome || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Dados da Máquina */}
              {(selectedPC.equipamento_tipologia || selectedPC.equipamento_marca || selectedPC.equipamento_modelo) && (
                <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                  <h4 className="text-yellow-400 font-semibold mb-3">Dados da Máquina</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Tipologia:</span>
                      <span className="text-white ml-2">{selectedPC.equipamento_tipologia || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Marca:</span>
                      <span className="text-white ml-2">{selectedPC.equipamento_marca || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Modelo:</span>
                      <span className="text-white ml-2">{selectedPC.equipamento_modelo || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Nº Série:</span>
                      <span className="text-white ml-2">{selectedPC.equipamento_numero_serie || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Status */}
              <div>
                <Label className="text-gray-300">Status do PC</Label>
                <select
                  value={pcFormData.status}
                  onChange={(e) => setPCFormData({ ...pcFormData, status: e.target.value })}
                  className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2 mt-1"
                >
                  <option value="Em Espera">Em Espera</option>
                  <option value="Cotação Pedida">Cotação Pedida</option>
                  <option value="A Caminho">A Caminho</option>
                  <option value="Em Armazém">Em Armazém</option>
                </select>
              </div>

              {/* Materiais */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <h4 className="text-blue-400 font-semibold mb-3">Material para Cotação</h4>
                {selectedPC.materiais?.length > 0 ? (
                  <div className="space-y-2">
                    {selectedPC.materiais.map((mat) => (
                      <div key={mat.id} className="flex justify-between p-2 bg-gray-800 rounded">
                        <span className="text-white">{mat.descricao}</span>
                        <span className="text-gray-400">Qtd: {mat.quantidade}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">Nenhum material associado</p>
                )}
              </div>

              {/* Fotografias */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-blue-400 font-semibold">Fotografias</h4>
                  <Button
                    onClick={() => setShowAddFotoPCModal(true)}
                    size="sm"
                    className="bg-blue-500 hover:bg-blue-600"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar Foto
                  </Button>
                </div>

                {fotografiasPC.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {fotografiasPC.map((foto) => (
                      <div key={foto.id} className="relative group">
                        <img
                          src={`${API}${foto.foto_url}`}
                          alt={foto.descricao}
                          className="w-full h-40 object-cover rounded-lg"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                          <Button
                            onClick={() => handleDeleteFotoPC(foto.id)}
                            size="sm"
                            variant="destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <p className="text-gray-300 text-sm mt-1">{foto.descricao}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm text-center py-4">Nenhuma fotografia</p>
                )}
              </div>

              {/* Observações */}
              <div>
                <Label className="text-gray-300">Observações</Label>
                <textarea
                  value={pcFormData.observacoes}
                  onChange={(e) => setPCFormData({ ...pcFormData, observacoes: e.target.value })}
                  className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2 mt-1 min-h-[100px]"
                  placeholder="Adicione observações sobre este pedido de cotação..."
                />
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => setShowPCModal(false)}
                  variant="outline"
                  className="flex-1 border-gray-600"
                >
                  Fechar
                </Button>
                <Button
                  onClick={handleUpdatePC}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  Guardar Alterações
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Foto PC Modal */}
      <Dialog open={showAddFotoPCModal} onOpenChange={setShowAddFotoPCModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Adicionar Fotografia ao PC</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUploadFotoPC} className="space-y-4">
            <div>
              <Label htmlFor="foto_pc_file" className="text-gray-300">Selecionar Imagem</Label>
              <Input
                id="foto_pc_file"
                type="file"
                accept="image/*"
                onChange={handleFotoPCFileChange}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                required
              />
            </div>

            <div>
              <Label htmlFor="foto_pc_descricao" className="text-gray-300">Descrição</Label>
              <Input
                id="foto_pc_descricao"
                defaultValue={fotoPCDescricao}
                onBlur={(e) => setFotoPCDescricao(e.target.value)}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                placeholder="Ex: Vista frontal do equipamento"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={() => {
                  setShowAddFotoPCModal(false);
                  setFotoPCFile(null);
                  setFotoPCDescricao('');
                }}
                variant="outline"
                className="flex-1 border-gray-600"
                disabled={uploadingFotoPC}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-blue-500 hover:bg-blue-600"
                disabled={uploadingFotoPC}
              >
                {uploadingFotoPC ? 'Enviando...' : 'Adicionar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Email PC Modal */}
      <Dialog open={showEmailPCModal} onOpenChange={setShowEmailPCModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Enviar PDF por Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-300">Selecione o email de destino:</p>
            <div className="space-y-2">
              {['geral@hwi.pt', 'pedro.duarte@hwi.pt', 'miguel.moreira@hwi.pt'].map((email) => (
                <Button
                  key={email}
                  onClick={() => handleSendEmailPC(email)}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  disabled={sendingEmailPC}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {email}
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* Assinatura Modal */}
      <Dialog open={showAssinaturaModal} onOpenChange={setShowAssinaturaModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <PenTool className="w-5 h-5 text-green-400" />
              Assinatura do Cliente
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-6">
            <p className="text-gray-400 text-sm">Preencha ambas as assinaturas (obrigatórias):</p>
            
            {/* Card 1: Assinatura Digital */}
            <div className="bg-[#0f0f0f] border-2 border-blue-500 rounded-lg p-6">
              <h3 className="text-blue-400 font-semibold text-lg mb-4 flex items-center gap-2">
                <PenTool className="w-5 h-5" />
                Assinatura Digital (Desenhar)
              </h3>
              
              <div>
                <Label className="text-gray-300 mb-2 block">Desenhe a assinatura:</Label>
                <div 
                  className="border-2 border-gray-600 rounded-lg overflow-hidden bg-white"
                  style={{ touchAction: 'none' }}
                >
                  <SignatureCanvas
                    ref={(ref) => setAssinaturaCanvas(ref)}
                    canvasProps={{
                      className: 'w-full h-64',
                      style: { 
                        width: '100%', 
                        height: '256px',
                        touchAction: 'none'
                      }
                    }}
                    backgroundColor="white"
                    penColor="black"
                  />
                </div>
                <Button
                  onClick={clearCanvas}
                  variant="outline"
                  size="sm"
                  className="mt-2 border-gray-600"
                >
                  Limpar Canvas
                </Button>
              </div>
            </div>

            {/* Card 2: Assinatura Manual */}
            <div className="bg-[#0f0f0f] border-2 border-green-500 rounded-lg p-6">
              <h3 className="text-green-400 font-semibold text-lg mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Nome Completo (Digitar)
              </h3>
              
              <div className="space-y-4">
                <p className="text-gray-400 text-sm">
                  Digite o primeiro e último nome para validação:
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="primeiro_nome_manual" className="text-gray-300">
                      Primeiro Nome *
                    </Label>
                    <Input
                      id="primeiro_nome_manual"
                      type="text"
                      value={assinaturaNome.primeiro}
                      onChange={(e) => setAssinaturaNome({ ...assinaturaNome, primeiro: e.target.value })}
                      className="bg-[#0f0f0f] border-gray-700 text-white"
                      placeholder="Ex: João"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="ultimo_nome_manual" className="text-gray-300">
                      Último Nome *
                    </Label>
                    <Input
                      id="ultimo_nome_manual"
                      type="text"
                      value={assinaturaNome.ultimo}
                      onChange={(e) => setAssinaturaNome({ ...assinaturaNome, ultimo: e.target.value })}
                      className="bg-[#0f0f0f] border-gray-700 text-white"
                      placeholder="Ex: Silva"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => setShowAssinaturaModal(false)}
                variant="outline"
                className="flex-1 border-gray-600"
                disabled={uploadingAssinatura}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveAssinaturaDigital}
                className="flex-1 bg-green-500 hover:bg-green-600"
                disabled={uploadingAssinatura}
              >
                {uploadingAssinatura ? 'Salvando...' : 'Salvar Assinatura Completa'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email PDF Modal */}
      <Dialog open={showEmailModal} onOpenChange={setShowEmailModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Send className="w-5 h-5 text-green-400" />
              Enviar PDF por Email
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <p className="text-gray-400 text-sm">
              Selecione os emails do cliente que devem receber o PDF da OT:
            </p>

            {/* Lista de emails do cliente */}
            {emailsCliente.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-gray-300">Emails do Cliente:</Label>
                {emailsCliente.map((item, index) => (
                  <div key={index} className="flex items-center gap-3 bg-[#0f0f0f] p-3 rounded border border-gray-700">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleEmailSelection(index)}
                      className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                    />
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-white flex-1">{item.email}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3">
                <p className="text-yellow-400 text-sm">
                  ⚠️ Este cliente não tem emails cadastrados. Adicione emails manualmente abaixo.
                </p>
              </div>
            )}

            {/* Emails adicionais */}
            <div>
              <Label htmlFor="emails_adicionais" className="text-gray-300">
                Adicionar Emails Adicionais (separados por vírgula ou ponto e vírgula):
              </Label>
              <textarea
                id="emails_adicionais"
                value={emailsAdicionais}
                onChange={(e) => setEmailsAdicionais(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3 min-h-[80px]"
                placeholder="exemplo1@email.com, exemplo2@email.com"
              />
              <p className="text-xs text-gray-500 mt-1">
                Você pode adicionar múltiplos emails separados por vírgula (,) ou ponto e vírgula (;)
              </p>
            </div>

            {/* Preview de emails selecionados */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3">
              <p className="text-xs text-gray-400 mb-2">
                <strong>Total de destinatários:</strong> {emailsCliente.filter(e => e.selected).length + (emailsAdicionais.trim() ? emailsAdicionais.split(/[;,]/).filter(e => e.trim()).length : 0)}
              </p>
            </div>

            {/* Botões */}
            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => setShowEmailModal(false)}
                variant="outline"
                className="flex-1 border-gray-600"
                disabled={sendingEmail}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSendEmail}
                className="flex-1 bg-green-500 hover:bg-green-600"
                disabled={sendingEmail}
              >
                {sendingEmail ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Enviar PDF
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* Edit Relatório Modal */}

      {/* Add Equipamento Modal */}
      <Dialog open={showAddEquipamentoModal} onOpenChange={setShowAddEquipamentoModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Plus className="w-5 h-5 text-blue-400" />
              Adicionar Equipamento
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddEquipamento} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300">Tipologia *</Label>
                <Input
                  value={equipamentoFormData.tipologia}
                  onChange={(e) => setEquipamentoFormData({...equipamentoFormData, tipologia: e.target.value})}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  required
                />
              </div>
              <div>
                <Label className="text-gray-300">Marca *</Label>
                <Input
                  value={equipamentoFormData.marca}
                  onChange={(e) => setEquipamentoFormData({...equipamentoFormData, marca: e.target.value})}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300">Modelo *</Label>
                <Input
                  value={equipamentoFormData.modelo}
                  onChange={(e) => setEquipamentoFormData({...equipamentoFormData, modelo: e.target.value})}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  required
                />
              </div>
              <div>
                <Label className="text-gray-300">Número de Série</Label>
                <Input
                  value={equipamentoFormData.numero_serie}
                  onChange={(e) => setEquipamentoFormData({...equipamentoFormData, numero_serie: e.target.value})}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                />
              </div>
            </div>

            <div>
              <Label className="text-gray-300">Ano de Fabrico</Label>
              <Input
                value={equipamentoFormData.ano_fabrico}
                onChange={(e) => setEquipamentoFormData({...equipamentoFormData, ano_fabrico: e.target.value})}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                placeholder="Ex: 2020, 03/2020, 03-2020"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                onClick={() => setShowAddEquipamentoModal(false)}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-blue-500 hover:bg-blue-600"
              >
                Adicionar Equipamento
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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

      {/* Change Código Modal */}
      <Dialog open={showCodigoModal} onOpenChange={setShowCodigoModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Clock className="w-5 h-5 text-blue-400" />
              Alterar Código de Horário
            </DialogTitle>
          </DialogHeader>

          {selectedTecnicoForCodigo && (
            <div className="space-y-4 mt-4">
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <p className="text-white font-semibold mb-2">
                  Técnico: {selectedTecnicoForCodigo.tecnico_nome}
                </p>
                <p className="text-gray-400 text-sm">
                  Data: {new Date(selectedTecnicoForCodigo.data_trabalho).toLocaleDateString('pt-PT')}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-gray-500 text-xs">Código atual:</span>
                  <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded text-sm">
                    {getTipoHorarioCodigo(selectedTecnicoForCodigo.tipo_horario)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-gray-300 text-sm mb-3">Selecione o novo código:</p>
                
                <Button
                  onClick={() => handleChangeCodigo('diurno')}
                  className="w-full justify-start bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-8 h-8 rounded bg-blue-400 flex items-center justify-center text-black font-bold">
                      1
                    </div>
                    <div className="text-left flex-1">
                      <div className="font-semibold">Dias Úteis - Diurno</div>
                      <div className="text-xs text-gray-400">7h01 às 19h00</div>
                    </div>
                  </div>
                </Button>

                <Button
                  onClick={() => handleChangeCodigo('noturno')}
                  className="w-full justify-start bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-8 h-8 rounded bg-indigo-400 flex items-center justify-center text-black font-bold">
                      2
                    </div>
                    <div className="text-left flex-1">
                      <div className="font-semibold">Dias Úteis - Noturno</div>
                      <div className="text-xs text-gray-400">19h01 às 7h00</div>
                    </div>
                  </div>
                </Button>

                <Button
                  onClick={() => handleChangeCodigo('sabado')}
                  className="w-full justify-start bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-8 h-8 rounded bg-amber-400 flex items-center justify-center text-black font-bold">
                      S
                    </div>
                    <div className="text-left flex-1">
                      <div className="font-semibold">Sábados</div>
                      <div className="text-xs text-gray-400">Qualquer horário</div>
                    </div>
                  </div>
                </Button>

                <Button
                  onClick={() => handleChangeCodigo('domingo_feriado')}
                  className="w-full justify-start bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-8 h-8 rounded bg-red-400 flex items-center justify-center text-black font-bold">
                      D
                    </div>
                    <div className="text-left flex-1">
                      <div className="font-semibold">Domingos e Feriados</div>
                      <div className="text-xs text-gray-400">Qualquer horário</div>
                    </div>
                  </div>
                </Button>
              </div>

              <Button
                type="button"
                onClick={() => {
                  setShowCodigoModal(false);
                  setSelectedTecnicoForCodigo(null);
                }}
                variant="outline"
                className="w-full border-gray-600 mt-4"
              >
                Cancelar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Change Status Modal */}
      <Dialog open={showStatusModal} onOpenChange={setShowStatusModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <FileText className="w-5 h-5 text-blue-400" />
              Alterar Status da OT
            </DialogTitle>
          </DialogHeader>

          {selectedStatusRelatorio && (
            <div className="space-y-4 mt-4">
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <p className="text-white font-semibold mb-2">
                  OT #{selectedStatusRelatorio.numero_assistencia}
                </p>
                <p className="text-gray-400 text-sm">{selectedStatusRelatorio.cliente_nome}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-gray-500 text-xs">Status atual:</span>
                  <span className={`text-xs px-2 py-1 rounded ${getStatusColor(selectedStatusRelatorio.status)}`}>
                    {getStatusLabel(selectedStatusRelatorio.status)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-gray-300 text-sm mb-3">Selecione o novo status:</p>
                
                <Button
                  onClick={() => handleChangeStatus('orcamento')}
                  className="w-full justify-start bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                    <span>Orçamento</span>
                  </div>
                </Button>

                <Button
                  onClick={() => handleChangeStatus('em_execucao')}
                  className="w-full justify-start bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                    <span>Em Execução</span>
                  </div>
                </Button>

                <Button
                  onClick={() => handleChangeStatus('concluido')}
                  className="w-full justify-start bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-400"></div>
                    <span>Concluído</span>
                  </div>
                </Button>

                {user?.is_admin && (
                  <Button
                    onClick={() => handleChangeStatus('facturado')}
                    className="w-full justify-start bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-400"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-purple-400"></div>
                      <span>Facturado</span>
                      <span className="ml-auto text-xs bg-purple-400/20 px-2 py-0.5 rounded">Admin</span>
                    </div>
                  </Button>
                )}
              </div>

              <Button
                type="button"
                onClick={() => {
                  setShowStatusModal(false);
                  setSelectedStatusRelatorio(null);
                }}
                variant="outline"
                className="w-full border-gray-600 mt-4"
              >
                Cancelar
              </Button>
            </div>
          )}
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
                        
                        {equipamento.ano_fabrico && (
                          <div>
                            <span className="text-xs text-gray-500">Ano de Fabrico:</span>
                            <p className="text-sm text-gray-300">{equipamento.ano_fabrico}</p>
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

                      {/* Botões */}
                      <div className="flex gap-2 mt-2">
                        <Button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const response = await axios.get(
                                `${API}/relatorios-tecnicos/${relatorio.id}/preview-pdf`,
                                { responseType: 'blob' }
                              );
                              
                              const blob = new Blob([response.data], { type: 'application/pdf' });
                              const url = window.URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `OT_${relatorio.numero_assistencia}.pdf`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              window.URL.revokeObjectURL(url);
                              
                              toast.success('PDF baixado com sucesso!');
                            } catch (error) {
                              toast.error('Erro ao baixar PDF');
                            }
                          }}
                          size="sm"
                          className="flex-1 bg-red-600 hover:bg-red-700"
                        >
                          <Download className="w-3 h-3 mr-1" />
                          PDF
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowClienteRelatoriosModal(false);
                            openViewRelatorioModal(relatorio);
                          }}
                          size="sm"
                          className="flex-1 bg-purple-600 hover:bg-purple-700"
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          Ver Detalhes
                        </Button>
                      </div>
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

      {/* Modal Editar Registo Cronómetro */}
      <Dialog open={showEditRegistoModal} onOpenChange={(open) => {
        setShowEditRegistoModal(open);
        if (!open) setEditingRegisto(null);
      }}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Edit className="w-5 h-5 text-blue-400" />
              Editar Registo de Cronómetro
            </DialogTitle>
          </DialogHeader>

          {editingRegisto && (
            <div className="space-y-4 mt-4">
              {/* Info do Registo */}
              <div className="bg-[#0f0f0f] p-3 rounded-lg border border-gray-700">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-400">Técnico:</span>
                    <span className="text-white ml-2">{editingRegisto.tecnico_nome}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Tipo:</span>
                    <span className={`ml-2 ${editingRegisto.tipo === 'trabalho' ? 'text-green-400' : 'text-blue-400'}`}>
                      {editingRegisto.tipo === 'trabalho' ? 'Trabalho' : 'Viagem'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Data:</span>
                    <span className="text-white ml-2">
                      {new Date(editingRegisto.data).toLocaleDateString('pt-PT')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Campos Editáveis */}
              <div>
                <Label className="text-gray-300">Horas Arredondadas</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={editRegistoForm.horas_arredondadas}
                  onChange={(e) => setEditRegistoForm({
                    ...editRegistoForm,
                    horas_arredondadas: e.target.value
                  })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                />
              </div>

              <div>
                <Label className="text-gray-300">KM</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={editRegistoForm.km}
                  onChange={(e) => setEditRegistoForm({
                    ...editRegistoForm,
                    km: e.target.value
                  })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                />
              </div>

              <div>
                <Label className="text-gray-300">Código</Label>
                <select
                  value={editRegistoForm.codigo}
                  onChange={(e) => setEditRegistoForm({
                    ...editRegistoForm,
                    codigo: e.target.value
                  })}
                  className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2"
                >
                  <option value="1">1 - Dias úteis (07h-19h)</option>
                  <option value="2">2 - Dias úteis (19h-07h)</option>
                  <option value="S">S - Sábado</option>
                  <option value="D">D - Domingos/Feriados</option>
                  <option value="V1">V1 - Viagem Dias úteis (07h-19h)</option>
                  <option value="V2">V2 - Viagem Dias úteis (19h-07h)</option>
                  <option value="VS">VS - Viagem Sábado</option>
                  <option value="VD">VD - Viagem Domingos/Feriados</option>
                </select>
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => setShowEditRegistoModal(false)}
                  variant="outline"
                  className="flex-1 border-gray-600"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleUpdateRegisto}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  Guardar
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
