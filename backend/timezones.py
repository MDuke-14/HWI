"""
European countries and their timezone offsets
"""

EUROPEAN_COUNTRIES = {
    # UTC+0 (Western European Time)
    "Portugal": {"offset": 0, "dst_offset": 1},
    "Reino Unido": {"offset": 0, "dst_offset": 1},
    "Irlanda": {"offset": 0, "dst_offset": 1},
    
    # UTC+1 (Central European Time)
    "Espanha": {"offset": 1, "dst_offset": 2},
    "França": {"offset": 1, "dst_offset": 2},
    "Alemanha": {"offset": 1, "dst_offset": 2},
    "Itália": {"offset": 1, "dst_offset": 2},
    "Holanda": {"offset": 1, "dst_offset": 2},
    "Bélgica": {"offset": 1, "dst_offset": 2},
    "Áustria": {"offset": 1, "dst_offset": 2},
    "Suíça": {"offset": 1, "dst_offset": 2},
    "República Checa": {"offset": 1, "dst_offset": 2},
    "Polónia": {"offset": 1, "dst_offset": 2},
    "Dinamarca": {"offset": 1, "dst_offset": 2},
    "Noruega": {"offset": 1, "dst_offset": 2},
    "Suécia": {"offset": 1, "dst_offset": 2},
    
    # UTC+2 (Eastern European Time)
    "Grécia": {"offset": 2, "dst_offset": 3},
    "Finlândia": {"offset": 2, "dst_offset": 3},
    "Roménia": {"offset": 2, "dst_offset": 3},
    "Bulgária": {"offset": 2, "dst_offset": 3},
}

def get_country_offset(country: str, is_dst: bool = False) -> int:
    """
    Get timezone offset for a country
    
    Args:
        country: Country name
        is_dst: Whether daylight saving time is active
        
    Returns:
        Offset in hours from UTC
    """
    country_info = EUROPEAN_COUNTRIES.get(country)
    if not country_info:
        return 0  # Default to UTC if country not found
    
    return country_info["dst_offset"] if is_dst else country_info["offset"]

def is_dst_active(dt) -> bool:
    """
    Check if daylight saving time is active for European countries
    DST in Europe: Last Sunday of March to last Sunday of October
    
    Args:
        dt: datetime object
        
    Returns:
        True if DST is active, False otherwise
    """
    month = dt.month
    
    # DST is active from end of March to end of October
    if month < 3 or month > 10:
        return False
    if month > 3 and month < 10:
        return True
    
    # For March and October, need to check the specific Sunday
    # Simplified: assume DST starts mid-March and ends mid-October
    if month == 3:
        return dt.day >= 25
    if month == 10:
        return dt.day < 25
    
    return False

def get_countries_list():
    """Get list of available countries"""
    return list(EUROPEAN_COUNTRIES.keys())
