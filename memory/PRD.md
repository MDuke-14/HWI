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
10. ✅ Regras SA/AC unificadas Feb/2026: SA binário (≥4h=10€), AC tiered (4-6h=25€, ≥6h=50€). Helper `calcular_sa_ac` em time_entries.py + 10 testes unitários
11. ✅ Fix scroll bloqueado nos modais de Cliente — adicionado `max-h-[90vh] overflow-y-auto`
12. ✅ Sistema de autorizações refactor: emails para geral@hwi.pt em vez de push notifications aos admin; link para portal admin; periodos de ponto incluídos no email e na UI; fix do bug do botão Aprovar/Rejeitar (response.data.status check); fix do import process_authorization_decision em routes/overtime.py
13. ✅ Cleanup de código morto (9 ficheiros eliminados, 15+ bugs latentes corrigidos em `relatorios.py`, `time_entries.py`, etc.)
14. ✅ **Refactor TechnicalReports.jsx (Feb 2026)** — extração de 8 novos modais para `/app/frontend/src/components/technical-reports/`: `AddFotoPCModal`, `EmailPCModal`, `HideClientPopup`, `EditMaterialPCModal`, `ChangeTipoModal`, `DeleteClienteModal`, `ReferenciaInternaModal`, `IniciarCronoModal`. Reduzido de 10100 → ~9650 linhas (-450). Adicionalmente corrigidos 2 bugs latentes (`fetchRegistosTecnicosOT` → `fetchRegistosTecnicos`, `fetchMateriaisRelatorio` → `fetchMateriais`).
15. ✅ **Relatório Simples (Feb 2026)** — nova feature: relatório profissional sem fotografias, estilo Word.
    - Botão "Relatório Simples" em cada card de FS (lista) + modal de visualização (desktop+mobile).
    - Modal full-screen: editor estilo Word com formatação simples (negrito/itálico/sublinhado/listas), secções dinâmicas (adicionar/remover/reordenar), título do relatório, opção de incluir equipamentos da FS (Marca/Modelo/Nº Série).
    - Pré-visualização A4 lado-a-lado em tempo real.
    - Persistência: 1 versão por FS (upsert). Endpoints `GET/POST/DELETE /api/relatorios-simples/by-fs/{id}` + `GET /api/relatorios-simples/by-fs/{id}/pdf` + `GET /api/relatorios-simples/by-fs/{id}/equipamentos`.
    - Geração PDF com header de logo (igual restantes documentos), cliente, título centrado, secções, tabela equipamentos (3 colunas), rodapé com data + nome do técnico.
    - Novos ficheiros: `models.py` (RelatorioSimples + RelatorioSimplesUpsert), `routes/relatorios_simples.py`, `relatorio_simples_pdf.py`, `technical-reports/RelatorioSimplesModal.jsx`.
16. ✅ **Auth fix + Vacations filter (Feb 2026)** — eliminado utilizador duplicado em `users`; passwords reset para `miguel` (`Miguel123!`) e `teste@email.com` (`Admin123!`). Filtro `include_past` (default false) em `/vacations/my-requests` e `/admin/vacations/all-balances` esconde férias gozadas de anos anteriores. Toggles UI 'Mostrar/Esconder anos anteriores' nas secções Meus Pedidos + Admin.
18. ✅ **Vacation balance dinâmico (Feb 2026)** — `GET /vacations/balance` (user) e `GET /admin/vacations/all-balances` (admin) recalculam `days_earned`/`days_taken`/`days_available` on-the-fly usando `helpers.calculate_vacation_days_by_year()` + carry-over anual via `db.vacation_taken_by_year`. A coleção `vacation_balances` passa a ser usada apenas para `company_start_date` — valores agregados eram estáticos (ex.: 22 dias para user que entrou em Nov/2025) e agora seguem a regra legal de 2 dias/mês trabalhado com máximo de 22/ano. Valida: Chelson (start 2025-11-13, hoje Jul/2026) = 2 (2025) + 14 (2026) = 16.

17. ✅ **Saída por Ordem da Empresa (Feb 2026)** — quando o colaborador faz a 2ª picagem e tenta fechar o ponto com total < 8h, aparece checkbox "Saída por Ordem da Empresa" no Dashboard.
    - Sem checkbox: ponto fecha normalmente sem aprovação.
    - Com checkbox: ponto fecha + email automático ao admin com mesmo template/fluxo das horas extra (`request_type="early_leave"` em `overtime_authorizations`).
    - Admin aprova: sistema cria entry virtual de crédito (`is_early_leave_credit=true`) com observação rastreável para perfazer 8h.
    - Admin rejeita: mantém-se as horas efetivamente trabalhadas.
    - SessionStorage partilhada Dashboard ↔ MobileLayout para mobile usar a mesma flag.
    - Files: `models.py` (TimeEntryEnd campo `early_leave_company_order`), `routes/time_entries.py`, `notifications_scheduler.py` (handler `early_leave` + helper `create_early_leave_authorization`), `Dashboard.jsx`, `mobile/MobileLayout.jsx`.

## Production Deployment Config (CRÍTICO)
- Memory: **1 GiB** (insuficiente — picos observados 1.87 GiB)
- CPU: **250m** (insuficiente para PDF generation)
- Replicas: 2
- Uvicorn: --workers 1

## Backlog (P1/P2)
- (Aguarda Opção A) **Aumento de recursos do deployment** (pedido a support@emergent.sh)
- (P1) Continuar refactor de `TechnicalReports.jsx` (~9650 linhas; modais grandes ainda inline: `showViewRelatorioModal` ~1500 linhas, `showHTMLPreviewModal` ~500, `showAddRegistoManualModal`/`showEditRegistoModal` ~700, Add/Edit/View Cliente ~600)
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
