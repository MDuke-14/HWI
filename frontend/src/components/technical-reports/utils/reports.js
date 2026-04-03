export const REPORT_STATUS_OPTIONS = [
  { value: 'agendado', label: 'Agendado', icon: '📅' },
  { value: 'orcamento', label: 'Orçamento', icon: '🟡' },
  { value: 'em_execucao', label: 'Em Execução', icon: '🔵' },
  { value: 'concluido', label: 'Concluído', icon: '🟢' },
  { value: 'facturado', label: 'Facturado', icon: '🟣' },
];

export const matchesReportSearch = (relatorio, searchTerm) => {
  if (!searchTerm.trim()) {
    return true;
  }

  const search = searchTerm.toLowerCase().trim();

  return (
    relatorio.numero_assistencia?.toString().includes(search) ||
    relatorio.cliente_nome?.toLowerCase().includes(search) ||
    relatorio.local_intervencao?.toLowerCase().includes(search) ||
    relatorio.cliente_local?.toLowerCase().includes(search)
  );
};

export const filterReportsByStatus = (relatorios, status) => {
  if (!status) {
    return [];
  }

  return relatorios.filter((relatorio) => relatorio.status === status);
};

export const matchesClientSearch = (cliente, searchTerm) => {
  const search = searchTerm.toLowerCase();

  return (
    cliente.nome.toLowerCase().includes(search) ||
    (cliente.email && cliente.email.toLowerCase().includes(search)) ||
    (cliente.nif && cliente.nif.includes(searchTerm))
  );
};
