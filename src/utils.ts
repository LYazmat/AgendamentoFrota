/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Booking, VehicleType } from './types';

/**
 * Checks if a proposed booking overlaps with any existing non-canceled bookings for a vehicle.
 * Returns the conflicting booking if there is one, otherwise null.
 */
export function checkBookingConflict(
  vehicleId: string,
  startDateStr: string,
  endDateStr: string,
  bookings: Booking[],
  ignoreBookingId?: string
): Booking | null {
  if (!vehicleId || !startDateStr || !endDateStr) return null;

  const start = new Date(startDateStr).getTime();
  const end = new Date(endDateStr).getTime();

  if (isNaN(start) || !start || isNaN(end) || !end) return null;
  if (start >= end) return null; // Invalid sequence, checked separately in validator

  for (const b of bookings) {
    if (b.vehicleId !== vehicleId) continue;
    if (b.id === ignoreBookingId) continue;
    if (b.status === 'cancelado') continue;

    const bStart = new Date(b.startDate).getTime();
    const bEnd = new Date(b.endDate).getTime();

    // Check overlap: (proposedStart < existingEnd) && (proposedEnd > existingStart)
    if (start < bEnd && end > bStart) {
      return b;
    }
  }

  return null;
}

/**
 * Formats a ISO YYYY-MM-DDTHH:mm string into a friendly localized Portuguese format: "DD/MM/YYYY às HH:mm"
 */
export function formatDateTime(dateTimeStr: string): string {
  if (!dateTimeStr) return '';
  try {
    const parts = dateTimeStr.split('T');
    if (parts.length !== 2) return dateTimeStr;
    const [datePart, timePart] = parts;
    const [year, month, day] = datePart.split('-');
    const [hour, minute] = timePart.split(':');
    return `${day}/${month}/${year} às ${hour}:${minute}`;
  } catch {
    return dateTimeStr;
  }
}

/**
 * Formats a short date string: "DD/MM/YYYY"
 */
export function formatDateShort(dateTimeStr: string): string {
  if (!dateTimeStr) return '';
  try {
    const parts = dateTimeStr.split('T');
    const [year, month, day] = parts[0].split('-');
    return `${day}/${month}/${year}`;
  } catch {
    return dateTimeStr;
  }
}

/**
 * Gets a clean human-readable translation for vehicle types.
 */
export function getVehicleTypeLabel(type: VehicleType): string {
  switch (type) {
    case 'sedan':
      return 'Sedã';
    case 'suv':
      return 'SUV';
    case 'pickup':
      return 'Picape';
    case 'van':
      return 'Van / Utilitário';
    case 'hatch':
      return 'Hatchback';
    case 'eletrico':
      return 'Elétrico';
    default:
      return type;
  }
}

/**
 * Masks a CPF: "000.000.000-00"
 */
export function maskCPF(value: string): string {
  const clean = value.replace(/\D/g, '');
  if (clean.length <= 3) return clean;
  if (clean.length <= 6) return `${clean.slice(0, 3)}.${clean.slice(3)}`;
  if (clean.length <= 9) return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

/**
 * Masks a Plate: "AAA-9999" or Mercosul "AAA9A99"
 */
export function formatPlate(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (clean.length <= 3) return clean;
  if (clean.length <= 7) {
    // Normal plate AAA-9999 or Mercosul ABC1D23
    if (isNaN(Number(clean.charAt(4)))) {
      // ABC1D23 style
      return clean;
    } else {
      // AAA-9999 style
      return `${clean.slice(0, 3)}-${clean.slice(3)}`;
    }
  }
  return clean.slice(0, 7);
}
