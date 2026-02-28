import { getServerEnv } from "@/lib/env";
import { getGeneratedFileSignedUrl } from "@/lib/services/modules";
import type { KpiAlert } from "@/lib/types/domain";
import { getServiceSupabaseClient } from "@/lib/supabase/server";

interface MonthlyReportInput {
  userId: string;
  monthRef: string;
  calculated: {
    kpis: Record<string, unknown>;
    alerts: KpiAlert[];
    data_insufficient?: string[];
  };
  comparisonRows?: Array<Record<string, unknown>>;
}

interface MonthlyReportResult {
  fileId: string;
  signedUrl: string;
  summaryBlocks: string[];
}

export async function generateMonthlyDiagnosisReport(input: MonthlyReportInput): Promise<MonthlyReportResult> {
  const summaryBlocks = buildSummaryBlocks(input);
  const pdfBuffer = buildSimplePdf(summaryBlocks.flatMap((block) => wrapText(block, 95)));

  const env = getServerEnv();
  const supabase = getServiceSupabaseClient();
  const fileName = `diagnostico-${input.monthRef}.pdf`;
  const storagePath = `${input.userId}/monthly/${input.monthRef}/${fileName}`;

  const { error: uploadError } = await supabase.storage.from(env.MODULE_FILES_BUCKET).upload(storagePath, pdfBuffer, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data: fileRow, error: fileError } = await supabase
    .from("generated_files")
    .insert({
      module_run_id: null,
      user_id: input.userId,
      file_name: fileName,
      content_type: "application/pdf",
      storage_bucket: env.MODULE_FILES_BUCKET,
      storage_path: storagePath,
      size_bytes: pdfBuffer.length,
    })
    .select("id")
    .single();
  if (fileError) throw fileError;

  const signedUrl = await getGeneratedFileSignedUrl(String(fileRow.id));
  return {
    fileId: String(fileRow.id),
    signedUrl,
    summaryBlocks,
  };
}

function buildSummaryBlocks(input: MonthlyReportInput): string[] {
  const kpis = input.calculated.kpis ?? {};
  const alerts = input.calculated.alerts ?? [];
  const teamOccupancy = asObject(kpis.team_occupancy);
  const fuelingMetrics = asObject(kpis.fueling_metrics);
  const additizedMix = asObject(kpis.additized_mix);
  const gapAdditized = asObject(kpis.gap_additized);
  const lubricantOpportunity = asObject(kpis.lubricant_opportunity);
  const convenience = asObject(kpis.convenience);

  const blocks: string[] = [];
  blocks.push(`Diagnostico mensal Rocha Turbo - mes ${formatMonthRef(input.monthRef)}`);
  blocks.push(
    [
      "Equipe e abastecimentos:",
      `- Litros por frentista: ${fmtNumber(teamOccupancy.liters_per_attendant)} (ref ${fmtNumber(teamOccupancy.reference)})`,
      `- Media litros por abastecimento: ${fmtNumber(fuelingMetrics.avg_liters_per_fueling)}`,
      `- Abastecimentos por frentista/dia: ${fmtNumber(fuelingMetrics.fuelings_per_attendant_day)}`,
    ].join("\n"),
  );
  blocks.push(
    [
      "Mix aditivada e GAP:",
      `- Mix ciclo Otto: ${fmtPercent(additizedMix.otto_pct)}`,
      `- Mix ciclo Diesel: ${fmtPercent(additizedMix.diesel_pct)}`,
      `- GAP Gasolina: ${fmtCurrency(gapAdditized.gasolina_r_l)} /L`,
      `- GAP Etanol: ${fmtCurrency(gapAdditized.etanol_r_l)} /L`,
      `- GAP S10: ${fmtCurrency(gapAdditized.s10_r_l)} /L`,
      `- GAP S500: ${fmtCurrency(gapAdditized.s500_r_l)} /L`,
    ].join("\n"),
  );
  blocks.push(
    [
      "Lubrificantes e pista:",
      `- Ratio real lubrificante: ${fmtPercent(lubricantOpportunity.ratio_real_pct)}`,
      `- Ratio referencia: ${fmtPercent(lubricantOpportunity.ratio_reference_pct)}`,
      `- Potencial de trocas/dia: ${fmtNumber(lubricantOpportunity.potential_oil_changes_per_day)}`,
      `- Conveniencia por funcionario: ${fmtCurrency(convenience.revenue_per_employee)}`,
    ].join("\n"),
  );

  if (alerts.length > 0) {
    const topAlerts = alerts.slice(0, 5).map((alert, index) => {
      const sev = String(alert.severity).toUpperCase();
      return `${index + 1}. [${sev}] ${alert.title}: ${alert.message}`;
    });
    blocks.push(`Alertas principais:\n${topAlerts.join("\n")}`);
  } else {
    blocks.push("Nao foram detectados alertas criticos no fechamento atual.");
  }

  const trendLines = buildTrendLines(input.comparisonRows ?? []);
  if (trendLines.length > 0) {
    blocks.push(`Comparativo ultimos 3 meses:\n${trendLines.join("\n")}`);
  }

  blocks.push(
    "Observacoes: margens m/n usam conceito de margem bruta (nao markup). Este diagnostico nao substitui analise contabil/fiscal detalhada.",
  );

  return blocks;
}

function buildTrendLines(rows: Array<Record<string, unknown>>): string[] {
  return rows
    .slice(0, 3)
    .map((row) => {
      const monthRef = String(row.month_ref ?? "");
      const kpis = asObject(row.kpis_json);
      const team = asObject(kpis.team_occupancy);
      const mix = asObject(kpis.additized_mix);
      const alerts = Array.isArray(row.alerts_json) ? row.alerts_json.length : 0;
      return `${formatMonthRef(monthRef)}: litros/frentista=${fmtNumber(team.liters_per_attendant)} | mix_otto=${fmtPercent(mix.otto_pct)} | alertas=${alerts}`;
    });
}

function buildSimplePdf(lines: string[]): Buffer {
  const textLines = lines.map((line) => escapePdfText(line));
  const contentStream = [
    "BT",
    "/F1 10 Tf",
    "13 TL",
    "40 800 Td",
    ...textLines.flatMap((line) => [`(${line}) Tj`, "T*"]),
    "ET",
  ].join("\n");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(contentStream, "utf-8")} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf-8"));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf-8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf-8");
}

function escapePdfText(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(input: string, maxChars: number): string[] {
  const chunks: string[] = [];
  const lines = input.split("\n");
  for (const line of lines) {
    if (line.length <= maxChars) {
      chunks.push(line);
      continue;
    }
    let current = "";
    for (const word of line.split(" ")) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars) {
        if (current) chunks.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) chunks.push(current);
  }
  return chunks;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function fmtNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function fmtPercent(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;
}

function fmtCurrency(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatMonthRef(monthRef: string): string {
  const [year, month] = monthRef.split("-");
  if (!year || !month) return monthRef;
  return `${month}/${year}`;
}
