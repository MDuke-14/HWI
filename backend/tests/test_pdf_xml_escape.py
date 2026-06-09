"""
Teste isolado: garantir que a geração de PDF aguenta caracteres XML problemáticos
em campos de texto livre do utilizador.

Antes do fix _pe/_pe_with_nl: estas strings rebentavam ReportLab Paragraph.
Após o fix: PDF deve ser gerado normalmente.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ot_pdf_report import generate_ot_pdf
from io import BytesIO


def test_xml_special_chars_in_text():
    """Strings com <, >, & e tags inválidas devem NÃO rebentar."""
    relatorio = {
        "numero_assistencia": "TEST<999>",
        "data_servico": "2026-02-06",
        "status": "concluido",
        "pedido_por": "Cliente A & B Lda",
        "local_intervencao": "Rua das Flores < 10",
        "motivo_assistencia": "Avaria <urgente> com 5 < 10 horas de operação.\nLinha 2 com & ampersand.",
        "referencia_interna_cliente": "PO #2026/<001>",
        "equipamento_tipologia": "Compressor <TipoX>",
        "equipamento_marca": "AC&DC Industries",
        "equipamento_modelo": "Model<3>",
        "equipamento_numero_serie": "SN-A&B-001",
    }
    cliente = {
        "nome": "Empresa <Test> & Co Lda",
    }
    intervencoes = [
        {
            "id": "intv1",
            "data_intervencao": "2026-02-06",
            "motivo_assistencia": "Substituir <peça> & <componente>",
        }
    ]
    fotografias = []
    assinaturas = []
    materiais = [
        {
            "id": "mat1",
            "intervencao_id": "intv1",
            "descricao": "Parafuso M8 & cobre <especial>",
            "quantidade": 5,
            "unidade": "Un",
            "fornecido_por": "Fornecedor A&B <Lda>",
        }
    ]
    relatorios_assistencia = [
        {
            "id": "ra1",
            "intervencao_id": "intv1",
            "texto": "Procedi à substituição & verificação.\nResultado: 5 < 10 mm folga.\n<urgente> reposição.",
        }
    ]

    # Não deve rebentar
    buf = generate_ot_pdf(
        relatorio=relatorio,
        cliente=cliente,
        intervencoes=intervencoes,
        tecnicos=[],
        fotografias=fotografias,
        assinaturas=assinaturas,
        equipamentos_adicionais=[],
        materiais=materiais,
        registos_mao_obra=[],
        company_info={},
        relatorios_assistencia=relatorios_assistencia,
    )
    assert buf is not None, "PDF buffer não foi gerado"
    data = buf.read()
    assert len(data) > 1000, f"PDF demasiado pequeno: {len(data)} bytes"
    assert data.startswith(b"%PDF-"), f"PDF inválido: {data[:20]}"
    assert b"%%EOF" in data[-64:], "PDF sem trailer EOF"
    print(f"OK: PDF gerado ({len(data)} bytes) com strings que continham <, >, & sem rebentar")


def test_empty_fs():
    """FS quase vazia não deve rebentar."""
    relatorio = {"numero_assistencia": "EMPTY", "data_servico": "2026-02-06"}
    cliente = {}
    buf = generate_ot_pdf(
        relatorio=relatorio,
        cliente=cliente,
        intervencoes=[],
        tecnicos=[],
        fotografias=[],
        assinaturas=[],
    )
    assert buf is not None
    data = buf.read()
    assert data.startswith(b"%PDF-")
    print(f"OK: PDF vazio gerado ({len(data)} bytes)")


if __name__ == "__main__":
    test_empty_fs()
    test_xml_special_chars_in_text()
    print("\nTODOS OS TESTES PASSARAM ✅")
