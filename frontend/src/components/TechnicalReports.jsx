import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import Navigation from './Navigation';
import { toast } from 'sonner';
import OfflineStatusBar from './OfflineStatusBar';
import { useOfflineData } from '@/hooks/useOfflineData';
import HelpTooltip from './HelpTooltip';
import { useMobile } from '@/contexts/MobileContext';
import { useTheme } from '@/contexts/ThemeContext';
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
  StopCircle,
  Eye,
  Upload,
  Calendar,
  FileSpreadsheet,
  DollarSign,
  Tag,
  Briefcase,
  Wifi,
  WifiOff,
  Receipt,
  RefreshCw,
  Coffee,
  CheckCircle,
  Check
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Componentes extraídos
import { 
  FolhaHorasModal,
  PDFPreviewModal,
  DeleteConfirmModal,
  AssinaturaModal,
  TecnicoModal,
  EquipamentoModal,
  MaterialModal,
  CronometroStartModal
} from './technical-reports';

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
  // Mobile e Theme hooks
  const { isMobile, isTablet } = useMobile();
  const { isDark } = useTheme();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('clientes'); // 'relatorios', 'clientes', ou 'pesquisa'
  const [clientes, setClientes] = useState([]);
  const [relatorios, setRelatorios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filteredByStatus, setFilteredByStatus] = useState([]);
  
  // Classes dinâmicas baseadas no tema
  const bgMain = isDark ? 'bg-[#0a0a0a]' : 'bg-gray-100';
  const bgCard = isDark ? 'bg-[#1a1a1a]' : 'bg-white';
  const bgCardAlt = isDark ? 'bg-[#0f0f0f]' : 'bg-gray-50';
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-600';
  const borderColor = isDark ? 'border-gray-700' : 'border-gray-200';
  
  // Flag para controlar se já processamos o parâmetro ot da URL
  const [urlOtProcessed, setUrlOtProcessed] = useState(false);
  
  // Hook de dados offline
  const { 
    isOnline, 
    isSyncing, 
    pendingCount, 
    lastSyncTime,
    cacheData,
    getCachedData,
    queueOperation,
    forceSync,
    STORES
  } = useOfflineData(API);
  
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
  
  // Modal iniciar cronómetro após criar OT
  const [showIniciarCronoModal, setShowIniciarCronoModal] = useState(false);
  const [novaOTParaCrono, setNovaOTParaCrono] = useState(null);
  const [cronoTecnicosSelecionados, setCronoTecnicosSelecionados] = useState([]);
  const [cronoTipo, setCronoTipo] = useState('trabalho');
  
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
    relatorio_assistencia: '',
    equipamento_id: ''
  });
  
  // Fotografias
  const [fotografias, setFotografias] = useState([]);
  const [showAddFotoModal, setShowAddFotoModal] = useState(false);
  const [selectedFoto, setSelectedFoto] = useState(null);
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoDescricao, setFotoDescricao] = useState('');
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [showEditFotoModal, setShowEditFotoModal] = useState(false);
  const [editFotoDescricao, setEditFotoDescricao] = useState('');
  const [editFotoData, setEditFotoData] = useState('');

  // Email OT
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailsCliente, setEmailsCliente] = useState([]);
  const [emailsAdicionais, setEmailsAdicionais] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // Assinaturas (múltiplas)
  const [assinaturas, setAssinaturas] = useState([]);
  const [showAssinaturaModal, setShowAssinaturaModal] = useState(false);
  const [editingAssinaturaDesktop, setEditingAssinaturaDesktop] = useState(null);
  const [editingAssinaturaData, setEditingAssinaturaData] = useState({ date: '', time: '' });
  const [editingAssinaturaNome, setEditingAssinaturaNome] = useState(null);
  const [editingNomeData, setEditingNomeData] = useState({ primeiro_nome: '', ultimo_nome: '' });

  // Visualizar PDF
  const [showPDFPreviewModal, setShowPDFPreviewModal] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [loadingPDFPreview, setLoadingPDFPreview] = useState(false);
  const [downloadingAllPDFs, setDownloadingAllPDFs] = useState(false);
  const [downloadingClientesPDF, setDownloadingClientesPDF] = useState(false);
  const [downloadingEmailsPDF, setDownloadingEmailsPDF] = useState(false);
  
  // Visualização HTML estilo PDF para cliente
  const [showHTMLPreviewModal, setShowHTMLPreviewModal] = useState(false);
  const [htmlPreviewData, setHtmlPreviewData] = useState(null);
  const [loadingHTMLPreview, setLoadingHTMLPreview] = useState(false);
  
  // Canvas de assinatura integrado no HTML Preview
  const htmlSignatureCanvasRef = useRef(null);
  const [isDrawingSignature, setIsDrawingSignature] = useState(false);
  const [htmlSignatureName, setHtmlSignatureName] = useState('');
  const [savingHtmlSignature, setSavingHtmlSignature] = useState(false);
  
  // Visualização PDF real (para o cliente ver antes de assinar)
  const [showPDFViewerModal, setShowPDFViewerModal] = useState(false);
  const [pdfViewerUrl, setPdfViewerUrl] = useState(null);
  const [loadingPDFViewer, setLoadingPDFViewer] = useState(false);

  // Folha de Horas
  const [showFolhaHorasModal, setShowFolhaHorasModal] = useState(false);
  const [folhaHorasData, setFolhaHorasData] = useState(null);
  const [loadingFolhaHoras, setLoadingFolhaHoras] = useState(false);
  const [folhaHorasTarifas, setFolhaHorasTarifas] = useState({});  // {tecnico_id: tarifa_valor}
  const [folhaHorasExtras, setFolhaHorasExtras] = useState({});    // {"tecnico_id_data": {dieta, portagens, despesas}}
  const [generatingFolhaHoras, setGeneratingFolhaHoras] = useState(false);

  // Material OT
  const [materiais, setMateriais] = useState([]);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [showEditMaterialModal, setShowEditMaterialModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [materialFormData, setMaterialFormData] = useState({
    descricao: '',
    quantidade: 1,
    fornecido_por: 'Cliente',
    data_utilizacao: ''
  });

  // Despesas OT
  const [despesas, setDespesas] = useState([]);
  const [showAddDespesaModal, setShowAddDespesaModal] = useState(false);
  const [showEditDespesaModal, setShowEditDespesaModal] = useState(false);
  const [selectedDespesa, setSelectedDespesa] = useState(null);
  const [despesaFormData, setDespesaFormData] = useState({
    tipo: 'outras',
    descricao: '',
    valor: '',
    tecnico_id: '',
    data: new Date().toISOString().split('T')[0],
    factura_data: null,
    factura_filename: null,
    factura_mimetype: null
  });
  const [uploadingFactura, setUploadingFactura] = useState(false);

  // Tipos de despesa disponíveis
  const tiposDespesa = [
    { value: 'outras', label: 'Outras' },
    { value: 'combustivel', label: 'Combustível' },
    { value: 'ferramentas', label: 'Ferramentas' },
    { value: 'portagens', label: 'Portagens' }
  ];

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
  
  // Editar Material PC
  const [showEditMaterialPCModal, setShowEditMaterialPCModal] = useState(false);
  const [editMaterialPC, setEditMaterialPC] = useState(null);
  const [editMaterialPCForm, setEditMaterialPCForm] = useState({ descricao: '', quantidade: 1 });
  
  // Faturas PC
  const [faturasPC, setFaturasPC] = useState([]);
  const [faturaFile, setFaturaFile] = useState(null);
  const [faturaDescricao, setFaturaDescricao] = useState('');
  const [uploadingFatura, setUploadingFatura] = useState(false);

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
    minutos_trabalhados: 0,
    km: 0,
    kms_inicial: 0,
    kms_final: 0,
    kms_inicial_volta: 0,
    kms_final_volta: 0,
    codigo: '',
    hora_inicio: '',
    hora_fim: '',
    incluir_pausa: false
  });

  // Modal para adicionar registo manual
  const [showAddRegistoManualModal, setShowAddRegistoManualModal] = useState(false);
  const [addRegistoManualForm, setAddRegistoManualForm] = useState({
    tecnico_id: '',
    tecnico_nome: '',
    tipo: 'trabalho',
    data: new Date().toISOString().split('T')[0],
    hora_inicio: '09:00',
    hora_fim: '18:00',
    km: 0,
    kms_inicial: 0,
    kms_final: 0,
    kms_inicial_volta: 0,
    kms_final_volta: 0,
    incluir_pausa: false
  });

  
  const [tecnicoFormData, setTecnicoFormData] = useState({
    tecnico_id: '',
    tecnico_nome: '',
    minutos_cliente: 0,
    kms_inicial: 0,
    kms_final: 0,
    tipo_horario: 'diurno',
    data_trabalho: new Date().toISOString().split('T')[0],
    hora_inicio: '',
    hora_fim: ''
  });

  const [showCodigoModal, setShowCodigoModal] = useState(false);
  const [selectedTecnicoForCodigo, setSelectedTecnicoForCodigo] = useState(null);
  
  const [showTipoModal, setShowTipoModal] = useState(false);
  const [selectedTecnicoForTipo, setSelectedTecnicoForTipo] = useState(null);
  
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    morada: '',
    nif: '',
    emails_adicionais: []  // Array de emails adicionais
  });
  
  const [relatorioFormData, setRelatorioFormData] = useState({
    cliente_id: '',
    data_servico: new Date().toISOString().split('T')[0],
    data_fim: '',  // Campo "Até" - opcional
    local_intervencao: '',
    pedido_por: '',
    km_inicial: '',  // KM iniciais da viatura
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
  const [equipamentosClienteOT, setEquipamentosClienteOT] = useState([]);
  const [equipamentoOTSelecionado, setEquipamentoOTSelecionado] = useState('novo');
  
  // Edição de Equipamentos
  const [showEditEquipamentoModal, setShowEditEquipamentoModal] = useState(false);
  const [editingEquipamento, setEditingEquipamento] = useState(null);
  const [editEquipamentoFormData, setEditEquipamentoFormData] = useState({
    tipologia: '',
    marca: '',
    modelo: '',
    numero_serie: '',
    ano_fabrico: ''
  });
  const [editingEquipamentoPrincipal, setEditingEquipamentoPrincipal] = useState(false);

  useEffect(() => {
    if (activeTab === 'clientes') {
      fetchClientes();
    } else if (activeTab === 'relatorios') {
      fetchRelatorios();
    } else if (activeTab === 'pesquisa') {
      fetchRelatorios(); // Carregar relatórios para filtrar
    }
  }, [activeTab]);
  
  // Processar parâmetro ot da URL para abrir OT diretamente
  useEffect(() => {
    const otId = searchParams.get('ot');
    if (otId && !urlOtProcessed && !loading) {
      // Marcar como processado para não abrir novamente
      setUrlOtProcessed(true);
      
      // Mudar para tab de relatórios
      setActiveTab('relatorios');
      
      // Buscar e abrir a OT
      const openOtFromUrl = async () => {
        try {
          const response = await axios.get(`${API}/relatorios-tecnicos/${otId}`);
          if (response.data) {
            // Abrir modal de visualização
            openViewRelatorioModal(response.data);
            // Limpar o parâmetro da URL
            setSearchParams({});
          }
        } catch (error) {
          console.error('Erro ao abrir OT da URL:', error);
          toast.error('OT não encontrada');
          setSearchParams({});
        }
      };
      
      openOtFromUrl();
    }
  }, [searchParams, urlOtProcessed, loading]);
  
  // Buscar clientes quando abre modal de criar relatório
  useEffect(() => {
    if (showAddRelatorioModal && clientes.length === 0) {
      fetchClientes();
    }
  }, [showAddRelatorioModal]);

  const fetchClientes = async () => {
    try {
      setLoading(true);
      
      if (navigator.onLine) {
        const response = await axios.get(`${API}/clientes`);
        setClientes(response.data);
        // Guardar no cache
        await cacheData(STORES.CLIENTES, response.data);
      } else {
        // Modo offline - usar cache
        const cachedClientes = await getCachedData(STORES.CLIENTES);
        if (cachedClientes && cachedClientes.length > 0) {
          setClientes(cachedClientes);
          toast.info('Dados carregados do cache offline');
        } else {
          toast.error('Sem dados em cache. Conecte à internet para carregar.');
        }
      }
    } catch (error) {
      // Tentar cache em caso de erro
      const cachedClientes = await getCachedData(STORES.CLIENTES);
      if (cachedClientes && cachedClientes.length > 0) {
        setClientes(cachedClientes);
        toast.warning('Erro de conexão. Dados carregados do cache.');
      } else {
        toast.error('Erro ao carregar clientes');
      }
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatorios = async () => {
    try {
      setLoading(true);
      
      if (navigator.onLine) {
        const response = await axios.get(`${API}/relatorios-tecnicos`);
        setRelatorios(response.data);
        // Guardar no cache
        await cacheData(STORES.RELATORIOS, response.data);
      } else {
        // Modo offline - usar cache
        const cachedRelatorios = await getCachedData(STORES.RELATORIOS);
        if (cachedRelatorios && cachedRelatorios.length > 0) {
          setRelatorios(cachedRelatorios);
          toast.info('OTs carregadas do cache offline');
        } else {
          toast.error('Sem OTs em cache. Conecte à internet para carregar.');
        }
      }
    } catch (error) {
      // Tentar cache em caso de erro
      const cachedRelatorios = await getCachedData(STORES.RELATORIOS);
      if (cachedRelatorios && cachedRelatorios.length > 0) {
        setRelatorios(cachedRelatorios);
        toast.warning('Erro de conexão. OTs carregadas do cache.');
      } else {
        toast.error('Erro ao carregar OTs');
      }
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
      // Converter array de emails em string separada por ponto e vírgula
      const dataToSend = {
        ...formData,
        emails_adicionais: formData.emails_adicionais.filter(e => e.trim()).join('; ')
      };
      await axios.post(`${API}/clientes`, dataToSend);
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
      // Converter array de emails em string separada por ponto e vírgula
      const dataToSend = {
        ...formData,
        emails_adicionais: formData.emails_adicionais.filter(e => e.trim()).join('; ')
      };
      await axios.put(`${API}/clientes/${selectedCliente.id}`, dataToSend);
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
    // Converter emails_adicionais de string para array
    let emailsArray = [];
    if (cliente.emails_adicionais) {
      emailsArray = cliente.emails_adicionais.split(/[;,]/).map(e => e.trim()).filter(e => e);
    }
    setFormData({
      nome: cliente.nome,
      email: cliente.email || '',
      telefone: cliente.telefone || '',
      morada: cliente.morada || '',
      nif: cliente.nif || '',
      emails_adicionais: emailsArray
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

  const handleDownloadAllClienteRelatorios = async () => {
    if (clienteRelatorios.length === 0) {
      toast.error('Não há relatórios para download');
      return;
    }
    
    setDownloadingAllPDFs(true);
    let successCount = 0;
    let errorCount = 0;
    
    toast.info(`A preparar ${clienteRelatorios.length} PDF(s) para download...`);
    
    try {
      for (const relatorio of clienteRelatorios) {
        try {
          const response = await axios.get(
            `${API}/relatorios-tecnicos/${relatorio.id}/preview-pdf`,
            { responseType: 'blob' }
          );
          
          // Criar blob e fazer download
          const blob = new Blob([response.data], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `OT_${relatorio.numero_assistencia}_${relatorio.cliente_nome?.replace(/\s+/g, '_')}.pdf`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          
          successCount++;
          
          // Pequena pausa entre downloads para não sobrecarregar
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          console.error(`Erro ao gerar PDF para OT #${relatorio.numero_assistencia}:`, error);
          errorCount++;
        }
      }
      
      if (successCount > 0 && errorCount === 0) {
        toast.success(`${successCount} PDF(s) descarregados com sucesso!`);
      } else if (successCount > 0 && errorCount > 0) {
        toast.warning(`${successCount} PDF(s) descarregados. ${errorCount} falharam.`);
      } else {
        toast.error('Erro ao descarregar PDFs');
      }
    } catch (error) {
      toast.error('Erro ao processar download dos relatórios');
    } finally {
      setDownloadingAllPDFs(false);
    }
  };

  const handleDownloadClientesPDF = async () => {
    setDownloadingClientesPDF(true);
    try {
      const response = await axios.get(`${API}/clientes/export/pdf`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `lista_clientes_${new Date().toISOString().split('T')[0]}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success('Lista de clientes exportada com sucesso!');
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error('Apenas administradores podem exportar a lista de clientes');
      } else {
        toast.error('Erro ao exportar lista de clientes');
      }
    } finally {
      setDownloadingClientesPDF(false);
    }
  };

  // Download PDF com lista de emails dos clientes (para copiar/colar no campo PARA)
  const handleDownloadEmailsPDF = async () => {
    setDownloadingEmailsPDF(true);
    try {
      const response = await axios.get(`${API}/clientes/export/emails-pdf`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Formato: Emails_Clientes_DD-MM-AAAA.pdf
      const today = new Date();
      const dateStr = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
      link.setAttribute('download', `Emails_Clientes_${dateStr}.pdf`);
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success('Lista de emails exportada com sucesso!');
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error('Apenas administradores podem exportar emails');
      } else {
        toast.error('Erro ao exportar lista de emails');
      }
    } finally {
      setDownloadingEmailsPDF(false);
    }
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      email: '',
      telefone: '',
      morada: '',
      nif: '',
      emails_adicionais: []
    });
    setSelectedCliente(null);
  };
  
  // Funções para gerir emails adicionais
  const addEmailField = () => {
    setFormData(prev => ({
      ...prev,
      emails_adicionais: [...prev.emails_adicionais, '']
    }));
  };

  const removeEmailField = (index) => {
    setFormData(prev => ({
      ...prev,
      emails_adicionais: prev.emails_adicionais.filter((_, i) => i !== index)
    }));
  };

  const updateEmailField = (index, value) => {
    setFormData(prev => ({
      ...prev,
      emails_adicionais: prev.emails_adicionais.map((email, i) => i === index ? value : email)
    }));
  };
  
  const resetRelatorioForm = () => {
    setRelatorioFormData({
      cliente_id: '',
      data_servico: new Date().toISOString().split('T')[0],
      data_fim: '',
      local_intervencao: '',
      pedido_por: '',
      km_inicial: '',
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
      // Se data_fim estiver vazia, usar a mesma data de início (data_servico)
      const relatorioData = {
        ...relatorioFormData,
        motivo_assistencia: intervencoesValidas[0].motivo_assistencia,
        // Se data_fim estiver vazia, não enviar o campo (será null no backend)
        data_fim: relatorioFormData.data_fim || null
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
      
      // Buscar lista de utilizadores e mostrar modal para iniciar cronómetro
      try {
        const usersResponse = await axios.get(`${API}/admin/users`);
        setAllSystemUsers(usersResponse.data);
      } catch (err) {
        console.error('Erro ao buscar utilizadores:', err);
      }
      
      // Guardar dados da nova OT e abrir modal
      setNovaOTParaCrono({
        id: relatorioId,
        numero: response.data.numero_assistencia
      });
      setCronoTecnicosSelecionados([]);
      setCronoTipo('trabalho');
      setShowIniciarCronoModal(true);
      
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const openViewRelatorioModal = async (relatorio) => {
    setSelectedRelatorio(relatorio);
    setShowViewRelatorioModal(true);
    // Buscar técnicos, intervenções, fotografias, assinatura, equipamentos, materiais, despesas, PCs, cronómetros e registos
    await fetchTecnicosRelatorio(relatorio.id);
    await fetchIntervencoesRelatorio(relatorio.id);
    await fetchFotografiasRelatorio(relatorio.id);
    await fetchAssinaturas(relatorio.id);
    await fetchEquipamentosOT(relatorio.id);
    await fetchMateriais(relatorio.id);
    await fetchDespesas(relatorio.id);
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
      data_servico: relatorio.data_servico?.split('T')[0] || '', // Formato YYYY-MM-DD
      data_fim: relatorio.data_fim?.split('T')[0] || '', // Campo "Até"
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
      relatorio_assistencia: intervencao.relatorio_assistencia || '',
      equipamento_id: intervencao.equipamento_id || ''
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

  const openAddTecnicoModal = async () => {
    // Buscar utilizadores para o dropdown
    await fetchAllSystemUsers();
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

  const openTipoModal = (tecnico, e) => {
    if (e) e.stopPropagation();
    setSelectedTecnicoForTipo(tecnico);
    setShowTipoModal(true);
  };

  const handleChangeTipo = async (novoTipo) => {
    if (!selectedTecnicoForTipo || !selectedRelatorio) return;

    try {
      // Verificar se é um registo manual ou de cronómetro
      if (selectedTecnicoForTipo._source === 'cronometro') {
        // Atualizar registo de cronómetro
        await axios.put(
          `${API}/relatorios-tecnicos/${selectedRelatorio.id}/registos/${selectedTecnicoForTipo.id}`,
          { tipo: novoTipo }
        );
        // Recarregar registos de cronómetro
        fetchRegistosTecnicosOT(selectedRelatorio.id);
      } else {
        // Atualizar registo manual
        await axios.put(
          `${API}/relatorios-tecnicos/${selectedRelatorio.id}/tecnicos/${selectedTecnicoForTipo.id}`,
          { tipo_registo: novoTipo }
        );
        // Recarregar registos manuais
        fetchTecnicosRelatorio(selectedRelatorio.id);
      }
      toast.success('Tipo atualizado com sucesso!');
      setShowTipoModal(false);
      setSelectedTecnicoForTipo(null);
    } catch (error) {
      toast.error('Erro ao atualizar tipo');
    }
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
      const response = await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/tecnicos`, tecnicoFormData);
      
      // Verificar se criou múltiplos segmentos
      if (response.data?.registos && response.data.registos.length > 1) {
        toast.success(`${response.data.registos.length} registos criados (segmentação automática)`);
      } else {
        toast.success('Técnico adicionado com sucesso!');
      }
      
      setShowAddTecnicoModal(false);
      resetTecnicoForm();
      
      // Recarregar ambas as colecções de registos
      await fetchTecnicosRelatorio(selectedRelatorio.id);
      await fetchRegistosTecnicos(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const openEditTecnicoModal = async (tecnico) => {
    // Buscar utilizadores para o dropdown
    await fetchAllSystemUsers();
    
    setSelectedTecnico(tecnico);
    setTecnicoFormData({
      tecnico_id: tecnico.tecnico_id || '',
      tecnico_nome: tecnico.tecnico_nome,
      minutos_cliente: tecnico.minutos_cliente || 0,
      kms_inicial: tecnico.kms_inicial || 0,
      kms_final: tecnico.kms_final || 0,
      kms_inicial_volta: tecnico.kms_inicial_volta || 0,
      kms_final_volta: tecnico.kms_final_volta || 0,
      tipo_horario: tecnico.tipo_horario,
      tipo_registo: tecnico.tipo_registo || 'manual',
      data_trabalho: tecnico.data_trabalho ? tecnico.data_trabalho.split('T')[0] : new Date().toISOString().split('T')[0],
      hora_inicio: tecnico.hora_inicio || '',
      hora_fim: tecnico.hora_fim || '',
      incluir_pausa: tecnico.incluir_pausa || false
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

  const handleDeleteTecnico = async (tecnicoId) => {
    if (!selectedRelatorio) return;
    
    try {
      await axios.delete(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/tecnicos/${tecnicoId}`);
      toast.success('Registo removido com sucesso!');
      await fetchTecnicosRelatorio(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const resetTecnicoForm = () => {
    setTecnicoFormData({
      tecnico_id: '',
      tecnico_nome: '',
      minutos_cliente: 0,
      kms_inicial: 0,
      kms_final: 0,
      kms_inicial_volta: 0,
      kms_final_volta: 0,
      tipo_horario: 'diurno',
      tipo_registo: 'manual',
      data_trabalho: new Date().toISOString().split('T')[0],
      hora_inicio: '',
      hora_fim: '',
      incluir_pausa: false
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
    
    // Descrição é opcional
    
    setUploadingFoto(true);
    
    try {
      const formData = new FormData();
      formData.append('file', fotoFile);
      formData.append('descricao', descricao || ''); // Enviar string vazia se não houver descrição
      
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

  const openEditFotoModal = (foto) => {
    setSelectedFoto(foto);
    setEditFotoDescricao(foto.descricao || '');
    // Converter data para formato de input datetime-local (YYYY-MM-DDTHH:MM)
    if (foto.uploaded_at) {
      const date = new Date(foto.uploaded_at);
      const localDateTime = date.toISOString().slice(0, 16);
      setEditFotoData(localDateTime);
    } else {
      setEditFotoData('');
    }
    setShowEditFotoModal(true);
  };

  const handleUpdateFotoDescricao = async () => {
    if (!selectedFoto || !selectedRelatorio) return;
    
    try {
      const updateData = { descricao: editFotoDescricao };
      
      // Adicionar data se foi alterada
      if (editFotoData) {
        updateData.uploaded_at = new Date(editFotoData).toISOString();
      }
      
      await axios.put(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/fotografias/${selectedFoto.id}`,
        updateData
      );
      toast.success('Fotografia atualizada!');
      setShowEditFotoModal(false);
      setSelectedFoto(null);
      setEditFotoDescricao('');
      setEditFotoData('');
      fetchFotografiasRelatorio(selectedRelatorio.id);
    } catch (error) {
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

  const fetchEquipamentosClienteParaOT = async (clienteId) => {
    try {
      const response = await axios.get(`${API}/equipamentos?cliente_id=${clienteId}`);
      setEquipamentosClienteOT(response.data);
    } catch (error) {
      console.error('Erro ao buscar equipamentos do cliente:', error);
      setEquipamentosClienteOT([]);
    }
  };

  const handleEquipamentoOTChange = (value) => {
    setEquipamentoOTSelecionado(value);
    
    if (value === 'novo' || value === 'apenas_ot') {
      // Limpar campos para criar novo (com ou sem BD do cliente)
      setEquipamentoFormData({
        tipologia: '',
        marca: '',
        modelo: '',
        numero_serie: '',
        ano_fabrico: ''
      });
    } else {
      // Preencher campos com dados do equipamento existente
      const equipamento = equipamentosClienteOT.find(e => e.id === value);
      if (equipamento) {
        setEquipamentoFormData({
          tipologia: equipamento.tipologia || '',
          marca: equipamento.marca || '',
          modelo: equipamento.modelo || '',
          numero_serie: equipamento.numero_serie || '',
          ano_fabrico: equipamento.ano_fabrico || ''
        });
      }
    }
  };

  const openAddEquipamentoModal = () => {
    // Buscar equipamentos do cliente da OT
    if (selectedRelatorio?.cliente_id) {
      fetchEquipamentosClienteParaOT(selectedRelatorio.cliente_id);
    }
    // Reset do form
    setEquipamentoOTSelecionado('novo');
    setEquipamentoFormData({
      tipologia: '',
      marca: '',
      modelo: '',
      numero_serie: '',
      ano_fabrico: ''
    });
    setShowAddEquipamentoModal(true);
  };

  const handleAddEquipamento = async (e) => {
    e.preventDefault();
    
    try {
      // Se é um equipamento novo, enviar flag para criar na base do cliente
      const dataToSend = {
        ...equipamentoFormData,
        criar_na_base_cliente: equipamentoOTSelecionado === 'novo'
      };
      
      await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/equipamentos`, dataToSend);
      toast.success('Equipamento adicionado!');
      setShowAddEquipamentoModal(false);
      setEquipamentoFormData({
        tipologia: '',
        marca: '',
        modelo: '',
        numero_serie: '',
        ano_fabrico: ''
      });
      setEquipamentoOTSelecionado('novo');
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

  // Abrir modal de edição para equipamento secundário
  const openEditEquipamentoModal = (equipamento) => {
    setEditingEquipamento(equipamento);
    setEditingEquipamentoPrincipal(false);
    setEditEquipamentoFormData({
      tipologia: equipamento.tipologia || '',
      marca: equipamento.marca || '',
      modelo: equipamento.modelo || '',
      numero_serie: equipamento.numero_serie || '',
      ano_fabrico: equipamento.ano_fabrico || ''
    });
    setShowEditEquipamentoModal(true);
  };

  // Abrir modal de edição para equipamento principal
  const openEditEquipamentoPrincipalModal = () => {
    setEditingEquipamento(null);
    setEditingEquipamentoPrincipal(true);
    setEditEquipamentoFormData({
      tipologia: selectedRelatorio.equipamento_tipologia || '',
      marca: selectedRelatorio.equipamento_marca || '',
      modelo: selectedRelatorio.equipamento_modelo || '',
      numero_serie: selectedRelatorio.equipamento_numero_serie || '',
      ano_fabrico: selectedRelatorio.equipamento_ano_fabrico || ''
    });
    setShowEditEquipamentoModal(true);
  };

  // Guardar edição de equipamento
  const handleSaveEditEquipamento = async (e) => {
    e.preventDefault();
    
    try {
      if (editingEquipamentoPrincipal) {
        // Editar equipamento principal (está na própria OT)
        await axios.put(`${API}/relatorios-tecnicos/${selectedRelatorio.id}`, {
          equipamento_tipologia: editEquipamentoFormData.tipologia,
          equipamento_marca: editEquipamentoFormData.marca,
          equipamento_modelo: editEquipamentoFormData.modelo,
          equipamento_numero_serie: editEquipamentoFormData.numero_serie,
          equipamento_ano_fabrico: editEquipamentoFormData.ano_fabrico
        });
        
        // Atualizar estado local
        setSelectedRelatorio({
          ...selectedRelatorio,
          equipamento_tipologia: editEquipamentoFormData.tipologia,
          equipamento_marca: editEquipamentoFormData.marca,
          equipamento_modelo: editEquipamentoFormData.modelo,
          equipamento_numero_serie: editEquipamentoFormData.numero_serie,
          equipamento_ano_fabrico: editEquipamentoFormData.ano_fabrico
        });
        
        toast.success('Equipamento principal atualizado!');
      } else {
        // Editar equipamento secundário
        await axios.put(
          `${API}/relatorios-tecnicos/${selectedRelatorio.id}/equipamentos/${editingEquipamento.id}`,
          editEquipamentoFormData
        );
        
        fetchEquipamentosOT(selectedRelatorio.id);
        toast.success('Equipamento atualizado!');
      }
      
      setShowEditEquipamentoModal(false);
      setEditingEquipamento(null);
      setEditingEquipamentoPrincipal(false);
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
      setMaterialFormData({ descricao: '', quantidade: 1, fornecido_por: 'Cliente', data_utilizacao: '' });
      
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
      fornecido_por: material.fornecido_por,
      data_utilizacao: material.data_utilizacao || ''
    });
    setShowEditMaterialModal(true);
  };

  // ========== Despesas OT Functions ==========

  const fetchDespesas = async (relatorioId) => {
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos/${relatorioId}/despesas`);
      setDespesas(response.data);
    } catch (error) {
      console.error('Erro ao buscar despesas:', error);
    }
  };

  const handleFacturaUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validar tamanho (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ficheiro demasiado grande. Máximo 5MB.');
      return;
    }
    
    setUploadingFactura(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      setDespesaFormData(prev => ({
        ...prev,
        factura_data: reader.result,
        factura_filename: file.name,
        factura_mimetype: file.type
      }));
      setUploadingFactura(false);
      toast.success('Factura carregada!');
    };
    reader.onerror = () => {
      toast.error('Erro ao carregar factura');
      setUploadingFactura(false);
    };
    reader.readAsDataURL(file);
  };

  const handleAddDespesa = async (e) => {
    e.preventDefault();
    
    if (!despesaFormData.descricao || !despesaFormData.valor || !despesaFormData.tecnico_id || !despesaFormData.data) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    
    try {
      await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/despesas`, despesaFormData);
      toast.success('Despesa registada! Admin notificado.');
      fetchDespesas(selectedRelatorio.id);
      setShowAddDespesaModal(false);
      setDespesaFormData({
        tipo: 'outras',
        descricao: '',
        valor: '',
        tecnico_id: '',
        data: new Date().toISOString().split('T')[0],
        factura_data: null,
        factura_filename: null,
        factura_mimetype: null
      });
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const handleUpdateDespesa = async (e) => {
    e.preventDefault();
    
    try {
      await axios.put(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/despesas/${selectedDespesa.id}`,
        despesaFormData
      );
      toast.success('Despesa atualizada!');
      fetchDespesas(selectedRelatorio.id);
      setShowEditDespesaModal(false);
      setSelectedDespesa(null);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const handleDeleteDespesa = async (despesaId) => {
    console.log('handleDeleteDespesa chamado com ID:', despesaId);
    
    if (!despesaId) {
      toast.error('ID da despesa não encontrado');
      return;
    }
    
    if (!window.confirm('Tem certeza que deseja eliminar esta despesa?')) return;
    
    try {
      console.log('Enviando DELETE para:', `${API}/relatorios-tecnicos/${selectedRelatorio.id}/despesas/${despesaId}`);
      await axios.delete(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/despesas/${despesaId}`);
      toast.success('Despesa eliminada!');
      fetchDespesas(selectedRelatorio.id);
    } catch (error) {
      console.error('Erro ao eliminar despesa:', error);
      toast.error(formatErrorMessage(error));
    }
  };

  const openEditDespesaModal = (despesa) => {
    setSelectedDespesa(despesa);
    setDespesaFormData({
      tipo: despesa.tipo || 'outras',
      descricao: despesa.descricao,
      valor: despesa.valor,
      tecnico_id: despesa.tecnico_id,
      data: despesa.data,
      factura_data: despesa.factura_data,
      factura_filename: despesa.factura_filename,
      factura_mimetype: despesa.factura_mimetype
    });
    setShowEditDespesaModal(true);
  };

  const downloadFactura = (despesa) => {
    if (!despesa.factura_data) {
      toast.error('Esta despesa não tem factura');
      return;
    }
    
    const link = document.createElement('a');
    link.href = despesa.factura_data;
    link.download = despesa.factura_filename || 'factura';
    link.click();
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
      
      // Buscar faturas do PC
      try {
        const faturasResponse = await axios.get(`${API}/pedidos-cotacao/${pcId}/faturas`);
        setFaturasPC(faturasResponse.data || []);
      } catch (err) {
        console.error('Erro ao buscar faturas:', err);
        setFaturasPC([]);
      }
    } catch (error) {
      console.error('Erro ao buscar detalhes do PC:', error);
      toast.error('Erro ao carregar detalhes do PC');
    }
  };

  // Funções para faturas do PC
  const handleUploadFatura = async (e) => {
    e.preventDefault();
    if (!faturaFile) {
      toast.error('Selecione um ficheiro');
      return;
    }

    setUploadingFatura(true);
    try {
      const formData = new FormData();
      formData.append('file', faturaFile);
      formData.append('descricao', faturaDescricao);

      await axios.post(`${API}/pedidos-cotacao/${selectedPC.id}/faturas`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Fatura carregada com sucesso!');
      setFaturaFile(null);
      setFaturaDescricao('');
      fetchPCDetalhes(selectedPC.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setUploadingFatura(false);
    }
  };

  const handleDeleteFatura = async (faturaId) => {
    try {
      await axios.delete(`${API}/pedidos-cotacao/${selectedPC.id}/faturas/${faturaId}`);
      toast.success('Fatura removida!');
      fetchPCDetalhes(selectedPC.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const handleViewFatura = (fatura) => {
    // Abrir a fatura numa nova aba
    window.open(`${API}${fatura.fatura_url}`, '_blank');
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

    // Capturar valor diretamente do input para evitar problemas com estado
    const descricaoElement = document.getElementById('foto_pc_descricao');
    const descricao = descricaoElement ? descricaoElement.value : fotoPCDescricao;

    setUploadingFotoPC(true);
    try {
      const formData = new FormData();
      formData.append('file', fotoPCFile);
      formData.append('descricao', descricao);

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

  // Funções para editar material do PC
  const openEditMaterialPCModal = (material) => {
    setEditMaterialPC(material);
    setEditMaterialPCForm({
      descricao: material.descricao,
      quantidade: material.quantidade
    });
    setShowEditMaterialPCModal(true);
  };

  const handleUpdateMaterialPC = async () => {
    if (!editMaterialPC || !editMaterialPCForm.descricao.trim()) {
      toast.error('Preencha a descrição do material');
      return;
    }
    if (editMaterialPCForm.quantidade <= 0) {
      toast.error('A quantidade deve ser maior que zero');
      return;
    }

    try {
      await axios.put(
        `${API}/relatorios-tecnicos/${editMaterialPC.relatorio_id}/materiais/${editMaterialPC.id}`,
        {
          descricao: editMaterialPCForm.descricao,
          quantidade: editMaterialPCForm.quantidade
        }
      );
      toast.success('Material atualizado com sucesso!');
      setShowEditMaterialPCModal(false);
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

  const handleDeletePC = async (pcId, pcNumero) => {
    if (!window.confirm(`Tem certeza que deseja eliminar o PC ${pcNumero}? Esta ação não pode ser desfeita.`)) {
      return;
    }
    
    try {
      await axios.delete(`${API}/pedidos-cotacao/${pcId}`);
      toast.success(`PC ${pcNumero} eliminado com sucesso!`);
      fetchAllPCs();
      // Se estava visualizando, fechar o modal
      if (selectedPC?.id === pcId) {
        setShowPCModal(false);
        setSelectedPC(null);
      }
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const openPCFromList = async (pc) => {
    await fetchPCDetalhes(pc.id);
    setShowPCModal(true);
  };

  // ========== Assinatura Functions ==========
  
  const fetchAssinaturas = async (relatorioId) => {
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos/${relatorioId}/assinaturas`);
      setAssinaturas(response.data || []);
    } catch (error) {
      console.error('Erro ao buscar assinaturas:', error);
      setAssinaturas([]);
    }
  };

  const handleDeleteAssinatura = async (assinaturaId) => {
    if (!selectedRelatorio) return;
    
    if (!window.confirm('Tem a certeza que deseja eliminar esta assinatura?')) {
      return;
    }
    
    try {
      await axios.delete(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinaturas/${assinaturaId}`);
      toast.success('Assinatura eliminada com sucesso!');
      // Atualizar lista de assinaturas
      await fetchAssinaturas(selectedRelatorio.id);
    } catch (error) {
      console.error('Erro ao eliminar assinatura:', error);
      toast.error('Erro ao eliminar assinatura');
    }
  };

  const handleUpdateAssinaturaNome = async (assinaturaId) => {
    if (!selectedRelatorio) return;
    
    const nomeCompleto = `${editingNomeData.primeiro_nome} ${editingNomeData.ultimo_nome}`.trim();
    
    try {
      await axios.put(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinaturas/${assinaturaId}`, {
        primeiro_nome: editingNomeData.primeiro_nome,
        ultimo_nome: editingNomeData.ultimo_nome,
        assinado_por: nomeCompleto  // Também atualizar assinado_por
      });
      toast.success('Nome atualizado com sucesso!');
      setEditingAssinaturaNome(null);
      await fetchAssinaturas(selectedRelatorio.id);
    } catch (error) {
      console.error('Erro ao atualizar nome:', error);
      toast.error('Erro ao atualizar nome');
    }
  };

  // ========== Fetch All System Users (para Cronómetros) ==========
  
  const fetchAllSystemUsers = async () => {
    try {
      // Usar endpoint /users que está disponível para todos os utilizadores autenticados
      const response = await axios.get(`${API}/users`);
      setAllSystemUsers(response.data);
    } catch (error) {
      console.error('Erro ao buscar utilizadores do sistema:', error);
      setAllSystemUsers([]);
    }
  };

  // ========== Cronómetro Functions ==========

  const fetchCronometros = async (relatorioId) => {
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos/${relatorioId}/cronometros`);
      setCronometrosAtivos(response.data);
      
      // Recalcular timers apenas para cronómetros ativos (limpa os antigos)
      const newTimers = {};
      response.data.forEach(crono => {
        const horaInicio = new Date(crono.hora_inicio);
        const agora = new Date();
        const diffMs = agora - horaInicio;
        newTimers[`${crono.tecnico_id}_${crono.tipo}`] = Math.floor(diffMs / 1000);
      });
      setTimers(newTimers); // Substitui completamente, removendo timers de cronómetros parados
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

  // Iniciar cronómetro após criar nova OT (não depende de selectedRelatorio)
  const handleIniciarCronoNovaOT = async () => {
    if (!novaOTParaCrono || cronoTecnicosSelecionados.length === 0) {
      toast.error('Selecione pelo menos um técnico');
      return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const tecnico of cronoTecnicosSelecionados) {
      try {
        await axios.post(`${API}/relatorios-tecnicos/${novaOTParaCrono.id}/cronometro/iniciar`, {
          tipo: cronoTipo,
          tecnico_id: tecnico.id,
          tecnico_nome: tecnico.nome
        });
        successCount++;
      } catch (error) {
        console.error(`Erro ao iniciar cronómetro para ${tecnico.nome}:`, error);
        errorCount++;
      }
    }
    
    if (successCount > 0) {
      const tipoLabel = cronoTipo === 'trabalho' ? 'Trabalho' : 'Viagem';
      toast.success(`Cronómetro de ${tipoLabel} iniciado para ${successCount} técnico(s)!`);
    }
    if (errorCount > 0) {
      toast.error(`Falha ao iniciar cronómetro para ${errorCount} técnico(s)`);
    }
    
    setShowIniciarCronoModal(false);
    setNovaOTParaCrono(null);
    setCronoTecnicosSelecionados([]);
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

  // Criar registo manual com segmentação automática
  const handleAddRegistoManual = async () => {
    if (!addRegistoManualForm.tecnico_id || !addRegistoManualForm.hora_inicio || !addRegistoManualForm.hora_fim) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      // Calcular total de KMs
      const kmsIda = Math.max(0, (addRegistoManualForm.kms_final || 0) - (addRegistoManualForm.kms_inicial || 0));
      const kmsVolta = Math.max(0, (addRegistoManualForm.kms_final_volta || 0) - (addRegistoManualForm.kms_inicial_volta || 0));
      
      const dataToSend = {
        ...addRegistoManualForm,
        km: kmsIda + kmsVolta
      };
      
      const response = await axios.post(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/registos-tecnicos`,
        dataToSend
      );
      
      const numRegistos = response.data.registos?.length || 1;
      if (numRegistos > 1) {
        toast.success(`${numRegistos} registos criados (segmentação automática)`);
      } else {
        toast.success('Registo criado!');
      }
      
      setShowAddRegistoManualModal(false);
      setAddRegistoManualForm({
        tecnico_id: '',
        tecnico_nome: '',
        tipo: 'trabalho',
        data: new Date().toISOString().split('T')[0],
        hora_inicio: '09:00',
        hora_fim: '18:00',
        km: 0,
        kms_inicial: 0,
        kms_final: 0,
        kms_inicial_volta: 0,
        kms_final_volta: 0,
        incluir_pausa: false
      });
      fetchRegistosTecnicos(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const openEditRegistoModal = (registo) => {
    setEditingRegisto(registo);
    // Converter horas para minutos se existir horas_arredondadas
    const minutos = registo.minutos_trabalhados || Math.round((registo.horas_arredondadas || 0) * 60);
    
    // Extrair hora início e fim do registo (formato HH:MM)
    let horaInicio = '';
    let horaFim = '';
    
    if (registo.hora_inicio_segmento) {
      // Se é string ISO, extrair a hora
      const dt = new Date(registo.hora_inicio_segmento);
      horaInicio = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    }
    
    if (registo.hora_fim_segmento) {
      const dt = new Date(registo.hora_fim_segmento);
      horaFim = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    }
    
    setEditRegistoForm({
      minutos_trabalhados: minutos,
      km: registo.km || 0,
      kms_inicial: registo.kms_inicial || 0,
      kms_final: registo.kms_final || 0,
      kms_inicial_volta: registo.kms_inicial_volta || 0,
      kms_final_volta: registo.kms_final_volta || 0,
      codigo: registo.codigo || '',
      hora_inicio: horaInicio,
      hora_fim: horaFim,
      incluir_pausa: registo.incluir_pausa || false
    });
    setShowEditRegistoModal(true);
  };

  const handleUpdateRegisto = async () => {
    if (!editingRegisto) return;
    
    // Calcular km total (ida + volta)
    const kmsIda = Math.max(0, parseFloat(editRegistoForm.kms_final || 0) - parseFloat(editRegistoForm.kms_inicial || 0));
    const kmsVolta = Math.max(0, parseFloat(editRegistoForm.kms_final_volta || 0) - parseFloat(editRegistoForm.kms_inicial_volta || 0));
    const kmTotal = kmsIda + kmsVolta;
    
    // Preparar dados para envio
    const updatePayload = {
      km: kmTotal,
      kms_inicial: parseFloat(editRegistoForm.kms_inicial || 0),
      kms_final: parseFloat(editRegistoForm.kms_final || 0),
      kms_inicial_volta: parseFloat(editRegistoForm.kms_inicial_volta || 0),
      kms_final_volta: parseFloat(editRegistoForm.kms_final_volta || 0),
      incluir_pausa: editRegistoForm.incluir_pausa
    };
    
    // Se temos hora início e fim, enviar para recalcular duração e código
    if (editRegistoForm.hora_inicio && editRegistoForm.hora_fim) {
      updatePayload.hora_inicio = editRegistoForm.hora_inicio;
      updatePayload.hora_fim = editRegistoForm.hora_fim;
      // Obter data do registo para enviar ao backend
      if (editingRegisto.data) {
        const dataStr = typeof editingRegisto.data === 'string' 
          ? editingRegisto.data.substring(0, 10) 
          : new Date(editingRegisto.data).toISOString().substring(0, 10);
        updatePayload.data = dataStr;
      }
    } else {
      // Sem horas, usar minutos_trabalhados e codigo existentes
      updatePayload.minutos_trabalhados = parseInt(editRegistoForm.minutos_trabalhados);
      updatePayload.codigo = editRegistoForm.codigo;
    }
    
    try {
      await axios.put(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/registos-tecnicos/${editingRegisto.id}`, updatePayload);
      
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
    if (cronometrosAtivos.length === 0) {
      // Limpar todos os timers se não há cronómetros ativos
      setTimers({});
      return;
    }
    
    // Criar set de keys de cronómetros ativos para validação
    const activeKeys = new Set(
      cronometrosAtivos.map(crono => `${crono.tecnico_id}_${crono.tipo}`)
    );
    
    const interval = setInterval(() => {
      setTimers(prevTimers => {
        const newTimers = {};
        // Só incrementar timers que correspondem a cronómetros ativos
        activeKeys.forEach(key => {
          newTimers[key] = (prevTimers[key] || 0) + 1;
        });
        return newTimers;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [cronometrosAtivos]);

  // ========== Assinatura Functions ==========

  const openAssinaturaModal = () => {
    setShowAssinaturaModal(true);
  };


  // ========== Folha de Horas Functions ==========

  const handleOpenFolhaHoras = async () => {
    if (!selectedRelatorio) return;
    
    setLoadingFolhaHoras(true);
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/folha-horas-data`);
      setFolhaHorasData(response.data);
      
      // Inicializar tarifas vazias para cada técnico
      const tarifasIniciais = {};
      response.data.tecnicos.forEach(tec => {
        tarifasIniciais[tec.id] = '';
      });
      setFolhaHorasTarifas(tarifasIniciais);
      
      // Inicializar extras vazios para cada técnico/data, mas pré-preencher despesas e portagens do backend
      const despesasPorTecnicoData = response.data.despesas_por_tecnico_data || {};
      const portagensPorTecnicoData = response.data.portagens_por_tecnico_data || {};
      const extrasIniciais = {};
      
      // Primeiro, inicializar para todos os técnicos que têm registos de trabalho
      Object.entries(response.data.datas_por_tecnico || {}).forEach(([tecnicoId, datas]) => {
        datas.forEach(data => {
          const key = `${tecnicoId}_${data}`;
          const despesaValue = despesasPorTecnicoData[key] || 0;
          const portagensValue = portagensPorTecnicoData[key] || 0;
          extrasIniciais[key] = { 
            dieta: '', 
            portagens: portagensValue > 0 ? portagensValue.toFixed(2) : '', 
            despesas: despesaValue > 0 ? despesaValue.toFixed(2) : '' 
          };
        });
      });
      
      // Depois, adicionar entradas para técnicos que têm despesas mas não têm registos de trabalho
      Object.keys(despesasPorTecnicoData).forEach(key => {
        if (!extrasIniciais[key]) {
          const despesaValue = despesasPorTecnicoData[key] || 0;
          const portagensValue = portagensPorTecnicoData[key] || 0;
          extrasIniciais[key] = { 
            dieta: '', 
            portagens: portagensValue > 0 ? portagensValue.toFixed(2) : '', 
            despesas: despesaValue > 0 ? despesaValue.toFixed(2) : '' 
          };
        }
      });
      
      // Adicionar também para portagens que não têm despesas
      Object.keys(portagensPorTecnicoData).forEach(key => {
        if (!extrasIniciais[key]) {
          const despesaValue = despesasPorTecnicoData[key] || 0;
          const portagensValue = portagensPorTecnicoData[key] || 0;
          extrasIniciais[key] = { 
            dieta: '', 
            portagens: portagensValue > 0 ? portagensValue.toFixed(2) : '', 
            despesas: despesaValue > 0 ? despesaValue.toFixed(2) : '' 
          };
        }
      });
      
      setFolhaHorasExtras(extrasIniciais);
      
      setShowFolhaHorasModal(true);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados para Folha de Horas');
    } finally {
      setLoadingFolhaHoras(false);
    }
  };

  const handleGenerateFolhaHoras = async (tableId = 1) => {
    if (!selectedRelatorio || !folhaHorasData) return;
    
    // Preparar dados
    const tarifasPorTecnico = {};
    Object.entries(folhaHorasTarifas).forEach(([tecnicoId, valor]) => {
      if (valor) {
        tarifasPorTecnico[tecnicoId] = parseFloat(valor);
      }
    });
    
    const dadosExtras = {};
    Object.entries(folhaHorasExtras).forEach(([chave, valores]) => {
      dadosExtras[chave] = {
        dieta: parseFloat(valores.dieta) || 0,
        portagens: parseFloat(valores.portagens) || 0,
        despesas: parseFloat(valores.despesas) || 0
      };
    });
    
    setGeneratingFolhaHoras(true);
    try {
      const response = await axios.post(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/folha-horas-pdf`,
        {
          tarifas_por_tecnico: tarifasPorTecnico,
          dados_extras: dadosExtras,
          table_id: tableId  // Incluir o ID da tabela de preço selecionada
        },
        { responseType: 'blob' }
      );
      
      // Download do PDF
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `FolhaHoras_OT${selectedRelatorio.numero_assistencia}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('Folha de Horas gerada com sucesso!');
      setShowFolhaHorasModal(false);
    } catch (error) {
      console.error('Erro ao gerar Folha de Horas:', error);
      toast.error('Erro ao gerar Folha de Horas');
    } finally {
      setGeneratingFolhaHoras(false);
    }
  };

  const updateFolhaHorasTarifa = (tecnicoId, valor) => {
    setFolhaHorasTarifas(prev => ({
      ...prev,
      [tecnicoId]: valor
    }));
  };

  const updateFolhaHorasExtra = (chave, campo, valor) => {
    setFolhaHorasExtras(prev => ({
      ...prev,
      [chave]: {
        ...prev[chave],
        [campo]: valor
      }
    }));
  };


  // ========== Visualizar PDF Functions ==========
  
  const handlePreviewPDF = async () => {
    if (!selectedRelatorio) return;
    
    setLoadingPDFPreview(true);
    try {
      const response = await axios.get(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/preview-pdf`,
        { responseType: 'blob' }
      );
      
      // Criar URL do blob para visualização
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setShowPDFPreviewModal(true);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF para visualização');
    } finally {
      setLoadingPDFPreview(false);
    }
  };

  const closePDFPreview = () => {
    setShowPDFPreviewModal(false);
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  };

  // ========== Visualização PDF Real (para cliente ver antes de assinar) ==========
  
  const handlePDFViewer = async () => {
    if (!selectedRelatorio) return;
    
    setLoadingPDFViewer(true);
    try {
      const response = await axios.get(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/preview-pdf`,
        { responseType: 'blob' }
      );
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      
      // Abrir PDF numa nova aba para visualização
      window.open(url, '_blank');
      
      // Libertar URL após um pequeno delay para garantir que a aba abriu
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 1000);
      
    } catch (error) {
      console.error('Erro ao carregar PDF:', error);
      toast.error('Erro ao carregar PDF para visualização');
    } finally {
      setLoadingPDFViewer(false);
    }
  };
  
  const closePDFViewer = () => {
    setShowPDFViewerModal(false);
    if (pdfViewerUrl) {
      window.URL.revokeObjectURL(pdfViewerUrl);
      setPdfViewerUrl(null);
    }
  };

  // ========== Visualização HTML estilo PDF ==========
  
  const handleHTMLPreview = async () => {
    if (!selectedRelatorio) return;
    
    setLoadingHTMLPreview(true);
    try {
      // Buscar todos os dados necessários (incluindo registos manuais)
      const [intervRes, fotosRes, equipRes, materiaisRes, registosRes, tecnicosRes] = await Promise.all([
        axios.get(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/intervencoes`),
        axios.get(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/fotografias`),
        axios.get(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/equipamentos`),
        axios.get(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/materiais`),
        axios.get(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/registos-tecnicos`),
        axios.get(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/tecnicos`)
      ]);
      
      // Combinar registos de cronómetro e manuais
      const allRegistos = [
        // Registos de cronómetro
        ...registosRes.data.map(reg => ({
          ...reg,
          _tipo: reg.tipo,
          _hora_sort: reg.hora_inicio_segmento || ''
        })),
        // Registos manuais
        ...tecnicosRes.data.map(tec => ({
          id: tec.id,
          tecnico_nome: tec.tecnico_nome,
          tipo: tec.tipo_registo || 'manual',
          data: tec.data_trabalho,
          hora_inicio_segmento: tec.hora_inicio,
          hora_fim_segmento: tec.hora_fim,
          minutos_trabalhados: tec.minutos_cliente,
          km: tec.kms_deslocacao || (Math.max(0, (tec.kms_final || 0) - (tec.kms_inicial || 0))),
          codigo: tec.tipo_horario,
          _tipo: tec.tipo_registo || 'manual',
          _hora_sort: tec.hora_inicio || ''
        }))
      ].sort((a, b) => {
        // Ordenar por data primeiro
        const dataA = new Date(a.data || '1970-01-01');
        const dataB = new Date(b.data || '1970-01-01');
        if (dataA.getTime() !== dataB.getTime()) return dataA - dataB;
        // Depois por hora (registos sem hora ficam no final)
        const horaA = a._hora_sort || a.hora_inicio_segmento || '99:99';
        const horaB = b._hora_sort || b.hora_inicio_segmento || '99:99';
        return horaA.localeCompare(horaB);
      });
      
      setHtmlPreviewData({
        relatorio: selectedRelatorio,
        intervencoes: intervRes.data,
        fotografias: fotosRes.data,
        equipamentos: equipRes.data,
        materiais: materiaisRes.data,
        registos: allRegistos
      });
      
      // Buscar assinaturas existentes
      try {
        const assRes = await axios.get(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinaturas`);
        setHtmlPreviewData(prev => ({
          ...prev,
          assinaturas: assRes.data
        }));
      } catch (err) {
        console.log('Sem assinaturas ou erro ao buscar');
      }
      
      setShowHTMLPreviewModal(true);
      
      // Inicializar canvas de assinatura após modal abrir
      setTimeout(() => {
        initSignatureCanvas();
      }, 100);
      
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados para visualização');
    } finally {
      setLoadingHTMLPreview(false);
    }
  };

  const openSignatureFromPreview = () => {
    // Fechar preview e abrir modal de assinaturas
    setShowHTMLPreviewModal(false);
    setShowAssinaturaModal(true);
  };
  
  // ========== Canvas de Assinatura no HTML Preview ==========
  
  const initSignatureCanvas = () => {
    const canvas = htmlSignatureCanvasRef.current;
    if (!canvas) return;
    
    // Ajustar resolução do canvas para alta qualidade
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Guardar dimensões atuais
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // Guardar dimensões CSS para cálculos de coordenadas
    canvas.dataset.cssWidth = rect.width;
    canvas.dataset.cssHeight = rect.height;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.scale(dpr, dpr);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };
  
  // Reinicializar canvas quando a orientação muda
  useEffect(() => {
    const handleResize = () => {
      // Pequeno delay para deixar o browser atualizar o layout
      setTimeout(() => {
        initSignatureCanvas();
      }, 100);
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);
  
  const getCanvasCoordinates = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    // Calcular coordenadas relativas ao canvas atual
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    // Escalar coordenadas se o canvas foi redimensionado
    const scaleX = (parseFloat(canvas.dataset.cssWidth) || rect.width) / rect.width;
    const scaleY = (parseFloat(canvas.dataset.cssHeight) || rect.height) / rect.height;
    
    return {
      x: x * scaleX,
      y: y * scaleY
    };
  };
  
  const startDrawing = (e) => {
    e.preventDefault();
    const canvas = htmlSignatureCanvasRef.current;
    if (!canvas) return;
    
    setIsDrawingSignature(true);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const coords = getCanvasCoordinates(e, canvas);
    
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };
  
  const draw = (e) => {
    e.preventDefault();
    if (!isDrawingSignature) return;
    
    const canvas = htmlSignatureCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const coords = getCanvasCoordinates(e, canvas);
    
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };
  
  const stopDrawing = (e) => {
    if (e) e.preventDefault();
    setIsDrawingSignature(false);
  };
  
  const clearSignatureCanvas = () => {
    const canvas = htmlSignatureCanvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, rect.width, rect.height);
  };
  
  const saveHtmlSignature = async () => {
    const canvas = htmlSignatureCanvasRef.current;
    if (!canvas) return;
    
    if (!htmlSignatureName.trim()) {
      toast.error('Por favor, insira o nome do signatário');
      return;
    }
    
    // Verificar se há alguma assinatura desenhada
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    let hasDrawing = false;
    
    for (let i = 0; i < pixels.length; i += 4) {
      // Verificar se pixel não é branco
      if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) {
        hasDrawing = true;
        break;
      }
    }
    
    if (!hasDrawing) {
      toast.error('Por favor, desenhe a sua assinatura');
      return;
    }
    
    setSavingHtmlSignature(true);
    try {
      const assinaturaBase64 = canvas.toDataURL('image/png');
      const nameParts = htmlSignatureName.trim().split(' ');
      const primeiroNome = nameParts[0] || '';
      const ultimoNome = nameParts.slice(1).join(' ') || '';
      
      // Enviar assinatura para o servidor
      const formData = new FormData();
      
      // Converter base64 para blob
      const response = await fetch(assinaturaBase64);
      const blob = await response.blob();
      formData.append('file', blob, 'assinatura.png');
      formData.append('primeiro_nome', primeiroNome);
      formData.append('ultimo_nome', ultimoNome);
      formData.append('data_intervencao', new Date().toISOString().split('T')[0]);
      
      await axios.post(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinatura-digital`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      
      toast.success('Assinatura guardada com sucesso!');
      
      // Limpar canvas e nome
      clearSignatureCanvas();
      setHtmlSignatureName('');
      
      // Recarregar dados do preview
      handleHTMLPreview();
      
    } catch (error) {
      console.error('Erro ao guardar assinatura:', error);
      toast.error('Erro ao guardar assinatura');
    } finally {
      setSavingHtmlSignature(false);
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
      'agendado': 'text-cyan-400 bg-cyan-500/10',
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
      'agendado': 'Agendado',
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
    <div className={`min-h-screen ${bgMain} ${isMobile ? 'mobile-safe-top' : ''}`}>
      {/* Navigation - escondida em mobile (usa bottom nav) */}
      {!isMobile && <Navigation user={user} onLogout={onLogout} />}
      
      <div className={`container mx-auto ${isMobile ? 'px-4 py-4 pb-24' : 'p-6'} max-w-7xl`}>
        {/* Offline Status Bar */}
        <OfflineStatusBar 
          isOnline={isOnline}
          isSyncing={isSyncing}
          pendingCount={pendingCount}
          lastSyncTime={lastSyncTime}
          onSync={forceSync}
        />
        
        {/* Header - Responsivo */}
        <div className={`${isMobile ? 'mb-4' : 'mb-8'}`}>
          <div className={`flex items-center gap-3 ${isMobile ? 'mb-1' : 'mb-2'}`}>
            <div className={`bg-gradient-to-br from-blue-500 to-blue-600 ${isMobile ? 'p-2' : 'p-3'} rounded-xl`}>
              <FileText className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} text-white`} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className={`${isMobile ? 'text-xl' : 'text-3xl'} font-bold ${textPrimary} truncate`}>
                {isMobile ? 'OTs' : 'OTs - Ordens de Trabalho'}
              </h1>
              {!isMobile && <p className={textSecondary}>Gestão de Assistências Técnicas</p>}
            </div>
            {/* Indicador de estado compacto */}
            <div className={`flex items-center gap-2 ${bgCard} ${isMobile ? 'px-2 py-1.5' : 'px-3 py-2'} rounded-lg border ${borderColor}`}>
              {isOnline ? (
                <Wifi className="w-4 h-4 text-green-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-amber-400 animate-pulse" />
              )}
              {!isMobile && (
                <span className={`text-sm ${isOnline ? 'text-green-400' : 'text-amber-400'}`}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              )}
              {pendingCount > 0 && (
                <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                  {pendingCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tabs/Sections - Mobile: Horizontal Scroll */}
        <div className={`${isMobile ? 'mb-4' : 'mb-6'}`}>
          <div className={`flex ${isMobile ? 'gap-1 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide' : 'gap-4'} border-b ${borderColor}`}>
            <button
              onClick={() => setActiveTab('clientes')}
              className={`${isMobile ? 'px-3 py-2 text-sm whitespace-nowrap flex-shrink-0' : 'px-4 py-3'} font-semibold transition ${
                activeTab === 'clientes'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : `${textSecondary} hover:${textPrimary}`
              }`}
              data-testid="tab-clientes"
            >
              <Building2 className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} inline mr-1.5`} />
              Clientes
            </button>
            <button
              onClick={() => setActiveTab('relatorios')}
              className={`${isMobile ? 'px-3 py-2 text-sm whitespace-nowrap flex-shrink-0' : 'px-4 py-3'} font-semibold transition ${
                activeTab === 'relatorios'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : `${textSecondary} hover:${textPrimary}`
              }`}
              data-testid="tab-ots"
            >
              <FileText className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} inline mr-1.5`} />
              {isMobile ? 'OTs' : 'Ordens de Trabalho'}
            </button>
            <button
              onClick={() => setActiveTab('pesquisa')}
              className={`${isMobile ? 'px-3 py-2 text-sm whitespace-nowrap flex-shrink-0' : 'px-4 py-3'} font-semibold transition ${
                activeTab === 'pesquisa'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : `${textSecondary} hover:${textPrimary}`
              }`}
              data-testid="tab-pesquisa"
            >
              <Search className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} inline mr-1.5`} />
              {isMobile ? 'Estados' : 'Pesquisa por Estado'}
            </button>
            <button
              onClick={() => {
                setActiveTab('pedidos-cotacao');
                fetchAllPCs();
              }}
              className={`${isMobile ? 'px-3 py-2 text-sm whitespace-nowrap flex-shrink-0' : 'px-4 py-3'} font-semibold transition ${
                activeTab === 'pedidos-cotacao'
                  ? 'text-yellow-400 border-b-2 border-yellow-400'
                  : `${textSecondary} hover:${textPrimary}`
              }`}
              data-testid="tab-pcs"
            >
              <FileText className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} inline mr-1.5`} />
              {isMobile ? 'PCs' : 'Pedidos de Cotação'}
            </button>
          </div>
        </div>

        {/* Clientes Section */}
        {activeTab === 'clientes' && (
        <div className={`${isDark ? 'glass-effect' : 'bg-white shadow-lg border ' + borderColor} ${isMobile ? 'p-4' : 'p-6'} rounded-xl`}>
          {/* Search and Add */}
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                type="text"
                placeholder={isMobile ? "Buscar cliente..." : "Buscar cliente por nome, email ou NIF..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`pl-10 ${bgCard} ${borderColor} ${textPrimary} ${isMobile ? 'text-sm' : ''}`}
              />
            </div>
            <div className={`flex gap-2 ${isMobile ? 'flex-wrap' : ''}`}>
              {user?.is_admin && !isMobile && (
                <>
                  <Button
                    onClick={handleDownloadClientesPDF}
                    disabled={downloadingClientesPDF || clientes.length === 0}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    data-testid="export-clientes-pdf-btn"
                  >
                    {downloadingClientesPDF ? (
                      <>
                        <span className="animate-spin mr-2">⏳</span>
                        A exportar...
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5 mr-2" />
                        Exportar PDF
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleDownloadEmailsPDF}
                    disabled={downloadingEmailsPDF || clientes.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    data-testid="download-emails-pdf-btn"
                  >
                    {downloadingEmailsPDF ? (
                      <>
                        <span className="animate-spin mr-2">⏳</span>
                        A exportar...
                      </>
                    ) : (
                      <>
                        <Mail className="w-5 h-5 mr-2" />
                        Download Emails
                      </>
                    )}
                  </Button>
                </>
              )}
              <Button
                onClick={() => setShowAddModal(true)}
                className={`bg-blue-500 hover:bg-blue-600 text-white ${isMobile ? 'flex-1' : ''}`}
                data-testid="add-cliente-btn"
              >
                <Plus className={`${isMobile ? 'w-4 h-4 mr-1' : 'w-5 h-5 mr-2'}`} />
                {isMobile ? 'Novo Cliente' : 'Adicionar Cliente'}
              </Button>
            </div>
          </div>

          {/* Clientes List */}
          {loading ? (
            <div className="text-center py-8">
              <div className={`inline-block animate-spin rounded-full ${isMobile ? 'h-8 w-8' : 'h-12 w-12'} border-4 border-blue-500 border-t-transparent`}></div>
              <p className={`${textSecondary} mt-4 ${isMobile ? 'text-sm' : ''}`}>A carregar clientes...</p>
            </div>
          ) : filteredClientes.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className={`${isMobile ? 'w-12 h-12' : 'w-16 h-16'} text-gray-600 mx-auto mb-4`} />
              <p className={`${textSecondary} ${isMobile ? 'text-base' : 'text-lg'}`}>
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
            <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}`}>
              {filteredClientes.map((cliente) => (
                <div
                  key={cliente.id}
                  className={`${bgCard} border ${borderColor} rounded-lg ${isMobile ? 'p-3' : 'p-4'} hover:border-blue-500 transition`}
                  data-testid={`cliente-card-${cliente.id}`}
                >
                  {/* Cliente Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className={`bg-blue-500/10 ${isMobile ? 'p-1.5' : 'p-2'} rounded-lg flex-shrink-0`}>
                        <Building2 className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-blue-400`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className={`${textPrimary} font-semibold ${isMobile ? 'text-sm' : ''} truncate`}>{cliente.nome}</h3>
                        {cliente.nif && (
                          <p className="text-xs text-gray-400">NIF: {cliente.nif}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Cliente Info */}
                  <div className={`space-y-1.5 ${isMobile ? 'mb-2' : 'mb-4'}`}>
                    {cliente.email && (
                      <div className={`flex items-center gap-2 ${isMobile ? 'text-xs' : 'text-sm'} ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        <Mail className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} text-gray-400 flex-shrink-0`} />
                        <span className="truncate">{cliente.email}</span>
                      </div>
                    )}
                    {cliente.telefone && (
                      <div className={`flex items-center gap-2 ${isMobile ? 'text-xs' : 'text-sm'} ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        <Phone className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} text-gray-400 flex-shrink-0`} />
                        <span>{cliente.telefone}</span>
                      </div>
                    )}
                    {cliente.morada && !isMobile && (
                      <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{cliente.morada}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className={`flex gap-2 pt-2 border-t ${borderColor}`}>
                    <Button
                      onClick={() => openViewModal(cliente)}
                      variant="outline"
                      size="sm"
                      className={`flex-1 ${isDark ? 'border-gray-600 hover:border-blue-500 hover:bg-blue-500/10' : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'} ${isMobile ? 'text-xs py-1.5' : ''}`}
                    >
                      <User className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-1'}`} />
                      Ver
                    </Button>
                    
                    <Button
                      onClick={() => openEditModal(cliente)}
                      variant="outline"
                      size="sm"
                      className={`${isDark ? 'border-gray-600 hover:border-blue-500 hover:bg-blue-500/10' : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'} ${isMobile ? 'p-1.5' : ''}`}
                    >
                      <Edit className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} />
                    </Button>
                    
                    {user?.is_admin && (
                      <Button
                        onClick={() => openDeleteModal(cliente)}
                        variant="outline"
                        size="sm"
                        className={`${isDark ? 'border-gray-600' : 'border-gray-300'} hover:border-red-500 hover:bg-red-500/10 hover:text-red-400 ${isMobile ? 'p-1.5' : ''}`}
                      >
                        <Trash2 className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} />
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
        <div className={`${isDark ? 'glass-effect' : 'bg-white shadow-lg border ' + borderColor} ${isMobile ? 'p-4' : 'p-6'} rounded-xl`}>
          {/* Search and Add */}
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                type="text"
                placeholder={isMobile ? "Buscar OT..." : "Buscar por número, cliente ou local de intervenção..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`pl-10 ${bgCard} ${borderColor} ${textPrimary} ${isMobile ? 'text-sm' : ''}`}
              />
            </div>
            <Button
              onClick={() => setShowAddRelatorioModal(true)}
              className={`bg-blue-500 hover:bg-blue-600 text-white ${isMobile ? 'w-full' : ''}`}
              data-testid="add-ot-btn"
            >
              <Plus className={`${isMobile ? 'w-4 h-4 mr-1' : 'w-5 h-5 mr-2'}`} />
              Nova OT
            </Button>
          </div>

          {/* Relatórios List */}
          {loading ? (
            <div className="text-center py-8">
              <div className={`inline-block animate-spin rounded-full ${isMobile ? 'h-8 w-8' : 'h-12 w-12'} border-4 border-blue-500 border-t-transparent`}></div>
              <p className={`${textSecondary} mt-4 ${isMobile ? 'text-sm' : ''}`}>A carregar OTs...</p>
            </div>
          ) : relatorios.length === 0 ? (
            <div className="text-center py-8">
              <FileText className={`${isMobile ? 'w-12 h-12' : 'w-16 h-16'} text-gray-600 mx-auto mb-4`} />
              <p className={`${textSecondary} ${isMobile ? 'text-base' : 'text-lg'}`}>Nenhuma OT criada</p>
              <Button
                onClick={() => setShowAddRelatorioModal(true)}
                className="mt-4 bg-blue-500 hover:bg-blue-600"
              >
                <Plus className="w-5 h-5 mr-2" />
                Criar Primeira OT
              </Button>
            </div>
          ) : (
            <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}`}>
              {relatorios
                .filter((relatorio) => {
                  if (!searchTerm.trim()) return true;
                  const search = searchTerm.toLowerCase().trim();
                  // Pesquisar por número da OT
                  const matchNumero = relatorio.numero_assistencia?.toString().includes(search);
                  // Pesquisar por nome do cliente
                  const matchCliente = relatorio.cliente_nome?.toLowerCase().includes(search);
                  // Pesquisar por local de intervenção (campo preenchido ao criar OT)
                  const matchLocalIntervencao = relatorio.local_intervencao?.toLowerCase().includes(search);
                  // Pesquisar por local/morada do cliente
                  const matchLocalCliente = relatorio.cliente_local?.toLowerCase().includes(search);
                  return matchNumero || matchCliente || matchLocalIntervencao || matchLocalCliente;
                })
                .map((relatorio) => (
                <div
                  key={relatorio.id}
                  className={`${bgCard} border ${borderColor} rounded-lg ${isMobile ? 'p-3' : 'p-4'} hover:border-blue-500 transition`}
                  data-testid={`ot-card-${relatorio.id}`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="cursor-pointer flex-1 min-w-0" onClick={() => openViewRelatorioModal(relatorio)}>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-blue-400 font-bold ${isMobile ? 'text-base' : 'text-lg'}`}>
                          #{relatorio.numero_assistencia}
                        </span>
                        <span 
                          className={`text-xs px-2 py-0.5 rounded cursor-pointer hover:opacity-80 transition ${getStatusColor(relatorio.status)}`}
                          onClick={(e) => openStatusModal(relatorio, e)}
                          title="Clique para alterar status"
                        >
                          {getStatusLabel(relatorio.status)}
                        </span>
                      </div>
                      <p className={`${isMobile ? 'text-xs' : 'text-sm'} ${textSecondary}`}>
                        {new Date(relatorio.data_servico).toLocaleDateString('pt-PT')}
                      </p>
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex gap-1 ml-2 flex-shrink-0">
                      <Button
                        onClick={(e) => openEditRelatorioModal(relatorio, e)}
                        variant="outline"
                        size="sm"
                        className={`${isDark ? 'border-gray-600 hover:border-blue-500 hover:bg-blue-500/10' : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'} ${isMobile ? 'p-1.5' : 'p-2'}`}
                      >
                        <Edit className={`${isMobile ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
                      </Button>
                      
                      {user?.is_admin && (
                        <Button
                          onClick={(e) => openDeleteRelatorioModal(relatorio, e)}
                          variant="outline"
                          size="sm"
                          className={`${isDark ? 'border-gray-600' : 'border-gray-300'} hover:border-red-500 hover:bg-red-500/10 hover:text-red-400 ${isMobile ? 'p-1.5' : 'p-2'}`}
                        >
                          <Trash2 className={`${isMobile ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Cliente */}
                  <div className={`${isMobile ? 'mb-2' : 'mb-3'} cursor-pointer`} onClick={() => openViewRelatorioModal(relatorio)}>
                    <p className={`${textPrimary} font-semibold ${isMobile ? 'text-sm' : ''} truncate`}>{relatorio.cliente_nome}</p>
                    <p className={`${isMobile ? 'text-xs' : 'text-sm'} ${textSecondary} truncate`}>{relatorio.local_intervencao}</p>
                  </div>

                  {/* Equipamento */}
                  <div className={`${isMobile ? 'mb-2 pb-2' : 'mb-3 pb-3'} border-b ${borderColor} cursor-pointer`} onClick={() => openViewRelatorioModal(relatorio)}>
                    <p className={`text-xs ${textSecondary} mb-1`}>Equipamento</p>
                    <p className={`${isMobile ? 'text-xs' : 'text-sm'} ${isDark ? 'text-gray-300' : 'text-gray-700'} truncate`}>
                      {relatorio.equipamento_display ? (
                        relatorio.equipamento_display === 'Não especificado' ? (
                          <span className="text-gray-500 italic">{relatorio.equipamento_display}</span>
                        ) : relatorio.equipamento_display === 'Vários' ? (
                          <span className="text-blue-400">{relatorio.equipamento_display} ({relatorio.equipamentos_count})</span>
                        ) : (
                          <span>{relatorio.equipamento_display}</span>
                        )
                      ) : relatorio.equipamento_tipologia || relatorio.equipamento_marca || relatorio.equipamento_modelo ? (
                        <>
                          {relatorio.equipamento_tipologia && <span>{relatorio.equipamento_tipologia}</span>}
                          {relatorio.equipamento_tipologia && relatorio.equipamento_marca && <span className="text-gray-500"> • </span>}
                          {relatorio.equipamento_marca && <span>{relatorio.equipamento_marca}</span>}
                        </>
                      ) : (
                        <span className="text-gray-500 italic">Não especificado</span>
                      )}
                    </p>
                  </div>

                  {/* Footer - Cliente icon */}
                  <div className={`flex items-center gap-2 ${isMobile ? 'text-xs' : 'text-sm'} ${textSecondary} cursor-pointer`} onClick={() => openViewRelatorioModal(relatorio)}>
                    <User className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} />
                    <span className="truncate">{relatorio.cliente_nome}</span>
                  </div>
                </div>
              ))}
              {/* Mensagem quando não há resultados da pesquisa */}
              {searchTerm.trim() && relatorios.filter((r) => {
                const search = searchTerm.toLowerCase().trim();
                return r.numero_assistencia?.toString().includes(search) ||
                  r.cliente_nome?.toLowerCase().includes(search) ||
                  r.local_intervencao?.toLowerCase().includes(search) ||
                  r.cliente_local?.toLowerCase().includes(search);
              }).length === 0 && (
                <div className="col-span-full text-center py-8">
                  <Search className={`${isMobile ? 'w-12 h-12' : 'w-16 h-16'} text-gray-600 mx-auto mb-4`} />
                  <p className={`${textSecondary} ${isMobile ? 'text-base' : 'text-lg'}`}>
                    Nenhuma OT encontrada para "{searchTerm}"
                  </p>
                  <p className={`${textSecondary} text-sm mt-2`}>
                    Tente pesquisar por número da OT, nome do cliente ou local de intervenção
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Pesquisa por Estado Section */}
        {activeTab === 'pesquisa' && (
        <div className={`${isDark ? 'glass-effect' : 'bg-white shadow-lg border ' + borderColor} ${isMobile ? 'p-4' : 'p-6'} rounded-xl`}>
          <div className={`${isMobile ? 'mb-4' : 'mb-6'}`}>
            <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-semibold ${textPrimary} ${isMobile ? 'mb-3' : 'mb-4'}`}>Pesquisa por Estado</h2>
            
            {/* Status Dropdown */}
            <div className={`${isMobile ? 'w-full' : 'max-w-md'}`}>
              <Label className={`${textSecondary} mb-2 block ${isMobile ? 'text-sm' : ''}`}>Selecione o Estado</Label>
              <select
                value={statusFilter}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                className={`w-full ${bgCardAlt} border ${borderColor} ${textPrimary} rounded-md ${isMobile ? 'px-3 py-2 text-sm' : 'px-4 py-3'} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
              >
                <option value="">-- Selecione um estado --</option>
                <option value="agendado">📅 Agendado</option>
                <option value="orcamento">🟡 Orçamento</option>
                <option value="em_execucao">🔵 Em Execução</option>
                <option value="concluido">🟢 Concluído</option>
                <option value="facturado">🟣 Facturado</option>
              </select>
            </div>
          </div>

          {/* Results */}
          {statusFilter && (
            <div className={`${isMobile ? 'mt-4' : 'mt-6'}`}>
              <div className={`flex items-center justify-between ${isMobile ? 'mb-3' : 'mb-4'}`}>
                <h3 className={`${textPrimary} font-semibold ${isMobile ? 'text-sm' : ''}`}>
                  {isMobile ? `${filteredByStatus.length} OT(s)` : `Resultados: ${filteredByStatus.length} OT(s) com status "${getStatusLabel(statusFilter)}"`}
                </h3>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className={`animate-spin rounded-full ${isMobile ? 'h-8 w-8' : 'h-12 w-12'} border-b-2 border-blue-500 mx-auto`}></div>
                  <p className={`${textSecondary} mt-4 ${isMobile ? 'text-sm' : ''}`}>A carregar...</p>
                </div>
              ) : filteredByStatus.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className={`${isMobile ? 'w-12 h-12' : 'w-16 h-16'} text-gray-600 mx-auto mb-4`} />
                  <p className={`${textSecondary} ${isMobile ? 'text-base' : 'text-lg'}`}>Nenhuma OT encontrada com este estado</p>
                </div>
              ) : (
                <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}`}>
                  {filteredByStatus.map((relatorio) => (
                    <div
                      key={relatorio.id}
                      className={`${bgCardAlt} border ${borderColor} rounded-lg ${isMobile ? 'p-3' : 'p-4'} hover:border-blue-500 transition cursor-pointer`}
                      onClick={() => openViewRelatorioModal(relatorio)}
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="cursor-pointer flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`text-blue-400 font-bold ${isMobile ? 'text-base' : 'text-lg'}`}>
                              #{relatorio.numero_assistencia}
                            </span>
                            <span 
                              className={`text-xs px-2 py-0.5 rounded cursor-pointer hover:opacity-80 transition ${getStatusColor(relatorio.status)}`}
                              onClick={(e) => openStatusModal(relatorio, e)}
                              title="Clique para alterar status"
                            >
                              {getStatusLabel(relatorio.status)}
                            </span>
                          </div>
                          <p className={`${isMobile ? 'text-xs' : 'text-sm'} ${textSecondary}`}>
                            {new Date(relatorio.data_servico).toLocaleDateString('pt-PT')}
                          </p>
                        </div>
                        
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditRelatorioModal(relatorio);
                            }}
                            variant="outline"
                            size="sm"
                            className={`${isDark ? 'border-gray-600 hover:border-blue-500 hover:bg-blue-500/10' : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'} ${isMobile ? 'p-1.5' : 'p-2'}`}
                          >
                            <Edit className={`${isMobile ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
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
                              className={`${isDark ? 'border-gray-600' : 'border-gray-300'} hover:border-red-500 hover:bg-red-500/10 ${isMobile ? 'p-1.5' : 'p-2'}`}
                            >
                              <Trash2 className={`${isMobile ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Cliente */}
                      <div className={`${isMobile ? 'mb-2 pb-2' : 'mb-3 pb-3'} border-b ${borderColor}`}>
                        <p className={`text-xs ${textSecondary} mb-1`}>Cliente</p>
                        <p className={`${textPrimary} font-medium ${isMobile ? 'text-sm' : ''} truncate`}>{relatorio.cliente_nome}</p>
                        <p className={`${isMobile ? 'text-xs' : 'text-sm'} ${textSecondary} truncate`}>{relatorio.local_intervencao}</p>
                      </div>

                      {/* Equipamento - simplificado para mobile */}
                      {!isMobile && (
                        <div className="mb-3 pb-3 border-b border-gray-700">
                          <p className="text-xs text-gray-500 mb-1">Equipamento</p>
                          <p className="text-sm text-gray-300">
                            {relatorio.equipamento_display ? (
                              relatorio.equipamento_display === 'Não especificado' ? (
                                <span className="text-gray-500 italic">{relatorio.equipamento_display}</span>
                              ) : relatorio.equipamento_display === 'Vários' ? (
                                <span className="text-blue-400">{relatorio.equipamento_display} ({relatorio.equipamentos_count})</span>
                              ) : (
                                <span>{relatorio.equipamento_display}</span>
                              )
                            ) : relatorio.equipamento_tipologia || relatorio.equipamento_marca || relatorio.equipamento_modelo ? (
                              <>
                                {relatorio.equipamento_tipologia && <span>{relatorio.equipamento_tipologia}</span>}
                                {relatorio.equipamento_tipologia && relatorio.equipamento_marca && <span className="text-gray-500"> • </span>}
                                {relatorio.equipamento_marca && <span>{relatorio.equipamento_marca}</span>}
                              </>
                            ) : (
                              <span className="text-gray-500 italic">Não especificado</span>
                            )}
                          </p>
                        </div>
                      )}

                      {/* Footer */}
                      <div className={`flex items-center gap-2 ${isMobile ? 'text-xs' : 'text-sm'} ${textSecondary}`}>
                        <User className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} />
                        <span className="truncate">{relatorio.cliente_nome}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!statusFilter && (
            <div className="text-center py-8">
              <Search className={`${isMobile ? 'w-12 h-12' : 'w-16 h-16'} text-gray-600 mx-auto mb-4`} />
              <p className={`${textSecondary} ${isMobile ? 'text-base' : 'text-lg'}`}>Selecione um estado para pesquisar</p>
            </div>
          )}
        </div>
        )}

        {/* Pedidos de Cotação Section */}
        {activeTab === 'pedidos-cotacao' && (
        <div className={`${isDark ? 'glass-effect' : 'bg-white shadow-lg border ' + borderColor} ${isMobile ? 'p-4' : 'p-6'} rounded-xl`}>
          <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-semibold ${textPrimary} ${isMobile ? 'mb-4' : 'mb-6'} flex items-center gap-2`}>
            <FileText className={`${isMobile ? 'w-5 h-5' : 'w-6 h-6'} text-yellow-400`} />
            {isMobile ? 'PCs' : 'Pedidos de Cotação'}
          </h2>

          {loadingPCs ? (
            <div className="text-center py-8">
              <div className={`animate-spin rounded-full ${isMobile ? 'h-8 w-8' : 'h-12 w-12'} border-b-2 border-yellow-400 mx-auto`}></div>
              <p className={`${textSecondary} mt-4 ${isMobile ? 'text-sm' : ''}`}>Carregando...</p>
            </div>
          ) : allPCs.length === 0 ? (
            <div className="text-center py-8">
              <FileText className={`${isMobile ? 'w-12 h-12' : 'w-16 h-16'} text-gray-600 mx-auto mb-4`} />
              <p className={`${textSecondary} ${isMobile ? 'text-base' : 'text-lg'}`}>Nenhum PC encontrado</p>
              <p className={`${textSecondary} ${isMobile ? 'text-xs' : 'text-sm'} mt-2`}>
                PCs são criados quando adiciona material com "Cotação" a uma OT
              </p>
            </div>
          ) : (
            <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}`}>
              {allPCs.map((pc) => (
                <div
                  key={pc.id}
                  className={`${bgCardAlt} border ${borderColor} rounded-lg ${isMobile ? 'p-3' : 'p-5'} hover:border-yellow-500 transition cursor-pointer`}
                  onClick={() => openPCFromList(pc)}
                  data-testid={`pc-card-${pc.id}`}
                >
                  {/* Header */}
                  <div className={`flex items-start justify-between ${isMobile ? 'mb-2' : 'mb-4'}`}>
                    <div className="flex-1 min-w-0">
                      <div className={`flex items-center gap-2 ${isMobile ? 'mb-1' : 'mb-2'}`}>
                        <FileText className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-yellow-400 flex-shrink-0`} />
                        <span className={`text-yellow-400 font-bold ${isMobile ? 'text-base' : 'text-lg'}`}>
                          {pc.numero_pc}
                        </span>
                      </div>
                      <span 
                        className={`text-xs px-2 py-0.5 rounded inline-block ${
                          pc.status === 'Em Espera' ? 'bg-gray-600/20 text-gray-400' :
                          pc.status === 'Cotação Pedida' ? 'bg-yellow-600/20 text-yellow-400' :
                          pc.status === 'A Caminho' ? 'bg-blue-600/20 text-blue-400' :
                          pc.status === 'Terminado' ? 'bg-green-600/20 text-green-400' :
                          'bg-purple-600/20 text-purple-400'
                        }`}
                      >
                        {pc.status}
                      </span>
                    </div>
                    <ChevronRight className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} ${textSecondary} flex-shrink-0`} />
                  </div>

                  {/* Info */}
                  <div className={`space-y-1.5 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    <div className={`flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      <FileText className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} text-gray-500 flex-shrink-0`} />
                      <span className={textSecondary}>OT:</span>
                      <span className={`${textPrimary} font-medium`}>{pc.ot_numero}</span>
                    </div>
                    
                    <div className={`flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      <User className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} text-gray-500 flex-shrink-0`} />
                      <span className={`${textPrimary} truncate`}>{pc.cliente_nome}</span>
                    </div>

                    <div className={`flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      <Package className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} text-gray-500 flex-shrink-0`} />
                      <span className={textSecondary}>Materiais:</span>
                      <span className={`${textPrimary} font-medium`}>{pc.materiais_count || 0}</span>
                    </div>
                  </div>

                  {/* Actions Preview */}
                  <div className={`flex gap-2 ${isMobile ? 'mt-2 pt-2' : 'mt-4 pt-3'} border-t ${borderColor}`}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadPDFPC(pc.id);
                      }}
                      className={`flex-1 flex items-center justify-center gap-1 ${isMobile ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'} bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded transition`}
                    >
                      <Download className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} />
                      PDF
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        fetchPCDetalhes(pc.id);
                        setShowEmailPCModal(true);
                      }}
                      className={`flex-1 flex items-center justify-center gap-1 ${isMobile ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'} bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded transition`}
                    >
                      <Send className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} />
                      Email
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePC(pc.id, pc.numero_pc);
                      }}
                      className={`flex items-center justify-center gap-1 ${isMobile ? 'px-2 py-1.5' : 'px-3 py-2'} bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded transition ${isMobile ? 'text-xs' : 'text-sm'}`}
                    >
                      <Trash2 className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} />
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
        <DialogContent className={`${isDark ? 'bg-[#1a1a1a] border-gray-700' : 'bg-white border-gray-200'} ${textPrimary} ${isMobile ? 'max-w-[95vw] mx-2' : 'max-w-3xl'} max-h-[90vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${textPrimary}`}>
              <Plus className="w-5 h-5 text-blue-400" />
              Nova OT
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddRelatorio} className={`${isMobile ? 'space-y-4' : 'space-y-6'} mt-4`}>
            {/* Cliente e Data */}
            <div className={`grid grid-cols-1 ${isMobile ? 'gap-3' : 'md:grid-cols-2 gap-4'}`}>
              <div>
                <Label htmlFor="cliente_id" className={`${textSecondary} ${isMobile ? 'text-sm' : ''}`}>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="data_servico" className="text-gray-300">
                    Data de Início *
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
                <div>
                  <Label htmlFor="data_fim" className="text-gray-300">
                    Até (Opcional)
                  </Label>
                  <Input
                    id="data_fim"
                    type="date"
                    value={relatorioFormData.data_fim}
                    onChange={(e) => setRelatorioFormData({ ...relatorioFormData, data_fim: e.target.value })}
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                    min={relatorioFormData.data_servico}
                    placeholder="Deixe vazio para OT de um só dia"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Se preenchido, a OT aparecerá no calendário em todos os dias do intervalo
                  </p>
                </div>
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
              
              {/* KM Inicial */}
              <div>
                <Label htmlFor="km_inicial" className="text-gray-300">
                  KM Inicial (Viatura)
                </Label>
                <Input
                  id="km_inicial"
                  type="number"
                  value={relatorioFormData.km_inicial}
                  onChange={(e) => setRelatorioFormData({ ...relatorioFormData, km_inicial: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  placeholder="Ex: 125000"
                  min="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Será associado ao primeiro técnico adicionado
                </p>
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
        <DialogContent className={`${isDark ? 'bg-[#1a1a1a] border-gray-700' : 'bg-white border-gray-200'} ${textPrimary} ${isMobile ? 'max-w-[100vw] w-full mx-0 p-3 rounded-none max-h-[100vh]' : 'max-w-5xl max-h-[90vh]'} overflow-y-auto overflow-x-hidden`}>
          <DialogHeader>
            <div className={`flex items-center justify-between w-full ${isMobile ? 'pr-6' : 'pr-8'}`}>
              <DialogTitle className={`flex items-center gap-2 ${textPrimary} ${isMobile ? 'text-base' : ''}`}>
                <FileText className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-blue-400 flex-shrink-0`} />
                <span className="truncate">OT #{selectedRelatorio?.numero_assistencia}</span>
              </DialogTitle>
              {!isMobile && (
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
              )}
            </div>
          </DialogHeader>

          {selectedRelatorio && (
            <div className={`${isMobile ? 'space-y-3 mt-2' : 'space-y-6 mt-4'} overflow-x-hidden`}>
              {/* Status e Data + Botão Editar mobile */}
              <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
                <span className={`${isMobile ? 'px-2 py-0.5 text-xs self-start' : 'px-3 py-1 text-sm'} rounded ${getStatusColor(selectedRelatorio.status)}`}>
                  {getStatusLabel(selectedRelatorio.status)}
                </span>
                <div className={`flex items-center ${isMobile ? 'justify-between' : 'gap-2'}`}>
                  <span className={`${textSecondary} ${isMobile ? 'text-xs' : ''}`}>
                    {new Date(selectedRelatorio.data_servico).toLocaleDateString('pt-PT')}
                    {selectedRelatorio.data_fim && (
                      <span className="text-blue-400"> → {new Date(selectedRelatorio.data_fim).toLocaleDateString('pt-PT')}</span>
                    )}
                  </span>
                  {isMobile && (
                    <Button
                      onClick={() => {
                        setShowViewRelatorioModal(false);
                        openEditRelatorioModal(selectedRelatorio);
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      size="sm"
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Editar
                    </Button>
                  )}
                </div>
              </div>

              {/* Cliente */}
              <div className={`${bgCardAlt} ${isMobile ? 'p-3' : 'p-4'} rounded-lg border ${borderColor}`}>
                <h4 className={`text-blue-400 font-semibold ${isMobile ? 'mb-1 text-sm' : 'mb-2'} flex items-center gap-2`}>
                  <Building2 className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} flex-shrink-0`} />
                  Dados do Cliente
                </h4>
                <p className={`${textPrimary} font-medium ${isMobile ? 'text-sm truncate' : ''}`}>{selectedRelatorio.cliente_nome}</p>
                <p className={`${textSecondary} ${isMobile ? 'text-xs truncate' : 'text-sm'}`}>Local: {selectedRelatorio.local_intervencao}</p>
                <p className={`${textSecondary} ${isMobile ? 'text-xs truncate' : 'text-sm'}`}>Pedido por: {selectedRelatorio.pedido_por}</p>
              </div>

              {/* Mão de Obra / Cronómetros - Card Unificado */}
              <div className={`${bgCardAlt} ${isMobile ? 'p-3' : 'p-4'} rounded-lg border border-green-700 overflow-hidden`}>
                <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-4'}`}>
                  <h4 className={`text-green-400 font-semibold flex items-center gap-2 ${isMobile ? 'text-sm' : ''}`}>
                    <Clock className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} flex-shrink-0`} />
                    {isMobile ? 'Mão de Obra' : 'Mão de Obra / Deslocação'}
                  </h4>
                </div>

                {/* Cronómetros */}
                <div className={`${isMobile ? 'mb-3' : 'mb-6'}`}>
                  <div className={`flex items-center justify-between ${isMobile ? 'mb-2 flex-wrap gap-1' : 'mb-3'}`}>
                    <h5 className={`${textPrimary} font-medium flex items-center gap-2 ${isMobile ? 'text-sm' : ''}`}>
                      <PlayCircle className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} text-green-400 flex-shrink-0`} />
                      Cronómetros
                    </h5>
                    <div className={`${textSecondary} ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
                      {Object.values(selectedCronoUsers).filter(Boolean).length}/{allSystemUsers.length}{' '}
                      <button 
                        onClick={() => {
                          const all = {};
                          allSystemUsers.forEach(u => { all[u.id] = true; });
                          setSelectedCronoUsers(all);
                        }}
                        className="text-blue-400 hover:text-blue-300 ml-1"
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

                  {/* Botões de Trabalho, Viagem e Oficina */}
                  <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-2 ${isMobile ? 'mb-2' : 'mb-4'}`}>
                    {(() => {
                      const selectedUsers = allSystemUsers.filter(u => selectedCronoUsers[u.id]);
                      const hasAnyActiveTrabalho = selectedUsers.some(u => getCronometroStatus(u, 'trabalho'));
                      
                      return (
                        <button
                          onClick={async () => {
                            if (selectedUsers.length === 0) {
                              toast.error('Selecione pelo menos um técnico');
                              return;
                            }
                            for (const user of selectedUsers) {
                              const hasActive = getCronometroStatus(user, 'trabalho');
                              if (hasAnyActiveTrabalho) {
                                if (hasActive) {
                                  await handlePararCronometro({
                                    id: user.id,
                                    tecnico_id: user.id,
                                    tecnico_nome: user.full_name || user.username
                                  }, 'trabalho');
                                }
                              } else {
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
                          className={`${isMobile ? 'w-full' : 'flex-1'} flex items-center justify-center gap-2 ${hasAnyActiveTrabalho ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white font-medium py-2.5 px-4 rounded-md transition-colors disabled:opacity-50 ${isMobile ? 'text-sm' : ''}`}
                          disabled={Object.values(selectedCronoUsers).filter(Boolean).length === 0}
                        >
                          {hasAnyActiveTrabalho ? <StopCircle className="w-4 h-4 flex-shrink-0" /> : <PlayCircle className="w-4 h-4 flex-shrink-0" />}
                          <span>{hasAnyActiveTrabalho ? 'Parar Trabalho' : 'Iniciar Trabalho'}</span>
                        </button>
                      );
                    })()}

                    {(() => {
                      const selectedUsers = allSystemUsers.filter(u => selectedCronoUsers[u.id]);
                      const hasAnyActiveViagem = selectedUsers.some(u => getCronometroStatus(u, 'viagem'));
                      
                      return (
                        <button
                          onClick={async () => {
                            if (selectedUsers.length === 0) {
                              toast.error('Selecione pelo menos um técnico');
                              return;
                            }
                            for (const user of selectedUsers) {
                              const hasActive = getCronometroStatus(user, 'viagem');
                              if (hasAnyActiveViagem) {
                                if (hasActive) {
                                  await handlePararCronometro({
                                    id: user.id,
                                    tecnico_id: user.id,
                                    tecnico_nome: user.full_name || user.username
                                  }, 'viagem');
                                }
                              } else {
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
                          className={`${isMobile ? 'w-full' : 'flex-1'} flex items-center justify-center gap-2 ${hasAnyActiveViagem ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'} text-white font-medium py-2.5 px-4 rounded-md transition-colors disabled:opacity-50 ${isMobile ? 'text-sm' : ''}`}
                          disabled={Object.values(selectedCronoUsers).filter(Boolean).length === 0}
                        >
                          {hasAnyActiveViagem ? <StopCircle className="w-4 h-4 flex-shrink-0" /> : <Car className="w-4 h-4 flex-shrink-0" />}
                          <span>{hasAnyActiveViagem ? 'Parar Viagem' : 'Iniciar Viagem'}</span>
                        </button>
                      );
                    })()}

                    {(() => {
                      const selectedUsers = allSystemUsers.filter(u => selectedCronoUsers[u.id]);
                      const hasAnyActiveOficina = selectedUsers.some(u => getCronometroStatus(u, 'oficina'));
                      
                      return (
                        <button
                          onClick={async () => {
                            if (selectedUsers.length === 0) {
                              toast.error('Selecione pelo menos um técnico');
                              return;
                            }
                            for (const user of selectedUsers) {
                              const hasActive = getCronometroStatus(user, 'oficina');
                              if (hasAnyActiveOficina) {
                                if (hasActive) {
                                  await handlePararCronometro({
                                    id: user.id,
                                    tecnico_id: user.id,
                                    tecnico_nome: user.full_name || user.username
                                  }, 'oficina');
                                }
                              } else {
                                if (!hasActive) {
                                  await handleIniciarCronometro({
                                    id: user.id,
                                    tecnico_id: user.id,
                                    tecnico_nome: user.full_name || user.username
                                  }, 'oficina');
                                }
                              }
                            }
                          }}
                          className={`${isMobile ? 'w-full' : 'flex-1'} flex items-center justify-center gap-2 ${hasAnyActiveOficina ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'} text-white font-medium py-2.5 px-4 rounded-md transition-colors disabled:opacity-50 ${isMobile ? 'text-sm' : ''}`}
                          disabled={Object.values(selectedCronoUsers).filter(Boolean).length === 0}
                        >
                          {hasAnyActiveOficina ? <StopCircle className="w-4 h-4 flex-shrink-0" /> : <Wrench className="w-4 h-4 flex-shrink-0" />}
                          <span>{hasAnyActiveOficina ? 'Parar Oficina' : 'Iniciar Oficina'}</span>
                        </button>
                      );
                    })()}
                  </div>

                  {/* Lista de Técnicos */}
                  {allSystemUsers.length > 0 ? (
                    <div className={`space-y-1 ${isMobile ? 'max-h-32' : 'max-h-48'} overflow-y-auto overflow-x-hidden`}>
                      {allSystemUsers.map((userItem) => {
                        const cronoTrabalho = getCronometroStatus(userItem, 'trabalho');
                        const cronoViagem = getCronometroStatus(userItem, 'viagem');
                        const timerKeyTrabalho = `${userItem.id}_trabalho`;
                        const timerKeyViagem = `${userItem.id}_viagem`;

                        return (
                          <div key={userItem.id} className={`flex items-center justify-between ${isDark ? 'bg-gray-800/50' : 'bg-gray-100'} ${isMobile ? 'p-1.5' : 'p-2'} rounded-lg border ${borderColor} overflow-hidden`}>
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <input 
                                type="checkbox" 
                                checked={selectedCronoUsers[userItem.id] || false}
                                onChange={(e) => {
                                  setSelectedCronoUsers(prev => ({
                                    ...prev,
                                    [userItem.id]: e.target.checked
                                  }));
                                }}
                                className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} rounded border-gray-600 bg-gray-700 text-blue-500 flex-shrink-0`}
                              />
                              <User className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} text-gray-400 flex-shrink-0`} />
                              <span className={`${textPrimary} ${isMobile ? 'text-xs' : 'text-sm'} truncate`}>{userItem.full_name || userItem.username}</span>
                              {userItem.is_admin && (
                                <span className={`text-orange-400 ${isMobile ? 'text-[10px]' : 'text-xs'} flex-shrink-0`}>(A)</span>
                              )}
                            </div>

                            {/* Indicadores de cronómetros ativos */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {cronoTrabalho && (
                                <span className={`flex items-center gap-0.5 text-green-400 font-mono ${isMobile ? 'text-[10px] px-1 py-0.5' : 'text-xs px-2 py-1'} bg-green-900/30 rounded`}>
                                  <PlayCircle className={`${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'} flex-shrink-0`} />
                                  {formatTimer(timers[timerKeyTrabalho] || 0)}
                                </span>
                              )}
                              {cronoViagem && (
                                <span className={`flex items-center gap-0.5 text-blue-400 font-mono ${isMobile ? 'text-[10px] px-1 py-0.5' : 'text-xs px-2 py-1'} bg-blue-900/30 rounded`}>
                                  <Car className={`${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'} flex-shrink-0`} />
                                  {formatTimer(timers[timerKeyViagem] || 0)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className={`${textSecondary} ${isMobile ? 'text-xs' : 'text-sm'} text-center py-2`}>Nenhum utilizador registado</p>
                  )}
                </div>

                {/* Separador */}
                <div className={`border-t ${borderColor} ${isMobile ? 'my-2' : 'my-4'}`}></div>

                {/* Registos de Mão de Obra */}
                <div className="overflow-hidden">
                  <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-3'}`}>
                    <h5 className={`${textPrimary} font-medium flex items-center gap-2 ${isMobile ? 'text-sm' : ''}`}>
                      <FileText className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} text-blue-400 flex-shrink-0`} />
                      Registos
                    </h5>
                    <Button
                      onClick={() => setShowAddRegistoManualModal(true)}
                      size="sm"
                      className={`bg-blue-600 hover:bg-blue-700 text-white ${isMobile ? 'text-[10px] px-2 py-1' : 'text-xs'}`}
                    >
                      <Plus className={`${isMobile ? 'w-2.5 h-2.5 mr-0.5' : 'w-3 h-3 mr-1'} flex-shrink-0`} />
                      {isMobile ? 'Novo' : 'Novo Registo'}
                    </Button>
                  </div>

                  {(tecnicos.length > 0 || registosTecnicos.length > 0) ? (
                    <div className="overflow-x-hidden">
                      {/* Mobile: Card-based layout */}
                      {isMobile ? (
                        <div className="space-y-2">
                          {[
                            ...tecnicos.map(tec => ({
                              ...tec,
                              _tipo_registo: tec.tipo_registo || 'manual',
                              _source: 'tecnico',
                              _data_sort: tec.data_trabalho || tec.created_at || '',
                              _hora_inicio_sort: tec.hora_inicio || '',
                              _key: `manual-${tec.id}`
                            })),
                            ...registosTecnicos.map(reg => ({
                              ...reg,
                              _tipo_registo: reg.tipo,
                              _source: 'cronometro',
                              _data_sort: reg.data || reg.created_at || '',
                              _hora_inicio_sort: reg.hora_inicio_segmento || '',
                              _key: `crono-${reg.id}`
                            }))
                          ]
                          .sort((a, b) => {
                            // Primeiro ordenar por data
                            const dataAStr = a._data_sort || '1970-01-01';
                            const dataBStr = b._data_sort || '1970-01-01';
                            const dataA = new Date(dataAStr);
                            const dataB = new Date(dataBStr);
                            const dataAValid = !isNaN(dataA.getTime());
                            const dataBValid = !isNaN(dataB.getTime());
                            if (!dataAValid && !dataBValid) return 0;
                            if (!dataAValid) return 1;
                            if (!dataBValid) return -1;
                            if (dataA.getTime() !== dataB.getTime()) return dataA - dataB;
                            
                            // Se mesma data, ordenar por hora de início
                            const horaA = a._hora_inicio_sort || a.hora_inicio || '';
                            const horaB = b._hora_inicio_sort || b.hora_inicio || '';
                            return horaA.localeCompare(horaB);
                          })
                          .map((item) => (
                            <div key={item._key} className={`${isDark ? 'bg-gray-800/50' : 'bg-gray-100'} p-2 rounded-lg border ${borderColor}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className={`${textPrimary} text-xs font-medium truncate flex-1 mr-2`}>{item.tecnico_nome}</span>
                                <span 
                                  className={`px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 ${
                                    item._tipo_registo === 'manual' ? 'bg-gray-600/30 text-gray-300' :
                                    item._tipo_registo === 'trabalho' ? 'bg-green-600/20 text-green-400' : 
                                    'bg-blue-600/20 text-blue-400'
                                  }`}
                                >
                                  {item._tipo_registo === 'manual' ? 'M' : item._tipo_registo === 'trabalho' ? 'T' : 'V'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[10px]">
                                <span className={textSecondary}>
                                  {item._source === 'tecnico' 
                                    ? (item.data_trabalho ? new Date(item.data_trabalho).toLocaleDateString('pt-PT') : '-')
                                    : new Date(item.data).toLocaleDateString('pt-PT')
                                  }
                                  {' '}
                                  {item.hora_inicio_segmento
                                    ? item.hora_inicio_segmento.substring(11, 16)
                                    : (item.hora_inicio || '-')
                                  }
                                  -
                                  {item.hora_fim_segmento
                                    ? item.hora_fim_segmento.substring(11, 16)
                                    : (item.hora_fim || '-')
                                  }
                                </span>
                                <span className={`${textPrimary} font-medium`}>
                                  {(() => {
                                    const mins = item.minutos_trabalhados || item.minutos_cliente || Math.round((item.horas_arredondadas || 0) * 60);
                                    return `${Math.floor(mins / 60)}h${mins % 60}m`;
                                  })()}
                                </span>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => item._source === 'tecnico' ? openEditTecnicoModal(item) : openEditRegistoModal(item)}
                                    className="text-blue-400 hover:bg-blue-900/20 p-0.5 rounded"
                                  >
                                    <Edit className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => item._source === 'tecnico' ? handleDeleteTecnico(item.id) : handleDeleteRegisto(item.id)}
                                    className="text-red-400 hover:bg-red-900/20 p-0.5 rounded"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        /* Desktop: Table layout */
                        <table className="w-full text-sm">
                        <thead>
                          <tr className={`border-b ${borderColor}`}>
                            <th className={`text-left py-2 px-2 ${textSecondary}`}>Técnico</th>
                            <th className={`text-center py-2 px-2 ${textSecondary}`}>Tipo</th>
                            <th className={`text-center py-2 px-2 ${textSecondary}`}>Data</th>
                            <th className={`text-center py-2 px-2 ${textSecondary}`}>Início</th>
                            <th className={`text-center py-2 px-2 ${textSecondary}`}>Fim</th>
                            <th className={`text-center py-2 px-2 ${textSecondary}`}>Horas</th>
                            <th className={`text-center py-2 px-2 ${textSecondary}`}>KM</th>
                            <th className={`text-center py-2 px-2 ${textSecondary}`}>Código</th>
                            <th className={`text-center py-2 px-2 ${textSecondary}`}>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Combinar e ordenar todos os registos cronologicamente */}
                          {[
                            // Registos Manuais (técnicos) - agora com tipo_registo dinâmico
                            ...tecnicos.map(tec => ({
                              ...tec,
                              _tipo_registo: tec.tipo_registo || 'manual',
                              _source: 'tecnico',
                              _data_sort: tec.data_trabalho || tec.created_at || '',
                              _hora_inicio_sort: tec.hora_inicio || '',
                              _key: `manual-${tec.id}`
                            })),
                            // Registos do Cronómetro
                            ...registosTecnicos.map(reg => ({
                              ...reg,
                              _tipo_registo: reg.tipo,
                              _source: 'cronometro',
                              _data_sort: reg.data || reg.created_at || '',
                              _hora_inicio_sort: reg.hora_inicio_segmento || '',
                              _key: `crono-${reg.id}`
                            }))
                          ]
                          .sort((a, b) => {
                            // Ordenar por data primeiro (com fallback seguro)
                            const dataAStr = a._data_sort || '1970-01-01';
                            const dataBStr = b._data_sort || '1970-01-01';
                            const dataA = new Date(dataAStr);
                            const dataB = new Date(dataBStr);
                            
                            // Verificar se as datas são válidas
                            const dataAValid = !isNaN(dataA.getTime());
                            const dataBValid = !isNaN(dataB.getTime());
                            
                            if (!dataAValid && !dataBValid) return 0;
                            if (!dataAValid) return 1;
                            if (!dataBValid) return -1;
                            
                            if (dataA.getTime() !== dataB.getTime()) {
                              return dataA - dataB;
                            }
                            // Se mesma data, ordenar por hora de início
                            const horaAStr = a._hora_inicio_sort || '';
                            const horaBStr = b._hora_inicio_sort || '';
                            if (!horaAStr && !horaBStr) return 0;
                            if (!horaAStr) return 1;
                            if (!horaBStr) return -1;
                            const horaA = new Date(horaAStr);
                            const horaB = new Date(horaBStr);
                            if (isNaN(horaA.getTime()) || isNaN(horaB.getTime())) return 0;
                            return horaA - horaB;
                          })
                          .map((item) => (
                            <tr key={item._key} className={`border-b ${isDark ? 'border-gray-800 hover:bg-gray-800/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                              <td className={`py-2 px-2 ${textPrimary}`}>{item.tecnico_nome}</td>
                              <td className="py-2 px-2 text-center">
                                <span 
                                  className={`px-2 py-1 rounded text-xs cursor-pointer hover:opacity-80 transition-opacity ${
                                    item._tipo_registo === 'manual' ? 'bg-gray-600/30 text-gray-300 hover:bg-gray-600/50' :
                                    item._tipo_registo === 'trabalho' ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30' : 
                                    'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                                  }`}
                                  onClick={(e) => openTipoModal(item, e)}
                                >
                                  {item._tipo_registo === 'manual' ? 'Manual' : 
                                   item._tipo_registo === 'trabalho' ? 'Trabalho' : 'Viagem'}
                                </span>
                              </td>
                              <td className={`py-2 px-2 text-center ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                {item._source === 'tecnico' 
                                  ? (item.data_trabalho ? new Date(item.data_trabalho).toLocaleDateString('pt-PT') : '-')
                                  : new Date(item.data).toLocaleDateString('pt-PT')
                                }
                              </td>
                              <td className={`py-2 px-2 text-center ${isDark ? 'text-gray-300' : 'text-gray-600'} font-mono text-xs`}>
                                {item.hora_inicio_segmento
                                  ? item.hora_inicio_segmento.substring(11, 16)
                                  : (item.hora_inicio 
                                    ? item.hora_inicio 
                                    : '-')
                                }
                              </td>
                              <td className={`py-2 px-2 text-center ${isDark ? 'text-gray-300' : 'text-gray-600'} font-mono text-xs`}>
                                {item.hora_fim_segmento
                                  ? item.hora_fim_segmento.substring(11, 16)
                                  : (item.hora_fim 
                                    ? item.hora_fim 
                                    : '-')
                                }
                              </td>
                              <td className={`py-2 px-2 text-center ${textPrimary} font-medium`}>
                                {(() => {
                                  // Tentar obter minutos de várias fontes
                                  const mins = item.minutos_trabalhados || 
                                    item.minutos_cliente || 
                                    Math.round((item.horas_arredondadas || 0) * 60);
                                  return `${Math.floor(mins / 60)}h ${mins % 60}min`;
                                })()}
                              </td>
                              <td className={`py-2 px-2 text-center ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                {item._source === 'tecnico' 
                                  ? (() => {
                                      const kmsIda = Math.max(0, (item.kms_final || 0) - (item.kms_inicial || 0));
                                      const kmsVolta = Math.max(0, (item.kms_final_volta || 0) - (item.kms_inicial_volta || 0));
                                      const kmsTotal = item.kms_deslocacao || (kmsIda + kmsVolta);
                                      return (
                                        <span title={`Ida: ${kmsIda.toFixed(1)} km | Volta: ${kmsVolta.toFixed(1)} km`}>
                                          {kmsTotal.toFixed(1)} km
                                        </span>
                                      );
                                    })()
                                  : `${item.km || 0} km`
                                }
                              </td>
                              <td className="py-2 px-2 text-center">
                                {item.codigo ? (
                                  <span className="font-mono text-purple-400">{item.codigo}</span>
                                ) : item._source === 'tecnico' && item.tipo_horario ? (
                                  <span className="font-mono text-purple-400">
                                    {getTipoHorarioCodigo(item.tipo_horario)}
                                  </span>
                                ) : (
                                  <span className="text-gray-500">-</span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    onClick={() => item._source === 'tecnico' 
                                      ? openEditTecnicoModal(item) 
                                      : openEditRegistoModal(item)
                                    }
                                    variant="ghost"
                                    size="sm"
                                    className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 p-1"
                                  >
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    onClick={() => item._source === 'tecnico' 
                                      ? handleDeleteTecnico(item.id) 
                                      : handleDeleteRegisto(item.id)
                                    }
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20 p-1"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      )}
                    </div>
                  ) : (
                    <div className={`text-center ${isMobile ? 'py-2' : 'py-4'}`}>
                      <Users className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} text-gray-600 mx-auto mb-2`} />
                      <p className={`${textSecondary} ${isMobile ? 'text-xs' : 'text-sm'}`}>Nenhum registo de mão de obra</p>
                    </div>
                  )}
                </div>

                {/* Legenda Tipos de Trabalho - escondida em mobile */}
                {!isMobile && (
                <div className="mt-4 bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-3 font-semibold">Tipos de Trabalho:</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-600 text-white px-2 py-1 rounded font-mono font-bold text-xs">1</span>
                      <span className={textPrimary}>Dias úteis (07h-19h)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-600 text-white px-2 py-1 rounded font-mono font-bold text-xs">2</span>
                      <span className={textPrimary}>Dias úteis (19h-07h)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-600 text-white px-2 py-1 rounded font-mono font-bold text-xs">S</span>
                      <span className={textPrimary}>Sábado</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-600 text-white px-2 py-1 rounded font-mono font-bold text-xs">D</span>
                      <span className={textPrimary}>Domingos/Feriados</span>
                    </div>
                  </div>
                </div>
                )}
              </div>

              {/* Equipamentos */}
              <div className={`${bgCardAlt} ${isMobile ? 'p-3' : 'p-4'} rounded-lg border ${borderColor}`}>
                <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-3'}`}>
                  <h4 className={`text-blue-400 font-semibold flex items-center gap-2 ${isMobile ? 'text-sm' : ''}`}>
                    Equipamentos
                    {!isMobile && <HelpTooltip section="equipamentos" />}
                  </h4>
                  <Button
                    onClick={openAddEquipamentoModal}
                    size="sm"
                    className={`bg-blue-500 hover:bg-blue-600 ${isMobile ? 'text-xs px-2 py-1' : ''}`}
                  >
                    <Plus className={`${isMobile ? 'w-3 h-3 mr-0.5' : 'w-4 h-4 mr-1'}`} />
                    {isMobile ? 'Adicionar' : 'Adicionar Equipamento'}
                  </Button>
                </div>
                
                {/* Lista de Equipamentos - Campos Estruturados */}
                <div className="space-y-3">
                  {/* Equipamento principal (da OT) - só mostra se tiver dados */}
                  {(selectedRelatorio.equipamento_marca || selectedRelatorio.equipamento_tipologia || selectedRelatorio.equipamento_modelo) && (
                    <div className={`${isDark ? 'bg-black/30' : 'bg-gray-100'} ${isMobile ? 'p-2' : 'p-3'} rounded border ${borderColor}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`${isMobile ? 'text-[10px] px-1 py-0.5' : 'text-xs px-2 py-1'} text-gray-500 bg-gray-700 rounded`}>Principal</span>
                        <div className={`flex items-center gap-1`}>
                          <Button
                            onClick={openEditEquipamentoPrincipalModal}
                            size="sm"
                            variant="outline"
                            className={`border-blue-500 text-blue-500 hover:bg-blue-500/10 ${isMobile ? 'p-1 h-6 w-6' : ''}`}
                          >
                            <Edit className={`${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'}`} />
                          </Button>
                          <Button
                            onClick={async () => {
                              if (window.confirm('Tem certeza que deseja remover o equipamento principal?')) {
                                try {
                                  await axios.put(`${API}/relatorios-tecnicos/${selectedRelatorio.id}`, {
                                    equipamento_tipologia: '',
                                    equipamento_marca: '',
                                    equipamento_modelo: '',
                                    equipamento_numero_serie: '',
                                    equipamento_ano_fabrico: ''
                                  });
                                  setSelectedRelatorio({
                                    ...selectedRelatorio,
                                    equipamento_tipologia: '',
                                    equipamento_marca: '',
                                    equipamento_modelo: '',
                                    equipamento_numero_serie: '',
                                    equipamento_ano_fabrico: ''
                                  });
                                  toast.success('Equipamento principal removido');
                                } catch (error) {
                                  toast.error('Erro ao remover equipamento');
                                }
                              }
                            }}
                            size="sm"
                            variant="outline"
                            className={`border-red-500 text-red-500 hover:bg-red-500/10 ${isMobile ? 'p-1 h-6 w-6' : ''}`}
                          >
                            <Trash2 className={`${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'}`} />
                          </Button>
                        </div>
                      </div>
                      {/* Campos estruturados */}
                      <div className={`grid ${isMobile ? 'grid-cols-1 gap-1' : 'grid-cols-2 gap-2'} ${isMobile ? 'text-xs' : 'text-sm'}`}>
                        {selectedRelatorio.equipamento_tipologia && (
                          <div className="flex">
                            <span className={`font-semibold ${textSecondary} min-w-[100px]`}>TIPOLOGIA:</span>
                            <span className={textPrimary}>{selectedRelatorio.equipamento_tipologia}</span>
                          </div>
                        )}
                        {selectedRelatorio.equipamento_numero_serie && (
                          <div className="flex">
                            <span className={`font-semibold ${textSecondary} min-w-[100px]`}>Nº SÉRIE:</span>
                            <span className={textPrimary}>{selectedRelatorio.equipamento_numero_serie}</span>
                          </div>
                        )}
                        {selectedRelatorio.equipamento_marca && (
                          <div className="flex">
                            <span className={`font-semibold ${textSecondary} min-w-[100px]`}>MARCA:</span>
                            <span className={textPrimary}>{selectedRelatorio.equipamento_marca}</span>
                          </div>
                        )}
                        {selectedRelatorio.equipamento_modelo && (
                          <div className="flex">
                            <span className={`font-semibold ${textSecondary} min-w-[100px]`}>MODELO:</span>
                            <span className={textPrimary}>{selectedRelatorio.equipamento_modelo}</span>
                          </div>
                        )}
                        {selectedRelatorio.equipamento_ano_fabrico && (
                          <div className="flex">
                            <span className={`font-semibold ${textSecondary} min-w-[100px]`}>ANO FABRICO:</span>
                            <span className={textPrimary}>{selectedRelatorio.equipamento_ano_fabrico}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Equipamentos adicionais */}
                  {equipamentosOT.map((equip) => (
                    <div key={equip.id} className={`${isDark ? 'bg-black/30' : 'bg-gray-100'} ${isMobile ? 'p-2' : 'p-3'} rounded border border-blue-500/30`}>
                      <div className="flex items-center justify-end mb-2 gap-1">
                        <Button
                          onClick={() => openEditEquipamentoModal(equip)}
                          size="sm"
                          variant="outline"
                          className={`border-blue-500 text-blue-500 hover:bg-blue-500/10 ${isMobile ? 'p-1 h-6 w-6' : ''}`}
                        >
                          <Edit className={`${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'}`} />
                        </Button>
                        <Button
                          onClick={() => handleDeleteEquipamento(equip.id)}
                          size="sm"
                          variant="outline"
                          className={`border-red-500 text-red-500 hover:bg-red-500/10 ${isMobile ? 'p-1 h-6 w-6' : ''}`}
                        >
                          <Trash2 className={`${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'}`} />
                        </Button>
                      </div>
                      {/* Campos estruturados */}
                      <div className={`grid ${isMobile ? 'grid-cols-1 gap-1' : 'grid-cols-2 gap-2'} ${isMobile ? 'text-xs' : 'text-sm'}`}>
                        {equip.tipologia && (
                          <div className="flex">
                            <span className={`font-semibold ${textSecondary} min-w-[100px]`}>TIPOLOGIA:</span>
                            <span className={textPrimary}>{equip.tipologia}</span>
                          </div>
                        )}
                        {equip.numero_serie && (
                          <div className="flex">
                            <span className={`font-semibold ${textSecondary} min-w-[100px]`}>Nº SÉRIE:</span>
                            <span className={textPrimary}>{equip.numero_serie}</span>
                          </div>
                        )}
                        {equip.marca && (
                          <div className="flex">
                            <span className={`font-semibold ${textSecondary} min-w-[100px]`}>MARCA:</span>
                            <span className={textPrimary}>{equip.marca}</span>
                          </div>
                        )}
                        {equip.modelo && (
                          <div className="flex">
                            <span className={`font-semibold ${textSecondary} min-w-[100px]`}>MODELO:</span>
                            <span className={textPrimary}>{equip.modelo}</span>
                          </div>
                        )}
                        {equip.ano_fabrico && (
                          <div className="flex">
                            <span className={`font-semibold ${textSecondary} min-w-[100px]`}>ANO FABRICO:</span>
                            <span className={textPrimary}>{equip.ano_fabrico}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Intervenções */}
              <div className={`${bgCardAlt} ${isMobile ? 'p-3' : 'p-4'} rounded-lg border ${borderColor}`}>
                <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-4'}`}>
                  <h4 className={`text-blue-400 font-semibold flex items-center gap-2 ${isMobile ? 'text-sm' : ''}`}>
                    <FileText className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} />
                    {isMobile ? 'Intervenções' : 'Intervenções / Assistências'}
                    {!isMobile && <HelpTooltip section="intervencoes" />}
                  </h4>
                  <Button
                    onClick={() => setShowAddIntervencaoModal(true)}
                    size="sm"
                    className={`bg-green-500 hover:bg-green-600 ${isMobile ? 'text-xs px-2 py-1' : ''}`}
                  >
                    <Plus className={`${isMobile ? 'w-3 h-3 mr-0.5' : 'w-4 h-4 mr-1'}`} />
                    {isMobile ? 'Adicionar' : 'Adicionar Intervenção'}
                  </Button>
                </div>

                {intervencoes.length > 0 ? (
                  <div className={`space-y-2 ${isMobile ? '' : 'space-y-3'}`}>
                    {intervencoes.map((intervencao) => (
                      <div key={intervencao.id} className={`${bgCard} ${isMobile ? 'p-2' : 'p-4'} rounded border ${borderColor}`}>
                        <div className={`flex items-start justify-between ${isMobile ? 'mb-1' : 'mb-2'}`}>
                          <div className="flex items-center gap-2">
                            <Clock className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} text-blue-400`} />
                            <span className={`${textPrimary} font-semibold ${isMobile ? 'text-xs' : ''}`}>
                              {new Date(intervencao.data_intervencao).toLocaleDateString('pt-PT')}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              onClick={() => openEditIntervencaoModal(intervencao)}
                              variant="outline"
                              size="sm"
                              className={`${isDark ? 'border-gray-600 hover:border-blue-500' : 'border-gray-300 hover:border-blue-500'} hover:bg-blue-500/10 ${isMobile ? 'p-1 h-6 w-6' : 'p-2'}`}
                            >
                              <Edit className={`${isMobile ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'}`} />
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
                        
                        {/* Equipamento Relacionado */}
                        {intervencao.equipamento_id && (
                          <div className="mb-3 p-2 bg-purple-500/10 border border-purple-500/30 rounded">
                            <p className="text-xs text-purple-400 flex items-center gap-1">
                              <Settings className="w-3 h-3" />
                              Equipamento: {(() => {
                                const eq = equipamentosOT.find(e => e.id === intervencao.equipamento_id);
                                return eq ? `${eq.tipologia} - ${eq.marca} ${eq.modelo}` : 'N/A';
                              })()}
                            </p>
                          </div>
                        )}
                        
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
                    <HelpTooltip section="fotografias" />
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
                          {/* Botões de ação */}
                          <div className="absolute top-2 right-2 flex gap-1">
                            {/* Botão de editar */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditFotoModal(foto);
                              }}
                              className="bg-blue-500/80 hover:bg-blue-600 text-white p-1.5 rounded-full transition"
                              title="Editar descrição"
                              data-testid={`edit-foto-${foto.id}`}
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            {/* Botão de remover */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFoto(foto.id);
                              }}
                              className="bg-red-500/80 hover:bg-red-600 text-white p-1.5 rounded-full transition"
                              title="Remover fotografia"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {/* Descrição */}
                        <div className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-gray-300 flex-1">
                              {foto.descricao || 'Sem descrição'}
                            </p>
                            <button
                              onClick={() => openEditFotoModal(foto)}
                              className="text-gray-500 hover:text-blue-400 transition"
                              title="Editar descrição"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          </div>
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
                    <HelpTooltip section="materiais" />
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
                          <div className="flex flex-wrap gap-4 mt-1 text-sm text-gray-400">
                            <span>Qtd: {material.quantidade}</span>
                            <span className={`px-2 py-0.5 rounded ${
                              material.fornecido_por === 'Cliente' ? 'bg-green-600/20 text-green-400' :
                              material.fornecido_por === 'HWI' ? 'bg-blue-600/20 text-blue-400' :
                              'bg-yellow-600/20 text-yellow-400'
                            }`}>
                              {material.fornecido_por}
                            </span>
                            {material.data_utilizacao && (
                              <span className="flex items-center gap-1 text-purple-400">
                                <Calendar className="w-3 h-3" />
                                {new Date(material.data_utilizacao).toLocaleDateString('pt-PT')}
                              </span>
                            )}
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

              {/* Despesas */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-emerald-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-emerald-400 font-semibold flex items-center gap-2">
                    <Receipt className="w-4 h-4" />
                    Despesas ({despesas.length})
                    <HelpTooltip section="despesas" />
                    {despesas.length > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-emerald-500/20 rounded text-sm">
                        Total: {despesas.reduce((sum, d) => sum + (d.valor || 0), 0).toFixed(2)}€
                      </span>
                    )}
                  </h4>
                  <Button
                    onClick={() => {
                      setDespesaFormData({
                        tipo: 'outras',
                        descricao: '',
                        valor: '',
                        tecnico_id: '',
                        data: new Date().toISOString().split('T')[0],
                        factura_data: null,
                        factura_filename: null,
                        factura_mimetype: null
                      });
                      setShowAddDespesaModal(true);
                    }}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar Despesa
                  </Button>
                </div>

                {despesas.length > 0 ? (
                  <div className="space-y-2">
                    {despesas.map((despesa) => (
                      <div
                        key={despesa.id}
                        className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-white font-medium">{despesa.descricao}</p>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              despesa.tipo === 'portagens' ? 'bg-orange-600/20 text-orange-400' :
                              despesa.tipo === 'combustivel' ? 'bg-red-600/20 text-red-400' :
                              despesa.tipo === 'ferramentas' ? 'bg-blue-600/20 text-blue-400' :
                              'bg-gray-600/20 text-gray-400'
                            }`}>
                              {tiposDespesa.find(t => t.value === despesa.tipo)?.label || 'Outras'}
                            </span>
                            {despesa.factura_data && (
                              <span className="text-emerald-400 text-xs">📎 Factura</span>
                            )}
                          </div>
                          <div className="flex gap-4 mt-1 text-sm text-gray-400">
                            <span className="text-emerald-400 font-semibold">{despesa.valor?.toFixed(2)}€</span>
                            <span>Pago por: {despesa.tecnico_nome}</span>
                            <span>{new Date(despesa.data).toLocaleDateString('pt-PT')}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {despesa.factura_data && (
                            <Button
                              onClick={() => downloadFactura(despesa)}
                              size="sm"
                              variant="outline"
                              className="border-emerald-500 text-emerald-500"
                              title="Download Factura"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            onClick={() => openEditDespesaModal(despesa)}
                            size="sm"
                            variant="outline"
                            className="border-blue-500 text-blue-500"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            onClick={() => handleDeleteDespesa(despesa.id)}
                            size="sm"
                            variant="outline"
                            className="border-red-500 text-red-500 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm text-center py-4">
                    Nenhuma despesa registada
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
                      <HelpTooltip section="pedidos_cotacao" />
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
                              pc.status === 'Terminado' ? 'bg-green-600/20 text-green-400' :
                              'bg-purple-600/20 text-purple-400'
                            }`}>{pc.status}</span>
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Assinaturas */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-blue-400 font-semibold flex items-center gap-2">
                    <PenTool className="w-4 h-4" />
                    Assinaturas do Cliente ({assinaturas.length})
                    <HelpTooltip section="assinaturas" />
                  </h4>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={async () => {
                        try {
                          toast.loading('A sincronizar assinaturas...', { id: 'refresh-assinaturas' });
                          await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/refresh-assinaturas`);
                          await fetchAssinaturas(selectedRelatorio.id);
                          toast.success('Assinaturas sincronizadas!', { id: 'refresh-assinaturas' });
                        } catch (error) {
                          toast.error('Erro ao sincronizar assinaturas', { id: 'refresh-assinaturas' });
                        }
                      }}
                      size="sm"
                      variant="outline"
                      className="border-blue-500 text-blue-500 hover:bg-blue-500/10"
                      title="Sincronizar assinaturas (corrige problemas no PDF)"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => openAssinaturaModal()}
                      size="sm"
                      className="bg-green-500 hover:bg-green-600"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Nova Assinatura
                    </Button>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  Declaro que aceito os trabalhos acima descritos e que tudo foi efetuado de acordo com a folha de assistência.
                </p>

                {assinaturas.length > 0 ? (
                  <div className="space-y-3">
                    {assinaturas.map((assinatura, index) => (
                      <div key={assinatura.id} className="bg-black/30 rounded-lg p-4 border border-gray-700">
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">
                            Assinatura #{index + 1}
                          </span>
                          <Button
                            onClick={() => handleDeleteAssinatura(assinatura.id)}
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:bg-red-500/10 h-6 w-6 p-0"
                            title="Eliminar assinatura"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        
                        <div className="flex items-start gap-4">
                          {/* Assinatura Digital - Sempre mostrar se tiver URL ou base64 */}
                          {(assinatura.assinatura_url || assinatura.assinatura_base64) && (
                            <div className="flex-1">
                              <p className="text-xs text-gray-500 mb-2">
                                {assinatura.tipo === 'digital' ? 'Assinatura Digital:' : 'Assinatura:'}
                              </p>
                              <div className="bg-white p-3 rounded border-2 border-gray-300">
                                <img
                                  src={assinatura.assinatura_base64 
                                    ? (assinatura.assinatura_base64.startsWith('data:') 
                                        ? assinatura.assinatura_base64 
                                        : `data:image/png;base64,${assinatura.assinatura_base64}`)
                                    : `${API}/relatorios-tecnicos/${selectedRelatorio?.id}/assinaturas/${assinatura.id}/imagem?t=${assinatura.data_assinatura || Date.now()}`
                                  }
                                  alt="Assinatura"
                                  className="max-h-32 w-full object-contain"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.parentElement.innerHTML = '<p class="text-gray-600 text-sm text-center py-4">Erro ao carregar</p>';
                                  }}
                                />
                              </div>
                            </div>
                          )}
                          
                          {/* Informações */}
                          <div className={assinatura.assinatura_url ? 'flex-1' : 'w-full'}>
                            <div className="space-y-2">
                              {assinatura.data_intervencao && (
                                <div>
                                  <p className="text-xs text-gray-500">Data da Intervenção:</p>
                                  <p className="text-orange-400 font-semibold">
                                    {assinatura.data_intervencao.includes('T') 
                                      ? new Date(assinatura.data_intervencao).toLocaleDateString('pt-PT')
                                      : assinatura.data_intervencao}
                                  </p>
                                </div>
                              )}
                              <div>
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                  Nome:
                                  {editingAssinaturaNome !== assinatura.id && (
                                    <button
                                      onClick={() => {
                                        setEditingAssinaturaNome(assinatura.id);
                                        setEditingNomeData({
                                          primeiro_nome: assinatura.primeiro_nome || '',
                                          ultimo_nome: assinatura.ultimo_nome || ''
                                        });
                                      }}
                                      className="text-blue-400 hover:text-blue-300"
                                      title="Editar nome"
                                    >
                                      <Edit className="w-3 h-3" />
                                    </button>
                                  )}
                                </p>
                                {editingAssinaturaNome === assinatura.id ? (
                                  <div className="flex items-center gap-2 flex-wrap mt-1">
                                    <Input
                                      type="text"
                                      placeholder="Primeiro nome"
                                      value={editingNomeData.primeiro_nome}
                                      onChange={(e) => setEditingNomeData(prev => ({ ...prev, primeiro_nome: e.target.value }))}
                                      className="bg-[#1a1a1a] border-gray-700 text-white h-7 w-28 text-sm"
                                    />
                                    <Input
                                      type="text"
                                      placeholder="Último nome"
                                      value={editingNomeData.ultimo_nome}
                                      onChange={(e) => setEditingNomeData(prev => ({ ...prev, ultimo_nome: e.target.value }))}
                                      className="bg-[#1a1a1a] border-gray-700 text-white h-7 w-28 text-sm"
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => handleUpdateAssinaturaNome(assinatura.id)}
                                      className="h-7 px-2 bg-green-600 hover:bg-green-700"
                                    >
                                      <Check className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setEditingAssinaturaNome(null)}
                                      className="h-7 px-2 text-gray-400 hover:text-white"
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <p className="text-white font-semibold">
                                    {assinatura.assinado_por || `${assinatura.primeiro_nome || ''} ${assinatura.ultimo_nome || ''}`.trim() || 'Sem nome'}
                                  </p>
                                )}
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                  Data de Assinatura:
                                  {editingAssinaturaDesktop !== assinatura.id && (
                                    <button
                                      onClick={() => {
                                        const dateObj = new Date(assinatura.data_assinatura);
                                        setEditingAssinaturaDesktop(assinatura.id);
                                        setEditingAssinaturaData({
                                          date: dateObj.toISOString().split('T')[0],
                                          time: dateObj.toTimeString().substring(0,5)
                                        });
                                      }}
                                      className="text-blue-400 hover:text-blue-300"
                                      title="Editar data de assinatura"
                                    >
                                      <Edit className="w-3 h-3" />
                                    </button>
                                  )}
                                </p>
                                {editingAssinaturaDesktop === assinatura.id ? (
                                  <div className="flex items-center gap-2 flex-wrap mt-1">
                                    <Input
                                      type="date"
                                      value={editingAssinaturaData.date}
                                      onChange={(e) => setEditingAssinaturaData(prev => ({ ...prev, date: e.target.value }))}
                                      className="bg-[#1a1a1a] border-gray-700 text-white h-7 w-32 text-sm"
                                    />
                                    <Input
                                      type="time"
                                      step="1"
                                      value={editingAssinaturaData.time}
                                      onChange={(e) => setEditingAssinaturaData(prev => ({ ...prev, time: e.target.value }))}
                                      className="bg-[#1a1a1a] border-gray-700 text-white h-7 w-24 text-sm"
                                    />
                                    <Button
                                      size="sm"
                                      onClick={async () => {
                                        try {
                                          const newDateTime = `${editingAssinaturaData.date}T${editingAssinaturaData.time}`;
                                          await axios.patch(
                                            `${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinaturas/${assinatura.id}`,
                                            { data_assinatura: newDateTime }
                                          );
                                          toast.success('Data de assinatura atualizada!');
                                          setEditingAssinaturaDesktop(null);
                                          fetchAssinaturas(selectedRelatorio.id);
                                        } catch (error) {
                                          toast.error('Erro ao atualizar');
                                        }
                                      }}
                                      className="bg-green-600 hover:bg-green-700 h-7 text-xs"
                                    >
                                      Guardar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setEditingAssinaturaDesktop(null)}
                                      className="text-gray-400 h-7 text-xs"
                                    >
                                      Cancelar
                                    </Button>
                                  </div>
                                ) : (
                                  <p className="text-gray-300 text-sm">
                                    {new Date(assinatura.data_assinatura).toLocaleString('pt-PT')}
                                  </p>
                                )}
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Tipo:</p>
                                <p className="text-gray-400 text-sm">
                                  {assinatura.tipo === 'digital' ? '✏️ Digital' : '📝 Manual'}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <PenTool className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">OT ainda não assinada</p>
                    <p className="text-gray-500 text-xs mt-1">Clique em "Nova Assinatura" para o cliente assinar</p>
                  </div>
                )}
              </div>


              {/* Botões de Ação */}
              <div className={`${isMobile ? 'flex flex-col gap-2 pt-4' : 'grid grid-cols-2 lg:grid-cols-3 gap-3 pt-6'}`}>
                {/* Download PDF - Vermelho */}
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
                  className={`bg-red-600 hover:bg-red-700 text-white ${isMobile ? 'w-full py-3 text-sm' : 'px-4 py-3'}`}
                >
                  <Download className={`${isMobile ? 'w-4 h-4 mr-2' : 'w-5 h-5 mr-2'}`} />
                  Download PDF
                </Button>

                {/* Visualizar Relatório (HTML igual ao PDF) - Verde */}
                <Button
                  onClick={handleHTMLPreview}
                  disabled={loadingHTMLPreview}
                  className={`bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white ${isMobile ? 'w-full py-3 text-sm' : 'px-4 py-3'}`}
                  data-testid="visualizar-relatorio-btn"
                >
                  <Eye className={`${isMobile ? 'w-4 h-4 mr-2' : 'w-5 h-5 mr-2'}`} />
                  {loadingHTMLPreview ? 'A carregar...' : (isMobile ? 'Visualizar' : 'Visualizar Relatório')}
                </Button>

                {/* Folha de Horas - Laranja */}
                <Button
                  onClick={handleOpenFolhaHoras}
                  disabled={loadingFolhaHoras}
                  className={`bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white ${isMobile ? 'w-full py-3 text-sm' : 'px-4 py-3'}`}
                  data-testid="folha-horas-btn"
                >
                  <FileSpreadsheet className={`${isMobile ? 'w-4 h-4 mr-2' : 'w-5 h-5 mr-2'}`} />
                  {loadingFolhaHoras ? 'A carregar...' : 'Folha de Horas'}
                </Button>
                
                {/* Botões de Mudança de Estado - Fluxo: Pendente → Em Execução → Concluído */}
                {(selectedRelatorio?.status === 'pendente' || selectedRelatorio?.status === 'agendado') && (
                  <Button
                    onClick={async () => {
                      try {
                        await axios.patch(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/status`, {
                          status: 'em_execucao'
                        });
                        toast.success('OT marcada como Em Execução!');
                        setSelectedRelatorio({ ...selectedRelatorio, status: 'em_execucao' });
                        fetchRelatorios();
                      } catch (error) {
                        toast.error('Erro ao atualizar estado');
                      }
                    }}
                    className={`bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white ${isMobile ? 'w-full py-3 text-sm' : 'px-4 py-3'}`}
                    data-testid="marcar-execucao-btn"
                  >
                    <PlayCircle className={`${isMobile ? 'w-4 h-4 mr-2' : 'w-5 h-5 mr-2'}`} />
                    {isMobile ? 'Em Execução' : 'Marcar em Execução'}
                  </Button>
                )}
                {selectedRelatorio?.status === 'em_execucao' && (
                  <Button
                    onClick={async () => {
                      try {
                        await axios.patch(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/status`, {
                          status: 'concluido'
                        });
                        toast.success('OT marcada como Concluída!');
                        setSelectedRelatorio({ ...selectedRelatorio, status: 'concluido' });
                        fetchRelatorios();
                      } catch (error) {
                        toast.error('Erro ao atualizar estado');
                      }
                    }}
                    className={`bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white ${isMobile ? 'w-full py-3 text-sm' : 'px-4 py-3'}`}
                    data-testid="marcar-concluido-btn"
                  >
                    <CheckCircle className={`${isMobile ? 'w-4 h-4 mr-2' : 'w-5 h-5 mr-2'}`} />
                    {isMobile ? 'Concluída' : 'Marcar como Concluída'}
                  </Button>
                )}
                {selectedRelatorio?.status === 'concluido' && (
                  <Button
                    onClick={async () => {
                      try {
                        await axios.patch(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/status`, {
                          status: 'em_execucao'
                        });
                        toast.success('OT reaberta - Em Execução!');
                        setSelectedRelatorio({ ...selectedRelatorio, status: 'em_execucao' });
                        fetchRelatorios();
                      } catch (error) {
                        toast.error('Erro ao atualizar estado');
                      }
                    }}
                    className={`bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white ${isMobile ? 'w-full py-3 text-sm' : 'px-4 py-3'}`}
                    data-testid="reabrir-ot-btn"
                  >
                    <RefreshCw className={`${isMobile ? 'w-4 h-4 mr-2' : 'w-5 h-5 mr-2'}`} />
                    {isMobile ? 'Reabrir OT' : 'Reabrir OT (Em Execução)'}
                  </Button>
                )}
                
                {/* Enviar Por Email - Roxo (apenas admin) */}
                {user.is_admin && (
                  <Button
                    onClick={openEmailModal}
                    className={`bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white ${isMobile ? 'w-full py-3 text-sm' : 'px-4 py-3'}`}
                    data-testid="enviar-email-btn"
                  >
                    <Mail className={`${isMobile ? 'w-4 h-4 mr-2' : 'w-5 h-5 mr-2'}`} />
                    {isMobile ? 'Enviar Email' : 'Enviar Por Email'}
                  </Button>
                )}
                
                {/* Botão FECHAR - Para fechar o painel da OT */}
                <Button
                  onClick={() => {
                    setSelectedRelatorio(null);
                    setShowViewRelatorioModal(false);
                  }}
                  variant="outline"
                  className={`border-gray-600 hover:bg-gray-700 text-gray-300 hover:text-white ${isMobile ? 'w-full py-3 text-sm mt-4' : 'px-4 py-3 col-span-full'}`}
                  data-testid="fechar-ot-btn"
                >
                  <X className={`${isMobile ? 'w-4 h-4 mr-2' : 'w-5 h-5 mr-2'}`} />
                  FECHAR
                </Button>
              </div>


            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Enviar Email OT */}
      <Dialog open={showEmailModal} onOpenChange={setShowEmailModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Mail className="w-5 h-5 text-purple-400" />
              Enviar OT Por Email
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Emails do Cliente */}
            <div>
              <Label className="text-gray-300 mb-2 block">Emails do Cliente</Label>
              {emailsCliente.length === 0 ? (
                <p className="text-gray-500 text-sm italic">Nenhum email registado para este cliente</p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {emailsCliente.map((item, index) => (
                    <label
                      key={index}
                      className="flex items-center gap-3 p-3 bg-[#0f0f0f] border border-gray-700 rounded-lg cursor-pointer hover:border-purple-500/50 transition"
                    >
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleEmailSelection(index)}
                        className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500"
                      />
                      <span className="text-white">{item.email}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Emails Adicionais */}
            <div>
              <Label className="text-gray-300 mb-2 block">
                Emails Adicionais <span className="text-gray-500 text-xs">(separados por vírgula)</span>
              </Label>
              <Input
                value={emailsAdicionais}
                onChange={(e) => setEmailsAdicionais(e.target.value)}
                placeholder="email1@exemplo.com, email2@exemplo.com"
                className="bg-[#0f0f0f] border-gray-700 text-white"
              />
            </div>

            {/* Resumo */}
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
              <p className="text-sm text-purple-300">
                <strong>OT #{selectedRelatorio?.numero_assistencia}</strong> será enviada para {emailsCliente.filter(e => e.selected).length + (emailsAdicionais.trim() ? emailsAdicionais.split(/[;,]/).filter(e => e.trim()).length : 0)} email(s)
              </p>
            </div>

            {/* Botões */}
            <div className="flex gap-3 pt-2">
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
                className="flex-1 bg-purple-600 hover:bg-purple-700"
                disabled={sendingEmail || (emailsCliente.filter(e => e.selected).length === 0 && !emailsAdicionais.trim())}
                data-testid="confirmar-enviar-email"
              >
                {sendingEmail ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                    A enviar...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Enviar
                  </>
                )}
              </Button>
            </div>
          </div>
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
              <Label htmlFor="equipamento_intervencao" className="text-gray-300">
                Equipamento Relacionado
              </Label>
              <select
                id="equipamento_intervencao"
                value={intervencaoFormData.equipamento_id}
                onChange={(e) => setIntervencaoFormData({ ...intervencaoFormData, equipamento_id: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3"
              >
                <option value="">-- Selecionar Equipamento (opcional) --</option>
                {equipamentosOT.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.tipologia} - {eq.marca} {eq.modelo} {eq.numero_serie ? `(S/N: ${eq.numero_serie})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Selecione o equipamento ao qual esta intervenção se refere
              </p>
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
                    relatorio_assistencia: '',
                    equipamento_id: ''
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
              <Label htmlFor="edit_equipamento_intervencao" className="text-gray-300">
                Equipamento Relacionado
              </Label>
              <select
                id="edit_equipamento_intervencao"
                value={intervencaoFormData.equipamento_id || ''}
                onChange={(e) => setIntervencaoFormData({ ...intervencaoFormData, equipamento_id: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3"
              >
                <option value="">-- Selecionar Equipamento (opcional) --</option>
                {equipamentosOT.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.tipologia} - {eq.marca} {eq.modelo} {eq.numero_serie ? `(S/N: ${eq.numero_serie})` : ''}
                  </option>
                ))}
              </select>
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

      {/* Add Técnico Modal - Componente Extraído */}
      <TecnicoModal
        open={showAddTecnicoModal}
        onOpenChange={setShowAddTecnicoModal}
        isEditing={false}
        tecnicoFormData={tecnicoFormData}
        setTecnicoFormData={setTecnicoFormData}
        allUsers={allSystemUsers}
        onSubmit={handleAddTecnico}
      />

      {/* Edit Técnico Modal - Componente Extraído */}
      <TecnicoModal
        open={showEditTecnicoModal}
        onOpenChange={setShowEditTecnicoModal}
        isEditing={true}
        tecnicoFormData={tecnicoFormData}
        setTecnicoFormData={setTecnicoFormData}
        allUsers={allSystemUsers}
        onSubmit={handleEditTecnico}
      />

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
                Descrição / Observações <span className="text-gray-500 text-xs">(opcional)</span>
              </Label>
              <textarea
                id="foto_descricao"
                defaultValue={fotoDescricao}
                onBlur={(e) => setFotoDescricao(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3 min-h-[100px]"
                placeholder="Descreva o componente ou situação na fotografia..."
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

      {/* Modal Editar Descrição da Foto */}
      <Dialog open={showEditFotoModal} onOpenChange={(open) => {
        setShowEditFotoModal(open);
        if (!open) {
          setSelectedFoto(null);
          setEditFotoDescricao('');
          setEditFotoData('');
        }
      }}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Edit className="w-5 h-5 text-blue-400" />
              Editar Fotografia
            </DialogTitle>
          </DialogHeader>

          {selectedFoto && (
            <div className="space-y-4 mt-4">
              {/* Preview da imagem */}
              <div className="bg-black/30 rounded-lg p-3">
                <img
                  src={`${API}${selectedFoto.foto_url}`}
                  alt={selectedFoto.descricao || 'Fotografia'}
                  className="w-full max-h-48 object-contain rounded"
                />
              </div>

              {/* Campo de data */}
              <div>
                <Label className="text-gray-300 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Data da Fotografia
                </Label>
                <Input
                  type="datetime-local"
                  value={editFotoData}
                  onChange={(e) => setEditFotoData(e.target.value)}
                  className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                  data-testid="edit-foto-data"
                />
              </div>

              {/* Campo de descrição */}
              <div>
                <Label className="text-gray-300">Descrição / Observações</Label>
                <textarea
                  value={editFotoDescricao}
                  onChange={(e) => setEditFotoDescricao(e.target.value)}
                  className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-3 min-h-[100px] mt-1"
                  placeholder="Descreva o componente ou situação na fotografia..."
                  data-testid="edit-foto-descricao"
                />
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => {
                    setShowEditFotoModal(false);
                    setSelectedFoto(null);
                    setEditFotoDescricao('');
                    setEditFotoData('');
                  }}
                  variant="outline"
                  className="flex-1 border-gray-600"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleUpdateFotoDescricao}
                  className="flex-1 bg-blue-500 hover:bg-blue-600"
                  data-testid="save-foto-descricao"
                >
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Material Modal - Componente Extraído */}
      <MaterialModal
        open={showAddMaterialModal}
        onOpenChange={setShowAddMaterialModal}
        isEditing={false}
        materialFormData={materialFormData}
        setMaterialFormData={setMaterialFormData}
        onSubmit={handleAddMaterial}
        onCancel={() => {
          setShowAddMaterialModal(false);
          setMaterialFormData({ descricao: '', quantidade: 1, fornecido_por: 'Cliente', data_utilizacao: '' });
        }}
      />

      {/* Edit Material Modal - Componente Extraído */}
      <MaterialModal
        open={showEditMaterialModal}
        onOpenChange={setShowEditMaterialModal}
        isEditing={true}
        materialFormData={materialFormData}
        setMaterialFormData={setMaterialFormData}
        onSubmit={handleUpdateMaterial}
        onCancel={() => {
          setShowEditMaterialModal(false);
          setSelectedMaterial(null);
        }}
      />

      {/* Add Despesa Modal */}
      <Dialog open={showAddDespesaModal} onOpenChange={setShowAddDespesaModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Receipt className="w-5 h-5 text-emerald-400" />
              Nova Despesa
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddDespesa} className="space-y-4 mt-4">
            <div>
              <Label htmlFor="despesa-tipo" className="text-gray-300">Tipo de Despesa *</Label>
              <select
                id="despesa-tipo"
                value={despesaFormData.tipo}
                onChange={(e) => setDespesaFormData(prev => ({ ...prev, tipo: e.target.value }))}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 mt-1"
                required
              >
                {tiposDespesa.map(tipo => (
                  <option key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {despesaFormData.tipo === 'portagens' 
                  ? '→ Vai para a coluna "Portagens" na Folha de Horas'
                  : '→ Vai para a coluna "Despesas" na Folha de Horas'}
              </p>
            </div>
            <div>
              <Label htmlFor="despesa-descricao" className="text-gray-300">Descrição *</Label>
              <Input
                id="despesa-descricao"
                value={despesaFormData.descricao}
                onChange={(e) => setDespesaFormData(prev => ({ ...prev, descricao: e.target.value }))}
                placeholder="Ex: Combustível, Almoço, Parque..."
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="despesa-valor" className="text-gray-300">Valor (€) *</Label>
              <Input
                id="despesa-valor"
                type="number"
                step="0.01"
                min="0.01"
                value={despesaFormData.valor}
                onChange={(e) => setDespesaFormData(prev => ({ ...prev, valor: parseFloat(e.target.value) || '' }))}
                placeholder="0.00"
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="despesa-tecnico" className="text-gray-300">Pago por (Técnico) *</Label>
              <select
                id="despesa-tecnico"
                value={despesaFormData.tecnico_id}
                onChange={(e) => setDespesaFormData(prev => ({ ...prev, tecnico_id: e.target.value }))}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 mt-1"
                required
              >
                <option value="">Selecionar técnico...</option>
                {allSystemUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.username}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="despesa-data" className="text-gray-300">Data *</Label>
              <Input
                id="despesa-data"
                type="date"
                value={despesaFormData.data}
                onChange={(e) => setDespesaFormData(prev => ({ ...prev, data: e.target.value }))}
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-gray-300">Factura (opcional)</Label>
              <div className="mt-1">
                {despesaFormData.factura_filename ? (
                  <div className="flex items-center gap-2 p-2 bg-emerald-900/30 border border-emerald-700 rounded">
                    <span className="text-emerald-400">📎 {despesaFormData.factura_filename}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300"
                      onClick={() => setDespesaFormData(prev => ({ ...prev, factura_data: null, factura_filename: null, factura_mimetype: null }))}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-emerald-500 transition-colors">
                    <Upload className="w-5 h-5 text-gray-400" />
                    <span className="text-gray-400">Carregar factura (PDF, JPG, PNG)</span>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFacturaUpload}
                      className="hidden"
                      disabled={uploadingFactura}
                    />
                  </label>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAddDespesaModal(false);
                  setDespesaFormData({
                    tipo: 'outras',
                    descricao: '',
                    valor: '',
                    tecnico_id: '',
                    data: new Date().toISOString().split('T')[0],
                    factura_data: null,
                    factura_filename: null,
                    factura_mimetype: null
                  });
                }}
                className="border-gray-600"
              >
                Cancelar
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
                <Receipt className="w-4 h-4 mr-1" />
                Gerar Despesa
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Despesa Modal */}
      <Dialog open={showEditDespesaModal} onOpenChange={setShowEditDespesaModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Receipt className="w-5 h-5 text-emerald-400" />
              Editar Despesa
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateDespesa} className="space-y-4 mt-4">
            <div>
              <Label htmlFor="edit-despesa-tipo" className="text-gray-300">Tipo de Despesa *</Label>
              <select
                id="edit-despesa-tipo"
                value={despesaFormData.tipo}
                onChange={(e) => setDespesaFormData(prev => ({ ...prev, tipo: e.target.value }))}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 mt-1"
                required
              >
                {tiposDespesa.map(tipo => (
                  <option key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {despesaFormData.tipo === 'portagens' 
                  ? '→ Vai para a coluna "Portagens" na Folha de Horas'
                  : '→ Vai para a coluna "Despesas" na Folha de Horas'}
              </p>
            </div>
            <div>
              <Label htmlFor="edit-despesa-descricao" className="text-gray-300">Descrição *</Label>
              <Input
                id="edit-despesa-descricao"
                value={despesaFormData.descricao}
                onChange={(e) => setDespesaFormData(prev => ({ ...prev, descricao: e.target.value }))}
                placeholder="Ex: Combustível, Almoço, Parque..."
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-despesa-valor" className="text-gray-300">Valor (€) *</Label>
              <Input
                id="edit-despesa-valor"
                type="number"
                step="0.01"
                min="0.01"
                value={despesaFormData.valor}
                onChange={(e) => setDespesaFormData(prev => ({ ...prev, valor: parseFloat(e.target.value) || '' }))}
                placeholder="0.00"
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-despesa-tecnico" className="text-gray-300">Pago por (Técnico) *</Label>
              <select
                id="edit-despesa-tecnico"
                value={despesaFormData.tecnico_id}
                onChange={(e) => setDespesaFormData(prev => ({ ...prev, tecnico_id: e.target.value }))}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 mt-1"
                required
              >
                <option value="">Selecionar técnico...</option>
                {allSystemUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.username}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="edit-despesa-data" className="text-gray-300">Data *</Label>
              <Input
                id="edit-despesa-data"
                type="date"
                value={despesaFormData.data}
                onChange={(e) => setDespesaFormData(prev => ({ ...prev, data: e.target.value }))}
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-gray-300">Factura</Label>
              <div className="mt-1">
                {despesaFormData.factura_filename ? (
                  <div className="flex items-center gap-2 p-2 bg-emerald-900/30 border border-emerald-700 rounded">
                    <span className="text-emerald-400">📎 {despesaFormData.factura_filename}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300"
                      onClick={() => setDespesaFormData(prev => ({ ...prev, factura_data: null, factura_filename: null, factura_mimetype: null }))}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-emerald-500 transition-colors">
                    <Upload className="w-5 h-5 text-gray-400" />
                    <span className="text-gray-400">Carregar factura (PDF, JPG, PNG)</span>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFacturaUpload}
                      className="hidden"
                      disabled={uploadingFactura}
                    />
                  </label>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowEditDespesaModal(false);
                  setSelectedDespesa(null);
                }}
                className="border-gray-600"
              >
                Cancelar
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
                <Receipt className="w-4 h-4 mr-1" />
                Guardar Alterações
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
                  <option value="Terminado">Terminado</option>
                </select>
              </div>

              {/* Materiais */}
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <h4 className="text-blue-400 font-semibold mb-3">Material para Cotação</h4>
                {selectedPC.materiais?.length > 0 ? (
                  <div className="space-y-2">
                    {selectedPC.materiais.map((mat) => (
                      <div key={mat.id} className="flex justify-between items-center p-2 bg-gray-800 rounded">
                        <div className="flex-1">
                          <span className="text-white">{mat.descricao}</span>
                          <span className="text-gray-400 ml-3">Qtd: {mat.quantidade}</span>
                        </div>
                        <Button
                          onClick={() => openEditMaterialPCModal(mat)}
                          variant="ghost"
                          size="sm"
                          className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
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

              {/* Faturas */}
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-amber-400 font-semibold flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Faturas de Peças
                  </h4>
                </div>

                {/* Upload Form */}
                <form onSubmit={handleUploadFatura} className="mb-4 p-3 bg-[#0a0a0a] rounded-lg border border-gray-700">
                  <div className="flex flex-col gap-3">
                    <div>
                      <Label className="text-gray-300 text-sm">Ficheiro (PDF, Imagem)</Label>
                      <Input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.gif,.webp"
                        onChange={(e) => setFaturaFile(e.target.files[0])}
                        className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-300 text-sm">Descrição (opcional)</Label>
                      <Input
                        value={faturaDescricao}
                        onChange={(e) => setFaturaDescricao(e.target.value)}
                        className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                        placeholder="Ex: Fatura peça X, Orçamento fornecedor Y"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={!faturaFile || uploadingFatura}
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadingFatura ? 'A carregar...' : 'Carregar Fatura'}
                    </Button>
                  </div>
                </form>

                {/* Lista de Faturas */}
                {faturasPC.length > 0 ? (
                  <div className="space-y-2">
                    {faturasPC.map((fatura) => (
                      <div 
                        key={fatura.id} 
                        className="flex items-center justify-between p-3 bg-[#0a0a0a] rounded-lg border border-gray-700 hover:border-amber-500/50 transition"
                      >
                        <div 
                          className="flex-1 cursor-pointer hover:text-amber-400 transition"
                          onClick={() => handleViewFatura(fatura)}
                          title="Clique para ver"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-amber-400" />
                            <span className="text-white font-medium">{fatura.nome_ficheiro}</span>
                          </div>
                          {fatura.descricao && (
                            <p className="text-gray-400 text-sm mt-1 ml-6">{fatura.descricao}</p>
                          )}
                          <p className="text-gray-500 text-xs mt-1 ml-6">
                            {fatura.uploaded_by && `Por ${fatura.uploaded_by} • `}
                            {fatura.uploaded_at && new Date(fatura.uploaded_at).toLocaleDateString('pt-PT')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => handleViewFatura(fatura)}
                            size="sm"
                            variant="outline"
                            className="border-gray-600 text-gray-300 hover:text-white"
                            title="Ver fatura"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => handleDeleteFatura(fatura.id)}
                            size="sm"
                            variant="destructive"
                            title="Remover fatura"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm text-center py-4">Nenhuma fatura carregada</p>
                )}
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

      {/* Edit Material PC Modal */}
      <Dialog open={showEditMaterialPCModal} onOpenChange={setShowEditMaterialPCModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Editar Material</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-gray-300">Descrição</Label>
              <Input
                value={editMaterialPCForm.descricao}
                onChange={(e) => setEditMaterialPCForm({ ...editMaterialPCForm, descricao: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                placeholder="Descrição do material"
              />
            </div>
            <div>
              <Label className="text-gray-300">Quantidade</Label>
              <Input
                type="number"
                min="1"
                value={editMaterialPCForm.quantidade}
                onChange={(e) => setEditMaterialPCForm({ ...editMaterialPCForm, quantidade: parseInt(e.target.value) || 1 })}
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => setShowEditMaterialPCModal(false)}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleUpdateMaterialPC}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* Assinatura Modal - Componente Extraído */}
      <AssinaturaModal
        open={showAssinaturaModal}
        onOpenChange={setShowAssinaturaModal}
        selectedRelatorio={selectedRelatorio}
        assinaturas={assinaturas}
        onAssinaturaSaved={() => {
          fetchAssinaturas(selectedRelatorio?.id);
        }}
      />

      {/* PDF Preview Modal - Componente Extraído */}
      <PDFPreviewModal
        open={showPDFPreviewModal}
        onOpenChange={closePDFPreview}
        pdfUrl={pdfPreviewUrl}
        title={`Visualização do PDF - OT #${selectedRelatorio?.numero_assistencia}`}
        onDownload={() => {
          if (pdfPreviewUrl) {
            const link = document.createElement('a');
            link.href = pdfPreviewUrl;
            link.download = `OT_${selectedRelatorio?.numero_assistencia}.pdf`;
            link.click();
          }
        }}
      />

      {/* HTML Preview Modal - Visualização estilo PDF para Cliente - ORGANIZADO POR DATA DE INTERVENÇÃO */}
      <Dialog open={showHTMLPreviewModal} onOpenChange={setShowHTMLPreviewModal}>
        <DialogContent className="bg-white text-black max-w-4xl max-h-[95vh] overflow-y-auto p-0">
          {htmlPreviewData && (() => {
            // Agrupar dados por data de intervenção
            const intervencoesPorData = {};
            
            // Helper para criar estrutura de dados por data
            const criarGrupoPorData = (dataKey) => {
              if (!intervencoesPorData[dataKey]) {
                intervencoesPorData[dataKey] = {
                  intervencoes: [],
                  registos: [],
                  materiais: [],
                  fotografias: [],
                  assinaturas: []
                };
              }
            };
            
            // Primeiro, criar blocos para cada intervenção (pela data_intervencao)
            htmlPreviewData.intervencoes?.forEach((int, idx) => {
              const dataKey = int.data_intervencao ? int.data_intervencao.split('T')[0] : 'sem_data';
              criarGrupoPorData(dataKey);
              intervencoesPorData[dataKey].intervencoes.push({ ...int, numero: idx + 1 });
            });
            
            // Adicionar registos de mão de obra pela data
            htmlPreviewData.registos?.forEach(reg => {
              const dataKey = reg.data ? reg.data.split('T')[0] : 'sem_data';
              criarGrupoPorData(dataKey);
              intervencoesPorData[dataKey].registos.push(reg);
            });
            
            // Adicionar materiais pela data_utilizacao
            htmlPreviewData.materiais?.forEach(mat => {
              const dataKey = mat.data_utilizacao ? mat.data_utilizacao.split('T')[0] : 'sem_data';
              criarGrupoPorData(dataKey);
              intervencoesPorData[dataKey].materiais.push(mat);
            });
            
            // Adicionar fotografias pela data de upload (uploaded_at)
            htmlPreviewData.fotografias?.forEach(foto => {
              const dataKey = foto.uploaded_at ? foto.uploaded_at.split('T')[0] : 'sem_data';
              criarGrupoPorData(dataKey);
              intervencoesPorData[dataKey].fotografias.push(foto);
            });
            
            // Adicionar assinaturas pela DATA DE ASSINATURA (data_assinatura)
            htmlPreviewData.assinaturas?.forEach(ass => {
              const dataKey = ass.data_assinatura ? ass.data_assinatura.split('T')[0] : 'sem_data';
              criarGrupoPorData(dataKey);
              intervencoesPorData[dataKey].assinaturas.push(ass);
            });
            
            // Ordenar datas cronologicamente
            const datasOrdenadas = Object.keys(intervencoesPorData)
              .filter(d => d !== 'sem_data')
              .sort((a, b) => new Date(a) - new Date(b));
            
            // Adicionar 'sem_data' no final se existir com conteúdo
            if (intervencoesPorData['sem_data'] && (
              intervencoesPorData['sem_data'].intervencoes.length > 0 ||
              intervencoesPorData['sem_data'].registos.length > 0 ||
              intervencoesPorData['sem_data'].materiais.length > 0 ||
              intervencoesPorData['sem_data'].fotografias.length > 0 ||
              intervencoesPorData['sem_data'].assinaturas.length > 0
            )) {
              datasOrdenadas.push('sem_data');
            }
            
            return (
            <div className="pdf-preview-container">
              {/* Header */}
              <div className="bg-gray-800 text-white p-6 print:bg-gray-800">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-2xl font-bold">RELATÓRIO TÉCNICO</h1>
                    <p className="text-gray-300 mt-1">Ordem de Trabalho #{htmlPreviewData.relatorio.numero_assistencia}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-300">Data: {new Date(htmlPreviewData.relatorio.data_servico).toLocaleDateString('pt-PT')}</p>
                    <p className="text-sm text-gray-300">Estado: {getStatusLabel(htmlPreviewData.relatorio.status)}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Informações do Cliente */}
                <section className="border border-gray-300 rounded-lg p-4">
                  <h2 className="text-lg font-bold text-gray-800 border-b border-gray-300 pb-2 mb-3">INFORMAÇÕES DO CLIENTE</h2>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-semibold text-gray-600">Cliente:</span>
                      <p className="text-gray-800">{htmlPreviewData.relatorio.cliente_nome}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-600">Pedido por:</span>
                      <p className="text-gray-800">{htmlPreviewData.relatorio.pedido_por || '-'}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-600">Local:</span>
                      <p className="text-gray-800">{htmlPreviewData.relatorio.local_intervencao || '-'}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-600">Motivo:</span>
                      <p className="text-gray-800">{htmlPreviewData.relatorio.motivo_assistencia || '-'}</p>
                    </div>
                  </div>
                </section>

                {/* Equipamentos - Secção global (não têm data específica) */}
                {(htmlPreviewData.equipamentos?.length > 0 || 
                  htmlPreviewData.relatorio?.equipamento_marca || 
                  htmlPreviewData.relatorio?.equipamento_tipologia ||
                  htmlPreviewData.relatorio?.equipamento_modelo) && (
                  <section className="border border-gray-300 rounded-lg p-4">
                    <h2 className="text-lg font-bold text-gray-800 border-b border-gray-300 pb-2 mb-3">EQUIPAMENTOS</h2>
                    <div className="space-y-3">
                      {/* Equipamento principal */}
                      {(htmlPreviewData.relatorio?.equipamento_marca || 
                        htmlPreviewData.relatorio?.equipamento_tipologia || 
                        htmlPreviewData.relatorio?.equipamento_modelo) && (
                        <div className="bg-gray-50 p-3 rounded">
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {htmlPreviewData.relatorio.equipamento_tipologia && (
                              <div className="flex">
                                <span className="font-semibold text-gray-600 min-w-[120px]">TIPOLOGIA:</span>
                                <span className="text-gray-800">{htmlPreviewData.relatorio.equipamento_tipologia}</span>
                              </div>
                            )}
                            {htmlPreviewData.relatorio.equipamento_numero_serie && (
                              <div className="flex">
                                <span className="font-semibold text-gray-600 min-w-[120px]">Nº SÉRIE:</span>
                                <span className="text-gray-800">{htmlPreviewData.relatorio.equipamento_numero_serie}</span>
                              </div>
                            )}
                            {htmlPreviewData.relatorio.equipamento_marca && (
                              <div className="flex">
                                <span className="font-semibold text-gray-600 min-w-[120px]">MARCA:</span>
                                <span className="text-gray-800">{htmlPreviewData.relatorio.equipamento_marca}</span>
                              </div>
                            )}
                            {htmlPreviewData.relatorio.equipamento_modelo && (
                              <div className="flex">
                                <span className="font-semibold text-gray-600 min-w-[120px]">MODELO:</span>
                                <span className="text-gray-800">{htmlPreviewData.relatorio.equipamento_modelo}</span>
                              </div>
                            )}
                            {htmlPreviewData.relatorio.equipamento_ano_fabrico && (
                              <div className="flex">
                                <span className="font-semibold text-gray-600 min-w-[120px]">ANO FABRICO:</span>
                                <span className="text-gray-800">{htmlPreviewData.relatorio.equipamento_ano_fabrico}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Equipamentos adicionais */}
                      {htmlPreviewData.equipamentos?.map((eq, idx) => (
                        <div key={idx} className="bg-gray-50 p-3 rounded">
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {eq.tipologia && (
                              <div className="flex">
                                <span className="font-semibold text-gray-600 min-w-[120px]">TIPOLOGIA:</span>
                                <span className="text-gray-800">{eq.tipologia}</span>
                              </div>
                            )}
                            {eq.numero_serie && (
                              <div className="flex">
                                <span className="font-semibold text-gray-600 min-w-[120px]">Nº SÉRIE:</span>
                                <span className="text-gray-800">{eq.numero_serie}</span>
                              </div>
                            )}
                            {eq.marca && (
                              <div className="flex">
                                <span className="font-semibold text-gray-600 min-w-[120px]">MARCA:</span>
                                <span className="text-gray-800">{eq.marca}</span>
                              </div>
                            )}
                            {eq.modelo && (
                              <div className="flex">
                                <span className="font-semibold text-gray-600 min-w-[120px]">MODELO:</span>
                                <span className="text-gray-800">{eq.modelo}</span>
                              </div>
                            )}
                            {eq.ano_fabrico && (
                              <div className="flex">
                                <span className="font-semibold text-gray-600 min-w-[120px]">ANO FABRICO:</span>
                                <span className="text-gray-800">{eq.ano_fabrico}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* BLOCOS POR DATA DE INTERVENÇÃO */}
                {datasOrdenadas.map((dataKey, blocoIdx) => {
                  const dados = intervencoesPorData[dataKey];
                  const dataFormatada = dataKey === 'sem_data' 
                    ? 'Data não especificada' 
                    : new Date(dataKey).toLocaleDateString('pt-PT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                  
                  const temConteudo = dados.intervencoes.length > 0 || 
                                      dados.registos.length > 0 || 
                                      dados.materiais.length > 0 || 
                                      dados.fotografias.length > 0 ||
                                      dados.assinaturas.length > 0;
                  
                  if (!temConteudo) return null;
                  
                  return (
                    <section key={dataKey} className="border-2 border-blue-400 rounded-lg overflow-hidden">
                      {/* Cabeçalho do Bloco de Data */}
                      <div className="bg-blue-600 text-white px-4 py-3">
                        <h2 className="text-lg font-bold flex items-center gap-2">
                          <Calendar className="w-5 h-5" />
                          {blocoIdx + 1}ª INTERVENÇÃO - {dataFormatada}
                        </h2>
                      </div>
                      
                      <div className="p-4 space-y-4 bg-blue-50/30">
                        {/* Intervenções desta data */}
                        {dados.intervencoes.length > 0 && (
                          <div className="bg-white rounded-lg p-3 border border-gray-200">
                            <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                              <FileText className="w-4 h-4 text-blue-500" />
                              Descrição da Intervenção
                            </h3>
                            {dados.intervencoes.map((int, idx) => (
                              <div key={idx} className="space-y-2">
                                {int.tecnico_nome && (
                                  <div>
                                    <span className="font-medium text-gray-600">Técnico: </span>
                                    <span className="text-gray-800">{int.tecnico_nome}</span>
                                  </div>
                                )}
                                {int.motivo_assistencia && (
                                  <div>
                                    <span className="font-medium text-gray-600">Motivo: </span>
                                    <span className="text-gray-700">{int.motivo_assistencia}</span>
                                  </div>
                                )}
                                {int.relatorio_assistencia && (
                                  <div>
                                    <span className="font-medium text-gray-600">Relatório: </span>
                                    <p className="text-gray-700 whitespace-pre-wrap mt-1">{int.relatorio_assistencia}</p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Mão de Obra / Horas desta data */}
                        {dados.registos.length > 0 && (
                          <div className="bg-white rounded-lg p-3 border border-gray-200">
                            <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                              <Clock className="w-4 h-4 text-green-500" />
                              Mão de Obra / Deslocação
                            </h3>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-100">
                                  <th className="p-2 text-left">Técnico</th>
                                  <th className="p-2 text-left">Início</th>
                                  <th className="p-2 text-left">Fim</th>
                                  <th className="p-2 text-left">Horas</th>
                                  <th className="p-2 text-left">KM</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dados.registos.map((reg, idx) => (
                                  <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50' : ''}>
                                    <td className="p-2">{reg.tecnico_nome}</td>
                                    <td className="p-2">{reg.hora_inicio_segmento ? new Date(reg.hora_inicio_segmento).toLocaleTimeString('pt-PT', {hour: '2-digit', minute: '2-digit'}) : '-'}</td>
                                    <td className="p-2">{reg.hora_fim_segmento ? new Date(reg.hora_fim_segmento).toLocaleTimeString('pt-PT', {hour: '2-digit', minute: '2-digit'}) : '-'}</td>
                                    <td className="p-2">{Math.floor((reg.minutos_trabalhados || 0) / 60)}h{String((reg.minutos_trabalhados || 0) % 60).padStart(2, '0')}</td>
                                    <td className="p-2">{reg.km || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        
                        {/* Materiais desta data */}
                        {dados.materiais.length > 0 && (
                          <div className="bg-white rounded-lg p-3 border border-gray-200">
                            <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                              <Package className="w-4 h-4 text-orange-500" />
                              Materiais Utilizados
                            </h3>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-100">
                                  <th className="p-2 text-left">Descrição</th>
                                  <th className="p-2 text-left">Quantidade</th>
                                  <th className="p-2 text-left">Fornecido por</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dados.materiais.map((mat, idx) => (
                                  <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50' : ''}>
                                    <td className="p-2">{mat.descricao}</td>
                                    <td className="p-2">{mat.quantidade}</td>
                                    <td className="p-2">{mat.fornecido_por}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        
                        {/* Fotografias desta data */}
                        {dados.fotografias.length > 0 && (
                          <div className="bg-white rounded-lg p-3 border border-gray-200">
                            <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                              <ImageIcon className="w-4 h-4 text-cyan-500" />
                              Fotografias
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                              {dados.fotografias.map((foto, idx) => (
                                <div key={idx} className="border border-gray-200 rounded overflow-hidden">
                                  <img 
                                    src={`${API}${foto.foto_url}`} 
                                    alt={foto.descricao || 'Fotografia'} 
                                    className="w-full h-32 object-cover"
                                  />
                                  {foto.descricao && (
                                    <p className="p-2 text-xs text-gray-600 bg-gray-50">{foto.descricao}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Assinaturas desta data (pela data_assinatura) - Layout melhorado */}
                        {dados.assinaturas.length > 0 && (
                          <div className="bg-white rounded-lg p-3 border border-gray-200">
                            <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                              <PenTool className="w-4 h-4 text-purple-500" />
                              Assinaturas
                            </h3>
                            <div className="space-y-4">
                              {dados.assinaturas.map((ass, idx) => (
                                <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-white text-center">
                                  {/* Imagem da assinatura - maior e centrada */}
                                  {ass.assinatura_url && (
                                    <img 
                                      src={`${API}${ass.assinatura_url}`} 
                                      alt="Assinatura" 
                                      className="max-h-24 mx-auto mb-3"
                                    />
                                  )}
                                  {/* Linha separadora */}
                                  <div className="border-t border-gray-300 w-2/3 mx-auto mb-2"></div>
                                  {/* Nome - abaixo e centrado */}
                                  <p className="text-sm font-semibold text-gray-800">
                                    {ass.assinado_por || `${ass.primeiro_nome || ''} ${ass.ultimo_nome || ''}`.trim() || 'Assinatura'}
                                  </p>
                                  {/* Data - abaixo do nome */}
                                  <p className="text-xs text-gray-500 mt-1">
                                    {ass.data_assinatura ? new Date(ass.data_assinatura).toLocaleString('pt-PT') : ''}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}

                {/* Rodapé */}
                <div className="text-center text-sm text-gray-500 pt-4 border-t border-gray-200">
                  <p>Documento gerado em {new Date().toLocaleString('pt-PT')}</p>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="sticky bottom-0 bg-gray-100 border-t border-gray-300 p-4 flex justify-end gap-3 print:hidden">
                <Button
                  variant="outline"
                  onClick={() => setShowHTMLPreviewModal(false)}
                  className="border-gray-400"
                >
                  Fechar
                </Button>
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
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Add Equipamento Modal - Componente Extraído */}
      <EquipamentoModal
        open={showAddEquipamentoModal}
        onOpenChange={setShowAddEquipamentoModal}
        isEditing={false}
        equipamentoFormData={equipamentoFormData}
        setEquipamentoFormData={setEquipamentoFormData}
        equipamentoOTSelecionado={equipamentoOTSelecionado}
        handleEquipamentoOTChange={handleEquipamentoOTChange}
        equipamentosClienteOT={equipamentosClienteOT}
        onSubmit={handleAddEquipamento}
        onCancel={() => setShowAddEquipamentoModal(false)}
      />

      {/* Edit Equipamento Modal - Componente Extraído */}
      <EquipamentoModal
        open={showEditEquipamentoModal}
        onOpenChange={setShowEditEquipamentoModal}
        isEditing={true}
        editEquipamentoFormData={editEquipamentoFormData}
        setEditEquipamentoFormData={setEditEquipamentoFormData}
        editingEquipamentoPrincipal={editingEquipamentoPrincipal}
        onSubmit={handleSaveEditEquipamento}
        onCancel={() => {
          setShowEditEquipamentoModal(false);
          setEditingEquipamento(null);
          setEditingEquipamentoPrincipal(false);
        }}
      />

      <Dialog open={showEditRelatorioModal} onOpenChange={setShowEditRelatorioModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Edit className="w-5 h-5 text-blue-400" />
              Editar Relatório #{selectedRelatorio?.numero_assistencia}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEditRelatorio} className="space-y-6 mt-4">
            {/* Cliente */}
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

            {/* Datas: Início e Até */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_data_servico" className="text-gray-300">
                  Data de Início *
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

              <div>
                <Label htmlFor="edit_data_fim" className="text-gray-300">
                  Até (Opcional)
                </Label>
                <Input
                  id="edit_data_fim"
                  type="date"
                  value={relatorioFormData.data_fim || ''}
                  onChange={(e) => setRelatorioFormData({ ...relatorioFormData, data_fim: e.target.value })}
                  className="bg-[#0f0f0f] border-gray-700 text-white"
                  min={relatorioFormData.data_servico}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Se preenchido, a OT aparece no calendário em todos os dias do intervalo
                </p>
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
                    Tipologia
                  </Label>
                  <Input
                    id="edit_equipamento_tipologia"
                    value={relatorioFormData.equipamento_tipologia}
                    onChange={(e) => setRelatorioFormData({ ...relatorioFormData, equipamento_tipologia: e.target.value })}
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                  />
                </div>

                <div>
                  <Label htmlFor="edit_equipamento_marca" className="text-gray-300">
                    Marca
                  </Label>
                  <Input
                    id="edit_equipamento_marca"
                    value={relatorioFormData.equipamento_marca}
                    onChange={(e) => setRelatorioFormData({ ...relatorioFormData, equipamento_marca: e.target.value })}
                    className="bg-[#0f0f0f] border-gray-700 text-white"
                  />
                </div>

                <div>
                  <Label htmlFor="edit_equipamento_modelo" className="text-gray-300">
                    Modelo
                  </Label>
                  <Input
                    id="edit_equipamento_modelo"
                    value={relatorioFormData.equipamento_modelo}
                    onChange={(e) => setRelatorioFormData({ ...relatorioFormData, equipamento_modelo: e.target.value })}
                    className="bg-[#0f0f0f] border-gray-700 text-white"
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

      {/* Change Tipo Modal */}
      <Dialog open={showTipoModal} onOpenChange={setShowTipoModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Tag className="w-5 h-5 text-purple-400" />
              Alterar Tipo de Registo
            </DialogTitle>
          </DialogHeader>

          {selectedTecnicoForTipo && (
            <div className="space-y-4 mt-4">
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <p className="text-white font-semibold mb-2">
                  Técnico: {selectedTecnicoForTipo.tecnico_nome}
                </p>
                <p className="text-gray-400 text-sm">
                  Data: {new Date(selectedTecnicoForTipo.data_trabalho).toLocaleDateString('pt-PT')}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-gray-500 text-xs">Tipo atual:</span>
                  <span className={`px-2 py-1 rounded text-sm ${
                    selectedTecnicoForTipo._tipo_registo === 'manual' ? 'bg-gray-600/30 text-gray-300' :
                    selectedTecnicoForTipo._tipo_registo === 'trabalho' ? 'bg-green-600/20 text-green-400' : 
                    'bg-blue-600/20 text-blue-400'
                  }`}>
                    {selectedTecnicoForTipo._tipo_registo === 'manual' ? 'Manual' : 
                     selectedTecnicoForTipo._tipo_registo === 'trabalho' ? 'Trabalho' : 'Viagem'}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-gray-300 text-sm mb-3">Selecione o novo tipo:</p>
                
                <Button
                  onClick={() => handleChangeTipo('manual')}
                  className="w-full justify-start bg-gray-500/10 hover:bg-gray-500/20 border border-gray-500/20 text-gray-300"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-10 h-10 rounded bg-gray-500 flex items-center justify-center">
                      <Edit className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left flex-1">
                      <div className="font-semibold">Manual</div>
                      <div className="text-xs text-gray-400">Registo inserido manualmente</div>
                    </div>
                  </div>
                </Button>

                <Button
                  onClick={() => handleChangeTipo('trabalho')}
                  className="w-full justify-start bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-10 h-10 rounded bg-green-500 flex items-center justify-center">
                      <Briefcase className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left flex-1">
                      <div className="font-semibold">Trabalho</div>
                      <div className="text-xs text-gray-400">Tempo de trabalho no cliente</div>
                    </div>
                  </div>
                </Button>

                <Button
                  onClick={() => handleChangeTipo('viagem')}
                  className="w-full justify-start bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-10 h-10 rounded bg-blue-500 flex items-center justify-center">
                      <Car className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left flex-1">
                      <div className="font-semibold">Viagem</div>
                      <div className="text-xs text-gray-400">Tempo de deslocação</div>
                    </div>
                  </div>
                </Button>
              </div>

              <Button
                type="button"
                onClick={() => {
                  setShowTipoModal(false);
                  setSelectedTecnicoForTipo(null);
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
              <div className="flex items-center justify-between mb-2">
                <Label className="text-gray-300">
                  Emails Adicionais
                </Label>
                <Button
                  type="button"
                  onClick={addEmailField}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar Email
                </Button>
              </div>
              {formData.emails_adicionais.length === 0 ? (
                <p className="text-xs text-gray-500">Nenhum email adicional. Clique em "Adicionar Email" para incluir.</p>
              ) : (
                <div className="space-y-2">
                  {formData.emails_adicionais.map((email, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => updateEmailField(index, e.target.value)}
                        placeholder={`Email ${index + 1}`}
                        className="bg-[#0f0f0f] border-gray-700 text-white flex-1"
                      />
                      <Button
                        type="button"
                        onClick={() => removeEmailField(index)}
                        size="sm"
                        variant="outline"
                        className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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
              <div className="flex items-center justify-between mb-2">
                <Label className="text-gray-300">
                  Emails Adicionais
                </Label>
                <Button
                  type="button"
                  onClick={addEmailField}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar Email
                </Button>
              </div>
              {formData.emails_adicionais.length === 0 ? (
                <p className="text-xs text-gray-500">Nenhum email adicional. Clique em "Adicionar Email" para incluir.</p>
              ) : (
                <div className="space-y-2">
                  {formData.emails_adicionais.map((email, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => updateEmailField(index, e.target.value)}
                        placeholder={`Email ${index + 1}`}
                        className="bg-[#0f0f0f] border-gray-700 text-white flex-1"
                      />
                      <Button
                        type="button"
                        onClick={() => removeEmailField(index)}
                        size="sm"
                        variant="outline"
                        className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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
                  <div className="space-y-2">
                    {selectedCliente.emails_adicionais.split(/[;,]/).map((email, index) => {
                      const trimmedEmail = email.trim();
                      if (!trimmedEmail) return null;
                      return (
                        <div 
                          key={index} 
                          className="flex items-center gap-2 bg-[#1a1a1a] px-3 py-2 rounded-lg"
                        >
                          <Mail className="w-3.5 h-3.5 text-gray-500" />
                          <a 
                            href={`mailto:${trimmedEmail}`}
                            className="text-white hover:text-blue-400 transition break-all"
                          >
                            {trimmedEmail}
                          </a>
                        </div>
                      );
                    })}
                  </div>
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
            <div className="flex items-center justify-between w-full pr-8">
              <DialogTitle className="flex items-center gap-2 text-white">
                <FileText className="w-5 h-5 text-purple-400" />
                Relatórios do Cliente
              </DialogTitle>
              {clienteRelatorios.length > 0 && (
                <Button
                  onClick={handleDownloadAllClienteRelatorios}
                  disabled={downloadingAllPDFs}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {downloadingAllPDFs ? (
                    <>
                      <span className="animate-spin mr-2">⏳</span>
                      A descarregar...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Download Todos ({clienteRelatorios.length})
                    </>
                  )}
                </Button>
              )}
            </div>
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
                          {relatorio.equipamento_display ? (
                            relatorio.equipamento_display === 'Não especificado' ? (
                              <span className="text-gray-500 italic">{relatorio.equipamento_display}</span>
                            ) : relatorio.equipamento_display === 'Vários' ? (
                              <span className="text-blue-400">{relatorio.equipamento_display} ({relatorio.equipamentos_count})</span>
                            ) : (
                              <span>{relatorio.equipamento_display}</span>
                            )
                          ) : relatorio.equipamento_tipologia || relatorio.equipamento_marca || relatorio.equipamento_modelo ? (
                            <>
                              {relatorio.equipamento_tipologia && <span>{relatorio.equipamento_tipologia}</span>}
                              {relatorio.equipamento_tipologia && relatorio.equipamento_marca && <span className="text-gray-500"> • </span>}
                              {relatorio.equipamento_marca && <span>{relatorio.equipamento_marca}</span>}
                              {(relatorio.equipamento_tipologia || relatorio.equipamento_marca) && relatorio.equipamento_modelo && <span className="text-gray-500"> • </span>}
                              {relatorio.equipamento_modelo && <span className="text-gray-400">{relatorio.equipamento_modelo}</span>}
                            </>
                          ) : (
                            <span className="text-gray-500 italic">Não especificado</span>
                          )}
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

      {/* Modal Adicionar Registo Manual */}
      <Dialog open={showAddRegistoManualModal} onOpenChange={setShowAddRegistoManualModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Plus className="w-5 h-5 text-blue-400" />
              Novo Registo de Mão de Obra
            </DialogTitle>
            <p className="text-gray-400 text-sm">
              Se o período atravessar diferentes códigos horários (07:00/19:00), será automaticamente dividido em múltiplos registos.
            </p>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Técnico */}
            <div>
              <Label className="text-gray-300">Técnico *</Label>
              <Select
                value={addRegistoManualForm.tecnico_id}
                onValueChange={(val) => {
                  const user = allSystemUsers.find(u => u.id === val);
                  setAddRegistoManualForm(prev => ({
                    ...prev,
                    tecnico_id: val,
                    tecnico_nome: user?.full_name || user?.username || ''
                  }));
                }}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Selecionar técnico" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {allSystemUsers.map(user => (
                    <SelectItem key={user.id} value={user.id} className="text-white">
                      {user.full_name || user.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo */}
            <div>
              <Label className="text-gray-300">Tipo *</Label>
              <Select
                value={addRegistoManualForm.tipo}
                onValueChange={(val) => setAddRegistoManualForm(prev => ({ ...prev, tipo: val }))}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="trabalho" className="text-white">Trabalho</SelectItem>
                  <SelectItem value="viagem" className="text-white">Viagem</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Data */}
            <div>
              <Label className="text-gray-300">Data *</Label>
              <Input
                type="date"
                value={addRegistoManualForm.data}
                onChange={(e) => setAddRegistoManualForm(prev => ({ ...prev, data: e.target.value }))}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>

            {/* Horas */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300">Hora Início *</Label>
                <Input
                  type="time"
                  value={addRegistoManualForm.hora_inicio}
                  onChange={(e) => setAddRegistoManualForm(prev => ({ ...prev, hora_inicio: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-300">Hora Fim *</Label>
                <Input
                  type="time"
                  value={addRegistoManualForm.hora_fim}
                  onChange={(e) => setAddRegistoManualForm(prev => ({ ...prev, hora_fim: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
            </div>

            {/* KMs Ida e Volta - sempre visíveis */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-300 flex items-center gap-2">
                  <Car className="w-4 h-4 text-blue-400" />
                  Km's Ida
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-gray-500">Início</Label>
                    <Input
                      type="number"
                      value={addRegistoManualForm.kms_inicial}
                      onChange={(e) => setAddRegistoManualForm(prev => ({ ...prev, kms_inicial: parseFloat(e.target.value) || 0 }))}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Fim</Label>
                    <Input
                      type="number"
                      value={addRegistoManualForm.kms_final}
                      onChange={(e) => setAddRegistoManualForm(prev => ({ ...prev, kms_final: parseFloat(e.target.value) || 0 }))}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="0"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Total Ida: {Math.max(0, (addRegistoManualForm.kms_final || 0) - (addRegistoManualForm.kms_inicial || 0)).toFixed(1)} km
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300 flex items-center gap-2">
                  <Car className="w-4 h-4 text-orange-400" />
                  Km's Volta
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-gray-500">Início</Label>
                    <Input
                      type="number"
                      value={addRegistoManualForm.kms_inicial_volta}
                      onChange={(e) => setAddRegistoManualForm(prev => ({ ...prev, kms_inicial_volta: parseFloat(e.target.value) || 0 }))}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Fim</Label>
                    <Input
                      type="number"
                      value={addRegistoManualForm.kms_final_volta}
                      onChange={(e) => setAddRegistoManualForm(prev => ({ ...prev, kms_final_volta: parseFloat(e.target.value) || 0 }))}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="0"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Total Volta: {Math.max(0, (addRegistoManualForm.kms_final_volta || 0) - (addRegistoManualForm.kms_inicial_volta || 0)).toFixed(1)} km
                </p>
              </div>
            </div>

            {/* Checkbox de Pausa e Total de Horas */}
            <div className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="checkbox"
                  id="incluir_pausa_modal"
                  checked={addRegistoManualForm.incluir_pausa}
                  onChange={(e) => setAddRegistoManualForm(prev => ({ ...prev, incluir_pausa: e.target.checked }))}
                  className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-amber-500"
                />
                <label htmlFor="incluir_pausa_modal" className="text-gray-300 cursor-pointer">
                  <span className="font-medium">1h de Pausa</span>
                </label>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Total de Horas</p>
                <p className="text-xl font-bold text-green-400">
                  {(() => {
                    if (!addRegistoManualForm.hora_inicio || !addRegistoManualForm.hora_fim) return '0h 0min';
                    const [hi, mi] = addRegistoManualForm.hora_inicio.split(':').map(Number);
                    const [hf, mf] = addRegistoManualForm.hora_fim.split(':').map(Number);
                    let totalMins = (hf * 60 + mf) - (hi * 60 + mi);
                    if (totalMins < 0) totalMins += 24 * 60;
                    if (addRegistoManualForm.incluir_pausa) totalMins -= 60;
                    if (totalMins < 0) totalMins = 0;
                    return `${Math.floor(totalMins / 60)}h ${totalMins % 60}min`;
                  })()}
                </p>
              </div>
            </div>

            {/* Total KMs */}
            <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-green-400 font-medium flex items-center gap-2">
                  <Car className="w-4 h-4" />
                  Total KM (Ida + Volta)
                </span>
                <span className="text-xl font-bold text-green-400">
                  {(Math.max(0, (addRegistoManualForm.kms_final || 0) - (addRegistoManualForm.kms_inicial || 0)) + 
                    Math.max(0, (addRegistoManualForm.kms_final_volta || 0) - (addRegistoManualForm.kms_inicial_volta || 0))).toFixed(1)} km
                </span>
              </div>
            </div>

            {/* Botões */}
            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowAddRegistoManualModal(false)}
                className="border-gray-600 text-gray-300"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAddRegistoManual}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Criar Registo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Registo Cronómetro */}
      <Dialog open={showEditRegistoModal} onOpenChange={(open) => {
        setShowEditRegistoModal(open);
        if (!open) setEditingRegisto(null);
      }}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
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

              {/* Campos de Hora Início e Fim */}
              <div className="bg-gradient-to-r from-blue-900/20 to-cyan-900/20 border border-blue-500/30 rounded-lg p-4">
                <Label className="text-blue-400 font-semibold flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4" />
                  Horário do Registo
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-400 text-sm">Hora Início</Label>
                    <Input
                      type="time"
                      value={editRegistoForm.hora_inicio || ''}
                      onChange={(e) => {
                        const newHoraInicio = e.target.value;
                        setEditRegistoForm(prev => {
                          const updated = { ...prev, hora_inicio: newHoraInicio };
                          // Recalcular minutos se ambas horas estiverem definidas
                          if (newHoraInicio && prev.hora_fim) {
                            const [h1, m1] = newHoraInicio.split(':').map(Number);
                            const [h2, m2] = prev.hora_fim.split(':').map(Number);
                            let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
                            if (mins < 0) mins += 24 * 60; // passar para dia seguinte
                            updated.minutos_trabalhados = mins;
                          }
                          return updated;
                        });
                      }}
                      className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                      data-testid="edit-registo-hora-inicio"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-sm">Hora Fim</Label>
                    <Input
                      type="time"
                      value={editRegistoForm.hora_fim || ''}
                      onChange={(e) => {
                        const newHoraFim = e.target.value;
                        setEditRegistoForm(prev => {
                          const updated = { ...prev, hora_fim: newHoraFim };
                          // Recalcular minutos se ambas horas estiverem definidas
                          if (prev.hora_inicio && newHoraFim) {
                            const [h1, m1] = prev.hora_inicio.split(':').map(Number);
                            const [h2, m2] = newHoraFim.split(':').map(Number);
                            let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
                            if (mins < 0) mins += 24 * 60; // passar para dia seguinte
                            updated.minutos_trabalhados = mins;
                          }
                          return updated;
                        });
                      }}
                      className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                      data-testid="edit-registo-hora-fim"
                    />
                  </div>
                </div>
                {editRegistoForm.hora_inicio && editRegistoForm.hora_fim && (
                  <p className="text-xs text-blue-400 mt-2">
                    Duração calculada: {Math.floor(editRegistoForm.minutos_trabalhados / 60)}h {editRegistoForm.minutos_trabalhados % 60}min
                  </p>
                )}
              </div>

              {/* Campos de Tempo (desabilitado se horas definidas) */}
              <div>
                <Label className="text-gray-300">Tempo Trabalhado {editRegistoForm.hora_inicio && editRegistoForm.hora_fim && <span className="text-xs text-gray-500 ml-2">(calculado automaticamente)</span>}</Label>
                <div className="flex gap-2 items-center mt-1">
                  <Input
                    type="number"
                    min="0"
                    max="24"
                    value={Math.floor(editRegistoForm.minutos_trabalhados / 60) || ''}
                    onChange={(e) => {
                      const horas = parseInt(e.target.value) || 0;
                      const minutos = editRegistoForm.minutos_trabalhados % 60;
                      setEditRegistoForm({
                        ...editRegistoForm,
                        minutos_trabalhados: (horas * 60) + minutos
                      });
                    }}
                    className="bg-[#0f0f0f] border-gray-700 text-white w-20"
                    placeholder="0"
                    disabled={!!(editRegistoForm.hora_inicio && editRegistoForm.hora_fim)}
                  />
                  <span className="text-gray-400">h</span>
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={editRegistoForm.minutos_trabalhados % 60 || ''}
                    onChange={(e) => {
                      const horas = Math.floor(editRegistoForm.minutos_trabalhados / 60);
                      const minutos = parseInt(e.target.value) || 0;
                      setEditRegistoForm({
                        ...editRegistoForm,
                        minutos_trabalhados: (horas * 60) + minutos
                      });
                    }}
                    className="bg-[#0f0f0f] border-gray-700 text-white w-20"
                    placeholder="0"
                    disabled={!!(editRegistoForm.hora_inicio && editRegistoForm.hora_fim)}
                  />
                  <span className="text-gray-400">min</span>
                </div>
                {editRegistoForm.minutos_trabalhados > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Total: {editRegistoForm.minutos_trabalhados} minutos
                  </p>
                )}
              </div>

              {/* Km's Ida */}
              <div className="space-y-3">
                <Label className="text-gray-300 flex items-center gap-2">
                  <Car className="w-4 h-4" />
                  Quilómetros - Ida
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-gray-400 text-sm">Km's Iniciais</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={editRegistoForm.kms_inicial || ''}
                      onChange={(e) => setEditRegistoForm({
                        ...editRegistoForm,
                        kms_inicial: parseFloat(e.target.value) || 0
                      })}
                      className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-sm">Km's Finais</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={editRegistoForm.kms_final || ''}
                      onChange={(e) => setEditRegistoForm({
                        ...editRegistoForm,
                        kms_final: parseFloat(e.target.value) || 0
                      })}
                      className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-sm">Total Ida</Label>
                    <div className="bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 mt-1 font-semibold text-blue-400">
                      {Math.max(0, (parseFloat(editRegistoForm.kms_final) || 0) - (parseFloat(editRegistoForm.kms_inicial) || 0)).toFixed(1)} km
                    </div>
                  </div>
                </div>
              </div>

              {/* Km's Volta */}
              <div className="space-y-3">
                <Label className="text-gray-300 flex items-center gap-2">
                  <Car className="w-4 h-4" />
                  Quilómetros - Volta
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-gray-400 text-sm">Km's Iniciais</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={editRegistoForm.kms_inicial_volta || ''}
                      onChange={(e) => setEditRegistoForm({
                        ...editRegistoForm,
                        kms_inicial_volta: parseFloat(e.target.value) || 0
                      })}
                      className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-sm">Km's Finais</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={editRegistoForm.kms_final_volta || ''}
                      onChange={(e) => setEditRegistoForm({
                        ...editRegistoForm,
                        kms_final_volta: parseFloat(e.target.value) || 0
                      })}
                      className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-sm">Total Volta</Label>
                    <div className="bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 mt-1 font-semibold text-orange-400">
                      {Math.max(0, (parseFloat(editRegistoForm.kms_final_volta) || 0) - (parseFloat(editRegistoForm.kms_inicial_volta) || 0)).toFixed(1)} km
                    </div>
                  </div>
                </div>
              </div>

              {/* Total Final de Kms */}
              <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-green-400 font-semibold flex items-center gap-2">
                    <Car className="w-4 h-4" />
                    Total KM (Ida + Volta)
                  </Label>
                  <div className="text-xl font-bold text-green-400">
                    {(Math.max(0, (parseFloat(editRegistoForm.kms_final) || 0) - (parseFloat(editRegistoForm.kms_inicial) || 0)) + 
                      Math.max(0, (parseFloat(editRegistoForm.kms_final_volta) || 0) - (parseFloat(editRegistoForm.kms_inicial_volta) || 0))).toFixed(1)} km
                  </div>
                </div>
              </div>

              {/* Código - Apenas exibição (calculado automaticamente) */}
              <div>
                <Label className="text-gray-300">Código Horário</Label>
                <div className="w-full bg-[#0f0f0f] border border-gray-700 text-purple-400 rounded-md p-2 font-mono cursor-not-allowed">
                  {editRegistoForm.codigo || '-'} 
                  <span className="text-gray-500 text-xs ml-2">
                    ({editRegistoForm.codigo === '1' ? 'Dias úteis 07h-19h' :
                      editRegistoForm.codigo === '2' ? 'Dias úteis noturno' :
                      editRegistoForm.codigo === 'S' ? 'Sábado' :
                      editRegistoForm.codigo === 'D' ? 'Domingo/Feriado' : 'N/A'})
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">O código é calculado automaticamente e não pode ser alterado</p>
              </div>

              {/* Pausa de 1 hora */}
              <div className="bg-gradient-to-r from-orange-900/20 to-amber-900/20 border border-orange-500/30 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="edit_incluir_pausa"
                    checked={editRegistoForm.incluir_pausa}
                    onChange={(e) => {
                      const novaPausa = e.target.checked;
                      setEditRegistoForm(prev => {
                        const updated = { ...prev, incluir_pausa: novaPausa };
                        // Se temos horas definidas, recalcular minutos
                        if (prev.hora_inicio && prev.hora_fim) {
                          const [h1, m1] = prev.hora_inicio.split(':').map(Number);
                          const [h2, m2] = prev.hora_fim.split(':').map(Number);
                          let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
                          if (mins < 0) mins += 24 * 60;
                          if (novaPausa) mins -= 60;
                          updated.minutos_trabalhados = Math.max(0, mins);
                        } else {
                          // Ajustar minutos diretamente
                          if (novaPausa && !prev.incluir_pausa) {
                            updated.minutos_trabalhados = Math.max(0, prev.minutos_trabalhados - 60);
                          } else if (!novaPausa && prev.incluir_pausa) {
                            updated.minutos_trabalhados = prev.minutos_trabalhados + 60;
                          }
                        }
                        return updated;
                      });
                    }}
                    className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-orange-500"
                    data-testid="edit-registo-incluir-pausa"
                  />
                  <label htmlFor="edit_incluir_pausa" className="text-gray-300 cursor-pointer flex items-center gap-2">
                    <Coffee className="w-4 h-4 text-orange-400" />
                    <span>Descontar 1 hora de pausa</span>
                  </label>
                </div>
                {editRegistoForm.incluir_pausa && (
                  <p className="text-xs text-orange-400 mt-2 ml-8">
                    1 hora será descontada do tempo total
                  </p>
                )}
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

      {/* Modal Iniciar Cronómetro após criar OT */}
      <Dialog open={showIniciarCronoModal} onOpenChange={(open) => {
        if (!open) {
          setShowIniciarCronoModal(false);
          setNovaOTParaCrono(null);
          setCronoTecnicosSelecionados([]);
        }
      }}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <PlayCircle className="w-5 h-5 text-green-400" />
              Iniciar Cronómetro - OT #{novaOTParaCrono?.numero}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <p className="text-gray-400 text-sm">
              OT criada com sucesso! Deseja iniciar um cronómetro?
            </p>

            {/* Tipo de Cronómetro */}
            <div>
              <Label className="text-gray-300 mb-2 block">Tipo de Cronómetro</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => setCronoTipo('trabalho')}
                  className={`flex-1 ${cronoTipo === 'trabalho' 
                    ? 'bg-blue-600 hover:bg-blue-700' 
                    : 'bg-gray-700 hover:bg-gray-600'}`}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Trabalho
                </Button>
                <Button
                  type="button"
                  onClick={() => setCronoTipo('viagem')}
                  className={`flex-1 ${cronoTipo === 'viagem' 
                    ? 'bg-orange-600 hover:bg-orange-700' 
                    : 'bg-gray-700 hover:bg-gray-600'}`}
                >
                  <Car className="w-4 h-4 mr-2" />
                  Viagem
                </Button>
              </div>
            </div>

            {/* Seleção de Técnicos */}
            <div>
              <Label className="text-gray-300 mb-2 block">Selecionar Técnico(s)</Label>
              <div className="bg-[#0f0f0f] border border-gray-700 rounded-md max-h-48 overflow-y-auto">
                {allSystemUsers.length > 0 ? (
                  allSystemUsers.map((userItem) => {
                    const isSelected = cronoTecnicosSelecionados.some(t => t.id === userItem.id);
                    return (
                      <div
                        key={userItem.id}
                        onClick={() => {
                          if (isSelected) {
                            setCronoTecnicosSelecionados(
                              cronoTecnicosSelecionados.filter(t => t.id !== userItem.id)
                            );
                          } else {
                            setCronoTecnicosSelecionados([
                              ...cronoTecnicosSelecionados,
                              { id: userItem.id, nome: userItem.full_name || userItem.username }
                            ]);
                          }
                        }}
                        className={`flex items-center gap-3 p-3 cursor-pointer border-b border-gray-700 last:border-b-0 hover:bg-gray-800 ${
                          isSelected ? 'bg-blue-900/30' : ''
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                          isSelected 
                            ? 'bg-blue-600 border-blue-600' 
                            : 'border-gray-600'
                        }`}>
                          {isSelected && <span className="text-white text-xs">✓</span>}
                        </div>
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-white">{userItem.full_name || userItem.username}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-gray-500 text-center">
                    Nenhum utilizador encontrado
                  </div>
                )}
              </div>
              {cronoTecnicosSelecionados.length > 0 && (
                <p className="text-sm text-gray-400 mt-2">
                  {cronoTecnicosSelecionados.length} técnico(s) selecionado(s)
                </p>
              )}
            </div>

            {/* Botões */}
            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => {
                  setShowIniciarCronoModal(false);
                  setNovaOTParaCrono(null);
                  setCronoTecnicosSelecionados([]);
                }}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                Ignorar
              </Button>
              <Button
                onClick={handleIniciarCronoNovaOT}
                disabled={cronoTecnicosSelecionados.length === 0}
                className={`flex-1 ${cronoTipo === 'trabalho' 
                  ? 'bg-blue-600 hover:bg-blue-700' 
                  : 'bg-orange-600 hover:bg-orange-700'} disabled:opacity-50`}
              >
                <PlayCircle className="w-4 h-4 mr-2" />
                Iniciar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Folha de Horas - Componente Extraído */}
      <FolhaHorasModal
        open={showFolhaHorasModal}
        onOpenChange={setShowFolhaHorasModal}
        selectedRelatorio={selectedRelatorio}
        folhaHorasData={folhaHorasData}
        folhaHorasTarifas={folhaHorasTarifas}
        folhaHorasExtras={folhaHorasExtras}
        updateFolhaHorasTarifa={updateFolhaHorasTarifa}
        updateFolhaHorasExtra={updateFolhaHorasExtra}
        onGeneratePDF={handleGenerateFolhaHoras}
        generatingFolhaHoras={generatingFolhaHoras}
      />
    </div>
  );
};

export default TechnicalReports;
