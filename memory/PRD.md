# HWI Unipessoal - Field Service Management

## Original Problem Statement
Aplicação de gestão de Folhas de Serviço (FS / Ordens de Trabalho) para a HWI Unipessoal — tracking de tempo dos técnicos (cronómetros), gestão de intervenções, fotografias, materiais, equipamentos, geração de PDFs (relatório técnico + Folha de Horas), envio por email, cálculo de tarifas por código (1/2/S/D), workflows de continuidade entre FSs, autenticação, painel de admin com erros, etc.

## Stack
- **Frontend:** React (CRA + craco), TailwindCSS, shadcn/ui, axios, sonner
- **Backend:** FastAPI + Motor (MongoDB async)
- **DB:** MongoDB (collections: relatorios_tecnicos, intervencoes_relatorio, registos_tecnico_ot, fotografias, materiais, assinaturas, clientes, tarifas, app_errors, pdf_jobs + GridFS para PDFs gerados)
- **PDF:** ReportLab + PIL
- **AI:** Claude Sonnet 4.5 via emergentintegrations (revisão de FSs e análise de erros)
- **Email:** aiosmtplib (SMTP)

## Core Features Implemented
- FS creation, management, and lifecycle
- Time tracking with chronometer (batch start/stop)
- Client management with NIF/email
- **Per-client billing config: `faturar_viagens_curtas` (Feb 2026)** — toggle no modal Cliente; quando ativo, viagens <30min cobram horas + KM (ex.: Kannegiesser); quando inativo (default), cobram apenas KM com observação "Só KM (<30min)" no PDF da Folha de Horas
- Equipment tracking per FS
- Intervention management with tabs + close button (X) on each tab (Feb 2026)
- Signature management (add, edit, delete)
- Photo upload (thumb_base64 normalizadas 200x200)
- Material/expense management
- PDF generation (sync + async via job + GridFS multi-pod)
- ZIP fallback para FSs grandes (PDF + HD photos)
- AI Review de FSs
- Admin Error Log (com IA-resolve)
- Folha de Horas (Timesheet) com cálculo detalhado por código (1/2/S/D), tipo (trabalho/viagem) e função (junior/tecnico/senior)

## Sessão Atual (Feb 2026) — Resumo
1. ✅ Feature `faturar_viagens_curtas` no Cliente (Kannegiesser)
2. ✅ Seed das 24 tarifas de produção em table_id=1 do preview (3 funções × 4 códigos × 2 tipos)
3. ✅ Confirmação total de horas FS#471 (Trabalho 106h15 + Viagem 33h56)
4. ✅ Identificação de discrepância tarifa Junior×Cód.1×Viagem (PDF cobrou 30€/h, correto 16€/h — diferença -49.70€)
5. ✅ X button em cada aba de intervenção para apagar diretamente
6. ✅ **RCA HTTP 520 em produção:** Memory limit 1GiB e CPU 250m no deployment causam OOMKill nos pods durante geração de PDF (preview consome 1.87GB de pico). Cloudflare devolve 520 enquanto o pod restarta.
7. ✅ Validação/redimensionamento automático no upload do logo da empresa (limite 1200×400 px) para prevenir LayoutError do ReportLab com logos enormes
8. ✅ Endpoint `DELETE /admin/errors/started-orphans` + botão UI para limpar STARTED órfãos sem afetar erros reais
9. 📨 User vai contactar support@emergent.sh para pedir aumento de recursos (Opção A)

## Production Deployment Config (CRÍTICO)
- Memory: **1 GiB** (insuficiente — picos observados 1.87 GiB)
- CPU: **250m** (insuficiente para PDF generation)
- Replicas: 2
- Uvicorn: --workers 1

## Backlog (P1/P2)
- (Aguarda Opção A) **Aumento de recursos do deployment** (pedido a support@emergent.sh)
- (P1) Continuar refactor de `TechnicalReports.jsx` (>10k linhas)
- (P2) Consolidar `overtime_authorizations` + `day_authorizations`
- (P2) Refactor `excel_report.py` e `import_excel.py`
- (P2) OneDrive integration
- (P2) Mobile views
- (P2) WebSockets para notificações tempo real
- (P2) Dashboard de métricas
- (P2) Export Excel/CSV

## Testing
- `/app/backend/tests/test_faturar_viagens_curtas.py` (unit)
- `/app/backend/tests/test_faturar_viagens_curtas_api.py` (E2E)
- `/app/backend/scripts/seed_tarifas_producao.py` (seed das 24 tarifas)
- Iterations: `/app/test_reports/iteration_{33,34}.json`

## Test Credentials
- Admin: `teste@email.com` / `teste`

## Key Files
- `/app/backend/server.py` — main API (4500+ lines)
- `/app/backend/folha_horas_pdf.py` — Folha de Horas PDF generator (with `faturar_viagens_curtas` flag)
- `/app/backend/ot_pdf_report.py` — OT/FS PDF generator (with image fallback)
- `/app/backend/routes/company_info.py` — logo upload com validação de dimensões
- `/app/backend/routes/relatorios.py` — async PDF jobs + GridFS
- `/app/backend/models.py` — Cliente model com `faturar_viagens_curtas`
- `/app/frontend/src/components/TechnicalReports.jsx` — main UI (10k+ lines)
- `/app/frontend/src/components/ErrorLog.jsx` — admin error log com botão Limpar STARTED órfãos
