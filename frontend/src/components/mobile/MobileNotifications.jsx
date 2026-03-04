import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Bell, Trash2, ArrowLeft, CheckCheck, Clock, AlertTriangle, Calendar, FileText, DollarSign } from 'lucide-react';

const getNotifStyle = (type) => {
  const styles = {
    vacation_request: { icon: <Calendar className="w-4 h-4" />, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    vacation_approved: { icon: <CheckCheck className="w-4 h-4" />, color: 'text-green-400', bg: 'bg-green-500/10' },
    vacation_rejected: { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-red-400', bg: 'bg-red-500/10' },
    vacation_request_submitted: { icon: <Calendar className="w-4 h-4" />, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    vacation_day_refunded: { icon: <Calendar className="w-4 h-4" />, color: 'text-teal-400', bg: 'bg-teal-500/10' },
    despesa_created: { icon: <DollarSign className="w-4 h-4" />, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    late_arrival: { icon: <Clock className="w-4 h-4" />, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    absence_created: { icon: <FileText className="w-4 h-4" />, color: 'text-rose-400', bg: 'bg-rose-500/10' },
    password_changed: { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  };
  return styles[type] || { icon: <Bell className="w-4 h-4" />, color: 'text-gray-400', bg: 'bg-gray-500/10' };
};

const MobileNotifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/notifications`);
      setNotifications(res.data);
    } catch {
      toast.error('Erro ao carregar notificações');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markAsRead = async (id) => {
    try {
      await axios.put(`${API}/notifications/${id}/read`);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch {
      toast.error('Erro ao remover notificação');
    }
  };

  const markAllAsRead = async () => {
    try {
      await axios.patch(`${API}/notifications/read-all`);
      setNotifications([]);
      toast.success('Todas as notificações limpas');
    } catch {
      toast.error('Erro ao limpar notificações');
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin}m atrás`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h atrás`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d atrás`;
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] mobile-safe-top" data-testid="mobile-notifications-page">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur-lg border-b border-white/5">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white" data-testid="back-btn">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-white">Notificações</h1>
            {notifications.length > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">{notifications.length}</span>
            )}
          </div>
          {notifications.length > 0 && (
            <Button
              onClick={markAllAsRead}
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
              data-testid="clear-all-btn"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Limpar todas
            </Button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div className="px-4 py-3">
        {loading ? (
          <div className="text-center text-gray-500 py-16">A carregar...</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Sem notificações</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notif) => {
              const style = getNotifStyle(notif.type);
              return (
                <div
                  key={notif.id}
                  className={`flex items-start gap-3 p-3 rounded-xl bg-[#111] border border-white/5 ${!notif.read ? 'border-l-2 border-l-blue-500' : ''}`}
                  data-testid={`notification-${notif.id}`}
                >
                  <div className={`w-9 h-9 rounded-lg ${style.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <span className={style.color}>{style.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm leading-snug">{notif.message}</p>
                    <p className="text-gray-500 text-xs mt-1">{formatTime(notif.created_at)}</p>
                  </div>
                  <button
                    onClick={() => markAsRead(notif.id)}
                    className="text-gray-600 hover:text-red-400 p-1 flex-shrink-0"
                    data-testid={`delete-notif-${notif.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileNotifications;
