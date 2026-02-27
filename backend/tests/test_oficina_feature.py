"""
Test suite for 'Oficina' (Workshop) work type feature
Tests the new Oficina type in cronómetro, manual records, and tipo change
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://field-clock.preview.emergentagent.com').rstrip('/')

class TestOficinaFeature:
    """Test suite for the Oficina work type feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - authenticate and get OT #358"""
        # Login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "pedro",
            "password": "password"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        self.token = response.json()["access_token"]
        self.user = response.json()["user"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
        # Get OT #358
        response = requests.get(f"{BASE_URL}/api/relatorios-tecnicos", headers=self.headers)
        assert response.status_code == 200
        
        ots = response.json()
        self.ot_358 = None
        for ot in ots:
            if ot.get('numero_assistencia') == 358:
                self.ot_358 = ot
                break
        
        assert self.ot_358 is not None, "OT #358 not found"
        self.ot_id = self.ot_358['id']
        
        yield
        
        # Cleanup - stop any active cronometros
        try:
            active_cronos = requests.get(
                f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/cronometros",
                headers=self.headers
            ).json()
            
            for crono in active_cronos:
                if crono.get('ativo'):
                    requests.post(
                        f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/cronometro/parar",
                        headers=self.headers,
                        json={
                            "tecnico_id": crono['tecnico_id'],
                            "tipo": crono['tipo']
                        }
                    )
        except:
            pass
    
    # ========== CRONÓMETRO TESTS ==========
    
    def test_cronometro_iniciar_oficina(self):
        """Test starting an 'oficina' type cronómetro"""
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/cronometro/iniciar",
            headers=self.headers,
            json={
                "tecnico_id": self.user['id'],
                "tecnico_nome": self.user['full_name'],
                "tipo": "oficina"
            }
        )
        
        # Should succeed
        assert response.status_code == 200, f"Failed to start oficina cronómetro: {response.text}"
        
        data = response.json()
        assert "cronometro" in data
        assert data["cronometro"]["tipo"] == "oficina"
        assert data["cronometro"]["tecnico_nome"] == self.user['full_name']
        
        print(f"✅ Oficina cronómetro started successfully for {self.user['full_name']}")
        
        # Stop the cronómetro immediately to cleanup
        time.sleep(2)  # Wait a moment
        stop_response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/cronometro/parar",
            headers=self.headers,
            json={
                "tecnico_id": self.user['id'],
                "tipo": "oficina"
            }
        )
        assert stop_response.status_code == 200, f"Failed to stop cronómetro: {stop_response.text}"
        print(f"✅ Oficina cronómetro stopped successfully")
    
    def test_cronometro_invalid_tipo(self):
        """Test that invalid tipo is rejected"""
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/cronometro/iniciar",
            headers=self.headers,
            json={
                "tecnico_id": self.user['id'],
                "tecnico_nome": self.user['full_name'],
                "tipo": "invalid_tipo"
            }
        )
        
        # Should fail with 400
        assert response.status_code == 400
        assert "Tipo deve ser" in response.json().get('detail', '')
        print(f"✅ Invalid tipo correctly rejected")
    
    def test_cronometro_all_valid_tipos(self):
        """Test that all three valid tipos work: trabalho, viagem, oficina"""
        valid_tipos = ['trabalho', 'viagem', 'oficina']
        
        for tipo in valid_tipos:
            # Start cronómetro
            response = requests.post(
                f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/cronometro/iniciar",
                headers=self.headers,
                json={
                    "tecnico_id": self.user['id'],
                    "tecnico_nome": self.user['full_name'],
                    "tipo": tipo
                }
            )
            
            assert response.status_code == 200, f"Failed to start {tipo} cronómetro: {response.text}"
            print(f"✅ {tipo.capitalize()} cronómetro started successfully")
            
            # Stop cronómetro
            time.sleep(1)
            stop_response = requests.post(
                f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/cronometro/parar",
                headers=self.headers,
                json={
                    "tecnico_id": self.user['id'],
                    "tipo": tipo
                }
            )
            assert stop_response.status_code == 200, f"Failed to stop {tipo} cronómetro: {stop_response.text}"
            print(f"✅ {tipo.capitalize()} cronómetro stopped successfully")
    
    # ========== MANUAL RECORD TESTS ==========
    
    def test_manual_record_with_oficina_tipo(self):
        """Test creating a manual record with tipo_registo='oficina'"""
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/tecnicos",
            headers=self.headers,
            json={
                "tecnico_id": self.user['id'],
                "tecnico_nome": self.user['full_name'],
                "tipo_registo": "oficina",
                "tipo_horario": "diurno",
                "data_trabalho": "2026-01-20",
                "hora_inicio": "09:00",
                "hora_fim": "10:00",
                "minutos_cliente": 60,
                "kms_inicial": 0,
                "kms_final": 0
            }
        )
        
        assert response.status_code in [200, 201], f"Failed to create manual record: {response.text}"
        
        data = response.json()
        # The endpoint may return a single record or an array
        if isinstance(data, dict) and 'registos' in data:
            record = data['registos'][0]
        elif isinstance(data, list):
            record = data[0]
        else:
            record = data
            
        assert record.get('tipo_registo') == 'oficina' or record.get('tipo') == 'oficina', \
            f"Expected tipo_registo='oficina', got: {record}"
        
        print(f"✅ Manual record with tipo='oficina' created successfully")
        
        # Cleanup - delete the test record
        record_id = record.get('id')
        if record_id:
            requests.delete(
                f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/tecnicos/{record_id}",
                headers=self.headers
            )
    
    def test_manual_record_tipo_options(self):
        """Test that manual record accepts all valid tipo_registo values"""
        valid_tipos = ['manual', 'trabalho', 'viagem', 'oficina']
        
        for tipo in valid_tipos:
            response = requests.post(
                f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/tecnicos",
                headers=self.headers,
                json={
                    "tecnico_id": self.user['id'],
                    "tecnico_nome": self.user['full_name'],
                    "tipo_registo": tipo,
                    "tipo_horario": "diurno",
                    "data_trabalho": "2026-01-20",
                    "hora_inicio": "14:00",
                    "hora_fim": "15:00",
                    "minutos_cliente": 60,
                    "kms_inicial": 0,
                    "kms_final": 0
                }
            )
            
            assert response.status_code in [200, 201], f"Failed with tipo_registo={tipo}: {response.text}"
            
            data = response.json()
            if isinstance(data, dict) and 'registos' in data:
                record = data['registos'][0]
            elif isinstance(data, list):
                record = data[0]
            else:
                record = data
            
            record_id = record.get('id')
            if record_id:
                # Cleanup
                requests.delete(
                    f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/tecnicos/{record_id}",
                    headers=self.headers
                )
            
            print(f"✅ Manual record with tipo_registo='{tipo}' works correctly")
    
    # ========== TIPO CHANGE TESTS ==========
    
    def test_change_tipo_to_oficina(self):
        """Test changing an existing record's tipo to oficina"""
        # First create a record with tipo='trabalho'
        create_response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/tecnicos",
            headers=self.headers,
            json={
                "tecnico_id": self.user['id'],
                "tecnico_nome": self.user['full_name'],
                "tipo_registo": "trabalho",
                "tipo_horario": "diurno",
                "data_trabalho": "2026-01-20",
                "hora_inicio": "16:00",
                "hora_fim": "17:00",
                "minutos_cliente": 60,
                "kms_inicial": 0,
                "kms_final": 0
            }
        )
        
        assert create_response.status_code in [200, 201]
        
        data = create_response.json()
        if isinstance(data, dict) and 'registos' in data:
            record = data['registos'][0]
        elif isinstance(data, list):
            record = data[0]
        else:
            record = data
        
        record_id = record.get('id')
        assert record_id, "Record ID not found in response"
        
        # Now update the tipo to 'oficina'
        update_response = requests.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/tecnicos/{record_id}",
            headers=self.headers,
            json={
                "tipo_registo": "oficina"
            }
        )
        
        assert update_response.status_code == 200, f"Failed to update tipo: {update_response.text}"
        
        updated_record = update_response.json()
        assert updated_record.get('tipo_registo') == 'oficina', \
            f"Expected tipo_registo='oficina', got: {updated_record.get('tipo_registo')}"
        
        print(f"✅ Successfully changed tipo from 'trabalho' to 'oficina'")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/tecnicos/{record_id}",
            headers=self.headers
        )
    
    # ========== GET REGISTOS TESTS ==========
    
    def test_get_tecnicos_includes_oficina_records(self):
        """Test that GET tecnicos endpoint returns oficina records correctly"""
        # Create an oficina record
        create_response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/tecnicos",
            headers=self.headers,
            json={
                "tecnico_id": self.user['id'],
                "tecnico_nome": self.user['full_name'],
                "tipo_registo": "oficina",
                "tipo_horario": "diurno",
                "data_trabalho": "2026-01-20",
                "hora_inicio": "18:00",
                "hora_fim": "19:00",
                "minutos_cliente": 60,
                "kms_inicial": 0,
                "kms_final": 0
            }
        )
        
        assert create_response.status_code in [200, 201]
        
        data = create_response.json()
        if isinstance(data, dict) and 'registos' in data:
            record = data['registos'][0]
        elif isinstance(data, list):
            record = data[0]
        else:
            record = data
        
        record_id = record.get('id')
        
        # Now fetch all tecnicos
        get_response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/tecnicos",
            headers=self.headers
        )
        
        assert get_response.status_code == 200
        
        tecnicos = get_response.json()
        
        # Find the oficina record we created
        oficina_record = None
        for tec in tecnicos:
            if tec.get('id') == record_id:
                oficina_record = tec
                break
        
        assert oficina_record is not None, "Oficina record not found in GET response"
        assert oficina_record.get('tipo_registo') == 'oficina', \
            f"Expected tipo_registo='oficina', got: {oficina_record.get('tipo_registo')}"
        
        print(f"✅ GET tecnicos correctly returns oficina records")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.ot_id}/tecnicos/{record_id}",
            headers=self.headers
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
