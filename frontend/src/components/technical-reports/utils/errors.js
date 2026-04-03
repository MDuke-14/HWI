export const formatTechnicalReportError = (error) => {
  if (!error?.response) {
    return 'Erro de conexÃ£o';
  }

  const data = error.response.data;

  if (typeof data?.detail === 'string') {
    return data.detail;
  }

  if (Array.isArray(data?.detail)) {
    return data.detail
      .map((err) => {
        const field = err.loc ? err.loc[err.loc.length - 1] : 'campo';
        return `${field}: ${err.msg}`;
      })
      .join(', ');
  }

  return 'Erro ao processar solicitaÃ§Ã£o';
};

export default formatTechnicalReportError;
