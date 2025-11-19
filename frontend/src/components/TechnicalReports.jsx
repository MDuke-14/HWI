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
  PenTool
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
  const [assinaturaTipo, setAssinaturaTipo] = useState('digital'); // 'digital' ou 'manual'
  const [assinaturaCanvas, setAssinaturaCanvas] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [assinaturaNome, setAssinaturaNome] = useState({ primeiro: '', ultimo: '' });
  const [uploadingAssinatura, setUploadingAssinatura] = useState(false);

  
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
    // Buscar técnicos, intervenções e fotografias do relatório
    await fetchTecnicosRelatorio(relatorio.id);
    await fetchIntervencoesRelatorio(relatorio.id);
    await fetchFotografiasRelatorio(relatorio.id);
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
      const response = await axios.get(`${API}/users`);
      setUsuarios(response.data);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
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
    fetchUsuarios();
    setShowAddTecnicoModal(true);
  };

  const handleUsuarioChange = (userId) => {
    const usuario = usuarios.find(u => u.id === userId);
    if (usuario) {
      setTecnicoFormData({
        ...tecnicoFormData,
        tecnico_id: usuario.id,
        tecnico_nome: usuario.full_name || usuario.username
      });
    }
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
    fetchUsuarios();
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

  const handleFotoFileChange = (e) => {
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
      setFotoFile(file);
    }
  };

  const handleUploadFoto = async (e) => {
    e.preventDefault();
    
    if (!fotoFile) {
      toast.error('Selecione uma fotografia');
      return;
    }
    
    if (!fotoDescricao.trim()) {
      toast.error('Adicione uma descrição para a fotografia');
      return;
    }
    
    setUploadingFoto(true);
    
    try {
      const formData = new FormData();
      formData.append('file', fotoFile);
      formData.append('descricao', fotoDescricao);
      
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
      console.error('Error response:', error.response);
      toast.error(formatErrorMessage(error));
    }
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

  const openAssinaturaModal = () => {
    setAssinaturaTipo('digital');
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

              {/* Equipamento */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <h4 className="text-blue-400 font-semibold mb-2">Equipamento</h4>
                <p className="text-white">{selectedRelatorio.equipamento_marca} - {selectedRelatorio.equipamento_tipologia}</p>
                <p className="text-gray-400 text-sm">Modelo: {selectedRelatorio.equipamento_modelo}</p>
                {selectedRelatorio.equipamento_numero_serie && (
                  <p className="text-gray-400 text-sm">Série: {selectedRelatorio.equipamento_numero_serie}</p>
                )}
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

              {/* Mão de Obra / Deslocação */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-blue-400 font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Mão de Obra / Deslocação
                  </h4>
                  <Button
                    onClick={() => openAddTecnicoModal()}
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
                            <th className="text-center py-2 px-3 text-gray-400 text-sm font-medium">Data</th>
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
                              <td className="py-3 px-3 text-center text-gray-300">
                                {tec.data_trabalho ? new Date(tec.data_trabalho).toLocaleDateString('pt-PT') : '-'}
                              </td>
                              <td className="py-3 px-3 text-center text-gray-300">{tec.horas_cliente}h</td>
                              <td className="py-3 px-3 text-center text-gray-300">
                                {tec.kms_deslocacao * 2} km
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span 
                                  className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded text-sm cursor-pointer hover:bg-blue-500/20 transition"
                                  onClick={(e) => openCodigoModal(tec, e)}
                                  title="Clique para alterar código"
                                >
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
                              e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23333" width="100" height="100"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ESem Imagem%3C/text%3E%3C/svg%3E';
                            }}
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
                <Label htmlFor="tecnico_usuario" className="text-gray-300">
                  Selecionar Técnico *
                </Label>
                <select
                  id="tecnico_usuario"
                  value={tecnicoFormData.tecnico_id}
                  onChange={(e) => handleUsuarioChange(e.target.value)}
                  className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">-- Selecione um técnico --</option>
                  {usuarios.map((usuario) => (
                    <option key={usuario.id} value={usuario.id}>
                      {usuario.full_name || usuario.username}
                    </option>
                  ))}
                </select>
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
                <Label htmlFor="edit_tecnico_usuario" className="text-gray-300">
                  Selecionar Técnico *
                </Label>
                <select
                  id="edit_tecnico_usuario"
                  value={tecnicoFormData.tecnico_id}
                  onChange={(e) => handleUsuarioChange(e.target.value)}
                  className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">-- Selecione um técnico --</option>
                  {usuarios.map((usuario) => (
                    <option key={usuario.id} value={usuario.id}>
                      {usuario.full_name || usuario.username}
                    </option>
                  ))}
                </select>
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

            {/* Descrição */}
            <div>
              <Label htmlFor="foto_descricao" className="text-gray-300">
                Descrição / Observações *
              </Label>
              <textarea
                id="foto_descricao"
                value={fotoDescricao}
                onChange={(e) => setFotoDescricao(e.target.value)}
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
