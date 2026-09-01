# FS AUDIT · FASE 1a — INVENTÁRIO
> Módulo: Relatórios Técnicos (FS / Field Services)
> Base: código + BD preview (contagens em 20 Fev 2026)
> Estado: **read-only**, nada foi alterado.

---

## 1. Ficheiros que compõem o módulo

### 1.1 Backend Python
| Ficheiro | Linhas | Responsabilidade principal |
|---|---:|---|
| `backend/routes/relatorios.py` | 3 790 | Rotas core da FS: CRUD, técnicos, intervenções, fotos, assinaturas, equipamentos, PDF, envio, faturação, cadeia. |
| `backend/routes/services.py` | 515 | Marcações no calendário (`service_appointments`) que geram/associam FS. |
| `backend/routes/cronometros.py` | 188 | Cronómetro por FS × técnico (start/stop/list). |
| `backend/pdf_report.py` | 422 | Geração PDF (folha de horas mensal). ⚠️ Nome enganador — parece FS mas é do módulo timesheet. |
| `backend/manual_pdf.py` | 573 | Manual do utilizador em PDF. **Fora do escopo FS.** |
| `backend/ot_pdf_report.py` | 1 068 | PDF da FS/OT (relatório técnico). **DENTRO do escopo.** |
| `backend/models.py` (extractos) | ~800 (das 858) | Modelos: `RelatorioTecnico`, `IntervencaoRelatorio`, `CronometroOT`, `EquipamentoOT`, `MaterialOT`, `Fotografia*`, `AssinaturaRelatorio`, `FaturacaoIntervencao`, `ServiceAppointment`, `Tarifa`, `Cliente`, `Equipamento`. |
| `backend/routes/equipamentos.py` | (?) | CRUD do catálogo global de equipamentos por cliente. |
| `backend/routes/clientes.py` | (?) | CRUD de clientes. |
| `backend/routes/tabelas_tarifas.py` | (?) | CRUD de tabelas de preço + tarifas. |
| `backend/routes/references.py` | (?) | Tokens de partilha pública de FS (`reference_tokens`). |
| `backend/routes/pedidos_cotacao.py` | (?) | Pedidos de cotação — módulo separado mas ligado à FS. |
| `backend/routes/despesas_internas.py` | (?) | Despesas internas — indirectamente ligado. |
| `backend/routes/relatorios_simples.py` | (?) | ⚠️ "Simples" — provável módulo paralelo, investigar em 1c. |
| `backend/routes/ai.py` | (?) | AI Review da FS (Claude). |

### 1.2 Frontend React
| Ficheiro | Notas |
|---|---|
| `frontend/src/components/TechnicalReports.jsx` | **9 833 linhas** — component monolítico com toda a UI da FS. |
| `frontend/src/components/technical-reports/` | 39 sub-componentes/modais/hooks: `AddFotoPCModal`, `AssinaturaModal`, `ChangeTipoModal`, `ClientsSection`, `CriarContinuidadeModal`, `CronometroPopups`, `CronometroStartModal`, `DeleteClienteModal`, `DeleteConfirmModal`, `DeleteRelatorioModal`, `DespesaModals`, `DespesasEmailModal`, `EditMaterialPCModal`, `EmailModal`, `EmailPCModal`, `EquipamentoModal`, `FSChainBreadcrumb`, `FacturadosSection`, `FaturaScanner`, `FolhaHorasModal`, `FotoModals`, `HideClientPopup`, `IniciarCronoModal`, `IntervencaoModal`, `MaterialModal`, `PDFPreviewModal`, `ReferenciaInternaModal`, `RelAssistModal`, `RelatorioSimplesModal`, `ReportCard`, `ReportsSection`, `StatusChangeModal`, `StatusSearchSection`, `TechnicalReportsHeader`, `TechnicalReportsTabs`, `TecnicoModal`, `hooks/{index,useClientes,useRelatorios}`, `utils/{appearance,errors,labels,pdfJobs,reports}`. |
| `frontend/src/components/FSAIReviewModal.jsx` | Modal da revisão IA. |
| `frontend/src/hooks/useOfflineData.js` | Cache offline para FS/clientes. |

