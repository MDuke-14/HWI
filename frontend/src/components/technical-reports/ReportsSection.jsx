import React from 'react';
import { FileText, Plus, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import ReportCard from './ReportCard';
import { matchesReportSearch } from './utils/reports';

const ReportsSection = ({
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
  setShowAddRelatorioModal,
  openViewRelatorioModal,
  openEditRelatorioModal,
  openDeleteRelatorioModal,
  getStatusColor,
  getStatusLabel,
  openStatusModal,
}) => {
  if (activeTab !== 'relatorios') {
    return null;
  }

  const filteredRelatorios = relatorios.filter((relatorio) => matchesReportSearch(relatorio, searchTerm));

  return (
    <div className={`${isDark ? 'glass-effect' : 'bg-white shadow-lg border ' + borderColor} ${isMobile ? 'p-4' : 'p-6'} rounded-xl`}>
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            type="text"
            placeholder={isMobile ? 'Buscar OT...' : 'Buscar por numero, cliente ou local de intervencao...'}
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
          Nova FS
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className={`inline-block animate-spin rounded-full ${isMobile ? 'h-8 w-8' : 'h-12 w-12'} border-4 border-blue-500 border-t-transparent`}></div>
          <p className={`${textSecondary} mt-4 ${isMobile ? 'text-sm' : ''}`}>A carregar OTs...</p>
        </div>
      ) : relatorios.length === 0 ? (
        <div className="text-center py-8">
          <FileText className={`${isMobile ? 'w-12 h-12' : 'w-16 h-16'} text-gray-600 mx-auto mb-4`} />
          <p className={`${textSecondary} ${isMobile ? 'text-base' : 'text-lg'}`}>Nenhuma FS criada</p>
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
          {filteredRelatorios.map((relatorio) => (
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

          {searchTerm.trim() && filteredRelatorios.length === 0 && (
            <div className="col-span-full text-center py-8">
              <Search className={`${isMobile ? 'w-12 h-12' : 'w-16 h-16'} text-gray-600 mx-auto mb-4`} />
              <p className={`${textSecondary} ${isMobile ? 'text-base' : 'text-lg'}`}>
                Nenhuma FS encontrada para "{searchTerm}"
              </p>
              <p className={`${textSecondary} text-sm mt-2`}>
                Tente pesquisar por numero da OT, nome do cliente ou local de intervencao
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportsSection;
