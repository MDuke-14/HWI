/**
 * Componente de barra de estado offline
 * Mostra indicador de conexão e operações pendentes
 */

import React from 'react';
import { Wifi, WifiOff, RefreshCw, Cloud, CloudOff, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const OfflineStatusBar = ({ 
  isOnline, 
  isSyncing, 
  pendingCount, 
  lastSyncTime,
  onSync 
}) => {
  // Não mostrar se online e sem pendentes
  if (isOnline && pendingCount === 0 && !isSyncing) {
    return null;
  }

  return (
    <div className={`mb-4 rounded-lg px-4 py-3 flex items-center justify-between ${
      isOnline 
        ? pendingCount > 0 
          ? 'bg-blue-500/20 border border-blue-500' 
          : 'bg-green-500/20 border border-green-500'
        : 'bg-amber-500/20 border border-amber-500'
    }`}>
      <div className="flex items-center gap-3">
        {/* Ícone de estado */}
        {isOnline ? (
          pendingCount > 0 ? (
            <Cloud className="w-5 h-5 text-blue-400" />
          ) : (
            <CheckCircle className="w-5 h-5 text-green-400" />
          )
        ) : (
          <CloudOff className="w-5 h-5 text-amber-400 animate-pulse" />
        )}
        
        {/* Texto de estado */}
        <div>
          <span className={`font-medium ${
            isOnline 
              ? pendingCount > 0 ? 'text-blue-400' : 'text-green-400'
              : 'text-amber-400'
          }`}>
            {isOnline ? (
              pendingCount > 0 
                ? `${pendingCount} alteração(ões) por sincronizar`
                : 'Dados sincronizados'
            ) : (
              'Modo Offline - Alterações serão guardadas localmente'
            )}
          </span>
          
          {lastSyncTime && (
            <span className="text-gray-500 text-xs ml-2">
              Última sync: {new Date(lastSyncTime).toLocaleTimeString('pt-PT')}
            </span>
          )}
        </div>
      </div>
      
      {/* Botão de sincronização */}
      {isOnline && pendingCount > 0 && (
        <Button
          onClick={onSync}
          disabled={isSyncing}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'A sincronizar...' : 'Sincronizar'}
        </Button>
      )}
      
      {/* Indicador de sincronização em progresso */}
      {isSyncing && (
        <div className="flex items-center gap-2 text-blue-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">A sincronizar...</span>
        </div>
      )}
    </div>
  );
};

/**
 * Componente compacto para header
 */
export const OfflineIndicator = ({ isOnline, pendingCount }) => {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${
        isOnline ? 'bg-green-500' : 'bg-amber-500 animate-pulse'
      }`} />
      <span className={`text-xs ${isOnline ? 'text-green-400' : 'text-amber-400'}`}>
        {isOnline ? 'Online' : 'Offline'}
      </span>
      {pendingCount > 0 && (
        <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">
          {pendingCount}
        </span>
      )}
    </div>
  );
};

export default OfflineStatusBar;
