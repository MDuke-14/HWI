import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Bell, X } from 'lucide-react';
import { toast } from 'sonner';

const NotificationBell = ({ user }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState('default');

  useEffect(() => {
    // Verificar suporte a push notifications
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
      setPushPermission(Notification.permission);
    }

    // Registrar service worker
    registerServiceWorker();

    // Buscar notificações iniciais
    fetchNotifications();

    // Polling a cada 2 minutos para buscar novas notificações
    const interval = setInterval(fetchNotifications, 2 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const registerServiceWorker = async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/service-worker.js');
        console.log('Service Worker registrado:', registration);
        
        // Solicitar permissão para notificações após 2 segundos
        setTimeout(() => requestNotificationPermission(registration), 2000);
      } catch (error) {
        console.error('Erro ao registrar Service Worker:', error);
      }
    }
  };

  const requestNotificationPermission = async (registration) => {
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      
      if (permission === 'granted') {
        await subscribeToPush(registration);
      }
    } else if (Notification.permission === 'granted') {
      await subscribeToPush(registration);
    }
  };

  const subscribeToPush = async (registration) => {
    try {
      // VAPID public key (você precisará gerar isso - por enquanto usando uma genérica)
      const publicVapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBmYRJcwnwXPXRU6t0Bw';
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
      });

      // Enviar subscription para o backend
      await axios.post(`${API}/notifications/subscribe`, subscription);
      console.log('Push subscription enviada para o backend');
    } catch (error) {
      console.error('Erro ao registrar push subscription:', error);
    }
  };

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
      >
        <Bell className="w-5 h-5 text-gray-300" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown de notificações */}
      {showDropdown && (
        <div className="absolute right-0 top-12 w-96 bg-[#1a1a1a] border border-gray-700 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
          <div className="p-3 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-white font-semibold">Notificações</h3>
            <button
              onClick={() => setShowDropdown(false)}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="divide-y divide-gray-700">
            {notifications.length > 0 ? (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 hover:bg-gray-800/50 cursor-pointer border-l-4 ${getPriorityColor(notif.priority)}`}
                  onClick={() => markAsRead(notif.id)}
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
