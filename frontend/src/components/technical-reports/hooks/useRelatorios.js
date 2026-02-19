/**
 * Hook para gestão de estado dos relatórios técnicos (OTs).
 * Centraliza estados e funções relacionadas com relatórios.
 */
import { useState, useCallback } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { toast } from 'sonner';

export const useRelatorios = (initialRelatorios = []) => {
  const [relatorios, setRelatorios] = useState(initialRelatorios);
  const [loading, setLoading] = useState(false);
  const [selectedRelatorio, setSelectedRelatorio] = useState(null);
  
  // Modal states
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);

  // Fetch all relatórios
  const fetchRelatorios = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos`);
      setRelatorios(response.data);
      return response.data;
    } catch (error) {
      console.error('Erro ao carregar relatórios:', error);
      toast.error('Erro ao carregar relatórios');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch single relatório
  const fetchRelatorio = useCallback(async (relatorioId) => {
    try {
      const response = await axios.get(`${API}/relatorios-tecnicos/${relatorioId}`);
      return response.data;
    } catch (error) {
      console.error('Erro ao carregar relatório:', error);
      toast.error('Erro ao carregar relatório');
      return null;
    }
  }, []);

  // Create relatório
  const createRelatorio = useCallback(async (data) => {
    try {
      const response = await axios.post(`${API}/relatorios-tecnicos`, data);
      setRelatorios(prev => [...prev, response.data]);
      toast.success('Relatório criado com sucesso');
      return response.data;
    } catch (error) {
      console.error('Erro ao criar relatório:', error);
      toast.error(error.response?.data?.detail || 'Erro ao criar relatório');
      throw error;
    }
  }, []);

  // Update relatório
  const updateRelatorio = useCallback(async (relatorioId, data) => {
    try {
      const response = await axios.put(`${API}/relatorios-tecnicos/${relatorioId}`, data);
      setRelatorios(prev => 
        prev.map(r => r.id === relatorioId ? response.data : r)
      );
      toast.success('Relatório atualizado com sucesso');
      return response.data;
    } catch (error) {
      console.error('Erro ao atualizar relatório:', error);
      toast.error(error.response?.data?.detail || 'Erro ao atualizar relatório');
      throw error;
    }
  }, []);

  // Delete relatório
  const deleteRelatorio = useCallback(async (relatorioId) => {
    try {
      await axios.delete(`${API}/relatorios-tecnicos/${relatorioId}`);
      setRelatorios(prev => prev.filter(r => r.id !== relatorioId));
      toast.success('Relatório eliminado com sucesso');
    } catch (error) {
      console.error('Erro ao eliminar relatório:', error);
      toast.error(error.response?.data?.detail || 'Erro ao eliminar relatório');
      throw error;
    }
  }, []);

  // Update status
  const updateStatus = useCallback(async (relatorioId, status) => {
    try {
      const response = await axios.patch(`${API}/relatorios-tecnicos/${relatorioId}/status`, { status });
      setRelatorios(prev => 
        prev.map(r => r.id === relatorioId ? { ...r, status } : r)
      );
      toast.success('Estado atualizado com sucesso');
      return response.data;
    } catch (error) {
      console.error('Erro ao atualizar estado:', error);
      toast.error(error.response?.data?.detail || 'Erro ao atualizar estado');
      throw error;
    }
  }, []);

  // Open modals with selected relatório
  const openViewModal = useCallback((relatorio) => {
    setSelectedRelatorio(relatorio);
    setShowViewModal(true);
  }, []);

  const openEditModal = useCallback((relatorio) => {
    setSelectedRelatorio(relatorio);
    setShowEditModal(true);
  }, []);

  const openDeleteModal = useCallback((relatorio) => {
    setSelectedRelatorio(relatorio);
    setShowDeleteModal(true);
  }, []);

  const openStatusModal = useCallback((relatorio) => {
    setSelectedRelatorio(relatorio);
    setShowStatusModal(true);
  }, []);

  // Close all modals
  const closeModals = useCallback(() => {
    setShowViewModal(false);
    setShowEditModal(false);
    setShowDeleteModal(false);
    setShowStatusModal(false);
    setSelectedRelatorio(null);
  }, []);

  return {
    // State
    relatorios,
    setRelatorios,
    loading,
    selectedRelatorio,
    setSelectedRelatorio,
    
    // Modal states
    showViewModal,
    setShowViewModal,
    showEditModal,
    setShowEditModal,
    showDeleteModal,
    setShowDeleteModal,
    showStatusModal,
    setShowStatusModal,
    
    // Actions
    fetchRelatorios,
    fetchRelatorio,
    createRelatorio,
    updateRelatorio,
    deleteRelatorio,
    updateStatus,
    
    // Modal helpers
    openViewModal,
    openEditModal,
    openDeleteModal,
    openStatusModal,
    closeModals,
  };
};

export default useRelatorios;
