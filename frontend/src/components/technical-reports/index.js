// Technical Reports Components - Modals
export { default as FolhaHorasModal } from './FolhaHorasModal';
export { default as EquipamentoModal } from './EquipamentoModal';
export { default as TecnicoModal } from './TecnicoModal';
export { default as AssinaturaModal } from './AssinaturaModal';
export { default as MaterialModal } from './MaterialModal';
export { default as PDFPreviewModal } from './PDFPreviewModal';
export { default as DeleteConfirmModal } from './DeleteConfirmModal';
export { default as CronometroStartModal } from './CronometroStartModal';
export { default as EmailModal } from './EmailModal';
export { default as StatusChangeModal } from './StatusChangeModal';
export { default as DeleteRelatorioModal } from './DeleteRelatorioModal';
export { default as AddFotoPCModal } from './AddFotoPCModal';
export { default as EmailPCModal } from './EmailPCModal';
export { default as HideClientPopup } from './HideClientPopup';
export { default as EditMaterialPCModal } from './EditMaterialPCModal';
export { default as EnviarPedidoCotacaoModal } from './EnviarPedidoCotacaoModal';
export { default as CancelarPCModal } from './CancelarPCModal';
export { default as AddMaterialToPCModal } from './AddMaterialToPCModal';
export { default as ChangeTipoModal } from './ChangeTipoModal';
export { default as DeleteClienteModal } from './DeleteClienteModal';
export { default as ReferenciaInternaModal } from './ReferenciaInternaModal';
export { default as IniciarCronoModal } from './IniciarCronoModal';
export { default as RelatorioSimplesModal } from './RelatorioSimplesModal';
export { CronometroFuncaoPopup, StopCronometroPopup, WorkKmPopup } from './CronometroPopups';

// Technical Reports Components - Sections
export { default as TechnicalReportsHeader } from './TechnicalReportsHeader';
export { default as TechnicalReportsTabs } from './TechnicalReportsTabs';
export { default as ClientsSection } from './ClientsSection';
export { default as ReportsSection } from './ReportsSection';
export { default as FacturadosSection } from './FacturadosSection';
export { default as StatusSearchSection } from './StatusSearchSection';
export { default as ReportCard } from './ReportCard';

// Utils
export { getTechnicalReportsAppearance } from './utils/appearance';
export { formatTechnicalReportError } from './utils/errors';
export { getTechnicalReportStatusColor, getTechnicalReportStatusLabel, getTipoHorarioLabel, getTipoHorarioCodigo } from './utils/labels';
export { matchesReportSearch, sortReportsByStatus, filterReportsByStatus, matchesClientSearch, REPORT_STATUS_OPTIONS } from './utils/reports';

// Custom Hooks
export { useRelatorios, useClientes } from './hooks';
