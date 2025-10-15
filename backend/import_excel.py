"""
Import time entries from old Excel format
"""
import pandas as pd
from datetime import datetime, timedelta, time
import logging

def excel_date_to_python(excel_date):
    """Convert Excel serial date to Python date"""
    # Excel's epoch is 1899-12-30 (not 1900-01-01 due to a bug they kept for compatibility)
    if isinstance(excel_date, (int, float)):
        return datetime(1899, 12, 30) + timedelta(days=excel_date)
    return excel_date

def excel_time_to_python(excel_time):
    """Convert Excel decimal time to Python time (HH:MM)"""
    if pd.isna(excel_time) or excel_time == '' or excel_time == 0:
        return None
    
    # Excel time is stored as fraction of a day
    if isinstance(excel_time, (int, float)):
        total_seconds = excel_time * 24 * 3600
        hours = int(total_seconds // 3600)
        minutes = int((total_seconds % 3600) // 60)
        return f"{hours:02d}:{minutes:02d}"
    
    return None

def parse_excel_timesheet(file_path, username="Miguel Moreira"):
    """
    Parse the old Excel timesheet format and extract time entries
    
    Returns: List of dict with structure:
    {
        'date': 'YYYY-MM-DD',
        'time_entries': [{'start_time': 'HH:MM', 'end_time': 'HH:MM'}, ...],
        'outside_residence_zone': bool,
        'location_description': str or None
    }
    """
    try:
        # Read Excel file
        df = pd.read_excel(file_path, header=None)
        
        entries_list = []
        
        # Try to find the data rows (usually starting around row 10-15)
        # Look for rows with date serial numbers in the first column
        for idx, row in df.iterrows():
            try:
                # Check if first column contains a date number (Excel serial date)
                first_col = row[0]
                
                # Skip if not a number or if it's a header/label
                if pd.isna(first_col) or not isinstance(first_col, (int, float)):
                    continue
                
                # Check if it looks like an Excel date (typically between 40000-50000 for 2010-2040)
                if first_col < 40000 or first_col > 50000:
                    continue
                
                # Convert date
                entry_date = excel_date_to_python(first_col)
                date_str = entry_date.strftime('%Y-%m-%d')
                
                # Look for location info (Madrid, Valencia, etc.)
                location = None
                outside_zone = False
                
                # Check columns for location names
                row_str = ' '.join([str(x).upper() for x in row if pd.notna(x)])
                if 'MADRID' in row_str:
                    location = 'Madrid'
                    outside_zone = True
                elif 'VALENCIA' in row_str or 'VALÊNCIA' in row_str:
                    location = 'Valencia'
                    outside_zone = True
                
                # Skip vacation days
                if 'FERIAS' in row_str or 'FÉRIAS' in row_str:
                    continue
                
                # Extract time entries (Ent/Sai pairs)
                # Usually columns 2-9 contain time data
                time_pairs = []
                
                # Try to find pairs of Entry/Exit times
                # Format: Usually columns with decimal numbers between 0 and 1
                for i in range(1, min(len(row), 20)):
                    col_val = row[i]
                    
                    # Check if this looks like a time value (0 < x < 1)
                    if isinstance(col_val, (int, float)) and 0 < col_val < 1:
                        # This might be a start time, look for the next time value
                        start_time = excel_time_to_python(col_val)
                        
                        # Look for end time in next columns
                        for j in range(i+1, min(i+4, len(row))):
                            end_val = row[j]
                            if isinstance(end_val, (int, float)) and 0 < end_val < 1:
                                end_time = excel_time_to_python(end_val)
                                if start_time and end_time:
                                    time_pairs.append({
                                        'start_time': start_time,
                                        'end_time': end_time
                                    })
                                break
                
                # Only add if we found valid time entries
                if time_pairs:
                    entries_list.append({
                        'date': date_str,
                        'time_entries': time_pairs,
                        'outside_residence_zone': outside_zone,
                        'location_description': location
                    })
                    
            except Exception as e:
                logging.warning(f"Error processing row {idx}: {str(e)}")
                continue
        
        return {
            'success': True,
            'entries': entries_list,
            'total_days': len(entries_list)
        }
        
    except Exception as e:
        logging.error(f"Error parsing Excel file: {str(e)}")
        return {
            'success': False,
            'error': str(e),
            'entries': []
        }
