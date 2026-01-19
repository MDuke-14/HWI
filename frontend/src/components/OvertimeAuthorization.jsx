import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { CheckCircle2, XCircle, Clock, User, Calendar, AlertTriangle, Loader2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const OvertimeAuthorization = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [authorization, setAuthorization] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  
  const fetchAuthorization = async () => {
    try {
      const response = await axios.get(`${API}/overtime/authorization/${token}`);
      setAuthorization(response.data);
      setLoading(false);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Pedido de autorização não encontrado.');
      } else if (err.response?.status === 410) {
        setError('Este pedido de autorização expirou.');
      } else {
        setError('Erro ao carregar pedido de autorização.');
      }
      setLoading(false);
    }
  };
  
  useEffect(() => {
    const loadAuthorization = async () => {
      try {
        const response = await axios.get(`${API}/overtime/authorization/${token}`);
        setAuthorization(response.data);
        setLoading(false);
      } catch (err) {
        if (err.response?.status === 404) {
          setError('Pedido de autorização não encontrado.');
        } else if (err.response?.status === 410) {
          setError('Este pedido de autorização expirou.');
        } else {
          setError('Erro ao carregar pedido de autorização.');
        }
        setLoading(false);
      }
    };
    loadAuthorization();
  }, [token]);
  
  const handleDecision = async (action) => {
    // Check if user is logged in as admin
    const authToken = localStorage.getItem('token');
    if (!authToken) {
      // Redirect to login with return URL
      localStorage.setItem('returnUrl', window.location.pathname + window.location.search);
      navigate('/');
      return;
    }
    
    setProcessing(true);
    try {
      const response = await axios.post(
        `${API}/overtime/authorization/${token}/decide`,
        { action }
      );
      setResult(response.data);
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.setItem('returnUrl', window.location.pathname + window.location.search);
        navigate('/');
        return;
      } else if (err.response?.status === 403) {
        setError('Apenas administradores podem aprovar/rejeitar pedidos.');
      } else {
        setError(err.response?.data?.detail || 'Erro ao processar decisão.');
      }
    }
    setProcessing(false);
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800/50 border-gray-700">
          <CardContent className="pt-6 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto mb-4" />
            <p className="text-gray-400">A carregar pedido de autorização...</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800/50 border-gray-700">
          <CardHeader className="text-center">
            <AlertTriangle className="w-16 h-16 text-yellow-400 mx-auto mb-2" />
            <CardTitle className="text-white text-xl">Erro</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-400">{error}</p>
          </CardContent>
          <CardFooter className="justify-center">
            <Button onClick={() => navigate('/')} variant="outline" className="border-gray-600">
              Voltar ao Início
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  if (result) {
    const isApproved = result.decision === 'approved';
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <Card className={`w-full max-w-md border ${isApproved ? 'bg-green-900/20 border-green-600' : 'bg-red-900/20 border-red-600'}`}>
          <CardHeader className="text-center">
            {isApproved ? (
              <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-2" />
            ) : (
              <XCircle className="w-16 h-16 text-red-400 mx-auto mb-2" />
            )}
            <CardTitle className={`text-xl ${isApproved ? 'text-green-400' : 'text-red-400'}`}>
              {isApproved ? 'Horas Extra Autorizadas' : 'Horas Extra Não Autorizadas'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-300">{result.message}</p>
          </CardContent>
          <CardFooter className="justify-center">
            <Button onClick={() => navigate('/')} variant="outline" className="border-gray-600">
              Voltar ao Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  if (authorization?.status !== 'pending') {
    const isApproved = authorization?.decision === 'approved';
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <Card className={`w-full max-w-md border ${isApproved ? 'bg-green-900/20 border-green-600' : 'bg-red-900/20 border-red-600'}`}>
          <CardHeader className="text-center">
            {isApproved ? (
              <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-2" />
            ) : (
              <XCircle className="w-16 h-16 text-red-400 mx-auto mb-2" />
            )}
            <CardTitle className={`text-xl ${isApproved ? 'text-green-400' : 'text-red-400'}`}>
              Decisão Já Tomada
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-2">
            <p className="text-gray-300">
              Este pedido já foi {isApproved ? 'aprovado' : 'rejeitado'}.
            </p>
            {authorization?.decided_by && (
              <p className="text-gray-500 text-sm">
                Por: {authorization.decided_by}
              </p>
            )}
            {authorization?.decided_at && (
              <p className="text-gray-500 text-sm">
                Em: {new Date(authorization.decided_at).toLocaleString('pt-PT')}
              </p>
            )}
          </CardContent>
          <CardFooter className="justify-center">
            <Button onClick={() => navigate('/')} variant="outline" className="border-gray-600">
              Voltar ao Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  // Formatar data
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('pt-PT', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  };
  
  const requestTypeLabel = authorization.request_type === 'overtime_start' 
    ? 'Início de Trabalho em Dia Especial'
    : 'Horas Extra Após Horário Normal';
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg bg-gray-800/50 border-gray-700">
        <CardHeader className="text-center border-b border-gray-700 pb-6">
          <Clock className="w-12 h-12 text-blue-400 mx-auto mb-2" />
          <CardTitle className="text-white text-xl">
            Pedido de Autorização de Horas Extra
          </CardTitle>
          <CardDescription className="text-gray-400">
            {requestTypeLabel}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="pt-6 space-y-4">
          {/* Informações do Utilizador */}
          <div className="bg-gray-900/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-gray-500 text-sm">Utilizador</p>
                <p className="text-white font-semibold">{authorization.user_name}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-gray-500 text-sm">Data</p>
                <p className="text-white">{formatDate(authorization.date)}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-orange-400" />
              <div>
                <p className="text-gray-500 text-sm">Hora</p>
                <p className="text-white">
                  {authorization.start_time || authorization.clock_in_time || 'N/A'}
                </p>
              </div>
            </div>
            
            {authorization.day_type && (
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <div>
                  <p className="text-gray-500 text-sm">Tipo de Dia</p>
                  <p className="text-yellow-400 font-semibold">{authorization.day_type}</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Informação sobre consequências */}
          <div className="bg-blue-900/20 border border-blue-600 rounded-lg p-4">
            <h4 className="text-blue-400 font-semibold mb-2">ℹ️ Consequências da Decisão</h4>
            <div className="text-gray-300 text-sm space-y-2">
              <p>
                <strong className="text-green-400">✅ Autorizar:</strong>{' '}
                {authorization.request_type === 'overtime_start'
                  ? 'O ponto continua ativo e as horas serão contabilizadas como horas extra.'
                  : 'As horas após as 18:00 serão contabilizadas como horas extra.'}
              </p>
              <p>
                <strong className="text-red-400">❌ Não Autorizar:</strong>{' '}
                {authorization.request_type === 'overtime_start'
                  ? 'A entrada de ponto será eliminada e não ficam horas registadas.'
                  : 'O ponto será encerrado automaticamente às 18:00 e o tempo adicional será ignorado.'}
              </p>
            </div>
          </div>
        </CardContent>
        
        <CardFooter className="flex gap-4 pt-6 border-t border-gray-700">
          <Button
            onClick={() => handleDecision('reject')}
            disabled={processing}
            variant="outline"
            className="flex-1 border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
          >
            {processing ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <XCircle className="w-4 h-4 mr-2" />
            )}
            Não Autorizar
          </Button>
          
          <Button
            onClick={() => handleDecision('approve')}
            disabled={processing}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {processing ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            Autorizar
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default OvertimeAuthorization;
