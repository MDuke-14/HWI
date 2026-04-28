import React, { useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowRightCircle, AlertTriangle } from 'lucide-react';

const CriarContinuidadeModal = ({
  open,
  onOpenChange,
  intervencoes = [],
  selectedIds = [],
  setSelectedIds = () => {},
  onConfirmar,
  saving,
}) => {
  const eligiveis = useMemo(
    () => intervencoes.filter((i) => !i.herdada_de_intervencao_id),
    [intervencoes],
  );

  const toggle = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const selectAll = () =>
    setSelectedIds(eligiveis.map((i) => i.id));
  const clearAll = () => setSelectedIds([]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        data-testid="continuidade-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightCircle className="w-5 h-5 text-red-600" />
            Criar FS de Continuidade
          </DialogTitle>
          <DialogDescription>
            Vai ser criada uma nova FS herdada desta. Para cada intervenção selecionada:
            <ul className="list-disc ml-5 mt-2 text-xs space-y-1">
              <li>Toda a mão-de-obra disponível é facturada na intervenção origem</li>
              <li>Materiais, fotografias, relatórios de assistência, equipamentos e assinaturas são duplicados para a nova FS</li>
              <li>A intervenção herdada fica identificada a vermelho com o nº da FS origem</li>
              <li>Apenas trabalho a partir desse ponto será facturável</li>
            </ul>
          </DialogDescription>
        </DialogHeader>

        {eligiveis.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            Não existem intervenções elegíveis para transitar.
          </div>
        ) : (
          <>
            <div className="flex justify-end gap-2 mb-2">
              <Button variant="outline" size="sm" onClick={selectAll} data-testid="btn-cont-select-all">
                Selecionar todas
              </Button>
              <Button variant="outline" size="sm" onClick={clearAll} data-testid="btn-cont-clear">
                Limpar
              </Button>
            </div>
            <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
              {eligiveis.map((interv, idx) => {
                const dataStr = interv.data_intervencao
                  ? new Date(interv.data_intervencao).toLocaleDateString('pt-PT')
                  : '';
                const isSel = selectedIds.includes(interv.id);
                return (
                  <label
                    key={interv.id}
                    className={`flex items-start gap-2 p-2 rounded border cursor-pointer text-xs ${
                      isSel
                        ? 'bg-red-900/30 border-red-500'
                        : 'bg-[#1a1a1a] border-gray-700 hover:bg-[#252525]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(interv.id)}
                      className="mt-1"
                      data-testid={`cont-check-${idx}`}
                    />
                    <div className="flex-1">
                      <div className="font-medium">
                        Intervenção #{idx + 1} — {dataStr}
                      </div>
                      <div className="text-gray-400 truncate">
                        {interv.motivo_assistencia || 'Sem motivo'}
                      </div>
                      {interv.facturada && (
                        <div className="text-[10px] uppercase text-emerald-400 mt-0.5">
                          já facturada
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={onConfirmar}
            disabled={saving || selectedIds.length === 0}
            className="bg-red-600 hover:bg-red-700 text-white"
            data-testid="btn-cont-confirmar"
          >
            {saving ? 'A criar…' : `Criar FS de Continuidade (${selectedIds.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CriarContinuidadeModal;
