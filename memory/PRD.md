# HWI Unipessoal - Time Tracking & OT Management System

## Original Problem Statement
Full-stack time-tracking and work-order (OT) management application for HWI Unipessoal, Lda.

## Architecture
- **Frontend**: React + Tailwind + Shadcn/UI (port 3000)
- **Backend**: FastAPI + Motor (MongoDB async) (port 8001)
- **Database**: MongoDB
- **PDF Generation**: ReportLab

## Core Features Implemented
- OT creation, management, and lifecycle (status: em execução → concluído → faturado)
- Time tracking with chronometer (clock in/out)
- Client management with NIF/email
- Equipment tracking per OT
- Intervention management with dates and descriptions
- Signature management (add, edit, delete)
- Photo uploads for OT reports
- Material tracking per OT
- Expense management (despesas) with receipt scanning
- PDF report generation (OT Report + Folha de Horas)
- Calendar integration showing OTs
- Mobile-optimized dashboard
- Admin panel with user management, price tables, notifications
- Push notifications (VAPID)
- Search by OT number, client, location
- **OT Relacionada**: Link OTs to previous OTs for traceability
- **Ver Intervenções**: View equipment intervention history across all OTs

## Recent Implementations (March 2026)

### Folha de Horas PDF - Complete Restructure (7 Mar 2026)
- **Section 1 - REGISTOS GERAIS**: Single table with ALL records, sorted by Date > Start Time > Collaborator Name. Columns: Data | Colaborador | Função | Registo | Horas | Tarifa | Total Valor | KM's | Preço/KM | Total KM | Início | Fim | Dieta | Observações
- **Section 2 - Per Collaborator**: Individual record tables + RESUMO FINANCEIRO summary table per collaborator showing total euros per code (Cód.1, Cód.2, Cód.S, Cód.D, Cód.V1-VD, KM, TOTAL)
- **Section 3 - DESPESAS**: Existing expenses table (excluding combustivel/fuel)
- **Section 4 - NOTA LEGAL**: "Este documento é apenas informativo..." after each summary and after expenses
- **Section 5 - TABELA DE PREÇOS IMAGE**: Last page, maximized, centered
- **Layout**: Professional neutral colors (black, grey, white) - no strong colors
- **New endpoints**: POST/GET/DELETE /api/tabelas-preco/{table_id}/imagem for price table image management
- **Admin UI**: Added image upload in price table configuration dialog

### Material Units in PDF (7 Mar 2026)
- Added unit display (L, Un, M) next to quantity in OT PDF report
- Fixed bug: material creation failing with "erro ao processar solicitação" due to `quantidade` arriving as string from frontend (TypeError: '<=' not supported between str and int)
- Fix: Backend now converts `quantidade` to float before validation
- Units displayed in all views: OT detail, report preview, and PDF

### Dieta (Meal Allowance) Business Rules
- Rule: ≤4h work/day = 0€, 4h-6h = 50%, >6h = 100% of base valor_dieta
- Base valor_dieta stored in tabelas_preco collection
- Applied automatically in PDF generator with fallback (valor_dieta_default parameter)
- Works in both direct PDF download and email sending

### OT Relacionada (Related OT)
- Optional field when creating a new OT to link to a previous OT
- Forward reference: new OT shows "OT Relacionada: OT #XXX"
- Reverse reference: original OT shows "OT Posterior: OT #YYY"
- Visible in: OT list cards, OT detail modal, OT PDF report, Folha de Horas PDF
- DB field: ot_relacionada_id (string, optional) on relatorios_tecnicos collection

### Ver Intervenções do Equipamento
- Replaced "Ver OTs deste Equipamento" with "Ver Intervenções" button
- New backend endpoint: GET /api/equipamentos/{id}/intervencoes
- Shows intervention cards: "Intervenção — OT #XXX — Data DD/MM/YYYY"
- Expandable cards showing Motivo and Relatório fields
- Matches equipment via: equipamento_cliente_id, marca/modelo in equipamentos_ot, marca/modelo in relatorios_tecnicos

### Folha de Horas PDF Restructuring
- Expenses moved to separate DESPESAS table at end of document
- PAUSA and DIETA columns correctly populated
- Tariff calculation fixed (uses work/technician type correctly)

### iOS Receipt Scanner Fix
- FaturaScanner.jsx simplified to direct file upload (removed problematic cropper)

## Key API Endpoints
- POST /api/relatorios-tecnicos - Create OT (accepts ot_relacionada_id)
- GET /api/relatorios-tecnicos - List OTs (includes ot_relacionada_numero, ots_posteriores)
- GET /api/equipamentos/{id}/intervencoes - Get equipment intervention history
- POST /api/relatorios-tecnicos/{id}/folha-horas-pdf - Generate timesheet PDF
- GET /api/relatorios-tecnicos/{id}/preview-pdf - Preview OT PDF
- POST /api/relatorios-tecnicos/{id}/send-email - Email OT report
- PUT /api/tabelas-preco/{id} - Update price table (includes valor_dieta)

## Key DB Collections
- relatorios_tecnicos: ot_relacionada_id (optional string)
- tabelas_preco: valor_dieta (optional float)
- intervencoes_relatorio: equipamento_id (optional, links to equipamentos_ot)
- equipamentos_ot: marca, modelo, numero_serie, equipamento_cliente_id

## Credentials
- Admin: pedro / password
- Non-admin: teste@email.com / teste

## Pending Issues (Prioritized)
### P0
- PDF Generation Fails for Large Reports (Flowable too large - use OT#358 to test)

### P1
- Complete and Test Dynamic Price Table Creation
- Signature editing may not save correctly (needs verification)
- Refactor server.py (12000+ lines) into separate routers
- Refactor TechnicalReports.jsx (10000+ lines) into smaller components

### P2
- Recurring VAPID Key Mismatch
- Unresolved "Edit OT Equipment" Test Failure
- Refactor window.location.reload() hack in mobile

## Future Tasks
- P0: Refactor monolithic files (server.py, TechnicalReports.jsx)
- P1: OneDrive Integration for file storage
- P1: Adapt remaining pages for mobile
- P1: Test "Associate OT to Calendar" feature
- P2: Overtime Reporting
- P2: Real-time Admin Notifications (WebSockets)
- P2: Metrics Dashboard with charts
- P2: Data Export to Excel/CSV
