import React from 'react';
import { PlayCircle, Settings, Car, Wrench, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const TIPO_BUTTONS = [
  { value: 'trabalho', label: 'Trabalho', activeClass: 'bg-blue-600 hover:bg-blue-700', Icon: Settings },
  { value: 'viagem', label: 'Viagem', activeClass: 'bg-purple-600 hover:bg-purple-700', Icon: Car },
  { value: 'oficina', label: 'Oficina', activeClass: 'bg-orange-600 hover:bg-orange-700', Icon: Wrench },
];

/**
 * Modal para iniciar cronómetro após criação de uma FS.
 */
const IniciarCronoModal = ({
  open,
  onClose,
  novaOT,
  cronoTipo,
  setCronoTipo,
  allSystemUsers,
  tecnicosSelecionados,
  setTecnicosSelecionados,
  onIniciar,
}) => {
  const toggleTecnico = (userItem) => {
    const isSelected = tecnicosSelecionados.some((t) => t.id === userItem.id);
    if (isSelected) {
      setTecnicosSelecionados(tecnicosSelecionados.filter((t) => t.id !== userItem.id));
    } else {
      setTecnicosSelecionados([
        ...tecnicosSelecionados,
        { id: userItem.id, nome: userItem.full_name || userItem.username },
      ]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <PlayCircle className="w-5 h-5 text-green-400" />
            Iniciar Cronómetro - FS #{novaOT?.numero}
          </DialogTitle>
          <DialogDescription className="sr-only">Detalhes do diálogo.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <p className="text-gray-400 text-sm">
            FS criada com sucesso! Deseja iniciar um cronómetro?
          </p>

          <div>
            <Label className="text-gray-300 mb-2 block">Tipo de Cronómetro</Label>
            <div className="grid grid-cols-3 gap-2">
              {TIPO_BUTTONS.map(({ value, label, activeClass, Icon }) => (
                <Button
                  key={value}
                  type="button"
                  onClick={() => setCronoTipo(value)}
                  className={cronoTipo === value ? activeClass : 'bg-gray-700 hover:bg-gray-600'}
                  data-testid={`crono-tipo-${value}`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-gray-300 mb-2 block">Selecionar Técnico(s)</Label>
            <div className="bg-[#0f0f0f] border border-gray-700 rounded-md max-h-48 overflow-y-auto">
              {allSystemUsers.length > 0 ? (
                allSystemUsers.map((userItem) => {
                  const isSelected = tecnicosSelecionados.some((t) => t.id === userItem.id);
                  return (
                    <div
                      key={userItem.id}
                      onClick={() => toggleTecnico(userItem)}
                      className={`flex items-center gap-3 p-3 cursor-pointer border-b border-gray-700 last:border-b-0 hover:bg-gray-800 ${
                        isSelected ? 'bg-blue-900/30' : ''
                      }`}
                      data-testid={`crono-tecnico-${userItem.id}`}
                    >
                      <div
                        className={`w-5 h-5 rounded border flex items-center justify-center ${
                          isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-600'
                        }`}
                      >
                        {isSelected && <span className="text-white text-xs">✓</span>}
                      </div>
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-white">{userItem.full_name || userItem.username}</span>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-gray-500 text-center">
                  Nenhum utilizador encontrado
                </div>
              )}
            </div>
            {tecnicosSelecionados.length > 0 && (
              <p className="text-sm text-gray-400 mt-2">
                {tecnicosSelecionados.length} técnico(s) selecionado(s)
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 border-gray-600"
              data-testid="crono-ignorar"
            >
              Ignorar
            </Button>
            <Button
              onClick={onIniciar}
              disabled={tecnicosSelecionados.length === 0}
              className={`flex-1 ${cronoTipo === 'trabalho'
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-orange-600 hover:bg-orange-700'} disabled:opacity-50`}
              data-testid="crono-iniciar"
            >
              <PlayCircle className="w-4 h-4 mr-2" />
              Iniciar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default IniciarCronoModal;
