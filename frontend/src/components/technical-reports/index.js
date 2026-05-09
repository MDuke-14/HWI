// Technical Reports Components - Modals
export { default as FolhaHorasModal } from './FolhaHorasModal';
export { default as DespesasEmailModal } from './DespesasEmailModal';
export { default as EquipamentoModal } from './EquipamentoModal';
export { default as TecnicoModal } from './TecnicoModal';
export { default as AssinaturaModal } from './AssinaturaModal';
export { default as MaterialModal } from './MaterialModal';
export { default as PDFPreviewModal } from './PDFPreviewModal';
export { default as DeleteConfirmModal } from './DeleteConfirmModal';
export { default as CronometroStartModal } from './CronometroStartModal';

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
