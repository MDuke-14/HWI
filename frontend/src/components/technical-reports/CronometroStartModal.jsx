import React, { useState } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { PlayCircle, User, Clock } from 'lucide-react';

const CronometroStartModal = ({
  open,
  onOpenChange,
  selectedRelatorio,
  tecnicos = [],
  onStarted
}) => {
  const [loading, setLoading] = useState(false);
  const [selectedTecnicos, setSelectedTecnicos] = useState([]);
  const [tipoCronometro, setTipoCronometro] = useState('trabalho');

  const toggleTecnico = (tecnicoId) => {
    setSelectedTecnicos(prev => 
      prev.includes(tecnicoId)
        ? prev.filter(id => id !== tecnicoId)
        : [...prev, tecnicoId]
    );
  };

  const handleStart = async () => {
    if (selectedTecnicos.length === 0) {
      toast.error('Selecione pelo menos um técnico');
      return;
    }

    setLoading(true);
    try {
      // Iniciar cronómetro para cada técnico selecionado
      for (const tecnicoId of selectedTecnicos) {
        const tecnico = tecnicos.find(t => t.id === tecnicoId);
        await axios.post(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/cronometros/start`, {
          tecnico_id: tecnicoId,
          tecnico_nome: tecnico?.full_name || tecnico?.username,
          tipo: tipoCronometro
        });
      }
      
      toast.success(`Cronómetro${selectedTecnicos.length > 1 ? 's' : ''} iniciado${selectedTecnicos.length > 1 ? 's' : ''}!`);
      setSelectedTecnicos([]);
      onOpenChange(false);
      if (onStarted) onStarted();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao iniciar cronómetro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <PlayCircle className="w-5 h-5 text-green-400" />
            Iniciar Cronómetro
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Tipo de Cronómetro */}
          <div>
            <Label className="text-gray-300 mb-2 block">Tipo de Cronómetro</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                onClick={() => setTipoCronometro('trabalho')}
                variant={tipoCronometro === 'trabalho' ? 'default' : 'outline'}
                className={tipoCronometro === 'trabalho' 
                  ? 'bg-blue-600 hover:bg-blue-700' 
                  : 'border-gray-600 hover:bg-gray-800'
                }
              >
                <Clock className="w-4 h-4 mr-2" />
                Trabalho
              </Button>
              <Button
                type="button"
                onClick={() => setTipoCronometro('viagem')}
                variant={tipoCronometro === 'viagem' ? 'default' : 'outline'}
                className={tipoCronometro === 'viagem' 
                  ? 'bg-purple-600 hover:bg-purple-700' 
                  : 'border-gray-600 hover:bg-gray-800'
                }
              >
                <Clock className="w-4 h-4 mr-2" />
                Viagem
              </Button>
              <Button
                type="button"
                onClick={() => setTipoCronometro('oficina')}
                variant={tipoCronometro === 'oficina' ? 'default' : 'outline'}
                className={tipoCronometro === 'oficina' 
                  ? 'bg-orange-600 hover:bg-orange-700' 
                  : 'border-gray-600 hover:bg-gray-800'
                }
              >
                <Clock className="w-4 h-4 mr-2" />
                Oficina
              </Button>
            </div>
          </div>

          {/* Seleção de Técnicos */}
          <div>
            <Label className="text-gray-300 mb-2 block">
              Selecione os Técnicos ({selectedTecnicos.length} selecionados)
            </Label>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {tecnicos.map(tecnico => (
                <div
                  key={tecnico.id}
                  onClick={() => toggleTecnico(tecnico.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedTecnicos.includes(tecnico.id)
                      ? 'bg-blue-600/20 border border-blue-500'
                      : 'bg-[#0f0f0f] border border-transparent hover:border-gray-600'
                  }`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                    selectedTecnicos.includes(tecnico.id)
                      ? 'bg-blue-600 border-blue-600'
                      : 'border-gray-600'
                  }`}>
                    {selectedTecnicos.includes(tecnico.id) && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-white">{tecnico.full_name || tecnico.username}</span>
                </div>
              ))}
              
              {tecnicos.length === 0 && (
                <div className="text-center py-6 text-gray-500">
                  Nenhum técnico disponível
                </div>
              )}
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 border-gray-600"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleStart}
              disabled={loading || selectedTecnicos.length === 0}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <PlayCircle className="w-4 h-4 mr-2" />
              {loading ? 'A iniciar...' : 'Iniciar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CronometroStartModal;
