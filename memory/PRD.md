# HWI Unipessoal - Time Tracking & FS Management System

## Original Problem Statement
Full-stack time-tracking and work-order (FS - Folha de Servico) management application for HWI Unipessoal, Lda.

## Code Architecture (after refactoring Phase 1+2)
```
/app/backend/
  database.py          # MongoDB connection singleton (14 lines)
  models.py            # All Pydantic models (625 lines)
  auth_utils.py        # Auth helpers (51 lines)
  helpers.py           # Shared helpers - email, notifications, vacation calc (122 lines)
  email_templates.py   # Multilingual email templates
  server.py            # Main app (~10,100 lines - reduced from 12,975, -22%)
  routes/
    auth_routes.py     # Login, register, forgot-password (177 lines)
    clientes.py        # Client CRUD + PDF export (270 lines)
    equipamentos.py    # Equipment CRUD + history (211 lines)
    notifications.py   # Notifications + push (319 lines)
    pedidos_cotacao.py # PC management + invoices (545 lines)
    company_info.py    # Company info (94 lines)
    tabelas_tarifas.py # Price tables + tariffs (333 lines)
    references.py      # Internal reference system (243 lines)
```

## Core Features Implemented
- FS creation, management, and lifecycle (status: em execucao -> concluido -> faturado)
- Time tracking with chronometer (clock in/out)
- Client management with NIF/email
- Equipment tracking per FS
- Intervention management with dates and descriptions (tab-based UI)
- Signature management (add, edit, delete) with inline editing of name, date, time
- Photo uploads for FS reports with edit (description, date) capability
- Move items (photos, materials, equipment) between interventions
- Material tracking per FS with PC (Pedido de Cotacao) integration
- Expense management (despesas) with receipt scanning
- PDF report generation (FS Report + Folha de Horas)
- Calendar integration showing FSs
- Mobile-optimized dashboard
- Admin panel with user management, price tables, notifications
- Push notifications (VAPID)
- Search by FS number, client, location, status
- FS Relacionada: Link FSs to previous FSs for traceability
- Ver Intervencoes: View equipment intervention history across all FSs
- Tipo de Colaborador: Employee type auto-populates role
- Travel time billing logic (0-15min=free, 16-29min=km only, 30+min=full)
- Labor record editing with audit logging
- Automatic related FS creation via button
- Client-driven Internal Reference System with admin panel
- Purchase Order (PC) Management System

## Key API Endpoints
- POST /api/relatorios-tecnicos - Create FS
- GET /api/relatorios-tecnicos - List FSs
- GET /api/relatorios-tecnicos/{id}/preview-pdf - Preview FS PDF
- PUT /api/relatorios-tecnicos/{id}/fotografias/{foto_id} - Update photo (description, date, intervencao_id)
- PUT /api/relatorios-tecnicos/{id}/assinaturas/{sig_id} - Update signature (name, date, time)
- PUT /api/relatorios-tecnicos/{id}/materiais/{material_id} - Update material (including intervencao_id)
- PUT /api/relatorios-tecnicos/{id}/equipamentos/{equip_id} - Update equipment (including intervencao_id)
- GET /api/referencia/{token} - Public: Get FS data for reference page
- POST /api/referencia/{token} - Public: Submit client reference
- GET /api/admin/reference-tokens - Admin: List all reference tokens
- GET /api/pedidos-cotacao - List all PCs
- GET /api/pedidos-cotacao/{id}/preview-pdf - PC PDF preview

## Credentials
- Admin: pedro / password
- Non-admin: teste@email.com / teste

## Pending Issues (Prioritized)
### P0
- Refactor TechnicalReports.jsx (10,900+ lines) into smaller components (USER APPROVED)

### P1
- Complete and Test Dynamic Price Table Creation
- Continue backend refactoring (server.py still ~10,100 lines)
- PDF Generation - verify with real production data (FS#358 now generating OK in preview)

### P2
- Recurring VAPID Key Mismatch
- Unresolved "Edit OT Equipment" Test Failure
- Refactor window.location.reload() hack in mobile

## Future Tasks
- P1: OneDrive Integration for file storage
- P1: Adapt remaining pages for mobile
- P1: Test "Associate OT to Calendar" feature
- P2: Overtime Reporting
- P2: Real-time Admin Notifications (WebSockets)
- P2: Metrics Dashboard with charts
- P2: Data Export to Excel/CSV
