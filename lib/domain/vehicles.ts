import type { Child, Vehicle } from './types';

export interface VehicleOccupancy {
  vehicleId: string;
  ocupacao: number;
  capacidade: number;
  vagasDisponiveis: number;
  percentual: number;
}

export function getVehicleOccupancy(vehicle: Vehicle, children: Child[]): VehicleOccupancy {
  const ocupacao = children.filter((c) => c.active && c.vehicleId === vehicle.id).length;
  const capacidade = Math.max(0, vehicle.capacity);
  const vagasDisponiveis = Math.max(0, capacidade - ocupacao);
  const percentual = capacidade > 0 ? Math.min(100, Math.round((ocupacao / capacidade) * 100)) : 0;
  return {
    vehicleId: vehicle.id,
    ocupacao,
    capacidade,
    vagasDisponiveis,
    percentual,
  };
}

export function canAssignChildToVehicle(params: {
  vehicle: Vehicle;
  children: Child[];
  childActive: boolean;
  excludeChildId?: string;
}): { allowed: boolean; reason?: string } {
  const { vehicle, children, childActive, excludeChildId } = params;
  if (!vehicle.active) {
    return { allowed: false, reason: `O veículo "${vehicle.name}" está inativo.` };
  }
  if (!childActive) {
    return { allowed: true };
  }
  const activeCount = children.filter(
    (c) => c.active && c.vehicleId === vehicle.id && c.id !== excludeChildId
  ).length;
  if (activeCount >= vehicle.capacity) {
    return {
      allowed: false,
      reason: `O veículo "${vehicle.name}" atingiu a capacidade máxima de ${vehicle.capacity} passageiros.`,
    };
  }
  return { allowed: true };
}
