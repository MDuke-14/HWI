"""
Rotas de Informações da Empresa.
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from datetime import datetime, timezone
import os
import logging
import base64

from database import db
from auth_utils import get_current_user, get_current_admin
from models import CompanyInfo

router = APIRouter(prefix="/company-info", tags=["Company Info"])


@router.get("")
async def get_company_info():
    """Get company information (public)"""
    company_info = await db.company_info.find_one({"id": "company_info_default"}, {"_id": 0})
    
    if not company_info:
        # Retornar valores padrão se não existir
        default_info = CompanyInfo()
        return default_info.dict()
    
    return company_info

@router.put("")
async def update_company_info(
    company_data: CompanyInfo,
    current_user: dict = Depends(get_current_admin)
):
    """Update company information (admin only)"""
    # Adicionar metadados de atualização
    update_dict = company_data.dict()
    update_dict["updated_at"] = datetime.now(timezone.utc)
    update_dict["updated_by"] = current_user["sub"]
    
    # Upsert (insert ou update)
    await db.company_info.update_one(
        {"id": "company_info_default"},
        {"$set": update_dict},
        upsert=True
    )
    
    logging.info(f"Informações da empresa atualizadas por {current_user['sub']}")
    
    return {"message": "Informações da empresa atualizadas com sucesso"}


@router.post("/logo")
async def upload_company_logo(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_admin)
):
    """Upload logo da empresa (admin only)"""
    # Validar tipo de ficheiro
    allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Tipo de ficheiro não permitido. Use PNG, JPEG ou WebP.")
    
    # Gerar nome único para o ficheiro
    file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'png'
    unique_filename = f"company_logo_{uuid.uuid4()}.{file_extension}"
    file_path = f"/app/uploads/{unique_filename}"
    
    # Guardar ficheiro
    try:
        contents = await file.read()
        with open(file_path, 'wb') as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao guardar ficheiro: {str(e)}")
    
    # Actualizar company_info com o novo logo
    logo_url = f"/uploads/{unique_filename}"
    await db.company_info.update_one(
        {"id": "company_info_default"},
        {
            "$set": {
                "logo_url": logo_url,
                "updated_at": datetime.now(timezone.utc),
                "updated_by": current_user["sub"]
            }
        },
        upsert=True
    )
    
    logging.info(f"Logo da empresa actualizado por {current_user['sub']}: {logo_url}")
    
    return {"message": "Logo actualizado com sucesso", "logo_url": logo_url}


