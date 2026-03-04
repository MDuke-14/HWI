import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { FileText, Upload, AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';

const Absences = ({ user, onLogout }) => {
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(null);
  const [formData, setFormData] = useState({
    date: '',
    absence_type: 'full_justified',
    hours: 8,
    is_justified: true,
    reason: ''
  });

  useEffect(() => {
    fetchAbsences();
    checkLateArrival();
  }, []);

  const fetchAbsences = async () => {
    try {
      const response = await axios.get(`${API}/absences/my-absences`);
      setAbsences(response.data);
    } catch (error) {
      console.error('Erro ao carregar faltas');
    }
  };

  const checkLateArrival = async () => {
    try {
      const response = await axios.get(`${API}/absences/check-late`);
      if (response.data.is_late && !response.data.already_notified) {
        toast.warning('Ainda não iniciou o ponto hoje!', {
          description: 'Se não estiver presente, registe a falta.',
          duration: 10000
        });
      }
    } catch (error) {
      console.error('Erro ao verificar atraso');
    }
  };

  const handleAbsenceTypeChange = (value) => {
    setFormData({
      ...formData,
      absence_type: value,
      hours: value.includes('full') ? 8 : formData.hours,
      is_justified: value === 'full_justified' || value === 'partial'
    });
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/absences/create`, formData);
      toast.success('Falta registada com sucesso!');
      setShowDialog(false);
      setFormData({ date: '', absence_type: 'full_justified', hours: 8, is_justified: true, reason: '' });
      fetchAbsences();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao registar falta');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (absenceId, file) => {
    setUploadingFile(absenceId);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post(`${API}/absences/${absenceId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Ficheiro carregado!');
      fetchAbsences();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao carregar ficheiro');
    } finally {
      setUploadingFile(null);
    }
  };

  const downloadFile = async (filename) => {
    try {
      const response = await axios.get(`${API}/absences/file/${filename}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error('Erro ao descarregar ficheiro');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { color: 'bg-amber-700 text-amber-200', icon: <Clock className="w-3 h-3" />, text: 'Pendente' },
      approved: { color: 'bg-green-700 text-green-200', icon: <CheckCircle className="w-3 h-3" />, text: 'Aprovado' },
      rejected: { color: 'bg-red-700 text-red-200', icon: <XCircle className="w-3 h-3" />, text: 'Rejeitado' }
    };
    const badge = badges[status];
    return <span className={`${badge.color} px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1`}>{badge.icon}{badge.text}</span>;
  };

  const getAbsenceTypeText = (type, hours) => {
    if (type === 'full_justified') return 'Falta 8h Justificada';
    if (type === 'full_unjustified') return 'Falta 8h Injustificada';
    return `Falta ${hours}h`;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] mobile-safe-top">
      <Navigation user={user} onLogout={onLogout} activePage="absences" />
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-6xl fade-in">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6 md:mb-8">
          <h1 className="text-2xl md:text-4xl font-bold text-white flex items-center gap-2 md:gap-3">
            <FileText className="w-7 h-7 md:w-10 md:h-10" />
            Gestão de Faltas
          </h1>
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white rounded-full text-xs md:text-sm w-fit" size="sm">
                Registar Falta
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-[95vw] md:max-w-md mx-auto">
              <DialogHeader>
                <DialogTitle className="text-base md:text-lg">Registar Falta</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="bg-[#0a0a0a] border-gray-700 text-white"
                  />
                </div>

                <div>
                  <Label>Tipo de Falta</Label>
                  <Select value={formData.absence_type} onValueChange={handleAbsenceTypeChange}>
                    <SelectTrigger className="bg-[#0a0a0a] border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-gray-700 text-white">
                      <SelectItem value="full_justified">Falta 8h Justificada</SelectItem>
                      <SelectItem value="full_unjustified">Falta 8h Injustificada</SelectItem>
                      <SelectItem value="partial">Falta Parcial (X horas)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.absence_type === 'partial' && (
                  <>
                    <div>
                      <Label>Número de Horas</Label>
                      <Input
                        type="number"
                        min="0.5"
                        max="8"
                        step="0.5"
                        value={formData.hours}
                        onChange={(e) => setFormData({ ...formData, hours: parseFloat(e.target.value) })}
                        className="bg-[#0a0a0a] border-gray-700 text-white"
                      />
                    </div>

                    <div>
                      <Label>Estado</Label>
                      <Select
                        value={formData.is_justified ? 'justified' : 'unjustified'}
                        onValueChange={(v) => setFormData({ ...formData, is_justified: v === 'justified' })}
                      >
                        <SelectTrigger className="bg-[#0a0a0a] border-gray-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1a1a] border-gray-700 text-white">
                          <SelectItem value="justified">Justificada</SelectItem>
                          <SelectItem value="unjustified">Injustificada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <div>
                  <Label>Motivo (opcional)</Label>
                  <Textarea
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="Ex: Consulta médica"
                    className="bg-[#0a0a0a] border-gray-700 text-white"
                  />
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-700 text-white rounded-full"
                >
                  {loading ? 'A registar...' : 'Registar Falta'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="glass-effect p-4 md:p-6 rounded-xl mb-4 md:mb-6 border-l-4 border-amber-500">
          <div className="flex items-start gap-2 md:gap-3">
            <AlertCircle className="w-5 h-5 md:w-6 md:h-6 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-white font-semibold text-sm md:text-base mb-1 md:mb-2">Informação Importante</h3>
              <p className="text-gray-300 text-xs md:text-sm">
                Se não iniciar o ponto até às <strong>9h00</strong> em dias úteis, será notificado automaticamente. 
                Caso esteja ausente, registe a falta e faça upload da justificação (PDF ou JPG) se aplicável.
              </p>
            </div>
          </div>
        </div>

        <div className="glass-effect p-4 md:p-6 rounded-xl">
          <h2 className="text-lg md:text-2xl font-semibold text-white mb-4 md:mb-6">Minhas Faltas</h2>
          {absences.length > 0 ? (
            <div className="space-y-3 md:space-y-4">
              {absences.map((absence) => (
                <div key={absence.id} className="bg-[#1a1a1a] p-3 md:p-5 rounded-lg" data-testid={`absence-card-${absence.id}`}>
                  <div className="flex justify-between items-start gap-2 mb-2 md:mb-3">
                    <div className="min-w-0">
                      <div className="text-white font-semibold text-sm md:text-lg mb-0.5 md:mb-1">
                        {new Date(absence.date + 'T00:00:00').toLocaleDateString('pt-PT', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                      <div className="text-gray-400 text-xs md:text-sm">{getAbsenceTypeText(absence.absence_type, absence.hours)}</div>
                      {absence.is_justified && (
                        <span className="inline-block mt-1 md:mt-2 px-2 py-0.5 md:py-1 bg-blue-700 text-blue-200 rounded text-xs">
                          Justificada
                        </span>
                      )}
                    </div>
                    {getStatusBadge(absence.status)}
                  </div>

                  {absence.reason && (
                    <div className="text-gray-300 text-xs md:text-sm mt-2 md:mt-3 pt-2 md:pt-3 border-t border-gray-700">
                      <strong>Motivo:</strong> {absence.reason}
                    </div>
                  )}

                  <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-gray-700 flex flex-wrap gap-2">
                    {absence.justification_file ? (
                      <Button
                        onClick={() => downloadFile(absence.justification_file)}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs md:text-sm"
                        size="sm"
                        data-testid={`download-justification-${absence.id}`}
                      >
                        <FileText className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1" />
                        Ver Justificação
                      </Button>
                    ) : (
                      <div className="relative">
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            if (e.target.files[0]) {
                              handleFileUpload(absence.id, e.target.files[0]);
                            }
                          }}
                          className="hidden"
                          id={`file-${absence.id}`}
                          disabled={uploadingFile === absence.id}
                        />
                        <Button
                          onClick={() => document.getElementById(`file-${absence.id}`).click()}
                          disabled={uploadingFile === absence.id}
                          className="bg-green-600 hover:bg-green-700 text-white rounded-full text-xs md:text-sm"
                          size="sm"
                          data-testid={`upload-justification-${absence.id}`}
                        >
                          <Upload className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1" />
                          {uploadingFile === absence.id ? 'A carregar...' : 'Upload Justificação'}
                        </Button>
                      </div>
                    )}
                  </div>

                  {absence.reviewed_by && (
                    <div className="text-gray-500 text-xs mt-2 md:mt-3">
                      Revisto por: {absence.reviewed_by}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8 md:py-12">
              <FileText className="w-10 h-10 md:w-16 md:h-16 text-gray-600 mx-auto mb-3 md:mb-4" />
              <p className="text-sm md:text-lg">Não há faltas registadas</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Absences;
