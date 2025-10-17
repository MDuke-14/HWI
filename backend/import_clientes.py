#!/usr/bin/env python3
"""
Script para importar clientes do sistema antigo para o novo
"""
import asyncio
import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

# Dados dos clientes extraídos do sistema antigo
CLIENTES_DATA = [
    {
        "nome": "JR Monteiro",
        "nif": "111",
        "telefone": "918060001",
        "morada": "",
        "email": "geral@jrmonteiro.na-net.pt",
        "emails_adicionais": "d-rm.net@live.com.pt"
    },
    {
        "nome": "Kannegiesser España S.l.",
        "nif": "B64648850",
        "telefone": "+34672613400",
        "morada": "Carrer de Cádiz, 15, 08940 Cornellà de Llobregat, Barcelona, Espanha",
        "email": "sebastian.boselli@kannegiesser.es",
        "emails_adicionais": "jaume.alsina@kannegiesser.es; eros.mesa@kannegiesser.es; adrian.puyol@kannegiesser.es"
    },
    {
        "nome": "Onda de Espuma, Unipessoal Lda",
        "nif": "516750070",
        "telefone": "939091860",
        "telemóvel": "967565047",
        "morada": "R. Poesia n3 C, 2830-343 Barreiro, Portugal",
        "email": "onda.de.espuma@gmail.com",
        "emails_adicionais": "cmbdias@gmail.com"
    },
    {
        "nome": "Vmflex, Lda",
        "nif": "508255660",
        "telefone": "913008138",
        "telemóvel": "+351925988295",
        "morada": "Rua Bouça Estilhadouros, 306/314, 4448-044 Alfanena, Portugal",
        "email": "nuno.santos@vmflex.pt",
        "emails_adicionais": ""
    },
    {
        "nome": "Santa Casa da Misericórdia do Barreiro",
        "nif": "500746125",
        "telefone": "",
        "telemóvel": "963732408",
        "morada": "Rua Miguel Bombarda, s/n, 2830-089 Barreiro, Portugal",
        "email": "liliana.cruchinho@misericordiabarreiro.pt",
        "emails_adicionais": "marina.morais@misericordiabarreiro.pt"
    },
    {
        "nome": "Vijusa Portugal-Higiene Industrial Lda",
        "nif": "502985178",
        "telefone": "",
        "telemóvel": "964055833",
        "morada": "Parque Industrial Quinta das Rosas, Rua Quinta das Rosas, 2, 2840-131 Paio Pires, Portugal",
        "email": "josecastilho@vijusa.pt",
        "emails_adicionais": "filipe@vijusa.pt"
    },
    {
        "nome": "Vulcanização Reis Lda",
        "nif": "502880600",
        "telefone": "",
        "telemóvel": "917301926",
        "morada": "Rua Rodrigo Sarmento de Beires nº 7, 2840-068 Paio Pires, Portugal",
        "email": "balcao@vulcreis.pt",
        "emails_adicionais": ""
    },
    {
        "nome": "Miragehaven, Lda",
        "nif": "518269906",
        "telefone": "",
        "telemóvel": "914961306",
        "morada": "Rua Ruy de Sousa Vinagre n23, 2890-249 Samouco, Portugal",
        "email": "miragehaven2@gmail.com",
        "emails_adicionais": ""
    },
    {
        "nome": "Cl Up Laundry Lda",
        "nif": "515929239",
        "telefone": "",
        "telemóvel": "964 169 093",
        "morada": "Avenida Paul Harris, Nº 1, Armazém Ao, 2710-714 Sintra, Portugal",
        "email": "",
        "emails_adicionais": ""
    },
    {
        "nome": "Persec - Limpeza A Seco Lda",
        "nif": "504142380",
        "telefone": "968093404",
        "telemóvel": "+351968093404",
        "morada": "Rua Francisco Ribeirinho 28 arm.7 e 8, 2710-726 Sintra, Portugal",
        "email": "jorge.persec@gmail.com",
        "emails_adicionais": ""
    },
    {
        "nome": "Lisbon 5 - Rua da Palma, Lda",
        "nif": "508354790",
        "telefone": "",
        "telemóvel": "+351927489922",
        "morada": "RUA DA PALMA, 284 1º, 1100-394 Lisboa, Portugal",
        "email": "gaonatomate@gmail.com",
        "emails_adicionais": ""
    },
    {
        "nome": "M.D.M. - Actividades Hoteleiras Lda",
        "nif": "503759465",
        "telefone": "",
        "telemóvel": "918787350",
        "morada": "Avenida Alexandre Herculano n19, 2955-112 Pinhal Novo, Portugal",
        "email": "mdmpaulooliveira@gmail.com",
        "emails_adicionais": "producao@rivieraportuguesacoffee.com"
    },
    {
        "nome": "Snl Ibérica - Sociedade de Lavandarias Lda",
        "nif": "509235689",
        "telefone": "",
        "telemóvel": "+351919839476",
        "morada": "Rua da Indústria, NºS 499 e 499-A, Zona Industrial do Casal do Marco, 2840-182 Seixal, Portugal",
        "email": "snl.iberica@gmail.com",
        "emails_adicionais": ""
    },
    {
        "nome": "Gonçalteam - Comércio de Equipamentos e Acessórios Auto e Representações, Lda",
        "nif": "507389689",
        "telefone": "+351 912 216 027",
        "telemóvel": "",
        "morada": "Rua Quinta das Rosas, Nº19, Zona Industrial do Casal do Marco, 2840-131 Aldeia de Paio Pires, Portugal",
        "email": "geral@goncaloteam.pt",
        "emails_adicionais": ""
    },
    {
        "nome": "João Teixeira",
        "nif": "199206440",
        "telefone": "966324030",
        "telemóvel": "",
        "morada": "Quinta dos Coelhos n73, 2855-459 Corroios, Portugal",
        "email": "joaoteixeira80@gmail.com",
        "emails_adicionais": ""
    },
    {
        "nome": "Arménio dos Reis Oliveira, Unipessoal Lda",
        "nif": "513286535",
        "telefone": "",
        "telemóvel": "939777777",
        "morada": "R. da Ordem 248, 3885-736 Maceda, Portugal",
        "email": "geral@arcolhigiene.pt",
        "emails_adicionais": ""
    },
    {
        "nome": "560Lab, Unipessoal Lda",
        "nif": "510511970",
        "telefone": "",
        "telemóvel": "+351912901669",
        "morada": "Rua Rossio de Amora n20, 2845-133 Amora, Portugal",
        "email": "alphaidc1@gmail.com",
        "emails_adicionais": ""
    },
    {
        "nome": "Neutripuro - Lavagens Industriais , Lda",
        "nif": "508619041",
        "telefone": "",
        "telemóvel": "+351917292686",
        "morada": "Rua António Oliveira 20, 2500-916 Caldas da Rainha, Portugal",
        "email": "geral@neutripuro.com",
        "emails_adicionais": ""
    },
    {
        "nome": "Luaembal - Comércio de Embalagens, Unipessoal, Lda",
        "nif": "507121562",
        "telefone": "",
        "telemóvel": "961874934",
        "morada": "Rua dos Laminadores, Nº 21, Piso II, 2840-586 Aldeia de Paio Pires, Portugal",
        "email": "luaembal@gmail.com",
        "emails_adicionais": ""
    },
    {
        "nome": "C.M.N. - Manutenção Industrial e Naval, Conservação e Serviços Lda",
        "nif": "502747420",
        "telefone": "",
        "telemóvel": "",
        "morada": "Praceta Emídio Santana, Lote 10, 2840-588 Casal do Marco, Portugal",
        "email": "miguel.merca@wsp.pt",
        "emails_adicionais": ""
    },
    {
        "nome": "Balão+, Unipessoal Lda",
        "nif": "509314481",
        "telefone": "210990444",
        "telemóvel": "+351 912 046 951",
        "morada": "Rua Eugénio dos Santos, Nº 9 F, 2840-185 Pinhal de Frades, Portugal",
        "email": "geral@balaomais.pt",
        "emails_adicionais": ""
    },
    {
        "nome": "Nacionalblinds - Sunshading - Indústria e Representação de Estores Lda",
        "nif": "504145096",
        "telefone": "",
        "telemóvel": "",
        "morada": "Rua dos Ferreiros, Lote 2, Zona Industrial Quinta dos Machados, 2860-192 Alhos Vedros, Portugal",
        "email": "",
        "emails_adicionais": ""
    },
    {
        "nome": "Grph24 - Administração e Gestão de Condominios, Serviços de Portaria, Limpezas e Jardinagem, Unipessoal Lda",
        "nif": "509115934",
        "telefone": "",
        "telemóvel": "+351915633848",
        "morada": "R. Professor Vieira de Almeida 38A, 1600-668 Lisboa, Portugal",
        "email": "claudio.amaral@grupoh24.com",
        "emails_adicionais": ""
    },
    {
        "nome": "Bioceutica, Unipessoal, Lda",
        "nif": "508060923",
        "telefone": "",
        "telemóvel": "",
        "morada": "Núcleo Empresarial da Venda do Pinheiro, Quinta dos Estrangeiros, Zona Norte, Rua C, Pavilhão 32, 2665-601 Venda do pinheiro, Portugal",
        "email": "joaquimsilva@bioceutica.pt",
        "emails_adicionais": ""
    },
    {
        "nome": "Omninstal",
        "nif": "501237445",
        "telefone": "",
        "telemóvel": "910078245",
        "morada": "Queluz de baixo, Portugal",
        "email": "omn.vmacau@elecnor.pt",
        "emails_adicionais": ""
    },
    {
        "nome": "Albano R. N. Alves - Indústria de Transformação de Papel S.A",
        "nif": "506471977",
        "telefone": "219255710",
        "telemóvel": "+351937532745",
        "morada": "Rua das Maçarocas, nº 12, 2714-523 Sintra, Portugal",
        "email": "tiagovieira@albanoalvesindustria.pt",
        "emails_adicionais": ""
    },
    {
        "nome": "Breves Sabores, Unipessoal Lda",
        "nif": "509634222",
        "telefone": "",
        "telemóvel": "934313803",
        "morada": "Parque Clube Desportivo e Recreativo de Miratejo, Nº 3, 2855-212 Corroios, Portugal",
        "email": "brevesabores@gmail.com",
        "emails_adicionais": ""
    }
]

