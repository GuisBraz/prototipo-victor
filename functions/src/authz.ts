import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { paths, roleSchema, type Role } from "@mecabom/shared";
import { authorize } from "./domain.js";

/**
 * Exige membro ativo da organização com papel mínimo. Mesma resposta para
 * "não é membro", "inativo" e "papel insuficiente": não revela a existência da
 * organização nem do projeto.
 */
export async function requireRole(
  firestore: Firestore,
  uid: string,
  organizationId: string,
  minimum: Role,
): Promise<Role> {
  const memberSnap = await firestore.doc(paths.member(organizationId, uid)).get();
  const memberData = memberSnap.exists ? memberSnap.data() : undefined;
  const roleParse = roleSchema.safeParse(memberData?.role);
  const decision = authorize(
    memberData && roleParse.success
      ? { role: roleParse.data, status: String(memberData.status) }
      : null,
    minimum,
  );
  if (!decision.ok) {
    throw new HttpsError("permission-denied", "Sem permissão para esta operação.");
  }
  return decision.role;
}
