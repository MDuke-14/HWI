"""
Services Routes - Gestão de Serviços/Agendamentos
Extracted from server.py
"""
import logging
import uuid
from datetime import datetime, timezone, date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from database import db
from models import ServiceAppointment, ServiceAppointmentCreate, ServiceAppointmentUpdate, ServiceWithOTCreate, RelatorioTecnico
from server import get_current_user, get_current_admin, send_service_email

router = APIRouter()

@router.post("/services")
async def create_service(service_data: ServiceAppointmentCreate, current_user: dict = Depends(get_current_admin)):
    """Create new service appointment (admin only)"""
    # Validate technicians exist
    for tech_id in service_data.technician_ids:
        tech = await db.users.find_one({"id": tech_id}, {"_id": 0})
        if not tech:
            raise HTTPException(status_code=404, detail=f"Técnico com ID {tech_id} não encontrado")
    
    service = ServiceAppointment(
        **service_data.model_dump(),
        created_by=current_user["sub"]
    )
    
    service_dict = service.model_dump()
    service_dict['created_at'] = service_dict['created_at'].isoformat()
    
    await db.service_appointments.insert_one(service_dict)
    
    # Get technician emails and send notifications
    technician_emails = []
    for tech_id in service_data.technician_ids:
        tech = await db.users.find_one({"id": tech_id}, {"_id": 0, "email": 1, "full_name": 1, "username": 1})
        if tech:
            if tech.get('email'):
                technician_emails.append(tech['email'])
            
            # Criar notificação no sino
            await create_notification(
                tech_id,
                "service_assigned",
                f"Foi atribuído ao serviço em {service_data.client_name} ({service_data.location}) no dia {service_data.date}" + (f" às {service_data.time_slot}" if service_data.time_slot else ""),
                service.id
            )
            
            # Enviar PUSH notification ao técnico
            time_info = f" às {service_data.time_slot}" if service_data.time_slot else ""
            await send_push_notification(
                db,
                tech_id,
                "📅 Novo Serviço Atribuído",
                f"{service_data.client_name} - {service_data.location}\n{service_data.date}{time_info}",
                "service_assigned",
                "high"
            )
    
    # Send email notifications
    if technician_emails:
        await send_service_email(technician_emails, service_dict, "created")
    
    return {"message": "Serviço criado com sucesso", "service": {k: v for k, v in service_dict.items() if k != '_id'}}

