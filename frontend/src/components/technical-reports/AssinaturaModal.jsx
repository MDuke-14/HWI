import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { PenTool, Trash2, Calendar, User, Plus, Edit, Maximize2, X, RotateCcw, Save } from 'lucide-react';

// Componente de Canvas de Assinatura Otimizado
const SignatureCanvasOptimized = React.forwardRef(({ 
  width = 500, 
  height = 150, 
  onSignatureChange,
  initialData = null,
  disabled = false 
}, ref) => {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const pathsRef = useRef([]); // Guardar todos os traços
  const currentPathRef = useRef([]);
  
  // Inicializar canvas com suporte a devicePixelRatio
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // Ajustar para resolução real do dispositivo
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext('2d', { 
      alpha: false,
      desynchronized: true // Melhor performance em alguns browsers
    });
    
    ctx.scale(dpr, dpr);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, rect.width, rect.height);
    
    // Configurações de linha otimizadas
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    contextRef.current = ctx;
    
    // Redesenhar traços existentes
    redrawPaths();
  }, []);
  
  // Redesenhar todos os traços
  const redrawPaths = useCallback(() => {
    const ctx = contextRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, rect.width, rect.height);
    
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    pathsRef.current.forEach(path => {
      if (path.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
      }
      ctx.stroke();
    });
  }, []);
  
  useEffect(() => {
    initCanvas();
    
    // Restaurar dados iniciais se existirem
    if (initialData && pathsRef.current.length === 0) {
      pathsRef.current = initialData;
      redrawPaths();
    }
    
    // Re-inicializar em resize
    const handleResize = () => {
      setTimeout(initCanvas, 100);
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [initCanvas, initialData, redrawPaths]);
  
  // Obter coordenadas do evento
  const getCoordinates = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }, []);
  
  // Iniciar desenho
  const startDrawing = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    
    const coords = getCoordinates(e);
    if (!coords) return;
    
    isDrawingRef.current = true;
    lastPointRef.current = coords;
    currentPathRef.current = [coords];
    
    const ctx = contextRef.current;
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    }
  }, [disabled, getCoordinates]);
  
  // Desenhar (com interpolação suave)
  const draw = useCallback((e) => {
    if (!isDrawingRef.current || disabled) return;
    e.preventDefault();
    e.stopPropagation();
    
    const coords = getCoordinates(e);
    if (!coords || !lastPointRef.current) return;
    
    const ctx = contextRef.current;
    if (!ctx) return;
    
    // Desenhar linha direta para resposta imediata
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    
    currentPathRef.current.push(coords);
    lastPointRef.current = coords;
  }, [disabled, getCoordinates]);
  
  // Finalizar desenho
  const stopDrawing = useCallback((e) => {
    if (!isDrawingRef.current) return;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    isDrawingRef.current = false;
    
    // Guardar o traço atual
    if (currentPathRef.current.length > 1) {
      pathsRef.current.push([...currentPathRef.current]);
      if (onSignatureChange) {
        onSignatureChange(pathsRef.current);
      }
    }
    
    currentPathRef.current = [];
    lastPointRef.current = null;
  }, [onSignatureChange]);
  
  // Limpar canvas
  const clear = useCallback(() => {
    pathsRef.current = [];
    currentPathRef.current = [];
    const ctx = contextRef.current;
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      const rect = canvas.getBoundingClientRect();
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, rect.width, rect.height);
    }
    if (onSignatureChange) {
      onSignatureChange([]);
    }
  }, [onSignatureChange]);
  
  // Verificar se está vazio
  const isEmpty = useCallback(() => {
    return pathsRef.current.length === 0;
  }, []);
  
  // Obter canvas element
  const getCanvas = useCallback(() => {
    return canvasRef.current;
  }, []);
  
  // Obter dados dos traços
  const getPaths = useCallback(() => {
    return pathsRef.current;
  }, []);
  
  // Definir dados dos traços
  const setPaths = useCallback((paths) => {
    pathsRef.current = paths || [];
    redrawPaths();
  }, [redrawPaths]);
  
  // Expor métodos via ref
  React.useImperativeHandle(ref, () => ({
    clear,
    isEmpty,
    getCanvas,
    getPaths,
    setPaths,
    redraw: redrawPaths
  }));
  
  return (
    <canvas
      ref={canvasRef}
      style={{ 
        width: '100%', 
        height: '100%',
        touchAction: 'none', // Prevenir scroll/zoom
        cursor: disabled ? 'not-allowed' : 'crosshair',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none'
      }}
      onMouseDown={startDrawing}
      onMouseMove={draw}
      onMouseUp={stopDrawing}
      onMouseLeave={stopDrawing}
      onTouchStart={startDrawing}
      onTouchMove={draw}
      onTouchEnd={stopDrawing}
      onTouchCancel={stopDrawing}
    />
  );
});

