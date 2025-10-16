import { useState } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { KeyRound, Lock, AlertTriangle } from 'lucide-react';

const ChangePassword = ({ onPasswordChanged }) => {
  const [formData, setFormData] = useState({
    old_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate passwords match
    if (formData.new_password !== formData.confirm_password) {
      toast.error('As senhas não coincidem');
      return;
    }

    // Validate password length
    if (formData.new_password.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API}/auth/change-password`,
        {
          old_password: formData.old_password,
          new_password: formData.new_password
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      toast.success(response.data.message || 'Senha alterada com sucesso!');
      
      // Update user data to clear must_change_password flag
      onPasswordChanged();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao alterar senha');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-md fade-in">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-4 rounded-2xl shadow-lg">
              <AlertTriangle className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Alteração de Senha Obrigatória</h1>
          <p className="text-gray-400 text-base">
            Por motivos de segurança, você precisa criar uma nova senha antes de continuar.
          </p>
        </div>

        <div className="glass-effect p-8">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6">
            <p className="text-sm text-amber-200">
              <strong>🔒 Senha Temporária Detectada</strong><br/>
              Você está usando uma senha temporária. Crie uma nova senha segura para continuar a usar o sistema.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="old_password" className="text-gray-300 mb-2 block">
                <Lock className="w-4 h-4 inline mr-2" />
                Senha Atual (Temporária)
              </Label>
              <Input
                id="old_password"
                type="password"
                placeholder="Insira a senha temporária"
                value={formData.old_password}
                onChange={(e) => setFormData({ ...formData, old_password: e.target.value })}
                className="bg-[#1a1a1a] border-gray-700 text-white focus:ring-amber-500"
                required
              />
            </div>

            <div>
              <Label htmlFor="new_password" className="text-gray-300 mb-2 block">
                <KeyRound className="w-4 h-4 inline mr-2" />
                Nova Senha
              </Label>
              <Input
                id="new_password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={formData.new_password}
                onChange={(e) => setFormData({ ...formData, new_password: e.target.value })}
                className="bg-[#1a1a1a] border-gray-700 text-white focus:ring-amber-500"
                required
                minLength={6}
              />
            </div>

            <div>
              <Label htmlFor="confirm_password" className="text-gray-300 mb-2 block">
                <KeyRound className="w-4 h-4 inline mr-2" />
                Confirmar Nova Senha
              </Label>
              <Input
                id="confirm_password"
                type="password"
                placeholder="Digite a nova senha novamente"
                value={formData.confirm_password}
                onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
                className="bg-[#1a1a1a] border-gray-700 text-white focus:ring-amber-500"
                required
              />
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <p className="text-xs text-blue-300">
                <strong>💡 Dicas de Senha Segura:</strong><br/>
                • Mínimo 6 caracteres<br/>
                • Use letras maiúsculas e minúsculas<br/>
                • Inclua números e caracteres especiais<br/>
                • Não use senhas óbvias
              </p>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-semibold py-3 rounded-full mt-6"
            >
              {loading ? 'A processar...' : 'Alterar Senha e Continuar'}
            </Button>
          </form>
        </div>

        <div className="text-center mt-6 text-gray-500 text-sm">
          <p>© 2025 HWI Unipessoal, Lda.</p>
        </div>
      </div>
    </div>
  );
};

export default ChangePassword;
