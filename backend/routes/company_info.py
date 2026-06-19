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
    """Upload logo da empresa (admin only).

    Valida e normaliza as dimensões da imagem para evitar logos demasiado grandes
    que causem LayoutError no ReportLab (caso típico: 3700x1072px). O logo é
    redimensionado proporcionalmente para um máximo de 1200x400 pixels.
    """
    import uuid
    from io import BytesIO
    try:
        from PIL import Image as PILImage
    except ImportError:
        PILImage = None

    # Validar tipo de ficheiro
    allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Tipo de ficheiro não permitido. Use PNG, JPEG ou WebP.")

    # Ler conteúdo
    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler ficheiro: {str(e)}")

    MAX_W, MAX_H = 1200, 400  # limite máximo de px (mantém aspect ratio)
    original_dims = None
    final_dims = None
    out_bytes = contents

    # Normalizar com PIL (resize se demasiado grande, converter PNG sem alfa para JPEG)
    if PILImage is not None:
        try:
            img = PILImage.open(BytesIO(contents))
            original_dims = img.size  # (w, h)
            w, h = img.size
            # Corrigir orientação EXIF
            try:
                from PIL import ImageOps
                img = ImageOps.exif_transpose(img)
                w, h = img.size
            except Exception:
                pass
            # Se maior que MAX, redimensionar proporcionalmente
            if w > MAX_W or h > MAX_H:
                scale = min(MAX_W / w, MAX_H / h)
                new_w = max(1, int(w * scale))
                new_h = max(1, int(h * scale))
                img = img.resize((new_w, new_h), PILImage.LANCZOS)
            final_dims = img.size
            # Guardar em PNG (preserva transparência)
            buf = BytesIO()
            if img.mode in ("RGBA", "LA", "P"):
                img.save(buf, format="PNG", optimize=True)
                save_ext = "png"
            else:
                img.save(buf, format="JPEG", quality=88, optimize=True)
                save_ext = "jpg"
            out_bytes = buf.getvalue()
            file_extension = save_ext
        except Exception as pil_err:
            logging.warning(f"[logo upload] PIL falhou ({pil_err}) — guardar bytes originais")
            file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'png'
    else:
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'png'

    # Gerar nome único e guardar
    unique_filename = f"company_logo_{uuid.uuid4()}.{file_extension}"
    file_path = f"/app/uploads/{unique_filename}"
    try:
        with open(file_path, 'wb') as f:
            f.write(out_bytes)
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

    logging.info(
        f"Logo da empresa actualizado por {current_user['sub']}: {logo_url} | "
        f"original={original_dims} → final={final_dims}"
    )

    return {
        "message": "Logo actualizado com sucesso",
        "logo_url": logo_url,
        "original_dimensions": original_dims,
        "final_dimensions": final_dims,
        "resized": original_dims != final_dims if (original_dims and final_dims) else False,
    }


