import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Receipt, Eye, EyeOff, X, Save, Percent } from 'lucide-react';

const tiposDespesa = [
  { value: 'outras', label: 'Outras' },
  { value: 'portagens', label: 'Portagens' },
  { value: 'combustivel', label: 'Combustível' },
  { value: 'ferramentas', label: 'Ferramentas' },
  { value: 'alimentacao', label: 'Alimentação' },
];

/**
 * Popup para o admin configurar percentagens/exclusões das despesas antes
 * de enviar a Folha de Horas por email. Mesmo UX do card "Despesas" do
 * FolhaHorasModal (clica numa despesa → popup detalhe → guarda %).
 *
 * Recebe `initialAdjustments` para preservar configuração anterior do utilizador.
 * Devolve `despesaAdjustments` no `onConfirm`.
 */
const DespesasEmailModal = ({
  open,
  onOpenChange,
  despesas = [],
  initialAdjustments = {},
  onConfirm,
}) => {
  const [despesaAdjustments, setDespesaAdjustments] = useState({});
  const [showDespesaDetailPopup, setShowDespesaDetailPopup] = useState(false);
  const [selectedDespesaDetail, setSelectedDespesaDetail] = useState(null);
  const [despesaPercentual, setDespesaPercentual] = useState('');

  useEffect(() => {
    if (open) {
      setDespesaAdjustments(initialAdjustments || {});
      setShowDespesaDetailPopup(false);
      setSelectedDespesaDetail(null);
      setDespesaPercentual('');
    }
  }, [open, initialAdjustments]);

  const despesasVisiveis = despesas.filter((d) => !despesaAdjustments[d.id]?.excluida);
  const despesasExcluidas = despesas.filter((d) => despesaAdjustments[d.id]?.excluida);

  const totalDespesasOriginal = despesasVisiveis.reduce((sum, d) => sum + (d.valor || 0), 0);
  const totalDespesasAjustado = despesasVisiveis.reduce((sum, d) => {
    const adj = despesaAdjustments[d.id];
    const pct = adj?.percentual || 0;
    return sum + (d.valor || 0) * (1 + pct / 100);
  }, 0);

  const getValorFinal = (despesa) => {
    const adj = despesaAdjustments[despesa.id];
    const pct = adj?.percentual || 0;
    return (despesa.valor || 0) * (1 + pct / 100);
  };

  const openDespesaDetail = (despesa) => {
    setSelectedDespesaDetail(despesa);
    const adj = despesaAdjustments[despesa.id];
    setDespesaPercentual(adj?.percentual?.toString() || '');
    setShowDespesaDetailPopup(true);
  };

  const handleDespesaGravar = () => {
    if (!selectedDespesaDetail) return;
    setDespesaAdjustments((prev) => ({
      ...prev,
      [selectedDespesaDetail.id]: {
        ...prev[selectedDespesaDetail.id],
        percentual: parseFloat(despesaPercentual) || 0,
        excluida: false,
      },
    }));
    setShowDespesaDetailPopup(false);
    setSelectedDespesaDetail(null);
  };

  const handleDespesaNaoVisualizar = () => {
    if (!selectedDespesaDetail) return;
    setDespesaAdjustments((prev) => ({
      ...prev,
      [selectedDespesaDetail.id]: {
        ...prev[selectedDespesaDetail.id],
        excluida: true,
      },
    }));
    setShowDespesaDetailPopup(false);
    setSelectedDespesaDetail(null);
  };

  const handleRestaurarDespesa = (despesaId) => {
    setDespesaAdjustments((prev) => ({
      ...prev,
      [despesaId]: { ...prev[despesaId], excluida: false },
    }));
  };

  const handleConfirm = () => {
    if (typeof onConfirm === 'function') {
      onConfirm(despesaAdjustments);
    }
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="despesas-email-modal">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Configurar Despesas para Email
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Defina percentagens/exclusões antes de enviar a Folha de Horas por email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-4">
            {despesas.length === 0 && (
              <div className="p-6 text-center bg-[#0f0f0f] rounded-lg border border-gray-700 text-gray-400">
                Esta FS não tem despesas associadas.
              </div>
            )}

            {/* Despesas incluídas */}
            {despesasVisiveis.map((despesa) => {
              const adj = despesaAdjustments[despesa.id];
              const pct = adj?.percentual || 0;
              const valorFinal = getValorFinal(despesa);
              return (
                <div
                  key={despesa.id}
                  onClick={() => openDespesaDetail(despesa)}
                  className="p-4 bg-[#0f0f0f] rounded-lg border border-gray-700 hover:border-emerald-500/50 cursor-pointer transition-all"
                  data-testid={`email-despesa-card-${despesa.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-white font-medium">{despesa.descricao}</p>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-600/20 text-gray-400">
                          {tiposDespesa.find((t) => t.value === despesa.tipo)?.label || 'Outras'}
                        </span>
                        {pct > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded bg-purple-600/20 text-purple-400">
                            +{pct}%
                          </span>
                        )}
                      </div>
                      <div className="flex gap-4 text-sm text-gray-400 flex-wrap">
                        {pct > 0 ? (
                          <span>
                            <span className="line-through text-gray-500">{despesa.valor?.toFixed(2)}€</span>{' '}
                            <span className="text-emerald-400 font-semibold">{valorFinal.toFixed(2)}€</span>
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-semibold">{despesa.valor?.toFixed(2)}€</span>
                        )}
                        {despesa.numero_fatura && <span>Fatura: {despesa.numero_fatura}</span>}
                        {despesa.tecnico_nome && <span>Pago por: {despesa.tecnico_nome}</span>}
                        {despesa.data && <span>{new Date(despesa.data).toLocaleDateString('pt-PT')}</span>}
                      </div>
                    </div>
                    <Eye className="w-4 h-4 text-gray-500" />
                  </div>
                </div>
              );
            })}

            {/* Excluídas */}
            {despesasExcluidas.length > 0 && (
              <>
                <div className="border-t border-gray-700 pt-3 mt-3">
                  <p className="text-red-400 text-sm font-medium mb-2 flex items-center gap-1">
                    <EyeOff className="w-4 h-4" />
                    Excluídas do PDF ({despesasExcluidas.length})
                  </p>
                </div>
                {despesasExcluidas.map((despesa) => (
                  <div
                    key={despesa.id}
                    className="p-3 bg-[#0a0a0a] rounded-lg border border-red-900/30 opacity-60"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-gray-400 line-through">{despesa.descricao}</p>
                        <span className="text-sm text-gray-500">{despesa.valor?.toFixed(2)}€</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestaurarDespesa(despesa.id)}
                        className="text-emerald-400 border-emerald-700 hover:bg-emerald-700/20"
                      >
                        Restaurar
                      </Button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Totais */}
            {despesas.length > 0 && (
              <div className="mt-4 p-3 bg-[#0f0f0f] rounded-lg border border-gray-700 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>Subtotal original:</span>
                  <span>{totalDespesasOriginal.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold mt-1">
                  <span>Total a cobrar:</span>
                  <span>{totalDespesasAjustado.toFixed(2)}€</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-700 mt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="btn-cancel-despesas-email"
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="btn-confirm-despesas-email"
            >
              <Save className="w-4 h-4 mr-2" />
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Popup de detalhe (% e excluir) — replica do FolhaHorasModal */}
      <Dialog open={showDespesaDetailPopup} onOpenChange={setShowDespesaDetailPopup}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-400">Detalhes da Despesa</DialogTitle>
            <DialogDescription className="text-gray-400">
              Aplica uma percentagem ou exclui esta despesa do PDF.
            </DialogDescription>
          </DialogHeader>
          {selectedDespesaDetail && (
            <div className="space-y-4">
              <div>
                <p className="text-white font-medium">{selectedDespesaDetail.descricao}</p>
                <p className="text-gray-400 text-sm">
                  Valor original:{' '}
                  <span className="text-emerald-400 font-semibold">
                    {selectedDespesaDetail.valor?.toFixed(2)}€
                  </span>
                </p>
              </div>
              <div>
                <Label htmlFor="email-pct" className="flex items-center gap-1">
                  <Percent className="w-3 h-3" />
                  Percentagem a acrescentar (%)
                </Label>
                <Input
                  id="email-pct"
                  type="number"
                  min="0"
                  step="0.01"
                  value={despesaPercentual}
                  onChange={(e) => setDespesaPercentual(e.target.value)}
                  placeholder="Ex: 20 (acrescenta 20% ao valor)"
                  className="bg-[#0f0f0f] border-gray-700"
                  data-testid="email-despesa-percentual-input"
                />
                {despesaPercentual && parseFloat(despesaPercentual) > 0 && (
                  <p className="mt-1 text-sm text-emerald-400">
                    Novo valor:{' '}
                    {(selectedDespesaDetail.valor * (1 + parseFloat(despesaPercentual) / 100)).toFixed(2)}€
                  </p>
                )}
              </div>
              <div className="flex justify-between gap-2 pt-2 border-t border-gray-700">
                <Button
                  variant="outline"
                  onClick={handleDespesaNaoVisualizar}
                  className="text-red-400 border-red-700 hover:bg-red-700/20"
                  data-testid="email-despesa-excluir-btn"
                >
                  <EyeOff className="w-4 h-4 mr-2" />
                  Não visualizar no PDF
                </Button>
                <Button
                  onClick={handleDespesaGravar}
                  className="bg-emerald-600 hover:bg-emerald-700"
                  data-testid="email-despesa-gravar-btn"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Gravar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DespesasEmailModal;
