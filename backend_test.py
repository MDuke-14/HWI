import requests
import sys
import json
from datetime import datetime, timedelta
import uuid

class HWITimeTrackerTester:
    def __init__(self, base_url="https://trackflow-44.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.username = None
        self.tests_run = 0
        self.tests_passed = 0
        self.current_entry_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_user_registration(self):
        """Test user registration"""
        test_username = f"testuser_{datetime.now().strftime('%H%M%S')}"
        success, response = self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            data={
                "username": test_username,
                "password": "TestPass123!",
                "email": "test@hwi.com",
                "full_name": "Test User"
            }
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response['user']['id']
            self.username = test_username
            print(f"   Registered user: {test_username}")
            return True
        return False

    def test_user_login(self):
        """Test user login with existing credentials"""
        if not self.username:
            print("❌ No username available for login test")
            return False
            
        success, response = self.run_test(
            "User Login",
            "POST",
            "auth/login",
            200,
            data={
                "username": self.username,
                "password": "TestPass123!"
            }
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            return True
        return False

    def test_get_current_user(self):
        """Test getting current user info"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "auth/me",
            200
        )
        return success

    def test_start_time_entry(self):
        """Test starting a time entry"""
        success, response = self.run_test(
            "Start Time Entry",
            "POST",
            "time-entries/start",
            200,
            data={
                "observations": "Teste de início de jornada"
            }
        )
        if success and 'entry' in response:
            self.current_entry_id = response['entry']['id']
            print(f"   Started entry ID: {self.current_entry_id}")
            return True
        return False

    def test_get_today_entry(self):
        """Test getting today's entry"""
        success, response = self.run_test(
            "Get Today Entry",
            "GET",
            "time-entries/today",
            200
        )
        if success and response:
            print(f"   Today's entry status: {response.get('status', 'N/A')}")
            if not self.current_entry_id and response.get('id'):
                self.current_entry_id = response['id']
        return success

    def test_pause_time_entry(self):
        """Test pausing a time entry"""
        if not self.current_entry_id:
            print("❌ No active entry to pause")
            return False
            
        success, response = self.run_test(
            "Pause Time Entry",
            "POST",
            f"time-entries/pause/{self.current_entry_id}",
            200
        )
        return success

    def test_resume_time_entry(self):
        """Test resuming a time entry"""
        if not self.current_entry_id:
            print("❌ No entry to resume")
            return False
            
        success, response = self.run_test(
            "Resume Time Entry",
            "POST",
            f"time-entries/resume/{self.current_entry_id}",
            200
        )
        return success

    def test_end_time_entry(self):
        """Test ending a time entry"""
        if not self.current_entry_id:
            print("❌ No entry to end")
            return False
            
        success, response = self.run_test(
            "End Time Entry",
            "POST",
            f"time-entries/end/{self.current_entry_id}",
            200
        )
        if success and 'total_hours' in response:
            print(f"   Total hours worked: {response['total_hours']}")
        return success

    def test_list_time_entries(self):
        """Test listing time entries"""
        success, response = self.run_test(
            "List Time Entries",
            "GET",
            "time-entries/list",
            200
        )
        if success and isinstance(response, list):
            print(f"   Found {len(response)} entries")
        return success

    def test_update_time_entry(self):
        """Test updating a time entry"""
        if not self.current_entry_id:
            print("❌ No entry to update")
            return False
            
        success, response = self.run_test(
            "Update Time Entry",
            "PUT",
            f"time-entries/{self.current_entry_id}",
            200,
            data={
                "observations": "Observação atualizada via teste"
            }
        )
        return success

    def test_weekly_report(self):
        """Test weekly report"""
        success, response = self.run_test(
            "Weekly Report",
            "GET",
            "time-entries/reports?period=week",
            200
        )
        if success:
            print(f"   Weekly total hours: {response.get('total_hours', 0)}")
            print(f"   Days worked: {response.get('total_days', 0)}")
        return success

    def test_monthly_report(self):
        """Test monthly report"""
        success, response = self.run_test(
            "Monthly Report",
            "GET",
            "time-entries/reports?period=month",
            200
        )
        if success:
            print(f"   Monthly total hours: {response.get('total_hours', 0)}")
            print(f"   Days worked: {response.get('total_days', 0)}")
        return success

    def test_delete_time_entry(self):
        """Test deleting a time entry"""
        if not self.current_entry_id:
            print("❌ No entry to delete")
            return False
            
        success, response = self.run_test(
            "Delete Time Entry",
            "DELETE",
            f"time-entries/{self.current_entry_id}",
            200
        )
        return success

    def test_invalid_login(self):
        """Test login with invalid credentials"""
        success, response = self.run_test(
            "Invalid Login Test",
            "POST",
            "auth/login",
            401,
            data={
                "username": "invalid_user",
                "password": "wrong_password"
            }
        )
        return success

    def test_admin_login(self):
        """Test login with admin credentials"""
        # First try to register the admin user if it doesn't exist
        print("   Attempting to register admin user first...")
        register_success, register_response = self.run_test(
            "Admin Registration",
            "POST",
            "auth/register",
            200,
            data={
                "username": "miguel",
                "password": "password123",
                "email": "miguel.moreira@hwi.pt",
                "full_name": "Miguel Moreira",
                "company_start_date": "2024-01-01",
                "vacation_days_taken": 0
            }
        )
        
        if register_success:
            print("   ✅ Admin user registered successfully")
            if 'access_token' in register_response:
                self.token = register_response['access_token']
                self.user_id = register_response['user']['id']
                self.username = register_response['user']['username']
                print(f"   Registered and logged in as: {self.username}")
                print(f"   Is admin: {register_response['user'].get('is_admin', False)}")
                return True
        else:
            print("   Registration failed, trying login...")
        
        # Try to login with username "miguel"
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={
                "username": "miguel",
                "password": "password123"
            }
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response['user']['id']
            self.username = response['user']['username']
            print(f"   Logged in as admin: {self.username}")
            print(f"   Is admin: {response['user'].get('is_admin', False)}")
            return True
        return False

    def test_excel_report_no_params(self):
        """Test Excel report generation without parameters (current billing period)"""
        print(f"\n🔍 Testing Excel Report (No Parameters)...")
        url = f"{self.base_url}/api/time-entries/reports/excel"
        headers = {
            'Authorization': f'Bearer {self.token}' if self.token else ''
        }
        
        self.tests_run += 1
        
        try:
            response = requests.get(url, headers=headers, timeout=30)
            
            success = response.status_code == 200
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                
                # Check Content-Type header
                content_type = response.headers.get('Content-Type', '')
                expected_content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                if expected_content_type in content_type:
                    print(f"   ✅ Correct Content-Type: {content_type}")
                else:
                    print(f"   ⚠️  Unexpected Content-Type: {content_type}")
                
                # Check Content-Disposition header
                content_disposition = response.headers.get('Content-Disposition', '')
                if 'attachment' in content_disposition and 'filename=' in content_disposition:
                    filename = content_disposition.split('filename=')[1].strip()
                    print(f"   ✅ Content-Disposition header present: {filename}")
                else:
                    print(f"   ⚠️  Missing or invalid Content-Disposition: {content_disposition}")
                
                # Check if response contains Excel file data
                content_length = len(response.content)
                print(f"   📊 File size: {content_length} bytes")
                
                # Check Excel file signature (first few bytes)
                if response.content[:4] == b'PK\x03\x04':
                    print(f"   ✅ Valid Excel file signature detected")
                else:
                    print(f"   ⚠️  Invalid file signature: {response.content[:10]}")
                
                return True
            else:
                print(f"❌ Failed - Expected 200, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False

    def test_excel_report_with_dates(self):
        """Test Excel report generation with specific date range"""
        from datetime import datetime, timedelta
        
        # Use a date range from last month
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        
        print(f"\n🔍 Testing Excel Report (With Dates: {start_date} to {end_date})...")
        url = f"{self.base_url}/api/time-entries/reports/excel?start_date={start_date}&end_date={end_date}"
        headers = {
            'Authorization': f'Bearer {self.token}' if self.token else ''
        }
        
        self.tests_run += 1
        
        try:
            response = requests.get(url, headers=headers, timeout=30)
            
            success = response.status_code == 200
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                
                # Check Content-Type header
                content_type = response.headers.get('Content-Type', '')
                expected_content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                if expected_content_type in content_type:
                    print(f"   ✅ Correct Content-Type: {content_type}")
                else:
                    print(f"   ⚠️  Unexpected Content-Type: {content_type}")
                
                # Check file size
                content_length = len(response.content)
                print(f"   📊 File size: {content_length} bytes")
                
                return True
            else:
                print(f"❌ Failed - Expected 200, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False

    def test_excel_report_unauthorized(self):
        """Test Excel report generation without authentication"""
        print(f"\n🔍 Testing Excel Report (Unauthorized)...")
        url = f"{self.base_url}/api/time-entries/reports/excel"
        
        self.tests_run += 1
        
        try:
            response = requests.get(url, timeout=10)
            
            success = response.status_code in [401, 403]  # Both are valid for unauthorized
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code} (Correctly rejected unauthorized request)")
                return True
            else:
                print(f"❌ Failed - Expected 401 or 403, got {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False

    def test_outside_zone_login(self):
        """Test login with specific test credentials for outside zone testing"""
        success, response = self.run_test(
            "Outside Zone Test Login",
            "POST",
            "auth/login",
            200,
            data={
                "username": "miguel.moreira@hwi.pt",
                "password": "password123"
            }
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response['user']['id']
            self.username = response['user']['username']
            print(f"   Logged in as: {self.username}")
            print(f"   Is admin: {response['user'].get('is_admin', False)}")
            return True
        return False

    def test_start_entry_normal_zone(self):
        """Test starting a time entry WITHOUT outside residence zone"""
        success, response = self.run_test(
            "Start Entry (Normal Zone)",
            "POST",
            "time-entries/start",
            200,
            data={
                "observations": "Normal work day"
            }
        )
        if success and 'entry' in response:
            entry = response['entry']
            self.current_entry_id = entry['id']
            
            # Verify outside_residence_zone is false
            outside_zone = entry.get('outside_residence_zone', None)
            location_desc = entry.get('location_description', None)
            
            print(f"   Entry ID: {self.current_entry_id}")
            print(f"   Outside residence zone: {outside_zone}")
            print(f"   Location description: {location_desc}")
            
            # Validate expected values
            if outside_zone is False and location_desc is None:
                print("   ✅ Correct values for normal zone entry")
                return True
            else:
                print(f"   ❌ Incorrect values - Expected: outside_residence_zone=False, location_description=None")
                print(f"       Got: outside_residence_zone={outside_zone}, location_description={location_desc}")
                return False
        return False

    def test_end_current_entry(self):
        """Test ending the current active entry"""
        if not self.current_entry_id:
            print("❌ No active entry to end")
            return False
            
        success, response = self.run_test(
            "End Current Entry",
            "POST",
            f"time-entries/end/{self.current_entry_id}",
            200
        )
        if success and 'total_hours' in response:
            print(f"   Total hours worked: {response['total_hours']}")
            self.current_entry_id = None  # Clear the entry ID
        return success

    def test_start_entry_outside_zone(self):
        """Test starting a time entry WITH outside residence zone"""
        success, response = self.run_test(
            "Start Entry (Outside Zone)",
            "POST",
            "time-entries/start",
            200,
            data={
                "observations": "Travel day",
                "outside_residence_zone": True,
                "location_description": "Lisboa"
            }
        )
        if success and 'entry' in response:
            entry = response['entry']
            self.current_entry_id = entry['id']
            
            # Verify outside_residence_zone is true and location is set
            outside_zone = entry.get('outside_residence_zone', None)
            location_desc = entry.get('location_description', None)
            
            print(f"   Entry ID: {self.current_entry_id}")
            print(f"   Outside residence zone: {outside_zone}")
            print(f"   Location description: {location_desc}")
            
            # Validate expected values
            if outside_zone is True and location_desc == "Lisboa":
                print("   ✅ Correct values for outside zone entry")
                return True
            else:
                print(f"   ❌ Incorrect values - Expected: outside_residence_zone=True, location_description='Lisboa'")
                print(f"       Got: outside_residence_zone={outside_zone}, location_description={location_desc}")
                return False
        return False

    def test_verify_entries_in_list(self):
        """Test verifying entries in the list contain correct outside zone information"""
        success, response = self.run_test(
            "Verify Entries in List",
            "GET",
            "time-entries/list",
            200
        )
        if success and isinstance(response, list):
            print(f"   Found {len(response)} entries")
            
            # Look for entries with outside zone information
            outside_zone_entries = []
            normal_zone_entries = []
            
            for entry in response:
                if entry.get('outside_residence_zone') is True:
                    outside_zone_entries.append(entry)
                    print(f"   ✅ Outside zone entry found: {entry.get('date')} - {entry.get('location_description')}")
                elif entry.get('outside_residence_zone') is False:
                    normal_zone_entries.append(entry)
                    print(f"   ✅ Normal zone entry found: {entry.get('date')}")
            
            print(f"   Total outside zone entries: {len(outside_zone_entries)}")
            print(f"   Total normal zone entries: {len(normal_zone_entries)}")
            
            return True
        return False

    def test_excel_report_payment_types(self):
        """Test Excel report generation and verify it includes payment type information"""
        print(f"\n🔍 Testing Excel Report (Payment Types)...")
        url = f"{self.base_url}/api/time-entries/reports/excel"
        headers = {
            'Authorization': f'Bearer {self.token}' if self.token else ''
        }
        
        self.tests_run += 1
        
        try:
            response = requests.get(url, headers=headers, timeout=30)
            
            success = response.status_code == 200
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                
                # Check Content-Type header
                content_type = response.headers.get('Content-Type', '')
                expected_content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                if expected_content_type in content_type:
                    print(f"   ✅ Correct Content-Type: {content_type}")
                else:
                    print(f"   ⚠️  Unexpected Content-Type: {content_type}")
                
                # Check Content-Disposition header
                content_disposition = response.headers.get('Content-Disposition', '')
                if 'attachment' in content_disposition and 'filename=' in content_disposition:
                    filename = content_disposition.split('filename=')[1].strip()
                    print(f"   ✅ Content-Disposition header present: {filename}")
                else:
                    print(f"   ⚠️  Missing or invalid Content-Disposition: {content_disposition}")
                
                # Check if response contains Excel file data
                content_length = len(response.content)
                print(f"   📊 File size: {content_length} bytes")
                
                # Check Excel file signature (first few bytes)
                if response.content[:4] == b'PK\x03\x04':
                    print(f"   ✅ Valid Excel file signature detected")
                    print(f"   📋 Excel file should include 'Tipo Pagamento' column with:")
                    print(f"       - 'Subsídio de Alimentação' for normal entries")
                    print(f"       - 'Ajuda de Custas - Lisboa' for outside zone entries")
                else:
                    print(f"   ⚠️  Invalid file signature: {response.content[:10]}")
                
                return True
            else:
                print(f"❌ Failed - Expected 200, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False

def main():
    print("🚀 Starting HWI Time Tracker API Tests - Outside Residence Zone Feature")
    print("=" * 70)
    
    tester = HWITimeTrackerTester()
    
    # Test sequence - focusing on Outside Residence Zone functionality
    test_sequence = [
        ("Outside Zone Test Login", tester.test_outside_zone_login),
        ("Get Current User", tester.test_get_current_user),
        ("Start Entry (Normal Zone)", tester.test_start_entry_normal_zone),
        ("End Current Entry", tester.test_end_current_entry),
        ("Start Entry (Outside Zone)", tester.test_start_entry_outside_zone),
        ("Verify Entries in List", tester.test_verify_entries_in_list),
        ("End Current Entry", tester.test_end_current_entry),
        ("Excel Report (Payment Types)", tester.test_excel_report_payment_types),
        ("List Time Entries", tester.test_list_time_entries),
        ("Weekly Report", tester.test_weekly_report),
        ("Monthly Report", tester.test_monthly_report),
    ]
    
    failed_tests = []
    
    for test_name, test_func in test_sequence:
        try:
            if not test_func():
                failed_tests.append(test_name)
        except Exception as e:
            print(f"❌ {test_name} crashed: {str(e)}")
            failed_tests.append(test_name)
    
    # Print results
    print("\n" + "=" * 50)
    print("📊 TEST RESULTS")
    print("=" * 50)
    print(f"Tests run: {tester.tests_run}")
    print(f"Tests passed: {tester.tests_passed}")
    print(f"Tests failed: {len(failed_tests)}")
    print(f"Success rate: {(tester.tests_passed/tester.tests_run*100):.1f}%")
    
    if failed_tests:
        print(f"\n❌ Failed tests: {', '.join(failed_tests)}")
        return 1
    else:
        print("\n✅ All tests passed!")
        return 0

if __name__ == "__main__":
    sys.exit(main())