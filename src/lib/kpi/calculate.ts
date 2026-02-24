import {
  DAYS_WORKED_REFERENCE,
  LITERS_PER_ATTENDANT_REFERENCE,
  LUBRICANT_RATIO_REFERENCE,
  SIMULATED_OIL_PRICES,
} from "@/lib/kpi/constants";
import type { KpiAlert, MonthlyInputData, OperationType } from "@/lib/types/domain";

type TrafficLight = "green" | "yellow" | "red" | "gray";

export interface KpiCalculationResult {
  kpis: Record<string, unknown>;
  alerts: KpiAlert[];
  data_insufficient: string[];
}

export function calculateKpis(input: MonthlyInputData): KpiCalculationResult {
  const alerts: KpiAlert[] = [];
  const dataInsufficient: string[] = [];

  const operationType = input.a_tipo_posto;
  const dieselVolume = input.b_volume_diesel_l ?? null;
  const ottoVolume = input.c_volume_otto_l ?? null;
  const attendants = input.g_qtd_frentistas ?? null;
  const fuelings = input.aa_qtd_abastecimentos_mes ?? null;
  const shift = input.h_turno ?? null;
  const totalFuelVolume =
    asNonNegativeNumber(dieselVolume) !== null && asNonNegativeNumber(ottoVolume) !== null
      ? (dieselVolume as number) + (ottoVolume as number)
      : null;

  const teamOccupancy = calculateTeamOccupancy(
    operationType,
    totalFuelVolume,
    attendants,
    alerts,
    dataInsufficient,
  );

  const additizedMix = calculateAdditizedMix(input, alerts, dataInsufficient);
  const gapAdditized = calculateGapAdditized(input, alerts);
  const fuelingMetrics = calculateFuelingMetrics(
    operationType,
    totalFuelVolume,
    attendants,
    fuelings,
    shift,
    teamOccupancy.liters_per_attendant,
    alerts,
    dataInsufficient,
  );

  const lubricantOpportunity = calculateLubricantOpportunity(
    input,
    operationType,
    totalFuelVolume,
    alerts,
    dataInsufficient,
  );

  const trackSales = calculateTrackSales(
    input,
    operationType,
    attendants,
    shift,
    fuelingMetrics.fuelings_per_attendant_day,
    alerts,
    dataInsufficient,
  );

  const convenience = calculateConvenience(input, alerts, dataInsufficient);

  const marginWarnings = validateMarginInputs(input.m_margem_media_pista_pct, input.n_margem_media_troca_pct);
  alerts.push(...marginWarnings);

  return {
    kpis: {
      team_occupancy: teamOccupancy,
      additized_mix: additizedMix,
      gap_additized: gapAdditized,
      fueling_metrics: fuelingMetrics,
      lubricant_opportunity: lubricantOpportunity,
      track_sales: trackSales,
      convenience,
      margin_markup_note: {
        margin_formula: "(preco_venda - preco_custo) / preco_venda",
        markup_formula: "(preco_venda - preco_custo) / preco_custo",
        mandatory_note:
          "Esta e margem bruta do produto (sem frete, impostos, despesas e outros custos). Nao representa margem liquida.",
      },
    },
    alerts,
    data_insufficient: dataInsufficient,
  };
}

function calculateTeamOccupancy(
  operationType: OperationType | undefined,
  totalFuelVolume: number | null,
  attendants: number | null,
  alerts: KpiAlert[],
  dataInsufficient: string[],
) {
  if (!operationType || totalFuelVolume === null || !isPositive(attendants)) {
    dataInsufficient.push("team_occupancy");
    return {
      liters_per_attendant: null,
      reference: null,
      ratio: null,
      traffic_light: "gray" as TrafficLight,
    };
  }

  const reference = LITERS_PER_ATTENDANT_REFERENCE[operationType];
  const litersPerAttendant = totalFuelVolume / attendants;
  const ratio = litersPerAttendant / reference;
  const trafficLight = occupancyTrafficLight(ratio);

  if (trafficLight === "red") {
    alerts.push({
      id: "team_occupancy_red",
      severity: "critical",
      title: "Nível de ocupacao fora da faixa recomendada",
      message:
        ratio < 0.75
          ? "Equipe possivelmente ociosa em relacao ao volume vendido."
          : "Equipe possivelmente sobrecarregada em relacao ao volume vendido.",
      recommendation: "Revisar quadro, escala de trabalho e picos operacionais.",
    });
  } else if (trafficLight === "yellow") {
    alerts.push({
      id: "team_occupancy_yellow",
      severity: "warning",
      title: "Nível de ocupacao em faixa de atencao",
      message: "Volume por frentista proximo ao limite recomendado.",
      recommendation: "Monitorar turnos e distribuicao de tarefas antes de ajustar equipe.",
    });
  }

  return {
    liters_per_attendant: round(litersPerAttendant),
    reference,
    ratio: round(ratio, 4),
    traffic_light: trafficLight,
  };
}

