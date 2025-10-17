# 📋 MODELO DE DADOS - RELATÓRIO TÉCNICO DE ASSISTÊNCIA

**Data:** 17/10/2025  
**Versão:** 1.0  
**Base:** Análise do relatório Kannegiesser

---

## 🗂️ ESTRUTURA COMPLETA DO RELATÓRIO

### 1. IDENTIFICAÇÃO DA ASSISTÊNCIA

```python
class RelatorioTecnico(BaseModel):
    # Identificação
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero_assistencia: int  # Auto-incrementado
    referencia_assistencia: Optional[str] = None  # Referência externa
    status: str  # "rascunho", "em_andamento", "concluido", "enviado"
    
    # Datas
    data_criacao: datetime
    data_servico: date  # Data em que o serviço foi realizado
    data_conclusao: Optional[datetime] = None
    
    # Relações
    cliente_id: str  # FK para clientes
    tecnico_id: str  # FK para users (técnico responsável)
    created_by_id: str  # FK para users (quem criou o relatório)
```

---

### 2. DADOS DO CLIENTE E LOCAL

```python
class DadosClienteRelatorio(BaseModel):
    # Informações básicas do cliente (copiadas do cadastro)
    cliente_nome: str
    cliente_nif: Optional[str]
    cliente_email: Optional[str]
    cliente_telefone: Optional[str]
    
    # Informações específicas da intervenção
    local_intervencao: str  # Ex: "Braga (Lavandaria Binco)"
    morada_intervencao: Optional[str]  # Morada específica do local
    pedido_por: str  # Nome da pessoa que solicitou
    contacto_pedido: Optional[str]  # Telefone/email de quem solicitou
```

---

### 3. EQUIPAMENTO

```python
class Equipamento(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    
    # Identificação do equipamento
    tipologia: str  # Ex: "Dobradora", "Secadora", "Lavadora"
    marca: str  # Ex: "Kannegiesser"
    modelo: str  # Ex: "CPL.M II 35-1/2/4-3KR1-P1-L"
    numero_serie: Optional[str] = None
    ano_fabrico: Optional[int] = None
    
    # Identificação interna (opcional)
    id_equipamento_cliente: Optional[str] = None  # ID que o cliente usa
    localizacao_equipamento: Optional[str] = None  # Onde está no cliente
```

---

### 4. MOTIVO DA ASSISTÊNCIA

```python
class MotivoAssistencia(BaseModel):
    relatorio_id: str
    
    # Descrição do problema
    descricao_problema: str  # Texto longo descrevendo o problema
    sintomas: List[str]  # Lista de sintomas específicos
    
    # Classificação
    tipo_problema: str  # "mecanico", "eletrico", "software", "preventivo"
    prioridade: str  # "baixa", "media", "alta", "urgente"
    
    # Histórico
    problema_recorrente: bool = False
    ultima_intervencao: Optional[date] = None

# Exemplo de uso:
motivo = {
    "descricao_problema": "Quando se abre a porta de acesso do amplificador não é possível fazer reset ao alarme.",
    "sintomas": [
        "A roupa fica mal empilhada",
        "Roupa rejeitada pela lateral",
        "Alarme não reseta após abertura da porta"
    ],
    "tipo_problema": "mecanico",
    "prioridade": "alta"
}
```

---

### 5. COMPONENTES ADICIONAIS (FOTOS)

```python
class ComponenteAdicional(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    
    # Imagem
    imagem_path: str  # Caminho para o arquivo (S3, local, etc)
    imagem_url: Optional[str] = None  # URL pública da imagem
    imagem_thumbnail_path: Optional[str] = None  # Miniatura
    
    # Metadados
    legenda: str  # Ex: "Como estava a empilhar"
    tipo: str  # "problema", "componente", "solucao", "geral"
    ordem: int  # Para manter ordem de exibição
    
    # Upload info
    uploaded_at: datetime
    tamanho_kb: Optional[int] = None
```

---

### 6. RELATÓRIO DA ASSISTÊNCIA (TEXTO LONGO)

