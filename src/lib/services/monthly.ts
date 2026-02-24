import { calculateKpis } from "@/lib/kpi/calculate";
import type { MonthlyInputData } from "@/lib/types/domain";
import { getServiceSupabaseClient } from "@/lib/supabase/server";

export async function upsertMonthlyInput(
  userId: string,
  monthRef: string,
  inputData: MonthlyInputData,
  source: "chat" | "form" | "import" = "chat",
) {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("monthly_inputs")
    .upsert(
      {
        user_id: userId,
        month_ref: monthRef,
        source,
        input_json: inputData,
      },
      { onConflict: "user_id,month_ref" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function computeAndUpsertMonthlyKpis(userId: string, monthRef: string, inputData: MonthlyInputData) {
  const result = calculateKpis(inputData);
  const supabase = getServiceSupabaseClient();

  const { data, error } = await supabase
    .from("monthly_kpis")
    .upsert(
      {
        user_id: userId,
        month_ref: monthRef,
        kpis_json: result.kpis,
        alerts_json: result.alerts,
      },
      { onConflict: "user_id,month_ref" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return { db: data, calculated: result };
}
