import { useState } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Clock, User, Lock, Mail, UserPlus } from 'lucide-react';

const Login = ({ onLogin }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    full_name: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const response = await axios.post(`${API}${endpoint}`, formData);
      
      toast.success(isRegister ? 'Conta criada com sucesso!' : 'Login efetuado!');
      onLogin(response.data.access_token, response.data.user);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao autenticar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-md fade-in">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-4 rounded-2xl shadow-lg">
              <Clock className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">HWI Unipessoal</h1>
          <p className="text-gray-400 text-lg">Sistema de Relógio de Ponto</p>
        </div>

        <div className="glass-effect p-8">
          <div className="flex gap-2 mb-6">
            <Button
              data-testid="login-tab-button"
              onClick={() => setIsRegister(false)}
              className={`flex-1 rounded-full ${
                !isRegister
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-transparent border border-gray-700 text-gray-400 hover:bg-gray-800'
              }`}
            >
              Entrar
            </Button>
            <Button
              data-testid="register-tab-button"
              onClick={() => setIsRegister(true)}
              className={`flex-1 rounded-full ${
                isRegister
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-transparent border border-gray-700 text-gray-400 hover:bg-gray-800'
              }`}
            >
              Registar
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username" className="text-gray-300 mb-2 block">
                <User className="w-4 h-4 inline mr-2" />
                Nome de utilizador
              </Label>
              <Input
                data-testid="username-input"
                id="username"
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="bg-[#1a1a1a] border-gray-700 text-white focus:ring-blue-500"
                required
              />
            </div>

            {isRegister && (
              <>
                <div>
                  <Label htmlFor="email" className="text-gray-300 mb-2 block">
                    <Mail className="w-4 h-4 inline mr-2" />
                    Email
                  </Label>
                  <Input
                    data-testid="email-input"
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="bg-[#1a1a1a] border-gray-700 text-white focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="full_name" className="text-gray-300 mb-2 block">
                    <UserPlus className="w-4 h-4 inline mr-2" />
                    Nome completo (opcional)
                  </Label>
                  <Input
                    data-testid="fullname-input"
                    id="full_name"
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="bg-[#1a1a1a] border-gray-700 text-white focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            <div>
              <Label htmlFor="password" className="text-gray-300 mb-2 block">
                <Lock className="w-4 h-4 inline mr-2" />
                Palavra-passe
              </Label>
              <Input
                data-testid="password-input"
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="bg-[#1a1a1a] border-gray-700 text-white focus:ring-blue-500"
                required
              />
            </div>

            <Button
              data-testid="submit-button"
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 rounded-full mt-6"
            >
              {loading ? 'A processar...' : isRegister ? 'Criar Conta' : 'Entrar'}
            </Button>
          </form>
        </div>

        <div className="text-center mt-6 text-gray-500 text-sm">
          <p>© 2025 HWI Unipessoal, Lda. Todos os direitos reservados.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;