import type { OperationType, ShiftType } from "@/lib/types/domain";

export const LITERS_PER_ATTENDANT_REFERENCE: Record<OperationType, number> = {
  urbano: 25000,
  rodoviario: 35000,
  misto: 30000,
};

export const DAYS_WORKED_REFERENCE: Record<ShiftType, number> = {
  "12x36": 15,
  "8h": 24,
};

export const LUBRICANT_RATIO_REFERENCE: Record<OperationType, number> = {
  urbano: 0.0015,
  rodoviario: 0.0024,
  misto: 0.0019,
};

export const SIMULATED_OIL_PRICES = {
  lightLine1L: 30,
  heavyLine20L: 400,
} as const;
