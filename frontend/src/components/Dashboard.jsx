import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import UserRealtimePopup from '@/components/UserRealtimePopup';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Clock, Play, Square, Coffee, MapPin, Clipboard, Users, RefreshCw, BookOpen, Download, Map, Monitor, Smartphone } from 'lucide-react';
import { formatHours } from '@/utils/timeUtils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import LocationMap from '@/components/ui/location-map';
import { useMobile } from '@/contexts/MobileContext';
import { useTheme } from '@/contexts/ThemeContext';

const Dashboard = ({ user, onLogout }) => {
  // Mobile e Theme hooks
  const { isMobile, isTablet, forcedMode, toggleViewMode, setViewMode } = useMobile();
  const { isDark } = useTheme();
  
  const [entry, setEntry] = useState(null);
  const [todayEntries, setTodayEntries] = useState([]);
  const [observations, setObservations] = useState('');
  const [endObservations, setEndObservations] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRealtimeModal, setShowRealtimeModal] = useState(false);
  const [realtimeData, setRealtimeData] = useState(null);
  const [realtimeLoading, setRealtimeLoading] = useState(false);
  const [showRealtimeMap, setShowRealtimeMap] = useState(false);
  const [realtimeLocations, setRealtimeLocations] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showMyRealtimePopup, setShowMyRealtimePopup] = useState(false);
  const [adminClockLoading, setAdminClockLoading] = useState({});

  const [outsideResidenceZone, setOutsideResidenceZone] = useState(false);
  const [locationDescription, setLocationDescription] = useState('');
  
  // Geolocalização
  const [geoLocation, setGeoLocation] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Classes dinâmicas baseadas no tema
  const bgMain = isDark ? 'bg-[#0a0a0a]' : 'bg-gray-100';
  const bgCard = isDark ? 'bg-[#1a1a1a]' : 'bg-white';
  const bgCardAlt = isDark ? 'bg-[#0f0f0f]' : 'bg-gray-50';
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-600';
  const borderColor = isDark ? 'border-gray-700' : 'border-gray-200';

  // Detectar parâmetro URL para abrir modal de status (mobile admin)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('showRealtime') === 'true' && user?.is_admin) {
      setShowRealtimeModal(true);
      fetchRealtimeStatus();
      // Limpar parâmetro da URL
      window.history.replaceState({}, '', '/');
    }
  }, [user]);

  // Detectar estado online/offline
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Conexão restabelecida!');
      // Notificar service worker para sincronizar
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'ONLINE' });
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Sem conexão. Modo offline ativo.');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Função para obter geolocalização
  const getGeoLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalização não suportada'));
        return;
      }
      
      setGeoLoading(true);
      setGeoError(null);
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date().toISOString()
          };
          setGeoLocation(location);
          setGeoLoading(false);
          resolve(location);
        },
        (error) => {
          let errorMsg = 'Erro ao obter localização';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMsg = 'Permissão de localização negada';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMsg = 'Localização indisponível';
              break;
            case error.TIMEOUT:
              errorMsg = 'Tempo esgotado ao obter localização';
              break;
          }
          setGeoError(errorMsg);
          setGeoLoading(false);
          reject(new Error(errorMsg));
        },
        {
          enableHighAccuracy: true,  // Usar GPS de alta precisão
          timeout: 15000,            // 15 segundos de timeout
          maximumAge: 0              // Não usar cache - obter localização fresca
        }
      );
    });
  };

  // Distritos considerados "zona de residência" (não ativa Fora de Zona)
  const ZONA_RESIDENCIA = ['Lisboa', 'Sintra', 'Setúbal', 'Setubal'];
  
  // Verificar se localização está fora da zona de residência
  const isForaZonaResidencia = (address) => {
    if (!address) return false;
    
    const countryCode = address.country_code?.toUpperCase();
    
    // Se está fora de Portugal, está fora de zona
    if (countryCode && countryCode !== 'PT') {
      return true;
    }
    
    // Se está em Portugal, verificar se está fora dos distritos de residência
    if (countryCode === 'PT') {
      const city = address.city || address.town || address.village || address.municipality || '';
      const county = address.county || address.state || '';
      const region = address.region || '';
      
      // Verificar se algum dos campos corresponde à zona de residência
      const localNormalizado = `${city} ${county} ${region}`.toLowerCase();
      
      const estaEmZonaResidencia = ZONA_RESIDENCIA.some(zona => 
        localNormalizado.includes(zona.toLowerCase())
      );
      
      return !estaEmZonaResidencia;
    }
    
    return false;
  };

  // Testar GPS e verificar se está fora da zona de residência
  const testGeoLocation = async () => {
    try {
      const location = await getGeoLocation();
      toast.success('Localização capturada!');
      
      // Fazer reverse geocoding com alta precisão
      if (location && location.latitude && location.longitude) {
        try {
          const geoResponse = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${location.latitude}&lon=${location.longitude}&format=json&addressdetails=1&accept-language=pt&zoom=18`,
            { headers: { 'User-Agent': 'HWI-Ponto/1.0' } }
          );
          
          if (geoResponse.ok) {
            const geoData = await geoResponse.json();
            const addr = geoData.address || {};
            const countryCode = addr.country_code?.toUpperCase();
            
            // Priorizar localidade específica sobre município
            // Ordem: village > town > suburb > neighbourhood > city_district > hamlet > city > municipality
            const locality = (
              addr.village ||      // Vila/aldeia (ex: Fernão Ferro)
              addr.town ||         // Cidade pequena
              addr.suburb ||       // Subúrbio/freguesia
              addr.neighbourhood || // Bairro
              addr.city_district || // Distrito da cidade
              addr.hamlet          // Lugar pequeno
            );
            
            // Município/Concelho (informação secundária)
            const municipality = (
              addr.city ||         // Cidade principal
              addr.municipality || // Município
              addr.county          // Concelho
            );
            
            // Zona específica (parque industrial, etc.)
            const zone = (
              addr.industrial ||   // Parque industrial
              addr.commercial ||   // Zona comercial
              addr.retail ||       // Zona de retalho
              addr.aeroway ||      // Aeroporto
              addr.amenity         // Serviço
            );
            
            // Usar localidade específica, ou município se não houver
            const city = locality || municipality;
            const county = locality ? municipality : (addr.county || addr.state);
            const country = addr.country;
            
            const addressInfo = {
              locality: locality,
              zone: zone,
              municipality: municipality,
              city: city,
              region: county,
              country: country,
              country_code: countryCode,
              county: addr.county,
              formatted: geoData.display_name,
              raw_address: addr
            };
            
            // Atualizar geoLocation com endereço
            setGeoLocation(prev => ({
              ...prev,
              address: addressInfo
            }));
            
            // Verificar se está fora da zona de residência
            if (isForaZonaResidencia(addressInfo)) {
              // Construir descrição da localização
              let autoLocation = '';
              if (zone) {
                autoLocation = zone;
                if (city) autoLocation += `, ${city}`;
              } else if (city) {
                autoLocation = city;
              }
              if (county && county !== city) {
                autoLocation += `, ${county}`;
              }
              if (country && countryCode !== 'PT') {
                autoLocation += `, ${country}`;
              }
              autoLocation = autoLocation || country || 'Local desconhecido';
              
              setOutsideResidenceZone(true);
              setLocationDescription(autoLocation);
              
              if (countryCode !== 'PT') {
                toast.warning(`🌍 Detectado fora de Portugal: ${autoLocation}`, {
                  duration: 5000,
                  description: 'Checkbox "Fora de Zona" ativado automaticamente'
                });
              } else {
                toast.warning(`📍 Fora da zona de residência: ${autoLocation}`, {
                  duration: 5000,
                  description: 'Checkbox "Fora de Zona" ativado automaticamente (fora de Lisboa/Sintra/Setúbal)'
                });
              }
            } else if (city) {
              // Mostrar localização mesmo na zona de residência
              let locationMsg = zone ? `${zone}, ${city}` : city;
              if (county && county !== city) {
                locationMsg += ` (${county})`;
              }
              toast.info(`📍 ${locationMsg} - Zona de residência`);
            }
          }
        } catch (geoErr) {
          console.log('Reverse geocoding falhou:', geoErr.message);
        }
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Helper function to format decimal hours as HH:MM
  const formatHours = (decimalHours) => {
    if (!decimalHours) return '0h00m';
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours}h${String(minutes).padStart(2, '0')}m`;
  };

  useEffect(() => {
    fetchTodayEntry();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);


  useEffect(() => {
    if (entry && entry.status === 'active') {
      const interval = setInterval(() => {
        const start = new Date(entry.start_time);
        const now = new Date();
        const elapsed = (now - start) / 1000;
        setElapsedTime(elapsed);
      }, 1000);

      return () => clearInterval(interval);
    } else {
      // Resetar elapsed time quando não há entrada ativa
      setElapsedTime(0);
    }
  }, [entry]);

  const fetchTodayEntry = async () => {
    try {
      const response = await axios.get(`${API}/time-entries/today`);
      
      // Verificar se há uma entrada ativa
      const hasActiveEntry = response.data && 
        response.data.status === 'active' && 
        !response.data.entries; // Se tiver "entries" é porque não tem entrada ativa
      
      if (hasActiveEntry) {
        // Active entry - também guardar entradas completadas do dia
        setEntry(response.data);
        setTodayEntries(response.data?.today_completed_entries || []);
        // Se o dia já tem "Fora de Zona", marcar automaticamente
        if (response.data?.day_has_outside_zone) {
          setOutsideResidenceZone(true);
        }
      } else {
        // Sem entrada ativa - limpar estado e mostrar entradas completadas
        setEntry(null);
        setElapsedTime(0); // Garantir que o timer para
        setTodayEntries(response.data?.entries || []);
        // Se o dia já tem "Fora de Zona", marcar automaticamente para a próxima entrada
        if (response.data?.day_has_outside_zone) {
          setOutsideResidenceZone(true);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar entrada de hoje:', error);
    }
  };

  const fetchRealtimeStatus = async () => {
    setRealtimeLoading(true);
    try {
      const response = await axios.get(`${API}/admin/realtime-status`);
      setRealtimeData(response.data);
      
      // Extrair TODAS as localizações (entradas e saídas) de todos os utilizadores
      const allLocations = [];
      
      (response.data.users || []).forEach(u => {
        const userName = u.full_name || u.username;
        const userInitial = userName ? userName.charAt(0).toUpperCase() : '?';
        
        // Verificar se tem entradas com geo_location (entradas múltiplas)
        if (u.entradas && Array.isArray(u.entradas)) {
          u.entradas.forEach((entrada, idx) => {
            // Localização de ENTRADA
            if (entrada.geo_location?.latitude && entrada.geo_location?.longitude) {
              allLocations.push({
                id: `${u.user_id}-entry-${idx}-start`,
                entryId: entrada.id,
                userName: userName,
                latitude: entrada.geo_location.latitude,
                longitude: entrada.geo_location.longitude,
                accuracy: entrada.geo_location.accuracy,
                timestamp: entrada.start_time,
                address: entrada.geo_location.address?.formatted || entrada.geo_location.address?.city,
                type: 'Entrada',
                isEnd: false,
              });
            }
            
            // Localização de SAÍDA
            if (entrada.end_geo_location?.latitude && entrada.end_geo_location?.longitude) {
              allLocations.push({
                id: `${u.user_id}-entry-${idx}-end`,
                entryId: entrada.id,
                userName: userName,
                latitude: entrada.end_geo_location.latitude,
                longitude: entrada.end_geo_location.longitude,
                accuracy: entrada.end_geo_location.accuracy,
                timestamp: entrada.end_time || entrada.end_geo_location.timestamp,
                address: entrada.end_geo_location.address?.formatted || entrada.end_geo_location.address?.city,
                type: 'Saída',
                isEnd: true,
              });
            }
          });
        }
        
        // Fallback para geo_location única (utilizador actual)
        if (u.geo_location?.latitude && u.geo_location?.longitude) {
          // Verificar se já não foi adicionado através das entradas
          const alreadyAdded = allLocations.some(loc => 
            loc.latitude === u.geo_location.latitude && 
            loc.longitude === u.geo_location.longitude &&
            loc.userName === userName
          );
          
          if (!alreadyAdded) {
            allLocations.push({
              id: `${u.user_id}-current`,
              userName: userName,
              latitude: u.geo_location.latitude,
              longitude: u.geo_location.longitude,
              accuracy: u.geo_location.accuracy,
              timestamp: u.geo_location.timestamp || u.clock_in_time,
              address: u.geo_location.address?.formatted || u.geo_location.address?.city || u.location,
              type: u.status === 'TRABALHANDO' ? 'Entrada' : 'Saída',
              isEnd: u.status !== 'TRABALHANDO',
            });
          }
        }
      });
      
      setRealtimeLocations(allLocations);
    } catch (error) {
      toast.error('Erro ao carregar status em tempo real');
      console.error(error);
    } finally {
      setRealtimeLoading(false);
    }
  };

  const openRealtimeModal = () => {
    setShowRealtimeModal(true);
    fetchRealtimeStatus();
  };

  // Funções Admin para controlar relógio de outros utilizadores
  const handleAdminStartClock = async (userId, userName) => {
    setAdminClockLoading(prev => ({ ...prev, [userId]: 'start' }));
    try {
      await axios.post(`${API}/admin/time-entries/start/${userId}`);
      toast.success(`Relógio iniciado para ${userName}`);
      fetchRealtimeStatus();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao iniciar relógio');
    } finally {
      setAdminClockLoading(prev => ({ ...prev, [userId]: null }));
    }
  };

  const handleAdminEndClock = async (userId, userName) => {
    setAdminClockLoading(prev => ({ ...prev, [userId]: 'end' }));
    try {
      const response = await axios.post(`${API}/admin/time-entries/end/${userId}`);
      toast.success(`Relógio finalizado para ${userName} (${response.data.total_hours}h)`);
      fetchRealtimeStatus();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao finalizar relógio');
    } finally {
      setAdminClockLoading(prev => ({ ...prev, [userId]: null }));
    }
  };

  const getStatusBadgeColor = (color) => {
    const colors = {
      green: 'bg-green-500/20 text-green-400 border-green-500',
      blue: 'bg-blue-500/20 text-blue-400 border-blue-500',
      purple: 'bg-purple-500/20 text-purple-400 border-purple-500',
      gray: 'bg-gray-500/20 text-gray-400 border-gray-500',
      amber: 'bg-amber-500/20 text-amber-400 border-amber-500',
      red: 'bg-red-500/20 text-red-400 border-red-500'
    };
    return colors[color] || colors.gray;
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      // Tentar obter geolocalização (não bloqueia se falhar)
      let location = null;
      let autoOutsideZone = outsideResidenceZone;
      let autoLocationDesc = locationDescription;
      
      try {
        location = await getGeoLocation();
        toast.success('Localização capturada!');
        
        // Verificar se está fora da zona de residência (fazer reverse geocoding no frontend para auto-detect)
        if (location && location.latitude && location.longitude) {
          try {
            const geoResponse = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${location.latitude}&lon=${location.longitude}&format=json&addressdetails=1&accept-language=pt&zoom=18`,
              { headers: { 'User-Agent': 'HWI-Ponto/1.0' } }
            );
            
            if (geoResponse.ok) {
              const geoData = await geoResponse.json();
              const addr = geoData.address || {};
              const countryCode = addr.country_code?.toUpperCase();
              
              // Priorizar localidade específica sobre município
              const locality = (
                addr.village ||
                addr.town ||
                addr.suburb ||
                addr.neighbourhood ||
                addr.city_district ||
                addr.hamlet
              );
              
              const municipality = (
                addr.city ||
                addr.municipality ||
                addr.county
              );
              
              const zone = (
                addr.industrial ||
                addr.commercial ||
                addr.retail ||
                addr.aeroway ||
                addr.amenity
              );
              
              const city = locality || municipality;
              const county = locality ? municipality : (addr.county || addr.state);
              const country = addr.country;
              
              const addressInfo = {
                locality: locality,
                zone: zone,
                municipality: municipality,
                city: city,
                region: county,
                country: country,
                country_code: countryCode,
                county: addr.county,
                formatted: geoData.display_name,
                raw_address: addr
              };
              
              // Verificar se está fora da zona de residência
              if (isForaZonaResidencia(addressInfo)) {
                autoOutsideZone = true;
                
                // Construir descrição da localização
                let locationStr = '';
                if (zone) {
                  locationStr = zone;
                  if (city) locationStr += `, ${city}`;
                } else if (city) {
                  locationStr = city;
                }
                if (county && county !== city) {
                  locationStr += `, ${county}`;
                }
                if (country && countryCode !== 'PT') {
                  locationStr += `, ${country}`;
                }
                autoLocationDesc = locationStr || country || 'Local desconhecido';
                
                // Atualizar estado para feedback visual
                setOutsideResidenceZone(true);
                setLocationDescription(autoLocationDesc);
                
                if (countryCode !== 'PT') {
                  toast.info(`📍 Detectado fora de Portugal: ${autoLocationDesc}`, {
                    duration: 5000
                  });
                } else {
                  toast.info(`📍 Fora da zona de residência: ${autoLocationDesc}`, {
                    duration: 5000,
                    description: 'Fora de Lisboa/Sintra/Setúbal'
                  });
                }
              }
              
              // Guardar info de endereço na localização
              location.address = addressInfo;
            }
          } catch (geoErr) {
            console.log('Reverse geocoding falhou:', geoErr.message);
            // Continua sem a informação de cidade/país
          }
        }
      } catch (geoErr) {
        console.log('Geolocalização não disponível:', geoErr.message);
        // Continua sem localização
      }
      
      await axios.post(`${API}/time-entries/start`, { 
        observations,
        outside_residence_zone: autoOutsideZone,
        location_description: autoOutsideZone ? autoLocationDesc : null,
        geo_location: location
      });
      toast.success('Relógio iniciado!');
      setObservations('');
      // Não resetar outsideResidenceZone se o dia já tem essa flag (será definido pelo fetchTodayEntry)
      setLocationDescription('');
      setGeoLocation(null);
      fetchTodayEntry();
    } catch (error) {
      // Verificar se foi guardado offline
      if (error.response?.data?.offline) {
        toast.warning('Ação guardada offline. Será sincronizada automaticamente.');
        setObservations('');
        setLocationDescription('');
      } else {
        toast.error(error.response?.data?.detail || 'Erro ao iniciar');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEnd = async () => {
    setLoading(true);
    try {
      // Capturar geolocalização ao terminar
      let endLocation = null;
      if (navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 0
            });
          });
          
          endLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date().toISOString()
          };
          
          // Tentar obter endereço via geocoding reverso
          try {
            const geoResponse = await axios.get(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}&zoom=18&addressdetails=1`
            );
            if (geoResponse.data?.address) {
              endLocation.address = {
                city: geoResponse.data.address.city || geoResponse.data.address.town || geoResponse.data.address.village,
                region: geoResponse.data.address.state,
                country: geoResponse.data.address.country
              };
            }
          } catch (geoErr) {
            console.log('Reverse geocoding ao terminar falhou:', geoErr.message);
          }
        } catch (geoErr) {
          console.log('Geolocalização ao terminar não disponível:', geoErr.message);
        }
      }
      
      const response = await axios.post(`${API}/time-entries/end/${entry.id}`, {
        observations: endObservations,
        end_geo_location: endLocation
      });
      toast.success(`Relógio finalizado! Total: ${formatHours(response.data.total_hours)}`);
      setEndObservations('');
      
      // Atualizar estado imediatamente
      setEntry(null);  // Limpar entrada ativa
      setElapsedTime(0);  // Parar o timer imediatamente
      
      // Buscar estado atualizado
      await fetchTodayEntry();
      
      console.log('Estado atualizado após finalizar');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao finalizar');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = () => {
    if (!entry) return null;
    
    const badges = {
      active: { text: 'Ativo', class: 'status-active', icon: <Play className="w-4 h-4" /> },
      completed: { text: 'Concluído', class: 'status-completed', icon: <Square className="w-4 h-4" /> }
    };

    const badge = badges[entry.status];
    return (
      <div className={`${badge.class} px-6 py-3 rounded-full text-white font-semibold flex items-center gap-2 shadow-lg`}>
        {badge.icon}
        {badge.text}
      </div>
    );
  };

  return (
    <div className={`min-h-screen ${bgMain} ${isMobile ? 'mobile-safe-top' : ''}`}>
      {/* Navigation - escondida em mobile (usa bottom nav) */}
      {!isMobile && (
        <Navigation user={user} onLogout={onLogout} activePage="dashboard" />
      )}
      
      <div className={`container mx-auto px-4 ${isMobile ? 'pt-8 pb-24' : 'py-8'} max-w-4xl`}>
        <div className="fade-in">
          {/* Online/Offline Indicator */}
          {!isOnline && (
            <div className={`mb-4 bg-amber-500/20 border border-amber-500 rounded-lg px-4 py-3 flex items-center gap-3 ${isMobile ? 'text-sm' : ''}`}>
              <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse flex-shrink-0"></div>
              <span className="text-amber-400 font-medium">
                {isMobile ? 'Modo Offline' : 'Modo Offline - As ações serão sincronizadas quando houver conexão'}
              </span>
            </div>
          )}
          
          {/* Current Time Display */}
          <div className="text-center mb-6 md:mb-8">
            <div className={`${isMobile ? 'text-5xl' : 'text-6xl'} font-bold ${textPrimary} mb-2`} data-testid="current-time">
              {currentTime.toLocaleTimeString('pt-PT')}
            </div>
            <div className={`${textSecondary} ${isMobile ? 'text-base' : 'text-lg'}`} data-testid="current-date">
              {currentTime.toLocaleDateString('pt-PT', { 
                weekday: isMobile ? 'short' : 'long', 
                year: 'numeric', 
                month: isMobile ? 'short' : 'long', 
                day: 'numeric' 
              })}
            </div>
            {/* Connection Status & View Mode Toggle */}
            <div className="mt-2 flex items-center justify-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`}></div>
                <span className={`text-xs ${isOnline ? 'text-green-400' : 'text-amber-400'}`}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              
              {/* View Mode Toggle Button */}
              <button
                onClick={() => {
                  if (forcedMode === 'mobile') {
                    setViewMode('desktop');
                  } else if (forcedMode === 'desktop') {
                    setViewMode(null);
                  } else {
                    setViewMode('mobile');
                  }
                }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all ${
                  forcedMode 
                    ? 'bg-blue-600/20 border border-blue-500 text-blue-400' 
                    : 'bg-gray-700/50 border border-gray-600 text-gray-400 hover:border-gray-500'
                }`}
                title={`Modo atual: ${forcedMode || 'Auto'}`}
              >
                {forcedMode === 'mobile' ? (
                  <>
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Mobile</span>
                  </>
                ) : forcedMode === 'desktop' ? (
                  <>
                    <Monitor className="w-3.5 h-3.5" />
                    <span>Desktop</span>
                  </>
                ) : (
                  <>
                    {isMobile ? <Smartphone className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
                    <span>Auto</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex justify-center mb-6 md:mb-8" data-testid="status-badge">
            {getStatusBadge()}
          </div>

          {/* Elapsed Time */}
          {entry && entry.status !== 'completed' && entry.status !== 'not_started' && (
            <div className="text-center mb-6 md:mb-8">
              <div className={`${isDark ? 'glass-effect' : 'bg-white shadow-lg'} inline-block px-6 md:px-8 py-3 md:py-4 rounded-2xl`}>
                <div className={`${textSecondary} text-sm mb-1`}>Tempo Trabalhado</div>
                <div className={`${isMobile ? 'text-3xl' : 'text-4xl'} font-bold ${textPrimary}`} data-testid="elapsed-time">
                  {formatTime(elapsedTime)}
                </div>
              </div>
            </div>
          )}

          {/* Mobile Quick Stats Widget */}
          {isMobile && (todayEntries.length > 0 || entry) && (
            <div className={`${isDark ? 'glass-effect' : 'bg-white shadow-lg border ' + borderColor} p-4 mb-4 rounded-xl`} data-testid="mobile-quick-stats">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDark ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                    <Clock className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <div className={`text-xs ${textSecondary}`}>Horas Hoje</div>
                    <div className={`text-xl font-bold ${textPrimary}`}>
                      {formatHours(
                        todayEntries.reduce((acc, e) => acc + (e.total_hours || 0), 0) +
                        (entry && entry.status === 'active' ? elapsedTime / 3600 : 0)
                      )}
                    </div>
                  </div>
                </div>
                
                {(todayEntries.length > 0 || entry) && (
                  <div className="text-right">
                    <div className={`text-xs ${textSecondary}`}>Registos</div>
                    <div className={`text-lg font-semibold ${textPrimary}`}>
                      {todayEntries.length + (entry && entry.status === 'active' ? 1 : 0)}
                    </div>
                  </div>
                )}
                
                {entry && entry.status === 'active' && (
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                      <div className="absolute inset-0 w-3 h-3 bg-green-500 rounded-full animate-ping opacity-75"></div>
                    </div>
                    <span className="text-xs text-green-500 font-medium">A trabalhar</span>
                  </div>
                )}
              </div>
              
              {/* Quick entry summary for completed entries */}
              {todayEntries.length > 0 && (
                <div className={`mt-3 pt-3 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                  <div className="flex flex-wrap gap-2">
                    {todayEntries.slice(0, 3).map((e, idx) => (
                      <div 
                        key={e.id || idx}
                        className={`text-xs px-2 py-1 rounded-full ${
                          e.is_overtime_day 
                            ? 'bg-amber-500/20 text-amber-400' 
                            : isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {new Date(e.start_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })} - {formatHours(e.total_hours)}
                      </div>
                    ))}
                    {todayEntries.length > 3 && (
                      <div className={`text-xs px-2 py-1 rounded-full ${isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'}`}>
                        +{todayEntries.length - 3} mais
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Control Buttons */}
          <div className={`${isDark ? 'glass-effect' : 'bg-white shadow-lg border ' + borderColor} p-3 md:p-4 mb-6 rounded-xl`}>
            {!entry ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="observations" className={`${textSecondary} mb-1.5 block text-sm`}>
                    Observações (opcional)
                  </Label>
                  <Textarea
                    data-testid="observations-input"
                    id="observations"
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    placeholder="Ex: Entrada atrasada devido a reunião externa..."
                    className={`${bgCard} ${borderColor} ${textPrimary} focus:ring-blue-500 min-h-[50px] text-sm md:text-base`}
                  />
                </div>

                {/* Outside Residence Zone Checkbox */}
                <div className={`flex items-start space-x-3 p-3 ${bgCard} rounded-lg border ${borderColor}`}>
                  <Checkbox
                    data-testid="outside-zone-checkbox"
                    id="outside-zone"
                    checked={outsideResidenceZone}
                    onCheckedChange={setOutsideResidenceZone}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor="outside-zone"
                      className={`${textSecondary} font-medium cursor-pointer flex items-center gap-2 text-sm`}
                    >
                      <MapPin className="w-4 h-4" />
                      Fora de Zona de Residência
                    </Label>
                    <p className={`text-xs ${textSecondary} mt-1`}>
                      Ativa Ajuda de Custas (em vez de Subsídio de Alimentação)
                    </p>
                  </div>
                </div>

                {/* Location Input - Only shown when checkbox is checked */}
                {outsideResidenceZone && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <Label htmlFor="location" className={`${textSecondary} mb-2 block`}>
                      Local da Deslocação *
                    </Label>
                    <Input
                      data-testid="location-input"
                      id="location"
                      value={locationDescription}
                      onChange={(e) => setLocationDescription(e.target.value)}
                      placeholder="Ex: Lisboa, Madrid, Porto..."
                      className={`${bgCard} ${borderColor} ${textPrimary} focus:ring-blue-500`}
                      required={outsideResidenceZone}
                    />
                  </div>
                )}

                {/* Geolocation Status Indicator */}
                <div className="flex flex-col gap-2">
                  <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'} text-sm`}>
                    <div className="flex items-center gap-2">
                      <MapPin className={`w-4 h-4 flex-shrink-0 ${geoLocation ? 'text-green-400' : geoLoading ? 'text-blue-400 animate-pulse' : 'text-gray-500'}`} />
                      <span className={`${geoLocation ? 'text-green-400' : geoLoading ? 'text-blue-400' : textSecondary} ${isMobile ? 'text-xs' : 'text-sm'}`}>
                        {geoLoading ? 'A obter localização...' : 
                         geoLocation ? (
                           geoLocation.address?.city 
                             ? `📍 ${geoLocation.address.city}${geoLocation.address.region ? `, ${geoLocation.address.region}` : ''} (±${Math.round(geoLocation.accuracy)}m)`
                             : `📍 Localização capturada (±${Math.round(geoLocation.accuracy)}m)`
                         ) : 
                         geoError ? `⚠️ ${geoError}` :
                         'GPS será capturado ao iniciar'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!geoLocation && !geoLoading && (
                        <button 
                          onClick={testGeoLocation}
                          className="text-blue-400 hover:text-blue-300 text-xs underline"
                        >
                          Testar GPS
                        </button>
                      )}
                      {geoLocation && geoLocation.address && isForaZonaResidencia(geoLocation.address) && (
                        <span className="text-amber-400 text-xs font-medium flex items-center gap-1">
                          {geoLocation.address.country_code !== 'PT' ? '🌍 Fora de PT' : '📍 Fora da Zona'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Link para ver no mapa quando GPS capturado */}
                  {geoLocation && geoLocation.latitude && geoLocation.longitude && (
                    <div className="flex items-center gap-3 pl-6">
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${geoLocation.latitude}&mlon=${geoLocation.longitude}&zoom=15`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-400 hover:text-green-300 text-xs flex items-center gap-1 underline"
                      >
                        🗺️ Ver no Mapa
                      </a>
                    </div>
                  )}
                </div>

                {/* Botão Iniciar - Escondido em mobile (usa bottom nav) */}
                {!isMobile && (
                  <Button
                    data-testid="start-button"
                    onClick={handleStart}
                    disabled={loading || (outsideResidenceZone && !locationDescription.trim())}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-4 rounded-full text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-6 h-6 mr-2 animate-spin" />
                        {geoLoading ? 'A obter localização...' : 'A iniciar...'}
                      </>
                    ) : (
                      <>
                        <Play className="w-6 h-6 mr-2" />
                        Iniciar Relógio
                      </>
                    )}
                  </Button>
                )}
                
                {/* Mensagem mobile - usar bottom nav */}
                {isMobile && (
                  <div className={`text-center py-3 ${textSecondary} text-sm`}>
                    <span>Use o botão</span>
                    <span className="mx-1 inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white">
                      <Play className="w-4 h-4" />
                    </span>
                    <span>abaixo para iniciar</span>
                  </div>
                )}
              </div>
            ) : entry.status === 'active' ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="end-observations" className={`${textSecondary} mb-1.5 block text-sm`}>
                    Observações ao Finalizar (opcional)
                  </Label>
                  <Textarea
                    data-testid="end-observations-input"
                    id="end-observations"
                    value={endObservations}
                    onChange={(e) => setEndObservations(e.target.value)}
                    placeholder="Ex: Trabalho concluído, reunião realizada..."
                    className={`${bgCard} ${borderColor} ${textPrimary} focus:ring-blue-500 min-h-[70px] text-sm`}
                  />
                </div>
                {/* Botão Finalizar - Escondido em mobile (usa bottom nav) */}
                {!isMobile && (
                  <Button
                    data-testid="end-button"
                    onClick={handleEnd}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-semibold py-4 rounded-full text-lg"
                  >
                    <Square className="w-6 h-6 mr-2" />
                    Finalizar Relógio
                  </Button>
                )}
                
                {/* Mensagem mobile - usar bottom nav */}
                {isMobile && (
                  <div className={`text-center py-3 ${textSecondary} text-sm`}>
                    <span>Use o botão</span>
                    <span className="mx-1 inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-500 text-white">
                      <Square className="w-4 h-4" />
                    </span>
                    <span>abaixo para finalizar</span>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Today's Entry Info */}
          {entry && (
            <div className="glass-effect p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Registo Ativo</h3>
              
              {entry.is_overtime_day && (
                <div className="mb-4 p-3 bg-amber-900/30 border border-amber-600 rounded-lg flex items-center gap-2">
                  <Coffee className="w-5 h-5 text-amber-400" />
                  <div>
                    <div className="text-amber-400 font-semibold">Horas Extras</div>
                    <div className="text-amber-300 text-sm">{entry.overtime_reason}</div>
                  </div>
                </div>
              )}

              {entry.outside_residence_zone && (
                <div className="mb-4 p-3 bg-blue-900/30 border border-blue-600 rounded-lg flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-400" />
                  <div className="flex-1">
                    <div className="text-blue-400 font-semibold">Fora de Zona de Residência</div>
                    <div className="text-blue-300 text-sm">{entry.location_description}</div>
                    <div className="text-xs text-gray-400 mt-1">Ajuda de Custas aplicável</div>
                  </div>
                </div>
              )}

              {/* Geolocalização capturada */}
              {entry.geo_location && (
                <div className="mb-4 p-3 bg-green-900/30 border border-green-600 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-green-400" />
                      <div>
                        <div className="text-green-400 font-semibold">📍 Localização Registada</div>
                        {entry.geo_location.address ? (
                          <div className="text-green-300 text-sm">
                            {entry.geo_location.address.city && (
                              <span className="font-medium">{entry.geo_location.address.city}</span>
                            )}
                            {entry.geo_location.address.region && (
                              <span className="text-gray-400">, {entry.geo_location.address.region}</span>
                            )}
                            {entry.geo_location.address.country && (
                              <span className="text-gray-400"> - {entry.geo_location.address.country}</span>
                            )}
                          </div>
                        ) : (
                          <div className="text-green-300 text-xs">
                            {entry.geo_location.latitude?.toFixed(6)}, {entry.geo_location.longitude?.toFixed(6)}
                          </div>
                        )}
                        <div className="text-gray-500 text-xs mt-1">
                          Precisão: ±{Math.round(entry.geo_location.accuracy || 0)}m
                        </div>
                      </div>
                    </div>
                    <a 
                      href={`https://www.openstreetmap.org/?mlat=${entry.geo_location.latitude}&mlon=${entry.geo_location.longitude}&zoom=15`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-400 hover:text-green-300 text-xs underline flex items-center gap-1"
                    >
                      🗺️ Ver no Mapa
                    </a>
                  </div>
                </div>
              )}
              
              <div className="space-y-3 text-gray-300">
                <div className="flex justify-between">
                  <span>Início:</span>
                  <span className="font-semibold text-white">
                    {entry.start_time ? new Date(entry.start_time).toLocaleTimeString('pt-PT') : '-'}
                  </span>
                </div>
                {entry.observations && (
                  <div className="pt-3 border-t border-gray-700">
                    <div className="text-gray-400 mb-1">Observações:</div>
                    <div className="text-white italic">{entry.observations}</div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Today's Completed Entries */}
          {todayEntries.length > 0 && (
            <div className="glass-effect p-6 mt-6">
              <h3 className="text-xl font-semibold text-white mb-4">Registos de Hoje ({todayEntries.length})</h3>
              <div className="space-y-3">
                {todayEntries.map((e, idx) => (
                  <div key={e.id || idx} className="bg-[#1a1a1a] p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div className="text-gray-300">
                        <div className="text-sm">
                          {e.start_time ? new Date(e.start_time).toLocaleTimeString('pt-PT') : '-'} → {' '}
                          {e.end_time ? new Date(e.end_time).toLocaleTimeString('pt-PT') : '-'}
                        </div>
                        {e.is_overtime_day && (
                          <div className="text-xs text-amber-400 mt-1">{e.overtime_reason}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className={`font-bold text-lg ${e.is_overtime_day ? 'text-amber-400' : 'text-green-400'}`}>
                          {formatHours(e.total_hours)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Buttons - Escondidos em mobile (usa bottom nav) */}
      {!isMobile && (
        <>
          {/* Floating Action Button - Admin Real-Time Status (Admin Only) */}
          {user?.is_admin && (
            <Button
              onClick={openRealtimeModal}
              className="fixed bottom-48 sm:bottom-36 right-4 sm:right-6 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-full p-3 sm:p-4 shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 hover:scale-110 z-50 group"
              title="Status em Tempo Real"
            >
              <Users className="w-5 h-5 sm:w-6 sm:h-6" />
              <span className="hidden sm:block absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-purple-600 text-white px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                Status em Tempo Real
              </span>
            </Button>
          )}

          {/* Floating Action Button - OTs (Ordens de Trabalho) */}
          <a
            href="/technical-reports"
            className="fixed bottom-32 sm:bottom-20 right-4 sm:right-6 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-full p-3 sm:p-4 shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 hover:scale-110 z-50 group"
            title="OTs - Ordens de Trabalho"
          >
            <Clipboard className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="hidden sm:block absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              OTs - Ordens de Trabalho
            </span>
          </a>

          {/* Botão Flutuante Ver Minhas Entradas - Apenas para usuários normais */}
          {!user?.is_admin && (
            <Button
              onClick={() => setShowMyRealtimePopup(true)}
              className="fixed bottom-48 sm:bottom-36 right-4 sm:right-6 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-full p-3 sm:p-4 shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 hover:scale-110 z-50 group"
              title="Ver Minhas Entradas"
            >
              <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
              <span className="hidden sm:block absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-purple-600 text-white px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                Ver Minhas Entradas
              </span>
            </Button>
          )}

          {/* Botão Flutuante Manual de Instruções */}
          <Button
            onClick={async () => {
              try {
                toast.info('A gerar manual...');
                const response = await axios.get(`${API}/manual/download`, {
                  responseType: 'blob'
                });
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', 'Manual_HWI_Unipessoal.pdf');
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
                toast.success('Manual descarregado!');
              } catch (error) {
                toast.error('Erro ao descarregar manual');
              }
            }}
            className="fixed bottom-64 sm:bottom-52 right-4 sm:right-6 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-full p-3 sm:p-4 shadow-2xl hover:shadow-emerald-500/50 transition-all duration-300 hover:scale-110 z-50 group"
            title="Manual de Instruções"
            data-testid="download-manual-btn"
          >
            <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="hidden sm:block absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Manual de Instruções
            </span>
          </Button>
        </>
      )}

      {/* Real-Time Status Modal */}
      <Dialog open={showRealtimeModal} onOpenChange={setShowRealtimeModal}>
        <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-white">
                <Users className="w-5 h-5 text-purple-400" />
                Status em Tempo Real - {realtimeData && new Date(realtimeData.date + 'T00:00:00').toLocaleDateString('pt-PT')}
              </DialogTitle>
              <Button
                onClick={fetchRealtimeStatus}
                disabled={realtimeLoading}
                size="sm"
                className="bg-purple-500 hover:bg-purple-600"
              >
                <RefreshCw className={`w-4 h-4 ${realtimeLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </DialogHeader>

          {realtimeLoading && !realtimeData ? (
            <div className="text-center py-12 text-gray-400">A carregar...</div>
          ) : realtimeData ? (
            <div className="space-y-4 mt-4">
              {/* Map Toggle Button */}
              <div className="flex justify-end">
                <Button
                  onClick={() => setShowRealtimeMap(!showRealtimeMap)}
                  size="sm"
                  variant={showRealtimeMap ? "default" : "outline"}
                  className={showRealtimeMap ? "bg-green-600 hover:bg-green-700" : "border-green-600 text-green-400 hover:bg-green-600/10"}
                >
                  <Map className="w-4 h-4 mr-2" />
                  {showRealtimeMap ? 'Esconder Mapa' : 'Ver no Mapa'} ({realtimeLocations.length})
                </Button>
              </div>
              
              {/* Map View */}
              {showRealtimeMap && realtimeLocations.length > 0 && (
                <div className="rounded-lg overflow-hidden border border-gray-700">
                  <LocationMap
                    locations={realtimeLocations}
                    height="350px"
                    zoom={10}
                    useInitials={true}
                  />
                  <div className="bg-gray-800 px-4 py-2 flex items-center justify-center gap-6 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white text-[8px] font-bold">P</div>
                      <span className="text-gray-400">Entrada</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-[8px] font-bold">P</div>
                      <span className="text-gray-400">Saída</span>
                    </div>
                  </div>
                </div>
              )}
              
              {showRealtimeMap && realtimeLocations.length === 0 && (
                <div className="bg-gray-800/50 rounded-lg p-6 text-center text-gray-400 border border-gray-700">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma localização disponível</p>
                  <p className="text-sm">Os utilizadores precisam de partilhar a localização ao iniciar o trabalho</p>
                </div>
              )}
              
              {/* Day Info */}
              {(realtimeData.is_weekend || realtimeData.is_holiday) && (
                <div className={`p-4 rounded-lg border ${
                  realtimeData.is_holiday ? 'bg-amber-900/20 border-amber-600' : 'bg-gray-800/30 border-gray-600'
                }`}>
                  <div className="text-center">
                    {realtimeData.is_holiday ? (
                      <p className="text-amber-400 font-semibold">🎉 Feriado: {realtimeData.holiday_name}</p>
                    ) : (
                      <p className="text-gray-400 font-semibold">🏖️ Fim de Semana</p>
                    )}
                  </div>
                </div>
              )}

              {/* Users Status Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {realtimeData.users.map((userStatus) => {
                  // Mapear estado antigo para novo
                  const estado = userStatus.status || userStatus.estado;
                  const nome = userStatus.full_name || userStatus.nome;
                  const username = userStatus.username || '';
                  
                  return (
                  <div
                    key={userStatus.user_id || userStatus.id}
                    className="bg-[#0f0f0f] border border-gray-700 rounded-lg p-4 hover:border-purple-500 transition"
                  >
                    {/* User Info */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-white font-semibold">{nome}</h3>
                        {username && <p className="text-gray-400 text-sm">@{username}</p>}
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeColor(userStatus.status_color || 'gray')}`}>
                        {estado}
                      </span>
                    </div>

                    {/* Status Details */}
                    <div className="space-y-2">
                      {/* Mostrar lista de entradas se admin e tiver entradas */}
                      {user?.is_admin && userStatus.entradas && userStatus.entradas.length > 0 && (
                        <div className="mb-3 space-y-2">
                          {userStatus.entradas.map((entrada, idx) => {
                            const isActive = entrada.estado === 'ativa';
                            return (
                              <div
                                key={entrada.id}
                                className={`p-2 rounded border text-sm ${isActive ? 'border-green-500 bg-green-500/10' : 'border-gray-600 bg-black/20'}`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-gray-400 text-xs">Entrada {idx + 1}</span>
                                  {isActive && <span className="text-green-400 text-xs font-semibold animate-pulse">ATIVA</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock className="w-3 h-3 text-gray-400" />
                                  <span className="text-white font-mono">
                                    {entrada.inicio} → {entrada.fim || 'agora'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {userStatus.status === 'TRABALHANDO' && (
                        <>
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="w-4 h-4 text-green-400" />
                            <span className="text-gray-300">Início:</span>
                            <span className="text-white font-semibold">{userStatus.clock_in_time}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-300">Tempo decorrido:</span>
                            <span className="text-green-400 font-semibold">{formatHours(userStatus.elapsed_hours)}</span>
                          </div>
                          {userStatus.outside_residence_zone && (
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="w-4 h-4 text-blue-400" />
                              <span className="text-blue-400">Ajuda de Custos</span>
                              {userStatus.location && <span className="text-gray-400">- {userStatus.location}</span>}
                            </div>
                          )}
                          {userStatus.geo_location && (
                            <div className="flex items-center gap-2 text-sm mt-1">
                              <Map className="w-4 h-4 text-green-400" />
                              <span className="text-green-400 text-xs">Localização GPS disponível</span>
                            </div>
                          )}
                        </>
                      )}

                      {userStatus.status === 'TRABALHOU' && (
                        <>
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="w-4 h-4 text-blue-400" />
                            <span className="text-gray-300">Entrada:</span>
                            <span className="text-white font-semibold">{userStatus.clock_in_time}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="w-4 h-4 text-blue-400" />
                            <span className="text-gray-300">Saída:</span>
                            <span className="text-white font-semibold">{userStatus.clock_out_time}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-300">Total:</span>
                            <span className="text-blue-400 font-semibold">{formatHours(userStatus.total_hours)}</span>
                          </div>
                          {userStatus.outside_residence_zone && (
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="w-4 h-4 text-blue-400" />
                              <span className="text-blue-400">Ajuda de Custos</span>
                            </div>
                          )}
                        </>
                      )}

                      {userStatus.status === 'FALTA' && (
                        <p className="text-red-400 text-sm">Sem registo de ponto hoje</p>
                      )}

                      {userStatus.status === 'FÉRIAS' && (
                        <p className="text-purple-400 text-sm">De férias</p>
                      )}

                      {userStatus.status === 'FERIADO' && userStatus.holiday_name && (
                        <p className="text-amber-400 text-sm">{userStatus.holiday_name}</p>
                      )}
                    </div>

                    {/* Botões Admin para Iniciar/Finalizar Relógio */}
                    {user?.is_admin && (
                      <div className="pt-3 mt-3 border-t border-gray-700 flex gap-2">
                        {userStatus.status === 'TRABALHANDO' ? (
                          <Button
                            onClick={() => handleAdminEndClock(userStatus.user_id, nome)}
                            disabled={adminClockLoading[userStatus.user_id] === 'end'}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                            size="sm"
                          >
                            <Square className="w-4 h-4 mr-1" />
                            {adminClockLoading[userStatus.user_id] === 'end' ? 'A finalizar...' : 'Finalizar'}
                          </Button>
                        ) : !['FÉRIAS', 'FERIADO'].includes(userStatus.status) && (
                          <Button
                            onClick={() => handleAdminStartClock(userStatus.user_id, nome)}
                            disabled={adminClockLoading[userStatus.user_id] === 'start'}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                            size="sm"
                          >
                            <Play className="w-4 h-4 mr-1" />
                            {adminClockLoading[userStatus.user_id] === 'start' ? 'A iniciar...' : 'Iniciar'}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
                })}
              </div>

              {/* Summary */}
              <div className="bg-purple-900/20 border border-purple-600 rounded-lg p-4 mt-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-400">
                      {realtimeData.users.filter(u => u.status === 'TRABALHANDO').length}
                    </div>
                    <div className="text-xs text-gray-400">Trabalhando Agora</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-400">
                      {realtimeData.users.filter(u => u.status === 'TRABALHOU').length}
                    </div>
                    <div className="text-xs text-gray-400">Já Trabalharam</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-400">
                      {realtimeData.users.filter(u => u.status === 'FÉRIAS').length}
                    </div>
                    <div className="text-xs text-gray-400">De Férias</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-400">
                      {realtimeData.users.filter(u => u.status === 'FALTA').length}
                    </div>
                    <div className="text-xs text-gray-400">Faltas</div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Popup Realtime - Apenas para usuários */}
      {showMyRealtimePopup && !user?.is_admin && (
        <UserRealtimePopup onClose={() => setShowMyRealtimePopup(false)} />
      )}
    </div>
  );
};

export default Dashboard;