SignatureCanvasOptimized.displayName = 'SignatureCanvasOptimized';

// Modal de Fullscreen para Assinatura - Otimizado para Mobile
const FullscreenSignature = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialPaths = [],
  nome = ''
}) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [currentPaths, setCurrentPaths] = useState(initialPaths);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  // Calcular dimensões do canvas
  useEffect(() => {
    if (isOpen) {
      const updateDimensions = () => {
        // Usar toda a área disponível
        const width = window.innerWidth;
        const height = window.innerHeight;
        setDimensions({ width, height });
      };
      
      updateDimensions();
      window.addEventListener('resize', updateDimensions);
      window.addEventListener('orientationchange', () => {
        setTimeout(updateDimensions, 100);
      });
      
      return () => {
        window.removeEventListener('resize', updateDimensions);
        window.removeEventListener('orientationchange', updateDimensions);
      };
    }
  }, [isOpen]);
  
  useEffect(() => {
    if (isOpen && canvasRef.current && initialPaths.length > 0) {
      setTimeout(() => {
        canvasRef.current?.setPaths(initialPaths);
      }, 150);
    }
  }, [isOpen, initialPaths, dimensions]);
  
  const handleClear = () => {
    if (canvasRef.current) {
      canvasRef.current.clear();
      setCurrentPaths([]);
    }
  };
  
  const handleSave = () => {
    if (canvasRef.current) {
      const canvas = canvasRef.current.getCanvas();
      const paths = canvasRef.current.getPaths();
      console.log('FullscreenSignature handleSave:', { pathsCount: paths.length, currentPathsCount: currentPaths.length });
      
      // Converter canvas para imagem e guardar directamente
      if (canvas) {
        canvas.toBlob((blob) => {
          if (blob && blob.size > 5000) { // Se o blob tem conteúdo significativo
            onSave(canvas, paths.length > 0 ? paths : currentPaths, blob);
          } else {
            onSave(canvas, paths.length > 0 ? paths : currentPaths, null);
          }
        }, 'image/png', 0.95);
      } else {
        onSave(canvas, paths.length > 0 ? paths : currentPaths, null);
      }
    }
  };
  
  const handleExit = () => {
    // Guardar estado atual antes de sair
    if (canvasRef.current) {
      const paths = canvasRef.current.getPaths();
      onClose(paths);
    } else {
      onClose(currentPaths);
    }
  };
  
  const handlePathChange = (paths) => {
    console.log('handlePathChange:', { pathsCount: paths.length });
    setCurrentPaths(paths);
  };
  
  // Prevenir scroll e zoom no body quando fullscreen está aberto
  useEffect(() => {
    if (isOpen) {
      // Guardar scroll position
      const scrollY = window.scrollY;
      
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.documentElement.style.overflow = 'hidden';
      
      // Forçar orientação horizontal em dispositivos móveis (se suportado)
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {
          // Ignorar erro - nem todos os browsers suportam
        });
      }
      
      return () => {
        // Cleanup será feito no else block
      };
    } else {
      // Restaurar scroll position
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
      
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
    }
    
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  // Detectar se é mobile
  const isMobileDevice = window.innerWidth < 768 || 'ontouchstart' in window;
  
  // Calcular altura do canvas (subtrair header e footer)
  const headerHeight = isMobileDevice ? 50 : 56;
  const footerHeight = isMobileDevice ? 36 : 40;
  const canvasAreaHeight = dimensions.height - headerHeight - footerHeight;
  
  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-white flex flex-col"
      style={{ 
        overscrollBehavior: 'none'
      }}
    >
      {/* Header com botões - Compacto em mobile */}
      <div 
        className={`flex justify-between items-center bg-gray-100 border-b border-gray-300 ${isMobileDevice ? 'px-2 py-1.5' : 'px-4 py-3'}`}
        style={{ height: headerHeight, minHeight: headerHeight, flexShrink: 0, touchAction: 'manipulation' }}
      >
        <div className="flex gap-1.5">
          <Button
            onClick={handleClear}
            onTouchEnd={(e) => { e.preventDefault(); handleClear(); }}
            variant="outline"
            size="sm"
            className={`bg-white border-red-300 text-red-600 hover:bg-red-50 active:bg-red-100 ${isMobileDevice ? 'h-8 px-2 text-xs' : ''}`}
            style={{ touchAction: 'manipulation' }}
          >
            <RotateCcw className={`${isMobileDevice ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${isMobileDevice ? '' : 'mr-1'}`} />
            {!isMobileDevice && 'Limpar'}
          </Button>
          <Button
            onClick={handleSave}
            onTouchEnd={(e) => { e.preventDefault(); handleSave(); }}
            size="sm"
            className={`bg-green-600 hover:bg-green-700 active:bg-green-800 text-white ${isMobileDevice ? 'h-8 px-3 text-xs' : ''}`}
            style={{ touchAction: 'manipulation' }}
          >
            <Save className={`${isMobileDevice ? 'w-3.5 h-3.5 mr-1' : 'w-4 h-4 mr-1'}`} />
            Guardar
          </Button>
        </div>
        
        <div className={`text-center flex-1 ${isMobileDevice ? 'mx-2' : 'mx-4'}`}>
          <p className={`text-gray-600 font-medium truncate ${isMobileDevice ? 'text-xs' : 'text-sm'}`}>
            {nome ? `Assinatura: ${nome}` : 'Assine abaixo'}
          </p>
        </div>
        
        <Button
          onClick={handleExit}
          onTouchEnd={(e) => { e.preventDefault(); handleExit(); }}
          variant="outline"
          size="sm"
          className={`bg-white border-gray-300 active:bg-gray-100 ${isMobileDevice ? 'h-8 px-2 text-xs' : ''}`}
          style={{ touchAction: 'manipulation' }}
        >
          <X className={`${isMobileDevice ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${isMobileDevice ? '' : 'mr-1'}`} />
          {!isMobileDevice && 'Sair'}
        </Button>
      </div>
      
      {/* Área de Assinatura - Ocupa todo o espaço restante */}
      <div 
        className={`flex-1 bg-gray-50 ${isMobileDevice ? 'p-1' : 'p-2'}`}
        style={{ 
          height: canvasAreaHeight,
          overflow: 'hidden'
        }}
      >
        <div 
          className="w-full h-full bg-white rounded-lg border-2 border-dashed border-gray-400 shadow-inner overflow-hidden"
        >
          <SignatureCanvasOptimized
            ref={canvasRef}
            initialData={initialPaths}
            onSignatureChange={handlePathChange}
          />
        </div>
      </div>
      
      {/* Instrução - Compacta em mobile */}
      <div 
        className={`bg-gray-100 text-center border-t border-gray-200 ${isMobileDevice ? 'py-1.5 px-2' : 'py-2 px-4'}`}
        style={{ height: footerHeight, minHeight: footerHeight, flexShrink: 0 }}
      >
        <p className={`text-gray-500 ${isMobileDevice ? 'text-[10px]' : 'text-xs'}`}>
          {isMobileDevice 
            ? 'Use o dedo para assinar • Clique Guardar quando terminar'
            : 'Use o dedo ou caneta stylus para assinar. A assinatura será guardada ao clicar em "Guardar".'
          }
        </p>
      </div>
    </div>
  );
};

