const TIPO_HORARIO_LABELS = {
  diurno: 'Diurno (07h-19h)',
  noturno: 'Noturno (19h-07h)',
  sabado: 'SÃ¡bado',
  domingo_feriado: 'Domingo/Feriado',
};

const TIPO_HORARIO_CODIGOS = {
  diurno: '1',
  noturno: '2',
  sabado: 'S',
  domingo_feriado: 'D',
};

const STATUS_COLORS = {
  agendado: 'text-cyan-400 bg-cyan-500/10',
  orcamento: 'text-amber-400 bg-amber-500/10',
  em_execucao: 'text-blue-400 bg-blue-500/10',
  em_andamento: 'text-blue-400 bg-blue-500/10',
  concluido: 'text-green-400 bg-green-500/10',
  facturado: 'text-purple-400 bg-purple-500/10',
};

const STATUS_LABELS = {
  agendado: 'Agendado',
  orcamento: 'OrÃ§amento',
  em_execucao: 'Em ExecuÃ§Ã£o',
  em_andamento: 'Em ExecuÃ§Ã£o',
  concluido: 'ConcluÃ­do',
  facturado: 'Facturado',
};

export const getTipoHorarioLabel = (tipo) => TIPO_HORARIO_LABELS[tipo] || tipo;
export const getTipoHorarioCodigo = (tipo) => TIPO_HORARIO_CODIGOS[tipo] || '-';
export const getTechnicalReportStatusColor = (status) => STATUS_COLORS[status] || 'text-gray-400 bg-gray-500/10';
export const getTechnicalReportStatusLabel = (status) => STATUS_LABELS[status] || status;
