# Release Checklist

## Publicar

- `backend/config.py`
- `backend/database.py`
- `backend/ot_pdf_report.py`
- `backend/pc_pdf_report.py`
- `backend/server.py`
- `backend/routes/auth_routes.py`
- `frontend/package-lock.json`
- `frontend/src/components/Login.jsx`
- `frontend/src/components/TechnicalReports.jsx`
- `frontend/src/components/technical-reports/index.js`
- `frontend/src/components/technical-reports/ClientsSection.jsx`
- `frontend/src/components/technical-reports/ReportCard.jsx`
- `frontend/src/components/technical-reports/ReportsSection.jsx`
- `frontend/src/components/technical-reports/StatusSearchSection.jsx`
- `frontend/src/components/technical-reports/TechnicalReportsHeader.jsx`
- `frontend/src/components/technical-reports/TechnicalReportsTabs.jsx`
- `frontend/src/components/technical-reports/utils/appearance.js`
- `frontend/src/components/technical-reports/utils/errors.js`
- `frontend/src/components/technical-reports/utils/labels.js`
- `frontend/src/components/technical-reports/utils/reports.js`
- `memory/ARQUITETURA_ESCALABILIDADE.md`

## Nao Publicar

- `backend/.env`
- `frontend/.env.development`
- `backend/backend-dev.log`
- `backend/backend-dev.err.log`
- `backend/backend-export.log`
- `frontend/frontend-dev.log`
- `frontend/frontend-dev.err.log`
- `.venv/`
- `node_modules/`
- `backend/.tmp/`

## Validar Antes Do Deploy

- Login admin funcional
- Criacao e edicao de clientes
- Criacao e visualizacao de FS
- Pesquisa por estado
- Exportar PDF clientes
- Exportar emails clientes
- Exportar base de dados
- Backend responde em `/health`

## Confirmar Manualmente

- Se `backend/tests/test_cronometro_bug_fix.py` deve ser recuperado do zip antigo
- Se os blocos legacy escondidos em `frontend/src/components/TechnicalReports.jsx` podem ser removidos antes de release final
- Se o `.gitignore` do projeto precisa de limpeza antes de commitar

## Ordem Recomendada

1. Rever os ficheiros acima e fechar validacoes locais
2. Commmitar apenas codigo e docs necessarios
3. Fazer push para o GitHub
4. Fazer deploy manual no Emergent
5. Validar online login, clientes, FS e exportacoes
