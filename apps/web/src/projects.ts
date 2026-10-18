import { collection, doc, onSnapshot, orderBy, query, type Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useState } from "react";
import {
  paths,
  projectSchema,
  type CreateOrganizationInput,
  type CreateProjectInput,
  type Project,
} from "@mecabom/shared";
import { firestore, functions } from "./firebase";

export interface ProjectRow extends Project {
  id: string;
  updatedAt: Date | null;
}

function toDate(value: unknown): Date | null {
  return value && typeof (value as Timestamp).toDate === "function"
    ? (value as Timestamp).toDate()
    : null;
}

/**
 * Os resultados guardam a chave (organização/projeto) de onde vieram. Quando a
 * chave atual ainda não tem resultado, o estado é "carregando" — derivado, sem
 * setState síncrono dentro do efeito.
 */
export function useProjects(organizationId: string | null) {
  const [result, setResult] = useState<{
    key: string;
    projects: ProjectRow[];
    error: boolean;
  } | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    const q = query(collection(firestore, paths.projects(organizationId)), orderBy("updatedAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        const rows: ProjectRow[] = [];
        for (const d of snap.docs) {
          const parsed = projectSchema.safeParse(d.data());
          if (parsed.success) {
            rows.push({ ...parsed.data, id: d.id, updatedAt: toDate(d.data().updatedAt) });
          }
        }
        setResult({ key: organizationId, projects: rows, error: false });
      },
      () => setResult({ key: organizationId, projects: [], error: true }),
    );
  }, [organizationId]);

  const current = organizationId && result?.key === organizationId ? result : null;
  return {
    projects: current?.projects ?? [],
    loading: Boolean(organizationId) && current === null,
    error: current?.error ?? false,
  };
}

export function useProject(organizationId: string | null, projectId: string | undefined) {
  const key = organizationId && projectId ? `${organizationId}/${projectId}` : null;
  const [result, setResult] = useState<{ key: string; project: ProjectRow | null } | null>(null);

  useEffect(() => {
    if (!organizationId || !projectId || !key) return;
    return onSnapshot(
      doc(firestore, paths.project(organizationId, projectId)),
      (snap) => {
        const parsed = snap.exists() ? projectSchema.safeParse(snap.data()) : null;
        setResult({
          key,
          project: parsed?.success
            ? { ...parsed.data, id: snap.id, updatedAt: toDate(snap.data()?.updatedAt) }
            : null,
        });
      },
      () => setResult({ key, project: null }),
    );
  }, [organizationId, projectId, key]);

  const current = key && result?.key === key ? result : null;
  return { project: current?.project ?? null, loading: key !== null && current === null };
}

const createOrganizationCall = httpsCallable<CreateOrganizationInput, { organizationId: string }>(
  functions,
  "createOrganization",
);
const createProjectCall = httpsCallable<CreateProjectInput, { projectId: string }>(
  functions,
  "createProject",
);

export async function createOrganization(name: string): Promise<string> {
  return (await createOrganizationCall({ name })).data.organizationId;
}

export async function createProject(input: CreateProjectInput): Promise<string> {
  return (await createProjectCall(input)).data.projectId;
}
