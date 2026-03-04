import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, User, Mail, Phone, Lock, Eye, EyeOff } from 'lucide-react';

const MobileProfile = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState({ old_password: '', new_password: '', confirm_password: '' });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await axios.get(`${API}/auth/me`);
        setProfile(res.data);
      } catch {
        toast.error('Erro ao carregar perfil');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleChangePassword = async () => {
    if (!form.old_password || !form.new_password || !form.confirm_password) {
      return toast.error('Preencha todos os campos');
    }
    if (form.new_password !== form.confirm_password) {
      return toast.error('As passwords não coincidem');
    }
    if (form.new_password.length < 6) {
      return toast.error('A nova password deve ter no mínimo 6 caracteres');
    }

    setSaving(true);
    try {
      await axios.post(`${API}/auth/change-password`, {
        old_password: form.old_password,
        new_password: form.new_password
      });
      toast.success('Password alterada com sucesso!');
      setForm({ old_password: '', new_password: '', confirm_password: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao alterar password');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><p className="text-gray-500">A carregar...</p></div>;

  return (
    <div className="min-h-screen bg-[#0a0a0a] mobile-safe-top" data-testid="mobile-profile-page">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur-lg border-b border-white/5">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white" data-testid="back-btn">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-white">Perfil & Segurança</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* User Info */}
        <div className="bg-[#111] rounded-xl border border-white/5 p-4 space-y-4" data-testid="profile-info">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Informações</h2>

          <div className="space-y-3">
            <div>
              <Label className="text-gray-500 text-xs flex items-center gap-1.5 mb-1"><User className="w-3 h-3" />Username</Label>
              <div className="bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm">{profile?.username || '-'}</div>
            </div>
            <div>
              <Label className="text-gray-500 text-xs flex items-center gap-1.5 mb-1"><Mail className="w-3 h-3" />Email</Label>
              <div className="bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm">{profile?.email || '-'}</div>
            </div>
            <div>
              <Label className="text-gray-500 text-xs flex items-center gap-1.5 mb-1"><Phone className="w-3 h-3" />Contacto Telefónico</Label>
              <div className="bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm">{profile?.phone || '-'}</div>
            </div>
            <div>
              <Label className="text-gray-500 text-xs flex items-center gap-1.5 mb-1"><User className="w-3 h-3" />Nome Completo</Label>
              <div className="bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm">{profile?.full_name || '-'}</div>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-[#111] rounded-xl border border-white/5 p-4 space-y-4" data-testid="change-password-section">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <Lock className="w-3.5 h-3.5" />
            Alterar Password
          </h2>

          <div className="space-y-3">
            <div>
              <Label className="text-gray-400 text-xs mb-1 block">Password Actual</Label>
              <div className="relative">
                <Input
                  type={showOld ? 'text' : 'password'}
                  value={form.old_password}
                  onChange={(e) => setForm({ ...form, old_password: e.target.value })}
                  placeholder="Introduza a password actual"
                  className="bg-[#0a0a0a] border-white/10 text-white text-sm pr-10"
                  data-testid="old-password-input"
                />
                <button type="button" onClick={() => setShowOld(!showOld)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-gray-400 text-xs mb-1 block">Nova Password</Label>
              <div className="relative">
                <Input
                  type={showNew ? 'text' : 'password'}
                  value={form.new_password}
                  onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                  className="bg-[#0a0a0a] border-white/10 text-white text-sm pr-10"
                  data-testid="new-password-input"
                />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-gray-400 text-xs mb-1 block">Confirmar Nova Password</Label>
              <div className="relative">
                <Input
                  type={showConfirm ? 'text' : 'password'}
                  value={form.confirm_password}
                  onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                  placeholder="Repita a nova password"
                  className="bg-[#0a0a0a] border-white/10 text-white text-sm pr-10"
                  data-testid="confirm-password-input"
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {form.new_password && form.confirm_password && form.new_password !== form.confirm_password && (
              <p className="text-red-400 text-xs">As passwords não coincidem</p>
            )}

            <Button
              onClick={handleChangePassword}
              disabled={saving || !form.old_password || !form.new_password || !form.confirm_password}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-full text-sm mt-2"
              data-testid="save-password-btn"
            >
              {saving ? 'A alterar...' : 'Alterar Password'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileProfile;
