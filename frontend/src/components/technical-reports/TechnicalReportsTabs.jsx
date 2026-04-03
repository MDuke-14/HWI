import React from 'react';
import { Building2, FileText, Link2, Search } from 'lucide-react';

const TechnicalReportsTabs = ({
  activeTab,
  isMobile,
  user,
  borderColor,
  textPrimary,
  textSecondary,
  setActiveTab,
  fetchAllPCs,
  fetchRefTokens,
}) => {
  const baseTabClass = isMobile
    ? 'px-3 py-2 text-sm whitespace-nowrap flex-shrink-0'
    : 'px-4 py-3';

  return (
    <div className={`${isMobile ? 'mb-4' : 'mb-6'}`}>
      <div className={`flex ${isMobile ? 'gap-1 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide' : 'gap-4'} border-b ${borderColor}`}>
        <button
          onClick={() => setActiveTab('clientes')}
          className={`${baseTabClass} font-semibold transition ${
            activeTab === 'clientes' ? 'text-blue-400 border-b-2 border-blue-400' : `${textSecondary} hover:${textPrimary}`
          }`}
          data-testid="tab-clientes"
        >
          <Building2 className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} inline mr-1.5`} />
          Clientes
        </button>

        <button
          onClick={() => setActiveTab('relatorios')}
          className={`${baseTabClass} font-semibold transition ${
            activeTab === 'relatorios' ? 'text-blue-400 border-b-2 border-blue-400' : `${textSecondary} hover:${textPrimary}`
          }`}
          data-testid="tab-ots"
        >
          <FileText className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} inline mr-1.5`} />
          {isMobile ? "FS's" : 'Folhas de Servico'}
        </button>

        <button
          onClick={() => setActiveTab('pesquisa')}
          className={`${baseTabClass} font-semibold transition ${
            activeTab === 'pesquisa' ? 'text-blue-400 border-b-2 border-blue-400' : `${textSecondary} hover:${textPrimary}`
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
          className={`${baseTabClass} font-semibold transition ${
            activeTab === 'pedidos-cotacao' ? 'text-yellow-400 border-b-2 border-yellow-400' : `${textSecondary} hover:${textPrimary}`
          }`}
          data-testid="tab-pcs"
        >
          <FileText className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} inline mr-1.5`} />
          {isMobile ? 'PCs' : 'Pedidos de Cotacao'}
        </button>

        {user?.is_admin && (
          <button
            onClick={() => {
              setActiveTab('referencias');
              fetchRefTokens();
            }}
            className={`${baseTabClass} font-semibold transition ${
              activeTab === 'referencias' ? 'text-indigo-400 border-b-2 border-indigo-400' : `${textSecondary} hover:${textPrimary}`
            }`}
            data-testid="tab-referencias"
          >
            <Link2 className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} inline mr-1.5`} />
            {isMobile ? 'Refs' : 'Ref. Internas'}
          </button>
        )}
      </div>
    </div>
  );
};

export default TechnicalReportsTabs;
