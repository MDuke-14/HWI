/**
 * Helper para download de PDFs de FS usando o padrão job-async.
 *
 * Para FS com muitas fotos (40+), a geração demora mais que o timeout
 * do gateway Cloudflare/Kubernetes (~100s). Em vez de manter uma ligação
 * HTTP única, dividimos em 3 chamadas curtas:
 *   1. POST  /preview-pdf-async → devolve job_id
 *   2. GET   /pdf-jobs/{id}      → poll status
 *   3. GET   /pdf-jobs/{id}/download → stream do PDF
 *
 * Cada pedido individual é < 1s, evitando o gateway timeout.
 *
 * @param {object} opts
 * @param {string} opts.api - Base URL da API (ex: REACT_APP_BACKEND_URL + '/api')
 * @param {string} opts.relatorioId - ID da FS a gerar
 * @param {object} opts.axios - Instância axios (com auth header)
 * @param {function} [opts.onProgress] - callback (elapsedSeconds, sizeBytes) durante poll
 * @param {number} [opts.pollIntervalMs=2000]
 * @param {number} [opts.maxWaitMs=600000] - 10 min máximo
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function downloadFSPdfAsync({
  api,
  relatorioId,
  axios,
  onProgress,
  pollIntervalMs = 2000,
  maxWaitMs = 600000,
}) {
  // 1. Iniciar job
  const startResp = await axios.post(
    `${api}/relatorios-tecnicos/${relatorioId}/preview-pdf-async`,
    {},
    { timeout: 30000 }
  );
  const { job_id: jobId, filename } = startResp.data;

  // Poll status até done/error/timeout
  const startTime = Date.now();
  while (true) {
    if (Date.now() - startTime > maxWaitMs) {
      throw new Error(
        `Geração de PDF demorou mais que ${Math.round(maxWaitMs / 1000)}s. Tenta novamente ou reduz o número de fotografias.`
      );
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const statusResp = await axios.get(`${api}/pdf-jobs/${jobId}`, {
      timeout: 15000,
    });
    const { status, size_bytes, elapsed_seconds, error } = statusResp.data;

    if (onProgress) {
      try {
        onProgress(elapsed_seconds, size_bytes);
      } catch (_) {
        // ignore progress callback errors
      }
    }

    if (status === 'done') break;
    if (status === 'error') {
      throw new Error(error || 'Erro a gerar PDF');
    }
    // status === 'pending' → continuar a fazer poll
  }

  // 3. Download
  const downloadResp = await axios.get(`${api}/pdf-jobs/${jobId}/download`, {
    responseType: 'blob',
    timeout: 120000, // 2 min para fazer o stream do ficheiro já gerado
  });

  const blob = new Blob([downloadResp.data], { type: 'application/pdf' });
  return { blob, filename };
}

/**
 * Atalho: gera e força o download (como ficheiro) no browser.
 */
export async function downloadFSPdfToFile({
  api,
  relatorioId,
  axios,
  fallbackFilename,
  onProgress,
}) {
  const { blob, filename } = await downloadFSPdfAsync({
    api,
    relatorioId,
    axios,
    onProgress,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename || fallbackFilename || 'FS.pdf');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return { filename };
}
