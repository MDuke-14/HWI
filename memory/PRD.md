# PRD - Sistema de Gestão de OTs (Ordens de Trabalho)

## Visão Geral
Sistema de gestão de tempo e ordens de trabalho para empresa de assistência técnica. Permite controlo de ponto, gestão de OTs, cronómetros de trabalho/viagem/oficina, e geração de relatórios PDF.

## Backlog Prioritizado

### P0 (Concluído)
- **Regra de cálculo sem segundos** (28 Fevereiro 2026) - Normalização HH:MM em todos os cálculos; somas por minutos inteiros nos relatórios
- **Saldo Negativo de Férias** (28 Fevereiro 2026)
- **Folha de Horas - Separação por tipo de registo** (27 Fevereiro 2026)
- **Canvas Assinatura Mobile Landscape** (25 Fevereiro 2026)
- **Tipo "Oficina" adicionado** (27 Fevereiro 2026)
- **Arredondamento em edições** (27 Fevereiro 2026)
- **Anexar Folha de Horas no email** (27 Fevereiro 2026)

### P0 (Concluído recente)
- **Novo card "Relatório de Assistência" separado e agrupado por data** (5 Março 2026) - Campo removido dos modais de intervenção. Novo card dedicado antes de Assinaturas com CRUD (texto + checkboxes de equipamentos + data de intervenção). Agrupado por data no "Visualizar Relatório" modal e no PDF da OT (secção "RELATÓRIO DE ASSISTÊNCIA" com equipamentos e texto). Modelo `RelatorioAssistencia` com `data_intervencao` e 4 endpoints CRUD.
- **Card de Despesas na Folha de Horas** (5 Março 2026) - Card após seleção de tarifas mostra despesas da OT com botão VER. Popup de lista com cards clicáveis. Popup de detalhe com dados da despesa (read-only), campo "Adicionar Valor Percentual" com preview do valor final, e 3 botões (Fechar, Não Visualizar, Gravar). Despesas excluídas mostradas com opção Restaurar. Total ajustado propagado ao PDF.
- **Campo "Horas de Funcionamento" em Equipamentos** (5 Março 2026) - Campo adicionado ao modelo EquipamentoOT e Equipamento (BD cliente). Guardado na BD do cliente ao criar novo; atualizado ao selecionar existente com horas novas. Mostrado na OT, PDF, Visualizar Relatório, e fichas de clientes. Formulários de adicionar e editar incluem o campo.
- **Páginas mobile Notificações e Perfil/Alterar Password** (4 Março 2026) - Novas páginas MobileNotifications.jsx e MobileProfile.jsx. Notificações com limpar individual/todas. Perfil mostra info do user + form de alterar password com validação. Admin recebe notificação com a nova password.
- **Rever Férias — Cancelamento de dias** (4 Março 2026) - Botão "Rever" na página de férias, modal com calendário estilo /calendar, dias de férias a azul, seleção para cancelamento a vermelho, devolução automática dos dias ao saldo
- **Notificações com redirecionamento** (4 Março 2026) - Clicar em notificações redireciona para a página relevante (férias→/vacations, despesas→OT, faltas→/absences, etc.)
- **Adaptação mobile da página de Faltas** (4 Março 2026) - Classes responsivas Tailwind, layout compacto mobile, dialog responsivo
- **Adaptação mobile da página de Férias** (4 Março 2026) - Verificado: layout responsivo com cards empilhados, texto adaptável
- **Scanner de Faturas** (3 Março 2026) - Componente FaturaScanner.jsx com captura, crop A4, conversão PDF
- **Reports mobile** (3 Março 2026) - Refactored Reports.jsx com layout card-based mobile
- **Função na OT** (2 Março 2026) - Campo obrigatório "Técnico/Ajudante" ao adicionar colaboradores
- **Ordenação cronológica dos registos** (2 Março 2026) - Corrigida lógica de sort

### P0 (Concluído recente cont.)
- **FaturaScanner simplificado (sem cropper)** (6 Março 2026) - Removido react-easy-crop e filtros de melhoria que não funcionavam em iOS. Componente simplificado: upload direto de foto/ficheiro, preview da imagem, conversão para PDF. PDFs anexados diretamente sem etapas intermédias. Zero problemas de touch/scroll.
- **Fix cálculo tarifas na Folha de Horas (email)** (6 Março 2026) - Corrigido bug crítico: o fluxo de email não passava `tarifas_detalhadas` ao PDF, fazendo com que `find_best_tariff` nunca fosse chamado. O sistema usava fallback `tarifas_por_codigo` que sobrescrevia valores (última tarifa por código ganhava). Fix: agora o email passa `tarifas_detalhadas` completo. Também corrigido o endpoint PUT de tarifas que resetava `tipo_registo`, `tipo_colaborador` e `codigo` para None ao atualizar qualquer campo (usando `exclude_unset=True`).

### P0 (Pendente)
- **PDF Generation Fails for Large Reports** - "Flowable too large" para OT#358
- **Signature editing does not save correctly** - Verificação pendente

### P1
- Completar/Testar Tabela de Preços Dinâmica
- Refactoring `window.location.reload()` hack
- Testar "Associar OT ao Calendário"
- Completar lógica "Trabalhar em Férias"
- Adaptar restantes páginas para mobile
- Integração OneDrive

### P2
- VAPID Key Mismatch, Edit OT Equipment
- Refactoring server.py (~11500 linhas) e TechnicalReports.jsx (~9500 linhas)
- Overtime Report, WebSockets, Metrics Dashboard, Excel/CSV Export

## Stack
- Frontend: React + shadcn/ui
- Backend: FastAPI + MongoDB
- PDF: ReportLab

## Credenciais
- Admin: `pedro` / `password`
- Test: `teste@email.com` / `teste`
