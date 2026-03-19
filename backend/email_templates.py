"""
Templates de email multilingue para o sistema HWI.
Apenas o corpo do email é traduzido — anexos e nomes de ficheiros mantêm-se inalterados.
"""

def get_fs_email_body(idioma, numero_ot, status, cliente_nome, data_servico, local_intervencao, ot_relacionada_numero=None, referencia_interna=None):
    """Gera o corpo do email da Folha de Serviço no idioma selecionado."""
    
    templates = {
        "pt": {
            "title": f"Folha de Serviço #{numero_ot} - {status}",
            "greeting": "Exmo(a) Sr(a),",
            "intro": f"Segue em anexo a Folha de Serviço #{numero_ot} referente ao serviço realizado.",
            "client": "Cliente",
            "date": "Data de Serviço",
            "location": "Local",
            "related": "FS Relacionada",
            "ref": "Ref. Interna",
            "closing": "Com os melhores cumprimentos,",
        },
        "es": {
            "title": f"Hoja de Servicio #{numero_ot} - {status}",
            "greeting": "Estimado/a Sr/a,",
            "intro": f"Adjunto encontrará la Hoja de Servicio #{numero_ot} referente al servicio realizado.",
            "client": "Cliente",
            "date": "Fecha de Servicio",
            "location": "Ubicación",
            "related": "HS Relacionada",
            "ref": "Ref. Interna",
            "closing": "Cordialmente,",
        },
        "en": {
            "title": f"Service Sheet #{numero_ot} - {status}",
            "greeting": "Dear Sir/Madam,",
            "intro": f"Please find attached Service Sheet #{numero_ot} regarding the service performed.",
            "client": "Client",
            "date": "Service Date",
            "location": "Location",
            "related": "Related SS",
            "ref": "Internal Ref.",
            "closing": "Kind regards,",
        },
    }
    
    t = templates.get(idioma, templates["pt"])
    
    extra_lines = ""
    if ot_relacionada_numero:
        extra_lines += f'<p><strong>{t["related"]}:</strong> FS #{ot_relacionada_numero}</p>'
    if referencia_interna:
        extra_lines += f'<p><strong>{t["ref"]}:</strong> {referencia_interna}</p>'
    
    return f"""
    <html>
    <body style="font-family: Arial, sans-serif;">
        <h2 style="color: #1e40af;">{t["title"]}</h2>
        <p>{t["greeting"]}</p>
        <p>{t["intro"]}</p>
        <p><strong>{t["client"]}:</strong> {cliente_nome}</p>
        <p><strong>{t["date"]}:</strong> {data_servico}</p>
        <p><strong>{t["location"]}:</strong> {local_intervencao if local_intervencao else 'N/A'}</p>
        {extra_lines}
        <br>
        <p>{t["closing"]}</p>
        <p><strong>HWI Unipessoal, Lda</strong></p>
    </body>
    </html>
    """


def get_pc_email_body(idioma, numero_pc, numero_fs, cliente_nome, status, hide_client, pc_status_link):
    """Gera o corpo do email do Pedido de Cotação no idioma selecionado."""
    
    client_display = '<span style="background-color: #000; color: #000; padding: 2px 8px;">CONFIDENCIAL</span>' if hide_client else cliente_nome
    
    templates = {
        "pt": {
            "title": "Pedido de Cotação",
            "intro": f"Segue em anexo o Pedido de Cotação <b>{numero_pc}</b> referente à Folha de Serviço <b>#{numero_fs}</b>.",
            "client": "Cliente",
            "status": "Status",
            "btn": "Gerir Estado da Proposta",
            "footer": "Este acesso é exclusivo para uso interno da HWI Unipessoal LDA, com o objetivo de gerir e controlar os estados das propostas. Não se destina a utilização por clientes.",
        },
        "es": {
            "title": "Solicitud de Cotización",
            "intro": f"Adjunto encontrará la Solicitud de Cotización <b>{numero_pc}</b> referente a la Hoja de Servicio <b>#{numero_fs}</b>.",
            "client": "Cliente",
            "status": "Estado",
            "btn": "Gestionar Estado de la Propuesta",
            "footer": "Este acceso es exclusivo para uso interno de HWI Unipessoal LDA, con el objetivo de gestionar y controlar los estados de las propuestas. No está destinado a uso por parte de clientes.",
        },
        "en": {
            "title": "Quotation Request",
            "intro": f"Please find attached the Quotation Request <b>{numero_pc}</b> regarding Service Sheet <b>#{numero_fs}</b>.",
            "client": "Client",
            "status": "Status",
            "btn": "Manage Proposal Status",
            "footer": "This access is exclusively for internal use by HWI Unipessoal LDA, for the purpose of managing and controlling proposal statuses. It is not intended for client use.",
        },
    }
    
    t = templates.get(idioma, templates["pt"])
    
    return f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color: #111;">{t["title"]}</h2>
        <p>{t["intro"]}</p>
        <p><b>{t["client"]}:</b> {client_display}</p>
        <p><b>{t["status"]}:</b> {status}</p>
        <br>
        <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
          <tr>
            <td align="center" bgcolor="#111" style="border-radius: 6px;">
              <a href="{pc_status_link}" target="_blank" style="display: inline-block; padding: 12px 28px; font-size: 14px; color: #fff; text-decoration: none; font-weight: bold;">
                {t["btn"]}
              </a>
            </td>
          </tr>
        </table>
        <p style="color: #888; font-size: 11px; margin-top: 16px; text-align: center; line-height: 1.5;">
          {t["footer"]}
        </p>
        <hr style="border: none; border-top: 1px solid #ddd; margin-top: 24px;">
        <p style="color: #666; font-size: 12px;">HWI Unipessoal, Lda.</p>
    </body>
    </html>
    """
