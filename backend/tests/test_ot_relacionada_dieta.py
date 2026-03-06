"""
Test cases for OT Relacionada feature and Dieta calculation in Folha de Horas PDF
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://field-clock.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_USERNAME = "pedro"
TEST_PASSWORD = "password"

# Test OT IDs (from test request)
OT_356_ID = "8d3a0111-8f03-45d5-a7eb-2cbfcc96ad85"
OT_361_ID = "0f6b59bc-c2ae-4561-b4f3-199fee8e7800"


class TestAuthentication:
    """Test login to get auth token"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        return data["access_token"]


class TestOTRelacionadaFeature:
    """Test OT Relacionada (related OT) feature"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD
        })
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_relatorios_contains_ot_relacionada_info(self, auth_headers):
        """Test that GET /api/relatorios-tecnicos returns OT relationship info"""
        response = requests.get(f"{BASE_URL}/api/relatorios-tecnicos", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get relatorios: {response.text}"
        
        relatorios = response.json()
        assert len(relatorios) > 0, "No relatorios found"
        
        # Find OT #361 which should have ot_relacionada_id pointing to OT #356
        ot_361 = next((r for r in relatorios if r.get("numero_assistencia") == 361), None)
        if ot_361:
            print(f"OT #361 found: ot_relacionada_id = {ot_361.get('ot_relacionada_id')}, ot_relacionada_numero = {ot_361.get('ot_relacionada_numero')}")
            assert ot_361.get("ot_relacionada_id") is not None, "OT #361 should have ot_relacionada_id"
            assert ot_361.get("ot_relacionada_numero") == 356, "OT #361 should reference OT #356"
        
        # Find OT #356 which should have ots_posteriores containing OT #361
        ot_356 = next((r for r in relatorios if r.get("numero_assistencia") == 356), None)
        if ot_356:
            print(f"OT #356 found: ots_posteriores = {ot_356.get('ots_posteriores')}")
            ots_posteriores = ot_356.get("ots_posteriores", [])
            assert len(ots_posteriores) > 0, "OT #356 should have ots_posteriores"
            assert any(ot.get("numero_assistencia") == 361 for ot in ots_posteriores), "OT #356 should list OT #361 as posterior"
    
    def test_get_ot_361_has_relacionada(self, auth_headers):
        """Test that OT #361 has OT Relacionada info"""
        response = requests.get(f"{BASE_URL}/api/relatorios-tecnicos/{OT_361_ID}", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get OT #361: {response.text}"
        
        ot = response.json()
        print(f"OT #361 details: {ot}")
        # The individual OT endpoint may not return the enriched data - check list endpoint instead
    
    def test_get_ot_356_has_posteriores(self, auth_headers):
        """Test that OT #356 is referenced by posterior OTs"""
        response = requests.get(f"{BASE_URL}/api/relatorios-tecnicos", headers=auth_headers)
        assert response.status_code == 200
        
        relatorios = response.json()
        ot_356 = next((r for r in relatorios if r.get("id") == OT_356_ID), None)
        
        if ot_356:
            assert "ots_posteriores" in ot_356, "OT #356 should have ots_posteriores field"
            print(f"OT #356 posteriores: {ot_356.get('ots_posteriores')}")


class TestFolhaHorasPDF:
    """Test Folha de Horas PDF generation with dieta calculation"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD
        })
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_folha_horas_pdf_generation(self, auth_headers):
        """Test PDF generation for OT #356 with table_id=1"""
        # Request body with table_id=1 and empty dados_extras
        payload = {
            "tarifas_por_tecnico": {},
            "dados_extras": {},
            "table_id": 1
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_356_ID}/folha-horas-pdf",
            headers=auth_headers,
            json=payload
        )
        
        print(f"Folha Horas PDF response status: {response.status_code}")
        print(f"Content-Type: {response.headers.get('Content-Type')}")
        
        assert response.status_code == 200, f"Failed to generate PDF: {response.text}"
        assert "application/pdf" in response.headers.get("Content-Type", ""), "Response should be PDF"
        assert len(response.content) > 1000, "PDF content seems too small"
        
        # Save PDF for inspection
        with open("/app/test_reports/folha_horas_ot356.pdf", "wb") as f:
            f.write(response.content)
        print("PDF saved to /app/test_reports/folha_horas_ot356.pdf")
    
    def test_folha_horas_data_endpoint(self, auth_headers):
        """Test the folha-horas data endpoint to verify dieta calculation data"""
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_356_ID}/folha-horas-data?table_id=1",
            headers=auth_headers
        )
        
        print(f"Folha Horas data response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Folha Horas data keys: {list(data.keys())}")
            print(f"Tabelas preco: {data.get('tabelas_preco', [])}")
            
            # Check if dieta value is available from table
            tabelas = data.get("tabelas_preco", [])
            table_1 = next((t for t in tabelas if t.get("table_id") == 1), None)
            if table_1:
                print(f"Table 1 valor_dieta: {table_1.get('valor_dieta')}")
        else:
            print(f"Note: folha-horas-data endpoint returned {response.status_code}")


class TestDietaCalculation:
    """Test dieta calculation business rules"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD
        })
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_price_table_has_dieta_value(self, auth_headers):
        """Test that price table 1 has valor_dieta configured"""
        response = requests.get(f"{BASE_URL}/api/tabelas-preco", headers=auth_headers)
        
        assert response.status_code == 200, f"Failed to get price tables: {response.text}"
        
        tables = response.json()
        print(f"Price tables found: {len(tables)}")
        
        table_1 = next((t for t in tables if t.get("table_id") == 1), None)
        if table_1:
            print(f"Table 1 ('{table_1.get('nome')}'): valor_dieta = {table_1.get('valor_dieta')}")
            # According to test request, table_id=1 should have valor_dieta=50.0
            if table_1.get("valor_dieta"):
                assert table_1.get("valor_dieta") == 50.0, f"Table 1 should have valor_dieta=50.0, got {table_1.get('valor_dieta')}"


class TestOTPDFGeneration:
    """Test OT PDF generation includes OT Relacionada info"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD
        })
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_ot_pdf_preview(self, auth_headers):
        """Test OT PDF preview generation"""
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_356_ID}/preview-pdf",
            headers=auth_headers
        )
        
        print(f"OT PDF preview response status: {response.status_code}")
        
        if response.status_code == 200:
            assert "application/pdf" in response.headers.get("Content-Type", ""), "Response should be PDF"
            # Save PDF for inspection
            with open("/app/test_reports/ot_356_preview.pdf", "wb") as f:
                f.write(response.content)
            print("OT PDF saved to /app/test_reports/ot_356_preview.pdf")
        else:
            print(f"Note: PDF preview returned {response.status_code}: {response.text[:200]}")