### 1.3 Rota React
Uma única rota SPA:
- **`/technical-reports`** → `TechnicalReports.jsx` (só técnicos autenticados)

---

## 2. Endpoints backend (relatorios.py + services.py + cronometros.py)

### 2.1 `relatorios.py` (44 endpoints)
```
POST   /relatorios-tecnicos                                                 # criar FS
POST   /relatorios-tecnicos/{id}/criar-fs-relacionada                       # continuidade (variante)
GET    /relatorios-tecnicos                                                 # listar (com filtros)
GET    /relatorios-tecnicos/{id}                                            # detalhe
PUT    /relatorios-tecnicos/{id}                                            # editar cabeçalho
DELETE /relatorios-tecnicos/{id}                                            # apagar
PATCH  /relatorios-tecnicos/{id}/status                                     # mudar estado

# Técnicos ligados à FS
GET    /relatorios-tecnicos/{id}/tecnicos
POST   /relatorios-tecnicos/{id}/tecnicos
PUT    /relatorios-tecnicos/{id}/tecnicos/{tid}
DELETE /relatorios-tecnicos/{id}/tecnicos/{tid}

# Intervenções (ABA — Assistência Base A)
GET    /relatorios-tecnicos/{id}/intervencoes
POST   /relatorios-tecnicos/{id}/intervencoes
PUT    /relatorios-tecnicos/{id}/intervencoes/{iid}
DELETE /relatorios-tecnicos/{id}/intervencoes/{iid}

# Fotografias
POST   /relatorios-tecnicos/{id}/fotografias                                # upload
GET    /relatorios-tecnicos/{id}/fotografias                                # listar
GET    /relatorios-tecnicos/{id}/fotografias/{foto_id}/image                # binário (id)
GET    /relatorios-tecnicos/{id}/fotografias/{filename}                     # binário (filename)  ⚠️ ambiguidade
PUT    /relatorios-tecnicos/{id}/fotografias/reorder                        # reordenar drag&drop
PUT    /relatorios-tecnicos/{id}/fotografias/{foto_id}                      # editar descrição
DELETE /relatorios-tecnicos/{id}/fotografias/{foto_id}                      # apagar

# Equipamentos (na FS)
POST   /relatorios-tecnicos/{id}/equipamentos
GET    /relatorios-tecnicos/{id}/equipamentos
PUT    /relatorios-tecnicos/{id}/equipamentos/{eid}
DELETE /relatorios-tecnicos/{id}/equipamentos/{eid}

# Assinaturas
POST   /relatorios-tecnicos/{id}/assinatura-digital                         # legado — via base64
POST   /relatorios-tecnicos/{id}/assinatura-manual                          # legado — só nome
GET    /relatorios-tecnicos/{id}/assinatura                                 # legado — devolve 1
GET    /relatorios-tecnicos/{id}/assinaturas                                # atual — devolve várias
POST   /relatorios-tecnicos/{id}/refresh-assinaturas                        # sincroniza com técnicos activos
PATCH  /relatorios-tecnicos/{id}/assinaturas/{aid}                          # editar (nome/base64)
PUT    /relatorios-tecnicos/{id}/assinaturas/{aid}                          # editar (bulk)
DELETE /relatorios-tecnicos/{id}/assinaturas/{aid}
GET    /relatorios-tecnicos/{id}/assinaturas/{aid}/imagem
GET    /relatorios-tecnicos/{id}/assinatura/imagem                          # legado
DELETE /relatorios-tecnicos/{id}/assinatura                                 # legado

# PDF + envio
POST   /relatorios-tecnicos/{id}/enviar-pdf                                 # gera + envia email
GET    /relatorios-tecnicos/{id}/preview-pdf                                # sync
POST   /relatorios-tecnicos/{id}/preview-pdf-async                          # job background
GET    /pdf-jobs/{job_id}                                                   # estado
GET    /pdf-jobs/{job_id}/download                                          # binário

# Faturação
GET    /relatorios-tecnicos/{id}/faturacao/disponibilidade
POST   /relatorios-tecnicos/{id}/intervencoes/{iid}/facturar
DELETE /relatorios-tecnicos/{id}/intervencoes/{iid}/facturar
GET    /relatorios-tecnicos/{id}/faturacao

# Cadeia (continuidade multi-dia)
GET    /relatorios-tecnicos/{id}/cadeia
POST   /relatorios-tecnicos/{id}/criar-continuidade
```