function calculateAdditizedMix(
  input: MonthlyInputData,
  alerts: KpiAlert[],
  dataInsufficient: string[],
) {
  const ottoMix = safePercent(input.e_volume_otto_aditivado_l ?? null, input.c_volume_otto_l ?? null);
  const dieselMix = safePercent(input.f_volume_diesel_aditivado_l ?? null, input.b_volume_diesel_l ?? null);

  if (ottoMix === null) dataInsufficient.push("additized_mix_otto");
  if (dieselMix === null) dataInsufficient.push("additized_mix_diesel");

  if (ottoMix !== null && ottoMix < 20) {
    alerts.push({
      id: "mix_otto_low",
      severity: "warning",
      title: "Mix de aditivada ciclo Otto abaixo do baseline",
      message: `Mix atual em ${round(ottoMix, 2)}%.`,
      recommendation: "Aplicar treinamento de conversao e revisar oferta de aditivada no atendimento.",
    });
  }

  if (dieselMix !== null && dieselMix < 5) {
    alerts.push({
      id: "mix_diesel_low",
      severity: "warning",
      title: "Mix de aditivada ciclo Diesel abaixo do baseline",
      message: `Mix atual em ${round(dieselMix, 2)}%.`,
      recommendation: "Revisar argumentacao comercial e exposicao de beneficios da aditivada.",
    });
  }

  return {
    otto_pct: ottoMix !== null ? round(ottoMix, 2) : null,
    diesel_pct: dieselMix !== null ? round(dieselMix, 2) : null,
  };
}

function calculateGapAdditized(input: MonthlyInputData, alerts: KpiAlert[]) {
  const diff = input.v_diff_custo_aditivada_r_l ?? null;
  const prices = input.x_precos_venda ?? {};

  const gasolinaGap = safeGap(prices.ga, prices.gc, diff);
  const etanolGap = safeGap(prices.etanol_aditivado, prices.etanol_comum, diff);
  const s10Gap = safeGap(prices.s10_aditivado, prices.s10, diff);
  const s500Gap = safeGap(prices.s500_aditivado, prices.s500, diff);

  const gaps = [
    { fuel: "gasolina", value: gasolinaGap },
    { fuel: "etanol", value: etanolGap },
    { fuel: "s10", value: s10Gap },
    { fuel: "s500", value: s500Gap },
  ];

  for (const gap of gaps) {
    if (gap.value !== null && gap.value < 0) {
      alerts.push({
        id: `gap_negative_${gap.fuel}`,
        severity: "critical",
        title: `GAP negativo em ${gap.fuel}`,
        message: `A venda da versao aditivada esta gerando perda de margem (${round(gap.value, 3)} R$/L).`,
        recommendation: "Revisar precificacao da aditivada para eliminar perda de margem bruta.",
      });
    }
  }

  return {
    gasolina_r_l: maybeRound(gasolinaGap, 3),
    etanol_r_l: maybeRound(etanolGap, 3),
    s10_r_l: maybeRound(s10Gap, 3),
    s500_r_l: maybeRound(s500Gap, 3),
  };
}

