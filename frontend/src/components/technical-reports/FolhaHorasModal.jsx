import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { FileSpreadsheet, DollarSign, FileText, User, Calendar, Download, Zap } from 'lucide-react';

const FolhaHorasModal = ({
  open,
  onOpenChange,
  selectedRelatorio,
  folhaHorasData,
  folhaHorasTarifas,
  folhaHorasExtras,
  updateFolhaHorasTarifa,
  updateFolhaHorasExtra,
  onGeneratePDF,
  generatingFolhaHoras
}) => {
  const [dietaAutomatica, setDietaAutomatica] = useState(false);
  const [dietaValor, setDietaValor] = useState('');
  
  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

  const getDataInfo = (dataStr) => {
    const dataObj = new Date(dataStr + 'T00:00:00');
    return {
      formatted: dataObj.toLocaleDateString('pt-PT'),
      weekday: diasSemana[dataObj.getDay()]
    };
  };

  // Usar registos individuais do backend (já ordenados)
  const getRegistosOrdenados = () => {
    // Usar a nova lista registos_individuais se disponível
    if (folhaHorasData?.registos_individuais) {
      return folhaHorasData.registos_individuais;
    }
    
    // Fallback para compatibilidade com dados antigos
    if (!folhaHorasData?.tecnicos) return [];
    
    const registos = folhaHorasData.registos || [];
    const tecnicosManuais = folhaHorasData.tecnicos_manuais || [];
    
    // Combinar todos os registos
    const todosRegistos = [];
    
    // Adicionar registos de cronómetro
    registos.forEach(reg => {
      let data = reg.data || '';
      if (typeof data === 'string' && data.includes('T')) {
        data = data.split('T')[0];
      }
      todosRegistos.push({
        tecnico_id: reg.tecnico_id,
        tecnico_nome: reg.tecnico_nome,
        data: data,
        tipo: reg.tipo || 'cronómetro',
        codigo: reg.codigo || '-',
        source: 'cronometro',
        registo_id: reg.id
      });
    });
    
    // Adicionar registos manuais
    tecnicosManuais.forEach(tec => {
      let data = tec.data_trabalho || '';
      if (typeof data === 'string' && data.includes('T')) {
        data = data.split('T')[0];
      }
      const codigosMap = { 'diurno': '1', 'noturno': '2', 'sabado': 'S', 'domingo_feriado': 'D' };
      todosRegistos.push({
        tecnico_id: tec.id,
        tecnico_nome: tec.tecnico_nome,
        data: data,
        tipo: tec.tipo_registo || 'manual',
        codigo: codigosMap[tec.tipo_horario] || '-',
        source: 'manual',
        registo_id: tec.id
      });
    });
    
    // Ordenar por data
    return todosRegistos.sort((a, b) => new Date(a.data) - new Date(b.data));
  };

  // Para extras (dietas, portagens, despesas) - manter agrupado por técnico/data
  const getExtrasOrdenados = () => {
    if (!folhaHorasData?.datas_por_tecnico) return [];
    
    const registos = folhaHorasData.registos || [];
    const tecnicosManuais = folhaHorasData.tecnicos_manuais || [];
    
    return Object.entries(folhaHorasData.datas_por_tecnico)
      .flatMap(([tecnicoId, datas]) => {
        const tecnico = folhaHorasData.tecnicos?.find(t => t.id === tecnicoId);
        return datas.map(data => {
          // Procurar nos registos de cronómetro
          const registoCrono = registos.find(r => r.tecnico_id === tecnicoId && (r.data === data || r.data?.split('T')[0] === data));
          // Procurar nos técnicos manuais
          const registoManual = tecnicosManuais.find(t => t.id === tecnicoId && (t.data_trabalho === data || t.data_trabalho?.split('T')[0] === data));
          
          let tipo = '-';
          let codigo = '-';
          
          if (registoCrono) {
            tipo = registoCrono.tipo || 'cronómetro';
            codigo = registoCrono.codigo || '-';
          } else if (registoManual) {
            tipo = registoManual.tipo_registo || 'manual';
            // Converter tipo_horario para código
            const codigosMap = {
              'diurno': '1',
              'noturno': '2',
              'sabado': 'S',
              'domingo_feriado': 'D'
            };
            codigo = codigosMap[registoManual.tipo_horario] || '-';
          }
          
          return {
            tecnicoId,
            tecnicoNome: tecnico?.nome || 'Técnico',
            data,
            tipo,
            codigo
          };
        });
      })
      .sort((a, b) => new Date(a.data) - new Date(b.data));
  };

  // Aplicar dieta a todos os técnicos/dias
  const handleAplicarDietaTodos = (checked) => {
    setDietaAutomatica(checked);
    if (checked && dietaValor) {
      getExtrasOrdenados().forEach(({ tecnicoId, data }) => {
        const chave = `${tecnicoId}_${data}`;
        updateFolhaHorasExtra(chave, 'dieta', dietaValor);
      });
    }
  };

  // Quando o valor da dieta muda, aplicar a todos se checkbox ativa
  const handleDietaValorChange = (valor) => {
    setDietaValor(valor);
    if (dietaAutomatica && valor) {
      getExtrasOrdenados().forEach(({ tecnicoId, data }) => {
        const chave = `${tecnicoId}_${data}`;
        updateFolhaHorasExtra(chave, 'dieta', valor);
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileSpreadsheet className="w-5 h-5 text-amber-400" />
            Folha de Horas - OT #{selectedRelatorio?.numero_assistencia}
          </DialogTitle>
        </DialogHeader>

        {folhaHorasData && (
          <div className="space-y-6 mt-4">
            {/* Info do Cliente */}
            <div className="bg-[#0f0f0f] p-4 rounded-lg">
              <p className="text-gray-400 text-sm">Cliente</p>
              <p className="text-white font-semibold">{folhaHorasData.cliente?.nome}</p>
              <p className="text-gray-400 text-sm mt-1">Localização: {folhaHorasData.relatorio?.local_intervencao}</p>
            </div>

            {/* Tarifas por Técnico */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-400" />
                Tarifas por Técnico
              </h3>
              <p className="text-gray-400 text-sm mb-4">
                Selecione a tarifa (valor/hora) para cada técnico e data. Deixe vazio para não aplicar tarifa.
              </p>
              
              {getRegistosOrdenados().length > 0 ? (
                <div className="space-y-3">
                  {getRegistosOrdenados().map((registo, idx) => {
                    const { formatted, weekday } = getDataInfo(registo.data);
                    
                    // Labels e cores para tipos
                    const tipoLabels = {
                      'trabalho': { label: 'Trabalho', color: 'bg-green-600/20 text-green-400' },
                      'viagem': { label: 'Viagem', color: 'bg-blue-600/20 text-blue-400' },
                      'manual': { label: 'Manual', color: 'bg-gray-600/20 text-gray-300' },
                      'cronómetro': { label: 'Cronómetro', color: 'bg-purple-600/20 text-purple-400' }
                    };
                    const tipoInfo = tipoLabels[registo.tipo] || { label: registo.tipo, color: 'bg-gray-600/20 text-gray-400' };
                    
                    return (
                      <div key={`${registo.tecnico_id}_${registo.data}_${registo.registo_id}_${idx}`} className="bg-[#0f0f0f] p-4 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-blue-400" />
                            <span className="text-white font-medium">{registo.tecnico_nome}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            {/* Tipo de Entrada */}
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${tipoInfo.color}`}>
                              {tipoInfo.label}
                            </span>
                            {/* Código */}
                            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs font-mono font-bold">
                              {registo.codigo}
                            </span>
                            {/* Data */}
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4 text-amber-400" />
                              <span className="text-amber-400 font-medium">{formatted}</span>
                              <span className="text-gray-500">({weekday})</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-gray-400 text-sm">Tarifa (€/h):</Label>
                          {folhaHorasData.tarifas?.length > 0 ? (
                            <select
                              value={folhaHorasTarifas[`${registo.tecnico_id}_${registo.data}_${registo.codigo}`] || folhaHorasTarifas[registo.tecnico_id] || ''}
                              onChange={(e) => updateFolhaHorasTarifa(`${registo.tecnico_id}_${registo.data}_${registo.codigo}`, e.target.value)}
                              className="flex-1 bg-[#1a1a1a] border border-gray-700 text-white rounded-md px-3 py-2 text-sm"
                            >
                              <option value="">Sem tarifa</option>
                              {folhaHorasData.tarifas.map(tarifa => (
                                <option key={tarifa.id} value={tarifa.valor_por_hora}>
                                  {tarifa.nome} ({tarifa.valor_por_hora.toFixed(2)}€/h)
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={folhaHorasTarifas[`${registo.tecnico_id}_${registo.data}_${registo.codigo}`] || folhaHorasTarifas[registo.tecnico_id] || ''}
                              onChange={(e) => updateFolhaHorasTarifa(`${registo.tecnico_id}_${registo.data}_${registo.codigo}`, e.target.value)}
                              className="flex-1 bg-[#1a1a1a] border-gray-700 text-white"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500">
                  Nenhum técnico registado nesta OT
                </div>
              )}
              
              {folhaHorasData.tarifas?.length === 0 && (
                <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-yellow-400 text-sm">
                    ⚠️ Nenhuma tarifa configurada. Configure tarifas no Admin Dashboard → Tarifas, ou introduza o valor manualmente.
                  </p>
                </div>
              )}
            </div>

            {/* Dietas, Portagens e Despesas */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <FileText className="w-5 h-5 text-green-400" />
                Dietas, Portagens e Despesas
              </h3>
              <p className="text-gray-400 text-sm mb-4">
                Preencha os valores extras por técnico e data. Campos vazios serão considerados 0,00€.
              </p>
              
              {/* Opção de Dieta Automática */}
              <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 p-4 rounded-lg mb-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="dieta-automatica"
                      checked={dietaAutomatica}
                      onCheckedChange={handleAplicarDietaTodos}
                      className="border-green-500 data-[state=checked]:bg-green-600"
                    />
                    <Label htmlFor="dieta-automatica" className="text-green-400 font-medium cursor-pointer flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      Aplicar dieta a todos os dias/técnicos
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-gray-400 text-sm">Valor (€):</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={dietaValor}
                      onChange={(e) => handleDietaValorChange(e.target.value)}
                      className="w-24 bg-[#1a1a1a] border-green-500/50 text-white h-8"
                      disabled={!dietaAutomatica}
                    />
                  </div>
                </div>
                {dietaAutomatica && dietaValor && (
                  <p className="text-green-400/70 text-xs mt-2">
                    ✓ Dieta de {parseFloat(dietaValor).toFixed(2)}€ aplicada a {getExtrasOrdenados().length} registo(s)
                  </p>
                )}
              </div>
              
              {getExtrasOrdenados().length > 0 ? (
                <div className="space-y-3">
                  {getExtrasOrdenados().map(({ tecnicoId, tecnicoNome, data }) => {
                    const chave = `${tecnicoId}_${data}`;
                    const valores = folhaHorasExtras[chave] || { dieta: '', portagens: '', despesas: '' };
                    const { formatted, weekday } = getDataInfo(data);
                    
                    return (
                      <div key={chave} className="bg-[#0f0f0f] p-4 rounded-lg">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-blue-400" />
                            <span className="text-white font-medium">{tecnicoNome}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            {/* Data */}
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4 text-green-400" />
                              <span className="text-green-400 font-medium">{formatted}</span>
                              <span className="text-gray-500">({weekday})</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label className="text-xs text-gray-500">Dieta (€)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={valores.dieta}
                              onChange={(e) => updateFolhaHorasExtra(chave, 'dieta', e.target.value)}
                              className="bg-[#1a1a1a] border-gray-700 text-white h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500">Portagens (€)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={valores.portagens}
                              onChange={(e) => updateFolhaHorasExtra(chave, 'portagens', e.target.value)}
                              className="bg-[#1a1a1a] border-gray-700 text-white h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500">Despesas (€)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={valores.despesas}
                              onChange={(e) => updateFolhaHorasExtra(chave, 'despesas', e.target.value)}
                              className="bg-[#1a1a1a] border-gray-700 text-white h-9"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500">
                  Nenhuma data de trabalho registada
                </div>
              )}
            </div>

            {/* Resumo */}
            <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-lg">
              <h4 className="text-blue-400 font-semibold mb-2">📋 Informação</h4>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>• Preço por Km fixo: <span className="text-white font-medium">0,65€</span></li>
                <li>• Os valores das horas e km são calculados automaticamente</li>
                <li>• O PDF será gerado em formato horizontal (landscape)</li>
              </ul>
            </div>

            {/* Botões */}
            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => onOpenChange(false)}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                Cancelar
              </Button>
              <Button
                onClick={onGeneratePDF}
                disabled={generatingFolhaHoras}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
              >
                <Download className="w-4 h-4 mr-2" />
                {generatingFolhaHoras ? 'A gerar...' : 'Gerar PDF'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FolhaHorasModal;
