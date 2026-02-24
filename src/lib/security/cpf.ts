import { createHash } from "crypto";

export function normalizeCpf(input: string): string {
  return input.replace(/\D/g, "");
}

export function isValidCpf(cpfInput: string): boolean {
  const cpf = normalizeCpf(cpfInput);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split("").map(Number);
  const digit1 = calculateCpfDigit(digits, 9, 10);
  const digit2 = calculateCpfDigit(digits, 10, 11);

  return digits[9] === digit1 && digits[10] === digit2;
}

export function hashCpf(cpfInput: string, secret: string): string {
  const cpf = normalizeCpf(cpfInput);
  return createHash("sha256").update(`${secret}:${cpf}`).digest("hex");
}

function calculateCpfDigit(digits: number[], length: number, weightStart: number): number {
  const sum = digits
    .slice(0, length)
    .reduce((acc, current, index) => acc + current * (weightStart - index), 0);

  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}
