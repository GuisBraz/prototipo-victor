import { HttpsError } from "firebase-functions/v2/https";
import { ZodError } from "zod";

export function parseInput<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof ZodError) {
      const fields = error.issues.map((i) => i.path.join(".") || "(raiz)").join(", ");
      throw new HttpsError("invalid-argument", `Dados inválidos: ${fields}.`);
    }
    throw error;
  }
}
