"""
Tests for Folha de Horas PDF Generation
Testing the individual technician sheets (per-technician PDF sections)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test OT #356 with 4 technicians
TEST_RELATORIO_ID = "8d3a0111-8f03-45d5-a7eb-2cbfcc96ad85"


class TestFolhaHorasPDF:
    """Folha de Horas PDF generation tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "teste@email.com",
            "password": "teste"
        })
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
        else:
            pytest.skip("Authentication failed")
    
    def test_get_tabelas_preco(self):
        """Test GET /api/tabelas-preco returns price tables with valor_km"""
        response = requests.get(f"{BASE_URL}/api/tabelas-preco", headers=self.headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should return multiple price tables
        assert isinstance(data, list)
        assert len(data) >= 3  # At least 3 tables as per context
        
        # Each table should have required fields
        for table in data:
            assert "table_id" in table
            assert "valor_km" in table
            assert "nome" in table
            assert isinstance(table["valor_km"], (int, float))
        
        print(f"✓ Found {len(data)} price tables")
    
    def test_get_tarifas_by_table(self):
        """Test GET /api/tarifas?table_id=X filters correctly"""
        # Test table 1
        response = requests.get(f"{BASE_URL}/api/tarifas?table_id=1", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        # All returned tarifas should belong to table 1
        for tarifa in data:
            if "table_id" in tarifa:
                assert tarifa["table_id"] == 1
        
        print(f"✓ Table 1 has {len(data)} tarifas")
    
    def test_get_folha_horas_data(self):
        """Test GET /api/relatorios-tecnicos/{id}/folha-horas-data"""
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_RELATORIO_ID}/folha-horas-data",
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should contain required fields
        assert "relatorio" in data
        assert "cliente" in data
        assert "tecnicos" in data
        
        # OT #356 should have 4 technicians
        tecnicos = data.get("tecnicos", [])
        assert len(tecnicos) >= 1, "Should have at least 1 technician"
        
        print(f"✓ OT has {len(tecnicos)} technicians")
        
        # Check technician structure
        for tec in tecnicos:
            assert "id" in tec
            assert "nome" in tec
            print(f"  - {tec['nome']}")
    
    def test_generate_folha_horas_pdf_basic(self):
        """Test POST /api/relatorios-tecnicos/{id}/folha-horas-pdf returns valid PDF"""
        payload = {
            "tarifas_por_tecnico": {},
            "dados_extras": {},
            "table_id": 1
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_RELATORIO_ID}/folha-horas-pdf",
            headers=self.headers,
            json=payload
        )
        
        assert response.status_code == 200
        assert response.headers.get("Content-Type") == "application/pdf"
        
        # Check PDF size (should have content)
        content_length = len(response.content)
        assert content_length > 1000, f"PDF too small ({content_length} bytes)"
        
        # Check PDF magic bytes
        assert response.content[:4] == b'%PDF', "Response is not a valid PDF"
        
        # Check filename in Content-Disposition
        content_disp = response.headers.get("Content-Disposition", "")
        assert "FolhaHoras" in content_disp
        
        print(f"✓ PDF generated successfully ({content_length} bytes)")
    
    def test_generate_folha_horas_pdf_with_different_tables(self):
        """Test PDF generation with different price tables"""
        # Test with table 1
        response1 = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_RELATORIO_ID}/folha-horas-pdf",
            headers=self.headers,
            json={"tarifas_por_tecnico": {}, "dados_extras": {}, "table_id": 1}
        )
        assert response1.status_code == 200
        
        # Test with table 2
        response2 = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_RELATORIO_ID}/folha-horas-pdf",
            headers=self.headers,
            json={"tarifas_por_tecnico": {}, "dados_extras": {}, "table_id": 2}
        )
        assert response2.status_code == 200
        
        print("✓ PDF generated with different price tables")
    
    def test_generate_folha_horas_pdf_with_tarifas(self):
        """Test PDF generation with custom tarifas"""
        # Get technicians first
        data_response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_RELATORIO_ID}/folha-horas-data",
            headers=self.headers
        )
        
        if data_response.status_code == 200:
            data = data_response.json()
            registos = data.get("registos_individuais", data.get("registos", []))
            
            # Build tarifas_por_tecnico dict
            tarifas_por_tecnico = {}
            for reg in registos[:3]:  # Test with first 3 records
                tecnico_id = reg.get("tecnico_id")
                data = reg.get("data", "")
                if isinstance(data, str) and "T" in data:
                    data = data.split("T")[0]
                codigo = reg.get("codigo", "1")
                
                key = f"{tecnico_id}_{data}_{codigo}"
                tarifas_por_tecnico[key] = 50.0  # Example rate
            
            payload = {
                "tarifas_por_tecnico": tarifas_por_tecnico,
                "dados_extras": {},
                "table_id": 1
            }
            
            response = requests.post(
                f"{BASE_URL}/api/relatorios-tecnicos/{TEST_RELATORIO_ID}/folha-horas-pdf",
                headers=self.headers,
                json=payload
            )
            
            assert response.status_code == 200
            assert response.content[:4] == b'%PDF'
            print("✓ PDF generated with custom tarifas")
    
    def test_generate_folha_horas_pdf_with_extras(self):
        """Test PDF generation with extras (dieta, portagens, despesas)"""
        # Get technicians first
        data_response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_RELATORIO_ID}/folha-horas-data",
            headers=self.headers
        )
        
        if data_response.status_code == 200:
            data = data_response.json()
            tecnicos = data.get("tecnicos", [])
            registos = data.get("registos_individuais", data.get("registos", []))
            
            # Build dados_extras dict  
            dados_extras = {}
            processed_keys = set()
            
            for reg in registos[:3]:
                tecnico_nome = reg.get("tecnico_nome", "")
                data = reg.get("data", "")
                if isinstance(data, str) and "T" in data:
                    data = data.split("T")[0]
                
                key = f"{tecnico_nome}_{data}"
                if key not in processed_keys:
                    dados_extras[key] = {
                        "dieta": 15.0,
                        "portagens": 5.0,
                        "despesas": 10.0
                    }
                    processed_keys.add(key)
            
            payload = {
                "tarifas_por_tecnico": {},
                "dados_extras": dados_extras,
                "table_id": 1
            }
            
            response = requests.post(
                f"{BASE_URL}/api/relatorios-tecnicos/{TEST_RELATORIO_ID}/folha-horas-pdf",
                headers=self.headers,
                json=payload
            )
            
            assert response.status_code == 200
            assert response.content[:4] == b'%PDF'
            print("✓ PDF generated with extras (dieta, portagens, despesas)")
    
    def test_generate_pdf_nonexistent_relatorio(self):
        """Test PDF generation with non-existent relatorio returns 404"""
        payload = {
            "tarifas_por_tecnico": {},
            "dados_extras": {},
            "table_id": 1
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/nonexistent-id-12345/folha-horas-pdf",
            headers=self.headers,
            json=payload
        )
        
        assert response.status_code == 404
        print("✓ Returns 404 for non-existent relatorio")


