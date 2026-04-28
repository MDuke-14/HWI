import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Banknote, AlertTriangle, RefreshCcw } from 'lucide-react';

const ROLE_LABELS = {
  junior: 'Téc. Júnior',
  tecnico: 'Téc.',
  senior: 'Téc. Sénior',
};

const CODIGO_LABELS = {
  '1': 'Dias úteis (07h-19h)',
  '2': 'Dias úteis (19h-07h)',
  'S': 'Sábado',
  'D': 'Domingo/Feriado',
};

function fmt(num) {
  return Number(num || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

const FacturarIntervencaoModal = ({
  open,
  onOpenChange,
  intervencao,
  linhas,
  alocacoes,
  setAlocacoes,
  onConfirmar,
  onDesfacturar,
  loading,
  saving,
}) => {
  if (!intervencao) return null;

  const dataStr = intervencao.data_intervencao
    ? new Date(intervencao.data_intervencao).toLocaleDateString('pt-PT')
    : '';
  const isFact = !!intervencao.facturada;

  const setVal = (key, field, val) => {
    setAlocacoes((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { trabalho: 0, viagem: 0, oficina: 0, km: 0 }),
        [field]: val,
      },
    }));
  };

  const fillAll = () => {
    const next = {};
    linhas.forEach((l) => {
      const k = `${l.tecnico_id}|${l.codigo}`;
      next[k] = {
        trabalho: l.disponivel_trabalho,
        viagem: l.disponivel_viagem,
        oficina: l.disponivel_oficina,
        km: l.disponivel_km,
      };
    });
    setAlocacoes(next);
  };

  const clearAll = () => setAlocacoes({});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        data-testid="facturar-intervencao-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-emerald-600" />
            {isFact ? 'Editar Facturação da Intervenção' : 'Facturar Intervenção'}
          </DialogTitle>
          <DialogDescription>
            Intervenção de <strong>{dataStr}</strong> — {intervencao.motivo_assistencia || 'Sem motivo'}
            <br />
            Indica para cada técnico × código quantas horas e km queres alocar a esta
            intervenção. Não podes ultrapassar o disponível (que já desconta o que foi facturado noutras intervenções desta FS).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-500">A carregar disponibilidade…</div>
        ) : linhas.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            Não há registos de horas/km nesta FS para facturar.
          </div>
        ) : (
          <>
            <div className="flex justify-end gap-2 mb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fillAll}
                data-testid="btn-fact-fill-all"
              >
                Preencher tudo (disponível)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearAll}
                data-testid="btn-fact-clear-all"
              >
                <RefreshCcw className="w-3 h-3 mr-1" />
                Limpar
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border">
                <thead className="bg-gray-100 dark:bg-gray-800">
                  <tr>
                    <th className="text-left p-2 border">Técnico</th>
                    <th className="text-left p-2 border">Código</th>
                    <th className="text-right p-2 border">Registado<br/>(T/V/O h)</th>
                    <th className="text-right p-2 border">Já facturado<br/>(T/V/O h)</th>
                    <th className="text-right p-2 border">Disponível<br/>T (h)</th>
                    <th className="text-right p-2 border">Disponível<br/>V (h)</th>
                    <th className="text-right p-2 border">Disponível<br/>O (h)</th>
                    <th className="text-right p-2 border">Disponível<br/>Km</th>
                    <th className="text-right p-2 border bg-emerald-50 dark:bg-emerald-950">A facturar<br/>T (h)</th>
                    <th className="text-right p-2 border bg-emerald-50 dark:bg-emerald-950">V (h)</th>
                    <th className="text-right p-2 border bg-emerald-50 dark:bg-emerald-950">O (h)</th>
                    <th className="text-right p-2 border bg-emerald-50 dark:bg-emerald-950">Km</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const k = `${l.tecnico_id}|${l.codigo}`;
                    const a = alocacoes[k] || {};
                    const role = ROLE_LABELS[l.funcao_ot] || l.funcao_ot || '';
                    return (
                      <tr key={k} className="border-b">
                        <td className="p-2 border">
                          <div className="font-medium">{l.tecnico_nome}</div>
                          <div className="text-[10px] opacity-70">{role}</div>
                        </td>
                        <td className="p-2 border" title={CODIGO_LABELS[l.codigo] || ''}>
                          {l.codigo}
                        </td>
                        <td className="p-2 border text-right">
                          {fmt(l.registado_trabalho)} / {fmt(l.registado_viagem)} / {fmt(l.registado_oficina)}
                        </td>
                        <td className="p-2 border text-right">
                          {fmt(l.ja_facturado_trabalho)} / {fmt(l.ja_facturado_viagem)} / {fmt(l.ja_facturado_oficina)}
                        </td>
                        <td className="p-2 border text-right text-emerald-700 dark:text-emerald-400">
                          {fmt(l.disponivel_trabalho)}
                        </td>
                        <td className="p-2 border text-right text-emerald-700 dark:text-emerald-400">
                          {fmt(l.disponivel_viagem)}
                        </td>
                        <td className="p-2 border text-right text-emerald-700 dark:text-emerald-400">
                          {fmt(l.disponivel_oficina)}
                        </td>
                        <td className="p-2 border text-right text-emerald-700 dark:text-emerald-400">
                          {fmt(l.disponivel_km)}
                        </td>
                        <td className="p-1 border bg-emerald-50/30 dark:bg-emerald-950/30">
                          <Input
                            type="number"
                            min={0}
                            max={l.disponivel_trabalho}
                            step={0.25}
                            value={a.trabalho ?? ''}
                            onChange={(e) => setVal(k, 'trabalho', parseFloat(e.target.value) || 0)}
                            className="h-7 text-right text-xs"
                            data-testid={`fact-input-trabalho-${k}`}
                          />
                        </td>
                        <td className="p-1 border bg-emerald-50/30 dark:bg-emerald-950/30">
                          <Input
                            type="number"
                            min={0}
                            max={l.disponivel_viagem}
                            step={0.25}
                            value={a.viagem ?? ''}
                            onChange={(e) => setVal(k, 'viagem', parseFloat(e.target.value) || 0)}
                            className="h-7 text-right text-xs"
                            data-testid={`fact-input-viagem-${k}`}
                          />
                        </td>
                        <td className="p-1 border bg-emerald-50/30 dark:bg-emerald-950/30">
                          <Input
                            type="number"
                            min={0}
                            max={l.disponivel_oficina}
                            step={0.25}
                            value={a.oficina ?? ''}
                            onChange={(e) => setVal(k, 'oficina', parseFloat(e.target.value) || 0)}
                            className="h-7 text-right text-xs"
                            data-testid={`fact-input-oficina-${k}`}
                          />
                        </td>
                        <td className="p-1 border bg-emerald-50/30 dark:bg-emerald-950/30">
                          <Input
                            type="number"
                            min={0}
                            max={l.disponivel_km}
                            step={1}
                            value={a.km ?? ''}
                            onChange={(e) => setVal(k, 'km', parseFloat(e.target.value) || 0)}
                            className="h-7 text-right text-xs"
                            data-testid={`fact-input-km-${k}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex justify-between gap-2 pt-4 border-t mt-4">
          <div>
            {isFact && (
              <Button
                variant="destructive"
                onClick={onDesfacturar}
                disabled={saving}
                data-testid="btn-fact-desfacturar"
              >
                Remover Facturação
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={onConfirmar}
              disabled={saving || loading || linhas.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="btn-fact-confirmar"
            >
              {saving ? 'A guardar…' : (isFact ? 'Atualizar Facturação' : 'Confirmar Facturação')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FacturarIntervencaoModal;
