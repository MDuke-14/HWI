import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const VacationReviewModal = ({ open, onOpenChange, onSuccess }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [vacationDays, setVacationDays] = useState([]);
  const [selectedDays, setSelectedDays] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchVacationDays();
      setSelectedDays(new Set());
    }
  }, [open]);

  const fetchVacationDays = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/vacations/approved-days`);
      setVacationDays(response.data);
    } catch (error) {
      toast.error('Erro ao carregar dias de férias');
    } finally {
      setLoading(false);
    }
  };

  const vacationDateSet = new Set(vacationDays.map(d => d.date));

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let day = 1; day <= daysInMonth; day++) days.push(day);
    return days;
  };

  const getDateString = (day) => {
    if (!day) return '';
    return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const toggleDay = (dateStr) => {
    if (!vacationDateSet.has(dateStr)) return;
    const next = new Set(selectedDays);
    if (next.has(dateStr)) next.delete(dateStr);
    else next.add(dateStr);
    setSelectedDays(next);
  };

  const handleConfirm = async () => {
    if (selectedDays.size === 0) return;
    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/vacations/cancel-days`, {
        dates: Array.from(selectedDays)
      });
      toast.success(response.data.message);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao cancelar dias');
    } finally {
      setSubmitting(false);
    }
  };

  const days = getDaysInMonth();
  const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const today = new Date();
  const monthName = currentDate.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

  // Count vacation days in current month
  const vacDaysThisMonth = vacationDays.filter(d => {
    const dt = new Date(d.date + 'T00:00:00');
    return dt.getMonth() === currentDate.getMonth() && dt.getFullYear() === currentDate.getFullYear();
  }).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0a0a] border-gray-800 text-white max-w-[95vw] md:max-w-lg p-0 overflow-hidden" data-testid="vacation-review-modal">
        <DialogHeader className="p-4 pb-2 border-b border-white/5">
          <DialogTitle className="text-base md:text-lg font-semibold">Rever Férias</DialogTitle>
          <p className="text-xs text-gray-400 mt-1">Selecione os dias de férias que pretende cancelar</p>
        </DialogHeader>

        <div className="p-3 md:p-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="sm" onClick={prevMonth} className="text-gray-400 hover:text-white hover:bg-white/10 p-1.5">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="text-center">
              <span className="text-sm md:text-base font-semibold text-white capitalize">{monthName}</span>
              {vacDaysThisMonth > 0 && (
                <span className="ml-2 text-xs text-blue-400">({vacDaysThisMonth} dias)</span>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={nextMonth} className="text-gray-400 hover:text-white hover:bg-white/10 p-1.5">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Legend */}
          <div className="flex gap-4 mb-3 px-1">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-blue-500/30 border border-blue-500/50"></div>
              <span className="text-[10px] md:text-xs text-gray-400">Férias</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-red-500/30 border border-red-500/50"></div>
              <span className="text-[10px] md:text-xs text-gray-400">A cancelar</span>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 rounded-lg overflow-hidden border border-white/10">
            {/* Week Headers */}
            {weekDays.map((day, i) => (
              <div key={i} className={`text-center font-medium text-[10px] md:text-xs py-2 uppercase tracking-widest border-b border-white/10 bg-white/[0.03] ${i === 0 || i === 6 ? 'text-gray-600' : 'text-gray-400'}`}>
                {day}
              </div>
            ))}

            {/* Calendar Days */}
            {days.map((day, index) => {
              const dateStr = getDateString(day);
              const isVacation = vacationDateSet.has(dateStr);
              const isSelected = selectedDays.has(dateStr);
              const isToday = day && day === today.getDate() && currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear();
              const isWeekend = index % 7 === 0 || index % 7 === 6;

              return (
                <div
                  key={index}
                  onClick={() => day && isVacation && toggleDay(dateStr)}
                  className={`
                    min-h-[44px] md:min-h-[52px] p-1 border-b border-r border-white/5 relative flex items-center justify-center
                    ${!day ? '' : isVacation ? 'cursor-pointer' : ''}
                    ${isVacation && isSelected ? 'bg-red-500/20 hover:bg-red-500/30' : ''}
                    ${isVacation && !isSelected ? 'bg-blue-500/15 hover:bg-blue-500/25' : ''}
                    ${!isVacation && day ? (isWeekend ? 'bg-white/[0.01]' : '') : ''}
                    transition-colors
                  `}
                  data-testid={day ? `review-day-${day}` : undefined}
                >
                  {day && (
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`
                        text-xs md:text-sm font-mono
                        ${isToday ? 'bg-emerald-500 text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px]' : ''}
                        ${isVacation && isSelected ? 'text-red-300 font-semibold' : ''}
                        ${isVacation && !isSelected ? 'text-blue-300 font-semibold' : ''}
                        ${!isVacation && !isToday ? (isWeekend ? 'text-gray-600' : 'text-gray-500') : ''}
                      `}>
                        {day}
                      </span>
                      {isVacation && isSelected && (
                        <X className="w-3 h-3 text-red-400" />
                      )}
                      {isVacation && !isSelected && (
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selection Info + Confirm */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-sm text-gray-400">
              {selectedDays.size > 0 ? (
                <span className="text-red-400 font-semibold">{selectedDays.size} dia(s) selecionado(s) para cancelar</span>
              ) : (
                <span>Toque nos dias azuis para selecionar</span>
              )}
            </div>
            <Button
              onClick={handleConfirm}
              disabled={selectedDays.size === 0 || submitting}
              className="bg-red-600 hover:bg-red-700 text-white rounded-full text-xs md:text-sm px-4"
              size="sm"
              data-testid="confirm-cancel-days-btn"
            >
              {submitting ? 'A cancelar...' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VacationReviewModal;