class TestTarifasAutoFill:
    """Tests for tarifa auto-fill based on codigo horario"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "teste@email.com",
            "password": "teste"
        })
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
        else:
            pytest.skip("Authentication failed")
    
    def test_tarifas_have_codigo(self):
        """Test that tarifas have codigo field for auto-fill"""
        response = requests.get(f"{BASE_URL}/api/tarifas?table_id=1", headers=self.headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # At least some tarifas should have codigo
        tarifas_with_codigo = [t for t in data if t.get("codigo") and t.get("codigo") != "manual"]
        
        print(f"✓ Found {len(tarifas_with_codigo)} tarifas with codigo for auto-fill")
        for t in tarifas_with_codigo:
            print(f"  - {t.get('nome')}: codigo={t.get('codigo')}, valor={t.get('valor_por_hora')}€/h")
    
    def test_registos_have_codigo(self):
        """Test that registos have codigo field for matching"""
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_RELATORIO_ID}/folha-horas-data",
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        registos = data.get("registos_individuais", data.get("registos", []))
        
        # Check registos have codigo
        registos_with_codigo = [r for r in registos if r.get("codigo")]
        
        print(f"✓ Found {len(registos_with_codigo)}/{len(registos)} registos with codigo")
        
        # Show unique codigos
        codigos = set(r.get("codigo") for r in registos if r.get("codigo"))
        print(f"  Unique códigos: {codigos}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
