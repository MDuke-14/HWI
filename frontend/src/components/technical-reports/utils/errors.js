export const formatTechnicalReportError = (error) => {
  if (!error?.response) {
    return 'Erro de conexão';
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

  return 'Erro ao processar solicitação';
};

export default formatTechnicalReportError;
