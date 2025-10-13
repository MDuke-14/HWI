"""
European countries and their timezone offsets relative to Portugal
Portugal is the reference (offset = 0)
"""

EUROPEAN_COUNTRIES = {
    # Same timezone as Portugal
    "Portugal": {"offset": 0},
    "Reino Unido": {"offset": 0},
    "Irlanda": {"offset": 0},
    
    # +1 hour ahead of Portugal
    "Espanha": {"offset": 1},
    "França": {"offset": 1},
    "Alemanha": {"offset": 1},
    "Itália": {"offset": 1},
    "Holanda": {"offset": 1},
    "Bélgica": {"offset": 1},
    "Áustria": {"offset": 1},
    "Suíça": {"offset": 1},
    "República Checa": {"offset": 1},
    "Polónia": {"offset": 1},
    "Dinamarca": {"offset": 1},
    "Noruega": {"offset": 1},
    "Suécia": {"offset": 1},
    
    # +2 hours ahead of Portugal
    "Grécia": {"offset": 2},
    "Finlândia": {"offset": 2},
    "Roménia": {"offset": 2},
    "Bulgária": {"offset": 2},
}

def get_country_offset(country: str, is_dst: bool = False) -> int:
    """
    Get timezone offset for a country relative to Portugal
    
    Args:
        country: Country name
        is_dst: Not used - kept for compatibility
        
    Returns:
        Offset in hours relative to Portugal
    """
    country_info = EUROPEAN_COUNTRIES.get(country)
    if not country_info:
        return 0  # Default to Portugal timezone if country not found
    
    return country_info["offset"]

def is_dst_active(dt) -> bool:
    """
    Kept for compatibility - not used anymore
    All offsets are now relative to Portugal
    """
    return False

def get_countries_list():
    """Get list of available countries"""
    return list(EUROPEAN_COUNTRIES.keys())
