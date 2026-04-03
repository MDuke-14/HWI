export const REPORT_STATUS_OPTIONS = [
  { value: 'agendado', label: 'Agendado', icon: '📅' },
  { value: 'orcamento', label: 'Orcamento', icon: '🟡' },
  { value: 'em_execucao', label: 'Em Execucao', icon: '🔵' },
  { value: 'concluido', label: 'Concluido', icon: '🟢' },
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

// Ordenar: Em Execucao primeiro, depois restantes, cada grupo por numero descendente
export const sortReportsByStatus = (relatorios) => {
  const statusOrder = { em_execucao: 0, em_andamento: 0, orcamento: 1, agendado: 2, concluido: 3 };
  return [...relatorios].sort((a, b) => {
    const orderA = statusOrder[a.status] ?? 4;
    const orderB = statusOrder[b.status] ?? 4;
    if (orderA !== orderB) return orderA - orderB;
    return (b.numero_assistencia || 0) - (a.numero_assistencia || 0);
  });
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
