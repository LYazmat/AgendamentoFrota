/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vehicle, Booking, MaintenanceRecord } from '../types';
import { INITIAL_VEHICLES, INITIAL_BOOKINGS, INITIAL_MAINTENANCE } from '../initialData';

// --- CONFIGURAÇÃO DE INTEGRAÇÃO COM DJANGO ---
// Mude para `true` quando conectar ao seu servidor Django backend!
// Você também pode configurar a URL base da sua API Django no arquivo .env ou diretamente abaixo.
export const USE_DJANGO_API = false; 

// URL base para as chamadas de API do Django (ex: 'http://localhost:8000')
const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '';

// Utilitário para lidar com o CSRF Token do Django
function getCsrfToken(): string | null {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1] : null;
}

// Cabeçalhos HTTP padrão para chamadas Django
function getHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken;
  }
  return headers;
}

/**
 * SERVIÇO DE VEÍCULOS (VEHICLES API)
 */
export const VehiclesService = {
  // Obter todos os veículos
  async getAll(): Promise<Vehicle[]> {
    if (!USE_DJANGO_API) {
      const saved = localStorage.getItem('fleet_vehicles_v1');
      return saved ? JSON.parse(saved) : INITIAL_VEHICLES;
    }

    const response = await fetch(`${API_BASE_URL}/api/vehicles/`, {
      method: 'GET',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Erro ao obter veículos do Django');
    return response.json();
  },

  // Salvar veículo (Novo ou Edição)
  async save(vehicle: Vehicle): Promise<Vehicle> {
    if (!USE_DJANGO_API) {
      const saved = await this.getAll();
      const exists = saved.some(v => v.id === vehicle.id);
      let updated: Vehicle[];

      if (exists) {
        updated = saved.map(v => v.id === vehicle.id ? vehicle : v);
      } else {
        updated = [vehicle, ...saved];
      }
      localStorage.setItem('fleet_vehicles_v1', JSON.stringify(updated));
      return vehicle;
    }

    const isExisting = vehicle.id && !vehicle.id.startsWith('v_'); // Se ID veio do Django (geralmente numérico ou UUID)
    const url = isExisting 
      ? `${API_BASE_URL}/api/vehicles/${vehicle.id}/` 
      : `${API_BASE_URL}/api/vehicles/`;
      
    const response = await fetch(url, {
      method: isExisting ? 'PUT' : 'POST',
      headers: getHeaders(),
      body: JSON.stringify(vehicle),
    });
    if (!response.ok) throw new Error('Erro ao salvar veículo no Django');
    return response.json();
  },

  // Remover veículo
  async delete(id: string): Promise<void> {
    if (!USE_DJANGO_API) {
      const saved = await this.getAll();
      const filtered = saved.filter(v => v.id !== id);
      localStorage.setItem('fleet_vehicles_v1', JSON.stringify(filtered));
      return;
    }

    const response = await fetch(`${API_BASE_URL}/api/vehicles/${id}/`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Erro ao excluir veículo no Django');
  },
};

/**
 * SERVIÇO DE AGENDAMENTOS (BOOKINGS API)
 */
export const BookingsService = {
  // Obter todos os agendamentos registrados
  async getAll(): Promise<Booking[]> {
    if (!USE_DJANGO_API) {
      const saved = localStorage.getItem('fleet_bookings_v1');
      return saved ? JSON.parse(saved) : INITIAL_BOOKINGS;
    }

    const response = await fetch(`${API_BASE_URL}/api/bookings/`, {
      method: 'GET',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Erro ao obter agendamentos do Django');
    return response.json();
  },

  // Salvar novo agendamento
  async save(booking: Booking): Promise<Booking> {
    if (!USE_DJANGO_API) {
      const saved = await this.getAll();
      const updated = [booking, ...saved];
      localStorage.setItem('fleet_bookings_v1', JSON.stringify(updated));
      return booking;
    }

    const response = await fetch(`${API_BASE_URL}/api/bookings/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(booking),
    });
    if (!response.ok) throw new Error('Erro ao salvar agendamento no Django');
    return response.json();
  },

  // Atualizar agendamento (ex: Iniciar Viagem, Concluir ou Cancelar)
  async update(booking: Booking): Promise<Booking> {
    if (!USE_DJANGO_API) {
      const saved = await this.getAll();
      const updated = saved.map(b => b.id === booking.id ? booking : b);
      localStorage.setItem('fleet_bookings_v1', JSON.stringify(updated));
      return booking;
    }

    const response = await fetch(`${API_BASE_URL}/api/bookings/${booking.id}/`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(booking),
    });
    if (!response.ok) throw new Error('Erro ao atualizar agendamento no Django');
    return response.json();
  },
};

/**
 * SERVIÇO DE MANUTENÇÃO (MAINTENANCES API)
 */
export const MaintenancesService = {
  // Obter todos os registros de manutenção
  async getAll(): Promise<MaintenanceRecord[]> {
    if (!USE_DJANGO_API) {
      const saved = localStorage.getItem('fleet_maintenance_v1');
      return saved ? JSON.parse(saved) : INITIAL_MAINTENANCE;
    }

    const response = await fetch(`${API_BASE_URL}/api/maintenance/`, {
      method: 'GET',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Erro ao obter manutenções do Django');
    return response.json();
  },

  // Salvar registro de manutenção (Novo ou Atualizado)
  async save(record: MaintenanceRecord): Promise<MaintenanceRecord> {
    if (!USE_DJANGO_API) {
      const saved = await this.getAll();
      const exists = saved.some(m => m.id === record.id);
      let updated: MaintenanceRecord[];

      if (exists) {
        updated = saved.map(m => m.id === record.id ? record : m);
      } else {
        updated = [record, ...saved];
      }
      localStorage.setItem('fleet_maintenance_v1', JSON.stringify(updated));
      return record;
    }

    const isExisting = record.id && !record.id.startsWith('m_');
    const url = isExisting 
      ? `${API_BASE_URL}/api/maintenance/${record.id}/` 
      : `${API_BASE_URL}/api/maintenance/`;

    const response = await fetch(url, {
      method: isExisting ? 'PUT' : 'POST',
      headers: getHeaders(),
      body: JSON.stringify(record),
    });
    if (!response.ok) throw new Error('Erro ao salvar manutenção no Django');
    return response.json();
  },

  // Deletar registro de manutenção
  async delete(id: string): Promise<void> {
    if (!USE_DJANGO_API) {
      const saved = await this.getAll();
      const filtered = saved.filter(m => m.id !== id);
      localStorage.setItem('fleet_maintenance_v1', JSON.stringify(filtered));
      return;
    }

    const response = await fetch(`${API_BASE_URL}/api/maintenance/${id}/`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Erro ao excluir manutenção no Django');
  }
};
