"""
Import time entries from PDF format
"""
import pdfplumber
import re
from datetime import datetime
import logging

def parse_pdf_timesheet(file_path, username="Miguel Moreira"):
    """
    Parse PDF timesheet and extract time entries
    
    Returns: List of dict with structure:
    {
        'date': 'YYYY-MM-DD',
        'time_entries': [{'start_time': 'HH:MM', 'end_time': 'HH:MM'}, ...],
        'outside_residence_zone': bool,
        'location_description': str or None
    }
    """
    try:
        entries_list = []
        current_location = None
        current_location_outside = False
        
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                # Extract text and tables
                text = page.extract_text()
                tables = page.extract_tables()
                
                logging.info(f"Processing PDF page with {len(tables)} tables")
                
                # Look for location markers in text
                if 'MADRID' in text.upper():
                    current_location = 'Madrid'
                    current_location_outside = True
                elif 'VALENCIA' in text.upper() or 'VALÊNCIA' in text.upper():
                    current_location = 'Valencia'
                    current_location_outside = True
                
                # Process tables
                for table_idx, table in enumerate(tables):
                    if not table:
                        continue
                    
                    logging.info(f"Processing table {table_idx} with {len(table)} rows")
                    
                    # Find header row (contains "Data", "Ent", "Sai")
                    header_idx = None
                    for idx, row in enumerate(table):
                        if row and any(cell and 'Data' in str(cell) for cell in row):
                            header_idx = idx
                            break
                    
                    if header_idx is None:
                        continue
                    
                    # Process data rows
                    for row_idx in range(header_idx + 1, len(table)):
                        row = table[row_idx]
                        if not row or len(row) < 3:
                            continue
                        
                        try:
                            # First column should be date
                            date_cell = str(row[0]).strip() if row[0] else ""
                            
                            # Match date format DD/MM/YYYY
                            date_match = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})', date_cell)
                            if not date_match:
                                continue
                            
                            day, month, year = date_match.groups()
                            date_str = f"{year}-{int(month):02d}-{int(day):02d}"
                            
                            logging.info(f"  Processing date: {date_str}")
                            
                            # Check for FERIAS (vacation)
                            row_text = ' '.join([str(cell).upper() for cell in row if cell])
                            if 'FERIAS' in row_text or 'FÉRIAS' in row_text:
                                logging.info(f"    Skipping vacation day")
                                continue
                            
                            # Extract time entries (Ent/Sai pairs)
                            # Usually in columns after date and day of week
                            time_values = []
                            for cell_idx in range(2, len(row)):
                                cell = str(row[cell_idx]).strip() if row[cell_idx] else ""
                                
                                # Match time format HH:MM or H:MM
                                time_match = re.search(r'(\d{1,2}):(\d{2})', cell)
                                if time_match:
                                    hours, minutes = time_match.groups()
                                    time_str = f"{int(hours):02d}:{int(minutes):02d}"
                                    time_values.append(time_str)
                            
                            logging.info(f"    Found {len(time_values)} times: {time_values}")
                            
                            # Create pairs (Ent-Sai, Ent-Sai, etc.)
                            time_pairs = []
                            i = 0
                            while i < len(time_values) - 1:
                                start_time = time_values[i]
                                end_time = time_values[i + 1]
                                
                                # Validate end > start
                                start_h, start_m = map(int, start_time.split(':'))
                                end_h, end_m = map(int, end_time.split(':'))
                                
                                if (end_h * 60 + end_m) > (start_h * 60 + start_m):
                                    time_pairs.append({
                                        'start_time': start_time,
                                        'end_time': end_time
                                    })
                                    logging.info(f"      Pair: {start_time} - {end_time}")
                                
                                i += 2
                            
                            # Only add if we have valid time entries
                            if time_pairs:
                                entries_list.append({
                                    'date': date_str,
                                    'time_entries': time_pairs,
                                    'outside_residence_zone': current_location_outside,
                                    'location_description': current_location
                                })
                                logging.info(f"    ✓ Added {len(time_pairs)} entries")
                                
                                # Reset location after adding entry
                                # (unless it's a multi-day trip, this is conservative)
                                current_location = None
                                current_location_outside = False
                            
                        except Exception as e:
                            logging.warning(f"Error processing row: {str(e)}")
                            continue
        
        logging.info(f"Total entries found from PDF: {len(entries_list)}")
        
        return {
            'success': True,
            'entries': entries_list,
            'total_days': len(entries_list)
        }
        
    except Exception as e:
        logging.error(f"Error parsing PDF file: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return {
            'success': False,
            'error': str(e),
            'entries': []
        }
