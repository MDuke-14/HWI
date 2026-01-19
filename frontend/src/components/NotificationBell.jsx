import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Bell, X, BellRing } from 'lucide-react';
import { toast } from 'sonner';

const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBmYRJcwnwXPXRU6t0Bw';

const NotificationBell = ({ user }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState('default');
  const [pushSubscribed, setPushSubscribed] = useState(false);

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribeToPush = useCallback(async (registration) => {
    try {
      // IMPORTANTE: Sempre cancelar subscription existente e criar uma nova
      // Isso garante que usamos as chaves VAPID corretas
      let existingSubscription = await registration.pushManager.getSubscription();
      
      if (existingSubscription) {
        console.log('Cancelando subscription antiga...');
        await existingSubscription.unsubscribe();
      }
      
      // Criar nova subscription com as chaves VAPID atuais
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      console.log('Nova push subscription criada');

      // Converter para JSON e enviar para o backend
      const subscriptionJson = subscription.toJSON();
      console.log('Enviando subscription para backend:', subscriptionJson);
      
      const response = await axios.post(`${API}/notifications/subscribe`, {
        endpoint: subscriptionJson.endpoint,
        keys: subscriptionJson.keys
      });
      
      console.log('Push subscription registada com sucesso:', response.data);
      setPushSubscribed(true);
      toast.success('Notificações push ativadas!');
      
    } catch (error) {
      console.error('Erro ao registar push subscription:', error);
      if (error.response) {
        console.error('Response error:', error.response.data);
      }
      toast.error('Erro ao ativar notificações push');
    }
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      console.log('Service Worker pronto:', registration);
      
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        setPushPermission(permission);
        console.log('Permissão de notificação:', permission);
        
        if (permission === 'granted') {
          await subscribeToPush(registration);
        } else {
          toast.error('Permissão de notificações negada');
        }
      } else if (Notification.permission === 'granted') {
        await subscribeToPush(registration);
      }
    } catch (error) {
      console.error('Erro ao solicitar permissão:', error);
    }
  }, [subscribeToPush]);

  useEffect(() => {
    // Verificar suporte a push notifications
    if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
      setPushSupported(true);
      setPushPermission(Notification.permission);
      
      // Se já tem permissão, verificar/criar subscription
      if (Notification.permission === 'granted' && user) {
        navigator.serviceWorker.ready.then(registration => {
          subscribeToPush(registration);
        });
      }
    }

    // Buscar notificações iniciais
    if (user) {
      fetchNotifications();
      // Polling a cada 2 minutos
      const interval = setInterval(fetchNotifications, 2 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [user, subscribeToPush]);

  const fetchNotifications = async () => {
    try {
      const response = await axios.get(`${API}/notifications?unread_only=true`);
      setNotifications(response.data);
      setUnreadCount(response.data.length);
    } catch (error) {
      console.error('Erro ao buscar notificações:', error);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      await axios.put(`${API}/notifications/${notificationId}/read`);
      fetchNotifications();
    } catch (error) {
      console.error('Erro ao marcar como lida:', error);
    }
  };

  const getPriorityColor = (priority) => {
    const colors = {
      'high': 'text-red-400 bg-red-500/10 border-red-500/30',
      'medium': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
      'low': 'text-blue-400 bg-blue-500/10 border-blue-500/30'
    };
    return colors[priority] || colors['low'];
  };

  if (!user) return null;

  return (
    <div className="relative">
      {/* Botão do sino */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 rounded-full hover:bg-gray-700 transition"
        data-testid="notification-bell"
      >
        <Bell className="w-5 h-5 text-gray-300" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        {/* Indicador se push não está ativo */}
        {pushSupported && pushPermission !== 'granted' && (
          <span className="absolute -bottom-1 -right-1 bg-yellow-500 rounded-full w-2 h-2" title="Notificações push não ativas" />
        )}
      </button>

      {/* Dropdown de notificações */}
      {showDropdown && (
        <div className="absolute right-0 top-12 w-96 bg-[#1a1a1a] border border-gray-700 rounded-lg shadow-xl z-50 max-h-[32rem] overflow-y-auto">
          <div className="p-3 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-white font-semibold">Notificações</h3>
            <button
              onClick={() => setShowDropdown(false)}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Banner para ativar notificações push */}
          {pushSupported && pushPermission !== 'granted' && (
            <div className="p-3 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <BellRing className="w-8 h-8 text-blue-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">Ativar notificações push</p>
                  <p className="text-gray-400 text-xs">Receba alertas no seu dispositivo</p>
                </div>
                <button
                  onClick={requestNotificationPermission}
                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition"
                  data-testid="enable-push-btn"
                >
                  Ativar
                </button>
              </div>
            </div>
          )}

          {/* Status de push ativo */}
          {pushSubscribed && (
            <div className="px-3 py-2 bg-green-500/10 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-green-400 text-xs">Notificações push ativas</span>
              </div>
              <button
                onClick={async () => {
                  try {
                    await axios.post(`${API}/notifications/test-push`);
                    toast.success('Notificação de teste enviada!');
                  } catch (error) {
                    toast.error('Erro ao enviar teste');
                  }
                }}
                className="text-xs text-blue-400 hover:text-blue-300"
                data-testid="test-push-btn"
              >
                Testar
              </button>
            </div>
          )}

          <div className="divide-y divide-gray-700">
            {notifications.length > 0 ? (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 hover:bg-gray-800/50 cursor-pointer border-l-4 ${getPriorityColor(notif.priority)}`}
                  onClick={() => markAsRead(notif.id)}
                  data-testid={`notification-item-${notif.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-white font-medium text-sm">{notif.title}</h4>
                      <p className="text-gray-400 text-xs mt-1">{notif.message}</p>
                      <p className="text-gray-500 text-xs mt-2">
                        {new Date(notif.created_at).toLocaleString('pt-PT')}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center">
                <Bell className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">Sem notificações</p>
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-3 border-t border-gray-700 text-center">
              <button
                onClick={async () => {
                  try {
                    await axios.delete(`${API}/notifications/all`);
                    setNotifications([]);
                    setUnreadCount(0);
                    toast.success('Notificações limpas');
                  } catch (error) {
                    toast.error('Erro ao limpar notificações');
                  }
                }}
                className="text-blue-400 hover:text-blue-300 text-sm"
                data-testid="clear-all-notifications"
              >
                Limpar todas
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
