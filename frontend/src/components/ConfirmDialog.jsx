import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Prompt de confirmação baseado em shadcn AlertDialog.
 * Mais fiável que `window.confirm()` em contextos modal/mobile.
 *
 * Props:
 * - open: boolean
 * - onOpenChange: (open:boolean) => void
 * - title, description: string
 * - confirmText (default "Confirmar"), cancelText (default "Cancelar")
 * - destructive: bool — pinta botão de confirmação a vermelho
 * - onConfirm: () => void | Promise<void>
 */
const ConfirmDialog = ({
  open,
  onOpenChange,
  title = 'Confirmar',
  description = '',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  destructive = false,
  onConfirm,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-[#0a0a0a] border border-white/10 text-white" data-testid="confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription className="text-gray-400">
              {description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="confirm-cancel">{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirm?.()}
            className={destructive ? 'bg-rose-600 hover:bg-rose-700 text-white' : ''}
            data-testid="confirm-accept"
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConfirmDialog;
