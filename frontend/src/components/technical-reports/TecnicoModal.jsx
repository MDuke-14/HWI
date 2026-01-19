import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { User, Clock, Car, Plus, Edit, Trash2 } from 'lucide-react';

const TecnicoModal = ({
  open,
  onOpenChange,
  selectedRelatorio,
  tecnicoFormData,
  setTecnicoFormData,
  isEditing = false,
  selectedTecnico = null,
  allUsers = [],
  onSaved
}) => {
  const [loading, setLoading] = useState(false);

  const getTipoHorarioCodigo = (tipo) => {
    const codigos = {
      'diurno': '1 (Diurno)',
      'noturno': '2 (Noturno)',
      'sabado': 'S (Sábado)',
      'domingo_feriado': 'D (Dom/Feriado)'
    };
    return codigos[tipo] || '-';
  };

  const handleUserSelect = (userId) => {
    const user = allUsers.find(u => u.id === userId);
    if (user) {
      setTecnicoFormData({
        ...tecnicoFormData,
        tecnico_id: user.id,
        tecnico_nome: user.full_name || user.username
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRelatorio) return;

    if (!tecnicoFormData.tecnico_nome.trim()) {
      toast.error('Selecione um técnico');
      return;
    }

    setLoading(true);

    try {
      const data = {
        tecnico_id: tecnicoFormData.tecnico_id || '',
        tecnico_nome: tecnicoFormData.tecnico_nome,
        minutos_cliente: parseInt(tecnicoFormData.minutos_cliente) || 0,
        kms_deslocacao: parseFloat(tecnicoFormData.kms_deslocacao) || 0,
        tipo_horario: tecnicoFormData.tipo_horario,
        data_trabalho: tecnicoFormData.data_trabalho,
        hora_inicio: tecnicoFormData.hora_inicio || null,
        hora_fim: tecnicoFormData.hora_fim || null
      };

      if (isEditing && selectedTecnico) {
        await axios.put(
          `${API}/relatorios-tecnicos/${selectedRelatorio.id}/tecnicos/${selectedTecnico.id}`,
          data
        );
        toast.success('Técnico atualizado!');
      } else {
        await axios.post(
          `${API}/relatorios-tecnicos/${selectedRelatorio.id}/tecnicos`,
          data
        );
        toast.success('Técnico adicionado!');
      }

      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao guardar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {isEditing ? <Edit className="w-5 h-5 text-blue-400" /> : <Plus className="w-5 h-5 text-green-400" />}
            {isEditing ? 'Editar Registo Manual' : 'Adicionar Registo Manual'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Seleção de Técnico */}
          <div>
            <Label className="text-gray-300 flex items-center gap-2">
              <User className="w-4 h-4" />
              Técnico *
            </Label>
            {allUsers.length > 0 ? (
              <select
                value={tecnicoFormData.tecnico_id || ''}
                onChange={(e) => handleUserSelect(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 mt-1"
                required
              >
                <option value="">Selecione um técnico</option>
                {allUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.username}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={tecnicoFormData.tecnico_nome}
                onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, tecnico_nome: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                placeholder="Nome do técnico"
                required
              />
            )}
          </div>

          {/* Data do Trabalho */}
          <div>
            <Label className="text-gray-300">Data do Trabalho *</Label>
            <Input
              type="date"
              value={tecnicoFormData.data_trabalho}
              onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, data_trabalho: e.target.value })}
              className="bg-[#0f0f0f] border-gray-700 text-white"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Código: <span className="text-blue-400 font-semibold">{getTipoHorarioCodigo(tecnicoFormData.tipo_horario)}</span>
            </p>
          </div>

          {/* Tempo e KMs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-300 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Tempo no Cliente *
              </Label>
              <div className="flex gap-2 items-center mt-1">
                <Input
                  type="number"
                  min="0"
                  max="24"
                  value={Math.floor(tecnicoFormData.minutos_cliente / 60) || ''}
                  onChange={(e) => {
                    const horas = parseInt(e.target.value) || 0;
                    const minutos = tecnicoFormData.minutos_cliente % 60;
                    setTecnicoFormData({ ...tecnicoFormData, minutos_cliente: (horas * 60) + minutos });
                  }}
                  className="bg-[#0f0f0f] border-gray-700 text-white w-16"
                  placeholder="0"
                />
                <span className="text-gray-400">h</span>
                <Input
                  type="number"
                  min="0"
                  max="59"
                  value={tecnicoFormData.minutos_cliente % 60 || ''}
                  onChange={(e) => {
                    const horas = Math.floor(tecnicoFormData.minutos_cliente / 60);
                    const minutos = parseInt(e.target.value) || 0;
                    setTecnicoFormData({ ...tecnicoFormData, minutos_cliente: (horas * 60) + minutos });
                  }}
                  className="bg-[#0f0f0f] border-gray-700 text-white w-16"
                  placeholder="0"
                />
                <span className="text-gray-400">m</span>
              </div>
            </div>

            <div>
              <Label className="text-gray-300 flex items-center gap-2">
                <Car className="w-4 h-4" />
                Km (só ida) *
              </Label>
              <Input
                type="number"
                step="1"
                min="0"
                value={tecnicoFormData.kms_deslocacao || ''}
                onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, kms_deslocacao: parseFloat(e.target.value) || 0 })}
                className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                placeholder="Ex: 150"
                required
              />
              <p className="text-xs text-gray-500 mt-1">×2 (ida e volta)</p>
            </div>
          </div>

          {/* Hora Início e Fim (Folha de Horas) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-300 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Hora Início (opcional)
              </Label>
              <Input
                type="time"
                value={tecnicoFormData.hora_inicio || ''}
                onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, hora_inicio: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
              />
              <p className="text-xs text-gray-500 mt-1">Para Folha de Horas</p>
            </div>
            <div>
              <Label className="text-gray-300 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Hora Fim (opcional)
              </Label>
              <Input
                type="time"
                value={tecnicoFormData.hora_fim || ''}
                onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, hora_fim: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
              />
              <p className="text-xs text-gray-500 mt-1">Para Folha de Horas</p>
            </div>
          </div>

          {/* Tipo de Horário */}
          <div>
            <Label className="text-gray-300">Tipo de Horário *</Label>
            <select
              value={tecnicoFormData.tipo_horario}
              onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, tipo_horario: e.target.value })}
              className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 mt-1"
            >
              <option value="diurno">Diurno (07h-19h) - Código 1</option>
              <option value="noturno">Noturno (19h-07h) - Código 2</option>
              <option value="sabado">Sábado - Código S</option>
              <option value="domingo_feriado">Domingo/Feriado - Código D</option>
            </select>
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
              type="submit"
              disabled={loading}
              className={`flex-1 ${isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {loading ? 'A guardar...' : (isEditing ? 'Atualizar' : 'Adicionar')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TecnicoModal;
