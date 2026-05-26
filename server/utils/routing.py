import math
import os
import json
import requests
import logging

logger = logging.getLogger(__name__)

COORDS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "port_coordinates.json")

# Initial fallback dictionary
INITIAL_COORDINATES = {
    "INMAA": (13.0827, 80.2707),   # Chennai, India
    "SGSIN": (1.2903, 103.8520),   # Singapore
    "CNNGB": (29.8683, 121.5440),  # Ningbo, China
    "CNSHA": (31.2304, 121.4737),  # Shanghai, China
    "KRPUS": (35.1028, 129.0403),  # Busan, South Korea
    "JPYOK": (35.4437, 139.6380),  # Yokohama, Japan
    "NLRTM": (51.9244, 4.4777),    # Rotterdam, Netherlands
    "USLAX": (33.7405, -118.2750), # Los Angeles, USA
}

def load_coordinates():
    if os.path.exists(COORDS_FILE):
        try:
            with open(COORDS_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error("Failed to load port_coordinates.json: %s", e)
            return INITIAL_COORDINATES.copy()
    else:
        save_coordinates(INITIAL_COORDINATES)
        return INITIAL_COORDINATES.copy()

def save_coordinates(coords):
    try:
        os.makedirs(os.path.dirname(COORDS_FILE), exist_ok=True)
        with open(COORDS_FILE, "w") as f:
            json.stringify = json.dump(coords, f, indent=4)
    except Exception as e:
        logger.error("Failed to save port_coordinates.json: %s", e)

def fetch_coordinates(port_code: str):
    """Fallback to OpenStreetMap Nominatim to get coordinates for a new port."""
    try:
        headers = {"User-Agent": "PortSystemTracker/1.0 (contact@example.com)"}
        # Searching by UN/LOCODE directly is hit-or-miss, but often works if it's a known port.
        url = f"https://nominatim.openstreetmap.org/search?q=port+of+{port_code}&format=json&limit=1"
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data and len(data) > 0:
                return (float(data[0]["lat"]), float(data[0]["lon"]))
    except Exception as e:
        logger.error("Error fetching coordinates for %s: %s", port_code, e)
    return None

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    
    dlon = lon2_rad - lon1_rad
    dlat = lat2_rad - lat1_rad
    
    a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    distance = R * c
    return distance

def sort_ports_nearest_neighbor(ports: list[str], start_port: str = None) -> list[str]:
    if not ports:
        return []
        
    coords_db = load_coordinates()
    updated = False
    
    # Try to resolve any unknown ports
    for port in set(ports):
        if port not in coords_db:
            new_coords = fetch_coordinates(port)
            if new_coords:
                coords_db[port] = new_coords
                updated = True
                
    if updated:
        save_coordinates(coords_db)
    
    # Only keep ports we know, others will just be appended at the end
    known_ports = [p for p in set(ports) if p in coords_db]
    unknown_ports = [p for p in set(ports) if p not in coords_db]
    
    if not known_ports:
        return unknown_ports
        
    sorted_ports = []
    # Start from start_port or INMAA
    if start_port and start_port in coords_db:
        current_loc = coords_db[start_port]
    else:
        current_loc = coords_db.get("INMAA", (13.0827, 80.2707))
    
    unvisited = known_ports.copy()
    
    while unvisited:
        closest_port = None
        min_dist = float('inf')
        
        for port in unvisited:
            coords = coords_db[port]
            dist = haversine(current_loc[0], current_loc[1], coords[0], coords[1])
            if dist < min_dist:
                min_dist = dist
                closest_port = port
                
        sorted_ports.append(closest_port)
        current_loc = coords_db[closest_port]
        unvisited.remove(closest_port)
        
    return sorted_ports + unknown_ports
