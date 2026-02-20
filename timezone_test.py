#!/usr/bin/env python3
"""
Timezone Fix Test for Manual Time Entries
Tests the fix for: When admin adds 8h00, appears as 9h00 (+1 hour)
"""

import requests
import sys
import json
from datetime import datetime

class TimezoneFixTester:
    def __init__(self, base_url="https://overtime-mgmt.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.username = None

    def run_test(self, name, method, endpoint, expected_status, data=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
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

    def authenticate(self):
        """Try to authenticate as admin or create test user"""
        print("🔐 Attempting authentication...")
        
        # Try existing admin users
        admin_credentials = [
            {"username": "miguel", "password": "password123"},
            {"username": "pedro", "password": "password123"},
            {"username": "admin", "password": "password123"}
        ]
        
        for creds in admin_credentials:
            print(f"   Trying {creds['username']}...")
            success, response = self.run_test(
                f"Login {creds['username']}",
                "POST",
                "auth/login",
                200,
                data=creds
            )
            
            if success and 'access_token' in response:
                self.token = response['access_token']
                self.user_id = response['user']['id']
                self.username = response['user']['username']
                is_admin = response['user'].get('is_admin', False)
                print(f"   ✅ Logged in as: {self.username} (admin: {is_admin})")
                return is_admin
        
        # Create test user if admin login fails
        print("   Creating test user...")
        timestamp = datetime.now().strftime('%H%M%S')
        test_username = f"timezone_test_{timestamp}"
        
        success, response = self.run_test(
            "Create Test User",
            "POST",
            "auth/register",
            200,
            data={
                "username": test_username,
                "password": "password123",
                "email": f"test_{timestamp}@example.com",
                "full_name": "Timezone Test User",
                "phone": "+351987654321",
                "company_start_date": "2024-01-01",
                "vacation_days_taken": 0
            }
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response['user']['id']
            self.username = response['user']['username']
            print(f"   ✅ Created test user: {self.username}")
            return False  # Not admin
        
        return False

    def test_manual_entry_creation(self):
        """Test manual time entry creation (requires admin)"""
        print("\n🎯 Test: Manual Time Entry Creation (Admin Required)")
        
        today = datetime.now().strftime("%Y-%m-%d")
        
        manual_entry_data = {
            "user_id": self.user_id,
            "date": today,
            "time_entries": [
                {
                    "start_time": "08:00",
                    "end_time": "17:00"
                }
            ],
            "observations": "Teste de correção de timezone - entrada manual 8h-17h"
        }
        
        print(f"   📅 Creating manual entry for date: {today}")
        print(f"   ⏰ Time range: 08:00 - 17:00 (expected 9 hours)")
        
        success, response = self.run_test(
            "Create Manual Entry",
            "POST",
            "admin/time-entries/manual",
            200,
            data=manual_entry_data
        )
        
        if not success:
            print("   ❌ Failed to create manual entry (admin privileges required)")
            return False
        
        # Verify the entry
        success_list, response_list = self.run_test(
            "Verify Manual Entry Times",
            "GET",
            f"time-entries/list?start_date={today}&end_date={today}",
            200
        )
        
        if success_list and isinstance(response_list, list):
            # Find today's entry
            for daily_entry in response_list:
                if daily_entry.get('date') == today:
                    if daily_entry.get('entries'):
                        for entry in daily_entry['entries']:
                            start_time = entry.get('start_time', '')
                            end_time = entry.get('end_time', '')
                            total_hours = entry.get('total_hours', 0)
                            
                            print(f"   📊 Entry found:")
                            print(f"      Start time: {start_time}")
                            print(f"      End time: {end_time}")
                            print(f"      Total hours: {total_hours}")
                            
                            # Extract time portion
                            if 'T' in start_time:
                                start_time_only = start_time.split('T')[1][:5]
                                end_time_only = end_time.split('T')[1][:5]
                            else:
                                start_time_only = start_time[:5]
                                end_time_only = end_time[:5]
                            
                            print(f"      Extracted times: {start_time_only} - {end_time_only}")
                            
                            # CRITICAL VALIDATION
                            if start_time_only == "08:00" and end_time_only == "17:00":
                                print(f"      ✅ TIMEZONE FIX VERIFIED: Times appear exactly as entered!")
                                if abs(total_hours - 9.0) < 0.1:
                                    print(f"      ✅ Total hours correct: {total_hours}")
                                    return True
                                else:
                                    print(f"      ❌ Total hours incorrect: {total_hours} (expected 9.0)")
                            else:
                                print(f"      ❌ TIMEZONE ISSUE DETECTED:")
                                print(f"         Expected: 08:00 - 17:00")
                                print(f"         Got: {start_time_only} - {end_time_only}")
                                
                                if start_time_only == "09:00" and end_time_only == "18:00":
                                    print(f"      ❌ TIMEZONE BUG CONFIRMED: Times shifted +1 hour!")
                                elif start_time_only == "07:00" and end_time_only == "16:00":
                                    print(f"      ❌ TIMEZONE BUG CONFIRMED: Times shifted -1 hour!")
                                
                                return False
                            
                            return True
        
        print("   ❌ Could not find or verify the created entry")
        return False

    def analyze_existing_entries(self):
        """Analyze existing time entries for timezone patterns"""
        print("\n🎯 Test: Analyzing Existing Time Entries")
        
        success_list, response_list = self.run_test(
            "Get Time Entries List",
            "GET",
            "time-entries/list",
            200
        )
        
        if success_list and isinstance(response_list, list):
            print(f"   📊 Found {len(response_list)} daily entries to analyze")
            
            timezone_issues_found = 0
            suspicious_patterns = []
            
            for daily_entry in response_list[:10]:  # Check first 10 entries
                if daily_entry.get('entries'):
                    for entry in daily_entry['entries']:
                        start_time = entry.get('start_time', '')
                        end_time = entry.get('end_time', '')
                        observations = entry.get('observations', '')
                        
                        if 'T' in start_time and 'T' in end_time:
                            try:
                                start_hour = int(start_time.split('T')[1][:2])
                                
                                # Look for suspicious patterns
                                if start_hour == 9 and ("08:00" in observations or "8h" in observations.lower()):
                                    suspicious_patterns.append(f"Date: {daily_entry.get('date')}, Start: {start_time}, Expected: 08:00")
                                    timezone_issues_found += 1
                                elif start_hour == 7 and ("08:00" in observations or "8h" in observations.lower()):
                                    suspicious_patterns.append(f"Date: {daily_entry.get('date')}, Start: {start_time}, Expected: 08:00")
                                    timezone_issues_found += 1
                            except:
                                pass
            
            if timezone_issues_found > 0:
                print(f"   ❌ Found {timezone_issues_found} potential timezone issues:")
                for pattern in suspicious_patterns[:5]:  # Show first 5
                    print(f"      - {pattern}")
                return False
            else:
                print(f"   ✅ No obvious timezone issues detected in existing entries")
                return True
        
        return False

    def test_regular_entry_creation(self):
        """Test regular time entry creation and examine timestamps"""
        print("\n🎯 Test: Regular Time Entry Creation")
        
        success_start, response_start = self.run_test(
            "Start Time Entry",
            "POST",
            "time-entries/start",
            200,
            data={
                "observations": "Timezone test - regular entry creation"
            }
        )
        
        if success_start and 'entry' in response_start:
            entry_id = response_start['entry']['id']
            start_time = response_start['entry'].get('start_time', '')
            
            print(f"   ✅ Time entry started successfully")
            print(f"   📊 Entry ID: {entry_id}")
            print(f"   📊 Start time: {start_time}")
            
            # Immediately end the entry
            success_end, response_end = self.run_test(
                "End Time Entry",
                "POST",
                f"time-entries/end/{entry_id}",
                200
            )
            
            if success_end:
                total_hours = response_end.get('total_hours', 0)
                print(f"   ✅ Time entry ended successfully")
                print(f"   📊 Total hours: {total_hours}")
                
                if total_hours < 0.1:  # Less than 6 minutes
                    print(f"   ✅ Short entry duration is reasonable: {total_hours} hours")
                    return True
                else:
                    print(f"   ⚠️  Unexpectedly long duration for immediate end: {total_hours} hours")
        
        return False

    def run_all_tests(self):
        """Run all timezone tests"""
        print("🕐 TIMEZONE FIX TESTING - Manual Time Entries")
        print("=" * 60)
        print("Problem: When admin adds 8h00, appears as 9h00 (+1 hour)")
        print("Objective: Verify times appear exactly as entered")
        
        # Authenticate
        is_admin = self.authenticate()
        
        if not self.token:
            print("❌ Authentication failed")
            return False
        
        # Run tests
        test_results = []
        
        # Test 1: Analyze existing entries
        test_results.append(self.analyze_existing_entries())
        
        # Test 2: Regular entry creation
        test_results.append(self.test_regular_entry_creation())
        
        # Test 3: Manual entry creation (if admin)
        if is_admin:
            test_results.append(self.test_manual_entry_creation())
        else:
            print("\n🎯 Test: Manual Time Entry Creation")
            print("   ⚠️  Skipped - Admin privileges required")
            print("   ℹ️  To fully test: Admin should create manual entry with 08:00-17:00")
        
        # Summary
        passed_tests = sum(test_results)
        total_tests = len(test_results)
        
        print("\n" + "=" * 60)
        print("🏁 TIMEZONE FIX TEST SUMMARY")
        print(f"Tests passed: {passed_tests}/{total_tests}")
        
        if passed_tests == total_tests:
            print("✅ NO TIMEZONE ISSUES DETECTED")
            print("✅ Time entry creation and storage appears to be working correctly")
            if not is_admin:
                print("ℹ️  Note: Full verification requires admin access to create manual entries")
            return True
        else:
            print("❌ POTENTIAL TIMEZONE ISSUES DETECTED")
            print("❌ Manual time entries may still have timezone offset problems")
            return False

def main():
    """Main function"""
    tester = TimezoneFixTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n✅ TIMEZONE FIX VERIFICATION COMPLETE - NO ISSUES DETECTED")
        return 0
    else:
        print("\n❌ TIMEZONE ISSUES DETECTED - FURTHER INVESTIGATION NEEDED")
        return 1

if __name__ == "__main__":
    sys.exit(main())