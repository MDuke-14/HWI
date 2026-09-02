import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileSpreadsheet, DollarSign, User, Calendar, Download, Settings } from 'lucide-react';
import axios from 'axios';
import { API } from '@/App';

const FolhaHorasModal = ({
  open,
  onOpenChange,
  selectedRelatorio,
  folhaHorasData,
  folhaHorasTarifas,
  updateFolhaHorasTarifa,
  onGeneratePDF,
  generatingFolhaHoras,
}) => {
  const [tabelasPreco, setTabelasPreco] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState(1);
  const [tarifasDaTabela, setTarifasDaTabela] = useState([]);
  
  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

  useEffect(() => {
    if (open) {
      fetchTabelasPreco();
    }
  }, [open]);

  useEffect(() => {
    if (open && selectedTableId && folhaHorasData) {
      fetchTarifasDaTabela(selectedTableId);
    }
  }, [open, selectedTableId, folhaHorasData]);

  const fetchTabelasPreco = async () => {
    try {
      const response = await axios.get(`${API}/tabelas-preco`);
      setTabelasPreco(response.data);
      // Pré-selecionar a tabela marcada como padrão (se existir)
      const defaultTabela = response.data.find(t => t.is_default);
      if (defaultTabela) {
        setSelectedTableId(defaultTabela.table_id);
      }
    } catch (error) {
      console.error('Erro ao carregar tabelas de preço');
    }
  };

  const fetchTarifasDaTabela = async (tableId) => {
    try {
      const response = await axios.get(`${API}/tarifas?table_id=${tableId}`);
      const tarifas = response.data;
      setTarifasDaTabela(tarifas);
      if (folhaHorasData) {
        autoFillTarifas(tarifas);
      }
    } catch (error) {
      console.error('Erro ao carregar tarifas da tabela');
    }
  };

  const autoFillTarifas = (tarifas) => {
    let registos = [];
    
    if (folhaHorasData?.registos_individuais) {
      registos = folhaHorasData.registos_individuais.map(reg => ({
        ...reg,
        tipo_registo: reg.tipo?.toLowerCase() || 'trabalho',
        funcao_ot: reg.funcao_ot || 'tecnico'
      }));
    } else if (folhaHorasData?.tecnicos) {
      const registosBase = folhaHorasData.registos || [];
      const tecnicosManuais = folhaHorasData.tecnicos_manuais || [];
      
      registosBase.forEach(reg => {
        let data = reg.data || '';
        if (typeof data === 'string' && data.includes('T')) data = data.split('T')[0];
        const tipoLower = reg.tipo?.toLowerCase() || 'trabalho';
        const tipoRegisto = ['viagem', 'oficina', 'trabalho'].includes(tipoLower) ? tipoLower : 'trabalho';
        registos.push({
          tecnico_id: reg.tecnico_id, data, codigo: reg.codigo || '-',
          tipo_registo: tipoRegisto, funcao_ot: reg.funcao_ot || 'tecnico'
        });
      });
      
      const codigosMap = { 'diurno': '1', 'noturno': '2', 'sabado': 'S', 'domingo_feriado': 'D' };
      tecnicosManuais.forEach(tec => {
        let data = tec.data_trabalho || '';
        if (typeof data === 'string' && data.includes('T')) data = data.split('T')[0];
        const tipoLowerM = tec.tipo?.toLowerCase() || 'trabalho';
        const tipoRegisto = ['viagem', 'oficina', 'trabalho'].includes(tipoLowerM) ? tipoLowerM : 'trabalho';
        registos.push({
          tecnico_id: tec.tecnico_id || tec.id, data,
          codigo: codigosMap[tec.tipo_horario] || '-',
          tipo_registo: tipoRegisto, funcao_ot: tec.funcao_ot || 'tecnico'
        });
      });
    }
    
    const tarifaMap = [];
    tarifas.forEach(t => {
      if (t.codigo && t.codigo !== 'manual') {
        tarifaMap.push({
          id: t.id, codigo: t.codigo,
          tipo_registo: t.tipo_registo || null,
          tipo_colaborador: t.tipo_colaborador || null,
          valor: t.valor_por_hora
        });
      }
    });
    
    const findBestTarifa = (codigo, tipoRegisto, funcaoOt) => {
      const tipoNorm = tipoRegisto === 'oficina' ? 'trabalho' : tipoRegisto;
      let bestMatch = null;
      let bestScore = -1;
      for (const t of tarifaMap) {
        if (t.codigo !== codigo) continue;
        let score = 0;
        if (t.tipo_registo && t.tipo_registo !== tipoNorm) continue;
        if (t.tipo_registo === tipoNorm) score += 2;
        if (t.tipo_colaborador && t.tipo_colaborador !== funcaoOt) continue;
        if (t.tipo_colaborador === funcaoOt) score += 4;
        if (score > bestScore) { bestScore = score; bestMatch = t; }
      }
      // Fallback: se não houve match exacto, devolve a primeira tarifa com esse código
      if (!bestMatch) {
        const fallback = tarifaMap.find(t => t.codigo === codigo);
        if (fallback) return fallback.id;
      }
      return bestMatch?.id || null;
    };
    
    registos.forEach(registo => {
      const chave = `${registo.tecnico_id}_${registo.data}_${registo.codigo}_${registo.tipo_registo}`;
      const tarifaId = findBestTarifa(registo.codigo, registo.tipo_registo || 'trabalho', registo.funcao_ot || 'tecnico');
      if (registo.codigo && registo.codigo !== '-' && tarifaId) {
        updateFolhaHorasTarifa(chave, tarifaId);
      }
    });
  };

  const handleTableChange = (tableId) => {
    setSelectedTableId(tableId);
  };

  const handleGeneratePDF = () => {
    onGeneratePDF(selectedTableId);
  };

  const getDataInfo = (dataStr) => {
    const dataObj = new Date(dataStr + 'T00:00:00');
    return {
      formatted: dataObj.toLocaleDateString('pt-PT'),
      weekday: diasSemana[dataObj.getDay()]
    };
  };

  const getRegistosOrdenados = () => {
    if (folhaHorasData?.registos_individuais) return folhaHorasData.registos_individuais;
    if (!folhaHorasData?.tecnicos) return [];
    const registos = folhaHorasData.registos || [];
    const tecnicosManuais = folhaHorasData.tecnicos_manuais || [];
    const todosRegistos = [];
    registos.forEach(reg => {
      let data = reg.data || '';
      if (typeof data === 'string' && data.includes('T')) data = data.split('T')[0];
      todosRegistos.push({
        tecnico_id: reg.tecnico_id, tecnico_nome: reg.tecnico_nome,
        funcao_ot: reg.funcao_ot || 'tecnico', data, tipo: reg.tipo || 'trabalho',
        codigo: reg.codigo || '-', source: 'cronometro', registo_id: reg.id
      });
    });
    const codigosMap = { 'diurno': '1', 'noturno': '2', 'sabado': 'S', 'domingo_feriado': 'D' };
    tecnicosManuais.forEach(tec => {
      let data = tec.data_trabalho || '';
      if (typeof data === 'string' && data.includes('T')) data = data.split('T')[0];
      todosRegistos.push({
        tecnico_id: tec.tecnico_id || tec.id, tecnico_nome: tec.tecnico_nome,
        funcao_ot: tec.funcao_ot || 'tecnico', data,
        tipo: tec.tipo_registo || tec.tipo || 'manual',
        codigo: codigosMap[tec.tipo_horario] || '-', source: 'manual', registo_id: tec.id
      });
    });
    return todosRegistos.sort((a, b) => {
      const dateCompare = new Date(a.data) - new Date(b.data);
      if (dateCompare !== 0) return dateCompare;
      const tipoOrdem = { 'trabalho': 0, 'viagem': 1, 'oficina': 2, 'manual': 3 };
      return (tipoOrdem[a.tipo] || 99) - (tipoOrdem[b.tipo] || 99);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileSpreadsheet className="w-5 h-5 text-amber-400" />
            Folha de Horas - FS #{selectedRelatorio?.numero_assistencia}
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

            {/* Seleção de Tabela de Preço */}
            <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 p-4 rounded-lg border border-amber-500/30">
              <h3 className="text-lg font-semibold text-amber-400 mb-3 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Tabela de Preço
              </h3>
              <p className="text-gray-400 text-sm mb-3">
                Selecione a tabela de preço. As tarifas serão preenchidas automaticamente por código horário.
              </p>
              <div className="flex gap-2 flex-wrap">
                {tabelasPreco.map((tabela) => (
                  <button
                    key={tabela.table_id}
                    onClick={() => handleTableChange(tabela.table_id)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                      selectedTableId === tabela.table_id
                        ? 'bg-amber-600 text-white'
                        : 'bg-[#1a1a1a] text-gray-400 hover:bg-[#252525] border border-gray-700'
                    }`}
                  >
                    <DollarSign className="w-4 h-4" />
                    {tabela.nome}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      selectedTableId === tabela.table_id ? 'bg-amber-700' : 'bg-gray-700'
                    }`}>
                      {tabela.valor_km?.toFixed(2)}€/km
                    </span>
                  </button>
                ))}
              </div>
              {tabelasPreco.length === 0 && (
                <p className="text-gray-500 text-sm">A carregar tabelas de preço...</p>
              )}
            </div>

            {/* Card de Despesas removido — despesas usam agora o `valor_final`
                persistido no popup da FS. Se alguma não tiver valor_final gravado,
                o backend cai automaticamente no `valor` original. */}

            {/* Tarifas por Técnico */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-400" />
                Tarifas por Colaborador
              </h3>
              <p className="text-gray-400 text-sm mb-4">
                Selecione a tarifa (valor/hora) para cada técnico e data. Deixe vazio para não aplicar tarifa.
              </p>
              
              {getRegistosOrdenados().length > 0 ? (
                <div className="space-y-3">
                  {getRegistosOrdenados().map((registo, idx) => {
                    const { formatted, weekday } = getDataInfo(registo.data);
                    const tipoLabels = {
                      'trabalho': { label: 'Trabalho', color: 'bg-green-600/20 text-green-400' },
                      'viagem': { label: 'Viagem', color: 'bg-blue-600/20 text-blue-400' },
                      'oficina': { label: 'Oficina', color: 'bg-orange-600/20 text-orange-400' },
                      'manual': { label: 'Manual', color: 'bg-gray-600/20 text-gray-300' },
                      'cronómetro': { label: 'Cronómetro', color: 'bg-purple-600/20 text-purple-400' }
                    };
                    const tipoInfo = tipoLabels[registo.tipo] || { label: registo.tipo, color: 'bg-gray-600/20 text-gray-400' };
                    
                    return (
                      <div key={`${registo.tecnico_id}_${registo.data}_${registo.tipo}_${registo.registo_id}_${idx}`} className="bg-[#0f0f0f] p-4 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-blue-400" />
                            <span className="text-white font-medium">
                              {registo.tecnico_nome}
                              <span className={`ml-1 text-xs ${
                                registo.funcao_ot === 'senior' ? 'text-purple-400' :
                                registo.funcao_ot === 'junior' ? 'text-yellow-400' :
                                registo.funcao_ot === 'ajudante' ? 'text-orange-400' :
                                'text-cyan-400'
                              }`}>
                                ({
                                  registo.funcao_ot === 'senior' ? 'Téc. Sénior' :
                                  registo.funcao_ot === 'junior' ? 'Téc. Júnior' :
                                  registo.funcao_ot === 'ajudante' ? 'Ajudante' :
                                  'Técnico'
                                })
                              </span>
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${tipoInfo.color}`}>
                              {tipoInfo.label}
                            </span>
                            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs font-mono font-bold">
                              {registo.codigo}
                            </span>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4 text-amber-400" />
                              <span className="text-amber-400 font-medium">{formatted}</span>
                              <span className="text-gray-500">({weekday})</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-gray-400 text-sm">Tarifa ({registo.codigo} - €/h):</Label>
                          {folhaHorasData.tarifas?.length > 0 ? (
                            <select
                              value={folhaHorasTarifas[`${registo.tecnico_id}_${registo.data}_${registo.codigo}_${registo.tipo}`] || folhaHorasTarifas[`${registo.tecnico_id}_${registo.data}_${registo.codigo}`] || folhaHorasTarifas[registo.tecnico_id] || ''}
                              onChange={(e) => updateFolhaHorasTarifa(`${registo.tecnico_id}_${registo.data}_${registo.codigo}_${registo.tipo}`, e.target.value)}
                              className="flex-1 bg-[#1a1a1a] border border-gray-700 text-white rounded-md px-3 py-2 text-sm"
                            >
                              <option value="">Sem tarifa</option>
                              {(() => {
                                const ordemColab = { senior: 0, tecnico: 1, junior: 2, ajudante: 3 };
                                const ordemTipoReg = { trabalho: 0, viagem: 1 };
                                const tarifasOrdenadas = [...folhaHorasData.tarifas]
                                  .filter(t => !registo.codigo || registo.codigo === '-' || t.codigo === registo.codigo)
                                  .sort((a, b) => {
                                    const ca = ordemColab[a.tipo_colaborador] ?? 99;
                                    const cb = ordemColab[b.tipo_colaborador] ?? 99;
                                    if (ca !== cb) return ca - cb;
                                    const ra = ordemTipoReg[a.tipo_registo] ?? 99;
                                    const rb = ordemTipoReg[b.tipo_registo] ?? 99;
                                    if (ra !== rb) return ra - rb;
                                    return (a.nome || '').localeCompare(b.nome || '', 'pt');
                                  });
                                return tarifasOrdenadas.map(tarifa => {
                                  const labelColab = tarifa.tipo_colaborador
                                    ? ({ senior: 'Sénior', tecnico: 'Técnico', junior: 'Júnior', ajudante: 'Ajudante' }[tarifa.tipo_colaborador] || tarifa.tipo_colaborador)
                                    : null;
                                  const labelTipo = tarifa.tipo_registo
                                    ? (tarifa.tipo_registo === 'viagem' ? 'Viagem' : 'Trabalho')
                                    : null;
                                  const tags = [labelColab, labelTipo].filter(Boolean).join(' · ');
                                  return (
                                    <option key={tarifa.id} value={tarifa.id}>
                                      {tarifa.nome} ({tarifa.valor_por_hora.toFixed(2)}€/h){tags ? ` — ${tags}` : ''}
                                    </option>
                                  );
                                });
                              })()}
                            </select>
                          ) : (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={folhaHorasTarifas[`${registo.tecnico_id}_${registo.data}_${registo.codigo}_${registo.tipo}`] || folhaHorasTarifas[`${registo.tecnico_id}_${registo.data}_${registo.codigo}`] || folhaHorasTarifas[registo.tecnico_id] || ''}
                              onChange={(e) => updateFolhaHorasTarifa(`${registo.tecnico_id}_${registo.data}_${registo.codigo}_${registo.tipo}`, e.target.value)}
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
                    Nenhuma tarifa configurada. Configure tarifas no Admin Dashboard, ou introduza o valor manualmente.
                  </p>
                </div>
              )}
            </div>

            {/* Resumo */}
            <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-lg">
              <h4 className="text-blue-400 font-semibold mb-2">Informação</h4>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>Preço por Km: <span className="text-white font-medium">{(tabelasPreco.find(t => t.table_id === selectedTableId)?.valor_km || 0.65).toFixed(2)}€</span> <span className="text-amber-400">({tabelasPreco.find(t => t.table_id === selectedTableId)?.nome || 'Tabela 1'})</span></li>
                <li>Os valores das horas e km são calculados automaticamente</li>
                <li>O PDF será gerado em formato horizontal (landscape)</li>
              </ul>
            </div>

            {/* Botões */}
            <div className="flex gap-3 pt-4">
              <Button onClick={() => onOpenChange(false)} variant="outline" className="flex-1 border-gray-600">
                Cancelar
              </Button>
              <Button
                onClick={handleGeneratePDF}
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
