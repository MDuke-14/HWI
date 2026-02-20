import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix para ícones do Leaflet em React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Criar ícone com inicial do utilizador
const createInitialIcon = (initial, color, isEnd = false) => {
  const bgColor = isEnd ? '#ef4444' : '#3b82f6'; // Vermelho para fim, azul para início
  const borderColor = isEnd ? '#dc2626' : '#2563eb';
  
  return L.divIcon({
    className: 'custom-marker-initial',
    html: `<div style="
      background-color: ${color || bgColor};
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 3px solid ${borderColor};
      box-shadow: 0 3px 8px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
      color: white;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">${initial || '?'}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

// Ícones personalizados (mantidos para compatibilidade)
const createIcon = (color) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${color};
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

const icons = {
  green: createIcon('#22c55e'),
  blue: createIcon('#3b82f6'),
  red: createIcon('#ef4444'),
  orange: createIcon('#f97316'),
  purple: createIcon('#a855f7'),
  default: createIcon('#6b7280'),
};

// Extrair inicial do nome
const getInitial = (name) => {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
};

// Componente para ajustar o centro do mapa APENAS na primeira renderização
// ou quando as localizações mudam significativamente
const FitBoundsOnLoad = ({ locations, initialCenter, initialZoom }) => {
  const map = useMap();
  const hasInitialized = useRef(false);
  const prevLocationsCount = useRef(0);

  useEffect(() => {
    // Só ajusta a vista se:
    // 1. Ainda não inicializou, OU
    // 2. O número de localizações mudou significativamente (ex: de 0 para N ou vice-versa)
    const locationsChanged = prevLocationsCount.current === 0 && locations.length > 0;
    
    if (!hasInitialized.current || locationsChanged) {
      hasInitialized.current = true;
      prevLocationsCount.current = locations.length;
      
      if (locations.length > 1) {
        // Se há múltiplas localizações, ajusta para mostrar todas
        const validLocations = locations.filter(loc => loc.latitude && loc.longitude);
        if (validLocations.length > 1) {
          const bounds = L.latLngBounds(
            validLocations.map(loc => [loc.latitude, loc.longitude])
          );
          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
        } else if (validLocations.length === 1) {
          map.setView([validLocations[0].latitude, validLocations[0].longitude], initialZoom);
        }
      } else if (locations.length === 1 && locations[0].latitude && locations[0].longitude) {
        map.setView([locations[0].latitude, locations[0].longitude], initialZoom);
      } else if (initialCenter) {
        map.setView(initialCenter, initialZoom);
      }
    }
  }, [locations, initialCenter, initialZoom, map]);

  return null;
};

// Componente principal do mapa
const LocationMap = ({
  locations = [],
  center = null,
  zoom = 13,
  height = '400px',
  className = '',
  showAllMarkers = true,
  useInitials = false, // Nova prop para usar iniciais
}) => {
  // Centro padrão em Portugal se não houver localizações
  const defaultCenter = [38.7223, -9.1393]; // Lisboa
  
  // Calcular centro inicial baseado nas localizações
  const calculateInitialCenter = () => {
    if (center) return center;
    if (locations.length === 0) return defaultCenter;
    
    const validLocations = locations.filter(loc => loc.latitude && loc.longitude);
    if (validLocations.length === 0) return defaultCenter;
    
    const avgLat = validLocations.reduce((sum, loc) => sum + loc.latitude, 0) / validLocations.length;
    const avgLng = validLocations.reduce((sum, loc) => sum + loc.longitude, 0) / validLocations.length;
    
    return [avgLat, avgLng];
  };

  const initialCenter = calculateInitialCenter();

  // Função para obter o ícone apropriado
  const getMarkerIcon = (location) => {
    if (useInitials && location.userName) {
      const initial = getInitial(location.userName);
      const isEnd = location.type === 'Saída' || location.type === 'end' || location.isEnd;
      return createInitialIcon(initial, location.customColor, isEnd);
    }
    return icons[location.color] || icons.default;
  };

  return (
    <div className={`rounded-lg overflow-hidden ${className}`} style={{ height }}>
      <MapContainer
        center={initialCenter}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <FitBoundsOnLoad 
          locations={locations} 
          initialCenter={initialCenter} 
          initialZoom={zoom} 
        />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {showAllMarkers && locations.map((location, index) => {
          if (!location.latitude || !location.longitude) return null;
          
          const icon = getMarkerIcon(location);
          const isEnd = location.type === 'Saída' || location.type === 'end' || location.isEnd;
          
          return (
            <Marker
              key={location.id || `${location.latitude}-${location.longitude}-${index}`}
              position={[location.latitude, location.longitude]}
              icon={icon}
            >
              <Popup>
                <div className="text-sm min-w-[150px]">
                  {location.userName && (
                    <div className="flex items-center gap-2 mb-1">
                      <div 
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: isEnd ? '#ef4444' : '#3b82f6' }}
                      >
                        {getInitial(location.userName)}
                      </div>
                      <span className="font-bold text-gray-900">{location.userName}</span>
                    </div>
                  )}
                  {location.type && (
                    <p className="text-xs font-semibold mb-1" style={{ color: isEnd ? '#ef4444' : '#3b82f6' }}>
                      {isEnd ? '🔴 Saída' : '🔵 Entrada'}
                    </p>
                  )}
                  {location.address && (
                    <p className="text-gray-600 text-xs">{location.address}</p>
                  )}
                  {location.timestamp && (
                    <p className="text-xs text-gray-500 mt-1">
                      🕐 {new Date(location.timestamp).toLocaleString('pt-PT')}
                    </p>
                  )}
                  {location.entryId && (
                    <p className="text-xs text-gray-400 mt-1">
                      Registo: {location.entryId.substring(0, 8)}...
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

// Componente para mostrar um único local
export const SingleLocationMap = ({ latitude, longitude, title, subtitle, height = '200px' }) => {
  if (!latitude || !longitude) {
    return (
      <div 
        className="flex items-center justify-center bg-gray-800 rounded-lg text-gray-400"
        style={{ height }}
      >
        Localização não disponível
      </div>
    );
  }

  return (
    <LocationMap
      locations={[{
        latitude,
        longitude,
        userName: title,
        address: subtitle,
      }]}
      center={[latitude, longitude]}
      zoom={15}
      height={height}
    />
  );
};

export default LocationMap;