### 2.2 `services.py` (6 endpoints)
```
POST   /services                        # marca simples
POST   /services/with-ot                # marca + cria FS
GET    /services                        # listar
GET    /services/calendar               # feed do /calendar
PUT    /services/{sid}
DELETE /services/{sid}
```

### 2.3 `cronometros.py` (3 endpoints)
```
POST   /relatorios-tecnicos/{id}/cronometro/iniciar
POST   /relatorios-tecnicos/{id}/cronometro/parar
GET    /relatorios-tecnicos/{id}/cronometros
```

**Total: 53 endpoints no núcleo FS.**

---

## 3. Colecções MongoDB usadas (com contagem em preview)

### 3.1 Núcleo FS
| Colecção | Docs | Status | Notas |
|---|---:|---|---|
| `relatorios_tecnicos` | 12 | ✅ USED | Cabeçalho da FS. |
| `intervencoes_relatorio` | 43 | ✅ USED | Cada máquina/ABA dentro da FS. |
| `tecnicos_relatorio` | 13 | ✅ USED | Técnicos associados a cada FS. |
| `fotos_relatorio` | 28 | ✅ USED | Fotografias por FS. |
| `assinaturas_relatorio` | 25 | ✅ USED | Assinaturas (cliente + técnicos). |
| `cronometros_ot` | 50 | ✅ USED | Cronómetros abertos/fechados. |
| `registos_tecnico_ot` | 64 | ✅ USED | Registos de tempo consolidados (por técnico × código horário × FS). |
| `equipamentos_ot` | 28 | ✅ USED | Snapshots de equipamento associados à FS. |
| `materiais_ot` | 32 | ✅ USED | Materiais consumidos por FS. |
| `despesas_ot` | 2 | ✅ USED (raro) | Despesas anexas (KM, dietas, portagens). Baixa cardinalidade. |
| `faturacao_intervencoes` | 1 | ⚠️ USED (~raro) | Marcações de facturação por intervenção. Uso muito baixo. |
| `pdf_jobs` | 0 | 🟡 UNCERTAIN | Colecção presente, endpoints existem, mas sem docs em preview — investigar em 1c se o async ainda é usado. |
| `service_appointments` | 14 | ✅ USED | Marcações no `/calendar`. |
| `reference_tokens` | 2 | ✅ USED (raro) | Tokens de partilha pública de FS. |

### 3.2 Suporte (usadas mas globais)
| Colecção | Docs | Notas |
|---|---:|---|
| `clientes` | 46 | Global — usado por FS e outros. |
| `equipamentos` | 27 | Catálogo global de equipamentos por cliente. |
| `tabelas_preco` | 5 | Configurações de faturação. |
| `tarifas` | 29 | Preços por código horário × função × tabela. |
| `users` | (não medido) | Global. |
| `company_info` | (não medido) | Global — inserido em headers de PDF. |
| `audit_log` | 3 | Audit multi-módulo, filtragem por entity_type. |
| `app_errors` | (não medido) | Log de erros — não FS-específico. |

