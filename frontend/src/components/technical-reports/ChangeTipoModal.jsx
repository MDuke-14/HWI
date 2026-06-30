import React from 'react';
import { Tag, Edit, Briefcase, Car, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const TIPO_OPTIONS = [
  {
    value: 'manual',
    label: 'Manual',
    description: 'Registo inserido manualmente',
    bgClass: 'bg-gray-500/10 hover:bg-gray-500/20 border-gray-500/20 text-gray-300',
    iconBg: 'bg-gray-500',
    Icon: Edit,
  },
  {
    value: 'trabalho',
    label: 'Trabalho',
    description: 'Tempo de trabalho no cliente',
    bgClass: 'bg-green-500/10 hover:bg-green-500/20 border-green-500/20 text-green-400',
    iconBg: 'bg-green-500',
    Icon: Briefcase,
  },
  {
    value: 'viagem',
    label: 'Viagem',
    description: 'Tempo de deslocação',
    bgClass: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20 text-blue-400',
    iconBg: 'bg-blue-500',
    Icon: Car,
  },
  {
    value: 'oficina',
    label: 'Oficina',
    description: 'Trabalho em oficina',
    bgClass: 'bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20 text-orange-400',
    iconBg: 'bg-orange-500',
    Icon: Wrench,
  },
];

const TIPO_LABELS = {
  manual: 'Manual',
  trabalho: 'Trabalho',
  viagem: 'Viagem',
  oficina: 'Oficina',
};

const TIPO_BADGE_CLASSES = {
  manual: 'bg-gray-600/30 text-gray-300',
  trabalho: 'bg-green-600/20 text-green-400',
  oficina: 'bg-orange-600/20 text-orange-400',
  viagem: 'bg-blue-600/20 text-blue-400',
};

/**
 * Modal para alterar o tipo de registo de um técnico (manual/trabalho/viagem/oficina).
 */
const ChangeTipoModal = ({
  open,
  onOpenChange,
  tecnico,
  onChangeTipo,
  onCancel,
}) => {
  const tipoAtual = tecnico?._tipo_registo;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Tag className="w-5 h-5 text-purple-400" />
            Alterar Tipo de Registo
          </DialogTitle>
          <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
        </DialogHeader>

        {tecnico && (
          <div className="space-y-4 mt-4">
            <div className="bg-[#0f0f0f] p-4 rounded-lg border border-gray-700">
              <p className="text-white font-semibold mb-2">
                Técnico: {tecnico.tecnico_nome}
              </p>
              <p className="text-gray-400 text-sm">
                Data: {new Date(tecnico.data_trabalho).toLocaleDateString('pt-PT')}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-gray-500 text-xs">Tipo atual:</span>
                <span
                  className={`px-2 py-1 rounded text-sm ${
                    TIPO_BADGE_CLASSES[tipoAtual] || TIPO_BADGE_CLASSES.viagem
                  }`}
                >
                  {TIPO_LABELS[tipoAtual] || 'Viagem'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-gray-300 text-sm mb-3">Selecione o novo tipo:</p>
              {TIPO_OPTIONS.map(({ value, label, description, bgClass, iconBg, Icon }) => (
                <Button
                  key={value}
                  onClick={() => onChangeTipo(value)}
                  className={`w-full justify-start border ${bgClass}`}
                  data-testid={`tipo-option-${value}`}
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className={`w-10 h-10 rounded flex items-center justify-center ${iconBg}`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left flex-1">
                      <div className="font-semibold">{label}</div>
                      <div className="text-xs text-gray-400">{description}</div>
                    </div>
                  </div>
                </Button>
              ))}
            </div>

            <Button
              type="button"
              onClick={onCancel}
              variant="outline"
              className="w-full border-gray-600 mt-4"
              data-testid="tipo-cancelar"
            >
              Cancelar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ChangeTipoModal;
