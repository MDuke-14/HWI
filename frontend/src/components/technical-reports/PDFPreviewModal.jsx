import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Download, FileText } from 'lucide-react';

const PDFPreviewModal = ({
  open,
  onOpenChange,
  pdfUrl,
  title = 'Visualizar PDF',
  onDownload
}) => {
  const handleClose = () => {
    onOpenChange(false);
    // Cleanup URL object
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-5xl h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b border-gray-700 flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileText className="w-5 h-5 text-red-400" />
            {title}
          </DialogTitle>
          <div className="flex items-center gap-2">
            {onDownload && (
              <Button
                onClick={onDownload}
                size="sm"
                className="bg-red-600 hover:bg-red-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 h-full">
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full"
              title="PDF Preview"
              style={{ minHeight: 'calc(90vh - 60px)' }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              A carregar PDF...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PDFPreviewModal;
