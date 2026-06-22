/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type VehicleType = 'sedan' | 'suv' | 'pickup' | 'van' | 'hatch' | 'eletrico';

export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  plate: string; // Placa do veículo
  type: VehicleType;
  fuel: 'Flex' | 'Gasolina' | 'Etanol' | 'Diesel' | 'Híbrido' | 'Elétrico';
  km: number;
  status: 'disponivel' | 'uso' | 'manutencao' | 'canteiro';
  capacity: number;
  color: string;
  imageUrl?: string;
  notes?: string;
  constructionSite?: string; // Nome do canteiro de obras se estiver alocado
  nextPreventiveDate?: string;     // Próxima data de preventiva (YYYY-MM-DD)
  preventivePeriodMonth?: number;  // Periodicidade da preventiva em meses
  active?: boolean;                // Se o veículo está ativo no sistema
}

export interface Driver {
  id: string;
  name: string;
  cpf: string;
  cnh: string;
  cnhExpiry: string; // Data de vencimento da CNH (YYYY-MM-DD)
  active?: boolean;  // Se o motorista está ativo no sistema
  cnhCategory?: string;
}

export type BookingStatus = 'pendente' | 'ativo' | 'concluido' | 'cancelado';

export interface Booking {
  id: string;
  vehicleId: string;
  driverName: string;
  driverCpf: string;
  driverCnh: string;
  driverCnhCategory: string;
  purpose: string;
  startDate: string; // ISO DateTime YYYY-MM-DDTHH:mm
  endDate: string;   // ISO DateTime YYYY-MM-DDTHH:mm
  status: BookingStatus;
  notes?: string;
  actualStartKm?: number;
  actualEndKm?: number;
  actualStartDate?: string;
  actualEndDate?: string;
  createdAt: string;
}

export interface QuickStats {
  totalVehicles: number;
  availableVehicles: number;
  inUseVehicles: number;
  inMaintenanceVehicles: number;
  activeBookingsCount: number;
  bookingsTodayCount: number;
}

export interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  description: string;
  cost: number;
  date: string; // YYYY-MM-DD
  type: 'preventiva' | 'corretiva' | 'revisao' | 'outro';
  status: 'concluido' | 'agendado';
  notes?: string;
}