function calculateFuelingMetrics(
  operationType: OperationType | undefined,
  totalFuelVolume: number | null,
  attendants: number | null,
  fuelings: number | null,
  shift: MonthlyInputData["h_turno"] | null,
  litersPerAttendant: number | null,
  alerts: KpiAlert[],
  dataInsufficient: string[],
) {
  const avgLitersPerFueling = safeDivision(totalFuelVolume, fuelings);
  const fuelingsPerAttendantMonth = safeDivision(fuelings, attendants);
  const workedDays = shift ? DAYS_WORKED_REFERENCE[shift] : null;
  const fuelingsPerAttendantDay = safeDivision(fuelingsPerAttendantMonth, workedDays);

  if (avgLitersPerFueling === null) dataInsufficient.push("fueling_avg_liters");
  if (fuelingsPerAttendantMonth === null) dataInsufficient.push("fuelings_per_attendant_month");
  if (fuelingsPerAttendantDay === null) dataInsufficient.push("fuelings_per_attendant_day");

  if (fuelingsPerAttendantDay !== null) {
    const below = fuelingsPerAttendantDay < 80;
    const above = fuelingsPerAttendantDay > 120;
    const isRodoviario = operationType === "rodoviario";

    if (below) {
      if (isRodoviario) {
        const belowVolumeReference = litersPerAttendant !== null && litersPerAttendant < 35000;
        if (belowVolumeReference) {
          alerts.push({
            id: "fuelings_low_rodoviario",
            severity: "warning",
            title: "Abastecimentos por frentista abaixo da faixa de referencia",
            message:
              "Em posto rodoviario, o alerta foi ativado porque abastecimentos e volume por frentista estao baixos.",
            recommendation: "Reavaliar escala, mix de clientes e estrategia comercial.",
          });
        }
      } else {
        alerts.push({
          id: "fuelings_low",
          severity: "warning",
          title: "Abastecimentos por frentista abaixo da faixa de referencia",
          message: `Media atual de ${round(fuelingsPerAttendantDay, 2)} abastecimentos/dia por frentista.`,
          recommendation: "Revisar produtividade operacional e cobertura de turnos.",
        });
      }
    }

    if (above) {
      alerts.push({
        id: "fuelings_high",
        severity: "warning",
        title: "Abastecimentos por frentista acima da faixa de referencia",
        message: `Media atual de ${round(fuelingsPerAttendantDay, 2)} abastecimentos/dia por frentista.`,
        recommendation: "Avaliar risco de sobrecarga e redistribuicao da equipe.",
      });
    }
  }

  return {
    avg_liters_per_fueling: maybeRound(avgLitersPerFueling, 2),
    fuelings_per_attendant_month: maybeRound(fuelingsPerAttendantMonth, 2),
    fuelings_per_attendant_day: maybeRound(fuelingsPerAttendantDay, 2),
    reference_range: { min: 80, max: 120 },
  };
}

function calculateLubricantOpportunity(
  input: MonthlyInputData,
  operationType: OperationType | undefined,
  totalFuelVolume: number | null,
  alerts: KpiAlert[],
  dataInsufficient: string[],
) {
  const lubricantLiters = input.y_oleo_litros_vendidos ?? null;
  const oilChangesDay = input.o_trocas_oleo_por_dia ?? null;
  const oilChangerCount = input.z_qtd_trocadores_oleo ?? null;

  if (!operationType || totalFuelVolume === null || lubricantLiters === null) {
    dataInsufficient.push("lubricant_opportunity");
    return {
      ratio_real_pct: null,
      ratio_reference_pct: operationType ? LUBRICANT_RATIO_REFERENCE[operationType] * 100 : null,
      potential_liters_per_month: null,
      potential_oil_changes_per_day: null,
      line_type: null,
    };
  }

  const ratioReference = LUBRICANT_RATIO_REFERENCE[operationType];
  const ratioReal = totalFuelVolume > 0 ? (lubricantLiters / totalFuelVolume) * 100 : null;
  const potentialLiters = totalFuelVolume * ratioReference;

  const lineType = operationType === "rodoviario" ? "linha_pesada" : "linha_leve";
  const litersPerOilChange = lineType === "linha_pesada" ? 30 : 4;
  const daysWorked = lineType === "linha_pesada" ? 15 : 24;
  const potentialOilChangesMonth = potentialLiters / litersPerOilChange;
  const potentialOilChangesDay = potentialOilChangesMonth / daysWorked;

  if (ratioReal !== null && ratioReal < ratioReference * 100) {
    alerts.push({
      id: "lubricant_ratio_opportunity",
      severity: "warning",
      title: "Potencial de melhoria em venda de lubrificantes",
      message: `Ratio real ${round(ratioReal, 3)}% abaixo da referencia ${round(ratioReference * 100, 3)}%.`,
      recommendation: "Reforcar oferta consultiva, treinamento e rotina de inspeção de nivel/viscosidade.",
    });
  }

  if (oilChangesDay !== null && oilChangesDay < potentialOilChangesDay) {
    alerts.push({
      id: "oil_change_below_potential",
      severity: "warning",
      title: "Trocas de oleo abaixo do potencial estimado",
      message: `Media informada ${round(oilChangesDay, 2)} trocas/dia vs potencial ${round(potentialOilChangesDay, 2)}.`,
      recommendation: "Ajustar abordagem de venda e disponibilidade operacional da troca.",
    });
  }

  if ((oilChangerCount ?? 0) <= 0) {
    alerts.push({
      id: "missing_oil_changer",
      severity: "info",
      title: "Oportunidade de estruturar servico de troca de oleo",
      message: "Nenhum trocador de oleo informado para a operacao.",
      recommendation: "Avaliar capacitacao ou contratacao para aumentar captura de demanda.",
    });
  }

  return {
    ratio_real_pct: maybeRound(ratioReal, 3),
    ratio_reference_pct: round(ratioReference * 100, 3),
    potential_liters_per_month: round(potentialLiters, 2),
    potential_oil_changes_per_day: round(potentialOilChangesDay, 2),
    line_type: lineType,
  };
}

