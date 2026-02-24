import { z } from "zod";

const nonNegativeNumber = z.number().min(0);
const optionalMoney = nonNegativeNumber.optional();

export const fuelPricesSchema = z
  .object({
    ga: nonNegativeNumber.optional(),
    gc: nonNegativeNumber.optional(),
    etanol_comum: nonNegativeNumber.optional(),
    etanol_aditivado: nonNegativeNumber.optional(),
    s10: nonNegativeNumber.optional(),
    s500: nonNegativeNumber.optional(),
    s10_aditivado: nonNegativeNumber.optional(),
    s500_aditivado: nonNegativeNumber.optional(),
    gasolina_premium: nonNegativeNumber.optional(),
    gnv: nonNegativeNumber.optional(),
  })
  .partial()
  .default({});

export const monthlyInputSchema = z.object({
  a_tipo_posto: z.enum(["urbano", "rodoviario", "misto"]).optional(),
  b_volume_diesel_l: nonNegativeNumber.optional(),
  c_volume_otto_l: nonNegativeNumber.optional(),
  d_gnv_m3: nonNegativeNumber.optional(),
  e_volume_otto_aditivado_l: nonNegativeNumber.optional(),
  f_volume_diesel_aditivado_l: nonNegativeNumber.optional(),
  g_qtd_frentistas: nonNegativeNumber.optional(),
  h_turno: z.enum(["12x36", "8h"]).optional(),
  i_horario_funcionamento: z.string().max(120).optional(),
  j_faturamento_pista: optionalMoney,
  l_faturamento_troca_oleo: optionalMoney,
  m_margem_media_pista_pct: z.number().min(0).max(100).optional(),
  n_margem_media_troca_pct: z.number().min(0).max(100).optional(),
  o_trocas_oleo_por_dia: nonNegativeNumber.optional(),
  p_faturamento_conveniencia: optionalMoney,
  q_funcionarios_conveniencia: nonNegativeNumber.optional(),
  r_food_service_faturamento: optionalMoney,
  s_bebidas_faturamento: optionalMoney,
  t_mercearia_faturamento: optionalMoney,
  u_bomboniere_tabacaria_faturamento: optionalMoney,
  v_diff_custo_aditivada_r_l: nonNegativeNumber.optional(),
  x_precos_venda: fuelPricesSchema.optional(),
  y_oleo_litros_vendidos: nonNegativeNumber.optional(),
  z_qtd_trocadores_oleo: nonNegativeNumber.optional(),
  aa_qtd_abastecimentos_mes: nonNegativeNumber.optional(),
});

export type MonthlyInputValidated = z.infer<typeof monthlyInputSchema>;
