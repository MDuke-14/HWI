/**
 * Hook para gestão de dados offline
 * Permite trabalhar com OTs sem conexão à internet
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

const DB_NAME = 'HWIOfflineDB';
const DB_VERSION = 2;

// Stores para diferentes tipos de dados
const STORES = {
  RELATORIOS: 'relatorios',
  CLIENTES: 'clientes',
  EQUIPAMENTOS: 'equipamentos',
  OFFLINE_QUEUE: 'offlineQueue',
  SYNC_STATUS: 'syncStatus'
};

/**
 * Inicializa a base de dados IndexedDB
 */
const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Store para relatórios/OTs
      if (!db.objectStoreNames.contains(STORES.RELATORIOS)) {
        const relatoriosStore = db.createObjectStore(STORES.RELATORIOS, { keyPath: 'id' });
        relatoriosStore.createIndex('cliente_id', 'cliente_id', { unique: false });
        relatoriosStore.createIndex('status', 'status', { unique: false });
      }
      
      // Store para clientes
      if (!db.objectStoreNames.contains(STORES.CLIENTES)) {
        db.createObjectStore(STORES.CLIENTES, { keyPath: 'id' });
      }
      
      // Store para equipamentos
      if (!db.objectStoreNames.contains(STORES.EQUIPAMENTOS)) {
        const equipStore = db.createObjectStore(STORES.EQUIPAMENTOS, { keyPath: 'id' });
        equipStore.createIndex('cliente_id', 'cliente_id', { unique: false });
      }
      
      // Store para operações pendentes
      if (!db.objectStoreNames.contains(STORES.OFFLINE_QUEUE)) {
        const queueStore = db.createObjectStore(STORES.OFFLINE_QUEUE, { keyPath: 'id', autoIncrement: true });
        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Store para estado de sincronização
      if (!db.objectStoreNames.contains(STORES.SYNC_STATUS)) {
        db.createObjectStore(STORES.SYNC_STATUS, { keyPath: 'key' });
      }
    };
  });
};

/**
 * Hook principal para gestão offline
 */