### 3.3 🟡 Colecções referenciadas mas potencialmente órfãs
| Colecção | Docs | Notas |
|---|---:|---|
| `equipamentos_relatorio` | **0** | ⚠️ Referenciada em `relatorios.py` mas com 0 docs. Provável duplicado de `equipamentos_ot`. **Validar em 1c.** |
| `materiais_relatorio` | **0** | ⚠️ Modelo `MaterialRelatorio` existe em `models.py`. Zero docs. Provável duplicado de `materiais_ot`. **Validar em 1c.** |
| `fotografias_pc` | **0** | ⚠️ Modal frontend `AddFotoPCModal.jsx` existe. Zero docs. **Validar em 1c** — pode ser feature descontinuada. |
| `relatorios_assistencia` | 26 | ⚠️ Não sei se pertence às FS ou é módulo paralelo (Excel export "Assistências"). **Validar em 1c.** |
| `pedidos_cotacao` | 8 | Provavelmente módulo separado que só cruza com FS na criação. Fora do escopo? Confirmar. |

---

## 4. Estados da FS (`status` em `relatorios_tecnicos`)
Levantamento inicial via `PATCH /status` e via UI. **A confirmar em 1b com transições.**

Estados vistos no código:
- `Pendente`
- `Em Curso`
- `Concluido` / `Concluído`
- `Faturado`
- `Cancelado`
- (?) `Rascunho` — a validar

---

## 5. Duplicações & Ambiguidades detetadas (para investigar em 1c)

1. **`equipamentos_ot`** vs **`equipamentos_relatorio`** — nomes paralelos; a segunda tem 0 docs. Suspeita: renomeação sem limpeza.
2. **`materiais_ot`** vs **`materiais_relatorio`** — igual ao ponto 1.
3. **Assinaturas** — coexistem endpoints singular (`/assinatura`) e plural (`/assinaturas`). O singular é claramente legado (endpoints marcados legado no comment do doc).
4. **Fotografias** — 2 endpoints GET com padrão diferente para imagem (`/{foto_id}/image` e `/{filename}`). Um deve ser legado.
5. **`AddFotoPCModal` + `fotografias_pc`** — 0 docs; investigar se ainda ligado.
6. **`RelatorioSimplesModal` / `routes/relatorios_simples.py`** — módulo paralelo "simples"; não claro se ainda ativo.
7. **`FaturaScanner.jsx`** — investigação; possível protótipo.
8. **`criar-fs-relacionada`** (endpoint 245) e **`criar-continuidade`** (endpoint 3531) — parecem sobrepor-se ("continuidade" da FS). Ambos usados? Legado?

---

## 6. Dependências externas & integrações
- **Email**: aiosmtplib via `SMTP_FROM` (usado por `enviar-pdf`).
- **AI Review**: Claude Sonnet 4.5 via `emergentintegrations` (`routes/ai.py` + `FSAIReviewModal.jsx`).
- **PDF**: ReportLab (`ot_pdf_report.py`).
- **Reverse geocoding**: usado em picagens de tempo, indirecto às FS.
- **Sem OAuth/Stripe/Object Storage** — uploads locais em `/app/backend/uploads/` (⚠️ ephemeral).

---

## 7. Pontos ainda por levantar (irão para 1b)
- Fluxos completos (criar FS → concluir → PDF → email → faturar).
- Regras de negócio de faturação (cálculo, condições).
- Regras dos cronómetros (SA/AC, KM, horas extra, S/D/F, arredondamentos).
- Transições de estado permitidas.
- Permissões por endpoint (`is_admin` vs técnico).
- Notificações e emails gerados por cada acção.
- Interação FS ↔ Timesheet (registos de ponto).
- Cadeia (continuidade multi-dia) — regras exactas.

---

## Notas finais da 1a
- Uploads de assinaturas em pod local (ephemeral) — 🟡 risco em produção.
- Nenhuma alteração de código foi feita.
- Próximo passo: **1b — Fluxos, regras e transições**.
