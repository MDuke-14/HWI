"""
Tests for early_leave_credit visual display in reports.
- PDF (monthly-pdf): credit entry rendered with red <font color="#dc2626"> and credit auto-obs removed
- Detailed JSON (monthly-detailed): is_early_leave_credit=true exposed
- Excel (monthly-excel): start/end cells with red bold font (FFDC2626)
"""
import os
import io
import pytest
import requests
from openpyxl import load_workbook

def _load_backend_url():
    url = os.environ.get('REACT_APP_BACKEND_URL')
    if not url:
        try:
            with open('/app/frontend/.env') as f:
                for line in f:
                    if line.startswith('REACT_APP_BACKEND_URL='):
                        url = line.split('=', 1)[1].strip()
                        break
        except FileNotFoundError:
            pass
    assert url, "REACT_APP_BACKEND_URL missing"
    return url.rstrip('/')

BASE_URL = _load_backend_url()
EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "teste@email.com")
PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "Admin123!")
MONTH = 6
YEAR = 2026
TARGET_DATE = "2026-06-25"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---- Monthly detailed JSON ----
class TestMonthlyDetailed:
    def test_credit_entry_flagged(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/time-entries/reports/monthly-detailed",
            params={"month": MONTH, "year": YEAR}, headers=headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        day = next((d for d in data["daily_records"] if d["date"] == TARGET_DATE), None)
        assert day is not None, "Day 2026-06-25 missing"
        assert day["status"] == "TRABALHADO"
        entries = day.get("entries") or []
        assert len(entries) == 3, f"expected 3 entries, got {len(entries)}"
        credits = [e for e in entries if e.get("is_early_leave_credit")]
        assert len(credits) == 1, "exactly 1 credit entry expected"
        # The credit entry should be the last by start_time
        assert entries[-1].get("is_early_leave_credit") is True
        # Non-credit entries have is_early_leave_credit False/None
        for e in entries[:-1]:
            assert not e.get("is_early_leave_credit")


# ---- Monthly PDF ----
class TestMonthlyPDF:
    @pytest.fixture(scope="class")
    def pdf_bytes(self):
        r = requests.get(
            f"{BASE_URL}/api/time-entries/reports/monthly-pdf",
            params={"month": MONTH, "year": YEAR},
            headers={"Authorization": f"Bearer {self._token()}"},
            timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert r.content[:4] == b"%PDF", "not a PDF file"
        return r.content

    @staticmethod
    def _token():
        r = requests.post(f"{BASE_URL}/api/auth/login",
                         json={"username": EMAIL, "password": PASSWORD}, timeout=30)
        return r.json()["access_token"]

    def test_pdf_status_and_header(self, pdf_bytes):
        assert pdf_bytes.startswith(b"%PDF-1.4") or pdf_bytes.startswith(b"%PDF-")

    def test_pdf_contains_credit_red_color(self, pdf_bytes):
        # Extract text from PDF
        try:
            from pypdf import PdfReader
        except ImportError:
            from PyPDF2 import PdfReader
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text = "".join(p.extract_text() or "" for p in reader.pages)
        # All 3 time ranges should appear
        assert "08:00-13:00" in text, "first range missing"
        assert "14:00-16:00" in text, "second range missing"
        assert "16:00-17:00" in text, "credit range missing"
        # Day 25/06 present
        assert "25/06" in text

    def test_pdf_does_not_contain_credit_auto_obs(self, pdf_bytes):
        try:
            from pypdf import PdfReader
        except ImportError:
            from PyPDF2 import PdfReader
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text = "".join(p.extract_text() or "" for p in reader.pages)
        # The automatic credit observation must NOT appear
        assert "Crédito automático" not in text, "auto-credit observation leaked into PDF"
        assert "saída antecipada por ordem da empresa" not in text
        # But the real user observation (teste E2E) should still be visible
        assert "teste E2E" in text, "real user observation lost"

    def test_pdf_credit_has_red_color_marker(self, pdf_bytes):
        # Verify a red (~#dc2626) rg color op exists in any page content stream.
        try:
            from pypdf import PdfReader
        except ImportError:
            from PyPDF2 import PdfReader
        import re
        reader = PdfReader(io.BytesIO(pdf_bytes))
        red_found = False
        for page in reader.pages:
            contents = page.get_contents()
            if contents is None:
                continue
            streams = contents if isinstance(contents, list) else [contents]
            for c in streams:
                data = c.get_data()
                for m in re.findall(rb'([\d.]+) ([\d.]+) ([\d.]+) rg', data):
                    r_, g_, b_ = (float(x) for x in m)
                    if r_ > 0.8 and g_ < 0.2 and b_ < 0.2:
                        red_found = True
                        break
                if red_found:
                    break
            if red_found:
                break
        assert red_found, "red color (#dc2626) rg op not found in PDF content stream"


# ---- Monthly Excel ----
class TestMonthlyExcel:
    def test_excel_red_font_on_credit_cells(self, headers):
        # Endpoint is /api/time-entries/reports/excel (uses start_date/end_date billing period)
        r = requests.get(
            f"{BASE_URL}/api/time-entries/reports/excel",
            params={"start_date": "2026-06-01", "end_date": "2026-06-30"},
            headers=headers, timeout=60)
        if r.status_code == 404:
            pytest.skip("excel endpoint not present")
        assert r.status_code == 200, r.text[:300]
        wb = load_workbook(io.BytesIO(r.content))
        ws = wb.active
        # Find row where column A == 25 (day of month)
        target_row = None
        for row in range(4, 50):
            v = ws.cell(row=row, column=1).value
            if v == 25:
                target_row = row
                break
        assert target_row is not None, "row for day 25 not found"
        # Find credit cells (those with rgb color FFDC2626 + bold)
        credit_cells = []
        for col in range(3, 11):
            cell = ws.cell(row=target_row, column=col)
            color = cell.font.color
            if not color or getattr(color, "type", None) != "rgb":
                continue
            rgb = color.rgb
            if isinstance(rgb, str) and "DC2626" in rgb.upper():
                credit_cells.append((cell.value, rgb, cell.font.bold))
        assert len(credit_cells) >= 2, f"expected at least 2 red credit cells, got {credit_cells}"
        credit_values = [c[0] for c in credit_cells]
        assert "16:00" in credit_values and "17:00" in credit_values, \
            f"credit cell times not found: {credit_values}"
        for val, color, bold in credit_cells:
            assert bold is True, f"{val} not bold"


# ---- Regression on other days ----
class TestRegression:
    def test_other_days_not_marked_credit(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/time-entries/reports/monthly-detailed",
            params={"month": MONTH, "year": YEAR}, headers=headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        for day in data["daily_records"]:
            if day["date"] == TARGET_DATE:
                continue
            for e in (day.get("entries") or []):
                assert not e.get("is_early_leave_credit"), \
                    f"unexpected credit flag on {day['date']}"
