import React from 'react';
import { Edit, Link2, Trash2, User } from 'lucide-react';

import { Button } from '@/components/ui/button';

const ReportCard = ({
  relatorio,
  isDark,
  isMobile,
  user,
  borderColor,
  cardClassName,
  textPrimary,
  textSecondary,
  getStatusColor,
  getStatusLabel,
  openViewRelatorioModal,
  openEditRelatorioModal,
  openDeleteRelatorioModal,
  openStatusModal,
  showRelatedReports = true,
  footerLabel = true,
  equipmentTextClassName,
}) => {
  const equipmentTextClass = equipmentTextClassName || `${isMobile ? 'text-xs' : 'text-sm'} ${isDark ? 'text-gray-300' : 'text-gray-700'} truncate`;

  return (
    <div
      className={`${cardClassName} ${borderColor} rounded-lg ${isMobile ? 'p-3' : 'p-4'} hover:border-blue-500 transition`}
      data-testid={`ot-card-${relatorio.id}`}
      onClick={() => openViewRelatorioModal(relatorio)}
    >
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

      <div className={`${isMobile ? 'mb-2' : 'mb-3'} cursor-pointer`}>
        <p className={`${textPrimary} font-semibold ${isMobile ? 'text-sm' : ''} truncate`}>{relatorio.cliente_nome}</p>
        <p className={`${isMobile ? 'text-xs' : 'text-sm'} ${textSecondary} truncate`}>{relatorio.local_intervencao}</p>
        {showRelatedReports && relatorio.ot_relacionada_id && (
          <p className="text-blue-400 text-xs mt-0.5 flex items-center gap-1">
            <Link2 className="w-3 h-3" /> FS #{relatorio.ot_relacionada_numero}
          </p>
        )}
        {showRelatedReports && relatorio.ots_posteriores?.length > 0 && (
          <p className="text-amber-400 text-xs mt-0.5 flex items-center gap-1">
            <Link2 className="w-3 h-3" /> Posterior: {relatorio.ots_posteriores.map((ot) => `#${ot.numero_assistencia}`).join(', ')}
          </p>
        )}
      </div>

      <div className={`${isMobile ? 'mb-2 pb-2' : 'mb-3 pb-3'} border-b ${borderColor} cursor-pointer`}>
        <p className={`text-xs ${textSecondary} mb-1`}>Equipamento</p>
        <p className={equipmentTextClass}>
          {relatorio.equipamento_display ? (
            relatorio.equipamento_display === 'NÃ£o especificado' ? (
              <span className="text-gray-500 italic">{relatorio.equipamento_display}</span>
            ) : relatorio.equipamento_display === 'VÃ¡rios' ? (
              <span className="text-blue-400">{relatorio.equipamento_display} ({relatorio.equipamentos_count})</span>
            ) : (
              <span className={equipmentTextClassName ? textPrimary : undefined}>{relatorio.equipamento_display}</span>
            )
          ) : relatorio.equipamento_tipologia || relatorio.equipamento_marca || relatorio.equipamento_modelo ? (
            <>
              {relatorio.equipamento_tipologia && <span>{relatorio.equipamento_tipologia}</span>}
              {relatorio.equipamento_tipologia && relatorio.equipamento_marca && <span className="text-gray-500"> • </span>}
              {relatorio.equipamento_marca && <span>{relatorio.equipamento_marca}</span>}
            </>
          ) : (
            <span className="text-gray-500 italic">NÃ£o especificado</span>
          )}
        </p>
      </div>

      {footerLabel && (
        <div className={`flex items-center gap-2 ${isMobile ? 'text-xs' : 'text-sm'} ${textSecondary} cursor-pointer`}>
          <User className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} />
          <span className="truncate">{relatorio.cliente_nome}</span>
        </div>
      )}
    </div>
  );
};

export default ReportCard;
