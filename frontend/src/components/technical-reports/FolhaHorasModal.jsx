import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { FileSpreadsheet, DollarSign, FileText, User, Calendar, Download, Zap, Settings } from 'lucide-react';
import axios from 'axios';
import { API } from '@/App';

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
  const [tabelasPreco, setTabelasPreco] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState(1);
  const [tarifasDaTabela, setTarifasDaTabela] = useState([]);
  
  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

  // Buscar tabelas de preço quando o modal abre
  useEffect(() => {
    if (open) {
      fetchTabelasPreco();
    }
  }, [open]);

  // Buscar tarifas da tabela selecionada e preencher automaticamente
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
      
      // Preencher automaticamente os campos de tarifa por técnico/data/código
      if (folhaHorasData) {
        autoFillTarifas(tarifas);
      }
    } catch (error) {
      console.error('Erro ao carregar tarifas da tabela');
    }
  };

  // Preencher automaticamente as tarifas baseado no código horário e tipo de registo
  const autoFillTarifas = (tarifas) => {
    // Obter registos do folhaHorasData
    let registos = [];
    
    if (folhaHorasData?.registos_individuais) {
      // Adicionar tipo de registo aos registos individuais
      registos = folhaHorasData.registos_individuais.map(reg => ({
        ...reg,
        tipo_registo: reg.tipo?.toLowerCase() || 'trabalho'
      }));
    } else if (folhaHorasData?.tecnicos) {
      const registosBase = folhaHorasData.registos || [];
      const tecnicosManuais = folhaHorasData.tecnicos_manuais || [];
      
      registosBase.forEach(reg => {
        let data = reg.data || '';
        if (typeof data === 'string' && data.includes('T')) {
          data = data.split('T')[0];
        }
        // Determinar tipo de registo
        const tipoLower = reg.tipo?.toLowerCase() || 'trabalho';
        const tipoRegisto = ['viagem', 'oficina', 'trabalho'].includes(tipoLower) ? tipoLower : 'trabalho';
        registos.push({
          tecnico_id: reg.tecnico_id,
          data: data,
          codigo: reg.codigo || '-',
          tipo_registo: tipoRegisto,
          funcao_ot: reg.funcao_ot || 'tecnico'
        });
      });
      
      const codigosMap = { 'diurno': '1', 'noturno': '2', 'sabado': 'S', 'domingo_feriado': 'D' };
      tecnicosManuais.forEach(tec => {
        let data = tec.data_trabalho || '';
        if (typeof data === 'string' && data.includes('T')) {
          data = data.split('T')[0];
        }
        // Determinar tipo de registo para manuais
        const tipoLowerM = tec.tipo?.toLowerCase() || 'trabalho';
        const tipoRegisto = ['viagem', 'oficina', 'trabalho'].includes(tipoLowerM) ? tipoLowerM : 'trabalho';
        registos.push({
          tecnico_id: tec.tecnico_id || tec.id,
          data: data,
          codigo: codigosMap[tec.tipo_horario] || '-',
          tipo_registo: tipoRegisto
        });
      });
    }
    
    // Criar mapa de (codigo, tipo_registo) -> valor da tarifa
    // Prioridade: tarifa específica para tipo > tarifa genérica
    const tarifasPorCodigoTipo = {};
    const tarifasPorCodigo = {};
    
    tarifas.forEach(t => {
      if (t.codigo && t.codigo !== 'manual') {
        if (t.tipo_registo) {
          // Tarifa específica para tipo de registo
          const chave = `${t.codigo}_${t.tipo_registo}`;
          tarifasPorCodigoTipo[chave] = t.valor_por_hora;
        } else {
          // Tarifa genérica (aplica a ambos)
          tarifasPorCodigo[t.codigo] = t.valor_por_hora;
        }
      }
    });
    
    // Preencher cada registo com a tarifa correspondente
    registos.forEach(registo => {
      const chave = `${registo.tecnico_id}_${registo.data}_${registo.codigo}_${registo.tipo_registo}`;
      const codigo = registo.codigo;
      const tipoRegisto = registo.tipo_registo || 'trabalho';
      // Oficina usa a mesma tarifa que trabalho
      const tipoParaTarifa = tipoRegisto === 'oficina' ? 'trabalho' : tipoRegisto;
      
      // Primeiro, tentar encontrar tarifa específica para este tipo de registo
      const chaveEspecifica = `${codigo}_${tipoParaTarifa}`;
      let valorTarifa = tarifasPorCodigoTipo[chaveEspecifica];
      
      // Se não houver tarifa específica, usar a genérica
      if (valorTarifa === undefined) {
        valorTarifa = tarifasPorCodigo[codigo];
      }
      
      // Se existe uma tarifa, preencher automaticamente
      if (codigo && codigo !== '-' && valorTarifa !== undefined) {
        updateFolhaHorasTarifa(chave, valorTarifa.toString());
      }
    });
  };

  const handleTableChange = (tableId) => {
    setSelectedTableId(tableId);
    // As tarifas serão buscadas automaticamente pelo useEffect
  };

  const handleGeneratePDF = () => {
    // Passar o table_id selecionado para a função de gerar PDF
    onGeneratePDF(selectedTableId);
  };

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
    
    // Adicionar registos de cronómetro - cada um como entrada individual
    registos.forEach(reg => {
      let data = reg.data || '';
      if (typeof data === 'string' && data.includes('T')) {
        data = data.split('T')[0];
      }
      const tipoReg = reg.tipo || 'trabalho';
      todosRegistos.push({
        tecnico_id: reg.tecnico_id,
        tecnico_nome: reg.tecnico_nome,
        funcao_ot: reg.funcao_ot || 'tecnico',
        data: data,
        tipo: tipoReg,
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
        tecnico_id: tec.tecnico_id || tec.id,
        tecnico_nome: tec.tecnico_nome,
        funcao_ot: tec.funcao_ot || 'tecnico',
        data: data,
        tipo: tec.tipo_registo || tec.tipo || 'manual',
        codigo: codigosMap[tec.tipo_horario] || '-',
        source: 'manual',
        registo_id: tec.id
      });
    });
    
    // Ordenar por data, depois por tipo
    return todosRegistos.sort((a, b) => {
      const dateCompare = new Date(a.data) - new Date(b.data);
      if (dateCompare !== 0) return dateCompare;
      // Mesma data: ordenar por tipo (trabalho, viagem, oficina)
      const tipoOrdem = { 'trabalho': 0, 'viagem': 1, 'oficina': 2, 'manual': 3 };
      return (tipoOrdem[a.tipo] || 99) - (tipoOrdem[b.tipo] || 99);
    });
  };

  // Para extras (dietas, portagens, despesas) - UMA entrada por técnico/dia
  // Regra: Apenas 1 dieta por técnico por dia, independentemente do número de registos
  // IMPORTANTE: Agrupamos por NOME do técnico + data (não por ID) para evitar duplicados de nomes
  const getExtrasOrdenados = () => {
    if (!folhaHorasData) return [];
    
    // Usar Map para garantir unicidade absoluta por NOME+data
    const tecnicoDiasUnicos = new Map();
    
    // Fonte 1: datas_por_tecnico (já agrupado)
    if (folhaHorasData.datas_por_tecnico) {
      Object.entries(folhaHorasData.datas_por_tecnico).forEach(([tecnicoId, datas]) => {
        const tecnico = folhaHorasData.tecnicos?.find(t => t.id === tecnicoId);
        const tecnicoNome = tecnico?.nome || tecnicoId;
        
        const datasArray = Array.isArray(datas) ? datas : [datas];
        datasArray.forEach(data => {
          // Normalizar data para YYYY-MM-DD
          let dataStr = data;
          if (typeof dataStr === 'string' && dataStr.includes('T')) {
            dataStr = dataStr.split('T')[0];
          }
          // Chave baseada em NOME + DATA (não ID) para evitar duplicados
          const chave = `${tecnicoNome}_${dataStr}`;
          if (!tecnicoDiasUnicos.has(chave)) {
            tecnicoDiasUnicos.set(chave, {
              tecnicoId,  // Guardar primeiro ID encontrado
              tecnicoNome,
              data: dataStr
            });
          }
        });
      });
    }
    
    // Fonte 2: registos individuais (como fallback para técnicos não cobertos)
    const registosIndividuais = folhaHorasData.registos_individuais || [];
    registosIndividuais.forEach(reg => {
      let dataStr = reg.data || '';
      if (typeof dataStr === 'string' && dataStr.includes('T')) {
        dataStr = dataStr.split('T')[0];
      }
      const tecnicoNome = reg.tecnico_nome || 'Técnico';
      // Chave baseada em NOME + DATA
      const chave = `${tecnicoNome}_${dataStr}`;
      // Só adiciona se não existir ainda
      if (!tecnicoDiasUnicos.has(chave) && dataStr) {
        tecnicoDiasUnicos.set(chave, {
          tecnicoId: reg.tecnico_id,
          tecnicoNome,
          data: dataStr
        });
      }
    });
    
    // Converter Map para array e ordenar por data, depois por nome
    return Array.from(tecnicoDiasUnicos.values())
      .sort((a, b) => {
        const dateCompare = new Date(a.data) - new Date(b.data);
        if (dateCompare !== 0) return dateCompare;
        return a.tecnicoNome.localeCompare(b.tecnicoNome);
      });
  };

  // Aplicar dieta a todos os técnicos/dias
  const handleAplicarDietaTodos = (checked) => {
    setDietaAutomatica(checked);
    if (checked && dietaValor) {
      getExtrasOrdenados().forEach(({ tecnicoNome, data }) => {
        // Chave baseada em NOME + DATA
        const chave = `${tecnicoNome}_${data}`;
        updateFolhaHorasExtra(chave, 'dieta', dietaValor);
      });
    }
  };

  // Quando o valor da dieta muda, aplicar a todos se checkbox ativa
  const handleDietaValorChange = (valor) => {
    setDietaValor(valor);
    if (dietaAutomatica && valor) {
      getExtrasOrdenados().forEach(({ tecnicoNome, data }) => {
        // Chave baseada em NOME + DATA
        const chave = `${tecnicoNome}_${data}`;
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

            {/* Seleção de Tabela de Preço - Logo após o cliente para rápida seleção */}
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
                    
                    // Labels e cores para tipos
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
                              <span className={`ml-1 text-xs ${registo.funcao_ot === 'ajudante' ? 'text-yellow-400' : 'text-cyan-400'}`}>
                                ({registo.funcao_ot === 'ajudante' ? 'Ajudante' : 'Técnico'})
                              </span>
                            </span>
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
                          <Label className="text-gray-400 text-sm">Tarifa ({registo.codigo} - €/h):</Label>
                          {folhaHorasData.tarifas?.length > 0 ? (
                            <select
                              value={folhaHorasTarifas[`${registo.tecnico_id}_${registo.data}_${registo.codigo}_${registo.tipo}`] || folhaHorasTarifas[`${registo.tecnico_id}_${registo.data}_${registo.codigo}`] || folhaHorasTarifas[registo.tecnico_id] || ''}
                              onChange={(e) => updateFolhaHorasTarifa(`${registo.tecnico_id}_${registo.data}_${registo.codigo}_${registo.tipo}`, e.target.value)}
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
              <p className="text-gray-400 text-sm mb-2">
                Preencha os valores extras por técnico e data. Campos vazios serão considerados 0,00€.
              </p>
              <p className="text-amber-400/80 text-xs mb-4 flex items-center gap-1">
                <span className="text-amber-500">⚠️</span>
                Nota: Despesas de <span className="font-semibold">Combustível</span> são excluídas automaticamente dos cálculos da Folha de Horas.
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
                    // Chave baseada em NOME + DATA para consistência
                    const chave = `${tecnicoNome}_${data}`;
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
                <li>• Preço por Km: <span className="text-white font-medium">{(tabelasPreco.find(t => t.table_id === selectedTableId)?.valor_km || 0.65).toFixed(2)}€</span> <span className="text-amber-400">({tabelasPreco.find(t => t.table_id === selectedTableId)?.nome || 'Tabela 1'})</span></li>
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
