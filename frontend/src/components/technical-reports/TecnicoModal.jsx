import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Clock, Car, Plus, Edit, AlertCircle, Tag } from 'lucide-react';

const TecnicoModal = ({
  open,
  onOpenChange,
  isEditing = false,
  tecnicoFormData,
  setTecnicoFormData,
  allUsers = [],
  onSubmit,
  loading = false
}) => {
  // Estado local para horas e minutos
  const [horas, setHoras] = useState('');
  const [minutos, setMinutos] = useState('');

  // Sincronizar estado local com tecnicoFormData
  useEffect(() => {
    if (tecnicoFormData.minutos_cliente !== undefined) {
      const totalMinutos = tecnicoFormData.minutos_cliente || 0;
      setHoras(Math.floor(totalMinutos / 60).toString());
      setMinutos((totalMinutos % 60).toString());
    }
  }, [tecnicoFormData.minutos_cliente, open]);

  // Calcular Tempo no Cliente automaticamente quando hora_inicio e hora_fim mudam
  const calcularTempoCliente = (horaInicio, horaFim) => {
    if (horaInicio && horaFim) {
      const [inicioH, inicioM] = horaInicio.split(':').map(Number);
      const [fimH, fimM] = horaFim.split(':').map(Number);
      
      const inicioMinutos = inicioH * 60 + inicioM;
      const fimMinutos = fimH * 60 + fimM;
      
      // Calcular diferença (menos 1 hora de pausa = 60 minutos)
      let diferencaMinutos = fimMinutos - inicioMinutos - 60;
      
      // Se o fim for antes do início (atravessa meia-noite), adicionar 24h
      if (diferencaMinutos < -60) {
        diferencaMinutos = (24 * 60) + fimMinutos - inicioMinutos - 60;
      }
      
      // Garantir que não é negativo
      return Math.max(0, diferencaMinutos);
    }
    return null;
  };

  const handleHoraInicioChange = (value) => {
    const novoFormData = { ...tecnicoFormData, hora_inicio: value };
    
    // Calcular tempo no cliente automaticamente
    const tempoCalculado = calcularTempoCliente(value, tecnicoFormData.hora_fim);
    if (tempoCalculado !== null) {
      novoFormData.minutos_cliente = tempoCalculado;
      setHoras(Math.floor(tempoCalculado / 60).toString());
      setMinutos((tempoCalculado % 60).toString());
    }
    
    setTecnicoFormData(novoFormData);
  };

  const handleHoraFimChange = (value) => {
    const novoFormData = { ...tecnicoFormData, hora_fim: value };
    
    // Calcular tempo no cliente automaticamente
    const tempoCalculado = calcularTempoCliente(tecnicoFormData.hora_inicio, value);
    if (tempoCalculado !== null) {
      novoFormData.minutos_cliente = tempoCalculado;
      setHoras(Math.floor(tempoCalculado / 60).toString());
      setMinutos((tempoCalculado % 60).toString());
    }
    
    setTecnicoFormData(novoFormData);
  };

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

  const handleHorasChange = (value) => {
    const h = parseInt(value) || 0;
    setHoras(value);
    const m = parseInt(minutos) || 0;
    setTecnicoFormData({ 
      ...tecnicoFormData, 
      minutos_cliente: (h * 60) + m 
    });
  };

  const handleMinutosChange = (value) => {
    const m = parseInt(value) || 0;
    setMinutos(value);
    const h = parseInt(horas) || 0;
    setTecnicoFormData({ 
      ...tecnicoFormData, 
      minutos_cliente: (h * 60) + m 
    });
  };

  // Calcular Kms automaticamente
  const kmsCalculado = Math.max(0, (parseFloat(tecnicoFormData.kms_final) || 0) - (parseFloat(tecnicoFormData.kms_inicial) || 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {isEditing ? <Edit className="w-5 h-5 text-blue-400" /> : <Plus className="w-5 h-5 text-green-400" />}
            {isEditing ? 'Editar Registo' : 'Adicionar Registo Manual'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 mt-4">
          {/* Tipo de Registo */}
          <div>
            <Label className="text-gray-300 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Tipo de Registo *
            </Label>
            <select
              value={tecnicoFormData.tipo_registo || 'manual'}
              onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, tipo_registo: e.target.value })}
              className="w-full bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 mt-1"
            >
              <option value="manual">Manual</option>
              <option value="trabalho">Trabalho</option>
              <option value="viagem">Viagem</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Seleção de Técnico */}
            <div>
              <Label className="text-gray-300 flex items-center gap-2">
                <User className="w-4 h-4" />
                Nome do Técnico *
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
                  value={tecnicoFormData.tecnico_nome || ''}
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
                value={tecnicoFormData.data_trabalho || ''}
                onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, data_trabalho: e.target.value })}
                className="bg-[#0f0f0f] border-gray-700 text-white"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Código: <span className="text-blue-400 font-semibold">{getTipoHorarioCodigo(tecnicoFormData.tipo_horario)}</span>
              </p>
            </div>
          </div>

          {/* Tempo no Cliente (HH:MM) */}
          <div>
            <Label className="text-gray-300 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Tempo no Cliente *
            </Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min="0"
                max="24"
                value={horas}
                onChange={(e) => handleHorasChange(e.target.value)}
                className="bg-[#0f0f0f] border-gray-700 text-white w-20 text-center"
                placeholder="0"
              />
              <span className="text-gray-400 font-bold">:</span>
              <Input
                type="number"
                min="0"
                max="59"
                value={minutos}
                onChange={(e) => handleMinutosChange(e.target.value)}
                className="bg-[#0f0f0f] border-gray-700 text-white w-20 text-center"
                placeholder="00"
              />
              <span className="text-gray-500 text-sm">(HH:MM)</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Total: {tecnicoFormData.minutos_cliente || 0} minutos
            </p>
          </div>

          {/* Km's Iniciais e Finais */}
          <div className="space-y-3">
            <Label className="text-gray-300 flex items-center gap-2">
              <Car className="w-4 h-4" />
              Quilómetros
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-400 text-sm">Km's Iniciais</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={tecnicoFormData.kms_inicial ?? ''}
                  onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, kms_inicial: parseFloat(e.target.value) || 0 })}
                  className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-gray-400 text-sm">Km's Finais</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={tecnicoFormData.kms_final ?? ''}
                  onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, kms_final: parseFloat(e.target.value) || 0 })}
                  className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-gray-400 text-sm">Total (calculado)</Label>
                <div className="bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 mt-1 font-semibold text-green-400">
                  {kmsCalculado.toFixed(1)} km
                </div>
              </div>
            </div>
            
            {/* Aviso sobre Kms */}
            <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-300">
                Aos kms de ida já adicionados iremos adicionar os kms de volta após assinatura deste relatório.
              </p>
            </div>
          </div>

          {/* Hora Início e Fim (Folha de Horas) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-300 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Hora de Início (opcional)
              </Label>
              <Input
                type="time"
                value={tecnicoFormData.hora_inicio || ''}
                onChange={(e) => handleHoraInicioChange(e.target.value)}
                className="bg-[#0f0f0f] border-gray-700 text-white"
              />
              <p className="text-xs text-gray-500 mt-1">Para Folha de Horas</p>
            </div>
            <div>
              <Label className="text-gray-300 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Hora de Fim (opcional)
              </Label>
              <Input
                type="time"
                value={tecnicoFormData.hora_fim || ''}
                onChange={(e) => handleHoraFimChange(e.target.value)}
                className="bg-[#0f0f0f] border-gray-700 text-white"
              />
              <p className="text-xs text-gray-500 mt-1">Para Folha de Horas</p>
            </div>
          </div>
          
          {/* Info sobre cálculo automático */}
          {tecnicoFormData.hora_inicio && tecnicoFormData.hora_fim && (
            <div className="bg-green-900/20 border border-green-600/30 rounded-lg p-3 flex items-start gap-2">
              <Clock className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-green-300">
                <strong>Cálculo automático:</strong> {tecnicoFormData.hora_inicio} → {tecnicoFormData.hora_fim} = {Math.floor((tecnicoFormData.minutos_cliente || 0) / 60)}h{String((tecnicoFormData.minutos_cliente || 0) % 60).padStart(2, '0')} (já descontada 1h de pausa)
              </p>
            </div>
          )}

          {/* Tipo de Horário */}
          <div>
            <Label className="text-gray-300">Tipo de Horário *</Label>
            <select
              value={tecnicoFormData.tipo_horario || 'diurno'}
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
              {loading ? 'A guardar...' : (isEditing ? 'Atualizar Técnico' : 'Adicionar Técnico')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TecnicoModal;