async def importar_clientes():
    # Conectar MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'emergent')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print(f"📊 Conectando a: {mongo_url}")
    print(f"📁 Banco de dados: {db_name}")
    print(f"👥 Total de clientes a importar: {len(CLIENTES_DATA)}\n")
    
    imported = 0
    skipped = 0
    
    for cliente_data in CLIENTES_DATA:
        try:
            # Verificar se cliente já existe (por NIF)
            existing = await db.clientes.find_one({"nif": cliente_data["nif"]})
            
            if existing:
                print(f"⏭️  Cliente já existe: {cliente_data['nome']} (NIF: {cliente_data['nif']})")
                skipped += 1
                continue
            
            # Preparar dados do cliente
            telefone = cliente_data.get("telefone", "") or cliente_data.get("telemóvel", "")
            
            cliente = {
                "id": str(uuid.uuid4()),
                "nome": cliente_data["nome"],
                "nif": cliente_data["nif"],
                "telefone": telefone,
                "email": cliente_data.get("email", "") or None,
                "morada": cliente_data.get("morada", "") or None,
                "emails_adicionais": cliente_data.get("emails_adicionais", "") or None,
                "ativo": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            # Inserir no banco
            await db.clientes.insert_one(cliente)
            
            print(f"✅ Importado: {cliente_data['nome']}")
            imported += 1
            
        except Exception as e:
            print(f"❌ Erro ao importar {cliente_data['nome']}: {e}")
    
    print(f"\n{'='*60}")
    print(f"📊 RESUMO DA IMPORTAÇÃO")
    print(f"{'='*60}")
    print(f"✅ Clientes importados: {imported}")
    print(f"⏭️  Clientes já existentes: {skipped}")
    print(f"📝 Total processados: {len(CLIENTES_DATA)}")
    print(f"{'='*60}\n")
    
    client.close()

if __name__ == "__main__":
    print("🚀 Iniciando importação de clientes do sistema antigo...\n")
    asyncio.run(importar_clientes())
    print("✅ Importação concluída!\n")