```python
class RelatorioAssistenciaTexto(BaseModel):
    relatorio_id: str
    
    # Diagnóstico
    diagnostico: str  # O que foi encontrado/identificado
    
    # Ações realizadas
    acoes_realizadas: str  # Descrição detalhada do que foi feito
    
    # Resolução
    resolucao: str  # Como foi resolvido
    problema_resolvido: bool
    
    # Observações
    observacoes_tecnico: Optional[str] = None
    recomendacoes: Optional[str] = None  # Recomendações futuras
    
    # Verificação
    verificacao_pos_reparacao: Optional[str] = None
    teste_realizado: bool = False
    
    # Próximos passos
    requer_followup: bool = False
    proximos_passos: Optional[str] = None

# Exemplo de uso:
relatorio = {
    "diagnostico": "O amplificador estava 7cm abaixo do ideal. Porta de segurança com falha no reset.",
    "acoes_realizadas": "Amplificador levantado 7cm. Shunt de segurança ponteado para evitar desligamentos.",
    "resolucao": "Sistema operacional. Cliente informado sobre procedimento de segurança.",
    "problema_resolvido": True,
    "observacoes_tecnico": "Roupas rejeitadas por dimensão excessiva - problema separado, requer análise adicional",
    "teste_realizado": True
}
```

---

### 7. PEÇAS/MATERIAIS

```python
class PecaMaterial(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    
    # Identificação da peça
    designacao: str  # Nome/descrição da peça
    codigo_peca: Optional[str] = None  # Código interno ou do fabricante
    referencia_fabricante: Optional[str] = None
    
    # Quantidade e valores
    quantidade: float
    unidade: str = "un"  # "un", "m", "kg", "l", etc
    
    # Preços (opcional - para faturação)
    preco_unitario: Optional[float] = None
    preco_total: Optional[float] = None
    
    # Classificação
    tipo: str  # "peca_nova", "peca_usada", "consumivel", "material"
    origem: str  # "stock", "fornecedor", "cliente"
    
    # Ordem (para manter sequência no relatório)
    ordem: int = 0

# Exemplo de uso:
pecas = [
    {
        "designacao": "Shunt de segurança vermelho",
        "codigo_peca": "KAN-SH-001",
        "quantidade": 1,
        "preco_unitario": 45.00,
        "tipo": "peca_nova"
    },
    {
        "designacao": "Parafusos M8x20",
        "quantidade": 4,
        "tipo": "consumivel"
    }
]
```

---

### 8. MÃO DE OBRA / DESLOCAÇÃO

```python
class MaoObraDeslocacao(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    
    # Técnico
    tecnico_id: str  # FK para users
    tecnico_nome: str  # Nome do técnico (copiado para facilitar)
    
    # Tempo
    horas_trabalhadas: float
    data_trabalho: date
    hora_inicio: Optional[time] = None
    hora_fim: Optional[time] = None
    
    # Deslocação
    deslocacao_km: Optional[float] = None
    deslocacao_origem: Optional[str] = None
    deslocacao_destino: Optional[str] = None
    deslocacao_custo: Optional[float] = None
    
    # Código/Tipo de horário
    codigo_horario: str  # "1", "2", "S", "D"
    # 1 = Dias úteis (07H-19H)
    # 2 = Dias úteis (19H-07H)
    # S = Sábado
    # D = Domingos/Feriados
    
    # Detalhamento adicional
    horario_sabado: float = 0  # Horas em sábado
    horario_domingo_feriado: float = 0  # Horas em domingo/feriado
    horario_dias_uteis_diurno: float = 0  # 07H-19H
    horario_dias_uteis_noturno: float = 0  # 19H-07H
    
    # Custos (opcional)
    custo_hora: Optional[float] = None
    custo_total_mao_obra: Optional[float] = None

# Exemplo de uso:
mao_obra = {
    "tecnico_nome": "Pedro",
    "horas_trabalhadas": 6,
    "data_trabalho": "2025-10-16",
    "codigo_horario": "1",
    "horario_dias_uteis_diurno": 4,
    "horario_dias_uteis_noturno": 2,
    "deslocacao_km": 45.5,
    "deslocacao_origem": "Lisboa",
    "deslocacao_destino": "Braga"
}
```

---

### 9. ASSINATURAS