function calculateTrackSales(
  input: MonthlyInputData,
  operationType: OperationType | undefined,
  attendants: number | null,
  shift: MonthlyInputData["h_turno"] | null,
  fuelingsPerAttendantDay: number | null,
  alerts: KpiAlert[],
  dataInsufficient: string[],
) {
  const trackRevenue = input.j_faturamento_pista ?? null;
  const monthlyPerAttendant = safeDivision(trackRevenue, attendants);
  const workedDays = shift ? DAYS_WORKED_REFERENCE[shift] : null;
  const dailyPerAttendant = safeDivision(monthlyPerAttendant, workedDays);
  const workedHours = shift === "12x36" ? 11 : shift === "8h" ? 8 : null;
  const hourlyPerAttendant = safeDivision(dailyPerAttendant, workedHours);

  if (monthlyPerAttendant === null) dataInsufficient.push("track_sales_monthly_per_attendant");
  if (dailyPerAttendant === null) dataInsufficient.push("track_sales_daily_per_attendant");
  if (hourlyPerAttendant === null) dataInsufficient.push("track_sales_hourly_per_attendant");

  const oilUnitPrice =
    operationType === "rodoviario"
      ? SIMULATED_OIL_PRICES.heavyLine20L
      : SIMULATED_OIL_PRICES.lightLine1L;
  const simulatedOilUnitsDay = safeDivision(dailyPerAttendant, oilUnitPrice);
  const vehiclesPerSaleProxy = safeDivision(fuelingsPerAttendantDay, simulatedOilUnitsDay);

  if (hourlyPerAttendant !== null && hourlyPerAttendant < 10) {
    alerts.push({
      id: "track_sales_low_hourly",
      severity: "info",
      title: "Venda/hora em pista com potencial de crescimento",
      message: `Media atual de R$ ${round(hourlyPerAttendant, 2)} por hora por frentista.`,
      recommendation: "Definir metas por turno e reforcar scripts de oferta no atendimento.",
    });
  }

  return {
    revenue_per_attendant_month: maybeRound(monthlyPerAttendant, 2),
    revenue_per_attendant_day: maybeRound(dailyPerAttendant, 2),
    revenue_per_attendant_hour: maybeRound(hourlyPerAttendant, 2),
    simulated_oil_units_day: maybeRound(simulatedOilUnitsDay, 2),
    vehicles_per_sale_proxy: maybeRound(vehiclesPerSaleProxy, 2),
    simulation_note:
      "Valores de oleo (R$30 para 1L e R$400 para 20L) sao hipoteticos para simulacao de metas.",
  };
}

