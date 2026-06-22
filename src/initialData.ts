/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vehicle, Booking, Driver } from './types';

export const INITIAL_VEHICLES: Vehicle[] = [
  {
    id: 'v1',
    brand: 'Toyota',
    model: 'Corolla Accent',
    year: 2024,
    plate: 'QXG-4E82',
    type: 'sedan',
    fuel: 'Flex',
    km: 42500,
    status: 'disponivel',
    capacity: 5,
    color: 'Cinza Metálico',
    notes: 'Manutenção em dia. Sempre devolver limpo e com o tanque cheio.'
  },
  {
    id: 'v2',
    brand: 'Jeep',
    model: 'Compass Longitude',
    year: 2023,
    plate: 'BRA-2E24',
    type: 'suv',
    fuel: 'Diesel',
    km: 18450,
    status: 'uso',
    capacity: 5,
    color: 'Branco Polar',
    notes: 'Exige Arla 32. Chave reserva no cofre da diretoria.'
  },
  {
    id: 'v3',
    brand: 'Chevrolet',
    model: 'S10 High Country',
    year: 2022,
    plate: 'OLM-8C45',
    type: 'pickup',
    fuel: 'Diesel',
    km: 65120,
    status: 'disponivel',
    capacity: 5,
    color: 'Preto Ouro Negro',
    notes: 'Capota marítima travada. Tração 4x4 funcionando perfeitamente.'
  },
  {
    id: 'v4',
    brand: 'BYD',
    model: 'Dolphin EV',
    year: 2024,
    plate: 'RUN-1A90',
    type: 'eletrico',
    fuel: 'Elétrico',
    km: 8200,
    status: 'disponivel',
    capacity: 5,
    color: 'Cinza Dolphin',
    notes: 'Veículo 100% elétrico. Autonomia de 330km. Carregador tipo 2 no porta-malas.'
  },
  {
    id: 'v5',
    brand: 'Renault',
    model: 'Master Furgão',
    year: 2021,
    plate: 'BUS-9G20',
    type: 'van',
    fuel: 'Diesel',
    km: 124300,
    status: 'manutencao',
    capacity: 3,
    color: 'Branco Gelar',
    notes: 'Em revisão periódica dos freios e troca de suspensão na concessionária.'
  },
  {
    id: 'v6',
    brand: 'Fiat',
    model: 'Argo Drive',
    year: 2023,
    plate: 'PLM-5T12',
    type: 'hatch',
    fuel: 'Flex',
    km: 24310,
    status: 'disponivel',
    capacity: 5,
    color: 'Vermelho Montecarlo',
    notes: 'Econômico e ágil para uso urbano rápido.'
  }
];

// Helper to get formatted dates relative to today
const getRelativeDateStr = (days: number, hour: number, minutes: number = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minutes, 0, 0);
  
  // Format to YYYY-MM-DDTHH:mm representing local time correctly without offsets
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hh}:${mm}`;
};

export const INITIAL_BOOKINGS: Booking[] = [
  {
    id: 'b1',
    vehicleId: 'v2',
    driverName: 'Carlos Eduardo Oliveira',
    driverCpf: '123.456.789-00',
    driverCnh: '45678912340',
    driverCnhCategory: 'B',
    purpose: 'Visita técnica a parceiros industriais no interior',
    startDate: getRelativeDateStr(0, 8, 0), // Today 08:00
    endDate: getRelativeDateStr(0, 18, 0),   // Today 18:00
    status: 'ativo',
    actualStartKm: 18450,
    actualStartDate: getRelativeDateStr(0, 8, 15),
    notes: 'Previsão de retorno até o final da tarde.',
    createdAt: getRelativeDateStr(-2, 10, 0)
  },
  {
    id: 'b2',
    vehicleId: 'v1',
    driverName: 'Mariana Costa Sousa',
    driverCpf: '987.654.321-11',
    driverCnh: '12345678901',
    driverCnhCategory: 'B',
    purpose: 'Reunião com diretoria executiva e cliente corporativo',
    startDate: getRelativeDateStr(1, 9, 0), // Tomorrow 09:00
    endDate: getRelativeDateStr(1, 14, 0),  // Tomorrow 14:00
    status: 'pendente',
    createdAt: getRelativeDateStr(-1, 14, 30)
  },
  {
    id: 'b3',
    vehicleId: 'v4',
    driverName: 'Thiago Martins Ramos',
    driverCpf: '456.789.123-55',
    driverCnh: '78912345600',
    driverCnhCategory: 'B',
    purpose: 'Vendas de produtos tecnológicos verdes',
    startDate: getRelativeDateStr(-2, 13, 0), // 2 days ago
    endDate: getRelativeDateStr(-2, 17, 30),  // 2 days ago
    status: 'concluido',
    actualStartKm: 8100,
    actualEndKm: 8200,
    actualStartDate: getRelativeDateStr(-2, 13, 5),
    actualEndDate: getRelativeDateStr(-2, 17, 25),
    notes: 'Veículo devolvido 100% carregado e em perfeitas condições.',
    createdAt: getRelativeDateStr(-4, 9, 15)
  }
];

export const INITIAL_MAINTENANCE: any[] = [
  {
    id: 'm1',
    vehicleId: 'v1',
    description: 'Troca de Óleo e Filtro de Combustível',
    cost: 350.00,
    date: '2026-05-10',
    type: 'preventiva',
    status: 'concluido',
    notes: 'Realizada com óleo sintético 5W30 na concessionária.'
  },
  {
    id: 'm2',
    vehicleId: 'v5',
    description: 'Revisão do Sistema de Freios e Troca de Amortecedores',
    cost: 2150.00,
    date: '2026-06-17',
    type: 'revisao',
    status: 'concluido',
    notes: 'Substituição das pastilhas dianteiras e amortecedores traseiros.'
  },
  {
    id: 'm3',
    vehicleId: 'v3',
    description: 'Geometria, Balanceamento e Alinhamento 3D',
    cost: 180.00,
    date: '2026-04-20',
    type: 'preventiva',
    status: 'concluido',
    notes: 'Alinhamento completo preventivo recomendado pós viagem.'
  }
];

export const INITIAL_DRIVERS: Driver[] = [
  {
    id: 'd1',
    name: 'Carlos Eduardo Oliveira',
    cpf: '123.456.789-00',
    cnh: '45678912340',
    cnhExpiry: '2026-07-15' // Vence logo (menos de 30 dias a partir de 2026-06-19)
  },
  {
    id: 'd2',
    name: 'Mariana Costa Sousa',
    cpf: '987.654.321-11',
    cnh: '12345678901',
    cnhExpiry: '2029-10-25' // Ativa
  },
  {
    id: 'd3',
    name: 'Thiago Martins Ramos',
    cpf: '456.789.123-55',
    cnh: '78912345600',
    cnhExpiry: '2026-05-12' // Já venceu
  },
  {
    id: 'd4',
    name: 'Amanda Ferreira Lima',
    cpf: '111.222.333-44',
    cnh: '98765432109',
    cnhExpiry: '2027-12-08' // Ativa
  }
];

