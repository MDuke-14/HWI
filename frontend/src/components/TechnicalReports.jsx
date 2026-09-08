import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import Navigation from './Navigation';
import { toast } from 'sonner';
import OfflineStatusBar from './OfflineStatusBar';
import { useOfflineData } from '@/hooks/useOfflineData';
import HelpTooltip from './HelpTooltip';
import FSAIReviewModal from '@/components/FSAIReviewModal';
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
  Check,
  Wrench,
  UserCheck,
  Camera,
  ScanLine,
  Pencil,
  Link2,
  ArrowRightCircle,
  ArrowUpDown,
  Sparkles,
  MoreVertical,
  ChevronDown,
  Copy as CopyIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
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
  CopySignatureModal,
  TecnicoModal,
  EquipamentoModal,
  MaterialModal,
  CronometroStartModal,
  EmailModal,
  StatusChangeModal,
  DeleteRelatorioModal,
  AddFotoPCModal,
  EmailPCModal,
  HideClientPopup,
  EditMaterialPCModal,
  EnviarPedidoCotacaoModal,
  CancelarPCModal,
  AddMaterialToPCModal,
  ChangeTipoModal,
  DeleteClienteModal,
  ReferenciaInternaModal,
  IniciarCronoModal,
  RelatorioSimplesModal,
  CronometroFuncaoPopup,
  StopCronometroPopup,
  WorkKmPopup,
  TechnicalReportsTabs,
  ReportsSection,
  FacturadosSection,
} from './technical-reports';
import CriarContinuidadeModal from './technical-reports/CriarContinuidadeModal';
import FSChainBreadcrumb from './technical-reports/FSChainBreadcrumb';
import FaturaScanner from './technical-reports/FaturaScanner';
import IntervencaoModal from './technical-reports/IntervencaoModal';
import { FotoUploadModal, FotoEditModal, FotoPreviewModal, FotoBulkEditModal } from './technical-reports/FotoModals';
import RelAssistModal from './technical-reports/RelAssistModal';
import OneDrivePickerModal from './onedrive/OneDrivePickerModal';
import CameraCaptureModal from './onedrive/CameraCaptureModal';
import FornecedoresPage from './technical-reports/FornecedoresPage';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from './ui/dropdown-menu';
import { FolderOpen, Cloud as CloudIcon } from 'lucide-react';
import { AddDespesaModal, EditDespesaModal } from './technical-reports/DespesaModals';
import { downloadFSPdfAsync, downloadFSPdfToFile } from './technical-reports/utils/pdfJobs';
import PdfCanvasViewer from './technical-reports/PdfCanvasViewer';

// Timeout para download/geração de PDFs no cliente.
// PDFs de FS com muitas fotos podem demorar bastante a gerar no servidor.
// Definido a 5 minutos para evitar AbortError em geração lenta.
const PDF_DOWNLOAD_TIMEOUT = 300000; // 5 min

// Helper function to format error messages from FastAPI validation errors
const formatErrorMessage = (error) => {
  // Network/conexão sem response
  if (!error?.response) {
    return error?.message?.includes('Network') 
      ? 'Erro de conexão. Verifica a tua internet e tenta novamente.'
      : (error?.message || 'Erro de conexão');
  }
  
  const status = error.response.status;
  const data = error.response.data;
  
  // 5xx/520/timeout — backend caiu ou demorou demais
  if (status >= 500) {
    if (status === 520 || status === 521 || status === 522 || status === 524) {
      return 'Servidor temporariamente indisponível (timeout). Aguarda 10 segundos e tenta novamente.';
    }
    return `Erro do servidor (${status}). Aguarda e tenta novamente. Se persistir, contacta o administrador.`;
  }
  
  // Se body é vazio/null/undefined ou string, devolve mensagem segura
  if (!data || typeof data === 'string') {
    return typeof data === 'string' && data.length < 200 ? data : `Erro ${status}`;
  }
  
  // Se detail é uma string, retorne-a diretamente
  if (typeof data.detail === 'string') {
    return data.detail;
  }
  
  // Se detail é um array (erros de validação do Pydantic)
  if (Array.isArray(data.detail)) {
    try {
      return data.detail.map(err => {
        const field = err?.loc ? err.loc[err.loc.length - 1] : 'campo';
        return `${field}: ${err?.msg || 'inválido'}`;
      }).join(', ');
    } catch {
      return `Erro de validação (${status})`;
    }
  }
  
  // Fallback
  return data?.message || `Erro ao processar solicitação (${status})`;
};

