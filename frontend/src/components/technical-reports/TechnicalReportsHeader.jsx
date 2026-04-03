import React from 'react';
import { FileText, Wifi, WifiOff } from 'lucide-react';

import OfflineStatusBar from '../OfflineStatusBar';

const TechnicalReportsHeader = ({
  isMobile,
  isOnline,
  isSyncing,
  pendingCount,
  lastSyncTime,
  forceSync,
  bgCard,
  borderColor,
  textPrimary,
  textSecondary,
}) => (
  <>
    <OfflineStatusBar
      isOnline={isOnline}
      isSyncing={isSyncing}
      pendingCount={pendingCount}
      lastSyncTime={lastSyncTime}
      onSync={forceSync}
    />

    <div className={`${isMobile ? 'mb-4' : 'mb-8'}`}>
      <div className={`flex items-center gap-3 ${isMobile ? 'mb-1' : 'mb-2'}`}>
        <div className={`bg-gradient-to-br from-blue-500 to-blue-600 ${isMobile ? 'p-2' : 'p-3'} rounded-xl`}>
          <FileText className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} text-white`} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className={`${isMobile ? 'text-xl' : 'text-3xl'} font-bold ${textPrimary} truncate`}>
            {isMobile ? "FS's" : "FS's - Folhas de Servico"}
          </h1>
          {!isMobile && <p className={textSecondary}>Gestao de Assistencias Tecnicas</p>}
        </div>
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
  </>
);

export default TechnicalReportsHeader;
