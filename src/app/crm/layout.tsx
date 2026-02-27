import { ReactNode } from "react";
import { requireAdminSessionForPage } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export default async function CrmLayout(props: { children: ReactNode }) {
  await requireAdminSessionForPage();
  return props.children;
}