@router.post("/services/with-ot")
async def create_service_with_ot(service_data: ServiceWithOTCreate, current_user: dict = Depends(get_current_admin)):
    """Criar serviço e FS associada automaticamente"""
    from datetime import date as dt_date
    
    # Validar técnicos existem
    for tech_id in service_data.technician_ids:
        tech = await db.users.find_one({"id": tech_id}, {"_id": 0})
        if not tech:
            raise HTTPException(status_code=404, detail=f"Técnico com ID {tech_id} não encontrado")
    
    # Buscar ou criar cliente
    cliente = None
    cliente_id = service_data.client_id
    
    if cliente_id:
        cliente = await db.clientes.find_one({"id": cliente_id}, {"_id": 0})
    
    if not cliente:
        # Criar cliente temporário se não existir
        cliente_id = str(uuid.uuid4())
        cliente = {
            "id": cliente_id,
            "nome": service_data.client_name,
            "morada": service_data.location,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.clientes.insert_one(cliente)
    
    # Gerar número de assistência para OT
    last_relatorio = await db.relatorios_tecnicos.find_one(
        {},
        sort=[("numero_assistencia", -1)]
    )
    last_numero = last_relatorio.get("numero_assistencia", 0) if last_relatorio else 0
    numero_assistencia = max(last_numero + 1, 354)
    
    # Converter datas
    data_inicio = dt_date.fromisoformat(service_data.date)
    data_fim = dt_date.fromisoformat(service_data.date_end) if service_data.date_end else None
    
    # Construir motivo combinando tipo + motivo
    tipo_label = "Assistência" if service_data.service_type == "assistencia" else "Montagem"
    motivo = service_data.service_reason if service_data.service_reason else tipo_label
    if service_data.service_reason:
        motivo = f"{tipo_label}: {service_data.service_reason}"
    
    # Criar Relatório Técnico (OT)
    relatorio = RelatorioTecnico(
        numero_assistencia=numero_assistencia,
        cliente_id=cliente_id,
        created_by_id=current_user["sub"],
        cliente_nome=cliente.get("nome", service_data.client_name),
        data_servico=data_inicio,
        data_fim=data_fim,
        local_intervencao=service_data.location,
        pedido_por=service_data.client_name,
        motivo_assistencia=motivo,
        status="agendado"  # Estado especial para OTs criadas via Calendário
    )
    
    relatorio_dict = relatorio.dict()
    relatorio_dict["data_criacao"] = relatorio_dict["data_criacao"].isoformat()
    relatorio_dict["data_servico"] = relatorio_dict["data_servico"].isoformat()
    if relatorio_dict.get("data_fim"):
        relatorio_dict["data_fim"] = relatorio_dict["data_fim"].isoformat()
    
    await db.relatorios_tecnicos.insert_one(relatorio_dict)
    
    # Criar Service Appointment associado à OT
    service = ServiceAppointment(
        client_name=service_data.client_name,
        location=service_data.location,
        service_reason=motivo,
        technician_ids=service_data.technician_ids,
        date=service_data.date,
        time_slot=service_data.time_slot,
        observations=service_data.observations,
        created_by=current_user["sub"]
    )
    
    service_dict = service.model_dump()
    service_dict['created_at'] = service_dict['created_at'].isoformat()
    service_dict['ot_id'] = relatorio.id  # Link para OT
    service_dict['ot_numero'] = numero_assistencia
    
    # Se tem data fim, criar serviços para cada dia no intervalo
    if data_fim and data_fim > data_inicio:
        # Inserir serviço original
        await db.service_appointments.insert_one(service_dict)
        
        # Criar serviços adicionais para cada dia do intervalo (sem duplicar o primeiro)
        current_date = data_inicio + timedelta(days=1)
        while current_date <= data_fim:
            additional_service = {k: v for k, v in service_dict.items() if k != '_id'}
            additional_service['id'] = str(uuid.uuid4())
            additional_service['date'] = current_date.isoformat()
            await db.service_appointments.insert_one(additional_service)
            current_date += timedelta(days=1)
    else:
        await db.service_appointments.insert_one(service_dict)
    
    # Enviar notificações para técnicos
    technician_emails = []
    for tech_id in service_data.technician_ids:
        tech = await db.users.find_one({"id": tech_id}, {"_id": 0, "email": 1, "full_name": 1, "username": 1})
        if tech:
            if tech.get('email'):
                technician_emails.append(tech['email'])
            
            # Criar notificação
            date_info = f"{service_data.date}"
            if service_data.date_end:
                date_info += f" até {service_data.date_end}"
            
            await create_notification(
                tech_id,
                "service_assigned",
                f"Foi atribuído ao serviço OT-{numero_assistencia} em {service_data.client_name} ({service_data.location}) - {date_info}" + (f" às {service_data.time_slot}" if service_data.time_slot else ""),
                service.id
            )
            
            # Enviar PUSH notification
            time_info = f" às {service_data.time_slot}" if service_data.time_slot else ""
            await send_push_notification(
                db,
                tech_id,
                f"📅 Novo Serviço - OT-{numero_assistencia}",
                f"{service_data.client_name} - {service_data.location}\n{date_info}{time_info}",
                "service_assigned",
                "high"
            )
    
    # Send email notifications
    if technician_emails:
        await send_service_email(technician_emails, service_dict, "created")
    
    return {
        "message": "Serviço e FS criados com sucesso",
        "service": {k: v for k, v in service_dict.items() if k != '_id'},
        "ot": {
            "id": relatorio.id,
            "numero_assistencia": numero_assistencia,
            "data_inicio": service_data.date,
            "data_fim": service_data.date_end
        }
    }

@router.get("/services")
async def get_services(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all service appointments"""
    query = {}
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query["date"] = {"$gte": start_date}
    elif end_date:
        query["date"] = {"$lte": end_date}
    
    services = await db.service_appointments.find(query, {"_id": 0}).sort("date", 1).to_list(1000)
    
    # Enrich with technician names
    for service in services:
        tech_names = []
        for tech_id in service.get("technician_ids", []):
            tech = await db.users.find_one({"id": tech_id}, {"_id": 0, "username": 1})
            if tech:
                tech_names.append(tech["username"])
        service["technician_names"] = tech_names
    
    return services

@router.get("/services/calendar")
async def get_calendar_data(
    month: int,
    year: int,
    current_user: dict = Depends(get_current_user)
):
    """Get calendar data including services, vacations, and FS's for a specific month"""
    from datetime import timedelta
    
    # Calculate start and end dates for the month
    start_date = f"{year}-{month:02d}-01"
    if month == 12:
        end_date = f"{year + 1}-01-01"
    else:
        end_date = f"{year}-{month + 1:02d}-01"
    
    # Get services
    services = await db.service_appointments.find({
        "date": {"$gte": start_date, "$lt": end_date}
    }, {"_id": 0}).to_list(1000)
    
    # Enrich with technician info
    for service in services:
        tech_details = []
        for tech_id in service.get("technician_ids", []):
            tech = await db.users.find_one({"id": tech_id}, {"_id": 0, "username": 1, "email": 1})
            if tech:
                tech_details.append({"id": tech_id, "username": tech["username"]})
        service["technicians"] = tech_details
    
    # Get approved vacations
    vacations = await db.vacation_requests.find({
        "status": "approved",
        "$or": [
            {"start_date": {"$lte": end_date}, "end_date": {"$gte": start_date}}
        ]
    }, {"_id": 0}).to_list(1000)
    
    # Enrich with user info
    for vacation in vacations:
        user = await db.users.find_one({"id": vacation["user_id"]}, {"_id": 0, "username": 1})
        if user:
            vacation["username"] = user["username"]
    
    # Get OTs that should appear in this month
    # 1. OTs with data_servico in this month
    # 2. OTs with data_fim that spans into this month
    # 3. OTs with intervenções in this month
    
    ots_for_calendar = []
    
    # Buscar IDs de OTs que foram criadas pelo calendário (têm service_appointment associado)
    calendar_ot_ids = set()
    calendar_services = await db.service_appointments.find(
        {"ot_id": {"$exists": True}},
        {"_id": 0, "ot_id": 1}
    ).to_list(10000)
    for svc in calendar_services:
        if svc.get("ot_id"):
            calendar_ot_ids.add(svc["ot_id"])
    
    # Buscar todas as OTs que podem aparecer neste mês
    # (data_servico no mês OU data_fim que abrange o mês)
    relatorios = await db.relatorios_tecnicos.find({
        "$or": [
            # OTs que começam neste mês
            {"data_servico": {"$gte": start_date, "$lt": end_date}},
            # OTs com data_fim que abrange este mês
            {"data_servico": {"$lt": end_date}, "data_fim": {"$gte": start_date}},
        ]
    }, {"_id": 0}).to_list(1000)
    
    # Também buscar OTs com intervenções neste mês (mesmo que data_servico seja de outro mês)
    intervencoes_mes = await db.intervencoes_relatorio.find({
        "$or": [
            {"data_intervencao": {"$gte": start_date, "$lt": end_date}},
            {"data": {"$gte": start_date, "$lt": end_date}},
        ]
    }, {"_id": 0, "relatorio_id": 1, "data_intervencao": 1, "data": 1}).to_list(10000)
    
    # Coletar IDs de OTs com intervenções no mês
    ots_com_intervencoes_mes = {}
    for interv in intervencoes_mes:
        rel_id = interv.get("relatorio_id")
        if rel_id:
            data_interv = interv.get("data_intervencao") or interv.get("data")
            if data_interv:
                if rel_id not in ots_com_intervencoes_mes:
                    ots_com_intervencoes_mes[rel_id] = set()
                try:
                    if isinstance(data_interv, str):
                        ots_com_intervencoes_mes[rel_id].add(data_interv[:10])
                    else:
                        ots_com_intervencoes_mes[rel_id].add(data_interv.strftime("%Y-%m-%d"))
                except:
                    pass
    
    # Buscar OTs adicionais que têm intervenções neste mês mas data_servico de outro mês
    relatorios_ids_ja_buscados = {r.get("id") for r in relatorios}
    ots_adicionais_ids = [rid for rid in ots_com_intervencoes_mes.keys() if rid not in relatorios_ids_ja_buscados]
    
    if ots_adicionais_ids:
        ots_adicionais = await db.relatorios_tecnicos.find({
            "id": {"$in": ots_adicionais_ids}
        }, {"_id": 0}).to_list(1000)
        relatorios.extend(ots_adicionais)
    
    for rel in relatorios:
        rel_id = rel.get("id")
        data_servico = rel.get("data_servico", "")
        data_fim = rel.get("data_fim")
        numero_ot = rel.get("numero_assistencia")
        cliente_nome = rel.get("cliente_nome", "")
        motivo = rel.get("motivo_assistencia", "")
        local = rel.get("local_intervencao", "")
        status = rel.get("status", "em_execucao")
        
        # Verificar se foi criada pelo calendário
        from_calendar = rel_id in calendar_ot_ids
        
        # Converter datas para objetos date
        try:
            data_inicio_obj = datetime.strptime(data_servico[:10], "%Y-%m-%d").date() if data_servico else None
        except:
            data_inicio_obj = None
        
        try:
            data_fim_obj = datetime.strptime(data_fim[:10], "%Y-%m-%d").date() if data_fim else None
        except:
            data_fim_obj = None
        
        # Se tem data_fim, gerar entrada para cada dia do intervalo
        if data_inicio_obj and data_fim_obj:
            current = data_inicio_obj
            while current <= data_fim_obj:
                current_str = current.strftime("%Y-%m-%d")
                # Verificar se está dentro do mês solicitado
                if start_date <= current_str < end_date:
                    ots_for_calendar.append({
                        "id": rel_id,
                        "date": current_str,
                        "numero_ot": numero_ot,
                        "cliente_nome": cliente_nome,
                        "motivo": motivo,
                        "local": local,
                        "status": status,
                        "type": "ot_range",  # OT com intervalo de datas
                        "data_inicio": data_servico,
                        "data_fim": data_fim,
                        "from_calendar": from_calendar
                    })
                current += timedelta(days=1)
        else:
            # Sem data_fim - usar datas das intervenções (já buscadas anteriormente)
            datas_intervencoes = ots_com_intervencoes_mes.get(rel_id, set())
            
            # Se não tem intervenções buscadas, fazer query individual (fallback)
            if not datas_intervencoes:
                intervencoes = await db.intervencoes_relatorio.find({
                    "relatorio_id": rel_id
                }, {"_id": 0, "data": 1, "data_intervencao": 1}).to_list(100)
                
                for interv in intervencoes:
                    data_interv = interv.get("data_intervencao") or interv.get("data")
                    if data_interv:
                        try:
                            if isinstance(data_interv, str):
                                datas_intervencoes.add(data_interv[:10])
                            else:
                                datas_intervencoes.add(data_interv.strftime("%Y-%m-%d"))
                        except:
                            pass
            
            # Adicionar a data de início se não tiver intervenções
            if not datas_intervencoes and data_inicio_obj:
                datas_intervencoes.add(data_servico[:10])
            
            # Criar entrada para cada data de intervenção dentro do mês
            for data_interv_str in datas_intervencoes:
                if start_date <= data_interv_str < end_date:
                    ots_for_calendar.append({
                        "id": rel_id,
                        "date": data_interv_str,
                        "numero_ot": numero_ot,
                        "cliente_nome": cliente_nome,
                        "motivo": motivo,
                        "local": local,
                        "status": status,
                        "type": "ot_intervention",  # OT baseada em intervenções
                        "data_inicio": data_servico,
                        "data_fim": None,
                        "from_calendar": from_calendar
                    })
    
    return {
        "services": services,
        "vacations": vacations,
        "ots": ots_for_calendar
    }

@router.put("/services/{service_id}")
async def update_service(
    service_id: str,
    update_data: ServiceAppointmentUpdate,
    current_user: dict = Depends(get_current_admin)
):
    """Update service appointment (admin only)"""
    service = await db.service_appointments.find_one({"id": service_id})
    
    if not service:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if update_dict:
        # Validate technicians if being updated
        if "technician_ids" in update_dict:
            for tech_id in update_dict["technician_ids"]:
                tech = await db.users.find_one({"id": tech_id}, {"_id": 0})
                if not tech:
                    raise HTTPException(status_code=404, detail=f"Técnico com ID {tech_id} não encontrado")
        
        await db.service_appointments.update_one({"id": service_id}, {"$set": update_dict})
        
        # Get updated service
        updated_service = await db.service_appointments.find_one({"id": service_id}, {"_id": 0})
        
        # Send email notifications if technicians changed
        if "technician_ids" in update_dict:
            technician_emails = []
            for tech_id in updated_service["technician_ids"]:
                tech = await db.users.find_one({"id": tech_id}, {"_id": 0, "email": 1})
                if tech and tech.get('email'):
                    technician_emails.append(tech['email'])
            
            if technician_emails:
                await send_service_email(technician_emails, updated_service, "updated")
    
    return {"message": "Serviço atualizado com sucesso"}

@router.delete("/services/{service_id}")
async def delete_service(service_id: str, current_user: dict = Depends(get_current_admin)):
    """Delete/cancel service appointment (admin only)"""
    service = await db.service_appointments.find_one({"id": service_id}, {"_id": 0})
    
    if not service:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    
    # Get technician emails before deletion
    technician_emails = []
    for tech_id in service.get("technician_ids", []):
        tech = await db.users.find_one({"id": tech_id}, {"_id": 0, "email": 1})
        if tech and tech.get('email'):
            technician_emails.append(tech['email'])
    
    # Send cancellation emails
    if technician_emails:
        await send_service_email(technician_emails, service, "cancelled")
    
    # Delete the service
    result = await db.service_appointments.delete_one({"id": service_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    
    return {"message": "Serviço cancelado com sucesso"}

# ============ Cronómetro OT Routes ============

