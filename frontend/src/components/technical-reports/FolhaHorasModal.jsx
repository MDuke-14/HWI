import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileSpreadsheet, DollarSign, User, Calendar, Download, Settings, Receipt, Eye, EyeOff, X, Save, Percent } from 'lucide-react';
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
  despesas = []
}) => {
  const [tabelasPreco, setTabelasPreco] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState(1);
  const [tarifasDaTabela, setTarifasDaTabela] = useState([]);
  
  // Despesas state
  const [showDespesasListPopup, setShowDespesasListPopup] = useState(false);
  const [showDespesaDetailPopup, setShowDespesaDetailPopup] = useState(false);
  const [selectedDespesaDetail, setSelectedDespesaDetail] = useState(null);
  const [despesaPercentual, setDespesaPercentual] = useState('');
  // Track adjustments: { despesaId: { percentual: number, excluida: boolean } }
  const [despesaAdjustments, setDespesaAdjustments] = useState({});
  
  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

  const tiposDespesa = [
    { value: 'outras', label: 'Outras' },
    { value: 'combustivel', label: 'Combustível' },
    { value: 'ferramentas', label: 'Ferramentas' },
    { value: 'portagens', label: 'Portagens' }
  ];

  // Reset adjustments when modal opens
  useEffect(() => {
    if (open) {
      fetchTabelasPreco();
      setDespesaAdjustments({});
      setShowDespesasListPopup(false);
      setShowDespesaDetailPopup(false);
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
    onGeneratePDF(selectedTableId, despesaAdjustments);
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

  // Despesas helpers
  const despesasVisiveis = despesas.filter(d => !despesaAdjustments[d.id]?.excluida);
  const despesasExcluidas = despesas.filter(d => despesaAdjustments[d.id]?.excluida);
  const totalDespesasOriginal = despesasVisiveis.reduce((sum, d) => sum + (d.valor || 0), 0);
  const totalDespesasAjustado = despesasVisiveis.reduce((sum, d) => {
    const adj = despesaAdjustments[d.id];
    const pct = adj?.percentual || 0;
    return sum + (d.valor || 0) * (1 + pct / 100);
  }, 0);

  const openDespesaDetail = (despesa) => {
    setSelectedDespesaDetail(despesa);
    const adj = despesaAdjustments[despesa.id];
    setDespesaPercentual(adj?.percentual?.toString() || '');
    setShowDespesaDetailPopup(true);
  };

  const handleDespesaGravar = () => {
    if (!selectedDespesaDetail) return;
    setDespesaAdjustments(prev => ({
      ...prev,
      [selectedDespesaDetail.id]: {
        ...prev[selectedDespesaDetail.id],
        percentual: parseFloat(despesaPercentual) || 0,
        excluida: false
      }
    }));
    setShowDespesaDetailPopup(false);
    setSelectedDespesaDetail(null);
  };

  const handleDespesaNaoVisualizar = () => {
    if (!selectedDespesaDetail) return;
    setDespesaAdjustments(prev => ({
      ...prev,
      [selectedDespesaDetail.id]: {
        ...prev[selectedDespesaDetail.id],
        excluida: true
      }
    }));
    setShowDespesaDetailPopup(false);
    setSelectedDespesaDetail(null);
  };

  const handleRestaurarDespesa = (despesaId) => {
    setDespesaAdjustments(prev => ({
      ...prev,
      [despesaId]: { ...prev[despesaId], excluida: false }
    }));
  };

  const getValorFinal = (despesa) => {
    const adj = despesaAdjustments[despesa.id];
    const pct = adj?.percentual || 0;
    return (despesa.valor || 0) * (1 + pct / 100);
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

            {/* Card de Despesas */}
            <div className="bg-gradient-to-r from-emerald-900/30 to-teal-900/30 p-4 rounded-lg border border-emerald-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-emerald-400 flex items-center gap-2">
                    <Receipt className="w-5 h-5" />
                    Despesas
                  </h3>
                  <p className="text-gray-400 text-sm mt-1">
                    {despesas.length > 0 ? (
                      <>
                        <span className="text-emerald-400 font-medium">{despesasVisiveis.length}</span> despesa(s) incluída(s)
                        {despesasExcluidas.length > 0 && (
                          <span className="text-red-400 ml-2">({despesasExcluidas.length} excluída(s))</span>
                        )}
                        {totalDespesasAjustado > 0 && (
                          <span className="ml-2">
                            - Total: {totalDespesasOriginal !== totalDespesasAjustado ? (
                              <>
                                <span className="line-through text-gray-500">{totalDespesasOriginal.toFixed(2)}€</span>
                                {' '}
                                <span className="text-emerald-400 font-semibold">{totalDespesasAjustado.toFixed(2)}€</span>
                              </>
                            ) : (
                              <span className="text-emerald-400 font-semibold">{totalDespesasOriginal.toFixed(2)}€</span>
                            )}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-500">Sem despesas registadas nesta OT</span>
                    )}
                  </p>
                </div>
                {despesas.length > 0 && (
                  <Button
                    onClick={() => setShowDespesasListPopup(true)}
                    className="bg-emerald-600 hover:bg-emerald-700"
                    size="sm"
                    data-testid="btn-ver-despesas"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    VER
                  </Button>
                )}
              </div>
            </div>

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
                              <span className={`ml-1 text-xs ${registo.funcao_ot === 'senior' ? 'text-purple-400' : registo.funcao_ot === 'junior' ? 'text-yellow-400' : 'text-cyan-400'}`}>
                                ({registo.funcao_ot === 'senior' ? 'Téc. Sénior' : registo.funcao_ot === 'junior' ? 'Téc. Júnior' : 'Técnico'})
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
                              {folhaHorasData.tarifas.map(tarifa => (
                                <option key={tarifa.id} value={tarifa.id}>
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

      {/* Popup Lista de Despesas */}
      <Dialog open={showDespesasListPopup} onOpenChange={setShowDespesasListPopup}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Receipt className="w-5 h-5 text-emerald-400" />
              Despesas - FS #{selectedRelatorio?.numero_assistencia}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3 mt-4">
            {/* Despesas incluídas */}
            {despesas.filter(d => !despesaAdjustments[d.id]?.excluida).map((despesa) => {
              const adj = despesaAdjustments[despesa.id];
              const pct = adj?.percentual || 0;
              const valorFinal = getValorFinal(despesa);
              
              return (
                <div
                  key={despesa.id}
                  onClick={() => openDespesaDetail(despesa)}
                  className="p-4 bg-[#0f0f0f] rounded-lg border border-gray-700 hover:border-emerald-500/50 cursor-pointer transition-all"
                  data-testid={`despesa-card-${despesa.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-white font-medium">{despesa.descricao}</p>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          despesa.tipo === 'portagens' ? 'bg-orange-600/20 text-orange-400' :
                          despesa.tipo === 'combustivel' ? 'bg-red-600/20 text-red-400' :
                          despesa.tipo === 'ferramentas' ? 'bg-blue-600/20 text-blue-400' :
                          'bg-gray-600/20 text-gray-400'
                        }`}>
                          {tiposDespesa.find(t => t.value === despesa.tipo)?.label || 'Outras'}
                        </span>
                        {pct > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded bg-purple-600/20 text-purple-400">
                            +{pct}%
                          </span>
                        )}
                      </div>
                      <div className="flex gap-4 text-sm text-gray-400">
                        {pct > 0 ? (
                          <span>
                            <span className="line-through text-gray-500">{despesa.valor?.toFixed(2)}€</span>
                            {' '}
                            <span className="text-emerald-400 font-semibold">{valorFinal.toFixed(2)}€</span>
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-semibold">{despesa.valor?.toFixed(2)}€</span>
                        )}
                        {despesa.numero_fatura && <span>Fatura: {despesa.numero_fatura}</span>}
                        <span>Pago por: {despesa.tecnico_nome}</span>
                        <span>{new Date(despesa.data).toLocaleDateString('pt-PT')}</span>
                      </div>
                    </div>
                    <Eye className="w-4 h-4 text-gray-500" />
                  </div>
                </div>
              );
            })}
            
            {/* Despesas excluídas */}
            {despesasExcluidas.length > 0 && (
              <>
                <div className="border-t border-gray-700 pt-3 mt-3">
                  <p className="text-red-400 text-sm font-medium mb-2 flex items-center gap-1">
                    <EyeOff className="w-4 h-4" />
                    Excluídas da Folha de Horas ({despesasExcluidas.length})
                  </p>
                </div>
                {despesasExcluidas.map((despesa) => (
                  <div
                    key={despesa.id}
                    className="p-3 bg-[#0f0f0f] rounded-lg border border-red-500/20 opacity-60"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-gray-400 line-through">{despesa.descricao} - {despesa.valor?.toFixed(2)}€</p>
                      </div>
                      <Button
                        onClick={() => handleRestaurarDespesa(despesa.id)}
                        size="sm"
                        variant="outline"
                        className="border-emerald-500/50 text-emerald-400 text-xs h-7"
                      >
                        Restaurar
                      </Button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {despesas.length === 0 && (
              <p className="text-gray-500 text-center py-6">Sem despesas registadas</p>
            )}

            {/* Resumo total */}
            {despesasVisiveis.length > 0 && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-lg mt-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Total para Folha de Horas:</span>
                  <span className="text-emerald-400 font-bold text-lg">{totalDespesasAjustado.toFixed(2)}€</span>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Popup Detalhe de Despesa */}
      <Dialog open={showDespesaDetailPopup} onOpenChange={setShowDespesaDetailPopup}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Receipt className="w-5 h-5 text-emerald-400" />
              Detalhe da Despesa
            </DialogTitle>
          </DialogHeader>

          {selectedDespesaDetail && (
            <div className="space-y-4 mt-4">
              {/* Detalhes da despesa (read-only, layout similar ao Adicionar Despesa) */}
              <div className="space-y-3">
                <div>
                  <Label className="text-gray-400 text-sm">Tipo</Label>
                  <div className="mt-1 px-3 py-2 bg-[#0f0f0f] border border-gray-700 rounded-md text-white">
                    {tiposDespesa.find(t => t.value === selectedDespesaDetail.tipo)?.label || 'Outras'}
                  </div>
                </div>
                <div>
                  <Label className="text-gray-400 text-sm">Descrição</Label>
                  <div className="mt-1 px-3 py-2 bg-[#0f0f0f] border border-gray-700 rounded-md text-white">
                    {selectedDespesaDetail.descricao}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-400 text-sm">Valor Original</Label>
                    <div className="mt-1 px-3 py-2 bg-[#0f0f0f] border border-gray-700 rounded-md text-emerald-400 font-semibold">
                      {selectedDespesaDetail.valor?.toFixed(2)}€
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-400 text-sm">Data</Label>
                    <div className="mt-1 px-3 py-2 bg-[#0f0f0f] border border-gray-700 rounded-md text-white">
                      {new Date(selectedDespesaDetail.data).toLocaleDateString('pt-PT')}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-400 text-sm">Pago por</Label>
                    <div className="mt-1 px-3 py-2 bg-[#0f0f0f] border border-gray-700 rounded-md text-white">
                      {selectedDespesaDetail.tecnico_nome}
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-400 text-sm">Nº Fatura</Label>
                    <div className="mt-1 px-3 py-2 bg-[#0f0f0f] border border-gray-700 rounded-md text-white">
                      {selectedDespesaDetail.numero_fatura || '-'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Separador */}
              <div className="border-t border-gray-700" />

              {/* Adicionar Valor Percentual */}
              <div className="bg-purple-500/10 border border-purple-500/30 p-4 rounded-lg">
                <Label className="text-purple-400 font-medium flex items-center gap-2">
                  <Percent className="w-4 h-4" />
                  Adicionar Valor Percentual
                </Label>
                <p className="text-gray-400 text-xs mt-1 mb-3">
                  O percentual será aplicado ao valor original da despesa.
                </p>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="Ex: 5, 10, 20"
                    value={despesaPercentual}
                    onChange={(e) => setDespesaPercentual(e.target.value)}
                    className="bg-[#0f0f0f] border-purple-500/50 text-white flex-1"
                    data-testid="input-percentual-despesa"
                  />
                  <span className="text-purple-400 font-bold text-lg">%</span>
                </div>
                
                {/* Preview do valor final */}
                {despesaPercentual && parseFloat(despesaPercentual) > 0 && (
                  <div className="mt-3 p-2 bg-[#0f0f0f] rounded flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Valor final:</span>
                    <span className="text-emerald-400 font-bold">
                      {(selectedDespesaDetail.valor * (1 + parseFloat(despesaPercentual) / 100)).toFixed(2)}€
                    </span>
                  </div>
                )}
              </div>

              {/* 3 Botões */}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => {
                    setShowDespesaDetailPopup(false);
                    setSelectedDespesaDetail(null);
                  }}
                  variant="outline"
                  className="flex-1 border-gray-600"
                  data-testid="btn-fechar-despesa"
                >
                  <X className="w-4 h-4 mr-1" />
                  Fechar
                </Button>
                <Button
                  onClick={handleDespesaNaoVisualizar}
                  variant="outline"
                  className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
                  data-testid="btn-nao-visualizar-despesa"
                >
                  <EyeOff className="w-4 h-4 mr-1" />
                  Não Visualizar
                </Button>
                <Button
                  onClick={handleDespesaGravar}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  data-testid="btn-gravar-despesa"
                >
                  <Save className="w-4 h-4 mr-1" />
                  Gravar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default FolhaHorasModal;