```python
class Assinatura(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    
    # Tipo de assinatura
    tipo: str  # "tecnico" ou "cliente"
    
    # Dados da pessoa
    nome: str
    cargo: Optional[str] = None
    
    # Assinatura
    assinatura_path: str  # Caminho para imagem da assinatura
    assinatura_base64: Optional[str] = None  # Base64 da assinatura
    metodo: str  # "digital" (canvas) ou "manual" (foto/upload)
    
    # Metadata
    data_assinatura: datetime
    ip_address: Optional[str] = None
    dispositivo: Optional[str] = None

# Campos na tabela principal RelatorioTecnico:
assinatura_tecnico_id: Optional[str] = None
assinatura_cliente_id: Optional[str] = None
assinado_em: Optional[datetime] = None
```

---

### 10. DECLARAÇÃO E TERMOS

```python
class Declaracao(BaseModel):
    relatorio_id: str
    
    # Texto da declaração
    texto_declaracao: str
    # Exemplo: "Declaro que aceito os trabalhos acima descritos e que tudo 
    # foi efetuado de acordo com a folha de assistência."
    
    # Aceite
    aceite_cliente: bool = False
    data_aceite: Optional[datetime] = None
    
    # Observações do cliente
    observacoes_cliente: Optional[str] = None
```

---

### 11. GERAÇÃO E ENVIO DE PDF

```python
class PDFRelatorio(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    
    # Arquivo PDF
    pdf_path: str
    pdf_url: Optional[str] = None
    pdf_tamanho_kb: Optional[int] = None
    
    # Metadados
    versao: int = 1  # Para controlar versões do PDF
    gerado_em: datetime
    gerado_por_id: str  # FK para users
    
    # Template usado
    template_nome: str = "default"
    template_versao: str = "1.0"

class EnvioEmail(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    pdf_id: str
    
    # Destinatários
    emails_destinatarios: List[str]  # Lista de emails
    emails_cc: Optional[List[str]] = None
    emails_bcc: Optional[List[str]] = None
    
    # Conteúdo
    assunto: str
    corpo_email: str
    
    # Status
    status: str  # "pendente", "enviado", "erro"
    enviado_em: Optional[datetime] = None
    erro_mensagem: Optional[str] = None
    
    # Rastreamento
    enviado_por_id: str  # FK para users
```

---

## 🗄️ ESTRUTURA SQL COMPLETA

