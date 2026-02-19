/**
 * Hook para gestão de clientes.
 * Centraliza estados e funções relacionadas com clientes.
 */
import { useState, useCallback } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { toast } from 'sonner';

export const useClientes = (initialClientes = []) => {
  const [clientes, setClientes] = useState(initialClientes);
  const [loading, setLoading] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState(null);
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Fetch all clientes
  const fetchClientes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/clientes`);
      setClientes(response.data);
      return response.data;
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
      toast.error('Erro ao carregar clientes');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Create cliente
  const createCliente = useCallback(async (data) => {
    try {
      const response = await axios.post(`${API}/clientes`, data);
      setClientes(prev => [...prev, response.data]);
      toast.success('Cliente criado com sucesso');
      return response.data;
    } catch (error) {
      console.error('Erro ao criar cliente:', error);
      toast.error(error.response?.data?.detail || 'Erro ao criar cliente');
      throw error;
    }
  }, []);

  // Update cliente
  const updateCliente = useCallback(async (clienteId, data) => {
    try {
      const response = await axios.put(`${API}/clientes/${clienteId}`, data);
      setClientes(prev => 
        prev.map(c => c.id === clienteId ? response.data : c)
      );
      toast.success('Cliente atualizado com sucesso');
      return response.data;
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error);
      toast.error(error.response?.data?.detail || 'Erro ao atualizar cliente');
      throw error;
    }
  }, []);

  // Delete cliente
  const deleteCliente = useCallback(async (clienteId) => {
    try {
      await axios.delete(`${API}/clientes/${clienteId}`);
      setClientes(prev => prev.filter(c => c.id !== clienteId));
      toast.success('Cliente eliminado com sucesso');
    } catch (error) {
      console.error('Erro ao eliminar cliente:', error);
      toast.error(error.response?.data?.detail || 'Erro ao eliminar cliente');
      throw error;
    }
  }, []);

  // Open modals
  const openAddModal = useCallback(() => {
    setSelectedCliente(null);
    setShowAddModal(true);
  }, []);

  const openViewModal = useCallback((cliente) => {
    setSelectedCliente(cliente);
    setShowViewModal(true);
  }, []);

  const openEditModal = useCallback((cliente) => {
    setSelectedCliente(cliente);
    setShowEditModal(true);
  }, []);

  const openDeleteModal = useCallback((cliente) => {
    setSelectedCliente(cliente);
    setShowDeleteModal(true);
  }, []);

  // Close all modals
  const closeModals = useCallback(() => {
    setShowAddModal(false);
    setShowEditModal(false);
    setShowViewModal(false);
    setShowDeleteModal(false);
  }, []);

  return {
    // State
    clientes,
    setClientes,
    loading,
    selectedCliente,
    setSelectedCliente,
    
    // Modal states
    showAddModal,
    setShowAddModal,
    showEditModal,
    setShowEditModal,
    showViewModal,
    setShowViewModal,
    showDeleteModal,
    setShowDeleteModal,
    
    // Actions
    fetchClientes,
    createCliente,
    updateCliente,
    deleteCliente,
    
    // Modal helpers
    openAddModal,
    openViewModal,
    openEditModal,
    openDeleteModal,
    closeModals,
  };
};

export default useClientes;
