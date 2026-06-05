import React from 'react';
import { UserCheck, MapPin, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TIPO_LABELS = {
  trabalho: 'Trabalho',
  viagem: 'Viagem',
  oficina: 'Oficina',
};

/**
 * Popup que aparece antes de iniciar um cronómetro:
 * define a função de cada técnico (júnior/técnico/sénior/ajudante)
 * e, no caso de viagem, regista os Km's iniciais.
 */
export const CronometroFuncaoPopup = ({
  open,
  onOpenChange,
  cronometroFuncaoData,
  setCronometroFuncaoData,
  onConfirm,
}) => {
  const tipoLabel = TIPO_LABELS[cronometroFuncaoData.tipo] || 'Trabalho';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <UserCheck className="w-5 h-5 text-blue-400" />
            Definir Função na FS
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-400 mt-1">
            Defina a função de cada técnico antes de iniciar o cronómetro de {tipoLabel}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {cronometroFuncaoData.tecnicos.map((tec, idx) => (
            <div
              key={tec.id}
              className="flex items-center justify-between gap-3 bg-gray-800/50 p-3 rounded-lg border border-gray-700"
              data-testid={`crono-funcao-row-${idx}`}
            >
              <span className="text-white font-medium text-sm flex-1 truncate">{tec.nome}</span>
              <Select
                value={tec.funcao_ot}
                onValueChange={(val) => {
                  setCronometroFuncaoData((prev) => ({
                    ...prev,
                    tecnicos: prev.tecnicos.map((t, i) =>
                      i === idx ? { ...t, funcao_ot: val } : t
                    ),
                  }));
                }}
              >
                <SelectTrigger
                  data-testid={`crono-funcao-select-${idx}`}
                  className="w-[140px] bg-gray-800 border-gray-600 text-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="junior" className="text-white">Téc. Júnior</SelectItem>
                  <SelectItem value="tecnico" className="text-white">Técnico</SelectItem>
                  <SelectItem value="senior" className="text-white">Téc. Sénior</SelectItem>
                  <SelectItem value="ajudante" className="text-white">Ajudante</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {cronometroFuncaoData.tipo === 'viagem' && (
          <div className="mt-4">
            <Label className="text-gray-300 flex items-center gap-2">
              <Car className="w-4 h-4" />
              Km's Iniciais
            </Label>
            <Input
              type="number"
              data-testid="crono-km-inicial"
              value={cronometroFuncaoData.km_inicial || ''}
              onChange={(e) =>
                setCronometroFuncaoData((prev) => ({ ...prev, km_inicial: e.target.value }))
              }
              placeholder="Ex: 45230"
              className="bg-gray-800 border-gray-700 text-white mt-1"
            />
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-gray-600 text-gray-300"
          >
            Cancelar
          </Button>
          <Button
            data-testid="confirm-crono-funcao-btn"
            onClick={onConfirm}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Iniciar Cronómetro
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Popup para parar o cronómetro, registando os Km's finais.
 */
export const StopCronometroPopup = ({
  open,
  onOpenChange,
  stopCronoData,
  setStopCronoData,
  onStop,
}) => {
  const tipoLabel = TIPO_LABELS[stopCronoData.tipo] || 'Trabalho';
  const tecnicos = stopCronoData.tecnicos || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#1a1a1a] border-gray-700 text-white max-w-sm"
        data-testid="stop-crono-popup"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white text-base">
            <MapPin className="w-5 h-5 text-blue-400" />
            Parar Cronómetro
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-gray-400 mt-1">
              {tecnicos.length > 1 ? (
                <div className="space-y-0.5">
                  {tecnicos.map((t, i) => (
                    <span key={i} className="block">
                      {t.tecnico_nome} — {tipoLabel}
                    </span>
                  ))}
                </div>
              ) : (
                <span>
                  {tecnicos[0]?.tecnico_nome || 'Técnico'} — {tipoLabel}
                </span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-3">
          {tecnicos.length === 1 && (
            <div>
              <Label className="text-gray-400 text-xs">KMs Iniciais</Label>
              <Input
                value={tecnicos[0]?.km_inicial || 0}
                readOnly
                className="bg-[#0a0a0a] border-gray-700 text-gray-400 cursor-default mt-1"
                data-testid="stop-crono-km-inicial"
              />
            </div>
          )}
          {tecnicos.length > 1 && (
            <div className="space-y-1">
              <Label className="text-gray-400 text-xs">KMs Iniciais por técnico</Label>
              {tecnicos.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-300 flex-1 truncate">{t.tecnico_nome}</span>
                  <span className="text-gray-500">{t.km_inicial || 0} km</span>
                </div>
              ))}
            </div>
          )}
          <div>
            <Label className="text-gray-400 text-xs">KMs Finais</Label>
            <Input
              type="number"
              value={stopCronoData.km_final}
              onChange={(e) => setStopCronoData((prev) => ({ ...prev, km_final: e.target.value }))}
              className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              placeholder="Ex: 125500"
              min="0"
              autoFocus
              data-testid="stop-crono-km-final"
            />
          </div>
          <Button
            onClick={onStop}
            className="w-full bg-red-600 hover:bg-red-700 text-white"
            data-testid="confirm-stop-crono-btn"
          >
            Parar {tecnicos.length > 1 ? `${tecnicos.length} Cronómetros` : 'Cronómetro'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Popup para registar KMs de deslocação durante Trabalho
 * (ex: ir comprar peças durante a intervenção).
 */
export const WorkKmPopup = ({ open, onOpenChange, workKmData, setWorkKmData }) => {
  const kmInicial = parseFloat(workKmData.km_inicial) || 0;
  const kmFinal = parseFloat(workKmData.km_final) || 0;
  const totalKm = Math.max(0, kmFinal - kmInicial);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#1a1a1a] border-gray-700 text-white max-w-sm"
        data-testid="work-km-popup"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white text-base">
            <Car className="w-5 h-5 text-amber-400" />
            Deslocação durante Trabalho
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-400 mt-1">
            Registar KMs de deslocação (ex: compra de peças)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-3">
          <div>
            <Label className="text-gray-400 text-xs">KMs Iniciais</Label>
            <Input
              type="number"
              value={workKmData.km_inicial}
              onChange={(e) => setWorkKmData((prev) => ({ ...prev, km_inicial: e.target.value }))}
              className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              placeholder="Ex: 125000"
              min="0"
              data-testid="work-km-inicial"
            />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">KMs Finais</Label>
            <Input
              type="number"
              value={workKmData.km_final}
              onChange={(e) => setWorkKmData((prev) => ({ ...prev, km_final: e.target.value }))}
              className="bg-[#0f0f0f] border-gray-700 text-white mt-1"
              placeholder="Ex: 125050"
              min="0"
              data-testid="work-km-final"
            />
          </div>
          {workKmData.km_inicial && workKmData.km_final && (
            <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-3 flex items-center justify-between">
              <span className="text-green-400 text-sm font-medium">Total KM</span>
              <span className="text-green-400 font-bold text-lg">
                {totalKm.toFixed(1)} km
              </span>
            </div>
          )}
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white"
            data-testid="save-work-km-btn"
          >
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
