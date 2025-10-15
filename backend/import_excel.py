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
        # Read Excel file without header
        df = pd.read_excel(file_path, header=None)
        
        logging.info(f"Excel file loaded. Shape: {df.shape}")
        logging.info(f"First row sample: {df.iloc[0].tolist()[:10]}")
        logging.info(f"Column 0 sample values: {df[0].tolist()[:20]}")
        logging.info(f"Column 1 sample values: {df[1].tolist()[:20]}")
        
        entries_list = []
        
        # Iterate through all rows
        for idx, row in df.iterrows():
            try:
                # Convert row to list and check for date-like numbers
                row_values = row.tolist()
                
                # Look for Excel date numbers (typically in first few columns)
                date_found = None
                date_col_idx = None
                
                for col_idx in range(min(5, len(row_values))):
                    val = row_values[col_idx]
                    
                    # Check if it's a number that looks like an Excel date
                    if isinstance(val, (int, float)) and not pd.isna(val):
                        # Excel dates for 2020-2030 are roughly 43000-47000
                        if 43000 <= val <= 48000:
                            date_found = val
                            date_col_idx = col_idx
                            break
                
                if not date_found:
                    continue
                
                # Convert date
                entry_date = excel_date_to_python(date_found)
                date_str = entry_date.strftime('%Y-%m-%d')
                
                # Log the row we're processing
                logging.info(f"Processing row {idx} for date {date_str}")
                
                # Check for location info
                location = None
                outside_zone = False
                row_str = ' '.join([str(x).upper() for x in row_values if pd.notna(x)])
                
                if 'MADRID' in row_str:
                    location = 'Madrid'
                    outside_zone = True
                elif 'VALENCIA' in row_str or 'VALÊNCIA' in row_str:
                    location = 'Valencia'
                    outside_zone = True
                
                # Skip vacation days
                if 'FERIAS' in row_str or 'FÉRIAS' in row_str:
                    logging.info(f"  Skipping vacation day: {date_str}")
                    continue
                
                # Find time entries - look for decimal numbers between 0 and 1 after the date column
                time_values = []
                for col_idx in range(date_col_idx + 1, len(row_values)):
                    val = row_values[col_idx]
                    if isinstance(val, (int, float)) and not pd.isna(val):
                        if 0 < val < 1:  # Time values are fractions of a day
                            time_values.append(val)
                
                logging.info(f"  Found {len(time_values)} time values: {time_values}")
                
                # Create pairs of start/end times
                time_pairs = []
                i = 0
                while i < len(time_values) - 1:
                    start_time = excel_time_to_python(time_values[i])
                    end_time = excel_time_to_python(time_values[i + 1])
                    
                    if start_time and end_time:
                        # Validate that end > start
                        start_h, start_m = map(int, start_time.split(':'))
                        end_h, end_m = map(int, end_time.split(':'))
                        
                        if (end_h * 60 + end_m) > (start_h * 60 + start_m):
                            time_pairs.append({
                                'start_time': start_time,
                                'end_time': end_time
                            })
                            logging.info(f"    Pair: {start_time} - {end_time}")
                    
                    i += 2  # Move to next pair
                
                # Only add if we found valid time entries
                if time_pairs:
                    entries_list.append({
                        'date': date_str,
                        'time_entries': time_pairs,
                        'outside_residence_zone': outside_zone,
                        'location_description': location
                    })
                    logging.info(f"  ✓ Added {len(time_pairs)} entries for {date_str}")
                else:
                    logging.info(f"  ✗ No valid time pairs found for {date_str}")
                    
            except Exception as e:
                logging.warning(f"Error processing row {idx}: {str(e)}")
                continue
        
        logging.info(f"Total entries found: {len(entries_list)}")
        
        return {
            'success': True,
            'entries': entries_list,
            'total_days': len(entries_list)
        }
        
    except Exception as e:
        logging.error(f"Error parsing Excel file: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return {
            'success': False,
            'error': str(e),
            'entries': []
        }