```sql
-- Tabela principal de relatórios
CREATE TABLE relatorios_tecnicos (
    id VARCHAR(36) PRIMARY KEY,
    numero_assistencia INT AUTO_INCREMENT UNIQUE,
    referencia_assistencia VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'rascunho',
    
    -- Datas
    data_criacao DATETIME NOT NULL,
    data_servico DATE NOT NULL,
    data_conclusao DATETIME,
    
    -- Relações
    cliente_id VARCHAR(36) NOT NULL,
    tecnico_id VARCHAR(36) NOT NULL,
    created_by_id VARCHAR(36) NOT NULL,
    
    -- Dados do cliente (snapshot)
    cliente_nome VARCHAR(255) NOT NULL,
    cliente_nif VARCHAR(20),
    cliente_email VARCHAR(255),
    cliente_telefone VARCHAR(50),
    
    -- Local de intervenção
    local_intervencao VARCHAR(255) NOT NULL,
    morada_intervencao TEXT,
    pedido_por VARCHAR(255) NOT NULL,
    contacto_pedido VARCHAR(100),
    
    -- Timestamps
    updated_at DATETIME,
    
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (tecnico_id) REFERENCES users(id),
    FOREIGN KEY (created_by_id) REFERENCES users(id),
    
    INDEX idx_numero(numero_assistencia),
    INDEX idx_cliente(cliente_id),
    INDEX idx_tecnico(tecnico_id),
    INDEX idx_data_servico(data_servico),
    INDEX idx_status(status)
);

-- Equipamentos
CREATE TABLE relatorios_equipamentos (
    id VARCHAR(36) PRIMARY KEY,
    relatorio_id VARCHAR(36) NOT NULL,
    
    tipologia VARCHAR(100) NOT NULL,
    marca VARCHAR(100) NOT NULL,
    modelo VARCHAR(255) NOT NULL,
    numero_serie VARCHAR(100),
    ano_fabrico INT,
    
    id_equipamento_cliente VARCHAR(100),
    localizacao_equipamento VARCHAR(255),
    
    FOREIGN KEY (relatorio_id) REFERENCES relatorios_tecnicos(id) ON DELETE CASCADE
);

-- Motivo da assistência
CREATE TABLE relatorios_motivos (
    id VARCHAR(36) PRIMARY KEY,
    relatorio_id VARCHAR(36) NOT NULL UNIQUE,
    
    descricao_problema TEXT NOT NULL,
    sintomas JSON,  -- Array de strings
    
    tipo_problema VARCHAR(50),
    prioridade VARCHAR(20),
    
    problema_recorrente BOOLEAN DEFAULT FALSE,
    ultima_intervencao DATE,
    
    FOREIGN KEY (relatorio_id) REFERENCES relatorios_tecnicos(id) ON DELETE CASCADE
);

-- Fotos/Componentes adicionais
CREATE TABLE relatorios_fotos (
    id VARCHAR(36) PRIMARY KEY,
    relatorio_id VARCHAR(36) NOT NULL,
    
    imagem_path VARCHAR(500) NOT NULL,
    imagem_url VARCHAR(500),
    imagem_thumbnail_path VARCHAR(500),
    
    legenda TEXT,
    tipo VARCHAR(50),
    ordem INT DEFAULT 0,
    
    uploaded_at DATETIME NOT NULL,
    tamanho_kb INT,
    
    FOREIGN KEY (relatorio_id) REFERENCES relatorios_tecnicos(id) ON DELETE CASCADE,
    INDEX idx_ordem(relatorio_id, ordem)
);

-- Relatório (texto longo)
CREATE TABLE relatorios_textos (
    id VARCHAR(36) PRIMARY KEY,
    relatorio_id VARCHAR(36) NOT NULL UNIQUE,
    
    diagnostico TEXT,
    acoes_realizadas TEXT,
    resolucao TEXT,
    problema_resolvido BOOLEAN DEFAULT FALSE,
    
    observacoes_tecnico TEXT,
    recomendacoes TEXT,
    verificacao_pos_reparacao TEXT,
    teste_realizado BOOLEAN DEFAULT FALSE,
    
    requer_followup BOOLEAN DEFAULT FALSE,
    proximos_passos TEXT,
    
    FOREIGN KEY (relatorio_id) REFERENCES relatorios_tecnicos(id) ON DELETE CASCADE
);

-- Peças e Materiais
CREATE TABLE relatorios_pecas (
    id VARCHAR(36) PRIMARY KEY,
    relatorio_id VARCHAR(36) NOT NULL,
    
    designacao VARCHAR(255) NOT NULL,
    codigo_peca VARCHAR(100),
    referencia_fabricante VARCHAR(100),
    
    quantidade DECIMAL(10,2) NOT NULL,
    unidade VARCHAR(10) DEFAULT 'un',
    
    preco_unitario DECIMAL(10,2),
    preco_total DECIMAL(10,2),
    
    tipo VARCHAR(50),
    origem VARCHAR(50),
    ordem INT DEFAULT 0,
    
    FOREIGN KEY (relatorio_id) REFERENCES relatorios_tecnicos(id) ON DELETE CASCADE,
    INDEX idx_ordem(relatorio_id, ordem)
);

-- Mão de obra e deslocação
CREATE TABLE relatorios_mao_obra (
    id VARCHAR(36) PRIMARY KEY,
    relatorio_id VARCHAR(36) NOT NULL,
    
    tecnico_id VARCHAR(36) NOT NULL,
    tecnico_nome VARCHAR(255) NOT NULL,
    
    horas_trabalhadas DECIMAL(5,2) NOT NULL,
    data_trabalho DATE NOT NULL,
    hora_inicio TIME,
    hora_fim TIME,
    
    deslocacao_km DECIMAL(10,2),
    deslocacao_origem VARCHAR(255),
    deslocacao_destino VARCHAR(255),
    deslocacao_custo DECIMAL(10,2),
    
    codigo_horario VARCHAR(10),
    horario_sabado DECIMAL(5,2) DEFAULT 0,
    horario_domingo_feriado DECIMAL(5,2) DEFAULT 0,
    horario_dias_uteis_diurno DECIMAL(5,2) DEFAULT 0,
    horario_dias_uteis_noturno DECIMAL(5,2) DEFAULT 0,
    
    custo_hora DECIMAL(10,2),
    custo_total_mao_obra DECIMAL(10,2),
    
    FOREIGN KEY (relatorio_id) REFERENCES relatorios_tecnicos(id) ON DELETE CASCADE,
    FOREIGN KEY (tecnico_id) REFERENCES users(id)
);

-- Assinaturas
CREATE TABLE relatorios_assinaturas (
    id VARCHAR(36) PRIMARY KEY,
    relatorio_id VARCHAR(36) NOT NULL,
    
    tipo VARCHAR(20) NOT NULL,  -- 'tecnico' ou 'cliente'
    nome VARCHAR(255) NOT NULL,
    cargo VARCHAR(100),
    
    assinatura_path VARCHAR(500) NOT NULL,
    assinatura_base64 LONGTEXT,
    metodo VARCHAR(20),
    
    data_assinatura DATETIME NOT NULL,
    ip_address VARCHAR(45),
    dispositivo VARCHAR(255),
    
    FOREIGN KEY (relatorio_id) REFERENCES relatorios_tecnicos(id) ON DELETE CASCADE,
    INDEX idx_tipo(relatorio_id, tipo)
);

-- PDFs gerados
CREATE TABLE relatorios_pdfs (
    id VARCHAR(36) PRIMARY KEY,
    relatorio_id VARCHAR(36) NOT NULL,
    
    pdf_path VARCHAR(500) NOT NULL,
    pdf_url VARCHAR(500),
    pdf_tamanho_kb INT,
    
    versao INT DEFAULT 1,
    gerado_em DATETIME NOT NULL,
    gerado_por_id VARCHAR(36) NOT NULL,
    
    template_nome VARCHAR(100),
    template_versao VARCHAR(20),
    
    FOREIGN KEY (relatorio_id) REFERENCES relatorios_tecnicos(id) ON DELETE CASCADE,
    FOREIGN KEY (gerado_por_id) REFERENCES users(id),
    INDEX idx_versao(relatorio_id, versao)
);

-- Envios de email
CREATE TABLE relatorios_envios_email (
    id VARCHAR(36) PRIMARY KEY,
    relatorio_id VARCHAR(36) NOT NULL,
    pdf_id VARCHAR(36) NOT NULL,
    
    emails_destinatarios JSON NOT NULL,
    emails_cc JSON,
    emails_bcc JSON,
    
    assunto VARCHAR(500),
    corpo_email TEXT,
    
    status VARCHAR(20) DEFAULT 'pendente',
    enviado_em DATETIME,
    erro_mensagem TEXT,
    
    enviado_por_id VARCHAR(36) NOT NULL,
    
    FOREIGN KEY (relatorio_id) REFERENCES relatorios_tecnicos(id) ON DELETE CASCADE,
    FOREIGN KEY (pdf_id) REFERENCES relatorios_pdfs(id),
    FOREIGN KEY (enviado_por_id) REFERENCES users(id)
);
```

