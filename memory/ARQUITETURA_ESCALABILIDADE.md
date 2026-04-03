# Arquitetura e Escalabilidade - HWI

## Resumo Executivo

O sistema HWI esta organizado como um monolito full-stack com frontend React e backend FastAPI sobre MongoDB. A aplicacao resolve bem o dominio principal de:

- gestao de relatorios tecnicos
- registo de ponto
- ferias, faltas e autorizacoes
- notificacoes e operacao mobile

O maior risco de escala nao esta na stack em si. Esta na concentracao excessiva de responsabilidades em poucos ficheiros, no acoplamento direto entre rotas e base de dados, e na execucao de tarefas pesadas e background jobs no mesmo processo da API.

## Arquitetura Atual

### Frontend

- Stack principal: React 19 + Create React App + CRACO + Tailwind + Radix
- Router central em `frontend/src/App.js`
- Autenticacao baseada em JWT guardado em `localStorage`
- Modulo critico em `frontend/src/components/TechnicalReports.jsx`
- Suporte offline com IndexedDB em `frontend/src/hooks/useOfflineData.js`

### Backend

- Stack principal: FastAPI + Motor + MongoDB
- Entrada principal em `backend/server.py`
- Modelos Pydantic centralizados em `backend/models.py`
- Modulos auxiliares para calculo de horas, PDF, importacao e notificacoes
- Algumas rotas novas ja foram extraidas para `backend/routes/`, mas a maior parte continua em `server.py`

### Dados

- MongoDB usado de forma documental, com acesso direto a colecoes
- Criacao de indices no startup da aplicacao
- Uploads e ficheiros gerados guardados no filesystem local

## Fluxo Funcional Principal

1. O frontend autentica o utilizador e guarda token e perfil localmente.
2. O cliente consome a API via Axios apontando para `${REACT_APP_BACKEND_URL}/api`.
3. O backend valida autenticacao, executa logica de negocio e acede diretamente ao Mongo.
4. Para relatorios tecnicos, o backend agrega:
   - clientes
   - equipamentos
   - tecnicos
   - intervencoes
   - materiais
   - despesas
   - fotografias
   - assinaturas
   - PDF final
5. Algumas tarefas paralelas, como notificacoes, arrancam no startup do backend.

## Pontos Fortes

- A stack e produtiva e simples de operar.
- O dominio esta bem refletido nos nomes das entidades e modulos.
- Ha preocupacao com indices, migracoes e modularizacao incremental.
- Existe um primeiro passo serio para funcionamento offline no frontend.
- O produto parece muito orientado ao contexto operacional real da equipa tecnica.

## Gargalos de Escala

### 1. Backend monolitico por ficheiro

O ficheiro `backend/server.py` tem cerca de 10k linhas e acumula:

- configuracao da app
- autenticacao
- startup e migracoes
- CRUD de varios dominios
- notificacoes
- relatorios
- uploads
- logica de negocio

Isto aumenta muito:

- risco de regressao
- tempo de onboarding
- dificuldade de testes
- dificuldade de paralelizar desenvolvimento

### 2. Frontend concentrado num componente gigante

O ficheiro `frontend/src/components/TechnicalReports.jsx` tem mais de 11k linhas e cerca de 183 `useState(...)`.

Esse componente mistura:

- orquestracao da pagina
- estado de cliente
- estado de relatorio
- estado de modais
- upload de ficheiros
- sincronizacao offline
- filtros
- acoes de negocio

Escalar novas funcionalidades aqui vai ficar cada vez mais lento e fragil.

### 3. Sem camada de servicos/repositorios

Grande parte das rotas acede diretamente ao `db.<colecao>` e aplica regras de negocio no endpoint.

Consequencias:

- regras duplicadas
- baixa reutilizacao
- testes unitarios dificeis
- alto acoplamento com MongoDB

### 4. Background jobs no mesmo processo da API

O startup cria tarefas assicronas de notificacao no mesmo processo web.

Riscos ao escalar:

- comportamento inconsistente com varios replicas
- duplicacao de jobs
- dificuldade de observabilidade
- dependencia do ciclo de vida do servidor web

### 5. Geração de PDF e ficheiros no request path

PDFs, folhas de horas, anexos e imagens sao gerados/servidos pela API principal.

Riscos:

- requests longos
- alto consumo de CPU/memoria
- degradacao do throughput da API
- acoplamento forte ao filesystem local

### 6. File storage local

