import React, { useEffect, useRef, useState } from 'react';

// pdfjs-dist v4 legacy build funciona no ambiente Node 20 + Webpack 5 do CRA.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Worker servido a partir de public/ (copiado no setup)
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

/**
 * Renderiza um PDF (Blob URL ou Uint8Array) em <canvas>, uma página abaixo da outra.
 * Funciona de forma fiável dentro de modais Radix (independente de plugins nativos do browser).
 *
 * Props:
 *  - url: string (Blob URL) — se presente, usa-se em detrimento de `data`
 *  - data: Uint8Array | ArrayBuffer — bytes do PDF
 *  - scale: number (default 1.4)
 */
export default function PdfCanvasViewer({ url, data, scale = 1.4 }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let loadingTask = null;

    async function render() {
      if (!url && !data) return;
      setStatus('loading');
      setError(null);

      try {
        const src = url ? { url } : { data };
        loadingTask = pdfjsLib.getDocument(src);
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        setNumPages(pdf.numPages);

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.className = 'block mx-auto my-3 shadow-lg';
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.maxWidth = '100%';
          canvas.style.height = 'auto';
          container.appendChild(canvas);

          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;
        }

        if (!cancelled) setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          console.error('[PdfCanvasViewer] render error', err);
          setError(err?.message || 'Erro a renderizar PDF');
          setStatus('error');
        }
      }
    }

    render();

    return () => {
      cancelled = true;
      if (loadingTask && typeof loadingTask.destroy === 'function') {
        try { loadingTask.destroy(); } catch (_) { /* ignore */ }
      }
    };
  }, [url, data, scale]);

  return (
    <div className="w-full h-full overflow-auto bg-neutral-100" data-testid="pdf-canvas-viewer">
      {status === 'loading' && (
        <div className="flex items-center justify-center h-full text-gray-600">
          A renderizar PDF…
        </div>
      )}
      {status === 'error' && (
        <div className="flex flex-col items-center justify-center h-full text-red-600 gap-3 p-6">
          <p>Não foi possível renderizar o PDF.</p>
          <p className="text-xs text-gray-500">{error}</p>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline">
              Abrir PDF numa nova janela
            </a>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        className={status === 'ready' ? 'py-2' : 'hidden'}
        aria-label={`PDF com ${numPages} páginas`}
      />
    </div>
  );
}
