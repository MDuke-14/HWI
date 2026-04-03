import React from 'react';
import { Building2, Download, Mail, MapPin, Phone, Plus, Search, Trash2, Edit, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';


const ClientsSection = ({
  activeTab,
  isDark,
  isMobile,
  user,
  borderColor,
  bgCard,
  loading,
  clientes,
  filteredClientes,
  searchTerm,
  setSearchTerm,
  textPrimary,
  textSecondary,
  downloadingClientesPDF,
  downloadingEmailsPDF,
  exportingDatabase,
  handleDownloadClientesPDF,
  handleDownloadEmailsPDF,
  handleExportDatabase,
  setShowAddModal,
  openViewModal,
  openEditModal,
  openDeleteModal,
}) => {
  if (activeTab !== 'clientes') {
    return null;
  }

  return (
    <div className={`${isDark ? 'glass-effect' : 'bg-white shadow-lg border ' + borderColor} ${isMobile ? 'p-4' : 'p-6'} rounded-xl`}>
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
              <Button
                onClick={handleExportDatabase}
                disabled={exportingDatabase}
                className="bg-slate-700 hover:bg-slate-800 text-white"
                data-testid="export-database-btn"
              >
                {exportingDatabase ? (
                  <>
                    <span className="animate-spin mr-2">â³</span>
                    A exportar...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5 mr-2" />
                    Exportar Base de Dados
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
  );
};


export default ClientsSection;