export const useOfflineData = (apiBaseUrl) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Monitorizar estado de conexão
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Conexão restabelecida! A sincronizar dados...');
      syncPendingOperations();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Sem conexão. Modo offline ativo.');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Carregar contagem de operações pendentes
    loadPendingCount();
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  /**
   * Carregar contagem de operações pendentes
   */
  const loadPendingCount = async () => {
    try {
      const db = await initDB();
      const transaction = db.transaction([STORES.OFFLINE_QUEUE], 'readonly');
      const store = transaction.objectStore(STORES.OFFLINE_QUEUE);
      const count = await new Promise((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      setPendingCount(count);
    } catch (error) {
      console.error('Erro ao carregar contagem pendente:', error);
    }
  };

  /**
   * Guardar dados no cache local
   */
  const cacheData = async (storeName, data) => {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Cache timeout')), 5000)
    );
    
    const cacheOperation = async () => {
      try {
        const db = await initDB();
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        if (Array.isArray(data)) {
          // Limpar store e adicionar novos dados
          await new Promise((resolve, reject) => {
            const clearRequest = store.clear();
            clearRequest.onsuccess = () => resolve();
            clearRequest.onerror = () => reject(clearRequest.error);
          });
          
          // Wait for all puts to complete
          const putPromises = data.map(item => 
            new Promise((resolve, reject) => {
              const request = store.put(item);
              request.onsuccess = () => resolve();
              request.onerror = () => reject(request.error);
            })
          );
          await Promise.all(putPromises);
        } else {
          await new Promise((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
        }
        
        // Guardar timestamp de última sincronização
        const syncTransaction = db.transaction([STORES.SYNC_STATUS], 'readwrite');
        const syncStore = syncTransaction.objectStore(STORES.SYNC_STATUS);
        await new Promise((resolve, reject) => {
          const request = syncStore.put({ key: `${storeName}_lastSync`, timestamp: new Date().toISOString() });
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
        
      } catch (error) {
        console.error(`Erro ao guardar cache ${storeName}:`, error);
      }
    };
    
    try {
      await Promise.race([cacheOperation(), timeoutPromise]);
    } catch (error) {
      console.warn(`Cache operation timed out or failed for ${storeName}:`, error.message);
    }
  };

  /**
   * Obter dados do cache local
   */
  const getCachedData = async (storeName) => {
    try {
      const db = await initDB();
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error(`Erro ao obter cache ${storeName}:`, error);
      return [];
    }
  };

  /**
   * Obter um item específico do cache
   */
  const getCachedItem = async (storeName, id) => {
    try {
      const db = await initDB();
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error(`Erro ao obter item ${id} do cache ${storeName}:`, error);
      return null;
    }
  };

  /**
   * Adicionar operação à fila offline
   */
  const queueOperation = async (operation) => {
    try {
      const db = await initDB();
      const transaction = db.transaction([STORES.OFFLINE_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.OFFLINE_QUEUE);
      
      const queueItem = {
        ...operation,
        timestamp: new Date().toISOString(),
        retries: 0
      };
      
      await new Promise((resolve, reject) => {
        const request = store.add(queueItem);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      
      await loadPendingCount();
      
      return true;
    } catch (error) {
      console.error('Erro ao adicionar à fila offline:', error);
      return false;
    }
  };

  /**
   * Sincronizar operações pendentes
   */
  const syncPendingOperations = async () => {
    if (isSyncing || !navigator.onLine) return;
    
    setIsSyncing(true);
    
    try {
      const db = await initDB();
      const transaction = db.transaction([STORES.OFFLINE_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.OFFLINE_QUEUE);
      
      const pendingOps = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      
      console.log(`Sincronizando ${pendingOps.length} operações pendentes...`);
      
      let successCount = 0;
      let failCount = 0;
      
      for (const op of pendingOps) {
        try {
          const response = await fetch(`${apiBaseUrl}${op.endpoint}`, {
            method: op.method,
            headers: {
              'Content-Type': 'application/json',
              ...op.headers
            },
            body: op.body ? JSON.stringify(op.body) : undefined
          });
          
          if (response.ok) {
            // Remover da fila
            const deleteTransaction = db.transaction([STORES.OFFLINE_QUEUE], 'readwrite');
            deleteTransaction.objectStore(STORES.OFFLINE_QUEUE).delete(op.id);
            successCount++;
          } else {
            failCount++;
            console.error(`Falha ao sincronizar operação ${op.id}:`, await response.text());
          }
        } catch (error) {
          failCount++;
          console.error(`Erro ao sincronizar operação ${op.id}:`, error);
        }
      }
      
      if (successCount > 0) {
        toast.success(`${successCount} operação(ões) sincronizada(s) com sucesso!`);
      }
      if (failCount > 0) {
        toast.error(`${failCount} operação(ões) falharam. Serão tentadas novamente.`);
      }
      
      setLastSyncTime(new Date());
      await loadPendingCount();
      
    } catch (error) {
      console.error('Erro na sincronização:', error);
      toast.error('Erro ao sincronizar dados');
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Fazer request com fallback offline
   */
  const offlineRequest = useCallback(async (endpoint, options = {}) => {
    const { method = 'GET', body, headers = {} } = options;
    
    // Se online, fazer request normal
    if (navigator.onLine) {
      try {
        const response = await fetch(`${apiBaseUrl}${endpoint}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          body: body ? JSON.stringify(body) : undefined
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Cache dados GET
        if (method === 'GET') {
          // Determinar store baseado no endpoint
          if (endpoint.includes('relatorios-tecnicos')) {
            await cacheData(STORES.RELATORIOS, Array.isArray(data) ? data : [data]);
          } else if (endpoint.includes('clientes')) {
            await cacheData(STORES.CLIENTES, Array.isArray(data) ? data : [data]);
          } else if (endpoint.includes('equipamentos')) {
            await cacheData(STORES.EQUIPAMENTOS, Array.isArray(data) ? data : [data]);
          }
        }
        
        return { success: true, data, offline: false };
        
      } catch (error) {
        console.error('Request falhou, tentando cache...', error);
        // Tentar cache se GET falhar
        if (method === 'GET') {
          return await getFromCacheByEndpoint(endpoint);
        }
        throw error;
      }
    }
    
    // Modo offline
    if (method === 'GET') {
      return await getFromCacheByEndpoint(endpoint);
    } else {
      // Queue operação para sync posterior
      const queued = await queueOperation({
        endpoint,
        method,
        body,
        headers
      });
      
      if (queued) {
        return { 
          success: true, 
          data: { message: 'Operação guardada para sincronização' },
          offline: true,
          queued: true
        };
      } else {
        throw new Error('Falha ao guardar operação offline');
      }
    }
  }, [apiBaseUrl]);

  /**
   * Obter dados do cache baseado no endpoint
   */
  const getFromCacheByEndpoint = async (endpoint) => {
    let storeName = STORES.RELATORIOS;
    
    if (endpoint.includes('clientes')) {
      storeName = STORES.CLIENTES;
    } else if (endpoint.includes('equipamentos')) {
      storeName = STORES.EQUIPAMENTOS;
    }
    
    const cachedData = await getCachedData(storeName);
    
    if (cachedData && cachedData.length > 0) {
      return { success: true, data: cachedData, offline: true, fromCache: true };
    }
    
    return { success: false, data: [], offline: true, error: 'Sem dados em cache' };
  };

  /**
   * Forçar sincronização
   */
  const forceSync = useCallback(async () => {
    if (!navigator.onLine) {
      toast.error('Sem conexão à internet');
      return;
    }
    await syncPendingOperations();
  }, []);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    lastSyncTime,
    offlineRequest,
    cacheData,
    getCachedData,
    getCachedItem,
    queueOperation,
    syncPendingOperations,
    forceSync,
    STORES
  };
};

export default useOfflineData;
