# HWI Unipessoal - Time Tracking & FS Management System

## Original Problem Statement
Full-stack time-tracking and work-order (FS - Folha de Serviço) management application for HWI Unipessoal, Lda.

## Architecture
- **Frontend**: React + Tailwind + Shadcn/UI (port 3000)
- **Backend**: FastAPI + Motor (MongoDB async) (port 8001)
- **Database**: MongoDB
- **PDF Generation**: ReportLab

## Core Features Implemented
- FS creation, management, and lifecycle (status: em execução → concluído → faturado)
- Time tracking with chronometer (clock in/out)
- Client management with NIF/email
- Equipment tracking per FS
- Intervention management with dates and descriptions (tab-based UI)
- Signature management (add, edit, delete)
- Photo uploads for FS reports
- Material tracking per FS with PC (Pedido de Cotação) integration
- Expense management (despesas) with receipt scanning
- PDF report generation (FS Report + Folha de Horas)
- Calendar integration showing FSs
- Mobile-optimized dashboard
- Admin panel with user management, price tables, notifications
- Push notifications (VAPID)
- Search by FS number, client, location, status
- FS Relacionada: Link FSs to previous FSs for traceability
- Ver Intervenções: View equipment intervention history across all FSs
- Tipo de Colaborador: Employee type auto-populates role
- Travel time billing logic (0-15min=free, 16-29min=km only, 30+min=full)
- Labor record editing with audit logging
- Automatic related FS creation via button

## Recent Implementations (March 2026 - Session 5)

### Purchase Order (PC) Management System (19 Mar 2026)
- **New naming convention**: PCs use `PC_XXX#YYY` format where YYY = FS number
- **Sub-PCs**: Multiple PCs for same FS create sub-PCs (PC_001.2, PC_001.3, etc.) grouped under parent
- **Material Modal PC Choice**: When adding material with "Cotação":
  - If no PCs exist: auto-creates new PC
  - If PCs exist: user can choose "Criar novo PC" or "Agregar a PC existente"
  - Dropdown shows existing PCs with status and material count
- **Backend**: Updated `add_material_ot` endpoint to accept optional `pc_id`, updated `update_material_ot` to use new naming convention, updated `get_pedidos_cotacao_ot` to group sub-PCs
- **Frontend**: Updated MaterialModal component with PC choice UI, updated FS detail view and global PC tab to show sub-PCs indented under parents
- **Testing**: 8/8 backend tests passed, frontend verified
- Modified files: server.py (endpoints + model), MaterialModal.jsx (complete rewrite), TechnicalReports.jsx (PC display + handleAddMaterial)

## Key API Endpoints
- POST /api/relatorios-tecnicos - Create FS
- GET /api/relatorios-tecnicos - List FSs
- POST /api/relatorios-tecnicos/{id}/materiais - Add material (accepts optional pc_id for PC aggregation)
- GET /api/relatorios-tecnicos/{id}/pedidos-cotacao - List PCs for FS (grouped with sub_pcs)
- GET /api/pedidos-cotacao - List all PCs system-wide (grouped with sub_pcs)
- GET /api/pedidos-cotacao/{id} - PC details with materials and photos
- PUT /api/pedidos-cotacao/{id} - Update PC status
- DELETE /api/pedidos-cotacao/{id} - Delete PC
- POST /api/relatorios-tecnicos/{id}/folha-horas-pdf - Generate timesheet PDF
- GET /api/relatorios-tecnicos/{id}/preview-pdf - Preview FS PDF
- POST /api/relatorios-tecnicos/{id}/send-email - Email FS report
- PUT /api/tabelas-preco/{id} - Update price table
- POST /api/relatorios-tecnicos/{id}/criar-fs-relacionada - Create related FS
- PUT /api/relatorios-tecnicos/{id}/registos/{registo_id} - Edit labor record with audit

## Key DB Collections
- relatorios_tecnicos: ot_relacionada_id (optional), km_inicial (optional)
- tabelas_preco: valor_dieta (optional float)
- intervencoes_relatorio: equipamento_id (optional)
- equipamentos_ot: marca, modelo, numero_serie, equipamento_cliente_id
- materiais_ot: pc_id (optional - links material to a Pedido de Cotação), intervencao_id (optional)
- pedidos_cotacao: numero_pc, relatorio_id, parent_pc_id (optional - for sub-PCs), sub_numero, status, created_by
- audit_logs: registo_id, user_id, user_name, changes, timestamp
- users: tipo_colaborador (optional - junior/tecnico/senior)

## Credentials
- Admin: pedro / password
- Non-admin: teste@email.com / teste

## Pending Issues (Prioritized)
### P0
- Bug: Wrong modal opens when editing a client to enable "Referência Interna" feature (needs verification - may already be fixed)

### P1
- PDF Generation Fails for Large Reports (Flowable too large - use FS#358 to test)
- Complete and Test Dynamic Price Table Creation
- Refactor server.py (12500+ lines) into separate routers
- Refactor TechnicalReports.jsx (10400+ lines) into smaller components

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
