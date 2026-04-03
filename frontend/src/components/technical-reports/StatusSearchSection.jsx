import React from 'react';
import { FileText, Search } from 'lucide-react';

import { Label } from '@/components/ui/label';

import ReportCard from './ReportCard';
import { REPORT_STATUS_OPTIONS } from './utils/reports';

const StatusSearchSection = ({
  activeTab,
  isDark,
  isMobile,
  user,
  borderColor,
  bgCardAlt,
  loading,
  statusFilter,
  filteredByStatus,
  textPrimary,
  textSecondary,
  handleStatusFilterChange,
  getStatusLabel,
  getStatusColor,
  openViewRelatorioModal,
  openEditRelatorioModal,
  openStatusModal,
  setRelatorioToDelete,
  setShowDeleteRelatorioModal,
}) => {
  if (activeTab !== 'pesquisa') {
    return null;
  }

  const handleDeleteRelatorioModal = (relatorio, event) => {
    if (event) {
      event.stopPropagation();
    }

    setRelatorioToDelete(relatorio);
    setShowDeleteRelatorioModal(true);
  };

  const handleEditRelatorio = (relatorio, event) => {
    if (event) {
      event.stopPropagation();
    }

    openEditRelatorioModal(relatorio);
  };

  return (
    <div className={`${isDark ? 'glass-effect' : 'bg-white shadow-lg border ' + borderColor} ${isMobile ? 'p-4' : 'p-6'} rounded-xl`}>
      <div className={`${isMobile ? 'mb-4' : 'mb-6'}`}>
        <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-semibold ${textPrimary} ${isMobile ? 'mb-3' : 'mb-4'}`}>
          Pesquisa por Estado
        </h2>

        <div className={`${isMobile ? 'w-full' : 'max-w-md'}`}>
          <Label className={`${textSecondary} mb-2 block ${isMobile ? 'text-sm' : ''}`}>Selecione o Estado</Label>
          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
            className={`w-full ${bgCardAlt} border ${borderColor} ${textPrimary} rounded-md ${isMobile ? 'px-3 py-2 text-sm' : 'px-4 py-3'} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
          >
            <option value="">-- Selecione um estado --</option>
            {REPORT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.icon} {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

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
                <ReportCard
                  key={relatorio.id}
                  relatorio={relatorio}
                  isDark={isDark}
                  isMobile={isMobile}
                  user={user}
                  borderColor={`border ${borderColor}`}
                  cardClassName={bgCardAlt}
                  textPrimary={textPrimary}
                  textSecondary={textSecondary}
                  getStatusColor={getStatusColor}
                  getStatusLabel={getStatusLabel}
                  openViewRelatorioModal={openViewRelatorioModal}
                  openEditRelatorioModal={handleEditRelatorio}
                  openDeleteRelatorioModal={handleDeleteRelatorioModal}
                  openStatusModal={openStatusModal}
                  showRelatedReports={false}
                />
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
  );
};

export default StatusSearchSection;
