import React from 'react';
import { FileText, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';

import ReportCard from './ReportCard';
import { matchesReportSearch } from './utils/reports';

const FacturadosSection = ({
  activeTab,
  isDark,
  isMobile,
  user,
  borderColor,
  bgCard,
  loading,
  relatorios,
  searchTerm,
  setSearchTerm,
  textPrimary,
  textSecondary,
  openViewRelatorioModal,
  openEditRelatorioModal,
  openDeleteRelatorioModal,
  getStatusColor,
  getStatusLabel,
  openStatusModal,
}) => {
  if (activeTab !== 'facturados' || !user?.is_admin) {
    return null;
  }

  const facturados = relatorios
    .filter((r) => r.status === 'facturado')
    .filter((r) => matchesReportSearch(r, searchTerm))
    .sort((a, b) => (b.numero_assistencia || 0) - (a.numero_assistencia || 0));

  return (
    <div className={`${isDark ? 'glass-effect' : 'bg-white shadow-lg border ' + borderColor} ${isMobile ? 'p-4' : 'p-6'} rounded-xl`}>
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            type="text"
            placeholder={isMobile ? "Buscar facturado..." : "Buscar por numero, cliente ou local..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`pl-10 ${bgCard} ${borderColor} ${textPrimary} ${isMobile ? 'text-sm' : ''}`}
            data-testid="search-facturados"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className={`inline-block animate-spin rounded-full ${isMobile ? 'h-8 w-8' : 'h-12 w-12'} border-4 border-purple-500 border-t-transparent`}></div>
          <p className={`${textSecondary} mt-4 ${isMobile ? 'text-sm' : ''}`}>A carregar...</p>
        </div>
      ) : facturados.length === 0 ? (
        <div className="text-center py-8">
          <FileText className={`${isMobile ? 'w-12 h-12' : 'w-16 h-16'} text-gray-600 mx-auto mb-4`} />
          <p className={`${textSecondary} ${isMobile ? 'text-base' : 'text-lg'}`}>Nenhuma FS facturada</p>
        </div>
      ) : (
        <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}`}>
          {facturados.map((relatorio) => (
            <ReportCard
              key={relatorio.id}
              relatorio={relatorio}
              isDark={isDark}
              isMobile={isMobile}
              user={user}
              borderColor={`border ${borderColor}`}
              cardClassName={bgCard}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              getStatusColor={getStatusColor}
              getStatusLabel={getStatusLabel}
              openViewRelatorioModal={openViewRelatorioModal}
              openEditRelatorioModal={openEditRelatorioModal}
              openDeleteRelatorioModal={openDeleteRelatorioModal}
              openStatusModal={openStatusModal}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default FacturadosSection;
