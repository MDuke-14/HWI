/**
 * Hook para gestão de dados offline
 * Permite trabalhar com OTs sem conexão à internet
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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
  // Refs para evitar stale closures — os event listeners criados no useEffect
  // vazio abaixo precisam sempre da versão MAIS RECENTE de `syncPendingOperations`
  // e `loadPendingCount`.
  const syncRef = useRef(() => {});
  const loadPendingCountRef = useRef(() => {});

  // Monitorizar estado de conexão
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Conexão restabelecida! A sincronizar dados...');
      syncRef.current();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Sem conexão. Modo offline ativo.');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Carregar contagem de operações pendentes
    loadPendingCountRef.current();
    
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
   *
   * Nota: A fila (IndexedDB `HWIOfflineDB/offlineQueue`) é populada por dois
   * atores diferentes com formatos ligeiramente distintos:
   *   1) service-worker.js (v4) — guarda { url, method, body:string, headers, timestamp }
   *   2) useOfflineData.js::queueOperation — guarda { endpoint, method, body:objecto, headers, timestamp, retries }
   *
   * Este sync tem de aceitar ambos os formatos. Antes assumia `op.endpoint` e
   * fazia `fetch(${apiBaseUrl}${op.endpoint})` — quando o item vinha do SW isso
   * dava `${apiBaseUrl}undefined` e falhava sempre.
   */
  const MAX_RETRIES = 3;

  const syncPendingOperations = async () => {
    if (isSyncing || !navigator.onLine) return;
    
    setIsSyncing(true);
    
    try {
      const db = await initDB();
      const transaction = db.transaction([STORES.OFFLINE_QUEUE], 'readonly');
      const store = transaction.objectStore(STORES.OFFLINE_QUEUE);
      
      const pendingOps = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      
      console.log(`Sincronizando ${pendingOps.length} operações pendentes...`);
      
      // Origem base para reconstruir a URL. `apiBaseUrl` costuma ser
      // `${REACT_APP_BACKEND_URL}/api`. Como o SW guarda `url` já com prefixo
      // `/api/...`, temos de tirar o `/api` de `apiBaseUrl` nesse caminho para
      // não duplicar.
      const origin = (apiBaseUrl || '').replace(/\/api\/?$/, '');
      const token = (() => { try { return localStorage.getItem('token'); } catch (_) { return null; } })();

      let successCount = 0;
      let failCount = 0;
      let droppedCount = 0;
      
      for (const op of pendingOps) {
        try {
          // Reconstruir a URL final. Suportamos:
          //  - op.url = "/api/xxxx" (formato SW) → `${origin}/api/xxxx`
          //  - op.url = "https://.../api/xxxx" (URL absoluta) → usar directamente
          //  - op.endpoint = "/xxxx" (formato useOfflineData) → `${apiBaseUrl}${op.endpoint}`
          let finalUrl;
          if (op.url) {
            finalUrl = op.url.startsWith('http') ? op.url : `${origin}${op.url}`;
          } else if (op.endpoint) {
            finalUrl = `${apiBaseUrl}${op.endpoint}`;
          } else {
            console.warn('Operação sem URL/endpoint, descartada:', op);
            const dropTx = db.transaction([STORES.OFFLINE_QUEUE], 'readwrite');
            dropTx.objectStore(STORES.OFFLINE_QUEUE).delete(op.id);
            droppedCount++;
            continue;
          }

          // Body: pode estar como string (SW) ou objecto (useOfflineData).
          let bodyToSend;
          if (op.body === undefined || op.body === null) {
            bodyToSend = undefined;
          } else if (typeof op.body === 'string') {
            bodyToSend = op.body;
          } else {
            bodyToSend = JSON.stringify(op.body);
          }

          // Headers: preservar Authorization guardado + fallback para token actual.
          const mergedHeaders = {
            'Content-Type': 'application/json',
            ...(op.headers || {}),
          };
          if (token && !mergedHeaders['Authorization'] && !mergedHeaders['authorization']) {
            mergedHeaders['Authorization'] = `Bearer ${token}`;
          }

          const response = await fetch(finalUrl, {
            method: op.method || 'POST',
            headers: mergedHeaders,
            body: bodyToSend,
          });

          if (response.ok) {
            const deleteTransaction = db.transaction([STORES.OFFLINE_QUEUE], 'readwrite');
            deleteTransaction.objectStore(STORES.OFFLINE_QUEUE).delete(op.id);
            successCount++;
          } else if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
            // Erros permanentes (400 payload inválido, 401 token expirado, 404 recurso
            // já apagado, 409 conflito, etc.) — não vale a pena voltar a tentar.
            // Descartamos o item para não ficar preso na fila.
            const errText = await response.text().catch(() => '');
            console.error(`Op ${op.id} descartada (HTTP ${response.status}):`, finalUrl, errText);
            const dropTx = db.transaction([STORES.OFFLINE_QUEUE], 'readwrite');
            dropTx.objectStore(STORES.OFFLINE_QUEUE).delete(op.id);
            droppedCount++;
          } else {
            // 5xx / 408 / 429 → transitório, incrementar retries.
            failCount++;
            const retries = (op.retries || 0) + 1;
            if (retries >= MAX_RETRIES) {
              console.error(`Op ${op.id} atingiu ${MAX_RETRIES} tentativas, descartada.`);
              const dropTx = db.transaction([STORES.OFFLINE_QUEUE], 'readwrite');
              dropTx.objectStore(STORES.OFFLINE_QUEUE).delete(op.id);
              droppedCount++;
            } else {
              const updTx = db.transaction([STORES.OFFLINE_QUEUE], 'readwrite');
              updTx.objectStore(STORES.OFFLINE_QUEUE).put({ ...op, retries });
            }
          }
        } catch (error) {
          // Erro de rede / CORS. Incrementar retries.
          failCount++;
          console.error(`Erro de rede ao sincronizar op ${op.id}:`, error);
          const retries = (op.retries || 0) + 1;
          if (retries >= MAX_RETRIES) {
            const dropTx = db.transaction([STORES.OFFLINE_QUEUE], 'readwrite');
            dropTx.objectStore(STORES.OFFLINE_QUEUE).delete(op.id);
            droppedCount++;
          } else {
            const updTx = db.transaction([STORES.OFFLINE_QUEUE], 'readwrite');
            updTx.objectStore(STORES.OFFLINE_QUEUE).put({ ...op, retries });
          }
        }
      }
      
      if (successCount > 0) {
        toast.success(`${successCount} operação(ões) sincronizada(s) com sucesso!`);
      }
      if (droppedCount > 0) {
        toast.warning(`${droppedCount} operação(ões) obsoleta(s) foram descartadas.`);
      }
      if (failCount > 0 && droppedCount === 0) {
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

  // Manter refs sincronizadas com a versão mais recente das funções.
  // Assim os event listeners registados apenas 1x usam sempre a última versão.
  syncRef.current = syncPendingOperations;
  loadPendingCountRef.current = loadPendingCount;

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
    // Usar syncRef para garantir que apanhamos sempre a versão mais recente
    // de syncPendingOperations (evita stale closure vinda do useCallback([])).
    await syncRef.current();
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
