"""
Todos os modelos Pydantic da aplicação HWI.
Centralizado para evitar duplicação e facilitar manutenção.
"""
from pydantic import BaseModel, Field, ConfigDict, EmailStr, field_validator
from typing import List, Optional
from datetime import datetime, timezone, date
import uuid


# ============ Auth Models ============

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    email: EmailStr
    hashed_password: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    is_admin: bool = False
    must_change_password: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    username: str
    password: str
    email: EmailStr
    phone: str
    full_name: Optional[str] = None
    company_start_date: Optional[str] = None
    vacation_days_taken: int = 0

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    is_admin: Optional[bool] = None
    tipo_colaborador: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


# ============ Cliente & Equipamento ============

class Cliente(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nome: str
    email: Optional[str] = None
    telefone: Optional[str] = None
    morada: Optional[str] = None
    nif: Optional[str] = None
    emails_adicionais: Optional[str] = None
    incluir_referencia_interna: Optional[bool] = False
    ativo: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Equipamento(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    cliente_id: str
    tipologia: Optional[str] = None
    marca: str
    modelo: str
    numero_serie: Optional[str] = None
    ano_fabrico: Optional[str] = None
    horas_funcionamento: Optional[str] = None
    ativo: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_used: Optional[datetime] = None


# ============ Relatório Técnico (FS) ============

class RelatorioTecnico(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero_assistencia: Optional[int] = None
    referencia_assistencia: Optional[str] = None
    status: str = "em_execucao"
    data_criacao: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    data_servico: date
    data_fim: Optional[date] = None
    data_conclusao: Optional[datetime] = None

    @field_validator('data_fim', mode='before')
    @classmethod
    def validate_data_fim(cls, v):
        if v == '' or v is None:
            return None
        return v

    cliente_id: str
    created_by_id: str
    cliente_nome: str
    local_intervencao: str
    pedido_por: str
    contacto_pedido: Optional[str] = None
    equipamento_tipologia: Optional[str] = None
    equipamento_marca: Optional[str] = None
    equipamento_modelo: Optional[str] = None
    equipamento_numero_serie: Optional[str] = None
    equipamento_ano_fabrico: Optional[str] = None
    equipamento_horas_funcionamento: Optional[str] = None
    motivo_assistencia: str
    referencia_interna_cliente: Optional[str] = None
    km_inicial: Optional[float] = None
    ot_relacionada_id: Optional[str] = None
    diagnostico: Optional[str] = None
    acoes_realizadas: Optional[str] = None
    resolucao: Optional[str] = None
    problema_resolvido: bool = False
    relatorio_assistencia: Optional[str] = None

class RelatorioTecnicoCreate(BaseModel):
    cliente_id: str
    data_servico: date
    data_fim: Optional[date] = None
    local_intervencao: str
    pedido_por: str
    contacto_pedido: Optional[str] = None
    km_inicial: Optional[float] = None
    ot_relacionada_id: Optional[str] = None
    equipamento_tipologia: Optional[str] = None
    equipamento_marca: Optional[str] = None
    equipamento_modelo: Optional[str] = None
    equipamento_numero_serie: Optional[str] = None
    equipamento_ano_fabrico: Optional[str] = None
    equipamento_horas_funcionamento: Optional[str] = None
    motivo_assistencia: str


# ============ Sub-recursos do Relatório ============

class TecnicoRelatorio(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    tecnico_id: Optional[str] = None
    tecnico_nome: str
    minutos_cliente: int = 0
    kms_inicial: float = 0
    kms_final: float = 0
    kms_inicial_volta: float = 0
    kms_final_volta: float = 0
    kms_deslocacao: float = 0
    tipo_horario: str
    tipo_registo: str = "manual"
    funcao_ot: str = "tecnico"
    data_trabalho: date
    hora_inicio: Optional[str] = None
    hora_fim: Optional[str] = None
    incluir_pausa: bool = False
    ordem: int = 0

class CronometroOT(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    tecnico_id: str
    tecnico_nome: str
    tipo: str
    funcao_ot: str = "tecnico"
    km_inicial: float = 0
    hora_inicio: datetime
    ativo: bool = True

class RegistoTecnicoOT(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    tecnico_id: str
    tecnico_nome: str
    tipo: str
    funcao_ot: str = "tecnico"
    data: date
    hora_inicio_segmento: datetime
    hora_fim_segmento: datetime
    horas_arredondadas: float
    km: float
    codigo: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EquipamentoOT(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    equipamento_cliente_id: Optional[str] = None
    tipologia: str
    marca: str
    modelo: str
    numero_serie: Optional[str] = None
    ano_fabrico: Optional[str] = None
    horas_funcionamento: Optional[str] = None
    ordem: int = 0

class MaterialOT(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    descricao: str
    quantidade: int
    unidade: Optional[str] = "Un"
    fornecido_por: str
    data_utilizacao: Optional[str] = None
    pc_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DespesaOT(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    tipo: str = "outras"
    descricao: str
    valor: float
    tecnico_id: str
    tecnico_nome: str
    data: str
    numero_fatura: Optional[str] = None
    data_fatura: Optional[str] = None
    factura_data: Optional[str] = None
    factura_filename: Optional[str] = None
    factura_mimetype: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str

class PedidoCotacao(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero_pc: str
    relatorio_id: str
    parent_pc_id: Optional[str] = None
    sub_numero: Optional[int] = None
    status: str = "Em Espera"
    observacoes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None
    created_by: str

class IntervencaoRelatorio(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    data_intervencao: date
    motivo_assistencia: str
    relatorio_assistencia: Optional[str] = None
    equipamento_id: Optional[str] = None
    ordem: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RelatorioAssistencia(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    texto: str
    intervencao_id: Optional[str] = None
    equipamento_ids: list = Field(default_factory=list)
    data_intervencao: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MaterialRelatorio(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    intervencao_id: Optional[str] = None
    designacao: str
    quantidade: float
    tipo: str
    ordem: int = 0

class FotoRelatorio(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    intervencao_id: Optional[str] = None
    foto_path: str
    foto_url: Optional[str] = None
    descricao: Optional[str] = None
    ordem: int = 0
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AssinaturaRelatorio(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    tipo: str
    assinatura_path: Optional[str] = None
    assinatura_url: Optional[str] = None
    assinatura_base64: Optional[str] = None
    primeiro_nome: Optional[str] = None
    ultimo_nome: Optional[str] = None
    assinado_por: Optional[str] = None
    data_assinatura: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    data_intervencao: Optional[str] = None

class EnviarEmailRequest(BaseModel):
    emails: List[str]
    incluir_folha_horas: bool = False
    documentos: Optional[List[str]] = None
    hide_client_pcs: bool = False
    idioma: str = "pt"


# ============ Referência Interna ============

class ReferenceToken(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    token: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    cliente_id: str
    used: bool = False
    referencia: Optional[str] = None
    expires_at: datetime = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ============ Notificações ============

class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    username: Optional[str] = None
    type: str
    title: Optional[str] = None
    message: str
    priority: Optional[str] = None
    read: bool = False
    related_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PushSubscription(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    endpoint: str
    keys: dict
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ============ Time Entries ============

class TimeEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    username: str
    date: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: str = "not_started"
    observations: Optional[str] = None
    is_overtime_day: bool = False
    overtime_reason: Optional[str] = None
    regular_hours: Optional[float] = None
    overtime_hours: Optional[float] = None
    special_hours: Optional[float] = None
    total_hours: Optional[float] = None
    outside_residence_zone: bool = False
    location_description: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TimeEntryStart(BaseModel):
    observations: Optional[str] = None
    outside_residence_zone: Optional[bool] = False
    location_description: Optional[str] = None
    geo_location: Optional[dict] = None

class TimeEntryEnd(BaseModel):
    observations: Optional[str] = None
    end_geo_location: Optional[dict] = None

class TimeEntryUpdate(BaseModel):
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    observations: Optional[str] = None
    outside_residence_zone: Optional[bool] = None
    location_description: Optional[str] = None

class ManualTimeEntryCreate(BaseModel):
    user_id: str
    date: str
    time_entries: List[dict]
    observations: Optional[str] = None
    outside_residence_zone: Optional[bool] = False
    location_description: Optional[str] = None


# ============ Férias & Faltas ============

class VacationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    username: str
    start_date: str
    end_date: str
    days_requested: int
    reason: Optional[str] = None
    status: str = "pending"
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class VacationRequestCreate(BaseModel):
    start_date: str
    end_date: str
    reason: Optional[str] = None

class VacationBalance(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    company_start_date: str
    days_earned: float
    days_taken: int
    days_available: float
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Absence(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    username: str
    date: str
    absence_type: str
    hours: float
    is_justified: bool
    reason: Optional[str] = None
    justification_file: Optional[str] = None
    status: str = "pending"
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AbsenceCreate(BaseModel):
    date: str
    absence_type: str
    hours: float = 8.0
    is_justified: bool = True
    reason: Optional[str] = None


# ============ Serviços / Calendar ============

class ServiceAppointment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    location: str
    service_reason: str
    technician_ids: List[str]
    date: str
    time_slot: Optional[str] = None
    observations: Optional[str] = None
    status: str = "scheduled"
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ServiceAppointmentCreate(BaseModel):
    client_name: str
    location: str
    service_reason: Optional[str] = None
    technician_ids: List[str]
    date: str
    time_slot: Optional[str] = None
    observations: Optional[str] = None

class ServiceWithOTCreate(BaseModel):
    client_name: str
    client_id: Optional[str] = None
    location: str
    service_type: str = "assistencia"
    service_reason: Optional[str] = None
    technician_ids: List[str]
    date: str
    date_end: Optional[str] = None
    time_slot: Optional[str] = None
    observations: Optional[str] = None

class ServiceAppointmentUpdate(BaseModel):
    client_name: Optional[str] = None
    location: Optional[str] = None
    service_reason: Optional[str] = None
    technician_ids: Optional[List[str]] = None
    date: Optional[str] = None
    time_slot: Optional[str] = None
    observations: Optional[str] = None
    status: Optional[str] = None


# ============ Empresa / Tarifas ============

class CompanyInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default="company_info_default")
    nome_empresa: str = "HWI UNIPESSOAL LDA"
    nif: str = "518176657"
    telemovel: str = "+351 913008138"
    website: str = "www.hwi.pt"
    email: str = "geral@hwi.pt"
    morada_linha1: str = "Rua Mário Pereira 7 RC ESQ"
    morada_linha2: str = "2830-493 Barreiro, PT"
    iban: str = "PT50 0007 0000 0074 9942 1152 3"
    logo_url: Optional[str] = None
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None

class Tarifa(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero: Optional[int] = None
    nome: str
    valor_por_hora: float
    codigo: Optional[str] = None
    tipo_registo: Optional[str] = None
    tipo_colaborador: Optional[str] = None
    table_id: int = 1
    ativo: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

class TarifaCreate(BaseModel):
    nome: str
    valor_por_hora: float
    numero: Optional[int] = None
    codigo: Optional[str] = None
    tipo_registo: Optional[str] = None
    tipo_colaborador: Optional[str] = None
    table_id: int = 1

class TarifaUpdate(BaseModel):
    numero: Optional[int] = None
    nome: Optional[str] = None
    valor_por_hora: Optional[float] = None
    codigo: Optional[str] = None
    tipo_registo: Optional[str] = None
    tipo_colaborador: Optional[str] = None
    table_id: Optional[int] = None
    ativo: Optional[bool] = None

class TabelaPrecoConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    table_id: int
    valor_km: float = 0.65
    valor_dieta: float = 0
    nome: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

class TabelaPrecoCreate(BaseModel):
    nome: str
    valor_km: float = 0.65
    valor_dieta: float = 0

class TabelaPrecoConfigUpdate(BaseModel):
    valor_km: Optional[float] = None
    valor_dieta: Optional[float] = None
    nome: Optional[str] = None

class FolhaHorasRequest(BaseModel):
    tarifas_por_tecnico: dict
    dados_extras: dict
    table_id: int = 1
    despesa_adjustments: Optional[dict] = None


# ============ Horas Extra ============

class OvertimeAuthorization(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    user_email: Optional[str] = None
    entry_id: Optional[str] = None
    date: str
    request_type: str
    day_type: Optional[str] = None
    start_time: Optional[str] = None
    clock_in_time: Optional[str] = None
    requested_at: str
    expires_at: str
    status: str = "pending"
    decided_by: Optional[str] = None
    decided_at: Optional[str] = None
    decision: Optional[str] = None
    vacation_request_id: Optional[str] = None

class DayAuthorization(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    date: str
    day_type: str
    day_type_display: str
    status: str = "pending"
    first_entry_id: str
    first_entry_time: str
    vacation_request_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    decided_by: Optional[str] = None
    decided_at: Optional[str] = None
    notification_sent: bool = False

class OvertimeDecision(BaseModel):
    action: str
