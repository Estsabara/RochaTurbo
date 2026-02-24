import { addDays, format } from "date-fns";
import { getServerEnv } from "@/lib/env";

interface CreateBillingLinkInput {
  customerName: string;
  customerCpfCnpj: string;
  customerPhone: string;
  value: number;
  description: string;
  dueInDays?: number;
  externalReference?: string;
}

interface AsaasCreatePaymentResponse {
  id: string;
  invoiceNumber?: string;
  status: string;
  dueDate: string;
  value: number;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixTransaction?: {
    qrCode?: {
      payload?: string;
    };
  };
}

export async function createAsaasBillingLink(input: CreateBillingLinkInput) {
  const env = getServerEnv();
  if (!env.ASAAS_API_KEY) {
    throw new Error("ASAAS_API_KEY is not configured");
  }

  const dueDate = format(addDays(new Date(), input.dueInDays ?? 2), "yyyy-MM-dd");

  const customer = await findOrCreateCustomer({
    name: input.customerName,
    cpfCnpj: input.customerCpfCnpj,
    mobilePhone: input.customerPhone,
  });

  const payload = {
    customer: customer.id,
    billingType: "UNDEFINED",
    value: input.value,
    dueDate,
    description: input.description,
    externalReference: input.externalReference,
  };

  const response = await fetch(`${env.ASAAS_API_BASE}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: env.ASAAS_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Asaas payment creation failed: ${response.status} ${body}`);
  }

  const payment = (await response.json()) as AsaasCreatePaymentResponse;
  return {
    asaasPaymentId: payment.id,
    invoiceNumber: payment.invoiceNumber ?? null,
    invoiceUrl: payment.invoiceUrl ?? payment.bankSlipUrl ?? null,
    dueDate: payment.dueDate,
    amount: payment.value,
    status: payment.status,
    pixPayload: payment.pixTransaction?.qrCode?.payload ?? null,
  };
}

interface AsaasCustomer {
  id: string;
  cpfCnpj: string;
}

interface FindOrCreateCustomerInput {
  name: string;
  cpfCnpj: string;
  mobilePhone: string;
}

async function findOrCreateCustomer(input: FindOrCreateCustomerInput): Promise<AsaasCustomer> {
  const env = getServerEnv();
  if (!env.ASAAS_API_KEY) {
    throw new Error("ASAAS_API_KEY is not configured");
  }

  const query = new URLSearchParams({ cpfCnpj: input.cpfCnpj }).toString();
  const findResponse = await fetch(`${env.ASAAS_API_BASE}/customers?${query}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      access_token: env.ASAAS_API_KEY,
    },
  });

  if (!findResponse.ok) {
    const body = await findResponse.text();
    throw new Error(`Asaas customer lookup failed: ${findResponse.status} ${body}`);
  }

  const findPayload = (await findResponse.json()) as { data?: AsaasCustomer[] };
  if (Array.isArray(findPayload.data) && findPayload.data.length > 0) {
    return findPayload.data[0];
  }

  const createResponse = await fetch(`${env.ASAAS_API_BASE}/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: env.ASAAS_API_KEY,
    },
    body: JSON.stringify({
      name: input.name,
      cpfCnpj: input.cpfCnpj,
      mobilePhone: input.mobilePhone,
    }),
  });

  if (!createResponse.ok) {
    const body = await createResponse.text();
    throw new Error(`Asaas customer creation failed: ${createResponse.status} ${body}`);
  }

  const customer = (await createResponse.json()) as AsaasCustomer;
  return customer;
}

export function mapAsaasPaymentStatus(status: string): "pending" | "received" | "overdue" | "failed" {
  switch (status) {
    case "RECEIVED":
    case "CONFIRMED":
      return "received";
    case "OVERDUE":
      return "overdue";
    case "RECEIVED_IN_CASH_UNDONE":
    case "REFUNDED":
    case "CHARGEBACK_REQUESTED":
      return "failed";
    default:
      return "pending";
  }
}