const AssinaturaModal = ({
  open,
  onOpenChange,
  selectedRelatorio,
  assinaturas,
  onAssinaturaSaved
}) => {
  const sigCanvasRef = useRef(null);
  const [assinaturaNome, setAssinaturaNome] = useState({ primeiro: '', ultimo: '' });
  const [assinaturaDataIntervencao, setAssinaturaDataIntervencao] = useState(new Date().toISOString().split('T')[0]);
  const [uploadingAssinatura, setUploadingAssinatura] = useState(false);
  const [editingAssinatura, setEditingAssinatura] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [savedPaths, setSavedPaths] = useState([]);
  
  // Detectar mobile
  const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window);

  const clearCanvas = () => {
    if (sigCanvasRef.current) {
      sigCanvasRef.current.clear();
      setSavedPaths([]);
    }
  };

  const openFullscreen = () => {
    // Guardar estado atual antes de abrir fullscreen
    if (sigCanvasRef.current) {
      setSavedPaths(sigCanvasRef.current.getPaths());
    }
    setIsFullscreen(true);
  };

  const closeFullscreen = (paths) => {
    setIsFullscreen(false);
    // Restaurar traços quando fechar fullscreen
    if (paths && paths.length > 0) {
      setSavedPaths(paths);
      setTimeout(() => {
        if (sigCanvasRef.current) {
          sigCanvasRef.current.setPaths(paths);
        }
      }, 100);
    }
  };

  // Referência para guardar o canvas do fullscreen
  const fullscreenCanvasRef = useRef(null);
  const fullscreenBlobRef = useRef(null);

  const saveFromFullscreen = (canvas, paths, blob) => {
    console.log('saveFromFullscreen:', { pathsCount: paths.length, hasBlob: !!blob });
    // Guardar referência ao canvas do fullscreen para usar ao guardar
    fullscreenCanvasRef.current = canvas;
    fullscreenBlobRef.current = blob;
    setSavedPaths(paths);
    setIsFullscreen(false);
  };

  const handleSaveAssinaturaDigital = async () => {
    const isEmpty = sigCanvasRef.current?.isEmpty();
    const hasSavedPaths = savedPaths.length > 0;
    const hasFullscreenBlob = !!fullscreenBlobRef.current;
    
    console.log('handleSaveAssinaturaDigital:', { isEmpty, hasSavedPaths, savedPathsCount: savedPaths.length, hasFullscreenBlob });
    
    if (isEmpty && !hasSavedPaths && !hasFullscreenBlob) {
      toast.error('Por favor, desenhe sua assinatura');
      return;
    }

    if (!assinaturaNome.primeiro.trim() || !assinaturaNome.ultimo.trim()) {
      toast.error('Por favor, preencha primeiro e último nome');
      return;
    }

    setUploadingAssinatura(true);

    try {
      // Se temos um blob do fullscreen, usar directamente
      if (fullscreenBlobRef.current) {
        const blob = fullscreenBlobRef.current;
        const formData = new FormData();
        formData.append('file', blob, 'assinatura.png');
        formData.append('primeiro_nome', assinaturaNome.primeiro);
        formData.append('ultimo_nome', assinaturaNome.ultimo);
        formData.append('data_intervencao', assinaturaDataIntervencao);

        try {
          await axios.post(
            `${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinatura-digital`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
          );

          toast.success('Assinatura digital guardada com sucesso!');
          fullscreenCanvasRef.current = null;
          fullscreenBlobRef.current = null;
          resetForm();
          onAssinaturaSaved();
        } catch (error) {
          toast.error(error.response?.data?.detail || 'Erro ao guardar assinatura');
        } finally {
          setUploadingAssinatura(false);
        }
        return;
      }
      
      // Se temos paths guardados, criar imagem a partir dos paths
      if (savedPaths.length > 0) {
        // Criar um canvas temporário com fundo branco e a assinatura
        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');
        
        const outputWidth = 600;
        const outputHeight = 200;
        tempCanvas.width = outputWidth;
        tempCanvas.height = outputHeight;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, outputWidth, outputHeight);
        
        // Encontrar bounding box dos paths
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        savedPaths.forEach(path => {
          path.forEach(point => {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
          });
        });
        
        const pathWidth = maxX - minX;
        const pathHeight = maxY - minY;
        
        const margin = 20;
        const scaleX = (outputWidth - margin * 2) / pathWidth;
        const scaleY = (outputHeight - margin * 2) / pathHeight;
        const scale = Math.min(scaleX, scaleY, 1.5);
        
        const offsetX = (outputWidth - pathWidth * scale) / 2 - minX * scale;
        const offsetY = (outputHeight - pathHeight * scale) / 2 - minY * scale;
        
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        savedPaths.forEach(path => {
          if (path.length < 2) return;
          ctx.beginPath();
          ctx.moveTo(path[0].x * scale + offsetX, path[0].y * scale + offsetY);
          for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x * scale + offsetX, path[i].y * scale + offsetY);
          }
          ctx.stroke();
        });
        
        tempCanvas.toBlob(async (blob) => {
          const formData = new FormData();
          formData.append('file', blob, 'assinatura.png');
          formData.append('primeiro_nome', assinaturaNome.primeiro);
          formData.append('ultimo_nome', assinaturaNome.ultimo);
          formData.append('data_intervencao', assinaturaDataIntervencao);

          try {
            await axios.post(
              `${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinatura-digital`,
              formData,
              { headers: { 'Content-Type': 'multipart/form-data' } }
            );

            toast.success('Assinatura digital guardada com sucesso!');
            fullscreenCanvasRef.current = null;
            fullscreenBlobRef.current = null;
            resetForm();
            onAssinaturaSaved();
          } catch (error) {
            toast.error(error.response?.data?.detail || 'Erro ao guardar assinatura');
          } finally {
            setUploadingAssinatura(false);
          }
        }, 'image/png', 0.95);
        return;
      }
      
      // Fallback: usar o canvas pequeno diretamente
      const canvas = sigCanvasRef.current?.getCanvas();
      if (!canvas) {
        toast.error('Erro: Canvas não encontrado');
        setUploadingAssinatura(false);
        return;
      }
      
      canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('file', blob, 'assinatura.png');
        formData.append('primeiro_nome', assinaturaNome.primeiro);
        formData.append('ultimo_nome', assinaturaNome.ultimo);
        formData.append('data_intervencao', assinaturaDataIntervencao);

        try {
          await axios.post(
            `${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinatura-digital`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
          );

          toast.success('Assinatura digital guardada com sucesso!');
          fullscreenCanvasRef.current = null;
          fullscreenBlobRef.current = null;
          resetForm();
          onAssinaturaSaved();
        } catch (error) {
          toast.error(error.response?.data?.detail || 'Erro ao guardar assinatura');
        } finally {
          setUploadingAssinatura(false);
        }
      }, 'image/png', 0.95);
    } catch (error) {
      toast.error('Erro ao processar assinatura');
      setUploadingAssinatura(false);
    }
  };

  const handleSaveAssinaturaManual = async () => {
    if (!assinaturaNome.primeiro.trim() || !assinaturaNome.ultimo.trim()) {
      toast.error('Por favor, preencha primeiro e último nome');
      return;
    }

    setUploadingAssinatura(true);

    try {
      const formData = new FormData();
      formData.append('primeiro_nome', assinaturaNome.primeiro);
      formData.append('ultimo_nome', assinaturaNome.ultimo);
      formData.append('data_intervencao', assinaturaDataIntervencao);

      await axios.post(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinatura-manual`,
        formData
      );

      toast.success('Assinatura manual guardada com sucesso!');
      resetForm();
      onAssinaturaSaved();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao guardar assinatura');
    } finally {
      setUploadingAssinatura(false);
    }
  };

  const handleDeleteAssinatura = async (assinaturaId) => {
    if (!window.confirm('Tem certeza que deseja eliminar esta assinatura?')) return;
    
    try {
      await axios.delete(`${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinaturas/${assinaturaId}`);
      toast.success('Assinatura removida com sucesso!');
      onAssinaturaSaved();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao remover assinatura');
    }
  };

  const handleUpdateAssinaturaData = async (assinaturaId, novaData) => {
    try {
      await axios.put(
        `${API}/relatorios-tecnicos/${selectedRelatorio.id}/assinaturas/${assinaturaId}/data`,
        { data_intervencao: novaData }
      );
      toast.success('Data da assinatura atualizada!');
      setEditingAssinatura(null);
      onAssinaturaSaved();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao atualizar data');
    }
  };

  const resetForm = () => {
    setAssinaturaNome({ primeiro: '', ultimo: '' });
    setAssinaturaDataIntervencao(new Date().toISOString().split('T')[0]);
    setSavedPaths([]);
    if (sigCanvasRef.current) {
      sigCanvasRef.current.clear();
    }
  };

  // Restaurar paths quando o componente monta ou paths mudam
  useEffect(() => {
    if (open && savedPaths.length > 0 && sigCanvasRef.current) {
      setTimeout(() => {
        sigCanvasRef.current?.setPaths(savedPaths);
      }, 200);
    }
  }, [open, savedPaths]);

  return (
    <>
      <Dialog open={open && !isFullscreen} onOpenChange={onOpenChange}>
        <DialogContent className={`bg-[#1a1a1a] border-gray-700 text-white z-[100] ${isMobile ? 'max-w-[95vw] max-h-[85vh] rounded-xl' : 'max-w-2xl max-h-[90vh]'} overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 text-white ${isMobile ? 'text-base' : ''}`}>
              <PenTool className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-blue-400`} />
              {isMobile ? `Assinaturas OT#${selectedRelatorio?.numero_assistencia}` : `Assinaturas - OT #${selectedRelatorio?.numero_assistencia}`}
            </DialogTitle>
          </DialogHeader>

          <div className={`space-y-4 ${isMobile ? 'mt-2' : 'mt-4'}`}>
            {/* Lista de Assinaturas Existentes */}
            {assinaturas && assinaturas.length > 0 && (
              <div className="space-y-2">
                <h4 className={`font-semibold text-gray-400 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  Assinaturas ({assinaturas.length})
                </h4>
                {assinaturas.map((ass, index) => (
                  <div key={ass.id || index} className={`bg-[#0f0f0f] rounded-lg flex items-center justify-between ${isMobile ? 'p-2' : 'p-3'}`}>
                    <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-3'}`}>
                      {ass.assinatura_base64 && (
                        <img
                          src={ass.assinatura_base64.startsWith('data:') ? ass.assinatura_base64 : `data:image/png;base64,${ass.assinatura_base64}`}
                          alt="Assinatura"
                          className={`bg-white rounded ${isMobile ? 'h-8' : 'h-10'}`}
                        />
                      )}
                      <div>
                        <p className={`text-white font-medium ${isMobile ? 'text-sm' : ''}`}>
                          {ass.primeiro_nome} {ass.ultimo_nome}
                        </p>
                        {editingAssinatura === ass.id ? (
                          <div className={`flex items-center gap-2 mt-1 ${isMobile ? 'flex-col items-start' : ''}`}>
                            <Input
                              type="date"
                              defaultValue={ass.data_intervencao?.split('T')[0]}
                              className={`bg-[#1a1a1a] border-gray-700 text-white ${isMobile ? 'h-7 w-32 text-xs' : 'h-8 w-40'}`}
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleUpdateAssinaturaData(ass.id, e.target.value);
                                }
                              }}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingAssinatura(null)}
                              className={`text-gray-400 ${isMobile ? 'h-6 text-xs px-2' : 'h-8'}`}
                            >
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <p className={`text-gray-400 flex items-center gap-1 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                            <Calendar className={isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
                            {ass.data_intervencao ? new Date(ass.data_intervencao).toLocaleDateString('pt-PT') : 'Sem data'}
                            <button
                              onClick={() => setEditingAssinatura(ass.id)}
                              className="ml-1 text-blue-400 hover:text-blue-300"
                            >
                              <Edit className={isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
                            </button>
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteAssinatura(ass.id)}
                      className={`text-red-400 hover:text-red-300 hover:bg-red-500/10 ${isMobile ? 'h-7 w-7 p-0' : ''}`}
                    >
                      <Trash2 className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Adicionar Nova Assinatura */}
            <div className={`border-t border-gray-700 ${isMobile ? 'pt-3' : 'pt-4'}`}>
              <h4 className={`font-semibold text-gray-400 flex items-center gap-2 ${isMobile ? 'text-xs mb-3' : 'text-sm mb-4'}`}>
                <Plus className={isMobile ? 'w-3 h-3' : 'w-4 h-4'} />
                Nova Assinatura
              </h4>

              <div className={`grid grid-cols-2 ${isMobile ? 'gap-2 mb-3' : 'gap-4 mb-4'}`}>
                <div>
                  <Label className={`text-gray-400 ${isMobile ? 'text-[10px]' : 'text-sm'}`}>Primeiro Nome *</Label>
                  <Input
                    value={assinaturaNome.primeiro}
                    onChange={(e) => setAssinaturaNome({ ...assinaturaNome, primeiro: e.target.value })}
                    className={`bg-[#0f0f0f] border-gray-700 text-white ${isMobile ? 'text-sm h-9' : ''}`}
                    placeholder="Ex: João"
                  />
                </div>
                <div>
                  <Label className={`text-gray-400 ${isMobile ? 'text-[10px]' : 'text-sm'}`}>Último Nome *</Label>
                  <Input
                    value={assinaturaNome.ultimo}
                    onChange={(e) => setAssinaturaNome({ ...assinaturaNome, ultimo: e.target.value })}
                    className={`bg-[#0f0f0f] border-gray-700 text-white ${isMobile ? 'text-sm h-9' : ''}`}
                    placeholder="Ex: Silva"
                  />
                </div>
              </div>

              <div className={isMobile ? 'mb-3' : 'mb-4'}>
                <Label className={`text-gray-400 ${isMobile ? 'text-[10px]' : 'text-sm'}`}>Data *</Label>
                <Input
                  type="date"
                  value={assinaturaDataIntervencao}
                  onChange={(e) => setAssinaturaDataIntervencao(e.target.value)}
                  className={`bg-[#0f0f0f] border-gray-700 text-white ${isMobile ? 'w-36 text-sm h-9' : 'w-48'}`}
                />
              </div>

              <Tabs defaultValue="digital" className="w-full">
                <TabsList className={`grid w-full grid-cols-2 bg-[#0f0f0f] ${isMobile ? 'h-9' : ''}`}>
                  <TabsTrigger value="digital" className={`data-[state=active]:bg-blue-600 ${isMobile ? 'text-xs' : ''}`}>
                    {isMobile ? 'Digital' : 'Assinatura Digital'}
                  </TabsTrigger>
                  <TabsTrigger value="manual" className={`data-[state=active]:bg-blue-600 ${isMobile ? 'text-xs' : ''}`}>
                    {isMobile ? 'Só Nome' : 'Apenas Nome'}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="digital" className={isMobile ? 'mt-3' : 'mt-4'}>
                  {/* Botão Fullscreen - Mais proeminente em mobile */}
                  {isMobile ? (
                    <Button
                      onClick={openFullscreen}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white mb-3"
                    >
                      <Maximize2 className="w-4 h-4 mr-2" />
                      Abrir Ecrã Completo para Assinar
                    </Button>
                  ) : (
                    <div className="flex justify-end mb-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={openFullscreen}
                        className="border-blue-500 text-blue-400 hover:bg-blue-500/10"
                      >
                        <Maximize2 className="w-4 h-4 mr-1" />
                        Ecrã Completo
                      </Button>
                    </div>
                  )}
                  
                  {/* Área de Assinatura - Escondida em mobile quando não há paths */}
                  {(!isMobile || savedPaths.length > 0) && (
                    <>
                      <div className={`bg-white rounded-lg ${isMobile ? 'p-1' : 'p-2'} mb-3`} style={{ height: isMobile ? '100px' : '150px' }}>
                        <SignatureCanvasOptimized
                          ref={sigCanvasRef}
                          initialData={savedPaths}
                          onSignatureChange={setSavedPaths}
                        />
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={clearCanvas}
                          className={`border-gray-600 ${isMobile ? 'text-xs' : ''}`}
                          size={isMobile ? 'sm' : 'default'}
                        >
                          <RotateCcw className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-1'}`} />
                          Limpar
                        </Button>
                        <Button
                          onClick={handleSaveAssinaturaDigital}
                          disabled={uploadingAssinatura}
                          className={`flex-1 bg-blue-600 hover:bg-blue-700 ${isMobile ? 'text-xs' : ''}`}
                          size={isMobile ? 'sm' : 'default'}
                        >
                          {uploadingAssinatura ? 'A guardar...' : (isMobile ? 'Guardar' : 'Guardar Assinatura Digital')}
                        </Button>
                      </div>
                    </>
                  )}
                  
                  {/* Mensagem para mobile quando não tem assinatura */}
                  {isMobile && savedPaths.length === 0 && (
                    <p className="text-center text-gray-500 text-xs mt-2">
                      Clique no botão acima para assinar em ecrã completo
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="manual" className={isMobile ? 'mt-3' : 'mt-4'}>
                  <p className={`text-gray-400 ${isMobile ? 'text-xs mb-2' : 'text-sm mb-3'}`}>
                    {isMobile ? 'Assinatura registada só com nome, sem imagem.' : 'A assinatura será registada apenas com o nome fornecido, sem imagem.'}
                  </p>
                  <Button
                    onClick={handleSaveAssinaturaManual}
                    disabled={uploadingAssinatura}
                    className={`w-full bg-green-600 hover:bg-green-700 ${isMobile ? 'text-sm' : ''}`}
                  >
                    {uploadingAssinatura ? 'A guardar...' : (isMobile ? 'Guardar' : 'Guardar Assinatura Manual')}
                  </Button>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen Signature Modal */}
      <FullscreenSignature
        isOpen={isFullscreen}
        onClose={closeFullscreen}
        onSave={saveFromFullscreen}
        initialPaths={savedPaths}
        nome={assinaturaNome.primeiro && assinaturaNome.ultimo 
          ? `${assinaturaNome.primeiro} ${assinaturaNome.ultimo}` 
          : ''}
      />
    </>
  );
};

export default AssinaturaModal;
