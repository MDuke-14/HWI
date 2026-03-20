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
  server.py            # Main app (10,097 lines - reduced from 12,975, -22%)
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
- Signature management (add, edit, delete)
- Photo uploads for FS reports
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

## Recent Implementations (March 2026 - Session 6)

### Client-driven Internal Reference System (20 Mar 2026)
- **Auto-email on FS creation**: When creating FS for client with `incluir_referencia_interna` enabled and email, system auto-generates a secure one-time token and sends email with link
- **Public reference page**: `/reference/:token` - client sees FS details and enters internal reference
- **Token validation**: One-time use, 30-day expiry, proper error states (used, expired, invalid)
- **Reference submission**: Updates FS `referencia_interna_cliente` field, marks token as used
- **Admin notifications**: Creates notification for all admins when client submits reference
- **NotificationBell integration**: referencia_interna type shows in existing notification system
- **Admin panel**: New "Ref. Internas" tab (admin-only) with full management of reference tokens - filter by status (Pendente/Submetido/Expirado) and client, resend emails, delete tokens
- **Testing**: 30/30 backend tests passed (14 token + 16 admin panel), 100% frontend verified

### Purchase Order (PC) Management System (19 Mar 2026)
- PC creation, sub-PCs, aggregation, status management
- PC PDF with confidentiality redaction, neutral color scheme
- Direct link for PC status management (public page)
- Language selection for emails (PT/ES/EN)
- Email with document selection popup

## Key API Endpoints
- POST /api/relatorios-tecnicos - Create FS (auto-triggers reference email if applicable)
- GET /api/relatorios-tecnicos - List FSs
- GET /api/referencia/{token} - Public: Get FS data for reference page
- POST /api/referencia/{token} - Public: Submit client reference
- GET /api/admin/reference-tokens - Admin: List all reference tokens with filters
- DELETE /api/admin/reference-tokens/{id} - Admin: Delete a reference token
- POST /api/admin/resend-reference-email/{id} - Admin: Resend reference email
- GET /api/admin/reference-alerts - Admin: Get unread reference alerts
- PUT /api/admin/reference-alerts/{alert_id}/read - Admin: Mark alert as read
- POST /api/relatorios-tecnicos/{id}/materiais - Add material
- GET /api/relatorios-tecnicos/{id}/pedidos-cotacao - List PCs for FS
- GET /api/pedidos-cotacao - List all PCs
- GET /api/pedidos-cotacao/{id}/preview-pdf - PC PDF preview
- POST /api/pedidos-cotacao/{id}/send-email - Send PC email
- POST /api/relatorios-tecnicos/{id}/folha-horas-pdf - Generate timesheet PDF
- GET /api/relatorios-tecnicos/{id}/preview-pdf - Preview FS PDF
- POST /api/relatorios-tecnicos/{id}/send-email - Email FS report

## Key DB Collections
- relatorios_tecnicos: referencia_interna_cliente (optional), km_inicial (optional)
- reference_tokens: token, relatorio_id, cliente_id, used, referencia, expires_at, created_at
- notifications: type includes 'referencia_interna'
- pedidos_cotacao: parent_pc_id, sub_numero, status
- clientes: incluir_referencia_interna (boolean)

## Credentials
- Admin: pedro / password
- Non-admin: teste@email.com / teste

## Pending Issues (Prioritized)
### P1
- PDF Generation Fails for Large Reports (Flowable too large - use FS#358 to test)
- Complete and Test Dynamic Price Table Creation
- Refactor server.py (12800+ lines) into separate routers
- Refactor TechnicalReports.jsx (10500+ lines) into smaller components

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
