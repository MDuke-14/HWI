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

  // Calcular Tempo no Cliente automaticamente quando hora_inicio, hora_fim ou incluirPausa mudam
  const calcularTempoCliente = (horaInicio, horaFim, incluirPausa) => {
    if (horaInicio && horaFim) {
      const [inicioH, inicioM] = horaInicio.split(':').map(Number);
      const [fimH, fimM] = horaFim.split(':').map(Number);
      
      const inicioMinutos = inicioH * 60 + inicioM;
      const fimMinutos = fimH * 60 + fimM;
      
      // Calcular diferença (descontar 1h de pausa APENAS se checkbox estiver selecionado)
      const pausaMinutos = incluirPausa ? 60 : 0;
      let diferencaMinutos = fimMinutos - inicioMinutos - pausaMinutos;
      
      // Se o fim for antes do início (atravessa meia-noite), adicionar 24h
      if (diferencaMinutos < -pausaMinutos) {
        diferencaMinutos = (24 * 60) + fimMinutos - inicioMinutos - pausaMinutos;
      }
      
      // Garantir que não é negativo
      return Math.max(0, diferencaMinutos);
    }
    return null;
  };

  const handleHoraInicioChange = (value) => {
    const novoFormData = { ...tecnicoFormData, hora_inicio: value };
    
    // Calcular tempo no cliente automaticamente
    const tempoCalculado = calcularTempoCliente(value, tecnicoFormData.hora_fim, tecnicoFormData.incluir_pausa);
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
    const tempoCalculado = calcularTempoCliente(tecnicoFormData.hora_inicio, value, tecnicoFormData.incluir_pausa);
    if (tempoCalculado !== null) {
      novoFormData.minutos_cliente = tempoCalculado;
      setHoras(Math.floor(tempoCalculado / 60).toString());
      setMinutos((tempoCalculado % 60).toString());
    }
    
    setTecnicoFormData(novoFormData);
  };

  const handlePausaChange = (checked) => {
    const novoFormData = { ...tecnicoFormData, incluir_pausa: checked };
    
    // Recalcular tempo no cliente
    const tempoCalculado = calcularTempoCliente(tecnicoFormData.hora_inicio, tecnicoFormData.hora_fim, checked);
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

  // Calcular Kms automaticamente (ida)
  const kmsCalculadoIda = Math.max(0, (parseFloat(tecnicoFormData.kms_final) || 0) - (parseFloat(tecnicoFormData.kms_inicial) || 0));
  
  // Calcular Kms automaticamente (volta)
  const kmsCalculadoVolta = Math.max(0, (parseFloat(tecnicoFormData.kms_final_volta) || 0) - (parseFloat(tecnicoFormData.kms_inicial_volta) || 0));
  
  // Total de Kms (ida + volta)
  const kmsTotalFinal = kmsCalculadoIda + kmsCalculadoVolta;

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
              <option value="oficina">Oficina</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Seleção de Técnico */}
            <div>
              <Label className="text-gray-300 flex items-center gap-2">
                <User className="w-4 h-4" />
                Nome do Técnico *
              </Label>
              {isEditing ? (
                /* Ao editar, o técnico não pode ser alterado */
                <Input
                  value={tecnicoFormData.tecnico_nome || ''}
                  className="bg-[#0f0f0f] border-gray-700 text-white cursor-not-allowed opacity-70"
                  readOnly
                  disabled
                />
              ) : allUsers.length > 0 ? (
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

          {/* Tempo no Cliente (HH:MM) - Calculado automaticamente */}
          <div>
            <Label className="text-gray-300 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Tempo no Cliente (calculado)
            </Label>
            <div className="flex items-center gap-2 mt-1">
              <div className="bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 w-20 text-center font-semibold text-green-400">
                {Math.floor((tecnicoFormData.minutos_cliente || 0) / 60)}
              </div>
              <span className="text-gray-400 font-bold">:</span>
              <div className="bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 w-20 text-center font-semibold text-green-400">
                {String((tecnicoFormData.minutos_cliente || 0) % 60).padStart(2, '0')}
              </div>
              <span className="text-gray-500 text-sm">(HH:MM)</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {tecnicoFormData.hora_inicio && tecnicoFormData.hora_fim 
                ? 'Calculado com base nas horas de início e fim' 
                : 'Preencha as horas de início e fim para calcular'}
            </p>
          </div>

          {/* Km's Ida */}
          <div className="space-y-3">
            <Label className="text-gray-300 flex items-center gap-2">
              <Car className="w-4 h-4" />
              Quilómetros - Ida
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
                <Label className="text-gray-400 text-sm">Total Ida</Label>
                <div className="bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 mt-1 font-semibold text-blue-400">
                  {kmsCalculadoIda.toFixed(1)} km
                </div>
              </div>
            </div>
          </div>

          {/* Km's Volta */}
          <div className="space-y-3">
            <Label className="text-gray-300 flex items-center gap-2">
              <Car className="w-4 h-4" />
              Quilómetros - Volta
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-400 text-sm">Km's Iniciais</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={tecnicoFormData.kms_inicial_volta ?? ''}
                  onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, kms_inicial_volta: parseFloat(e.target.value) || 0 })}
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
                  value={tecnicoFormData.kms_final_volta ?? ''}
                  onChange={(e) => setTecnicoFormData({ ...tecnicoFormData, kms_final_volta: parseFloat(e.target.value) || 0 })}
                  className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-gray-400 text-sm">Total Volta</Label>
                <div className="bg-[#0f0f0f] border border-gray-700 text-white rounded-md px-3 py-2 mt-1 font-semibold text-orange-400">
                  {kmsCalculadoVolta.toFixed(1)} km
                </div>
              </div>
            </div>
          </div>

          {/* Total Final de Kms */}
          <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <Label className="text-green-400 font-semibold flex items-center gap-2">
                <Car className="w-5 h-5" />
                Total de Quilómetros (Ida + Volta)
              </Label>
              <div className="text-2xl font-bold text-green-400">
                {kmsTotalFinal.toFixed(1)} km
              </div>
            </div>
            <p className="text-xs text-green-400/70 mt-2">
              Ida: {kmsCalculadoIda.toFixed(1)} km + Volta: {kmsCalculadoVolta.toFixed(1)} km
            </p>
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

          {/* Checkbox de Pausa */}
          {tecnicoFormData.hora_inicio && tecnicoFormData.hora_fim && (
            <div className="flex items-center gap-3 p-3 bg-[#0f0f0f] rounded-lg border border-gray-700">
              <input
                type="checkbox"
                id="incluir_pausa"
                checked={tecnicoFormData.incluir_pausa || false}
                onChange={(e) => handlePausaChange(e.target.checked)}
                className="w-5 h-5 rounded border-gray-600 bg-[#1a1a1a] text-amber-500 focus:ring-amber-500"
              />
              <label htmlFor="incluir_pausa" className="text-gray-300 cursor-pointer flex-1">
                <span className="font-medium">Incluir 1 hora de pausa</span>
                <p className="text-xs text-gray-500">Descontar automaticamente 1h do tempo total</p>
              </label>
            </div>
          )}
          
          {/* Info sobre cálculo automático do tempo e código */}
          {tecnicoFormData.hora_inicio && tecnicoFormData.hora_fim && (
            <div className="bg-purple-900/20 border border-purple-600/30 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-purple-300">
                  <strong>Cálculo automático:</strong> {tecnicoFormData.hora_inicio} → {tecnicoFormData.hora_fim} = {Math.floor((tecnicoFormData.minutos_cliente || 0) / 60)}h{String((tecnicoFormData.minutos_cliente || 0) % 60).padStart(2, '0')} 
                  {tecnicoFormData.incluir_pausa ? ' (descontada 1h de pausa)' : ''}
                </div>
              </div>
              <p className="text-xs text-purple-400/70 mt-2">
                <strong>Código horário calculado automaticamente:</strong><br />
                • Código 1 = Dias úteis (07:00-19:00)<br />
                • Código 2 = Dias úteis noturno (antes 07:00 ou após 19:00)<br />
                • Código S = Sábados<br />
                • Código D = Domingos e Feriados<br />
                Se o horário atravessar códigos diferentes, serão criados registos separados.
              </p>
            </div>
          )}

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
