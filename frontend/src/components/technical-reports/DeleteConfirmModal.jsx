import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Trash2 } from 'lucide-react';

const DeleteConfirmModal = ({
  open,
  onOpenChange,
  title = 'Confirmar Eliminação',
  description = 'Tem certeza que deseja eliminar este item? Esta ação não pode ser desfeita.',
  itemName = '',
  onConfirm,
  loading = false,
  confirmText = 'Eliminar',
  cancelText = 'Cancelar'
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-5 h-5" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-gray-400 pt-2">
            {description}
            {itemName && (
              <span className="block mt-2 text-white font-medium">
                "{itemName}"
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 border-gray-600"
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            onClick={() => {
              onConfirm();
            }}
            disabled={loading}
            className="flex-1 bg-red-600 hover:bg-red-700"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {loading ? 'A eliminar...' : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteConfirmModal;
