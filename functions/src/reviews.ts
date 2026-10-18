import { FieldPath, FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { REVIEW_FIELD_REGEX, paths, saveReviewInputSchema } from "@mecabom/shared";
import { requireRole } from "./authz.js";
import { buildAuditEvent } from "./domain.js";
import { parseInput } from "./parse.js";

/**
 * Conferência humana: grava a correção (ou confirmação) de um campo lido pela IA.
 * O valor lido pela IA nunca é apagado; a correção fica ao lado, com autor e data,
 * e gera evento de auditoria. Confirmar = gravar o próprio valor lido.
 */
export async function saveReviewHandler(
  firestore: Firestore,
  uid: string,
  rawData: unknown,
): Promise<{ ok: true }> {
  const input = parseInput(() => saveReviewInputSchema.parse(rawData));
  const { organizationId: orgId, projectId, documentId, field } = input;
  await requireRole(firestore, uid, orgId, "reviewer");

  const ref = firestore.doc(paths.extraction(orgId, projectId, documentId));
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Leitura não encontrada.");
    const m = REVIEW_FIELD_REGEX.exec(field);
    if (m?.[2] !== undefined) {
      const rows = (snap.data()?.output?.componentTable?.rows ?? []) as unknown[];
      if (Number(m[2]) >= rows.length) throw new HttpsError("invalid-argument", "Linha inexistente.");
    }
    const previous = (snap.data()?.overrides ?? {})[field] ?? null;
    const ts = FieldValue.serverTimestamp();
    // Campo com ponto no nome: FieldPath evita que "rows.0.quantity" vire caminho aninhado.
    const overrideValue = input.clear ? FieldValue.delete() : { value: input.value, by: uid, at: ts };
    tx.update(ref, new FieldPath("overrides", field), overrideValue, "updatedAt", ts);
    const event = buildAuditEvent({
      organizationId: orgId,
      projectId,
      actorId: uid,
      action: input.clear ? "review.clear" : "review.save",
      subject: { type: "extraction", id: documentId },
      after: {
        field,
        value: input.clear ? null : input.value,
        previousValue: previous ? (previous.value ?? null) : null,
      },
    });
    tx.set(firestore.collection(paths.auditEvents(orgId)).doc(), { ...event, at: ts });
  });
  return { ok: true };
}