function calculateConvenience(
  input: MonthlyInputData,
  alerts: KpiAlert[],
  dataInsufficient: string[],
) {
  const total = input.p_faturamento_conveniencia ?? null;
  const employees = input.q_funcionarios_conveniencia ?? null;

  const foodPct = safePercent(input.r_food_service_faturamento ?? null, total);
  const beveragesPct = safePercent(input.s_bebidas_faturamento ?? null, total);
  const groceryPct = safePercent(input.t_mercearia_faturamento ?? null, total);
  const candyPct = safePercent(input.u_bomboniere_tabacaria_faturamento ?? null, total);
  const revenuePerEmployee = safeDivision(total, employees);

  if (total === null) dataInsufficient.push("convenience_total_revenue");
  if (foodPct === null) dataInsufficient.push("convenience_food_pct");
  if (beveragesPct === null) dataInsufficient.push("convenience_beverages_pct");
  if (groceryPct === null) dataInsufficient.push("convenience_grocery_pct");
  if (candyPct === null) dataInsufficient.push("convenience_candy_pct");
  if (revenuePerEmployee === null) dataInsufficient.push("convenience_revenue_per_employee");

  if (revenuePerEmployee !== null && revenuePerEmployee < 33000) {
    alerts.push({
      id: "convenience_productivity_low",
      severity: "warning",
      title: "Faturamento por funcionario da conveniencia abaixo do indicador",
      message: `Media atual de R$ ${round(revenuePerEmployee, 2)} por funcionario.`,
      recommendation:
        "Validar contexto operacional (24h, food service, estrutura de equipe) antes de definir metas de ajuste.",
    });
  }

  return {
    food_service_pct: maybeRound(foodPct, 2),
    beverages_pct: maybeRound(beveragesPct, 2),
    grocery_pct: maybeRound(groceryPct, 2),
    candy_tobacco_pct: maybeRound(candyPct, 2),
    revenue_per_employee: maybeRound(revenuePerEmployee, 2),
    benchmark_revenue_per_employee: 33000,
  };
}

function validateMarginInputs(
  trackMarginPct: number | undefined,
  oilChangeMarginPct: number | undefined,
): KpiAlert[] {
  const alerts: KpiAlert[] = [];
  if (isBetweenZeroAndOne(trackMarginPct)) {
    alerts.push({
      id: "margin_track_ambiguous",
      severity: "warning",
      title: "Margem de pista possivelmente em formato ambiguo",
      message: "Valor entre 0 e 1 detectado na margem de pista.",
      recommendation: "Confirmar se o valor representa 30% (30) ou 0,30%.",
    });
  }
  if (isBetweenZeroAndOne(oilChangeMarginPct)) {
    alerts.push({
      id: "margin_oilchange_ambiguous",
      severity: "warning",
      title: "Margem da troca de oleo possivelmente em formato ambiguo",
      message: "Valor entre 0 e 1 detectado na margem de troca.",
      recommendation: "Confirmar se o valor representa 30% (30) ou 0,30%.",
    });
  }
  return alerts;
}

function occupancyTrafficLight(ratio: number): TrafficLight {
  if (ratio >= 0.9 && ratio <= 1.2) return "green";
  if ((ratio >= 0.75 && ratio < 0.9) || (ratio > 1.2 && ratio <= 1.4)) return "yellow";
  return "red";
}

function safePercent(part: number | null, total: number | null): number | null {
  if (part === null || total === null || total <= 0) return null;
  return (part / total) * 100;
}

function safeGap(additizedPrice?: number, commonPrice?: number, costDiff?: number | null): number | null {
  if (!isFiniteNumber(additizedPrice) || !isFiniteNumber(commonPrice) || !isFiniteNumber(costDiff)) {
    return null;
  }
  return additizedPrice - commonPrice - (costDiff as number);
}

function safeDivision(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function maybeRound(value: number | null, precision = 2): number | null {
  if (value === null) return null;
  return round(value, precision);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asNonNegativeNumber(value: unknown): number | null {
  if (!isFiniteNumber(value)) return null;
  return value >= 0 ? value : null;
}

function isPositive(value: number | null): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isBetweenZeroAndOne(value: number | undefined): boolean {
  return isFiniteNumber(value) && value > 0 && value < 1;
}
