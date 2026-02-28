# PRD - Sistema de Gestão de OTs (Ordens de Trabalho)

## Visão Geral
Sistema de gestão de tempo e ordens de trabalho para empresa de assistência técnica. Permite controlo de ponto, gestão de OTs, cronómetros de trabalho/viagem/oficina, e geração de relatórios PDF.

## Backlog Prioritizado

### P0 (Concluído)
- **Saldo Negativo de Férias** (28 Fevereiro 2026) - Backend permite saldo negativo, frontend mostra valor a vermelho
- **Folha de Horas - Separação por tipo de registo** (27 Fevereiro 2026)
- **Canvas Assinatura Mobile Landscape** (25 Fevereiro 2026)
- **Tipo "Oficina" adicionado** (27 Fevereiro 2026)
- **Equipamentos no Visualizar Relatório** (27 Fevereiro 2026)
- **Arredondamento em edições** (27 Fevereiro 2026)
- **Anexar Folha de Horas no email** (27 Fevereiro 2026)

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