---

## 📊 RESUMO DE CAMPOS POR SEÇÃO

### Campos Obrigatórios (*)
- Número da Assistência *
- Cliente *
- Técnico *
- Data do Serviço *
- Local de Intervenção *
- Pedido por *
- Equipamento (Tipologia, Marca, Modelo) *
- Motivo da Assistência *
- Horas de Trabalho *

### Campos Opcionais
- Referência Assistência
- Número de Série
- Ano de Fabrico
- Fotos
- Peças/Materiais
- Deslocação
- Observações

### Campos Automáticos
- ID
- Data de Criação
- Número da Assistência (auto-increment)
- Timestamps

---

## 🎯 PRÓXIMOS PASSOS PARA IMPLEMENTAÇÃO

1. **Backend:**
   - Criar modelos Pydantic
   - Implementar endpoints CRUD
   - Sistema de upload de imagens
   - Geração de PDF
   - Sistema de assinaturas

2. **Frontend:**
   - Formulário multi-step
   - Upload de fotos
   - Canvas para assinaturas
   - Preview de PDF
   - Interface de envio de email

3. **Integrações:**
   - Storage (S3 ou local)
   - Geração de PDF (ReportLab)
   - Envio de email (SMTP)

---

**Modelo completo e pronto para implementação!** 🎉