O sistema usa diretorios locais de uploads. Isso funciona em single instance, mas falha ao escalar horizontalmente sem volume partilhado.

### 7. Indices e queries ainda reativos

Existem indices criados no startup, o que e positivo, mas a estrategia ainda parece reativa. Falta:

- inventario formal de queries criticas
- medicao de latencia por endpoint
- paginacao consistente
- projection fields mais agressivos

### 8. Testes insuficientes para o tamanho do dominio

Existem poucos testes face ao volume funcional do sistema. O risco nao esta so em bugs novos, mas tambem em travar refatoracao necessaria.

## Arquitetura-Alvo Recomendada

### Backend

Separar por dominios com 4 camadas simples:

1. `routes/`
   Recebem requests, validam input, devolvem resposta HTTP.
2. `services/`
   Encapsulam regras de negocio.
3. `repositories/`
   Encapsulam acesso a MongoDB.
4. `schemas/` ou `models/`
   Definem contratos Pydantic.

Dominios sugeridos:

- auth
- users
- clientes
- equipamentos
- relatorios_tecnicos
- intervencoes
- materiais_despesas
- time_entries
- vacations_absences
- notifications
- services_calendar
- public_links

### Frontend

Separar a area de relatorios tecnicos em:

- `pages/` ou screens
- hooks de dominio
- componentes de apresentacao
- adapters de API
- estado de formularios isolado por modulo

Sugestao minima:

- `features/technical-reports/api`
- `features/technical-reports/hooks`
- `features/technical-reports/components`
- `features/technical-reports/modals`
- `features/technical-reports/utils`

### Infraestrutura

Separar 3 responsabilidades:

1. API web
2. worker de jobs assincros
3. armazenamento de ficheiros externo

## Melhorias Prioritarias para Escalar

### Fase 1 - Reduzir risco estrutural

- Extrair os dominios mais ativos de `backend/server.py` para routers e services
- Extrair a logica de `TechnicalReports.jsx` para hooks e subcomponentes
- Criar um modulo unico de cliente HTTP no frontend
- Introduzir DTOs/responses mais consistentes
- Definir naming e ownership por dominio

### Fase 2 - Tornar a app observavel

- Adicionar logging estruturado por request
- Adicionar correlation id
- Medir latencia por endpoint
- Medir duracao de geracao de PDF
- Criar dashboard basico de erros e performance

### Fase 3 - Escala operacional

- Mover jobs de notificacao para worker dedicado
- Mover PDFs pesados e exportacoes para job assincro
- Guardar uploads em S3 ou equivalente
- Servir downloads a partir de object storage
- Garantir idempotencia de jobs e retries

### Fase 4 - Escala de dados

- Rever colecoes mais criticas e criar plano de indices baseado em uso real
- Adicionar paginacao em listas grandes
- Reduzir payloads com projections
- Criar read models para ecras pesados, se necessario

### Fase 5 - Escala de equipa

- Criar testes de contrato para endpoints criticos
- Criar testes de integracao por dominio
- Criar fixtures e factories de dados
- Documentar fluxos principais de negocio
- Definir estrategia de migracoes sem logica embebida no startup

## Sequencia Recomendada de Execucao

### Sprint 1

- Isolar `relatorios-tecnicos` no backend
- Isolar `TechnicalReports.jsx` no frontend
- Criar `services/` e `repositories/` base
- Normalizar respostas de erro

### Sprint 2

- Extrair time entries e notifications do monolito
- Introduzir job runner para tarefas demoradas
- Externalizar uploads

### Sprint 3

- Melhorar observabilidade
- Fortalecer testes
- Rever queries e indices com base em metricas reais

## Decisoes que Eu Nao Mudaria Ja

- Nao migraria para microservicos agora.
- Nao trocaria MongoDB sem prova concreta de limite.
- Nao reescreveria o frontend inteiro.

O maior ganho neste momento vem de modularizar o monolito, separar responsabilidades e preparar a infraestrutura para horizontal scaling.

## Indicadores de Sucesso

- tempo medio de resposta dos endpoints criticos
- tempo de geracao de PDF
- numero de regressões por release
- cobertura de testes dos dominios criticos
- tempo medio para adicionar uma nova feature
- capacidade de correr varios replicas sem side effects

## Conclusao

O projeto esta numa fase tipica de produto que cresceu com urgencia real de negocio e agora precisa de consolidacao tecnica. A base e recuperavel e tem valor. O foco certo nao e reescrever. E modularizar, medir, desacoplar jobs e preparar storage e processamento para crescer com seguranca.