// Extrair mensagem de erro de respostas blob (usado em endpoints PDF)
const extractBlobError = async (error) => {
  if (!error.response) return 'Erro de conexão com o servidor. Verifica a tua internet e tenta novamente.';
  
  const status = error.response.status;
  const data = error.response.data;
  
  // Códigos transitórios típicos de Cloudflare/proxy quando o backend está sobrecarregado ou a reiniciar
  if (status === 520 || status === 521 || status === 522 || status === 523 || status === 524) {
    return 'O servidor está temporariamente indisponível ou demasiado ocupado a gerar o PDF. Aguarda um momento e tenta novamente. Se persistir, contacta o administrador.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'Servidor temporariamente indisponível. Tenta novamente em alguns segundos.';
  }
  
  // Se a resposta é um Blob, converter para texto/JSON
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      // HTML do Cloudflare/proxy — não mostrar conteúdo técnico
      if (text.trim().startsWith('<!DOCTYPE') || text.includes('cf-error') || text.includes('Cloudflare')) {
        return `Erro ${status}: O servidor não respondeu correctamente ao gerar o PDF. Tenta novamente em alguns segundos.`;
      }
      try {
        const json = JSON.parse(text);
        const detail = json.detail || json.message || json.error || '';
        return (typeof detail === 'string' ? detail : JSON.stringify(detail)).substring(0, 300);
      } catch {
        return (text || `Erro ${status} ao gerar PDF`).substring(0, 300);
      }
    } catch {
      return `Erro ${status} ao gerar PDF`;
    }
  }
  
  // Resposta normal (não-blob)
  if (typeof data?.detail === 'string') return data.detail.substring(0, 300);
  if (typeof data?.message === 'string') return data.message.substring(0, 300);
  
  return `Erro ${status} ao gerar PDF`;
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
  const [equipamentoIntervencoes, setEquipamentoIntervencoes] = useState([]);
  const [selectedEquipamento, setSelectedEquipamento] = useState(null);
  const [expandedIntervencao, setExpandedIntervencao] = useState(null);
  const [showAddClienteEquipModal, setShowAddClienteEquipModal] = useState(false);
  const [showEditClienteEquipModal, setShowEditClienteEquipModal] = useState(false);
  const [clienteEquipForm, setClienteEquipForm] = useState({
    tipologia: '', marca: '', modelo: '', numero_serie: '', ano_fabrico: '', horas_funcionamento: ''
  });
  
  // Modal iniciar cronómetro após criar OT
  const [showIniciarCronoModal, setShowIniciarCronoModal] = useState(false);
  const [novaOTParaCrono, setNovaOTParaCrono] = useState(null);
  const [cronoTecnicosSelecionados, setCronoTecnicosSelecionados] = useState([]);
  const [cronoTipo, setCronoTipo] = useState('trabalho');
  
  // Modal referência interna do cliente
  const [showReferenciaInternaModal, setShowReferenciaInternaModal] = useState(false);
  const [referenciaInternaValue, setReferenciaInternaValue] = useState('');
  const [referenciaInternaFSId, setReferenciaInternaFSId] = useState(null);
  const [referenciaInternaPendingCrono, setReferenciaInternaPendingCrono] = useState(null);
  
  // Relatórios modals
  const [showAddRelatorioModal, setShowAddRelatorioModal] = useState(false);
  const [showViewRelatorioModal, setShowViewRelatorioModal] = useState(false);
  const [showEditRelatorioModal, setShowEditRelatorioModal] = useState(false);
  const [showDeleteRelatorioModal, setShowDeleteRelatorioModal] = useState(false);
  const [selectedRelatorio, setSelectedRelatorio] = useState(null);
  const [showAIReview, setShowAIReview] = useState(false);
  const [relatorioToDelete, setRelatorioToDelete] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedStatusRelatorio, setSelectedStatusRelatorio] = useState(null);

  // Relatório Simples (estilo Word, sem fotos)
  const [showRelatorioSimplesModal, setShowRelatorioSimplesModal] = useState(false);
  const [relatorioSimplesTarget, setRelatorioSimplesTarget] = useState(null);
  const openRelatorioSimples = (relatorio) => {
    setRelatorioSimplesTarget(relatorio);
    setShowRelatorioSimplesModal(true);
  };
  const [tecnicos, setTecnicos] = useState([]);
  const [showAddTecnicoModal, setShowAddTecnicoModal] = useState(false);
  const [showEditTecnicoModal, setShowEditTecnicoModal] = useState(false);
  const [selectedTecnico, setSelectedTecnico] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  
  // Intervenções
  const [intervencoes, setIntervencoes] = useState([]);
  const [dragIntervIdx, setDragIntervIdx] = useState(null);
  const [dragOverIntervIdx, setDragOverIntervIdx] = useState(null);
  const [reorderingIntervs, setReorderingIntervs] = useState(false);
  const [activeIntervencaoId, setActiveIntervencaoId] = useState(null);
  const [uploadIntervencaoId, setUploadIntervencaoId] = useState(null);
  const [addMaterialIntervencaoId, setAddMaterialIntervencaoId] = useState(null);
  const [showAddIntervencaoModal, setShowAddIntervencaoModal] = useState(false);
  const [showEditIntervencaoModal, setShowEditIntervencaoModal] = useState(false);
  const [selectedIntervencao, setSelectedIntervencao] = useState(null);
  const [intervencaoFormData, setIntervencaoFormData] = useState({
    data_intervencao: new Date().toISOString().split('T')[0],
    motivo_assistencia: '',
    equipamento_id: ''
  });
  
  // Fotografias
  const [fotografias, setFotografias] = useState([]);
  const [showAddFotoModal, setShowAddFotoModal] = useState(false);
  const [selectedFoto, setSelectedFoto] = useState(null);
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoFiles, setFotoFiles] = useState([]);  // Multi-upload: lista de ficheiros (comprimidos)
  const [fotoDescricao, setFotoDescricao] = useState('');
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [showEditFotoModal, setShowEditFotoModal] = useState(false);
  const [editFotoDescricao, setEditFotoDescricao] = useState('');
  const [editFotoData, setEditFotoData] = useState('');
  const [selectedFotoUrl, setSelectedFotoUrl] = useState(null);
  const [showFotoPreviewModal, setShowFotoPreviewModal] = useState(false);
  // Modal bulk-edit após multi-upload: [{ id, foto_url, descricao }, ...]
  const [showBulkEditFotoModal, setShowBulkEditFotoModal] = useState(false);
  const [bulkFotosToEdit, setBulkFotosToEdit] = useState([]);

  // Email OT
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showFolhaHorasConfirm, setShowFolhaHorasConfirm] = useState(false);
  const [emailsPendentes, setEmailsPendentes] = useState([]);
  const [docsSelecionados, setDocsSelecionados] = useState({});
  const [idiomaEmail, setIdiomaEmail] = useState('pt');
  const [emailsCliente, setEmailsCliente] = useState([]);
  const [emailsAdicionais, setEmailsAdicionais] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailDestinatario, setEmailDestinatario] = useState('');
  const [emailCC, setEmailCC] = useState('');

  // Assinaturas (múltiplas)
  const [assinaturas, setAssinaturas] = useState([]);
  const [copySignatureModalOpen, setCopySignatureModalOpen] = useState(false);
  const [signatureToCopy, setSignatureToCopy] = useState(null);
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

  // Continuidade (FS herdada)
  const [showContinuidadeModal, setShowContinuidadeModal] = useState(false);
  const [continuidadeIds, setContinuidadeIds] = useState([]);
  const [savingContinuidade, setSavingContinuidade] = useState(false);

  // Material OT
  const [materiais, setMateriais] = useState([]);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [showEditMaterialModal, setShowEditMaterialModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [materialFormData, setMaterialFormData] = useState({
    descricao: '',
    quantidade: '',
    unidade: 'Un',
    fornecido_por: 'Cliente',
    data_utilizacao: '',
    posicao: '',
    codigo: ''
  });
  const [selectedPCIdForMaterial, setSelectedPCIdForMaterial] = useState(null);
  const [selectedEquipOTIdsForPC, setSelectedEquipOTIdsForPC] = useState([]);

  // Despesas OT
  const [despesas, setDespesas] = useState([]);
  const [despesaToDelete, setDespesaToDelete] = useState(null);
  const [intervencaoToDelete, setIntervencaoToDelete] = useState(null);
  // Relatórios de Assistência
  const [relatoriosAssistencia, setRelatoriosAssistencia] = useState([]);
  const [showAddRelAssistModal, setShowAddRelAssistModal] = useState(false);
  const [showEditRelAssistModal, setShowEditRelAssistModal] = useState(false);
  const [selectedRelAssist, setSelectedRelAssist] = useState(null);
  const [relAssistFormData, setRelAssistFormData] = useState({ texto: '', equipamento_ids: [], data_intervencao: '' });
  const [showAddDespesaModal, setShowAddDespesaModal] = useState(false);
  const [showEditDespesaModal, setShowEditDespesaModal] = useState(false);
  const [selectedDespesa, setSelectedDespesa] = useState(null);
  const [despesaFormData, setDespesaFormData] = useState({
    tipo: 'outras',
    descricao: '',
    quantidade: '',
    unidade: 'Un',
    valor: '',
    percentagem: '',
    valor_final: '',
    tecnico_id: '',
    data: new Date().toISOString().split('T')[0],
    numero_fatura: '',
    data_fatura: '',
    factura_data: null,
    factura_filename: null,
    factura_mimetype: null
  });
  const [uploadingFactura, setUploadingFactura] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const editCameraInputRef = useRef(null);
  const editFileInputRef = useRef(null);

  // Tipos de despesa disponíveis
  const tiposDespesa = [
    { value: 'outras', label: 'Outras' },
    { value: 'ferramentas', label: 'Ferramentas' }
  ];

  // Pedidos de Cotação
  const [pedidosCotacao, setPedidosCotacao] = useState([]);
  const [showPCModal, setShowPCModal] = useState(false);
  const [pcActiveTab, setPcActiveTab] = useState('resumo');
  const [pcDocumentos, setPcDocumentos] = useState([]);
  const [pcHistorico, setPcHistorico] = useState([]);
  const [pcObservacao, setPcObservacao] = useState(null);
  const [pcObsEditing, setPcObsEditing] = useState(false);
  const [pcObsDraft, setPcObsDraft] = useState('');
  const [pcDocUploading, setPcDocUploading] = useState(false);
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
  const [emailPCDestinatario, setEmailPCDestinatario] = useState('');
  const [emailPCCC, setEmailPCCC] = useState('');
  
  // Popup confidencialidade do cliente (antes de download/email PC)
  const [showHideClientPopup, setShowHideClientPopup] = useState(false);
  const [hideClientAction, setHideClientAction] = useState(null); // { type: 'download' | 'email', pcId, email? }
  
  // Editar Material PC
  const [showEditMaterialPCModal, setShowEditMaterialPCModal] = useState(false);
  const [editMaterialPC, setEditMaterialPC] = useState(null);
  const [editMaterialPCForm, setEditMaterialPCForm] = useState({ descricao: '', quantidade: '' });

  // Enviar Pedido de Cotação (Fase 4)
  const [showEnviarCotacaoModal, setShowEnviarCotacaoModal] = useState(false);
  const [enviarCotacaoMatIds, setEnviarCotacaoMatIds] = useState([]);

  // Cancelar PC (Fase 6)
  const [showCancelarPCModal, setShowCancelarPCModal] = useState(false);
  const [cancelarPCSending, setCancelarPCSending] = useState(false);

  // Adicionar material à PC (Fase 8 — modal simples, apenas nesta PC)
  const [showAddMaterialToPCModal, setShowAddMaterialToPCModal] = useState(false);
  
  // Faturas PC
  const [faturasPC, setFaturasPC] = useState([]);
  const [faturaFile, setFaturaFile] = useState(null);
  const [faturaDescricao, setFaturaDescricao] = useState('');
  const [uploadingFatura, setUploadingFatura] = useState(false);

  // Todos os PCs (para aba Pedidos de Cotação)
  const [allPCs, setAllPCs] = useState([]);
  const [loadingPCs, setLoadingPCs] = useState(false);

  // Referências Internas (admin panel)
  const [refTokens, setRefTokens] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [refFilterStatus, setRefFilterStatus] = useState('todos');
  const [refFilterCliente, setRefFilterCliente] = useState('');

  // Cronómetros
  const [cronometrosAtivos, setCronometrosAtivos] = useState([]);
  const [registosTecnicos, setRegistosTecnicos] = useState([]);
  const [timers, setTimers] = useState({}); // Para contar tempo em tempo real

  // Feb 2026 (Code Review Fase 2): merge+sort de tecnicos+registosTecnicos era
  // repetido inline em 2 sítios da JSX (versão mobile+desktop). Memoização
  // recomputa apenas quando os arrays de origem mudam.
  const registosCombinados = useMemo(() => {
    const merged = [
      ...tecnicos.map(tec => ({
        ...tec,
        _tipo_registo: tec.tipo_registo || 'manual',
        _source: 'tecnico',
        _data_sort: tec.data_trabalho || tec.created_at || '',
        _hora_inicio_sort: tec.hora_inicio || '',
        _key: `manual-${tec.id}`,
      })),
      ...registosTecnicos.map(reg => ({
        ...reg,
        _tipo_registo: reg.tipo,
        _source: 'cronometro',
        _data_sort: reg.data || reg.created_at || '',
        _hora_inicio_sort: reg.hora_inicio_segmento || '',
        _key: `crono-${reg.id}`,
      })),
    ];
    return merged.sort((a, b) => {
      const dataAStr = (a._data_sort || '1970-01-01').substring(0, 10);
      const dataBStr = (b._data_sort || '1970-01-01').substring(0, 10);
      if (dataAStr !== dataBStr) return dataAStr.localeCompare(dataBStr);
      const extractTime = (item) => {
        if (item._source === 'cronometro' && item.hora_inicio_segmento) {
          return item.hora_inicio_segmento.substring(11, 16);
        }
        return item.hora_inicio || '00:00';
      };
      return extractTime(a).localeCompare(extractTime(b));
    });
  }, [tecnicos, registosTecnicos]);
  
  // Todos os utilizadores do sistema (para cronómetros)
  const [allSystemUsers, setAllSystemUsers] = useState([]);
  const [selectedCronoUsers, setSelectedCronoUsers] = useState({});
  
  // Edição de registos de cronómetro
  const [showEditRegistoModal, setShowEditRegistoModal] = useState(false);
  const [editingRegisto, setEditingRegisto] = useState(null);

  // OneDrive picker (por-utilizador)
  const [showOneDrivePicker, setShowOneDrivePicker] = useState(false);
  const [oneDriveConnected, setOneDriveConnected] = useState(false);
  const [cameraToOneDrive, setCameraToOneDrive] = useState(false);
  const [showCameraCapture, setShowCameraCapture] = useState(false);

  // OneDrive/Câmara para o modal de Adicionar Fotografia ao PC
  const [showPCOneDrivePicker, setShowPCOneDrivePicker] = useState(false);
  const [showPCCameraCapture, setShowPCCameraCapture] = useState(false);
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
    incluir_pausa: false,
    funcao_ot: 'tecnico'
  });

  // Modal para adicionar registo manual
  const [showAddRegistoManualModal, setShowAddRegistoManualModal] = useState(false);
  // Modal/popup para função no cronómetro
  const [showCronometroFuncaoPopup, setShowCronometroFuncaoPopup] = useState(false);
  const [cronometroFuncaoData, setCronometroFuncaoData] = useState({
    tecnicos: [],  // [{id, nome, funcao_ot: 'tecnico'}]
    tipo: '',      // 'trabalho', 'viagem', 'oficina'
  });
  const [showStopCronoPopup, setShowStopCronoPopup] = useState(false);
  const [stopCronoData, setStopCronoData] = useState({ tecnicos: [], tipo: '', km_final: '' });
  const [showWorkKmPopup, setShowWorkKmPopup] = useState(false);
  const [workKmData, setWorkKmData] = useState({ km_inicial: '', km_final: '' });
  const [addRegistoManualForm, setAddRegistoManualForm] = useState({
    tecnico_id: '',
    tecnico_nome: '',
    tipo: 'trabalho',
    funcao_ot: 'tecnico',
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
    hora_fim: '',
    funcao_ot: 'tecnico'
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
    emails_adicionais: [],
    incluir_referencia_interna: false,
    email_referencia_interna: '',
    faturar_viagens_curtas: false
  });
  
  const [relatorioFormData, setRelatorioFormData] = useState({
    cliente_id: '',
    data_servico: new Date().toISOString().split('T')[0],
    data_fim: '',  // Campo "Até" - opcional
    local_intervencao: '',
    pedido_por: '',
    ot_relacionada_id: '',  // OT Relacionada (referência informativa)
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
    motivo_assistencia: ''
  }]);

  // Equipamentos
  const [equipamentos, setEquipamentos] = useState([]);
  
  // Equipamentos da OT
  const [equipamentosOT, setEquipamentosOT] = useState([]);
  const [showAddEquipamentoModal, setShowAddEquipamentoModal] = useState(false);
  const [addEquipIntervencaoId, setAddEquipIntervencaoId] = useState(null);
  const [equipamentoFormData, setEquipamentoFormData] = useState({
    tipologia: '',
    marca: '',
    modelo: '',
    numero_serie: '',
    ano_fabrico: '',
    horas_funcionamento: ''
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
    ano_fabrico: '',
    horas_funcionamento: ''
  });
  const [editingEquipamentoPrincipal, setEditingEquipamentoPrincipal] = useState(false);

  useEffect(() => {
    if (activeTab === 'clientes') {
      fetchClientes();
    } else if (activeTab === 'relatorios' || activeTab === 'facturados') {
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
          toast.error('FS não encontrada');
          setSearchParams({});
        }
      };
      
      openOtFromUrl();
    }
  }, [searchParams, urlOtProcessed, loading]);

  // Fase 8: Deep-link para uma PC específica via ?pc={id}
  const [urlPcProcessed, setUrlPcProcessed] = useState(false);
  useEffect(() => {
    const pcId = searchParams.get('pc');
    if (pcId && !urlPcProcessed && !loading) {
      setUrlPcProcessed(true);
      setActiveTab('pedidos-cotacao');
      (async () => {
        try {
          setPcActiveTab('resumo');
          await fetchPCDetalhes(pcId);
          setShowPCModal(true);
          const next = new URLSearchParams(searchParams);
          next.delete('pc');
          setSearchParams(next);
        } catch (error) {
          console.error('Erro ao abrir PC da URL:', error);
          toast.error('PC não encontrada');
          const next = new URLSearchParams(searchParams);
          next.delete('pc');
          setSearchParams(next);
        }
      })();
    }
  }, [searchParams, urlPcProcessed, loading]);
  
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
          toast.info("FS's carregadas do cache offline");
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
      emails_adicionais: emailsArray,
      incluir_referencia_interna: cliente.incluir_referencia_interna || false,
      email_referencia_interna: cliente.email_referencia_interna || '',
      faturar_viagens_curtas: cliente.faturar_viagens_curtas || false
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

  // CRUD Equipamentos do Cliente
  const handleAddClienteEquip = async (e) => {
    e.preventDefault();
    if (!clienteEquipForm.marca || !clienteEquipForm.modelo) {
      toast.error('Marca e Modelo são obrigatórios');
      return;
    }
    try {
      await axios.post(`${API}/equipamentos`, {
        ...clienteEquipForm,
        cliente_id: selectedCliente.id
      });
      toast.success('Equipamento adicionado!');
      setShowAddClienteEquipModal(false);
      setClienteEquipForm({ tipologia: '', marca: '', modelo: '', numero_serie: '', ano_fabrico: '' });
      fetchClienteEquipamentosDetalhado(selectedCliente.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const handleEditClienteEquip = async (e) => {
    e.preventDefault();
    if (!selectedEquipamento) return;
    try {
      await axios.put(`${API}/equipamentos/${selectedEquipamento.id}`, clienteEquipForm);
      toast.success('Equipamento atualizado!');
      setShowEditClienteEquipModal(false);
      setSelectedEquipamento(null);
      setClienteEquipForm({ tipologia: '', marca: '', modelo: '', numero_serie: '', ano_fabrico: '' });
      fetchClienteEquipamentosDetalhado(selectedCliente.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const handleDeleteClienteEquip = async (equipId) => {
    if (!window.confirm('Tem certeza que deseja eliminar este equipamento?')) return;
    try {
      await axios.delete(`${API}/equipamentos/${equipId}`);
      toast.success('Equipamento eliminado!');
      fetchClienteEquipamentosDetalhado(selectedCliente.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };


  const fetchEquipamentoIntervencoes = async (equipamento) => {
    try {
      const response = await axios.get(`${API}/equipamentos/${equipamento.id}/intervencoes`);
      setEquipamentoIntervencoes(response.data);
      setSelectedEquipamento(equipamento);
      setExpandedIntervencao(null);
      setShowEquipamentoOTsModal(true);
    } catch (error) {
      toast.error('Erro ao carregar intervenções do equipamento');
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
          await downloadFSPdfToFile({
            api: API,
            relatorioId: relatorio.id,
            axios,
            fallbackFilename: `FS_${relatorio.numero_assistencia}_${relatorio.cliente_nome?.replace(/\s+/g, '_')}.pdf`,
          });

          successCount++;

          // Pequena pausa entre downloads para não sobrecarregar
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          console.error(`Erro ao gerar PDF para OT #${relatorio.numero_assistencia}:`, error);
          toast.error(`FS #${relatorio.numero_assistencia}: ${error?.message || 'erro'}`, { duration: 8000 });
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
        responseType: 'blob',
        timeout: PDF_DOWNLOAD_TIMEOUT
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
        responseType: 'blob',
        timeout: PDF_DOWNLOAD_TIMEOUT
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
      emails_adicionais: [],
      incluir_referencia_interna: false,
      email_referencia_interna: '',
      faturar_viagens_curtas: false
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
      ot_relacionada_id: '',
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
      motivo_assistencia: ''
    }]);
  };

  const addIntervencaoForm = () => {
    setIntervencoesForm([...intervencoesForm, {
      id: Date.now(),
      data_intervencao: new Date().toISOString().split('T')[0],
      motivo_assistencia: ''
    }]);
  };

  const removeIntervencaoForm = (id) => {
    if (intervencoesForm.length > 1) {
      setIntervencoesForm(intervencoesForm.filter(i => i.id !== id));
    }
  };

  // Handlers para referência interna do cliente
  const handleGravarReferenciaInterna = async () => {
    if (!referenciaInternaFSId || !referenciaInternaValue.trim()) return;
    try {
      await axios.put(`${API}/relatorios-tecnicos/${referenciaInternaFSId}`, {
        referencia_interna_cliente: referenciaInternaValue.trim()
      });
      toast.success('Referência interna gravada!');
      fetchRelatorios();
    } catch (error) {
      toast.error('Erro ao gravar referência interna');
    }
    handleCloseReferenciaInterna();
  };

  const handleIgnorarReferenciaInterna = () => {
    handleCloseReferenciaInterna();
  };

  const handleCloseReferenciaInterna = () => {
    setShowReferenciaInternaModal(false);
    // Abrir modal do cronómetro com os dados pendentes
    if (referenciaInternaPendingCrono) {
      setNovaOTParaCrono(referenciaInternaPendingCrono);
      setCronoTecnicosSelecionados([]);
      setCronoTipo('trabalho');
      setShowIniciarCronoModal(true);
      setReferenciaInternaPendingCrono(null);
    }
    setReferenciaInternaFSId(null);
    setReferenciaInternaValue('');
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
          ordem: i
        });
      }
      
      toast.success('FS criada com sucesso!');
      setShowAddRelatorioModal(false);
      resetRelatorioForm();
      fetchRelatorios();
      
      // Buscar lista de utilizadores e mostrar modal para iniciar cronómetro
      try {
        const usersResponse = await axios.get(`${API}/users`);
        setAllSystemUsers(usersResponse.data);
      } catch (err) {
        console.error('Erro ao buscar utilizadores:', err);
      }
      
      // Verificar se cliente tem referência interna ativa
      const clienteDoRelatorio = clientes.find(c => c.id === relatorioFormData.cliente_id);
      if (clienteDoRelatorio?.incluir_referencia_interna) {
        // Notificar que email foi enviado automaticamente ao cliente
        const refEmail = clienteDoRelatorio.email_referencia_interna || clienteDoRelatorio.email;
        if (refEmail) {
          toast.info(`Email enviado a ${refEmail} para referencia interna`);
        }
        // Guardar dados para o cronómetro (será aberto depois do modal de referência)
        setReferenciaInternaFSId(relatorioId);
        setReferenciaInternaValue('');
        setReferenciaInternaPendingCrono({
          id: relatorioId,
          numero: response.data.numero_assistencia
        });
        setShowReferenciaInternaModal(true);
      } else {
        // Guardar dados da nova OT e abrir modal do cronómetro diretamente
        setNovaOTParaCrono({
          id: relatorioId,
          numero: response.data.numero_assistencia
        });
        setCronoTecnicosSelecionados([]);
        setCronoTipo('trabalho');
        setShowIniciarCronoModal(true);
      }
      
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const openViewRelatorioModal = async (relatorio) => {
    setSelectedRelatorio(relatorio);
    setShowViewRelatorioModal(true);
    setActiveIntervencaoId(null);
    // Verificar estado OneDrive do utilizador atual (para mostrar "↳ cópia no OneDrive" no menu Câmara)
    axios.get(`${API}/onedrive/status`)
      .then(({ data }) => {
        setOneDriveConnected(!!data.connected);
        // Se ligado, tentar retry de fotos pendentes deste utilizador (best-effort silencioso)
        if (data.connected) {
          axios.post(`${API}/onedrive/sync-pending`).catch(() => { /* silencioso */ });
        }
      })
      .catch(() => setOneDriveConnected(false));
    // Buscar todos os dados em paralelo
    await Promise.all([
      fetchTecnicosRelatorio(relatorio.id),
      fetchIntervencoesRelatorio(relatorio.id),
      fetchFotografiasRelatorio(relatorio.id),
      fetchAssinaturas(relatorio.id),
      fetchEquipamentosOT(relatorio.id),
      fetchMateriais(relatorio.id),
      fetchDespesas(relatorio.id),
      fetchRelatoriosAssistencia(relatorio.id),
      fetchPedidosCotacao(relatorio.id),
      fetchCronometros(relatorio.id),
      fetchRegistosTecnicos(relatorio.id),
      fetchAllSystemUsers(),
    ]);
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
      equipamento_ano_fabrico: relatorio.equipamento_ano_fabrico || '',
      referencia_interna_cliente: relatorio.referencia_interna_cliente || '',
      motivo_assistencia: relatorio.motivo_assistencia || ''
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
      toast.success('FS atualizada com sucesso!');
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
      toast.success('FS eliminada com sucesso!');
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
      // Se o modal de visualização está aberto sobre a mesma FS, refletir localmente
      if (selectedRelatorio && selectedRelatorio.id === selectedStatusRelatorio.id) {
        setSelectedRelatorio({ ...selectedRelatorio, status: newStatus });
      }
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
      const data = response.data;
      setIntervencoes(data);
      // Auto-select first intervention
      if (data.length > 0 && !activeIntervencaoId) {
        setActiveIntervencaoId(data[0].id);
      }
    } catch (error) {
      console.error('Erro ao carregar intervenções:', error);
      setIntervencoes([]);
    }
  };

  // Reordenar intervenções (drag-drop). `newList` é o array completo já
  // reordenado (não-herdadas apenas — as herdadas mantêm-se no topo).
  const handleReorderIntervencoes = async (newList) => {
    if (!selectedRelatorio) return;
    setReorderingIntervs(true);
    // Atualização optimista da UI
    setIntervencoes(newList);
    try {
      // Só enviamos as não-herdadas — o backend distingue e coloca herdadas primeiro
      const order = newList.filter(i => !i.herdada_de_intervencao_id).map(i => i.id);
      await axios.put(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/intervencoes/reorder`, { order });
      toast.success('Ordem das intervenções guardada', { duration: 1500 });
    } catch (error) {
      toast.error('Erro ao guardar ordem — a recarregar');
      await fetchIntervencoesRelatorio(selectedRelatorio.id);
    } finally {
      setReorderingIntervs(false);
    }
  };

  // Repor a ordem cronológica (limpa ordem_manual no backend)
  const handleResetIntervencoesOrder = async () => {
    if (!selectedRelatorio) return;
    setReorderingIntervs(true);
    try {
      await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/intervencoes/reset-order`);
      await fetchIntervencoesRelatorio(selectedRelatorio.id);
      toast.success('Ordem cronológica reposta');
    } catch (error) {
      toast.error('Erro ao repor ordem cronológica');
    } finally {
      setReorderingIntervs(false);
    }
  };

  const handleAddIntervencao = async (e) => {
    e.preventDefault();
    if (!selectedRelatorio) return;

    try {
      const res = await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/intervencoes`, {
        ...intervencaoFormData,
        relatorio_id: selectedRelatorio.id,
        ordem: intervencoes.length
      });
      
      toast.success('Intervenção adicionada com sucesso!');
      setShowAddIntervencaoModal(false);
      setIntervencaoFormData({
        data_intervencao: new Date().toISOString().split('T')[0],
        motivo_assistencia: '',
      });
      await fetchIntervencoesRelatorio(selectedRelatorio.id);
      // Select the new intervention tab
      if (res.data?.id) setActiveIntervencaoId(res.data.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const openEditIntervencaoModal = (intervencao) => {
    setSelectedIntervencao(intervencao);
    setIntervencaoFormData({
      data_intervencao: intervencao.data_intervencao.split('T')[0],
      motivo_assistencia: intervencao.motivo_assistencia,
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
    try {
      await axios.delete(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/intervencoes/${intervencaoId}`);
      toast.success('Intervenção removida com sucesso!');
      setIntervencaoToDelete(null);
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
        fetchRegistosTecnicos(selectedRelatorio.id);
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
      incluir_pausa: tecnico.incluir_pausa || false,
      funcao_ot: tecnico.funcao_ot || 'tecnico'
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
      incluir_pausa: false,
      funcao_ot: 'tecnico'
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
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const allowedExts = /\.(jpe?g|png|gif|webp|heic|heif)$/i;
    const maxSize = 25 * 1024 * 1024; // 25MB

    const processed = [];
    for (const file of files) {
      // Validar tipo (MIME OU extensão, para compatibilidade iOS/Android)
      const mimeOk = file.type && file.type.startsWith('image/');
      const extOk = allowedExts.test(file.name || '');
      if (!mimeOk && !extOk) {
        toast.error(`"${file.name}" — tipo não permitido. Ignorado.`);
        continue;
      }
      if (file.size > maxSize) {
        toast.error(`"${file.name}" é maior que 25MB. Ignorado.`);
        continue;
      }
      // Comprimir se for grande (falha graciosa para HEIC → usa original)
      if (file.size > 500 * 1024) {
        try {
          const compressed = await compressImage(file, 1200, 1200, 0.7);
          processed.push(compressed);
        } catch {
          processed.push(file);
        }
      } else {
        processed.push(file);
      }
    }

    if (processed.length === 0) {
      toast.error('Nenhuma imagem válida seleccionada.');
      return;
    }

    setFotoFiles(processed);
    // Retro-compatibilidade: manter fotoFile como o 1º ficheiro (para preview)
    setFotoFile(processed[0]);
    toast.success(`${processed.length} imagem(ns) pronta(s) para envio.`);
  };

  const handleUploadFoto = async (e) => {
    e.preventDefault();

    // Preferir a lista multi; fallback ao ficheiro único (retro-compat)
    const filesToUpload = (fotoFiles && fotoFiles.length > 0)
      ? fotoFiles
      : (fotoFile ? [fotoFile] : []);

    if (filesToUpload.length === 0) {
      toast.error('Selecione pelo menos uma fotografia');
      return;
    }

    // Descrição inicial (opcional) — aplicada a todas
    const descricaoElement = document.getElementById('foto_descricao');
    const descricaoInicial = descricaoElement ? descricaoElement.value.trim() : fotoDescricao.trim();

    setUploadingFoto(true);
    const uploaded = [];
    let failed = 0;

    for (const [idx, file] of filesToUpload.entries()) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('descricao', descricaoInicial || '');
        formData.append('intervencao_id', activeIntervencaoId || '');
        const response = await axios.post(
          `${API}/relatorios-tecnicos/${selectedRelatorio.id}/fotografias`,
          formData
        );
        uploaded.push({
          id: response.data.id,
          foto_url: response.data.foto_url,
          descricao: response.data.descricao || '',
          uploaded_at: response.data.uploaded_at,
        });
      } catch (error) {
        failed++;
        console.error(`Erro no upload da foto ${idx + 1}:`, error);
      }
    }

    setUploadingFoto(false);

    if (uploaded.length === 0) {
      toast.error('Falha em todos os uploads. Tente novamente.');
      return;
    }
    if (failed > 0) {
      toast.warning(`${uploaded.length} enviada(s), ${failed} falhou/falharam.`);
    } else {
      toast.success(`${uploaded.length} fotografia(s) adicionada(s)!`);
    }

    // Reset do modal de upload
    setShowAddFotoModal(false);
    setFotoFile(null);
    setFotoFiles([]);
    setFotoDescricao('');
    await fetchFotografiasRelatorio(selectedRelatorio.id);

    // Se >1 fotografia, abre o modal bulk edit para descrever cada uma;
    // caso contrário mantém o fluxo antigo (modal single edit).
    if (uploaded.length === 1) {
      openEditFotoModal(uploaded[0]);
    } else {
      setBulkFotosToEdit(uploaded);
      setShowBulkEditFotoModal(true);
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

  // Upload helper — usado pelo input hidden e pelo picker/câmara OneDrive
  // Se opts.mirrorToOneDrive === true, tenta guardar cópia no OneDrive do utilizador (best-effort).
  //   Path OneDrive: HWI - FS / FS-{numero} / Fotografias / {filename}
  //   Marca a foto com sync_status='synced|pending|failed' conforme resultado.
  const handleUploadPhotos = async (files, opts = {}) => {
    if (!files || files.length === 0 || !selectedRelatorio) return;
    const uploaded = [];
    let failed = 0;
    let onedriveOk = 0;
    let onedriveFail = 0;
    const fsNum = selectedRelatorio?.numero_assistencia;
    const subfolder = `FS-${fsNum || 'X'}/Fotografias`;
    for (const file of files) {
      let fotoId = null;
      try {
        // 1. Upload principal para a FS (fonte da verdade — sempre visível)
        const formData = new FormData();
        formData.append('file', file);
        formData.append('descricao', '');
        formData.append('intervencao_id', uploadIntervencaoId || '');
        const response = await axios.post(
          `${API}/relatorios-tecnicos/${selectedRelatorio.id}/fotografias`,
          formData
        );
        fotoId = response.data.id;
        uploaded.push({
          id: fotoId,
          foto_url: response.data.foto_url,
          descricao: response.data.descricao || '',
          uploaded_at: response.data.uploaded_at,
        });

        // 2. Mirror para OneDrive (best-effort)
        if (opts.mirrorToOneDrive && fotoId) {
          try {
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
            const overrideName = `FS-${fsNum || 'X'}_${ts}.${ext}`;
            const odForm = new FormData();
            odForm.append('file', file, overrideName);
            odForm.append('filename_override', overrideName);
            odForm.append('subfolder_path', subfolder);
            const odResp = await axios.post(`${API}/onedrive/upload`, odForm);
            await axios.patch(
              `${API}/relatorios-tecnicos/${selectedRelatorio.id}/fotografias/${fotoId}/onedrive-link`,
              {
                onedrive_item_id: odResp.data.id,
                onedrive_web_url: odResp.data.web_url,
                onedrive_path: odResp.data.path,
                sync_status: 'synced',
              }
            );
            onedriveOk++;
          } catch (odErr) {
            console.warn('Falha a enviar cópia para OneDrive:', odErr?.response?.data || odErr);
            onedriveFail++;
            // Marca como pendente — retry automático mais tarde
            try {
              await axios.patch(
                `${API}/relatorios-tecnicos/${selectedRelatorio.id}/fotografias/${fotoId}/onedrive-link`,
                { sync_status: 'pending' }
              );
            } catch { /* ignore */ }
          }
        }
      } catch (err) {
        console.error('Erro no upload:', err);
        failed++;
      }
    }
    if (uploaded.length === 0) {
      toast.error('Erro ao fazer upload das fotografias');
    } else if (failed > 0) {
      toast.warning(`${uploaded.length} enviada(s), ${failed} falhou/falharam.`);
    } else {
      toast.success(`${uploaded.length} fotografia(s) adicionada(s)!`);
    }
    if (opts.mirrorToOneDrive) {
      if (onedriveOk > 0 && onedriveFail === 0) {
        toast.success(`${onedriveOk} guardadas em OneDrive/HWI - FS/FS-${fsNum}/Fotografias`);
      } else if (onedriveFail > 0 && onedriveOk === 0) {
        toast.warning('OneDrive indisponível — fotos marcadas como "a aguardar sincronização". Vamos tentar novamente automaticamente.');
      } else if (onedriveFail > 0) {
        toast.warning(`OneDrive: ${onedriveOk} guardadas, ${onedriveFail} pendentes (retry automático).`);
      }
    }
    await fetchFotografiasRelatorio(selectedRelatorio.id);
    if (uploaded.length === 1) {
      openEditFotoModal(uploaded[0]);
    } else if (uploaded.length > 1) {
      setBulkFotosToEdit(uploaded);
      setShowBulkEditFotoModal(true);
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

  // ---------------------------------------------------------------------
  // Bulk edit descrições (após multi-upload)
  // ---------------------------------------------------------------------
  const handleBulkFotoDescricaoChange = (id, value) => {
    setBulkFotosToEdit((prev) =>
      prev.map((f) => (f.id === id ? { ...f, descricao: value } : f))
    );
  };

  // Abrir modal em modo "Reorganizar" — carrega TODAS as fotos da FS
  // (já persistidas) pela ordem actual, permitindo drag&drop + edição de
  // descrições. Reutiliza o mesmo modal do fluxo multi-upload.
  const openReorganizeFotosModal = () => {
    if (!selectedRelatorio || !fotografias || fotografias.length === 0) {
      toast.info('Ainda não existem fotografias para reorganizar.');
      return;
    }
    // Fotografias já vêm ordenadas por `ordem` do backend
    const items = fotografias.map((f) => ({
      id: f.id,
      foto_url: f.foto_url,
      descricao: f.descricao || '',
      uploaded_at: f.uploaded_at,
    }));
    setBulkFotosToEdit(items);
    setShowBulkEditFotoModal(true);
  };

  // Reorder helper — move a foto da posição `from` para `to` (drag&drop ou setas)
  const handleBulkFotoReorder = (from, to) => {
    setBulkFotosToEdit((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleSaveBulkFotoDescricoes = async () => {
    if (!selectedRelatorio || bulkFotosToEdit.length === 0) return;
    setUploadingFoto(true);
    let ok = 0;
    let fail = 0;
    // 1) Guardar descrições
    for (const f of bulkFotosToEdit) {
      try {
        await axios.put(
          `${API}/relatorios-tecnicos/${selectedRelatorio.id}/fotografias/${f.id}`,
          { descricao: f.descricao || '' }
        );
        ok++;
      } catch (err) {
        console.error('Erro a guardar descrição da foto', f.id, err);
        fail++;
      }
    }
    // 2) Guardar ordem — reordena todas as fotos que o utilizador enviou
    //    respeitando a sequência actual do array (drag&drop/setas).
    try {
      await axios.put(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/fotografias/reorder`,
        { foto_ids: bulkFotosToEdit.map((f) => f.id) }
      );
    } catch (err) {
      console.error('Erro a guardar ordem das fotos', err);
      // Não conta como fail para não confundir o utilizador — a descrição foi ok.
    }
    setUploadingFoto(false);
    if (fail === 0) {
      toast.success(`Descrições e ordem guardadas (${ok}).`);
    } else {
      toast.warning(`${ok} descrição(ões) guardada(s), ${fail} falhou/falharam.`);
    }
    setShowBulkEditFotoModal(false);
    setBulkFotosToEdit([]);
    await fetchFotografiasRelatorio(selectedRelatorio.id);
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
        ano_fabrico: '',
        horas_funcionamento: ''
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
          ano_fabrico: equipamento.ano_fabrico || '',
          horas_funcionamento: equipamento.horas_funcionamento || ''
        });
      }
    }
  };

  const openAddEquipamentoModal = (intervencaoId) => {
    // Buscar equipamentos do cliente da OT
    if (selectedRelatorio?.cliente_id) {
      fetchEquipamentosClienteParaOT(selectedRelatorio.cliente_id);
    }
    setAddEquipIntervencaoId(intervencaoId || null);
    // Reset do form
    setEquipamentoOTSelecionado('novo');
    setEquipamentoFormData({
      tipologia: '',
      marca: '',
      modelo: '',
      numero_serie: '',
      ano_fabrico: '',
      horas_funcionamento: ''
    });
    setShowAddEquipamentoModal(true);
  };

  const handleAddEquipamento = async (e) => {
    e.preventDefault();
    
    try {
      // Se é um equipamento novo, enviar flag para criar na base do cliente
      const dataToSend = {
        ...equipamentoFormData,
        criar_na_base_cliente: equipamentoOTSelecionado === 'novo',
        equipamento_cliente_id: (equipamentoOTSelecionado !== 'novo' && equipamentoOTSelecionado !== 'apenas_ot') ? equipamentoOTSelecionado : undefined,
        intervencao_id: addEquipIntervencaoId || undefined
      };
      
      await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/equipamentos`, dataToSend);
      toast.success('Equipamento adicionado!');
      setShowAddEquipamentoModal(false);
      setEquipamentoFormData({
        tipologia: '',
        marca: '',
        modelo: '',
        numero_serie: '',
        ano_fabrico: '',
        horas_funcionamento: ''
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
      ano_fabrico: equipamento.ano_fabrico || '',
      horas_funcionamento: equipamento.horas_funcionamento || ''
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
      ano_fabrico: selectedRelatorio.equipamento_ano_fabrico || '',
      horas_funcionamento: selectedRelatorio.equipamento_horas_funcionamento || ''
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
          equipamento_ano_fabrico: editEquipamentoFormData.ano_fabrico,
          equipamento_horas_funcionamento: editEquipamentoFormData.horas_funcionamento
        });
        
        // Atualizar estado local
        setSelectedRelatorio({
          ...selectedRelatorio,
          equipamento_tipologia: editEquipamentoFormData.tipologia,
          equipamento_marca: editEquipamentoFormData.marca,
          equipamento_modelo: editEquipamentoFormData.modelo,
          equipamento_numero_serie: editEquipamentoFormData.numero_serie,
          equipamento_ano_fabrico: editEquipamentoFormData.ano_fabrico,
          equipamento_horas_funcionamento: editEquipamentoFormData.horas_funcionamento
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
      const payload = {
        ...materialFormData,
        intervencao_id: addMaterialIntervencaoId || null
      };

      // "Cotação": o backend decide sozinho — reaproveita PC existente da FS
      // ou cria uma nova. Nunca enviamos pc_id daqui.

      // Pass selected equipment IDs for the PC
      if (materialFormData.fornecido_por === 'Cotação' && selectedEquipOTIdsForPC.length > 0) {
        payload.equipamento_ot_ids = selectedEquipOTIdsForPC;
      }
      
      const resp = await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/materiais`, payload);
      const pcInfo = resp.data?._pc_info;

      if (pcInfo?.numero_pc) {
        const isNew = !!pcInfo.created;
        const message = isNew
          ? `Material adicionado — novo PC ${pcInfo.numero_pc} criado`
          : `Material agregado ao PC ${pcInfo.numero_pc}`;
        toast.success(message, {
          duration: 6000,
          action: {
            label: 'Abrir PC',
            onClick: async () => {
              try {
                setActiveTab('pedidos-cotacao');
                setPcActiveTab('resumo');
                await fetchPCDetalhes(pcInfo.pc_id);
                setShowPCModal(true);
              } catch (e) {
                toast.error('Não foi possível abrir o PC');
              }
            },
          },
        });
      } else {
        toast.success('Material adicionado!');
      }

      fetchMateriais(selectedRelatorio.id);
      setShowAddMaterialModal(false);
      setMaterialFormData({ descricao: '', quantidade: '', unidade: 'Un', fornecido_por: 'Cliente', data_utilizacao: '' });
      setSelectedEquipOTIdsForPC([]);

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
      unidade: material.unidade || 'Un',
      fornecido_por: material.fornecido_por,
      data_utilizacao: material.data_utilizacao || '',
      posicao: material.posicao || '',
      codigo: material.codigo || ''
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

  // ============ Relatórios de Assistência ============
  const fetchRelatoriosAssistencia = async (relatorioId) => {
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos/${relatorioId}/relatorios-assistencia`);
      setRelatoriosAssistencia(response.data);
    } catch (error) {
      console.error('Erro ao buscar relatórios de assistência:', error);
    }
  };

  const handleAddRelAssist = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/relatorios-assistencia`, relAssistFormData);
      toast.success('Relatório de assistência adicionado!');
      fetchRelatoriosAssistencia(selectedRelatorio.id);
      setShowAddRelAssistModal(false);
      setRelAssistFormData({ texto: '', equipamento_ids: [], data_intervencao: '' });
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const handleUpdateRelAssist = async (e) => {
    e.preventDefault();
    try {
      await axios.put(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/relatorios-assistencia/${selectedRelAssist.id}`,
        relAssistFormData
      );
      toast.success('Relatório de assistência atualizado!');
      fetchRelatoriosAssistencia(selectedRelatorio.id);
      setShowEditRelAssistModal(false);
      setSelectedRelAssist(null);
      setRelAssistFormData({ texto: '', equipamento_ids: [], data_intervencao: '' });
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const handleDeleteRelAssist = async (itemId) => {
    try {
      await axios.delete(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/relatorios-assistencia/${itemId}`);
      toast.success('Relatório de assistência removido!');
      fetchRelatoriosAssistencia(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const openEditRelAssist = (item) => {
    setSelectedRelAssist(item);
    setRelAssistFormData({ texto: item.texto || '', equipamento_ids: item.equipamento_ids || [], data_intervencao: item.data_intervencao || '' });
    setShowEditRelAssistModal(true);
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
    
    if (!despesaFormData.valor || !despesaFormData.tecnico_id || !despesaFormData.data) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (despesaFormData.tipo === 'outras' && !despesaFormData.descricao) {
      toast.error('Descrição é obrigatória para despesas do tipo "Outras"');
      return;
    }
    
    try {
      await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/despesas`, despesaFormData);
      toast.success('Despesa registada! Admin notificado.');
      fetchDespesas(selectedRelatorio.id);
      setShowAddDespesaModal(false);
      setShowScanner(false);
      setDespesaFormData({
        tipo: 'outras',
        descricao: '',
        quantidade: '',
        unidade: 'Un',
        valor: '',
        percentagem: '',
        valor_final: '',
        tecnico_id: '',
        data: new Date().toISOString().split('T')[0],
        numero_fatura: '',
        data_fatura: '',
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
    if (!despesaId) {
      toast.error('ID da despesa não encontrado');
      return;
    }
    try {
      await axios.delete(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/despesas/${despesaId}`);
      toast.success('Despesa eliminada!');
      setDespesaToDelete(null);
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
      quantidade: despesa.quantidade ?? '',
      unidade: despesa.unidade || 'Un',
      valor: despesa.valor,
      percentagem: despesa.percentagem ?? '',
      valor_final: despesa.valor_final ?? '',
      tecnico_id: despesa.tecnico_id,
      data: despesa.data,
      numero_fatura: despesa.numero_fatura || '',
      data_fatura: despesa.data_fatura || '',
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
    
    try {
      // Convert base64 data URL to Blob for reliable mobile download
      const base64Data = despesa.factura_data.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: despesa.factura_mimetype || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      // Mobile: open in new tab (allows save/share). Desktop: trigger download.
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        window.open(url, '_blank');
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = despesa.factura_filename || 'factura';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error) {
      console.error('Erro ao fazer download:', error);
      toast.error('Erro ao fazer download do ficheiro');
    }
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

      // Fase 3 — buscar documentos, histórico e observação em paralelo (fire-and-forget)
      axios.get(`${API}/pedidos-cotacao/${pcId}/documentos`)
        .then((r) => setPcDocumentos(r.data || []))
        .catch(() => setPcDocumentos([]));
      axios.get(`${API}/pedidos-cotacao/${pcId}/historico`)
        .then((r) => setPcHistorico(r.data || []))
        .catch(() => setPcHistorico([]));
      axios.get(`${API}/pedidos-cotacao/${pcId}/observacoes`)
        .then((r) => { setPcObservacao(r.data || null); setPcObsDraft(r.data?.texto || ''); })
        .catch(() => { setPcObservacao(null); setPcObsDraft(''); });
    } catch (error) {
      console.error('Erro ao buscar detalhes do PC:', error);
      toast.error('Erro ao carregar detalhes do PC');
    }
  };

  // Fase 3 — handlers
  const handleSavePcObservacao = async () => {
    if (!selectedPC) return;
    try {
      await axios.put(`${API}/pedidos-cotacao/${selectedPC.id}/observacoes`, { texto: pcObsDraft });
      toast.success('Observações atualizadas');
      setPcObsEditing(false);
      const [obsRes, histRes] = await Promise.all([
        axios.get(`${API}/pedidos-cotacao/${selectedPC.id}/observacoes`),
        axios.get(`${API}/pedidos-cotacao/${selectedPC.id}/historico`),
      ]);
      setPcObservacao(obsRes.data || null);
      setPcHistorico(histRes.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro a guardar observações');
    }
  };

  const handleUploadPcDoc = async (file, tipo, descricao) => {
    if (!selectedPC || !file) return;
    setPcDocUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (tipo) fd.append('tipo', tipo);
      if (descricao) fd.append('descricao', descricao);
      await axios.post(`${API}/pedidos-cotacao/${selectedPC.id}/documentos`, fd);
      toast.success('Documento adicionado');
      const [docsRes, histRes] = await Promise.all([
        axios.get(`${API}/pedidos-cotacao/${selectedPC.id}/documentos`),
        axios.get(`${API}/pedidos-cotacao/${selectedPC.id}/historico`),
      ]);
      setPcDocumentos(docsRes.data || []);
      setPcHistorico(histRes.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro a fazer upload');
    } finally {
      setPcDocUploading(false);
    }
  };

  const handleDeletePcDoc = async (docId, name) => {
    if (!selectedPC) return;
    if (!window.confirm(`Eliminar o documento "${name}"?`)) return;
    try {
      await axios.delete(`${API}/pedidos-cotacao/${selectedPC.id}/documentos/${docId}`);
      toast.success('Documento eliminado');
      const [docsRes, histRes] = await Promise.all([
        axios.get(`${API}/pedidos-cotacao/${selectedPC.id}/documentos`),
        axios.get(`${API}/pedidos-cotacao/${selectedPC.id}/historico`),
      ]);
      setPcDocumentos(docsRes.data || []);
      setPcHistorico(histRes.data || []);
    } catch (e) {
      toast.error('Erro ao eliminar');
    }
  };

  const handleDownloadPcDoc = async (doc) => {
    if (!selectedPC) return;
    try {
      const resp = await axios.get(
        `${API}/pedidos-cotacao/${selectedPC.id}/documentos/${doc.id}/download`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(resp.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.original_name || doc.filename || 'documento';
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Erro ao descarregar');
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
      // Aceitar MIME image/* OU extensão conhecida — em mobile o `file.type`
      // vem vazio ou não-standard com frequência.
      const allowedExts = /\.(jpe?g|png|gif|webp|heic|heif)$/i;
      const mimeOk = file.type && file.type.startsWith('image/');
      const extOk = allowedExts.test(file.name || '');
      if (!mimeOk && !extOk) {
        toast.error('Tipo de arquivo não permitido. Use: JPG, PNG, GIF, WEBP, HEIC');
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        toast.error('Arquivo muito grande. Tamanho máximo: 25MB');
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
          console.warn('Compressão falhou. Usando original.', error);
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

  // Multi-file + OneDrive mirror upload para fotografias do PC (espelha `handleUploadPhotos` da FS)
  const handleUploadPCPhotos = async (files, opts = {}) => {
    if (!files || files.length === 0 || !selectedPC) return;
    const descricao = opts.descricao || '';
    const mirrorToOneDrive = !!opts.mirrorToOneDrive;
    const pcNum = selectedPC?.numero_pc || 'X';
    const subfolder = `PC-${pcNum}/Fotografias`;
    setUploadingFotoPC(true);
    let ok = 0, failed = 0, odOk = 0, odFail = 0;
    try {
      for (const file of files) {
        let fotoId = null;
        try {
          const form = new FormData();
          form.append('file', file);
          form.append('descricao', descricao);
          const resp = await axios.post(`${API}/pedidos-cotacao/${selectedPC.id}/fotografias`, form, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          fotoId = resp.data.id;
          ok++;

          // Mirror para OneDrive (best-effort)
          if (mirrorToOneDrive && fotoId) {
            try {
              const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
              const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase();
              const overrideName = `PC-${pcNum}_${ts}.${ext}`;
              const odForm = new FormData();
              odForm.append('file', file, overrideName);
              odForm.append('filename_override', overrideName);
              odForm.append('subfolder_path', subfolder);
              const odResp = await axios.post(`${API}/onedrive/upload`, odForm);
              await axios.patch(
                `${API}/pedidos-cotacao/${selectedPC.id}/fotografias/${fotoId}/onedrive-link`,
                {
                  onedrive_item_id: odResp.data.id,
                  onedrive_web_url: odResp.data.web_url,
                  onedrive_path: odResp.data.path,
                  sync_status: 'synced',
                }
              );
              odOk++;
            } catch (odErr) {
              console.warn('OneDrive mirror falhou (PC):', odErr?.response?.data || odErr);
              odFail++;
              try {
                await axios.patch(
                  `${API}/pedidos-cotacao/${selectedPC.id}/fotografias/${fotoId}/onedrive-link`,
                  { sync_status: 'pending' }
                );
              } catch (_) { /* ignore */ }
            }
          }
        } catch (err) {
          console.error('Upload PC foto falhou:', err);
          failed++;
        }
      }
    } finally {
      setUploadingFotoPC(false);
    }

    if (ok === 0) {
      toast.error('Erro ao adicionar fotografias ao PC');
    } else if (failed > 0) {
      toast.warning(`${ok} adicionada(s), ${failed} falhou/falharam`);
    } else {
      toast.success(`${ok} fotografia(s) adicionada(s) ao PC!`);
    }
    if (mirrorToOneDrive) {
      if (odOk > 0 && odFail === 0) {
        toast.success(`${odOk} guardadas em OneDrive/HWI - PC/PC-${pcNum}/Fotografias`);
      } else if (odFail > 0 && odOk === 0) {
        toast.warning('OneDrive indisponível — fotos marcadas como pendentes.');
      } else if (odFail > 0) {
        toast.warning(`OneDrive: ${odOk} guardadas, ${odFail} pendentes.`);
      }
    }

    fetchPCDetalhes(selectedPC.id);
    setShowAddFotoPCModal(false);
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

  // Trigger popup antes de download/email PC
  const triggerPCDownload = (pcId) => {
    setHideClientAction({ type: 'download', pcId });
    setShowHideClientPopup(true);
  };
  
  const triggerPCEmail = (email) => {
    setHideClientAction({ type: 'email', pcId: selectedPC?.id, email });
    setShowHideClientPopup(true);
  };
  
  const executeHideClientAction = async (hideClient) => {
    setShowHideClientPopup(false);
    const action = hideClientAction;
    setHideClientAction(null);
    if (!action) return;
    
    if (action.type === 'download') {
      await handleDownloadPDFPC(action.pcId, hideClient);
    } else if (action.type === 'email') {
      await handleSendEmailPC(action.email, hideClient);
    }
  };

  const handleDownloadPDFPC = async (pcId, hideClient = false) => {
    try {
      const response = await axios.get(`${API}/pedidos-cotacao/${pcId}/preview-pdf?hide_client=${hideClient}`, {
        responseType: 'blob',
        timeout: PDF_DOWNLOAD_TIMEOUT
      });
      
      const pc = pedidosCotacao.find(p => p.id === pcId) || allPCs.find(p => p.id === pcId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `PC_${pc?.numero_pc || pcId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('PDF baixado com sucesso!');
    } catch (error) {
      const msg = await extractBlobError(error);
      toast.error(`Erro ao baixar PDF: ${msg}`, { duration: 8000 });
    }
  };

  const handleSendEmailPC = async (email, hideClient = false) => {
    setSendingEmailPC(true);
    try {
      await axios.post(`${API}/pedidos-cotacao/${selectedPC.id}/send-email?email_destinatario=${email}&hide_client=${hideClient}&idioma=${idiomaEmail}`);
      toast.success(`Email enviado para ${email}`);
      setShowEmailPCModal(false);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setSendingEmailPC(false);
    }
  };

  // Cancelar PC (Fase 6) — guarda status + motivo no servidor e regista no histórico
  const handleConfirmCancelarPC = async (motivo) => {
    if (!selectedPC) return;
    setCancelarPCSending(true);
    try {
      await axios.post(`${API}/pedidos-cotacao/${selectedPC.id}/cancelar`, { motivo });
      toast.success('PC cancelada');
      setShowCancelarPCModal(false);
      // Refresh — mantém o modal aberto para o utilizador ver o novo estado + histórico
      await fetchPCDetalhes(selectedPC.id);
      if (selectedRelatorio?.id) fetchPedidosCotacao(selectedRelatorio.id);
      fetchAllPCs();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro ao cancelar PC');
    } finally {
      setCancelarPCSending(false);
    }
  };

  // Mudar estado da PC via badge clicável no header (Fase 8)
  const handleChangePCStatus = async (novoStatus) => {
    if (!selectedPC || novoStatus === selectedPC.status) return;
    try {
      await axios.put(`${API}/pedidos-cotacao/${selectedPC.id}`, { status: novoStatus });
      toast.success(`Estado alterado para ${novoStatus === 'Cotação Pedida' ? 'Em Cotação' : novoStatus}`);
      await fetchPCDetalhes(selectedPC.id);
      if (selectedRelatorio?.id) fetchPedidosCotacao(selectedRelatorio.id);
      fetchAllPCs();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro a alterar estado');
    }
  };

  // Estado dos materiais (Fase 8) — badges na tabela do Resumo
  const materialStatusEquals = (current, target) => {
    // Compara considerando os valores legados (snake_case) contra os novos
    if (!current) return target === 'Em Espera';
    if (current === target) return true;
    const legacyMap = {
      sem_pedido: 'Em Espera',
      em_cotacao: 'Cotação Pedida',
      cotacao_recebida: 'A Caminho',
      cancelada: 'Cancelado',
    };
    return legacyMap[current] === target;
  };

  const getMaterialEstadoInfo = (status) => {
    const map = {
      'Em Espera': { label: 'EM ESPERA', cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40' },
      'Cotação Pedida': { label: 'EM COTAÇÃO', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
      'A Caminho': { label: 'A CAMINHO', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
      'Em Armazém': { label: 'EM ARMAZÉM', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/40' },
      'Terminado': { label: 'TERMINADO', cls: 'bg-emerald-600/20 text-emerald-200 border-emerald-500/60' },
      'Cancelado': { label: 'CANCELADO', cls: 'bg-red-500/15 text-red-300 border-red-500/40' },
      // legados
      'em_cotacao': { label: 'EM COTAÇÃO', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
      'cotacao_recebida': { label: 'A CAMINHO', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
      'cancelada': { label: 'CANCELADO', cls: 'bg-red-500/15 text-red-300 border-red-500/40' },
    };
    return map[status] || { label: 'SEM PEDIDO', cls: 'bg-gray-600/20 text-gray-400 border-gray-600/40' };
  };

  const handleChangeMaterialStatus = async (materialId, novoStatus) => {
    if (!selectedPC) return;
    try {
      const r = await axios.patch(
        `${API}/pedidos-cotacao/${selectedPC.id}/materiais/${materialId}/fornecedor`,
        { cotacao_status: novoStatus },
      );
      toast.success(`Material → ${novoStatus === 'Cotação Pedida' ? 'Em Cotação' : novoStatus}`);
      if (r.data?.pc_auto_terminada) {
        toast.success('PC terminada automaticamente — todos os materiais em armazém 🎉');
        if (selectedRelatorio?.id) fetchPedidosCotacao(selectedRelatorio.id);
        fetchAllPCs();
      }
      await fetchPCDetalhes(selectedPC.id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erro a alterar estado do material');
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

  const fetchRefTokens = async () => {
    setLoadingRefs(true);
    try {
      const params = new URLSearchParams();
      if (refFilterStatus !== 'todos') params.append('status', refFilterStatus);
      if (refFilterCliente.trim()) params.append('cliente_filter', refFilterCliente.trim());
      const response = await axios.get(`${API}/admin/reference-tokens?${params.toString()}`);
      setRefTokens(response.data);
    } catch (error) {
      console.error('Erro ao buscar referências:', error);
    } finally {
      setLoadingRefs(false);
    }
  };

  const handleResendRefEmail = async (tokenId) => {
    try {
      const res = await axios.post(`${API}/admin/resend-reference-email/${tokenId}`);
      toast.success(res.data.message);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao reenviar email');
    }
  };

  const handleDeleteRefToken = async (tokenId) => {
    if (!window.confirm('Tem certeza que deseja remover este pedido de referência?')) return;
    try {
      await axios.delete(`${API}/admin/reference-tokens/${tokenId}`);
      toast.success('Referência removida');
      fetchRefTokens();
    } catch (error) {
      toast.error('Erro ao remover');
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
      // Atualizar materiais e PCs da FS aberta (os materiais da PC foram eliminados)
      if (selectedRelatorio?.id) {
        fetchMateriais(selectedRelatorio.id);
        fetchPedidosCotacao(selectedRelatorio.id);
      }
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
    setPcActiveTab('resumo');
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

  const handleEditAssinatura = (assinatura) => {
    setEditingAssinaturaNome(assinatura.id);
    setEditingNomeData({
      primeiro_nome: assinatura.primeiro_nome || (assinatura.assinado_por ? assinatura.assinado_por.split(' ')[0] : ''),
      ultimo_nome: assinatura.ultimo_nome || (assinatura.assinado_por ? assinatura.assinado_por.split(' ').slice(1).join(' ') : ''),
    });
    setEditingAssinaturaDesktop(assinatura.id);
    if (assinatura.data_assinatura) {
      const d = new Date(assinatura.data_assinatura);
      setEditingAssinaturaData({
        date: d.toISOString().slice(0, 10),
        time: d.toTimeString().slice(0, 5),
      });
    }
  };

  const handleMoveItemToIntervention = async (type, itemId, targetIntervencaoId) => {
    if (!selectedRelatorio) return;
    try {
      const endpoint = type === 'foto'
        ? `${API}/relatorios-tecnicos/${selectedRelatorio.id}/fotografias/${itemId}`
        : type === 'material'
        ? `${API}/relatorios-tecnicos/${selectedRelatorio.id}/materiais/${itemId}`
        : type === 'equipamento'
        ? `${API}/relatorios-tecnicos/${selectedRelatorio.id}/equipamentos/${itemId}`
        : null;

      if (!endpoint) return;

      await axios.put(endpoint, { intervencao_id: targetIntervencaoId });
      toast.success('Movido com sucesso!');

      if (type === 'foto') fetchFotografiasRelatorio(selectedRelatorio.id);
      else if (type === 'material') fetchMateriais(selectedRelatorio.id);
      else if (type === 'equipamento') fetchEquipamentosOT(selectedRelatorio.id);
    } catch (error) {
      console.error('Erro ao mover:', error);
      toast.error('Erro ao mover item');
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

  const handleIniciarCronometro = async (tecnico, tipo, funcao_ot = 'tecnico', km_inicial = 0) => {
    try {
      await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/cronometro/iniciar`, {
        tipo,
        tecnico_id: tecnico.tecnico_id || tecnico.id,
        tecnico_nome: tecnico.tecnico_nome || tecnico.nome,
        funcao_ot,
        km_inicial
      });
      
      toast.success(`Cronómetro de ${tipo} iniciado!`);
      fetchCronometros(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  // Abrir popup de função antes de iniciar cronómetro para técnico individual
  const openCronometroFuncaoPopup = (tecnico, tipo) => {
    const userId = tecnico.tecnico_id || tecnico.id;
    const userObj = allSystemUsers.find(u => u.id === userId);
    setCronometroFuncaoData({
      tecnicos: [{
        id: userId,
        nome: tecnico.tecnico_nome || tecnico.nome,
        funcao_ot: userObj?.tipo_colaborador || 'tecnico'
      }],
      tipo,
      context: 'existing_ot'
    });
    setShowCronometroFuncaoPopup(true);
  };

  // Confirmar início de cronómetro com funções definidas
  const handleConfirmCronometroFuncao = async () => {
    const { tecnicos, tipo, context } = cronometroFuncaoData;
    
    if (context === 'nova_ot') {
      // Iniciar cronómetros para nova OT
      let successCount = 0;
      let errorCount = 0;
      const km_inicial = cronometroFuncaoData.km_inicial ? parseFloat(cronometroFuncaoData.km_inicial) : 0;
      
      for (let i = 0; i < tecnicos.length; i++) {
        const tec = tecnicos[i];
        try {
          await axios.post(`${API}/relatorios-tecnicos/${novaOTParaCrono.id}/cronometro/iniciar`, {
            tipo,
            tecnico_id: tec.id,
            tecnico_nome: tec.nome,
            funcao_ot: tec.funcao_ot,
            km_inicial: i === 0 ? km_inicial : 0
          });
          successCount++;
        } catch (error) {
          console.error(`Erro ao iniciar cronómetro para ${tec.nome}:`, error);
          errorCount++;
        }
      }
      
      if (successCount > 0) {
        const tipoLabel = tipo === 'trabalho' ? 'Trabalho' : tipo === 'oficina' ? 'Oficina' : 'Viagem';
        toast.success(`Cronómetro de ${tipoLabel} iniciado para ${successCount} técnico(s)!`);
      }
      if (errorCount > 0) {
        toast.error(`Falha ao iniciar cronómetro para ${errorCount} técnico(s)`);
      }
      
      setShowIniciarCronoModal(false);
      setNovaOTParaCrono(null);
      setCronoTecnicosSelecionados([]);
    } else {
      // Iniciar cronómetro individual em OT existente
      const km_inicial = cronometroFuncaoData.km_inicial ? parseFloat(cronometroFuncaoData.km_inicial) : 0;
      for (let i = 0; i < tecnicos.length; i++) {
        const tec = tecnicos[i];
        await handleIniciarCronometro(
          { tecnico_id: tec.id, tecnico_nome: tec.nome },
          tipo,
          tec.funcao_ot,
          i === 0 ? km_inicial : 0  // Km's iniciais apenas no primeiro técnico
        );
      }
    }
    
    setShowCronometroFuncaoPopup(false);
  };

  // Iniciar cronómetro após criar nova OT (abre popup de função)
  const handleIniciarCronoNovaOT = async () => {
    if (!novaOTParaCrono || cronoTecnicosSelecionados.length === 0) {
      toast.error('Selecione pelo menos um técnico');
      return;
    }
    
    setCronometroFuncaoData({
      tecnicos: cronoTecnicosSelecionados.map(tec => {
        const userObj = allSystemUsers.find(u => u.id === tec.id);
        return {
          id: tec.id,
          nome: tec.nome,
          funcao_ot: userObj?.tipo_colaborador || 'tecnico'
        };
      }),
      tipo: cronoTipo,
      context: 'nova_ot'
    });
    setShowCronometroFuncaoPopup(true);
  };

  const openStopCronoPopup = (tecnicos, tipo, cronometros) => {
    // Accept array of technicians or a single one
    const tecList = Array.isArray(tecnicos) ? tecnicos : [tecnicos];
    const tecnicosComKm = tecList.map(tec => {
      const crono = cronometros?.find(c => 
        (c.tecnico_id === (tec.tecnico_id || tec.id)) && c.tipo === tipo && c.ativo
      );
      return { ...tec, km_inicial: crono?.km_inicial || 0 };
    });
    setStopCronoData({
      tecnicos: tecnicosComKm,
      tipo,
      km_final: ''
    });
    setShowStopCronoPopup(true);
  };

  const handlePararCronometro = async (tecnico, tipo, km_final = 0) => {
    try {
      const payload = {
        tipo,
        tecnico_id: tecnico.tecnico_id || tecnico.id,
        km_final
      };
      // Se for trabalho e tiver KMs de deslocação registados, incluir
      if (tipo === 'trabalho' && workKmData.km_inicial && workKmData.km_final) {
        payload.work_km_inicial = parseFloat(workKmData.km_inicial) || 0;
        payload.work_km_final = parseFloat(workKmData.km_final) || 0;
      }
      const response = await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/cronometro/parar`, payload);
      
      toast.success(response.data.message);
      // Reset work KM data after stopping
      if (tipo === 'trabalho') {
        setWorkKmData({ km_inicial: '', km_final: '' });
      }
      fetchCronometros(selectedRelatorio.id);
      fetchRegistosTecnicos(selectedRelatorio.id);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    }
  };

  const handleCriarFsRelacionada = async () => {
    if (!selectedRelatorio) return;
    try {
      const res = await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/criar-fs-relacionada`);
      const novaFs = res.data;
      toast.success(`FS #${novaFs.numero_assistencia} criada com sucesso!`);
      // Refresh list and open the new FS
      await fetchRelatorios();
      setSelectedRelatorio(novaFs);
      setShowViewRelatorioModal(true);
    } catch (err) {
      toast.error('Erro ao criar FS relacionada');
      console.error(err);
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
        funcao_ot: 'tecnico',
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
      incluir_pausa: registo.incluir_pausa || false,
      funcao_ot: registo.funcao_ot || 'tecnico',
      entry_type: registo.tipo || registo._tipo_registo || 'trabalho',
      tecnico_id: registo.tecnico_id || '',
      tecnico_nome: registo.tecnico_nome || '',
      data: typeof registo.data === 'string' ? registo.data.substring(0, 10) : (registo.data ? new Date(registo.data).toISOString().substring(0, 10) : '')
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
      incluir_pausa: editRegistoForm.incluir_pausa,
      funcao_ot: editRegistoForm.funcao_ot,
      tipo: editRegistoForm.entry_type,
      tecnico_id: editRegistoForm.tecnico_id || undefined,
      tecnico_nome: editRegistoForm.tecnico_nome || undefined,
    };

    // Se temos hora início e fim, enviar para recalcular duração e código
    if (editRegistoForm.hora_inicio && editRegistoForm.hora_fim) {
      updatePayload.hora_inicio = editRegistoForm.hora_inicio;
      updatePayload.hora_fim = editRegistoForm.hora_fim;
      // Usar a data editada (fallback para a do registo original)
      const dataStr = editRegistoForm.data
        || (editingRegisto.data
          ? (typeof editingRegisto.data === 'string'
              ? editingRegisto.data.substring(0, 10)
              : new Date(editingRegisto.data).toISOString().substring(0, 10))
          : null);
      if (dataStr) updatePayload.data = dataStr;
    } else {
      // Sem horas, usar minutos_trabalhados e codigo existentes
      updatePayload.minutos_trabalhados = parseInt(editRegistoForm.minutos_trabalhados);
      updatePayload.codigo = editRegistoForm.codigo;
      // Ainda assim, permitir mudar a data mesmo sem alterar horas
      if (editRegistoForm.data) updatePayload.data = editRegistoForm.data;
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

  const handleAbrirContinuidade = (intervencaoId = null) => {
    if (intervencaoId) {
      setContinuidadeIds([intervencaoId]);
    } else {
      setContinuidadeIds([]);
    }
    setShowContinuidadeModal(true);
  };

  // Carrega TODOS os dados auxiliares de uma FS (usado tanto ao clicar num card como ao
  // saltar pelo breadcrumb / criar continuidade).
  const loadAllRelatorioData = async (relatorioId) => {
    if (!relatorioId) return;
    await Promise.all([
      fetchTecnicosRelatorio(relatorioId),
      fetchIntervencoesRelatorio(relatorioId),
      fetchFotografiasRelatorio(relatorioId),
      fetchAssinaturas(relatorioId),
      fetchEquipamentosOT(relatorioId),
      fetchMateriais(relatorioId),
      fetchDespesas(relatorioId),
      fetchRelatoriosAssistencia(relatorioId),
      fetchPedidosCotacao(relatorioId),
      fetchCronometros(relatorioId),
      fetchRegistosTecnicos(relatorioId),
    ]);
  };

  const handleJumpToFS = async (fsId) => {
    if (!fsId || fsId === selectedRelatorio?.id) return;
    try {
      const resp = await axios.get(`${API}/relatorios-tecnicos/${fsId}`);
      if (resp.data) {
        setSelectedRelatorio(resp.data);
        setActiveIntervencaoId(null);
        await loadAllRelatorioData(fsId);
      }
    } catch (e) {
      toast.error('Não foi possível abrir essa FS');
    }
  };

  const handleConfirmarContinuidade = async () => {
    if (!selectedRelatorio || continuidadeIds.length === 0) return;
    setSavingContinuidade(true);
    try {
      const resp = await axios.post(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/criar-continuidade`,
        { intervencao_ids: continuidadeIds }
      );
      const { new_fs_id, new_fs_numero, intervencoes_herdadas } = resp.data || {};
      toast.success(`FS #${new_fs_numero} criada com ${intervencoes_herdadas} intervenção(ões) herdadas`);
      setShowContinuidadeModal(false);
      setContinuidadeIds([]);
      // Refresh listagem
      await fetchRelatorios();
      // Abrir a nova FS com TODOS os dados
      if (new_fs_id) {
        const novaFS = await axios.get(`${API}/relatorios-tecnicos/${new_fs_id}`);
        if (novaFS.data) {
          setSelectedRelatorio(novaFS.data);
          setActiveIntervencaoId(null);
          await loadAllRelatorioData(new_fs_id);
        }
      }
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message || 'Erro';
      toast.error(`Falha ao criar continuidade: ${msg}`, { duration: 8000 });
    } finally {
      setSavingContinuidade(false);
    }
  };

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

    // Aviso: despesas sem valor_final gravado (usa valor como fallback)
    const semValorFinal = (despesas || []).filter(d => d.valor_final === null || d.valor_final === undefined);
    if (semValorFinal.length > 0) {
      toast.warning(`${semValorFinal.length} despesa(s) sem "Valor Final" gravado — o PDF usa o valor original (0% de margem).`);
    }
    
    // Preparar dados - converter tarifa IDs para valores
    const tarifasPorTecnico = {};
    const tarifasMap = {};
    if (folhaHorasData?.tarifas) {
      folhaHorasData.tarifas.forEach(t => { tarifasMap[t.id] = t.valor_por_hora; });
    }
    Object.entries(folhaHorasTarifas).forEach(([tecnicoId, tarifaIdOrValor]) => {
      if (tarifaIdOrValor) {
        const valor = tarifasMap[tarifaIdOrValor] !== undefined 
          ? tarifasMap[tarifaIdOrValor] 
          : parseFloat(tarifaIdOrValor);
        if (!isNaN(valor)) {
          tarifasPorTecnico[tecnicoId] = valor;
        }
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
          table_id: tableId,
          despesa_adjustments: {}
        },
        { responseType: 'blob', timeout: PDF_DOWNLOAD_TIMEOUT }
      );
      
      // Download do PDF
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `FolhaHoras_FS${selectedRelatorio.numero_assistencia}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('Folha de Horas gerada com sucesso!');
      setShowFolhaHorasModal(false);
    } catch (error) {
      console.error('Erro ao gerar Folha de Horas:', error);
      const msg = await extractBlobError(error);
      toast.error(`Erro ao gerar Folha de Horas: ${msg}`, { duration: 8000 });
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
    const toastId = toast.loading('A gerar PDF... 0s');
    try {
      const { blob } = await downloadFSPdfAsync({
        api: API,
        relatorioId: selectedRelatorio.id,
        axios,
        onProgress: (elapsed) => {
          toast.loading(`A gerar PDF... ${Math.round(elapsed)}s`, { id: toastId });
        },
      });

      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setShowPDFPreviewModal(true);
      toast.success('PDF pronto!', { id: toastId, duration: 2000 });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error(error?.message || 'Erro ao gerar PDF', { id: toastId, duration: 8000 });
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
    const toastId = toast.loading('A gerar PDF... 0s');
    try {
      const { blob } = await downloadFSPdfAsync({
        api: API,
        relatorioId: selectedRelatorio.id,
        axios,
        onProgress: (elapsed) => {
          toast.loading(`A gerar PDF... ${Math.round(elapsed)}s`, { id: toastId });
        },
      });

      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      toast.success('PDF aberto numa nova aba', { id: toastId, duration: 2000 });
    } catch (error) {
      console.error('Erro ao carregar PDF:', error);
      toast.error(`Erro ao carregar PDF: ${error?.message || 'desconhecido'}`, { id: toastId, duration: 8000 });
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
    const toastId = toast.loading('A carregar visualização...');
    try {
      // Fetch registos detalhados
      const registosRes = await axios.get(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/registos-tecnicos`);

      // Preparar linhas detalhadas por registo (uma linha por segmento cronométrico ou registo manual)
      const fmtHora = (iso) => {
        if (!iso) return '—';
        try {
          const d = new Date(iso);
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          return `${hh}:${mm}`;
        } catch { return '—'; }
      };
      const fmtData = (iso) => {
        if (!iso) return '—';
        const parts = String(iso).split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return iso;
      };
      const registosDetalhados = (registosRes.data || [])
        .slice()
        .sort((a, b) => {
          const da = (a.data || '') + (a.hora_inicio_segmento || '');
          const db_ = (b.data || '') + (b.hora_inicio_segmento || '');
          return da.localeCompare(db_);
        })
        .map((reg) => ({
          nome: reg.tecnico_nome || '—',
          tipo: reg.tipo || '—',
          data: fmtData(reg.data),
          inicio: fmtHora(reg.hora_inicio_segmento),
          fim: fmtHora(reg.hora_fim_segmento),
          horas: (reg.horas_arredondadas != null
            ? Number(reg.horas_arredondadas)
            : (reg.minutos_trabalhados || 0) / 60),
          km: reg.km || 0,
          codigo: reg.codigo || '—',
        }));

      // Gerar PDF (mesmo endpoint do download, para paridade absoluta)
      const { blob } = await downloadFSPdfAsync({
        api: API,
        relatorioId: selectedRelatorio.id,
        axios,
        onProgress: (elapsed) => {
          toast.loading(`A gerar PDF... ${Math.round(elapsed)}s`, { id: toastId });
        },
      });
      const url = URL.createObjectURL(blob);

      setHtmlPreviewData({
        relatorio: selectedRelatorio,
        registosDetalhados,
        pdfUrl: url,
      });
      setShowHTMLPreviewModal(true);
      toast.success('Visualização pronta!', { id: toastId, duration: 1500 });
    } catch (error) {
      console.error('Erro ao carregar visualização:', error);
      toast.error(error?.message || 'Erro ao carregar visualização', { id: toastId, duration: 6000 });
    } finally {
      setLoadingHTMLPreview(false);
    }
  };

  const openSignatureFromPreview = () => {
    // Abrir modal de assinatura em cima do preview (não fechar preview)
    setShowAssinaturaModal(true);
  };

  // Regenera o PDF do visualizador (usado após assinar) para refletir alterações
  const refreshPreviewPdf = async () => {
    if (!selectedRelatorio || !showHTMLPreviewModal) return;
    const toastId = toast.loading('A atualizar visualização...');
    try {
      const { blob } = await downloadFSPdfAsync({
        api: API,
        relatorioId: selectedRelatorio.id,
        axios,
        onProgress: (elapsed) => {
          toast.loading(`A gerar PDF... ${Math.round(elapsed)}s`, { id: toastId });
        },
      });
      const newUrl = URL.createObjectURL(blob);
      setHtmlPreviewData((prev) => {
        if (prev?.pdfUrl) {
          try { URL.revokeObjectURL(prev.pdfUrl); } catch (_) {}
        }
        return prev ? { ...prev, pdfUrl: newUrl } : prev;
      });
      toast.success('Visualização atualizada!', { id: toastId, duration: 1500 });
    } catch (error) {
      console.error('Erro ao atualizar visualização:', error);
      toast.error('Erro ao atualizar visualização', { id: toastId, duration: 4000 });
    }
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
      
      // Garantir que geral@hwi.pt está sempre presente (não selecionado por defeito)
      const HWI_EMAIL = 'geral@hwi.pt';
      const jaExiste = emails.some(e => (e.email || '').trim().toLowerCase() === HWI_EMAIL);
      if (!jaExiste) {
        emails.push({ email: HWI_EMAIL, selected: false, is_hwi: true });
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
    
    // Guardar emails e preparar seleção de documentos
    setEmailsPendentes(emailsSelecionados);
    
    // Pré-selecionar relatório e construir lista de docs disponíveis
    const docsIniciais = { relatorio: true, folha_horas: false };
    // Adicionar PCs disponíveis
    if (pedidosCotacao && pedidosCotacao.length > 0) {
      pedidosCotacao.forEach(pc => {
        docsIniciais[`pc:${pc.id}`] = false;
      });
    }
    setDocsSelecionados(docsIniciais);
    setShowFolhaHorasConfirm(true);
  };

  const handleConfirmSendEmail = async () => {
    setShowFolhaHorasConfirm(false);
    setSendingEmail(true);
    
    try {
      // Construir lista de documentos selecionados
      const documentos = Object.entries(docsSelecionados)
        .filter(([, selected]) => selected)
        .map(([key]) => key);
      
      if (documentos.length === 0) {
        toast.error('Selecione pelo menos um documento');
        setSendingEmail(false);
        return;
      }
      
      // Construir tarifas_por_tecnico e dados_extras a partir do estado da Folha de Horas
      // (paridade com handleGenerateFolhaHoras — garante que os €/h aparecem no PDF)
      const tarifasPorTecnico = {};
      const tarifasMap = {};
      if (folhaHorasData?.tarifas) {
        folhaHorasData.tarifas.forEach(t => { tarifasMap[t.id] = t.valor_por_hora; });
      }
      Object.entries(folhaHorasTarifas || {}).forEach(([tecnicoId, tarifaIdOrValor]) => {
        if (tarifaIdOrValor) {
          const valor = tarifasMap[tarifaIdOrValor] !== undefined 
            ? tarifasMap[tarifaIdOrValor] 
            : parseFloat(tarifaIdOrValor);
          if (!isNaN(valor)) {
            tarifasPorTecnico[tecnicoId] = valor;
          }
        }
      });
      const dadosExtras = {};
      Object.entries(folhaHorasExtras || {}).forEach(([chave, valores]) => {
        dadosExtras[chave] = {
          dieta: parseFloat(valores.dieta) || 0,
          portagens: parseFloat(valores.portagens) || 0,
          despesas: parseFloat(valores.despesas) || 0
        };
      });
      
      const response = await axios.post(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/enviar-pdf`,
        { 
          emails: emailsPendentes,
          documentos: documentos,
          hide_client_pcs: false,
          idioma: idiomaEmail,
          // paridade com /folha-horas-pdf — garante valores €/h e despesas corretas
          // Backend escolhe automaticamente a tabela marcada como padrão em /admin
          table_id: null,
          tarifas_por_tecnico: tarifasPorTecnico,
          dados_extras: dadosExtras,
          despesa_adjustments: {}
        },
        { timeout: 30000 }  // resposta imediata (background) — 30s é seguro
      );
      
      const { emails_enviados, emails_falhados, queued } = response.data;
      
      if (queued) {
        // Backend processa em background — informar utilizador
        toast.success(
          `${documentos.length} documento(s) em processamento para ${emails_enviados.length} email(s). Se houver erro será registado em /admin/erros.`,
          { duration: 5000 }
        );
      } else if (emails_falhados && emails_falhados.length > 0) {
        toast.warning(`Documentos enviados para ${emails_enviados.length} email(s). ${emails_falhados.length} falharam.`);
      } else {
        toast.success(`${documentos.length} documento(s) enviado(s) para ${emails_enviados.length} email(s)!`);
      }
      
      setShowEmailModal(false);
      setEmailsPendentes([]);
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
                {isMobile ? "FS's" : "FS's - Folhas de Serviço"}
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

        {/* Tabs/Sections — sidebar em desktop, tabs horizontais em mobile */}
        {isMobile ? (
          <TechnicalReportsTabs
            activeTab={activeTab}
            isMobile={isMobile}
            user={user}
            borderColor={borderColor}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            setActiveTab={setActiveTab}
            fetchAllPCs={fetchAllPCs}
            fetchRefTokens={fetchRefTokens}
          />
        ) : null}

        <div className={isMobile ? '' : 'flex gap-4 items-start'}>
          {!isMobile && (
            <TechnicalReportsTabs
              activeTab={activeTab}
              isMobile={false}
              user={user}
              borderColor={borderColor}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              setActiveTab={setActiveTab}
              fetchAllPCs={fetchAllPCs}
              fetchRefTokens={fetchRefTokens}
            />
          )}
          <div className={isMobile ? '' : 'flex-1 min-w-0'}>

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
        <ReportsSection
          activeTab={activeTab}
          isDark={isDark}
          isMobile={isMobile}
          user={user}
          borderColor={borderColor}
          bgCard={bgCard}
          loading={loading}
          relatorios={relatorios}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
          setShowAddRelatorioModal={setShowAddRelatorioModal}
          openViewRelatorioModal={openViewRelatorioModal}
          openEditRelatorioModal={openEditRelatorioModal}
          openDeleteRelatorioModal={openDeleteRelatorioModal}
          getStatusColor={getStatusColor}
          getStatusLabel={getStatusLabel}
          openStatusModal={openStatusModal}
          openRelatorioSimples={openRelatorioSimples}
        />

        {/* Facturados Section */}
        <FacturadosSection
          activeTab={activeTab}
          isDark={isDark}
          isMobile={isMobile}
          user={user}
          borderColor={borderColor}
          bgCard={bgCard}
          loading={loading}
          relatorios={relatorios}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
          openViewRelatorioModal={openViewRelatorioModal}
          openEditRelatorioModal={openEditRelatorioModal}
          openDeleteRelatorioModal={openDeleteRelatorioModal}
          getStatusColor={getStatusColor}
          getStatusLabel={getStatusLabel}
          openStatusModal={openStatusModal}
          openRelatorioSimples={openRelatorioSimples}
        />

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
                  {isMobile ? `${filteredByStatus.length} FS(s)` : `Resultados: ${filteredByStatus.length} FS(s) com status "${getStatusLabel(statusFilter)}"`}
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
                  <p className={`${textSecondary} ${isMobile ? 'text-base' : 'text-lg'}`}>Nenhuma FS encontrada com este estado</p>
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

                      {/* Equipamento */}
                      <div className={`${isMobile ? 'mb-2 pb-2' : 'mb-3 pb-3'} border-b ${borderColor}`}>
                        <p className={`text-xs ${textSecondary} mb-1`}>Equipamento</p>
                        <p className={`${isMobile ? 'text-xs' : 'text-sm'} ${textSecondary}`} data-testid="search-card-equipamento">
                          {relatorio.equipamento_display ? (
                            relatorio.equipamento_display === 'Não especificado' ? (
                              <span className={`${isDark ? 'text-gray-500' : 'text-gray-400'} italic`}>{relatorio.equipamento_display}</span>
                            ) : relatorio.equipamento_display === 'Vários' ? (
                              <span className="text-blue-400">{relatorio.equipamento_display} ({relatorio.equipamentos_count})</span>
                            ) : (
                              <span className={textPrimary}>{relatorio.equipamento_display}</span>
                            )
                          ) : (
                            <span className={`${isDark ? 'text-gray-500' : 'text-gray-400'} italic`}>Não especificado</span>
                          )}
                        </p>
                      </div>

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
                PCs são criados quando adiciona material com "Cotação" a uma FS
              </p>
            </div>
          ) : (
            <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}`}>
              {allPCs.map((pc) => (
                <div key={pc.id}>
                  <div
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
                        <span className={textSecondary}>FS:</span>
                        <span className={`${textPrimary} font-medium`}>{pc.ot_numero}</span>
                      </div>
                      
                      <div className={`flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        <User className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} text-gray-500 flex-shrink-0`} />
                        <span className={`${textPrimary} truncate`}>{pc.cliente_nome}</span>
                      </div>

                      {/* Equipamento (Marca + Modelo) — Fase 2 */}
                      {(pc.equipamento_marca || pc.equipamento_modelo) && (
                        <div className={`flex items-start gap-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                          <Settings className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} text-gray-500 flex-shrink-0 mt-0.5`} />
                          <div className="flex flex-col min-w-0 leading-tight">
                            {pc.equipamento_marca && (
                              <span className={`${textPrimary} truncate font-medium`}>{pc.equipamento_marca}</span>
                            )}
                            {pc.equipamento_modelo && (
                              <span className={`${textSecondary} truncate text-xs`}>{pc.equipamento_modelo}</span>
                            )}
                          </div>
                        </div>
                      )}

                      <div className={`flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        <Package className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} text-gray-500 flex-shrink-0`} />
                        <span className={textSecondary}>Materiais:</span>
                        <span className={`${textPrimary} font-medium`}>{pc.materiais_count || 0}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className={`flex gap-2 ${isMobile ? 'mt-2 pt-2' : 'mt-4 pt-3'} border-t ${borderColor}`}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerPCDownload(pc.id);
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
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Fornecedores Section (Admin only) — Fase 2 */}
        {activeTab === 'fornecedores' && user?.is_admin && (
          <div className={`${isDark ? 'glass-effect' : 'bg-white shadow-lg border ' + borderColor} ${isMobile ? 'p-4' : 'p-6'} rounded-xl`}>
            <FornecedoresPage />
          </div>
        )}

        {/* Referências Internas Section (Admin only) */}
        {activeTab === 'referencias' && user?.is_admin && (
        <div className={`${isDark ? 'glass-effect' : 'bg-white shadow-lg border ' + borderColor} ${isMobile ? 'p-4' : 'p-6'} rounded-xl`}>
          <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-semibold ${textPrimary} ${isMobile ? 'mb-4' : 'mb-6'} flex items-center gap-2`}>
            <Link2 className={`${isMobile ? 'w-5 h-5' : 'w-6 h-6'} text-indigo-400`} />
            Referências Internas
          </h2>

          <div className={`flex ${isMobile ? 'flex-col gap-2' : 'gap-3 items-center'} mb-4`}>
            <select
              value={refFilterStatus}
              onChange={(e) => setRefFilterStatus(e.target.value)}
              className={`${isMobile ? 'w-full' : 'w-44'} bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 text-sm`}
              data-testid="ref-filter-status"
            >
              <option value="todos">Todos</option>
              <option value="pendente">Pendentes</option>
              <option value="submetido">Submetidos</option>
            </select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                value={refFilterCliente}
                onChange={(e) => setRefFilterCliente(e.target.value)}
                placeholder="Filtrar por cliente..."
                className="bg-[#0f0f0f] border-gray-700 text-white pl-9 text-sm"
                data-testid="ref-filter-cliente"
              />
            </div>
            <Button
              onClick={fetchRefTokens}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="ref-filter-apply"
            >
              <Search className="w-4 h-4 mr-1" />
              Filtrar
            </Button>
          </div>

          {loadingRefs ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400 mx-auto"></div>
              <p className={`${textSecondary} mt-4 text-sm`}>Carregando...</p>
            </div>
          ) : refTokens.length === 0 ? (
            <div className="text-center py-8">
              <Link2 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className={`${textSecondary} text-base`}>Nenhuma referência encontrada</p>
              <p className={`${textSecondary} text-xs mt-1`}>
                Referências são criadas automaticamente ao criar FS para clientes com esta opção ativa
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {refTokens.map((ref) => {
                const isPending = !ref.used && !ref.expired;
                const isSubmitted = ref.used;
                const isExpired = ref.expired && !ref.used;

                return (
                  <div
                    key={ref.id}
                    className={`${isDark ? 'bg-[#111]' : 'bg-gray-50'} border ${
                      isSubmitted ? 'border-green-600/40' : isExpired ? 'border-red-600/30' : 'border-amber-500/30'
                    } rounded-lg ${isMobile ? 'p-3' : 'p-4'}`}
                    data-testid={`ref-item-${ref.id}`}
                  >
                    <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-bold ${textPrimary} text-sm`}>
                            FS#{ref.numero_assistencia || '?'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            isSubmitted ? 'bg-green-600/20 text-green-400' :
                            isExpired ? 'bg-red-600/20 text-red-400' :
                            'bg-amber-500/20 text-amber-400'
                          }`}>
                            {isSubmitted ? 'Submetido' : isExpired ? 'Expirado' : 'Pendente'}
                          </span>
                        </div>
                        <p className={`${textSecondary} text-sm mt-1 truncate`}>{ref.cliente_nome}</p>
                        {ref.local_intervencao && (
                          <p className={`${textSecondary} text-xs mt-0.5`}>
                            <MapPin className="w-3 h-3 inline mr-1" />{ref.local_intervencao}
                          </p>
                        )}
                        {isSubmitted && ref.referencia && (
                          <p className="text-green-400 text-sm mt-1 font-medium">
                            Ref: {ref.referencia}
                          </p>
                        )}
                        <p className={`${textSecondary} text-xs mt-1`}>
                          {ref.created_at ? new Date(ref.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </p>
                      </div>

                      <div className={`flex ${isMobile ? 'justify-end' : ''} gap-1`}>
                        {isPending && (
                          <Button
                            onClick={() => handleResendRefEmail(ref.id)}
                            size="sm"
                            variant="outline"
                            className="border-indigo-600 text-indigo-400 hover:bg-indigo-600/10 text-xs"
                            data-testid={`ref-resend-${ref.id}`}
                          >
                            <Send className="w-3 h-3 mr-1" />
                            Reenviar
                          </Button>
                        )}
                        <Button
                          onClick={() => handleDeleteRefToken(ref.id)}
                          size="sm"
                          variant="outline"
                          className="border-red-600/50 text-red-400 hover:bg-red-600/10 text-xs"
                          data-testid={`ref-delete-${ref.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}
          </div>
        </div>
      </div>

      {/* Add Relatório Modal */}
      <Dialog open={showAddRelatorioModal} onOpenChange={setShowAddRelatorioModal}>
        <DialogContent className={`${isDark ? 'bg-[#1a1a1a] border-gray-700' : 'bg-white border-gray-200'} ${textPrimary} ${isMobile ? 'max-w-[95vw] mx-2' : 'max-w-3xl'} max-h-[90vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${textPrimary}`}>
              <Plus className="w-5 h-5 text-blue-400" />
              Nova FS
            </DialogTitle>
            <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
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
                    placeholder="Deixe vazio para FS de um só dia"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Se preenchido, a FS aparecerá no calendário em todos os dias do intervalo
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
                <span className="truncate">FS #{selectedRelatorio?.numero_assistencia}</span>
                {selectedRelatorio?.status && (
                  <button
                    type="button"
                    onClick={(e) => openStatusModal(selectedRelatorio, e)}
                    title="Clique para alterar estado da FS"
                    data-testid="fs-view-status-badge"
                    className={`text-xs px-2 py-0.5 rounded hover:opacity-80 transition ${getStatusColor(selectedRelatorio.status)}`}
                  >
                    {getStatusLabel(selectedRelatorio.status)}
                  </button>
                )}
              </DialogTitle>
              {!isMobile && (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      setShowViewRelatorioModal(false);
                      openRelatorioSimples(selectedRelatorio);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full"
                    size="sm"
                    data-testid="btn-open-rs-from-view"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Relatório Simples
                  </Button>
                  <Button
                    onClick={() => {
                      setShowViewRelatorioModal(false);
                      openEditRelatorioModal(selectedRelatorio);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-full"
                    size="sm"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Editar FS
                  </Button>
                </div>
              )}
            </div>
              <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
          </DialogHeader>

          {selectedRelatorio && (
            <div className={`${isMobile ? 'space-y-3 mt-2' : 'space-y-6 mt-4'} overflow-x-hidden`}>
              {/* Status e Data + Botão Editar mobile */}
              <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`${isMobile ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'} rounded ${getStatusColor(selectedRelatorio.status)}`}>
                    {getStatusLabel(selectedRelatorio.status)}
                  </span>
                  {user?.is_admin && (
                    <Button
                      onClick={handleCriarFsRelacionada}
                      data-testid="btn-criar-fs-relacionada"
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      size="sm"
                    >
                      <Link2 className="w-3 h-3 mr-1" />
                      {isMobile ? 'Nova FS' : 'Atribuição de Nova FS'}
                    </Button>
                  )}
                </div>
                <div className={`flex items-center ${isMobile ? 'justify-between' : 'gap-2'}`}>
                  <span className={`${textSecondary} ${isMobile ? 'text-xs' : ''}`}>
                    {new Date(selectedRelatorio.data_servico).toLocaleDateString('pt-PT')}
                    {selectedRelatorio.data_fim && (
                      <span className="text-blue-400"> → {new Date(selectedRelatorio.data_fim).toLocaleDateString('pt-PT')}</span>
                    )}
                  </span>
                  {isMobile && (
                    <div className="flex gap-1">
                      <Button
                        onClick={() => {
                          setShowViewRelatorioModal(false);
                          openRelatorioSimples(selectedRelatorio);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        size="sm"
                        data-testid="btn-open-rs-from-view-mobile"
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        Relatório
                      </Button>
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
                    </div>
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
                {selectedRelatorio.referencia_interna_cliente && (
                  <p className={`text-amber-400 ${isMobile ? 'text-xs' : 'text-sm'} mt-1 font-semibold`} data-testid="ref-interna-display">
                    Ref. Interna: {selectedRelatorio.referencia_interna_cliente}
                  </p>
                )}
                {selectedRelatorio.ot_relacionada_id && (
                  <p className={`text-blue-400 ${isMobile ? 'text-xs' : 'text-sm'} mt-1 flex items-center gap-1`}>
                    <Link2 className="w-3 h-3" />
                    FS Relacionada: <span className="font-semibold" data-testid="ot-relacionada-ref">FS #{selectedRelatorio.ot_relacionada_numero}</span>
                  </p>
                )}
                {selectedRelatorio.ots_posteriores?.length > 0 && (
                  <p className={`text-amber-400 ${isMobile ? 'text-xs' : 'text-sm'} mt-1 flex items-center gap-1`}>
                    <Link2 className="w-3 h-3" />
                    FS Relacionada: {selectedRelatorio.ots_posteriores.map(ot => (
                      <span key={ot.id} className="font-semibold" data-testid="ot-posterior-ref">FS #{ot.numero_assistencia}</span>
                    )).reduce((prev, curr) => [prev, ', ', curr])}
                  </p>
                )}
              </div>

              {/* Breadcrumb da cadeia de FSs relacionadas (qualquer FS ligada por ot_relacionada_id) */}
              <FSChainBreadcrumb
                relatorioId={selectedRelatorio.id}
                onJumpTo={handleJumpToFS}
              />

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
                        <div className={`flex ${isMobile ? 'w-full' : 'flex-1'} gap-1`}>
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
                                  // Collect users to start - will open popup
                                }
                              }
                            }
                            // For start: open function popup
                            if (!hasAnyActiveTrabalho) {
                              const usersToStart = selectedUsers.filter(u => !getCronometroStatus(u, 'trabalho'));
                              if (usersToStart.length > 0) {
                                setCronometroFuncaoData({
                                  tecnicos: usersToStart.map(u => ({
                                    id: u.id,
                                    nome: u.full_name || u.username,
                                    funcao_ot: u.tipo_colaborador || 'tecnico'
                                  })),
                                  tipo: 'trabalho',
                                  context: 'existing_ot'
                                });
                                setShowCronometroFuncaoPopup(true);
                              }
                            }
                          }}
                          className={`flex-1 flex items-center justify-center gap-2 ${hasAnyActiveTrabalho ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white font-medium py-2.5 px-4 rounded-md transition-colors disabled:opacity-50 ${isMobile ? 'text-sm' : ''}`}
                          disabled={Object.values(selectedCronoUsers).filter(Boolean).length === 0}
                        >
                          {hasAnyActiveTrabalho ? <StopCircle className="w-4 h-4 flex-shrink-0" /> : <PlayCircle className="w-4 h-4 flex-shrink-0" />}
                          <span>{hasAnyActiveTrabalho ? 'Parar Trabalho' : 'Iniciar Trabalho'}</span>
                        </button>
                        {hasAnyActiveTrabalho && (
                          <button
                            onClick={() => setShowWorkKmPopup(true)}
                            className={`flex items-center justify-center bg-amber-600 hover:bg-amber-700 text-white rounded-md transition-colors ${isMobile ? 'px-3' : 'px-2.5'} ${workKmData.km_inicial && workKmData.km_final ? 'ring-2 ring-green-400' : ''}`}
                            title="Registar KMs de deslocação durante trabalho"
                            data-testid="work-km-edit-btn"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        </div>
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
                            if (hasAnyActiveViagem) {
                              // Collect ALL users with active travel and open popup once
                              const usersToStop = selectedUsers.filter(u => getCronometroStatus(u, 'viagem'));
                              if (usersToStop.length > 0) {
                                openStopCronoPopup(
                                  usersToStop.map(u => ({
                                    id: u.id,
                                    tecnico_id: u.id,
                                    tecnico_nome: u.full_name || u.username
                                  })),
                                  'viagem',
                                  cronometrosAtivos
                                );
                              }
                            } else {
                              // Start: open function popup for all selected users
                              const usersToStart = selectedUsers.filter(u => !getCronometroStatus(u, 'viagem'));
                              if (usersToStart.length > 0) {
                                setCronometroFuncaoData({
                                  tecnicos: usersToStart.map(u => ({
                                    id: u.id,
                                    nome: u.full_name || u.username,
                                    funcao_ot: u.tipo_colaborador || 'tecnico'
                                  })),
                                  tipo: 'viagem',
                                  context: 'existing_ot'
                                });
                                setShowCronometroFuncaoPopup(true);
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
                                  // Collect users to start - will open popup
                                }
                              }
                            }
                            // For start: open function popup
                            if (!hasAnyActiveOficina) {
                              const usersToStart = selectedUsers.filter(u => !getCronometroStatus(u, 'oficina'));
                              if (usersToStart.length > 0) {
                                setCronometroFuncaoData({
                                  tecnicos: usersToStart.map(u => ({
                                    id: u.id,
                                    nome: u.full_name || u.username,
                                    funcao_ot: u.tipo_colaborador || 'tecnico'
                                  })),
                                  tipo: 'oficina',
                                  context: 'existing_ot'
                                });
                                setShowCronometroFuncaoPopup(true);
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
                        const cronoOficina = getCronometroStatus(userItem, 'oficina');
                        const timerKeyTrabalho = `${userItem.id}_trabalho`;
                        const timerKeyViagem = `${userItem.id}_viagem`;
                        const timerKeyOficina = `${userItem.id}_oficina`;

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
                              {cronoOficina && (
                                <span className={`flex items-center gap-0.5 text-orange-400 font-mono ${isMobile ? 'text-[10px] px-1 py-0.5' : 'text-xs px-2 py-1'} bg-orange-900/30 rounded`}>
                                  <Wrench className={`${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'} flex-shrink-0`} />
                                  {formatTimer(timers[timerKeyOficina] || 0)}
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
                          {registosCombinados
                          .map((item) => (
                            <div key={item._key} className={`${isDark ? 'bg-gray-800/50' : 'bg-gray-100'} p-2 rounded-lg border ${borderColor}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className={`${textPrimary} text-xs font-medium truncate flex-1 mr-2`}>
                                  {item.tecnico_nome} <span className={item.funcao_ot === 'senior' ? 'text-purple-400' : item.funcao_ot === 'junior' ? 'text-yellow-400' : item.funcao_ot === 'ajudante' ? 'text-emerald-400' : 'text-cyan-400'}>({item.funcao_ot === 'senior' ? 'Téc. Sénior' : item.funcao_ot === 'junior' ? 'Téc. Júnior' : item.funcao_ot === 'ajudante' ? 'Ajudante' : 'Técnico'})</span>
                                </span>
                                <span 
                                  className={`px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 ${
                                    item._tipo_registo === 'manual' ? 'bg-gray-600/30 text-gray-300' :
                                    item._tipo_registo === 'trabalho' ? 'bg-green-600/20 text-green-400' : 
                                    item._tipo_registo === 'oficina' ? 'bg-orange-600/20 text-orange-400' :
                                    'bg-blue-600/20 text-blue-400'
                                  }`}
                                >
                                  {item._tipo_registo === 'manual' ? 'M' : item._tipo_registo === 'trabalho' ? 'T' : item._tipo_registo === 'oficina' ? 'O' : 'V'}
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
                                {(() => {
                                  const kmVal = item._source === 'tecnico'
                                    ? (item.kms_deslocacao || Math.max(0, (item.kms_final || 0) - (item.kms_inicial || 0)) + Math.max(0, (item.kms_final_volta || 0) - (item.kms_inicial_volta || 0)))
                                    : (item.km || 0);
                                  return (
                                    <span className={`${kmVal > 0 ? 'text-blue-400' : 'text-gray-500'} font-medium`}>{kmVal} km</span>
                                  );
                                })()}
                                <span className={`${textPrimary} font-medium`}>
                                  {(() => {
                                    const horas = item.horas_arredondadas || 0;
                                    const h = Math.floor(horas);
                                    const m = Math.round((horas - h) * 60);
                                    return `${h}h${m > 0 ? m + 'm' : ''}`;
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
                            <th className={`text-left py-2 px-2 ${textSecondary}`}>Colaborador</th>
                            <th className={`text-center py-2 px-2 ${textSecondary}`}>Função</th>
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
                          {registosCombinados
                          .map((item) => (
                            <tr key={item._key} className={`border-b ${isDark ? 'border-gray-800 hover:bg-gray-800/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                              <td className={`py-2 px-2 ${textPrimary}`}>{item.tecnico_nome}</td>
                              <td className="py-2 px-2 text-center">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  item.funcao_ot === 'senior' ? 'bg-purple-600/20 text-purple-400' :
                                  item.funcao_ot === 'junior' ? 'bg-yellow-600/20 text-yellow-400' : item.funcao_ot === 'ajudante' ? 'bg-emerald-600/20 text-emerald-400' : 'bg-cyan-600/20 text-cyan-400'
                                }`}>
                                  {item.funcao_ot === 'senior' ? 'Téc. Sénior' : item.funcao_ot === 'junior' ? 'Téc. Júnior' : item.funcao_ot === 'ajudante' ? 'Ajudante' : 'Técnico'}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-center">
                                <span 
                                  className={`px-2 py-1 rounded text-xs cursor-pointer hover:opacity-80 transition-opacity ${
                                    item._tipo_registo === 'manual' ? 'bg-gray-600/30 text-gray-300 hover:bg-gray-600/50' :
                                    item._tipo_registo === 'trabalho' ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30' : 
                                    item._tipo_registo === 'oficina' ? 'bg-orange-600/20 text-orange-400 hover:bg-orange-600/30' :
                                    'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                                  }`}
                                  onClick={(e) => openTipoModal(item, e)}
                                >
                                  {item._tipo_registo === 'manual' ? 'Manual' : 
                                   item._tipo_registo === 'trabalho' ? 'Trabalho' : 
                                   item._tipo_registo === 'oficina' ? 'Oficina' : 'Viagem'}
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
                                  const horas = item.horas_arredondadas || 0;
                                  const h = Math.floor(horas);
                                  const m = Math.round((horas - h) * 60);
                                  return `${h}h ${m > 0 ? m + 'min' : ''}`;
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

              {/* ═══════════════ INTERVENÇÕES (TABS) ═══════════════ */}
              <div className={`${bgCardAlt} ${isMobile ? 'p-3' : 'p-4'} rounded-lg border ${borderColor}`}>
                {/* Tab Header */}
                <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-4'}`}>
                  <h4 className={`text-blue-400 font-semibold flex items-center gap-2 ${isMobile ? 'text-sm' : ''}`}>
                    <FileText className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} />
                    Intervenções ({intervencoes.length})
                  </h4>
                  <div className="flex items-center gap-1.5">
                    {intervencoes.some(i => i.ordem_manual !== null && i.ordem_manual !== undefined) && (
                      <Button
                        onClick={handleResetIntervencoesOrder}
                        size="sm"
                        variant="outline"
                        disabled={reorderingIntervs}
                        className={`border-gray-600 text-gray-300 hover:bg-gray-700 ${isMobile ? 'text-xs px-2 py-1' : ''}`}
                        data-testid="btn-reset-interv-order"
                        title="Repor ordem cronológica"
                      >
                        <ArrowUpDown className={`${isMobile ? 'w-3 h-3 mr-0.5' : 'w-3.5 h-3.5 mr-1'}`} />
                        {isMobile ? 'Data' : 'Ordenar por data'}
                      </Button>
                    )}
                    <Button
                      onClick={() => setShowAddIntervencaoModal(true)}
                      size="sm"
                      className={`bg-green-500 hover:bg-green-600 ${isMobile ? 'text-xs px-2 py-1' : ''}`}
                      data-testid="btn-add-intervencao"
                    >
                      <Plus className={`${isMobile ? 'w-3 h-3 mr-0.5' : 'w-4 h-4 mr-1'}`} />
                      {isMobile ? 'Nova' : 'Adicionar Intervenção'}
                    </Button>
                  </div>
                </div>

                {/* Tab Bar */}
                {intervencoes.length > 0 ? (
                  <>
                    <div className={`flex gap-1 overflow-x-auto pb-2 mb-3 border-b ${borderColor}`}>
                      {intervencoes.map((interv, idx) => {
                        const isActive = activeIntervencaoId === interv.id;
                        const eqInterv = equipamentosOT.find(e => e.id === interv.equipamento_id);
                        const isHerdada = !!interv.herdada_de_intervencao_id;
                        const isDragging = dragIntervIdx === idx;
                        const isDragOver = dragOverIntervIdx === idx && dragIntervIdx !== null && dragIntervIdx !== idx;
                        const tabBg = isHerdada
                          ? (isActive
                              ? 'bg-red-600 text-white ring-2 ring-red-300'
                              : 'bg-red-600 text-white hover:bg-red-500')
                          : isActive
                            ? 'bg-blue-600 text-white border-b-2 border-blue-400'
                            : `${isDark ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`;
                        return (
                          <div
                            key={interv.id}
                            data-testid={`tab-intervencao-${idx}`}
                            draggable={!isHerdada}
                            onDragStart={(e) => {
                              if (isHerdada) return;
                              setDragIntervIdx(idx);
                              e.dataTransfer.effectAllowed = 'move';
                              try { e.dataTransfer.setData('text/plain', interv.id); } catch (_) {}
                            }}
                            onDragOver={(e) => {
                              if (dragIntervIdx === null || isHerdada) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              if (dragOverIntervIdx !== idx) setDragOverIntervIdx(idx);
                            }}
                            onDragLeave={() => {
                              if (dragOverIntervIdx === idx) setDragOverIntervIdx(null);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (dragIntervIdx === null || dragIntervIdx === idx || isHerdada) {
                                setDragIntervIdx(null);
                                setDragOverIntervIdx(null);
                                return;
                              }
                              const from = dragIntervIdx;
                              const to = idx;
                              const newList = [...intervencoes];
                              const [moved] = newList.splice(from, 1);
                              newList.splice(to, 0, moved);
                              setDragIntervIdx(null);
                              setDragOverIntervIdx(null);
                              handleReorderIntervencoes(newList);
                            }}
                            onDragEnd={() => {
                              setDragIntervIdx(null);
                              setDragOverIntervIdx(null);
                            }}
                            className={`flex-shrink-0 rounded-t-lg text-xs font-medium transition-all flex items-stretch ${tabBg} ${!isHerdada ? 'cursor-move' : ''} ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'ring-2 ring-emerald-400' : ''}`}
                          >
                            <button
                              type="button"
                              onClick={() => setActiveIntervencaoId(interv.id)}
                              className="px-3 py-2 text-left"
                              data-testid={`tab-intervencao-btn-${idx}`}
                            >
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3 h-3" />
                                {new Date(interv.data_intervencao).toLocaleDateString('pt-PT')}
                                {isHerdada && (
                                  <span className="text-[10px] uppercase font-bold ml-1">
                                    herdada{interv.herdada_de_fs_numero ? ` #${interv.herdada_de_fs_numero}` : ''}
                                  </span>
                                )}
                              </div>
                              {eqInterv && (
                                <div className="text-[10px] mt-0.5 opacity-70 truncate max-w-[120px]">
                                  {eqInterv.tipologia || eqInterv.marca}
                                </div>
                              )}
                            </button>
                            {!isHerdada && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveIntervencaoId(interv.id);
                                    handleAbrirContinuidade(interv.id);
                                  }}
                                  title="Criar FS de continuidade desta intervenção"
                                  data-testid={`btn-continuidade-tab-${idx}`}
                                  className={`px-2 flex items-center justify-center transition-colors ${
                                    isActive
                                      ? 'hover:bg-blue-700'
                                      : (isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200')
                                  }`}
                                >
                                  <ArrowRightCircle className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIntervencaoToDelete(interv);
                                  }}
                                  title="Apagar esta intervenção"
                                  data-testid={`btn-close-tab-${idx}`}
                                  className={`px-2 flex items-center justify-center transition-colors rounded-tr-lg hover:bg-red-600 hover:text-white ${
                                    isActive
                                      ? 'text-white/80'
                                      : (isDark ? 'text-gray-400' : 'text-gray-500')
                                  }`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Tab Content */}
                    {(() => {
                      const activeInterv = intervencoes.find(i => i.id === activeIntervencaoId);
                      if (!activeInterv) return (
                        <p className="text-gray-500 text-sm text-center py-4">Selecione uma intervenção acima</p>
                      );

                      const isHerdadaAtiva = !!activeInterv.herdada_de_intervencao_id;
                      const activeEq = equipamentosOT.find(e => e.id === activeInterv.equipamento_id);
                      // Equipamentos associados a esta intervenção via intervencao_id
                      const intervEqs = equipamentosOT.filter(e => e.intervencao_id === activeInterv.id && e.id !== activeInterv.equipamento_id);
                      // Equipamentos não associados a nenhuma intervenção (mostrar na primeira aba)
                      const isFirstInterv = intervencoes[0]?.id === activeInterv.id;
                      const isFirstIntervOnDate = intervencoes.findIndex(i => i.data_intervencao?.split('T')[0] === activeInterv.data_intervencao?.split('T')[0]) === intervencoes.indexOf(activeInterv);
                      const assignedEqIds = new Set(intervencoes.map(i => i.equipamento_id).filter(Boolean));
                      const allIntervEqIds = new Set(equipamentosOT.filter(e => e.intervencao_id).map(e => e.id));
                      const unassignedEqs = isFirstInterv ? equipamentosOT.filter(e => !assignedEqIds.has(e.id) && !allIntervEqIds.has(e.id)) : [];
                      const intervDate = activeInterv.data_intervencao?.split('T')[0];

                      const intervFotos = fotografias.filter(f => {
                        if (f.intervencao_id) return f.intervencao_id === activeInterv.id;
                        // Fotos sem intervencao_id (legadas) aparecem APENAS na primeira intervenção
                        return isFirstInterv;
                      });
                      const intervMateriais = materiais.filter(m => {
                        if (m.intervencao_id) return m.intervencao_id === activeInterv.id;
                        return isFirstInterv;
                      });
                      const intervRelAssist = relatoriosAssistencia.filter(r => {
                        if (r.intervencao_id) return r.intervencao_id === activeInterv.id;
                        // Legado: associar por data à primeira intervenção dessa data
                        if (r.data_intervencao === intervDate) return isFirstIntervOnDate;
                        return isFirstInterv && !intervencoes.some(i => i.data_intervencao?.split('T')[0] === r.data_intervencao);
                      });
                      const intervAssinaturas = assinaturas.filter(a => {
                        const aDate = a.data_assinatura?.split('T')[0];
                        return aDate === intervDate;
                      });

                      return (
                        <div className="space-y-4">
                          {/* Banner de aba herdada (read-only) */}
                          {isHerdadaAtiva && (
                            <div
                              className="p-2.5 rounded-md bg-red-900/20 border border-red-500/40 flex items-center gap-2 text-xs"
                              data-testid="intervencao-herdada-readonly-banner"
                            >
                              <Link2 className="w-4 h-4 text-red-400 flex-shrink-0" />
                              <span className="text-red-300">
                                Esta intervenção foi <span className="font-semibold">herdada da FS #{activeInterv.herdada_de_fs_numero || '—'}</span> — visualização apenas, não é editável.
                              </span>
                            </div>
                          )}

                          {/* Header da intervenção ativa com ações */}
                          <div className={`flex items-center justify-between p-2 ${isDark ? 'bg-blue-900/20' : 'bg-blue-50'} rounded border ${isDark ? 'border-blue-800/30' : 'border-blue-200'}`}>
                            <div className="flex items-center gap-2">
                              <span className={`${textPrimary} font-semibold ${isMobile ? 'text-xs' : 'text-sm'}`}>
                                {new Date(activeInterv.data_intervencao).toLocaleDateString('pt-PT')}
                              </span>
                            </div>
                            {!isHerdadaAtiva && (
                              <div className="flex gap-1">
                                <Button onClick={() => openEditIntervencaoModal(activeInterv)} variant="outline" size="sm" className={`${isDark ? 'border-gray-600 hover:border-blue-500' : 'border-gray-300'} hover:bg-blue-500/10 ${isMobile ? 'p-1 h-6 w-6' : 'p-2'}`}>
                                  <Edit className={`${isMobile ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'}`} />
                                </Button>
                                <Button onClick={() => setIntervencaoToDelete(activeInterv)} variant="outline" size="sm" className="border-gray-600 hover:border-red-500 hover:bg-red-500/10 p-2" data-testid="btn-delete-intervencao">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* 1. Motivo */}
                          <div>
                            <p className="text-xs text-gray-500 mb-1 font-medium">Motivo da Assistência</p>
                            <p className={`${textPrimary} ${isMobile ? 'text-xs' : 'text-sm'}`}>{activeInterv.motivo_assistencia || <span className="text-gray-500 italic">Sem motivo definido</span>}</p>
                          </div>

                          {/* 2. Equipamento */}
                          <div className={`p-2 ${activeEq || intervEqs.length > 0 || unassignedEqs.length > 0 ? 'bg-purple-500/10 border border-purple-500/30' : `${bgCard} border ${borderColor}`} rounded`}>
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs text-purple-400 flex items-center gap-1 font-medium">
                                <Settings className="w-3 h-3" /> Equipamento {!activeEq && intervEqs.length === 0 && unassignedEqs.length === 0 ? '(Nenhum)' : ''}
                              </p>
                              {!isHerdadaAtiva && (
                                <Button
                                  onClick={() => openAddEquipamentoModal(activeInterv.id)}
                                  size="sm" variant="ghost" className="text-purple-400 hover:text-purple-300 h-6 text-xs px-2"
                                  data-testid="btn-add-equipamento"
                                >
                                  <Plus className="w-3 h-3 mr-0.5" /> Adicionar
                                </Button>
                              )}
                            </div>
                            {activeEq && (
                              <p className="text-sm text-purple-300">
                                {activeEq.tipologia && `${activeEq.tipologia} - `}{activeEq.marca} {activeEq.modelo}
                                {activeEq.numero_serie && <span className="text-purple-400/60 ml-2 text-xs">S/N: {activeEq.numero_serie}</span>}
                              </p>
                            )}
                            {[...intervEqs, ...unassignedEqs].map(eq => (
                              <div key={eq.id} className="flex items-center justify-between mt-1">
                                <p className="text-sm text-purple-300">
                                  {eq.tipologia && `${eq.tipologia} - `}{eq.marca} {eq.modelo}
                                  {eq.numero_serie && <span className="text-purple-400/60 ml-2 text-xs">S/N: {eq.numero_serie}</span>}
                                </p>
                                {!isHerdadaAtiva && (
                                  <Button onClick={() => handleDeleteEquipamento(eq.id)} size="sm" variant="ghost" className="text-red-400 hover:text-red-300 h-5 w-5 p-0">
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* 3. Relatório de Assistência */}
                          <div className={`${bgCard} p-3 rounded border ${borderColor}`}>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-orange-400 font-medium flex items-center gap-1">
                                <FileText className="w-3 h-3" /> Relatório de Assistência ({intervRelAssist.length})
                              </p>
                              {!isHerdadaAtiva && (
                                <Button
                                  onClick={() => {
                                    setRelAssistFormData({ texto: '', intervencao_id: activeInterv.id, equipamento_ids: activeInterv.equipamento_id ? [activeInterv.equipamento_id] : [], data_intervencao: intervDate || new Date().toISOString().split('T')[0] });
                                    setShowAddRelAssistModal(true);
                                  }}
                                  size="sm" variant="ghost" className="text-orange-400 hover:text-orange-300 h-6 text-xs px-2"
                                >
                                  <Plus className="w-3 h-3 mr-0.5" /> Adicionar
                                </Button>
                              )}
                            </div>
                            {intervRelAssist.length > 0 ? intervRelAssist.map(item => (
                              <div key={item.id} className={`${bgCardAlt} p-2 rounded border ${borderColor} mb-2`}>
                                <div className="flex justify-between items-start">
                                  <p className={`${textPrimary} ${isMobile ? 'text-xs' : 'text-sm'} whitespace-pre-wrap flex-1`}>{item.texto}</p>
                                  {!isHerdadaAtiva && (
                                    <div className="flex gap-1 ml-2 shrink-0">
                                      <Button onClick={() => openEditRelAssist(item)} variant="ghost" size="sm" className="text-blue-400 p-1 h-6 w-6"><Edit className="w-3 h-3" /></Button>
                                      <Button onClick={() => handleDeleteRelAssist(item.id)} variant="ghost" size="sm" className="text-red-400 p-1 h-6 w-6"><Trash2 className="w-3 h-3" /></Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )) : <p className="text-gray-500 text-xs text-center py-2">Sem relatório</p>}
                          </div>

                          {/* 4. Fotografias */}
                          <div className={`${bgCard} p-3 rounded border ${borderColor}`}>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-blue-400 font-medium flex items-center gap-1">
                                <Camera className="w-3 h-3" /> Fotografias ({intervFotos.length})
                              </p>
                              {!isHerdadaAtiva && (
                                <div className="flex items-center gap-1">
                                  {fotografias.length > 1 && (
                                    <Button
                                      onClick={openReorganizeFotosModal}
                                      size="sm" variant="ghost" className="text-purple-400 hover:text-purple-300 h-6 text-xs px-2"
                                      title="Reorganizar todas as fotografias da FS (arrastar)"
                                      data-testid="btn-reorganizar-fotos"
                                    >
                                      <ArrowUpDown className="w-3 h-3 mr-0.5" /> Reorganizar
                                    </Button>
                                  )}
                                  <Button
                                    onClick={() => {
                                      setUploadIntervencaoId(activeInterv.id);
                                      document.getElementById('foto-upload-input')?.click();
                                    }}
                                    size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300 h-6 text-xs px-2"
                                    id="foto-add-btn-hidden-trigger"
                                    style={{ display: 'none' }}
                                  >
                                    <Plus className="w-3 h-3 mr-0.5" /> Adicionar
                                  </Button>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300 h-6 text-xs px-2"
                                        data-testid="btn-add-foto-menu"
                                      >
                                        <Plus className="w-3 h-3 mr-0.5" /> Adicionar
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="bg-[#1a1a1a] border-gray-700 text-white">
                                      <DropdownMenuItem
                                        className="cursor-pointer focus:bg-blue-500/20"
                                        onClick={async () => {
                                          setUploadIntervencaoId(activeInterv.id);
                                          // Verifica ligação OneDrive on-demand
                                          let connected = oneDriveConnected;
                                          try {
                                            const { data } = await axios.get(`${API}/onedrive/status`);
                                            connected = !!data.connected;
                                            setOneDriveConnected(connected);
                                          } catch (_) { /* ignore */ }
                                          setCameraToOneDrive(connected);
                                          setShowCameraCapture(true);
                                        }}
                                        data-testid="btn-add-foto-camera"
                                      >
                                        <Camera className="w-3.5 h-3.5 mr-2 text-blue-400" />
                                        <div className="flex flex-col">
                                          <span>Câmara</span>
                                          {oneDriveConnected && (
                                            <span className="text-[10px] text-blue-300/70">↳ cópia no OneDrive</span>
                                          )}
                                        </div>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="cursor-pointer focus:bg-blue-500/20"
                                        onClick={() => {
                                          setUploadIntervencaoId(activeInterv.id);
                                          document.getElementById('foto-upload-input')?.click();
                                        }}
                                        data-testid="btn-add-foto-files"
                                      >
                                        <FolderOpen className="w-3.5 h-3.5 mr-2 text-blue-400" /> Ficheiros
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="cursor-pointer focus:bg-blue-500/20"
                                        onClick={() => {
                                          setUploadIntervencaoId(activeInterv.id);
                                          setShowOneDrivePicker(true);
                                        }}
                                        data-testid="btn-add-foto-onedrive"
                                      >
                                        <CloudIcon className="w-3.5 h-3.5 mr-2 text-blue-400" /> OneDrive
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              )}
                            </div>
                            {intervFotos.length > 0 ? (
                              <div className="grid grid-cols-3 gap-2">
                                {intervFotos.map(foto => (
                                  <div key={foto.id} className="relative group">
                                    <img
                                      src={`${API}/relatorios-tecnicos/${selectedRelatorio.id}/fotografias/${foto.id}/image?thumb=true`}
                                      alt={foto.descricao || 'Foto'}
                                      className="w-full h-20 object-cover rounded cursor-pointer"
                                      loading="lazy"
                                      onClick={() => {
                                        setSelectedFotoUrl(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/fotografias/${foto.id}/image`);
                                        setShowFotoPreviewModal(true);
                                      }}
                                    />
                                    {/* Badge de estado OneDrive */}
                                    {foto.onedrive_sync_status === 'synced' && (
                                      <span
                                        className="absolute bottom-0.5 left-0.5 bg-emerald-600/90 text-white rounded-full p-0.5 shadow"
                                        title={`Sincronizado com OneDrive: ${foto.onedrive_path || ''}`}
                                        data-testid={`foto-synced-${foto.id}`}
                                      >
                                        <CloudIcon className="w-3 h-3" />
                                      </span>
                                    )}
                                    {(foto.onedrive_sync_status === 'pending' || foto.onedrive_sync_status === 'failed') && (
                                      <span
                                        className="absolute bottom-0.5 left-0.5 bg-amber-500/90 text-white rounded-full px-1 py-0.5 shadow text-[9px] font-semibold"
                                        title="A aguardar sincronização com OneDrive"
                                        data-testid={`foto-pending-${foto.id}`}
                                      >
                                        ⏳
                                      </span>
                                    )}
                                    {!isHerdadaAtiva && (
                                      <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                                        <Button onClick={() => openEditFotoModal(foto)} size="sm" className="bg-blue-600/80 hover:bg-blue-700 p-0.5 h-5 w-5" data-testid={`edit-foto-${foto.id}`}><Edit className="w-3 h-3" /></Button>
                                        {intervencoes.length > 1 && (
                                          <select
                                            className="bg-gray-800/90 text-white text-[9px] h-5 rounded border border-gray-600 px-0.5 cursor-pointer"
                                            value=""
                                            onChange={(e) => {
                                              if (e.target.value) handleMoveItemToIntervention('foto', foto.id, e.target.value);
                                            }}
                                            title="Mover para outra intervenção"
                                            data-testid={`move-foto-${foto.id}`}
                                          >
                                            <option value="">↔</option>
                                            {intervencoes.filter(i => i.id !== activeInterv.id).map(i => (
                                              <option key={i.id} value={i.id}>
                                                {new Date(i.data_intervencao).toLocaleDateString('pt-PT', {day:'2-digit',month:'2-digit'})}
                                              </option>
                                            ))}
                                          </select>
                                        )}
                                        <Button onClick={() => handleDeleteFoto(foto.id)} size="sm" className="bg-red-600/80 hover:bg-red-700 p-0.5 h-5 w-5" data-testid={`delete-foto-${foto.id}`}><Trash2 className="w-3 h-3" /></Button>
                                      </div>
                                    )}
                                    {foto.descricao && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{foto.descricao}</p>}
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-gray-500 text-xs text-center py-2">Sem fotografias</p>}
                          </div>

                          {/* 5. Material */}
                          <div className={`${bgCard} p-3 rounded border ${borderColor}`}>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-blue-400 font-medium flex items-center gap-1">
                                <Package className="w-3 h-3" /> Material ({intervMateriais.length})
                              </p>
                              {!isHerdadaAtiva && (
                                <Button
                                  onClick={() => {
                                    setAddMaterialIntervencaoId(activeInterv.id);
                                    setSelectedPCIdForMaterial(null);
                                    if (selectedRelatorio) fetchPedidosCotacao(selectedRelatorio.id);
                                    setMaterialFormData({ descricao: '', quantidade: '', unidade: 'Un', fornecido_por: 'Cliente', data_utilizacao: new Date().toISOString().split('T')[0] });
                                    setShowAddMaterialModal(true);
                                  }}
                                  size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300 h-6 text-xs px-2"
                                >
                                  <Plus className="w-3 h-3 mr-0.5" /> Adicionar
                                </Button>
                              )}
                            </div>
                            {intervMateriais.length > 0 ? (
                              <div className="space-y-1.5">
                                {intervMateriais.map(material => (
                                  <div key={material.id} className="flex items-center justify-between p-2 bg-gray-800 rounded border border-gray-700">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-white text-sm font-medium truncate">{material.descricao}</p>
                                      <div className="flex gap-2 mt-0.5 text-xs text-gray-400 flex-wrap">
                                        <span>Qtd: {material.quantidade} {material.unidade || 'Un'}</span>
                                        <span className={`px-1.5 py-0 rounded ${material.fornecido_por === 'Cliente' ? 'bg-green-600/20 text-green-400' : material.fornecido_por === 'HWI' ? 'bg-blue-600/20 text-blue-400' : 'bg-yellow-600/20 text-yellow-400'}`}>{material.fornecido_por}</span>
                                        {material.posicao && <span className="text-yellow-400">Posição: {material.posicao}</span>}
                                        {material.codigo && <span className="text-yellow-400">Código: {material.codigo}</span>}
                                      </div>
                                    </div>
                                    {!isHerdadaAtiva && (
                                      <div className="flex gap-1 ml-2">
                                        <Button onClick={() => openEditMaterialModal(material)} size="sm" variant="ghost" className="text-blue-400 p-1 h-6 w-6"><Edit className="w-3 h-3" /></Button>
                                        {intervencoes.length > 1 && (
                                          <select
                                            className="bg-gray-800 text-white text-[9px] h-6 rounded border border-gray-600 px-0.5 cursor-pointer"
                                            value=""
                                            onChange={(e) => {
                                              if (e.target.value) handleMoveItemToIntervention('material', material.id, e.target.value);
                                            }}
                                            title="Mover para outra intervenção"
                                            data-testid={`move-material-${material.id}`}
                                          >
                                          <option value="">↔</option>
                                          {intervencoes.filter(i => i.id !== activeInterv.id).map(i => (
                                            <option key={i.id} value={i.id}>
                                              {new Date(i.data_intervencao).toLocaleDateString('pt-PT', {day:'2-digit',month:'2-digit'})}
                                            </option>
                                          ))}
                                        </select>
                                        )}
                                        <Button onClick={() => handleDeleteMaterial(material.id)} size="sm" variant="ghost" className="text-red-400 p-1 h-6 w-6"><Trash2 className="w-3 h-3" /></Button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-gray-500 text-xs text-center py-2">Sem material</p>}
                          </div>

                          {/* 6. Assinaturas (por data) */}
                          <div className={`${bgCard} p-3 rounded border ${borderColor}`}>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-blue-400 font-medium flex items-center gap-1">
                                <PenTool className="w-3 h-3" /> Assinaturas ({intervAssinaturas.length})
                              </p>
                              {!isHerdadaAtiva && (
                                <Button
                                  onClick={() => setShowAssinaturaModal(true)}
                                  size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300 h-6 text-xs px-2"
                                >
                                  <Plus className="w-3 h-3 mr-0.5" /> Assinar
                                </Button>
                              )}
                            </div>
                            {intervAssinaturas.length > 0 ? (
                              <div className="space-y-2">
                                {intervAssinaturas.map(assinatura => (
                                  <div key={assinatura.id} className="p-2 bg-gray-800 rounded border border-gray-700">
                                    {editingAssinaturaNome === assinatura.id ? (
                                      <div className="space-y-2">
                                        <div className="grid grid-cols-2 gap-2">
                                          <Input
                                            value={editingNomeData.primeiro_nome}
                                            onChange={(e) => setEditingNomeData(prev => ({ ...prev, primeiro_nome: e.target.value }))}
                                            placeholder="Primeiro Nome"
                                            className="bg-gray-900 border-gray-600 text-white text-xs h-7"
                                            data-testid="edit-sig-first-name"
                                          />
                                          <Input
                                            value={editingNomeData.ultimo_nome}
                                            onChange={(e) => setEditingNomeData(prev => ({ ...prev, ultimo_nome: e.target.value }))}
                                            placeholder="Apelido"
                                            className="bg-gray-900 border-gray-600 text-white text-xs h-7"
                                            data-testid="edit-sig-last-name"
                                          />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <Input
                                            type="date"
                                            value={editingAssinaturaData.date}
                                            onChange={(e) => setEditingAssinaturaData(prev => ({ ...prev, date: e.target.value }))}
                                            className="bg-gray-900 border-gray-600 text-white text-xs h-7"
                                            data-testid="edit-sig-date"
                                          />
                                          <Input
                                            type="time"
                                            value={editingAssinaturaData.time}
                                            onChange={(e) => setEditingAssinaturaData(prev => ({ ...prev, time: e.target.value }))}
                                            className="bg-gray-900 border-gray-600 text-white text-xs h-7"
                                            data-testid="edit-sig-time"
                                          />
                                        </div>
                                        <div className="flex gap-1 justify-end">
                                          <Button onClick={() => { setEditingAssinaturaNome(null); setEditingAssinaturaDesktop(null); }} size="sm" variant="ghost" className="text-gray-400 h-6 text-xs">Cancelar</Button>
                                          <Button
                                            onClick={async () => {
                                              const nomeCompleto = `${editingNomeData.primeiro_nome} ${editingNomeData.ultimo_nome}`.trim();
                                              const updateData = {
                                                primeiro_nome: editingNomeData.primeiro_nome,
                                                ultimo_nome: editingNomeData.ultimo_nome,
                                                assinado_por: nomeCompleto,
                                              };
                                              if (editingAssinaturaData.date && editingAssinaturaData.time) {
                                                updateData.data_assinatura = new Date(`${editingAssinaturaData.date}T${editingAssinaturaData.time}`).toISOString();
                                              } else if (editingAssinaturaData.date) {
                                                updateData.data_assinatura = new Date(`${editingAssinaturaData.date}T00:00`).toISOString();
                                              }
                                              try {
                                                await axios.put(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinaturas/${assinatura.id}`, updateData);
                                                toast.success('Assinatura atualizada!');
                                                setEditingAssinaturaNome(null);
                                                setEditingAssinaturaDesktop(null);
                                                await fetchAssinaturas(selectedRelatorio.id);
                                              } catch (err) { toast.error('Erro ao atualizar'); }
                                            }}
                                            size="sm" className="bg-blue-600 hover:bg-blue-700 h-6 text-xs"
                                            data-testid="save-sig-edit"
                                          >
                                            Guardar
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-3">
                                        {assinatura.assinatura_base64 && (
                                          <img src={`data:image/png;base64,${assinatura.assinatura_base64}`} alt="Assinatura" className="h-10 w-20 object-contain bg-white rounded" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <p className="text-white text-sm font-medium truncate">{assinatura.assinado_por}</p>
                                          <p className="text-gray-400 text-xs">{new Date(assinatura.data_assinatura).toLocaleString('pt-PT')}</p>
                                        </div>
                                        {!isHerdadaAtiva && (
                                          <div className="flex gap-1">
                                            <Button onClick={() => { setSignatureToCopy(assinatura); setCopySignatureModalOpen(true); }} variant="ghost" size="sm" className="text-emerald-400 p-1 h-6 w-6" data-testid={`copy-sig-${assinatura.id}`} title="Copiar para outra FS"><CopyIcon className="w-3 h-3" /></Button>
                                            <Button onClick={() => handleEditAssinatura(assinatura)} variant="ghost" size="sm" className="text-blue-400 p-1 h-6 w-6" data-testid={`edit-sig-${assinatura.id}`}><Edit className="w-3 h-3" /></Button>
                                            <Button onClick={() => handleDeleteAssinatura(assinatura.id)} variant="ghost" size="sm" className="text-red-400 p-1 h-6 w-6"><Trash2 className="w-3 h-3" /></Button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-gray-500 text-xs text-center py-2">Sem assinaturas nesta data</p>}
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">Nenhuma intervenção registada</p>
                    <p className="text-gray-500 text-xs mt-1">Clique "Adicionar Intervenção" para começar</p>
                  </div>
                )}
              </div>

              {/* Hidden file input for photo upload (suporta multi-selecção) */}
              <input
                id="foto-upload-input"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  await handleUploadPhotos(files, { mirrorToOneDrive: cameraToOneDrive });
                  setCameraToOneDrive(false);
                  e.target.value = '';
                }}
              />

              {/* OneDrive picker modal */}
              <OneDrivePickerModal
                open={showOneDrivePicker}
                onOpenChange={setShowOneDrivePicker}
                onPick={async (files) => { await handleUploadPhotos(files); }}
              />

              {/* Câmara in-app (grava direto para FS + OneDrive, sem passar pela galeria do telemóvel) */}
              <CameraCaptureModal
                open={showCameraCapture}
                onOpenChange={setShowCameraCapture}
                onCapture={async (files) => {
                  await handleUploadPhotos(files, { mirrorToOneDrive: cameraToOneDrive });
                }}
              />

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
                    {despesas.map((despesa) => {
                      const isPago = (despesa.status || 'pendente') === 'pago';
                      return (
                      <div
                        key={despesa.id}
                        className={`flex flex-col gap-2 p-3 rounded-lg border ${isPago ? 'bg-emerald-900/10 border-emerald-800/50' : 'bg-gray-800 border-gray-700'}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white font-medium text-sm truncate">{despesa.descricao}</p>
                            <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                              despesa.tipo === 'portagens' ? 'bg-orange-600/20 text-orange-400' :
                              despesa.tipo === 'combustivel' ? 'bg-red-600/20 text-red-400' :
                              despesa.tipo === 'ferramentas' ? 'bg-blue-600/20 text-blue-400' :
                              'bg-gray-600/20 text-gray-400'
                            }`}>
                              {tiposDespesa.find(t => t.value === despesa.tipo)?.label || 'Outras'}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${isPago ? 'bg-emerald-600/25 text-emerald-300' : 'bg-amber-600/25 text-amber-300'}`} data-testid={`despesa-status-${despesa.id}`}>
                              {isPago ? '✓ Pago' : 'Pendente'}
                            </span>
                            {despesa.factura_data && (
                              <span className="text-emerald-400 text-xs flex-shrink-0">📎 Factura</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-400">
                            <span className="text-emerald-400 font-semibold">{despesa.valor?.toFixed(2)}€</span>
                            {despesa.numero_fatura && (
                              <span>Fatura: {despesa.numero_fatura}</span>
                            )}
                            <span>Pago por: {despesa.tecnico_nome}</span>
                            <span>{new Date(despesa.data).toLocaleDateString('pt-PT')}</span>
                            {isPago && despesa.paid_at && (
                              <span className="text-emerald-300">Marcado pago em {new Date(despesa.paid_at).toLocaleDateString('pt-PT')}{despesa.paid_by ? ` por ${despesa.paid_by}` : ''}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          {user?.is_admin && (
                            <Button
                              onClick={async () => {
                                try {
                                  const target = isPago ? 'pendente' : 'pago';
                                  await axios.patch(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/despesas/${despesa.id}/status`, { status: target });
                                  toast.success(`Despesa marcada como ${target === 'pago' ? 'Paga' : 'Pendente'}`);
                                  fetchDespesas(selectedRelatorio.id);
                                } catch (err) {
                                  toast.error(formatErrorMessage(err));
                                }
                              }}
                              size="sm"
                              className={isPago ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
                              data-testid={`btn-toggle-status-despesa-${despesa.id}`}
                              title={isPago ? 'Marcar como Pendente' : 'Marcar como Pago'}
                            >
                              {isPago ? 'Marcar Pendente' : 'Marcar Pago'}
                            </Button>
                          )}
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
                          {user?.is_admin && (
                            <Button
                              type="button"
                              onClick={() => setDespesaToDelete(despesa)}
                              size="sm"
                              variant="outline"
                              className="border-red-500 text-red-500 hover:bg-red-500/10"
                              data-testid="btn-delete-despesa"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      );
                    })}
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
                          setPcActiveTab('resumo');
                          fetchPCDetalhes(pc.id);
                          setShowPCModal(true);
                        }}
                        className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700 hover:border-yellow-600 cursor-pointer transition-colors"
                        data-testid={`pc-item-${pc.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-white font-medium">{pc.numero_pc}</p>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              pc.status === 'Em Espera' ? 'bg-gray-600/20 text-gray-400' :
                              pc.status === 'Cotação Pedida' ? 'bg-yellow-600/20 text-yellow-400' :
                              pc.status === 'A Caminho' ? 'bg-blue-600/20 text-blue-400' :
                              pc.status === 'Terminado' ? 'bg-green-600/20 text-green-400' :
                              'bg-purple-600/20 text-purple-400'
                            }`}>{pc.status}</span>
                          </div>
                          {pc.primeiro_material && (
                            <p className="text-gray-400 text-sm mt-1 truncate">{pc.primeiro_material}</p>
                          )}
                          {(pc.primeiro_material_posicao || pc.primeiro_material_codigo) && (
                            <div className="flex gap-3 mt-0.5 text-xs">
                              {pc.primeiro_material_posicao && <span className="text-yellow-400">Posição: {pc.primeiro_material_posicao}</span>}
                              {pc.primeiro_material_codigo && <span className="text-yellow-400">Código: {pc.primeiro_material_codigo}</span>}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}



              {/* Botões de Ação */}
              <div className={`${isMobile ? 'flex flex-col gap-2 pt-4' : 'grid grid-cols-2 lg:grid-cols-3 gap-3 pt-6'}`}>
                {/* Download PDF - Vermelho */}
                <Button
                  onClick={async () => {
                    const toastId = toast.loading('A gerar PDF... 0s');
                    try {
                      await downloadFSPdfToFile({
                        api: API,
                        relatorioId: selectedRelatorio.id,
                        axios,
                        fallbackFilename: `FS_${selectedRelatorio.numero_assistencia}.pdf`,
                        onProgress: (elapsed) => {
                          toast.loading(`A gerar PDF... ${Math.round(elapsed)}s`, { id: toastId });
                        },
                      });
                      toast.success('PDF descarregado com sucesso!', { id: toastId, duration: 2500 });
                    } catch (error) {
                      toast.error(`Erro ao descarregar PDF: ${error?.message || 'desconhecido'}`, { id: toastId, duration: 8000 });
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

                {/* Folha de Horas - Laranja (apenas admin) */}
                {user?.is_admin && (
                <Button
                  onClick={handleOpenFolhaHoras}
                  disabled={loadingFolhaHoras}
                  className={`bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white ${isMobile ? 'w-full py-3 text-sm' : 'px-4 py-3'}`}
                  data-testid="folha-horas-btn"
                >
                  <FileSpreadsheet className={`${isMobile ? 'w-4 h-4 mr-2' : 'w-5 h-5 mr-2'}`} />
                  {loadingFolhaHoras ? 'A carregar...' : 'Folha de Horas'}
                </Button>
                )}
                
                {/* Botões de Mudança de Estado - Fluxo: Pendente → Em Execução → Concluído */}
                {(selectedRelatorio?.status === 'pendente' || selectedRelatorio?.status === 'agendado') && (
                  <Button
                    onClick={async () => {
                      try {
                        await axios.patch(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/status`, {
                          status: 'em_execucao'
                        });
                        toast.success('FS marcada como Em Execução!');
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
                        toast.success('FS marcada como Concluída!');
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
                        toast.success('FS reaberta - Em Execução!');
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
                    {isMobile ? 'Reabrir FS' : 'Reabrir FS (Em Execução)'}
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

                {/* Rever FS com IA */}
                <Button
                  onClick={() => setShowAIReview(true)}
                  className={`bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white ${isMobile ? 'w-full py-3 text-sm' : 'px-4 py-3'}`}
                  data-testid="rever-ia-btn"
                >
                  <Sparkles className={`${isMobile ? 'w-4 h-4 mr-2' : 'w-5 h-5 mr-2'}`} />
                  {isMobile ? 'Rever IA' : 'Rever FS com IA'}
                </Button>
                
                {/* Botão FECHAR - Para fechar o painel da FS */}
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

    <>
      <EmailModal
        open={showEmailModal}
        onOpenChange={setShowEmailModal}
        selectedRelatorio={selectedRelatorio}
        emailsCliente={emailsCliente}
        toggleEmailSelection={toggleEmailSelection}
        emailsAdicionais={emailsAdicionais}
        setEmailsAdicionais={setEmailsAdicionais}
        sendingEmail={sendingEmail}
        onSend={handleSendEmail}
      />

      {/* Popup 2 — Seleção de Documentos a Enviar */}
      <Dialog open={showFolhaHorasConfirm} onOpenChange={(open) => {
        if (!open) setShowFolhaHorasConfirm(false);
      }}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <FileText className="w-5 h-5 text-amber-400" />
              Documentos a Enviar
            </DialogTitle>
            <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
          </DialogHeader>
          <p className="text-gray-400 text-sm">Selecione os documentos que pretende anexar ao email:</p>

          <div className="space-y-2 mt-3">
            {/* Relatório PDF */}
            <label
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                docsSelecionados.relatorio ? 'border-blue-500 bg-blue-600/10' : 'border-gray-700 bg-[#0f0f0f] hover:border-gray-500'
              }`}
              data-testid="doc-select-relatorio"
            >
              <input
                type="checkbox"
                checked={docsSelecionados.relatorio || false}
                onChange={(e) => setDocsSelecionados({ ...docsSelecionados, relatorio: e.target.checked })}
                className="accent-blue-500 w-4 h-4"
              />
              <div>
                <span className="text-white text-sm font-medium">PDF do Relatório</span>
                <p className="text-gray-500 text-xs">Relatório técnico da FS</p>
              </div>
            </label>

            {/* Folha de Horas */}
            <label
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                docsSelecionados.folha_horas ? 'border-amber-500 bg-amber-600/10' : 'border-gray-700 bg-[#0f0f0f] hover:border-gray-500'
              }`}
              data-testid="doc-select-folha-horas"
            >
              <input
                type="checkbox"
                checked={docsSelecionados.folha_horas || false}
                onChange={(e) => setDocsSelecionados({ ...docsSelecionados, folha_horas: e.target.checked })}
                className="accent-amber-500 w-4 h-4"
              />
              <div className="flex-1">
                <span className="text-white text-sm font-medium">Folha de Horas</span>
                <p className="text-gray-500 text-xs">Registo de mão de obra e custos</p>
              </div>
            </label>

            {/* Card "Configurar despesas" removido — cada despesa já tem `valor_final`
                gravado no popup da FS (Valor × (1 + Percentagem/100)). */}

            {/* PCs */}
            {pedidosCotacao && pedidosCotacao.length > 0 && (
              <>
                <div className="border-t border-gray-800 pt-2 mt-2">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Pedidos de Cotação</p>
                </div>
                {pedidosCotacao.map((pc) => (
                  <label
                    key={pc.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      docsSelecionados[`pc:${pc.id}`] ? 'border-yellow-500 bg-yellow-600/10' : 'border-gray-700 bg-[#0f0f0f] hover:border-gray-500'
                    }`}
                    data-testid={`doc-select-pc-${pc.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={docsSelecionados[`pc:${pc.id}`] || false}
                      onChange={(e) => setDocsSelecionados({ ...docsSelecionados, [`pc:${pc.id}`]: e.target.checked })}
                      className="accent-yellow-500 w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-white text-sm font-medium">{pc.numero_pc}</span>
                      {pc.primeiro_material && (
                        <p className="text-gray-500 text-xs truncate">{pc.primeiro_material}</p>
                      )}
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      pc.status === 'Em Espera' ? 'bg-gray-600/20 text-gray-400' :
                      pc.status === 'Cotação Pedida' ? 'bg-yellow-600/20 text-yellow-400' :
                      'bg-blue-600/20 text-blue-400'
                    }`}>{pc.status}</span>
                  </label>
                ))}
              </>
            )}
          </div>


          {/* Seleção de Idioma do Email */}
          <div className="border-t border-gray-800 pt-3 mt-1">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Idioma do Email</p>
            <div className="flex gap-2">
              {[
                { value: 'pt', label: 'Português', flag: '🇵🇹' },
                { value: 'es', label: 'Español', flag: '🇪🇸' },
                { value: 'en', label: 'English', flag: '🇬🇧' },
              ].map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => setIdiomaEmail(lang.value)}
                  data-testid={`lang-select-${lang.value}`}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm transition-all ${
                    idiomaEmail === lang.value
                      ? 'border-green-500 bg-green-600/10 text-white font-medium'
                      : 'border-gray-700 bg-[#0f0f0f] text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={() => setShowFolhaHorasConfirm(false)}
              variant="outline"
              className="flex-1 border-gray-600 text-gray-300 hover:text-white"
              data-testid="doc-select-cancelar"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmSendEmail}
              disabled={!Object.values(docsSelecionados).some(v => v)}
              className="flex-1 bg-green-600 hover:bg-green-700"
              data-testid="doc-select-enviar"
            >
              <Send className="w-4 h-4 mr-2" />
              Enviar ({Object.values(docsSelecionados).filter(v => v).length} doc{Object.values(docsSelecionados).filter(v => v).length !== 1 ? 's' : ''})
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>


      {/* Add Intervenção Modal - Componente Extraído */}
      <IntervencaoModal
        open={showAddIntervencaoModal}
        onOpenChange={setShowAddIntervencaoModal}
        isEditing={false}
        formData={intervencaoFormData}
        setFormData={setIntervencaoFormData}
        onSubmit={handleAddIntervencao}
        onCancel={() => {
          setShowAddIntervencaoModal(false);
          setIntervencaoFormData({ data_intervencao: new Date().toISOString().split('T')[0], motivo_assistencia: '', equipamento_id: '' });
        }}
        equipamentosOT={equipamentosOT}
      />

      {/* Edit Intervenção Modal - Componente Extraído */}
      <IntervencaoModal
        open={showEditIntervencaoModal}
        onOpenChange={setShowEditIntervencaoModal}
        isEditing={true}
        formData={intervencaoFormData}
        setFormData={setIntervencaoFormData}
        onSubmit={handleEditIntervencao}
        onCancel={() => {
          setShowEditIntervencaoModal(false);
          setSelectedIntervencao(null);
        }}
        equipamentosOT={equipamentosOT}
      />

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

      {/* Fotografia Modals - Componentes Extraídos */}
      <FotoUploadModal
        open={showAddFotoModal} onOpenChange={setShowAddFotoModal}
        onSubmit={handleUploadFoto}
        onCancel={() => { setShowAddFotoModal(false); setFotoFile(null); setFotoFiles([]); setFotoDescricao(''); }}
        fotoFile={fotoFile} fotoFiles={fotoFiles} onFotoFileChange={handleFotoFileChange}
        fotoDescricao={fotoDescricao} setFotoDescricao={setFotoDescricao}
        uploadingFoto={uploadingFoto}
      />
      <FotoEditModal
        open={showEditFotoModal}
        onOpenChange={(open) => { setShowEditFotoModal(open); if (!open) { setSelectedFoto(null); setEditFotoDescricao(''); setEditFotoData(''); } }}
        selectedFoto={selectedFoto} editFotoDescricao={editFotoDescricao} setEditFotoDescricao={setEditFotoDescricao}
        editFotoData={editFotoData} setEditFotoData={setEditFotoData}
        onSave={handleUpdateFotoDescricao}
        onCancel={() => { setShowEditFotoModal(false); setSelectedFoto(null); setEditFotoDescricao(''); setEditFotoData(''); }}
        apiUrl={API}
      />
      <FotoBulkEditModal
        open={showBulkEditFotoModal}
        onOpenChange={(open) => { setShowBulkEditFotoModal(open); if (!open) setBulkFotosToEdit([]); }}
        fotos={bulkFotosToEdit}
        onDescricaoChange={handleBulkFotoDescricaoChange}
        onReorder={handleBulkFotoReorder}
        onSave={handleSaveBulkFotoDescricoes}
        onCancel={() => { setShowBulkEditFotoModal(false); setBulkFotosToEdit([]); }}
        apiUrl={API}
        saving={uploadingFoto}
      />
      <FotoPreviewModal
        open={showFotoPreviewModal}
        onOpenChange={(open) => { setShowFotoPreviewModal(open); if (!open) setSelectedFotoUrl(null); }}
        selectedFotoUrl={selectedFotoUrl}
      />

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
          setMaterialFormData({ descricao: '', quantidade: '', unidade: 'Un', fornecido_por: 'Cliente', data_utilizacao: '' });
          setSelectedPCIdForMaterial(null);
          setSelectedEquipOTIdsForPC([]);
        }}
        equipamentosOT={equipamentosOT}
        selectedEquipOTIds={selectedEquipOTIdsForPC}
        onEquipOTIdsChange={setSelectedEquipOTIdsForPC}
        onOpenDespesa={async (mat) => {
          // Material fornecido por HWI → gravar o material E abrir popup de Despesa
          try {
            await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/materiais`, {
              ...mat,
              intervencao_id: addMaterialIntervencaoId || null,
            });
            fetchMateriais(selectedRelatorio.id);
          } catch (error) {
            toast.error(formatErrorMessage(error));
            return;
          }
          setShowAddMaterialModal(false);
          const today = new Date().toISOString().split('T')[0];
          setDespesaFormData({
            tipo: 'outras',
            descricao: mat.descricao || '',
            quantidade: mat.quantidade || '',
            unidade: mat.unidade || 'Un',
            valor: '',
            percentagem: '',
            valor_final: '',
            tecnico_id: '',
            data: mat.data_utilizacao || today,
            numero_fatura: '',
            data_fatura: '',
            factura_data: null,
            factura_filename: null,
            factura_mimetype: null,
          });
          // Reset material form
          setMaterialFormData({ descricao: '', quantidade: '', unidade: 'Un', fornecido_por: 'Cliente', data_utilizacao: '' });
          setShowAddDespesaModal(true);
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

      {/* Relatório de Assistência Modals - Componentes Extraídos */}
      <RelAssistModal
        open={showAddRelAssistModal} onOpenChange={setShowAddRelAssistModal}
        isEditing={false} formData={relAssistFormData} setFormData={setRelAssistFormData}
        onSubmit={handleAddRelAssist}
        onCancel={() => setShowAddRelAssistModal(false)}
      />
      <RelAssistModal
        open={showEditRelAssistModal} onOpenChange={setShowEditRelAssistModal}
        isEditing={true} formData={relAssistFormData} setFormData={setRelAssistFormData}
        onSubmit={handleUpdateRelAssist}
        onCancel={() => { setShowEditRelAssistModal(false); setSelectedRelAssist(null); }}
      />

      {/* Despesa Modals - Componentes Extraídos */}
      <AddDespesaModal
        open={showAddDespesaModal} onOpenChange={setShowAddDespesaModal}
        formData={despesaFormData} setFormData={setDespesaFormData}
        onSubmit={handleAddDespesa}
        onCancel={() => { setShowAddDespesaModal(false); setShowScanner(false); setDespesaFormData({ tipo: 'outras', descricao: '', quantidade: '', unidade: 'Un', valor: '', percentagem: '', valor_final: '', tecnico_id: '', data: new Date().toISOString().split('T')[0], numero_fatura: '', data_fatura: '', factura_data: null, factura_filename: null, factura_mimetype: null }); }}
        tiposDespesa={tiposDespesa} allSystemUsers={allSystemUsers}
        showScanner={showScanner} setShowScanner={setShowScanner}
        isAdmin={user?.is_admin}
      />
      <EditDespesaModal
        open={showEditDespesaModal} onOpenChange={setShowEditDespesaModal}
        formData={despesaFormData} setFormData={setDespesaFormData}
        onSubmit={handleUpdateDespesa}
        onCancel={() => { setShowEditDespesaModal(false); setSelectedDespesa(null); }}
        tiposDespesa={tiposDespesa} allSystemUsers={allSystemUsers}
        editCameraInputRef={editCameraInputRef} editFileInputRef={editFileInputRef}
        handleFacturaUpload={handleFacturaUpload} uploadingFactura={uploadingFactura}
        isAdmin={user?.is_admin}
      />

    <>
      {/* PC Modal — Fase 6 layout */}
      <Dialog open={showPCModal} onOpenChange={(open) => {
        setShowPCModal(open);
        if (!open) {
          setSelectedPC(null);
          setFotografiasPC([]);
        }
      }}>
        <DialogContent className="bg-[#0f0f0f] border-gray-800 text-white max-w-6xl max-h-[92vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-gray-800">
            <DialogTitle className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-white">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-semibold" data-testid="pc-modal-title-numero">
                  {selectedPC?.numero_pc}
                </span>
                {selectedPC?.status && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={`text-[11px] font-bold px-2 py-1 rounded uppercase tracking-wide flex items-center gap-1 hover:brightness-125 transition ${
                          selectedPC.status === 'Cancelado'
                            ? 'bg-red-500/15 text-red-300 border border-red-500/40'
                            : selectedPC.status === 'Terminado'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                            : selectedPC.status === 'Cotação Pedida' || selectedPC.status === 'Em Cotação'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                            : 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/40'
                        }`}
                        data-testid="pc-modal-status-badge"
                        title="Clica para alterar o estado"
                      >
                        {selectedPC.status === 'Cotação Pedida' ? 'Em Cotação' : selectedPC.status}
                        <ChevronDown className="w-3 h-3 opacity-70" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="bg-[#1a1a1a] border-gray-700 text-white">
                      {['Em Espera', 'Cotação Pedida', 'A Caminho', 'Em Armazém', 'Terminado'].map((st) => (
                        <DropdownMenuItem
                          key={st}
                          onClick={() => handleChangePCStatus(st)}
                          disabled={st === selectedPC.status}
                          className="cursor-pointer focus:bg-blue-500/10 focus:text-blue-300 disabled:opacity-40"
                          data-testid={`pc-status-option-${st.replace(/\s+/g, '-').toLowerCase()}`}
                        >
                          {st === selectedPC.status && <CheckCircle className="w-3.5 h-3.5 mr-2 text-emerald-400" />}
                          {st === 'Cotação Pedida' ? 'Em Cotação' : st}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuItem
                        onClick={() => setShowCancelarPCModal(true)}
                        disabled={selectedPC.status === 'Cancelado'}
                        className="cursor-pointer text-red-300 focus:bg-red-500/10 focus:text-red-200 border-t border-gray-800 mt-1 pt-1"
                        data-testid="pc-status-option-cancelado"
                      >
                        <X className="w-3.5 h-3.5 mr-2" /> Cancelar PC
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {selectedPC?.numero_ot && (
                  <span className="text-sm text-gray-400" data-testid="pc-modal-origem">
                    Origem: FS_{selectedPC.numero_ot}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => triggerPCDownload(selectedPC?.id)}
                  size="sm"
                  variant="outline"
                  className="border-gray-700 text-white hover:bg-white/[0.03]"
                  data-testid="pc-modal-btn-pdf"
                >
                  <Download className="w-4 h-4 mr-1" /> PDF
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-gray-700 text-white hover:bg-white/[0.03]"
                      data-testid="pc-modal-btn-mais-acoes"
                    >
                      Mais ações <ChevronDown className="w-4 h-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-[#1a1a1a] border-gray-700 text-white">
                    <DropdownMenuItem
                      onClick={() => { setSelectedPCIdForMaterial(selectedPC.id); setShowAddMaterialToPCModal(true); }}
                      className="cursor-pointer focus:bg-blue-500/10 focus:text-blue-300"
                      data-testid="pc-menu-add-material"
                    >
                      <Plus className="w-4 h-4 mr-2" /> Adicionar material
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setShowAddFotoPCModal(true)}
                      className="cursor-pointer focus:bg-blue-500/10 focus:text-blue-300"
                      data-testid="pc-menu-add-foto"
                    >
                      <Camera className="w-4 h-4 mr-2" /> Adicionar fotografia
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => { setPcActiveTab('documentos'); setTimeout(() => document.getElementById('pc-doc-input')?.click(), 50); }}
                      className="cursor-pointer focus:bg-blue-500/10 focus:text-blue-300"
                      data-testid="pc-menu-add-doc"
                    >
                      <FileText className="w-4 h-4 mr-2" /> Adicionar documento
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setShowEmailPCModal(true)}
                      className="cursor-pointer focus:bg-blue-500/10 focus:text-blue-300"
                      data-testid="pc-menu-email-pc-pdf"
                    >
                      <Mail className="w-4 h-4 mr-2" /> Enviar PDF por email
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setShowCancelarPCModal(true)}
                      disabled={selectedPC?.status === 'Cancelado'}
                      className="cursor-pointer text-red-300 focus:bg-red-500/10 focus:text-red-200"
                      data-testid="pc-menu-cancelar"
                    >
                      <X className="w-4 h-4 mr-2" /> {selectedPC?.status === 'Cancelado' ? 'PC Cancelada' : 'Cancelar PC'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  onClick={() => { setEnviarCotacaoMatIds([]); setShowEnviarCotacaoModal(true); }}
                  disabled={!(selectedPC?.materiais?.length > 0)}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  data-testid="pc-modal-btn-enviar-global"
                >
                  <Send className="w-4 h-4 mr-1" /> Enviar Email Global
                </Button>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Detalhes do Pedido de Cotação.</DialogDescription>
          </DialogHeader>

          {selectedPC && (
            <div className="px-6 pt-4 pb-6">
              {/* Barra de abas — Fase 6 layout com contagens */}
              <div className="border-b-2 border-yellow-500/40 mb-5">
                <div className="flex gap-6 overflow-x-auto scrollbar-hide">
                  {[
                    { key: 'resumo', label: 'Resumo', count: null },
                    { key: 'materiais', label: 'Materiais', count: selectedPC.materiais?.length || 0 },
                    { key: 'fotografias', label: 'Fotografias', count: fotografiasPC?.length || 0 },
                    { key: 'documentos', label: 'Documentos', count: pcDocumentos.length },
                    { key: 'historico', label: 'Histórico', count: pcHistorico.length },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setPcActiveTab(t.key)}
                      data-testid={`pc-tab-${t.key}`}
                      className={`pb-2 -mb-[2px] text-sm font-medium transition whitespace-nowrap flex items-center gap-2 border-b-2 ${
                        pcActiveTab === t.key
                          ? 'text-yellow-300 border-yellow-400'
                          : 'text-gray-400 hover:text-white border-transparent'
                      }`}
                    >
                      {t.label}
                      {t.count !== null && t.count > 0 && (
                        <span className="text-[11px] bg-gray-700/60 text-gray-300 rounded-full px-2 py-0.5">
                          {t.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* =================================================================
                  ABA RESUMO — Layout Fase 6 (2 colunas)
                  ================================================================= */}
              {pcActiveTab === 'resumo' && (
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,380px)_1fr] gap-5">
                  {/* Coluna esquerda: Informações principais */}
                  <div className="bg-[#161616] border border-gray-800 rounded-lg p-4 h-fit min-w-0" data-testid="pc-resumo-info-principais">
                    <h4 className="text-white font-semibold mb-4">Informações principais</h4>
                    <dl className="space-y-2.5 text-sm">
                      {[
                        ['Cliente', selectedPC.cliente_nome],
                        ['Contacto', selectedPC.cliente_email],
                        ['Telefone', selectedPC.cliente_telefone],
                        ['Equipamento', selectedPC.equipamento_tipologia],
                        ['Marca / Modelo', [selectedPC.equipamento_marca, selectedPC.equipamento_modelo].filter(Boolean).join(' / ')],
                        ['Nº Série', selectedPC.equipamento_numero_serie],
                        ['Ano', selectedPC.equipamento_ano_fabrico],
                        ['Nº FS', selectedPC.numero_ot ? `FS_${selectedPC.numero_ot}` : null],
                        ['Data de FS', selectedPC.data_fs ? new Date(selectedPC.data_fs).toLocaleDateString('pt-PT') : null],
                        ['Criada em', selectedPC.created_at ? new Date(selectedPC.created_at).toLocaleString('pt-PT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : null],
                        ['Responsável', selectedPC.criado_por_nome],
                      ].filter(([, v]) => v).map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[90px_1fr] gap-2 min-w-0">
                          <dt className="text-gray-500 text-xs pt-0.5">{label}</dt>
                          <dd className="text-white text-sm min-w-0" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPcActiveTab('materiais')}
                      className="w-full mt-4 border-gray-700 text-gray-300 hover:bg-white/[0.03]"
                      data-testid="pc-resumo-editar-informacoes"
                    >
                      <Edit className="w-3.5 h-3.5 mr-1" /> Editar informações
                    </Button>
                  </div>

                  {/* Coluna direita: Materiais + 3 sub-cards */}
                  <div className="space-y-5 min-w-0">
                    {/* Materiais do Pedido de Cotação (tabela) */}
                    <div className="bg-[#161616] border border-gray-800 rounded-lg p-4" data-testid="pc-resumo-materiais-table">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-white font-semibold">Materiais do Pedido de Cotação</h4>
                        <Button
                          size="sm"
                          onClick={() => setShowAddMaterialToPCModal(true)}
                          className="bg-blue-600 hover:bg-blue-700 text-white h-8"
                          data-testid="pc-resumo-add-material"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Material
                        </Button>
                      </div>
                      {selectedPC.materiais?.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-gray-400 text-[11px] uppercase tracking-wide border-b border-gray-800">
                                <th className="text-left py-2 pl-2 font-medium">#</th>
                                <th className="text-left py-2 font-medium">Material</th>
                                <th className="text-center py-2 font-medium">Qtd.</th>
                                <th className="text-left py-2 font-medium">Posição</th>
                                <th className="text-left py-2 font-medium">Código</th>
                                <th className="text-left py-2 font-medium">Estado</th>
                                <th className="text-center py-2 pr-2 font-medium">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedPC.materiais.map((mat, idx) => {
                                const estado = getMaterialEstadoInfo(mat.cotacao_status);
                                return (
                                  <tr key={mat.id} className="border-b border-gray-800/70" data-testid={`pc-resumo-mat-row-${mat.id}`}>
                                    <td className="py-2 pl-2 text-gray-500">{idx + 1}</td>
                                    <td className="py-2 text-white">{mat.descricao}</td>
                                    <td className="py-2 text-center text-white">{mat.quantidade}{mat.unidade ? ` ${mat.unidade}` : ''}</td>
                                    <td className="py-2 text-gray-300">{mat.posicao || '—'}</td>
                                    <td className="py-2 text-gray-300">{mat.codigo || '—'}</td>
                                    <td className="py-2">
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button
                                            className={`text-[10px] font-semibold px-2 py-0.5 rounded border inline-flex items-center gap-1 hover:brightness-125 transition ${estado.cls}`}
                                            title="Clica para alterar o estado"
                                            data-testid={`pc-resumo-mat-estado-${mat.id}`}
                                          >
                                            {estado.label}
                                            <ChevronDown className="w-3 h-3 opacity-70" />
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" className="bg-[#1a1a1a] border-gray-700 text-white">
                                          {['Em Espera', 'Cotação Pedida', 'A Caminho', 'Em Armazém', 'Terminado', 'Cancelado'].map((st) => (
                                            <DropdownMenuItem
                                              key={st}
                                              onClick={() => handleChangeMaterialStatus(mat.id, st)}
                                              disabled={materialStatusEquals(mat.cotacao_status, st)}
                                              className="cursor-pointer focus:bg-blue-500/10 focus:text-blue-300 disabled:opacity-40"
                                              data-testid={`pc-resumo-mat-estado-option-${mat.id}-${st.replace(/\s+/g, '-').toLowerCase()}`}
                                            >
                                              {materialStatusEquals(mat.cotacao_status, st) && <CheckCircle className="w-3.5 h-3.5 mr-2 text-emerald-400" />}
                                              {st === 'Cotação Pedida' ? 'Em Cotação' : st}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </td>
                                    <td className="py-2 pr-2">
                                      <div className="flex justify-center gap-1">
                                        <button
                                          onClick={() => { setEnviarCotacaoMatIds([mat.id]); setShowEnviarCotacaoModal(true); }}
                                          className="p-1.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400"
                                          title="Enviar pedido de cotação"
                                          data-testid={`pc-resumo-mat-enviar-${mat.id}`}
                                        >
                                          <Send className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => openEditMaterialPCModal(mat)}
                                          className="p-1.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400"
                                          title="Editar"
                                          data-testid={`pc-resumo-mat-editar-${mat.id}`}
                                        >
                                          <Edit className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-gray-500 text-sm text-center py-4 italic">Nenhum material associado.</p>
                      )}
                    </div>

                    {/* Sub-cards: Observações + Fotografias + Documentos */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Observações */}
                      <div className="bg-[#161616] border border-gray-800 rounded-lg p-4" data-testid="pc-resumo-observacoes-card">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-white font-semibold text-sm">Observações</h5>
                        </div>
                        {pcObsEditing ? (
                          <>
                            <textarea
                              value={pcObsDraft}
                              onChange={(e) => setPcObsDraft(e.target.value)}
                              className="w-full bg-[#0a0a0a] border border-gray-700 text-white rounded p-2 min-h-[80px] text-xs"
                              placeholder="Escreve aqui as observações…"
                              data-testid="pc-observacoes-textarea"
                            />
                            <div className="flex gap-1 mt-2">
                              <Button size="sm" variant="ghost" onClick={() => setPcObsEditing(false)} className="text-gray-400 h-7 text-xs flex-1">Cancelar</Button>
                              <Button size="sm" onClick={handleSavePcObservacao} className="bg-blue-600 hover:bg-blue-700 h-7 text-xs flex-1">Guardar</Button>
                            </div>
                          </>
                        ) : (
                          <>
                            {pcObservacao?.texto
                              ? <p className="text-gray-300 text-xs whitespace-pre-wrap min-h-[60px] max-h-[100px] overflow-y-auto">{pcObservacao.texto}</p>
                              : <p className="text-gray-500 text-xs italic min-h-[60px]">Sem observações.</p>
                            }
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setPcObsDraft(pcObservacao?.texto || ''); setPcObsEditing(true); }}
                              className="w-full mt-3 border-gray-700 text-gray-300 hover:bg-white/[0.03] h-7 text-xs"
                              data-testid="pc-quick-obs"
                            >
                              <Edit className="w-3 h-3 mr-1" /> Editar
                            </Button>
                          </>
                        )}
                      </div>

                      {/* Fotografias */}
                      <div className="bg-[#161616] border border-gray-800 rounded-lg p-4" data-testid="pc-resumo-fotos-card">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-white font-semibold text-sm">Fotografias ({fotografiasPC.length})</h5>
                        </div>
                        {fotografiasPC.length > 0 ? (
                          <div className="grid grid-cols-3 gap-1.5">
                            {fotografiasPC.slice(0, 3).map((f) => (
                              <img
                                key={f.id}
                                src={`${API}${f.foto_url}?thumb=true`}
                                alt={f.descricao || ''}
                                className="w-full h-16 object-cover rounded border border-gray-800"
                                loading="lazy"
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-500 text-xs italic min-h-[64px]">Sem fotografias.</p>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPcActiveTab('fotografias')}
                          className="w-full mt-3 border-gray-700 text-gray-300 hover:bg-white/[0.03] h-7 text-xs"
                          data-testid="pc-resumo-fotos-ver-todas"
                        >
                          Ver todas
                        </Button>
                      </div>

                      {/* Documentos */}
                      <div className="bg-[#161616] border border-gray-800 rounded-lg p-4" data-testid="pc-resumo-docs-card">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-white font-semibold text-sm">Documentos ({pcDocumentos.length})</h5>
                        </div>
                        {pcDocumentos.length > 0 ? (
                          <div className="space-y-1.5 max-h-[100px] overflow-y-auto">
                            {pcDocumentos.slice(0, 3).map((d) => (
                              <div key={d.id} className="flex items-center gap-1.5 text-xs">
                                <FileText className="w-3 h-3 text-red-400 shrink-0" />
                                <span className="text-white truncate flex-1" title={d.original_name || d.filename}>
                                  {d.original_name || d.filename}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-500 text-xs italic min-h-[60px]">Sem documentos.</p>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPcActiveTab('documentos')}
                          className="w-full mt-3 border-gray-700 text-gray-300 hover:bg-white/[0.03] h-7 text-xs"
                          data-testid="pc-resumo-docs-ver-todas"
                        >
                          Ver todas
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Card "Ações Rápidas" (só em Resumo) — REMOVIDO Fase 6 (Mais ações menu substitui) */}

              {/* Informações da FS — REMOVIDO Fase 6 (movido para Informações Principais) */}

              {/* Dados da Máquina — REMOVIDO Fase 6 (movido para Informações Principais) */}

              {/* Status dropdown — REMOVIDO Fase 6 (badge no header + Cancelar via Mais ações) */}

              {/* Materiais (só na aba Materiais — Fase 6, na aba Resumo já é tabela dedicada) */}
              {pcActiveTab === 'materiais' && (
              <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
                <h4 className="text-blue-400 font-semibold mb-3 flex items-center justify-between">
                  <span>Material para Cotação</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setEnviarCotacaoMatIds([]); // vazio => global
                        setShowEnviarCotacaoModal(true);
                      }}
                      disabled={!(selectedPC.materiais?.length > 0)}
                      className="bg-green-600 hover:bg-green-700 h-7 text-xs"
                      data-testid="pc-enviar-cotacao-global"
                      >
                        <Send className="w-3 h-3 mr-1" /> Enviar Pedido Global
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowAddMaterialToPCModal(true)} className="text-blue-400 h-7 text-xs" data-testid="pc-material-add">
                        <Plus className="w-3 h-3 mr-1" /> Adicionar
                      </Button>
                    </div>
                </h4>
                {selectedPC.materiais?.length > 0 ? (
                  <div className="space-y-2">
                    {selectedPC.materiais.map((mat) => (
                      <div key={mat.id} className="flex justify-between items-center p-2 bg-gray-800 rounded" data-testid={`pc-material-row-${mat.id}`}>
                        <div className="flex-1 min-w-0">
                          <span className="text-white">{mat.descricao}</span>
                          <span className="text-gray-400 ml-3">Qtd: {mat.quantidade} {mat.unidade || 'Un'}</span>
                          {(mat.posicao || mat.codigo) && (
                            <div className="flex gap-3 mt-0.5">
                              {mat.posicao && <span className="text-white text-sm">Posição: {mat.posicao}</span>}
                              {mat.codigo && <span className="text-white text-sm">Código: {mat.codigo}</span>}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {pcActiveTab === 'materiais' && (
                            <Button
                              onClick={() => {
                                setEnviarCotacaoMatIds([mat.id]);
                                setShowEnviarCotacaoModal(true);
                              }}
                              variant="ghost"
                              size="sm"
                              className="text-green-400 hover:text-green-300 hover:bg-green-900/20 h-7 px-2"
                              title="Enviar pedido de cotação"
                              data-testid={`pc-material-enviar-${mat.id}`}
                            >
                              <Send className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            onClick={() => openEditMaterialPCModal(mat)}
                            variant="ghost"
                            size="sm"
                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 h-7 px-2"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">Nenhum material associado</p>
                )}
              </div>
              )}

              {/* Fotografias (só na aba Fotografias — Fase 6, no Resumo é sub-card) */}
              {pcActiveTab === 'fotografias' && (
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
              )}

              {/* Observações Card — REMOVIDO Fase 6 (movido para sub-card no Resumo) */}

              {/* Aba Documentos — Fase 3 */}
              {pcActiveTab === 'documentos' && (
                <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700" data-testid="pc-documentos-tab">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-blue-400 font-semibold">Documentos Associados</h4>
                    <label className="cursor-pointer">
                      <input
                        id="pc-doc-input"
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.csv,.zip"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (f) await handleUploadPcDoc(f, null, null);
                          e.target.value = '';
                        }}
                      />
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-md text-white text-xs font-medium">
                        {pcDocUploading ? 'A enviar…' : <><Plus className="w-3 h-3" /> Adicionar Documento</>}
                      </span>
                    </label>
                  </div>
                  {pcDocumentos.length === 0 ? (
                    <p className="text-center text-gray-500 py-8 text-sm">Sem documentos anexados. Formatos aceites: PDF, DOCX, XLSX, imagens, TXT, CSV, ZIP (até 20 MB).</p>
                  ) : (
                    <div className="space-y-2">
                      {pcDocumentos.map((doc) => (
                        <div key={doc.id} className="flex items-center gap-3 p-2 bg-gray-800/50 rounded border border-gray-700" data-testid={`pc-doc-${doc.id}`}>
                          <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm truncate">{doc.original_name || doc.filename}</p>
                            <p className="text-[11px] text-gray-500">
                              {(doc.size ? (doc.size/1024).toFixed(0)+' KB · ' : '')}
                              {doc.uploaded_by_name || '—'} · {new Date(doc.uploaded_at).toLocaleString('pt-PT')}
                            </p>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => handleDownloadPcDoc(doc)} className="text-blue-300 h-7 text-xs">
                            <Download className="w-3 h-3 mr-1" /> Descarregar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeletePcDoc(doc.id, doc.original_name)} className="text-red-300 h-7 text-xs">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Aba Histórico — Fase 3 */}
              {pcActiveTab === 'historico' && (
                <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700" data-testid="pc-historico-tab">
                  <h4 className="text-blue-400 font-semibold mb-3">Histórico de Ações</h4>
                  {pcHistorico.length === 0 ? (
                    <p className="text-center text-gray-500 py-8 text-sm">Sem eventos registados nesta PC.</p>
                  ) : (
                    <div className="relative pl-6 space-y-4">
                      <div className="absolute left-2 top-1 bottom-1 w-px bg-gray-700" />
                      {pcHistorico.map((ev) => (
                        <div key={ev.id} className="relative" data-testid={`pc-hist-${ev.id}`}>
                          <span className="absolute -left-5 top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-[#0f0f0f]" />
                          <p className="text-sm text-white">{ev.description}</p>
                          <p className="text-[11px] text-gray-500">
                            {new Date(ev.created_at).toLocaleString('pt-PT')} · {ev.username || 'sistema'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Faturas */}
              {pcActiveTab === 'documentos' && (
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
              )}

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

      {/* Add Foto PC Modal — com integração OneDrive + Câmara */}
      <AddFotoPCModal
        open={showAddFotoPCModal}
        onOpenChange={setShowAddFotoPCModal}
        uploading={uploadingFotoPC}
        onUpload={handleUploadPCPhotos}
        onOpenOneDrive={() => setShowPCOneDrivePicker(true)}
        onOpenCamera={() => setShowPCCameraCapture(true)}
        onCancel={() => {
          setShowAddFotoPCModal(false);
          setFotoPCFile(null);
          setFotoPCDescricao('');
        }}
      />

      {/* OneDrive picker para PC (reutiliza o modal genérico) */}
      <OneDrivePickerModal
        open={showPCOneDrivePicker}
        onOpenChange={setShowPCOneDrivePicker}
        onPick={async (files) => { await handleUploadPCPhotos(files, { mirrorToOneDrive: false }); }}
      />

      {/* Câmara in-app para PC */}
      <CameraCaptureModal
        open={showPCCameraCapture}
        onOpenChange={setShowPCCameraCapture}
        onCapture={async (files) => { await handleUploadPCPhotos(files, { mirrorToOneDrive: true }); }}
      />

      {/* Email PC Modal */}
      <EmailPCModal
        open={showEmailPCModal}
        onOpenChange={setShowEmailPCModal}
        onSend={triggerPCEmail}
        sending={sendingEmailPC}
      />

      {/* Popup: Esconder nome do cliente no PC */}
      <HideClientPopup
        open={showHideClientPopup}
        onOpenChange={setShowHideClientPopup}
        actionType={hideClientAction?.type}
        idiomaEmail={idiomaEmail}
        setIdiomaEmail={setIdiomaEmail}
        onExecute={executeHideClientAction}
      />


      {/* Edit Material PC Modal */}
      <EditMaterialPCModal
        open={showEditMaterialPCModal}
        onOpenChange={setShowEditMaterialPCModal}
        form={editMaterialPCForm}
        setForm={setEditMaterialPCForm}
        onSave={handleUpdateMaterialPC}
      />

      {/* Enviar Pedido de Cotação Modal (Fase 4) */}
      <EnviarPedidoCotacaoModal
        open={showEnviarCotacaoModal}
        onOpenChange={setShowEnviarCotacaoModal}
        pc={selectedPC}
        initialMaterialIds={enviarCotacaoMatIds}
        documentos={pcDocumentos}
        onSent={() => {
          if (selectedPC?.id) fetchPCDetalhes(selectedPC.id);
          if (selectedRelatorio?.id) {
            fetchMateriais(selectedRelatorio.id);
            fetchPedidosCotacao(selectedRelatorio.id);
          }
          fetchAllPCs();
        }}
      />

      {/* Cancelar PC Modal (Fase 6) */}
      <CancelarPCModal
        open={showCancelarPCModal}
        onOpenChange={setShowCancelarPCModal}
        pc={selectedPC}
        onConfirm={handleConfirmCancelarPC}
        sending={cancelarPCSending}
      />

      {/* Adicionar material à PC (Fase 8) — modal simples só para PC */}
      <AddMaterialToPCModal
        open={showAddMaterialToPCModal}
        onOpenChange={setShowAddMaterialToPCModal}
        pc={selectedPC}
        relatorioId={selectedPC?.relatorio_id}
        onAdded={() => {
          if (selectedPC?.id) fetchPCDetalhes(selectedPC.id);
          if (selectedRelatorio?.id) {
            fetchMateriais(selectedRelatorio.id);
            fetchPedidosCotacao(selectedRelatorio.id);
          }
          fetchAllPCs();
        }}
      />


    </>

      {/* Assinatura Modal - Componente Extraído */}
      <AssinaturaModal
        open={showAssinaturaModal}
        onOpenChange={(o) => {
          setShowAssinaturaModal(o);
          // Ao fechar o modal de assinaturas, se o visualizador estiver aberto,
          // regenerar o PDF para refletir a(s) assinatura(s) recém-adicionada(s)
          if (!o && showHTMLPreviewModal) {
            refreshPreviewPdf();
          }
        }}
        selectedRelatorio={selectedRelatorio}
        assinaturas={assinaturas}
        onAssinaturaSaved={() => {
          fetchAssinaturas(selectedRelatorio?.id);
        }}
      />

      {/* Copy Signature Modal — copia assinatura para outra FS */}
      <CopySignatureModal
        open={copySignatureModalOpen}
        onOpenChange={(o) => {
          setCopySignatureModalOpen(o);
          if (!o) setSignatureToCopy(null);
        }}
        signature={signatureToCopy}
        currentRelatorioId={selectedRelatorio?.id}
        onCopied={() => {
          // Se por acaso o utilizador copiou para a FS actual (não é possível — a UI exclui),
          // ou queremos apenas refrescar dados. Aqui nada específico é preciso já que a FS actual
          // não é afectada. Mantemos vazio para simplicidade.
        }}
      />

      {/* PDF Preview Modal - Componente Extraído */}
      <PDFPreviewModal
        open={showPDFPreviewModal}
        onOpenChange={closePDFPreview}
        pdfUrl={pdfPreviewUrl}
        title={`Visualização do PDF - FS #${selectedRelatorio?.numero_assistencia}`}
        onDownload={() => {
          if (pdfPreviewUrl) {
            const link = document.createElement('a');
            link.href = pdfPreviewUrl;
            link.download = `FS_${selectedRelatorio?.numero_assistencia}.pdf`;
            link.click();
          }
        }}
      />

      {/* HTML Preview Modal — iframe do PDF final + horas por técnico (só visualização) */}
      <Dialog open={showHTMLPreviewModal} onOpenChange={(o) => {
        if (!o) {
          if (htmlPreviewData?.pdfUrl) URL.revokeObjectURL(htmlPreviewData.pdfUrl);
          setHtmlPreviewData(null);
        }
        setShowHTMLPreviewModal(o);
      }}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-5xl h-[95vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="p-4 border-b border-gray-700 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-white">
              <Eye className="w-5 h-5 text-emerald-400" />
              Visualizar Relatório — FS #{selectedRelatorio?.numero_assistencia}
            </DialogTitle>
            <DialogDescription className="sr-only">Visualização do relatório com PDF e horas por técnico.</DialogDescription>
          </DialogHeader>

          {/* Detalhe de registos por técnico (só nesta vista, não vai no PDF) */}
          {htmlPreviewData?.registosDetalhados?.length > 0 && (
            <div className="bg-[#0f0f0f] border-b border-gray-700 px-4 py-3 shrink-0 max-h-[35vh] overflow-auto">
              <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">
                Registos de trabalho <span className="text-gray-500 normal-case">(só nesta visualização — {htmlPreviewData.registosDetalhados.length})</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="preview-registos-table">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="py-2 pr-3 font-medium">Nome</th>
                      <th className="py-2 pr-3 font-medium">Tipo</th>
                      <th className="py-2 pr-3 font-medium">Data</th>
                      <th className="py-2 pr-3 font-medium">Início</th>
                      <th className="py-2 pr-3 font-medium">Fim</th>
                      <th className="py-2 pr-3 font-medium text-right">Horas</th>
                      <th className="py-2 pr-3 font-medium text-right">Km</th>
                      <th className="py-2 pr-3 font-medium">Código</th>
                    </tr>
                  </thead>
                  <tbody>
                    {htmlPreviewData.registosDetalhados.map((r, i) => (
                      <tr
                        key={i}
                        className="border-b border-gray-800/60 hover:bg-white/[0.02]"
                        data-testid={`preview-registo-row-${i}`}
                      >
                        <td className="py-1.5 pr-3 text-white">{r.nome}</td>
                        <td className="py-1.5 pr-3">
                          <span className={
                            r.tipo === 'viagem'
                              ? 'inline-block px-2 py-0.5 rounded-full text-xs bg-blue-900/30 text-blue-300 border border-blue-700/40'
                              : r.tipo === 'manual'
                              ? 'inline-block px-2 py-0.5 rounded-full text-xs bg-amber-900/30 text-amber-300 border border-amber-700/40'
                              : 'inline-block px-2 py-0.5 rounded-full text-xs bg-emerald-900/30 text-emerald-300 border border-emerald-700/40'
                          }>
                            {r.tipo}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 text-gray-300">{r.data}</td>
                        <td className="py-1.5 pr-3 text-gray-300">{r.inicio}</td>
                        <td className="py-1.5 pr-3 text-gray-300">{r.fim}</td>
                        <td className="py-1.5 pr-3 text-emerald-300 text-right font-semibold">{Number(r.horas).toFixed(2)}h</td>
                        <td className="py-1.5 pr-3 text-gray-300 text-right">{r.km}</td>
                        <td className="py-1.5 pr-3 text-gray-400 font-mono text-xs">{r.codigo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PDF renderizado via pdfjs em <canvas> — fiável dentro de Dialog Radix */}
          <div className="flex-1 min-h-0 bg-neutral-100">
            {htmlPreviewData?.pdfUrl ? (
              <PdfCanvasViewer url={htmlPreviewData.pdfUrl} scale={1.4} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">A carregar…</div>
            )}
          </div>

          {/* Rodapé */}
          <div className="border-t border-gray-700 p-4 flex justify-end gap-3 shrink-0">
            <Button
              variant="outline"
              onClick={() => setShowHTMLPreviewModal(false)}
              className="border-gray-600"
            >
              Fechar
            </Button>
            <Button
              onClick={openSignatureFromPreview}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="assine-aqui-btn"
            >
              <PenTool className="w-4 h-4 mr-2" />
              Assine Aqui
            </Button>
            {htmlPreviewData?.pdfUrl && (
              <Button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = htmlPreviewData.pdfUrl;
                  link.download = `FS_${selectedRelatorio?.numero_assistencia || 'relatorio'}.pdf`;
                  link.click();
                }}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            )}
          </div>
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
            <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
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
                  Se preenchido, a FS aparece no calendário em todos os dias do intervalo
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

            {/* Referência Interna do Cliente */}
            <div>
              <Label htmlFor="edit_motivo_assistencia" className="text-gray-300">
                Motivo da Assistência
              </Label>
              <textarea
                id="edit_motivo_assistencia"
                value={relatorioFormData.motivo_assistencia || ''}
                onChange={(e) => setRelatorioFormData({ ...relatorioFormData, motivo_assistencia: e.target.value })}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md p-2 min-h-[80px]"
                placeholder="Motivo da assistência..."
                data-testid="edit-motivo-input"
              />
            </div>

            <div>
              <Label htmlFor="edit_referencia_interna" className="text-gray-300">
                Referência Interna do Cliente
              </Label>
              <Input
                id="edit_referencia_interna"
                value={relatorioFormData.referencia_interna_cliente || ''}
                onChange={(e) => setRelatorioFormData({ ...relatorioFormData, referencia_interna_cliente: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                placeholder="Referência interna, nº encomenda, etc."
                data-testid="edit-ref-interna-input"
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

      {/* Change Tipo Modal */}
      <ChangeTipoModal
        open={showTipoModal}
        onOpenChange={setShowTipoModal}
        tecnico={selectedTecnicoForTipo}
        onChangeTipo={handleChangeTipo}
        onCancel={() => {
          setShowTipoModal(false);
          setSelectedTecnicoForTipo(null);
        }}
      />

      {/* Change Status Modal */}
      <StatusChangeModal
        open={showStatusModal}
        onOpenChange={setShowStatusModal}
        selectedStatusRelatorio={selectedStatusRelatorio}
        onChangeStatus={handleChangeStatus}
        onCancel={() => {
          setShowStatusModal(false);
          setSelectedStatusRelatorio(null);
        }}
        isAdmin={user?.is_admin}
      />

      {/* Delete Relatório Confirmation Modal */}
      <DeleteRelatorioModal
        open={showDeleteRelatorioModal}
        onOpenChange={setShowDeleteRelatorioModal}
        relatorioToDelete={relatorioToDelete}
        onConfirm={handleDeleteRelatorio}
        onCancel={() => {
          setShowDeleteRelatorioModal(false);
          setRelatorioToDelete(null);
        }}
      />

      {/* Add Cliente Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Plus className="w-5 h-5 text-blue-400" />
              Adicionar Novo Cliente
            </DialogTitle>
            <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
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

            <div className="flex items-center gap-3 p-3 bg-[#0f0f0f] rounded-lg border border-gray-700">
              <input
                type="checkbox"
                id="add-ref-interna"
                checked={formData.incluir_referencia_interna}
                onChange={(e) => setFormData({ ...formData, incluir_referencia_interna: e.target.checked })}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
                data-testid="add-checkbox-ref-interna"
              />
              <Label htmlFor="add-ref-interna" className="text-gray-300 cursor-pointer text-sm">
                Incluir Referência Interna na FS
              </Label>
            </div>

            {formData.incluir_referencia_interna && (
              <div>
                <Label htmlFor="add-email-ref-interna" className="text-gray-300 text-sm">
                  Email para Referência Interna <span className="text-gray-500 text-xs">(opcional - se vazio usa o email principal)</span>
                </Label>
                <Input
                  id="add-email-ref-interna"
                  type="email"
                  value={formData.email_referencia_interna || ''}
                  onChange={(e) => setFormData({ ...formData, email_referencia_interna: e.target.value })}
                  placeholder="email@especifico.com"
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                  data-testid="add-input-email-ref-interna"
                />
              </div>
            )}

            <div className="flex items-start gap-3 p-3 bg-[#0f0f0f] rounded-lg border border-amber-700/40">
              <input
                type="checkbox"
                id="add-faturar-viagens-curtas"
                checked={formData.faturar_viagens_curtas}
                onChange={(e) => setFormData({ ...formData, faturar_viagens_curtas: e.target.checked })}
                className="w-4 h-4 mt-0.5 rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500"
                data-testid="add-checkbox-faturar-viagens-curtas"
              />
              <Label htmlFor="add-faturar-viagens-curtas" className="text-gray-300 cursor-pointer text-sm leading-tight">
                Faturar viagens curtas (&lt;30min) na Folha de Horas
                <span className="block text-gray-500 text-xs mt-0.5">Por defeito, viagens com menos de 30min só cobram KM. Ative para cobrar também as horas (ex.: Kannegiesser).</span>
              </Label>
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
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Edit className="w-5 h-5 text-blue-400" />
              Editar Cliente
            </DialogTitle>
            <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
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

            <div className="flex items-center gap-3 p-3 bg-[#0f0f0f] rounded-lg border border-gray-700">
              <input
                type="checkbox"
                id="edit-ref-interna"
                checked={formData.incluir_referencia_interna}
                onChange={(e) => setFormData({ ...formData, incluir_referencia_interna: e.target.checked })}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
                data-testid="checkbox-ref-interna"
              />
              <Label htmlFor="edit-ref-interna" className="text-gray-300 cursor-pointer text-sm">
                Incluir Referência Interna na FS
              </Label>
            </div>

            {formData.incluir_referencia_interna && (
              <div>
                <Label htmlFor="edit-email-ref-interna" className="text-gray-300 text-sm">
                  Email para Referência Interna <span className="text-gray-500 text-xs">(opcional - se vazio usa o email principal)</span>
                </Label>
                <Input
                  id="edit-email-ref-interna"
                  type="email"
                  value={formData.email_referencia_interna || ''}
                  onChange={(e) => setFormData({ ...formData, email_referencia_interna: e.target.value })}
                  placeholder="email@especifico.com"
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                  data-testid="input-email-ref-interna"
                />
              </div>
            )}

            <div className="flex items-start gap-3 p-3 bg-[#0f0f0f] rounded-lg border border-amber-700/40">
              <input
                type="checkbox"
                id="edit-faturar-viagens-curtas"
                checked={formData.faturar_viagens_curtas}
                onChange={(e) => setFormData({ ...formData, faturar_viagens_curtas: e.target.checked })}
                className="w-4 h-4 mt-0.5 rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500"
                data-testid="edit-checkbox-faturar-viagens-curtas"
              />
              <Label htmlFor="edit-faturar-viagens-curtas" className="text-gray-300 cursor-pointer text-sm leading-tight">
                Faturar viagens curtas (&lt;30min) na Folha de Horas
                <span className="block text-gray-500 text-xs mt-0.5">Por defeito, viagens com menos de 30min só cobram KM. Ative para cobrar também as horas (ex.: Kannegiesser).</span>
              </Label>
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
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <User className="w-5 h-5 text-blue-400" />
              Detalhes do Cliente
            </DialogTitle>
            <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
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
                          key={`${trimmedEmail}-${index}`}
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
            <div className="flex items-center justify-between w-full pr-8">
              <DialogTitle className="flex items-center gap-2 text-white">
                <Settings className="w-5 h-5 text-amber-400" />
                Equipamentos do Cliente
              </DialogTitle>
              <Button
                onClick={() => {
                  setClienteEquipForm({ tipologia: '', marca: '', modelo: '', numero_serie: '', ano_fabrico: '' });
                  setShowAddClienteEquipModal(true);
                }}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                data-testid="add-cliente-equip-btn"
              >
                <Plus className="w-4 h-4 mr-1" />
                Adicionar
              </Button>
            </div>
              <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            {clienteEquipamentos.length === 0 ? (
              <div className="text-center py-12">
                <Settings className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">Nenhum equipamento cadastrado para este cliente</p>
                <Button
                  onClick={() => {
                    setClienteEquipForm({ tipologia: '', marca: '', modelo: '', numero_serie: '', ano_fabrico: '' });
                    setShowAddClienteEquipModal(true);
                  }}
                  className="mt-4 bg-emerald-600 hover:bg-emerald-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Equipamento
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-gray-400 text-sm mb-4">
                  Total: {clienteEquipamentos.length} equipamento(s)
                </div>
                
                {/* Agrupar por marca */}
                {Object.entries(
                  clienteEquipamentos.reduce((groups, eq) => {
                    const marca = eq.marca || 'Sem Marca';
                    if (!groups[marca]) groups[marca] = [];
                    groups[marca].push(eq);
                    return groups;
                  }, {})
                ).sort(([a], [b]) => a.localeCompare(b)).map(([marca, equips]) => (
                  <div key={marca} className="mb-6">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-700">
                      <Package className="w-4 h-4 text-amber-400" />
                      <h3 className="text-amber-400 font-semibold text-base">{marca}</h3>
                      <span className="text-gray-500 text-xs">({equips.length})</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {equips.map((equipamento) => (
                    <div
                      key={equipamento.id}
                      className="bg-[#0f0f0f] border border-gray-700 rounded-lg p-4 hover:border-amber-500 transition"
                    >
                      {/* Header with actions */}
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
                        <div className="flex gap-1">
                          <Button
                            onClick={() => {
                              setSelectedEquipamento(equipamento);
                              setClienteEquipForm({
                                tipologia: equipamento.tipologia || '',
                                marca: equipamento.marca || '',
                                modelo: equipamento.modelo || '',
                                numero_serie: equipamento.numero_serie || '',
                                ano_fabrico: equipamento.ano_fabrico || '',
                                horas_funcionamento: equipamento.horas_funcionamento || ''
                              });
                              setShowEditClienteEquipModal(true);
                            }}
                            size="sm"
                            variant="ghost"
                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                            data-testid={`edit-equip-${equipamento.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => handleDeleteClienteEquip(equipamento.id)}
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            data-testid={`delete-equip-${equipamento.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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
                            <span className="text-xs text-gray-500">N. Série:</span>
                            <p className="text-sm text-gray-300 font-mono">{equipamento.numero_serie}</p>
                          </div>
                        )}
                        
                        {equipamento.ano_fabrico && (
                          <div>
                            <span className="text-xs text-gray-500">Ano de Fabrico:</span>
                            <p className="text-sm text-gray-300">{equipamento.ano_fabrico}</p>
                          </div>
                        )}

                        {equipamento.horas_funcionamento && (
                          <div>
                            <span className="text-xs text-gray-500">Horas de Funcionamento:</span>
                            <p className="text-sm text-gray-300">{equipamento.horas_funcionamento}</p>
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

                      {/* Ver Intervenções Button */}
                      <Button
                        onClick={() => {
                          setShowClienteEquipamentosModal(false);
                          fetchEquipamentoIntervencoes(equipamento);
                        }}
                        size="sm"
                        className="w-full bg-purple-600 hover:bg-purple-700"
                        data-testid={`ver-intervencoes-btn-${equipamento.id}`}
                      >
                        <Wrench className="w-3 h-3 mr-1" />
                        Ver Intervenções
                      </Button>
                    </div>
                  ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Equipamento do Cliente Modal */}
      <Dialog open={showAddClienteEquipModal} onOpenChange={setShowAddClienteEquipModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Plus className="w-5 h-5 text-emerald-400" />
              Novo Equipamento
            </DialogTitle>
            <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddClienteEquip} className="space-y-4 mt-4">
            <div>
              <Label className="text-gray-300">Tipologia</Label>
              <Input
                value={clienteEquipForm.tipologia}
                onChange={(e) => setClienteEquipForm(prev => ({ ...prev, tipologia: e.target.value }))}
                placeholder="Ex: Lavadora, Secador, Calandra..."
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300">Marca *</Label>
                <Input
                  value={clienteEquipForm.marca}
                  onChange={(e) => setClienteEquipForm(prev => ({ ...prev, marca: e.target.value }))}
                  placeholder="Ex: Kannegiesser"
                  className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                  required
                />
              </div>
              <div>
                <Label className="text-gray-300">Modelo *</Label>
                <Input
                  value={clienteEquipForm.modelo}
                  onChange={(e) => setClienteEquipForm(prev => ({ ...prev, modelo: e.target.value }))}
                  placeholder="Ex: PowerTrans 3200"
                  className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300">N. Série</Label>
                <Input
                  value={clienteEquipForm.numero_serie}
                  onChange={(e) => setClienteEquipForm(prev => ({ ...prev, numero_serie: e.target.value }))}
                  placeholder="Ex: SN-12345"
                  className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-gray-300">Ano Fabrico</Label>
                <Input
                  value={clienteEquipForm.ano_fabrico}
                  onChange={(e) => setClienteEquipForm(prev => ({ ...prev, ano_fabrico: e.target.value }))}
                  placeholder="Ex: 2020"
                  className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-gray-300">Horas de Funcionamento</Label>
              <Input
                value={clienteEquipForm.horas_funcionamento}
                onChange={(e) => setClienteEquipForm(prev => ({ ...prev, horas_funcionamento: e.target.value }))}
                placeholder="Ex: 1500"
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowAddClienteEquipModal(false)} className="border-gray-600">
                Cancelar
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-1" />
                Adicionar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Equipamento do Cliente Modal */}
      <Dialog open={showEditClienteEquipModal} onOpenChange={setShowEditClienteEquipModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Edit className="w-5 h-5 text-blue-400" />
              Editar Equipamento
            </DialogTitle>
            <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditClienteEquip} className="space-y-4 mt-4">
            <div>
              <Label className="text-gray-300">Tipologia</Label>
              <Input
                value={clienteEquipForm.tipologia}
                onChange={(e) => setClienteEquipForm(prev => ({ ...prev, tipologia: e.target.value }))}
                placeholder="Ex: Lavadora, Secador, Calandra..."
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300">Marca *</Label>
                <Input
                  value={clienteEquipForm.marca}
                  onChange={(e) => setClienteEquipForm(prev => ({ ...prev, marca: e.target.value }))}
                  className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                  required
                />
              </div>
              <div>
                <Label className="text-gray-300">Modelo *</Label>
                <Input
                  value={clienteEquipForm.modelo}
                  onChange={(e) => setClienteEquipForm(prev => ({ ...prev, modelo: e.target.value }))}
                  className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300">N. Série</Label>
                <Input
                  value={clienteEquipForm.numero_serie}
                  onChange={(e) => setClienteEquipForm(prev => ({ ...prev, numero_serie: e.target.value }))}
                  className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-gray-300">Ano Fabrico</Label>
                <Input
                  value={clienteEquipForm.ano_fabrico}
                  onChange={(e) => setClienteEquipForm(prev => ({ ...prev, ano_fabrico: e.target.value }))}
                  className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-gray-300">Horas de Funcionamento</Label>
              <Input
                value={clienteEquipForm.horas_funcionamento}
                onChange={(e) => setClienteEquipForm(prev => ({ ...prev, horas_funcionamento: e.target.value }))}
                placeholder="Ex: 1500"
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowEditClienteEquipModal(false)} className="border-gray-600">
                Cancelar
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                <Check className="w-4 h-4 mr-1" />
                Guardar
              </Button>
            </div>
          </form>
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
              <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
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
                            const toastId = toast.loading('A gerar PDF... 0s');
                            try {
                              await downloadFSPdfToFile({
                                api: API,
                                relatorioId: relatorio.id,
                                axios,
                                fallbackFilename: `FS_${relatorio.numero_assistencia}.pdf`,
                                onProgress: (elapsed) => {
                                  toast.loading(`A gerar PDF... ${Math.round(elapsed)}s`, { id: toastId });
                                },
                              });
                              toast.success('PDF descarregado com sucesso!', { id: toastId, duration: 2500 });
                            } catch (error) {
                              toast.error(`Erro ao descarregar PDF: ${error?.message || 'desconhecido'}`, { id: toastId, duration: 8000 });
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

      {/* Intervenções do Equipamento Modal */}
      <Dialog open={showEquipamentoOTsModal} onOpenChange={setShowEquipamentoOTsModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Wrench className="w-5 h-5 text-purple-400" />
              Intervenções do Equipamento
              {selectedEquipamento && (
                <span className="text-sm text-gray-400 ml-2">
                  ({selectedEquipamento.marca} {selectedEquipamento.modelo})
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3" data-testid="intervencoes-equipamento-list">
            {equipamentoIntervencoes.length === 0 ? (
              <div className="text-center py-12">
                <Wrench className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">Nenhuma intervenção encontrada</p>
              </div>
            ) : (
              <>
                <p className="text-gray-400 text-sm">
                  Total: {equipamentoIntervencoes.length} intervenção(ões)
                </p>
                {equipamentoIntervencoes.map((interv) => {
                  const isExpanded = expandedIntervencao === interv.id;
                  return (
                    <div
                      key={interv.id}
                      className="bg-[#0f0f0f] border border-gray-700 rounded-lg overflow-hidden hover:border-purple-500/50 transition"
                      data-testid={`intervencao-card-${interv.id}`}
                    >
                      <button
                        onClick={() => setExpandedIntervencao(isExpanded ? null : interv.id)}
                        className="w-full flex items-center justify-between p-4 text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                            <Wrench className="w-4 h-4 text-purple-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-white font-medium text-sm">
                              Intervenção — <span className="text-blue-400">FS #{interv.ot_numero}</span> — {interv.data_intervencao ? new Date(interv.data_intervencao + 'T00:00:00').toLocaleDateString('pt-PT') : '-'}
                            </p>
                            <p className="text-gray-500 text-xs truncate">{interv.ot_local}</p>
                          </div>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </button>
                      
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-3 border-t border-gray-800">
                          <div className="pt-3">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Motivo</p>
                            <p className="text-sm text-gray-300 whitespace-pre-wrap">
                              {interv.motivo_assistencia || <span className="text-gray-600 italic">Sem motivo registado</span>}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <DeleteClienteModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        cliente={clienteToDelete}
        onConfirm={handleDeleteCliente}
        onCancel={() => {
          setShowDeleteModal(false);
          setClienteToDelete(null);
        }}
      />

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
            <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
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
                  <SelectItem value="oficina" className="text-white">Oficina</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Função na FS */}
            <div>
              <Label className="text-gray-300">Função na FS *</Label>
              <Select
                value={addRegistoManualForm.funcao_ot}
                onValueChange={(val) => setAddRegistoManualForm(prev => ({ ...prev, funcao_ot: val }))}
              >
                <SelectTrigger data-testid="manual-funcao-ot-select" className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="junior" className="text-white">Téc. Júnior</SelectItem>
                  <SelectItem value="tecnico" className="text-white">Técnico</SelectItem>
                  <SelectItem value="senior" className="text-white">Téc. Sénior</SelectItem>
                  <SelectItem value="ajudante" className="text-white">Ajudante</SelectItem>
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

      {/* Popup Função na FS para Cronómetro */}
      <CronometroFuncaoPopup
        open={showCronometroFuncaoPopup}
        onOpenChange={setShowCronometroFuncaoPopup}
        cronometroFuncaoData={cronometroFuncaoData}
        setCronometroFuncaoData={setCronometroFuncaoData}
        onConfirm={handleConfirmCronometroFuncao}
      />

      {/* Modal Parar Cronómetro - KMs */}
      <StopCronometroPopup
        open={showStopCronoPopup}
        onOpenChange={setShowStopCronoPopup}
        stopCronoData={stopCronoData}
        setStopCronoData={setStopCronoData}
        onStop={async () => {
          const kmFinal = stopCronoData.km_final ? parseFloat(stopCronoData.km_final) : 0;
          for (const tec of (stopCronoData.tecnicos || [])) {
            await handlePararCronometro(tec, stopCronoData.tipo, kmFinal);
          }
          setShowStopCronoPopup(false);
        }}
      />

      {/* Modal KMs Deslocação durante Trabalho */}
      <WorkKmPopup
        open={showWorkKmPopup}
        onOpenChange={setShowWorkKmPopup}
        workKmData={workKmData}
        setWorkKmData={setWorkKmData}
      />

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
            <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
          </DialogHeader>

          {editingRegisto && (
            <div className="space-y-4 mt-4">
              {/* Técnico e Data - agora editáveis */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-300 text-xs">Técnico</Label>
                  <Select
                    value={editRegistoForm.tecnico_id}
                    onValueChange={(val) => {
                      const u = allSystemUsers.find((x) => x.id === val);
                      setEditRegistoForm((prev) => ({
                        ...prev,
                        tecnico_id: val,
                        tecnico_nome: u?.full_name || u?.username || prev.tecnico_nome,
                      }));
                    }}
                  >
                    <SelectTrigger data-testid="edit-registo-tecnico-select" className="bg-gray-800 border-gray-700 text-white mt-1">
                      <SelectValue placeholder={editRegistoForm.tecnico_nome || 'Selecionar técnico'} />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {(Array.isArray(allSystemUsers) ? allSystemUsers : []).map((u) => (
                        <SelectItem key={u.id} value={u.id} className="text-white">
                          {u.full_name || u.username || 'Sem nome'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-300 text-xs">Data</Label>
                  <Input
                    type="date"
                    value={editRegistoForm.data}
                    onChange={(e) => setEditRegistoForm((prev) => ({ ...prev, data: e.target.value }))}
                    className="bg-gray-800 border-gray-700 text-white mt-1"
                    data-testid="edit-registo-data-input"
                  />
                </div>
              </div>

              {/* Tipo de Registo */}
              <div>
                <Label className="text-gray-300">Tipo de Registo</Label>
                <Select
                  value={editRegistoForm.entry_type}
                  onValueChange={(val) => setEditRegistoForm(prev => ({ ...prev, entry_type: val }))}
                >
                  <SelectTrigger data-testid="edit-entry-type-select" className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="trabalho" className="text-green-400">Trabalho</SelectItem>
                    <SelectItem value="viagem" className="text-blue-400">Viagem</SelectItem>
                    <SelectItem value="oficina" className="text-orange-400">Oficina</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tipo de Técnico */}
              <div>
                <Label className="text-gray-300">Tipo de Técnico</Label>
                <Select
                  value={editRegistoForm.funcao_ot}
                  onValueChange={(val) => setEditRegistoForm(prev => ({ ...prev, funcao_ot: val }))}
                >
                  <SelectTrigger data-testid="edit-funcao-ot-select" className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="junior" className="text-white">Téc. Júnior</SelectItem>
                    <SelectItem value="tecnico" className="text-white">Técnico</SelectItem>
                    <SelectItem value="senior" className="text-white">Téc. Sénior</SelectItem>
                    <SelectItem value="ajudante" className="text-white">Ajudante</SelectItem>
                  </SelectContent>
                </Select>
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
                            if (mins < 0) mins += 24 * 60;
                            updated.minutos_trabalhados = mins;
                            // Calcular arredondamento para preview
                            const remainder = mins % 60;
                            const baseHours = Math.floor(mins / 60);
                            if (remainder <= 10) updated.horas_arredondadas = baseHours;
                            else if (remainder <= 40) updated.horas_arredondadas = baseHours + 0.5;
                            else updated.horas_arredondadas = baseHours + 1;
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
                            if (mins < 0) mins += 24 * 60;
                            updated.minutos_trabalhados = mins;
                            // Calcular arredondamento para preview
                            const remainder = mins % 60;
                            const baseHours = Math.floor(mins / 60);
                            if (remainder <= 10) updated.horas_arredondadas = baseHours;
                            else if (remainder <= 40) updated.horas_arredondadas = baseHours + 0.5;
                            else updated.horas_arredondadas = baseHours + 1;
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
                    {editRegistoForm.horas_arredondadas != null && (
                      <span className="ml-2 text-green-400">
                        (Arredondado: {Math.floor(editRegistoForm.horas_arredondadas)}h {Math.round((editRegistoForm.horas_arredondadas % 1) * 60)}min)
                      </span>
                    )}
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

              {/* Total Final de Kms */}
              <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-green-400 font-semibold flex items-center gap-2">
                    <Car className="w-4 h-4" />
                    Total KM
                  </Label>
                  <div className="text-xl font-bold text-green-400">
                    {Math.max(0, (parseFloat(editRegistoForm.kms_final) || 0) - (parseFloat(editRegistoForm.kms_inicial) || 0)).toFixed(1)} km
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

      {/* Modal Confirmação Apagar Despesa */}
      <AlertDialog open={!!despesaToDelete} onOpenChange={(open) => { if (!open) setDespesaToDelete(null); }}>
        <AlertDialogContent className="bg-[#1a1a1a] border-gray-700 text-white" data-testid="modal-delete-despesa">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Apagar Despesa</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Tem a certeza que deseja apagar esta despesa?
              {despesaToDelete && (
                <span className="block mt-2 text-white font-medium">
                  {despesaToDelete.descricao} — {despesaToDelete.valor?.toFixed(2)}€
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-700 text-white border-gray-600 hover:bg-gray-600">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => handleDeleteDespesa(despesaToDelete?.id)}
              data-testid="btn-confirm-delete-despesa"
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Confirmar Apagar Intervenção */}
      <AlertDialog open={!!intervencaoToDelete} onOpenChange={(open) => { if (!open) setIntervencaoToDelete(null); }}>
        <AlertDialogContent className="bg-[#1a1a1a] border-gray-700 text-white" data-testid="modal-delete-intervencao">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Apagar Intervenção</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Tem a certeza que deseja apagar esta intervenção? Todos os dados associados (relatórios, fotografias, materiais) serão removidos.
              {intervencaoToDelete && (
                <span className="block mt-2 text-white font-medium">
                  {new Date(intervencaoToDelete.data_intervencao).toLocaleDateString('pt-PT')}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-700 text-white border-gray-600 hover:bg-gray-600">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => handleDeleteIntervencao(intervencaoToDelete?.id)}
              data-testid="btn-confirm-delete-intervencao"
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Referência Interna do Cliente */}
      <ReferenciaInternaModal
        open={showReferenciaInternaModal}
        value={referenciaInternaValue}
        setValue={setReferenciaInternaValue}
        onIgnorar={handleIgnorarReferenciaInterna}
        onGravar={handleGravarReferenciaInterna}
      />

      {/* Modal Iniciar Cronómetro após criar FS */}
      <IniciarCronoModal
        open={showIniciarCronoModal}
        onClose={() => {
          setShowIniciarCronoModal(false);
          setNovaOTParaCrono(null);
          setCronoTecnicosSelecionados([]);
        }}
        novaOT={novaOTParaCrono}
        cronoTipo={cronoTipo}
        setCronoTipo={setCronoTipo}
        allSystemUsers={allSystemUsers}
        tecnicosSelecionados={cronoTecnicosSelecionados}
        setTecnicosSelecionados={setCronoTecnicosSelecionados}
        onIniciar={handleIniciarCronoNovaOT}
      />

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
        despesas={despesas}
      />

      {/* DespesasEmailModal removido — despesas agora gravam `valor_final` no
          popup da FS (não há mais popup de ajuste na geração de folha). */}

      {/* Modal de Criar FS de Continuidade */}
      <CriarContinuidadeModal
        open={showContinuidadeModal}
        onOpenChange={setShowContinuidadeModal}
        intervencoes={intervencoes}
        selectedIds={continuidadeIds}
        setSelectedIds={setContinuidadeIds}
        onConfirmar={handleConfirmarContinuidade}
        saving={savingContinuidade}
      />

      {/* AI Review Modal */}
      <FSAIReviewModal
        open={showAIReview}
        onOpenChange={setShowAIReview}
        relatorioId={selectedRelatorio?.id}
        onApplied={() => { if (selectedRelatorio?.id) fetchRelatoriosAssistencia(selectedRelatorio.id); }}
      />

      {/* Relatório Simples Modal (estilo Word, sem fotos) */}
      <RelatorioSimplesModal
        open={showRelatorioSimplesModal}
        onOpenChange={(open) => {
          setShowRelatorioSimplesModal(open);
          if (!open) setRelatorioSimplesTarget(null);
        }}
        relatorio={relatorioSimplesTarget}
        clienteNome={relatorioSimplesTarget?.cliente_nome}
      />
    </div>
  );
};

export default TechnicalReports;
