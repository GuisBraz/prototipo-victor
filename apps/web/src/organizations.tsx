import { collection, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { paths, userMembershipSchema, type UserMembership } from "@mecabom/shared";
import { useAuth } from "./auth";
import { firestore } from "./firebase";

const STORAGE_KEY = "mecabom.currentOrg";

function readStoredOrg(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeOrg(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* armazenamento indisponível: apenas conveniência, ignorar */
  }
}

interface OrgState {
  memberships: UserMembership[];
  current: UserMembership | null;
  loading: boolean;
  select: (organizationId: string) => void;
}

const OrgContext = createContext<OrgState | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;
  // O resultado guarda de qual usuário veio; sem usuário, o estado é derivado (sem setState no efeito).
  const [snapshot, setSnapshot] = useState<{ uid: string; items: UserMembership[] } | null>(null);
  const [selected, setSelected] = useState<string | null>(readStoredOrg);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      collection(firestore, paths.userMemberships(uid)),
      (snap) => {
        const items: UserMembership[] = [];
        for (const d of snap.docs) {
          const parsed = userMembershipSchema.safeParse(d.data());
          if (parsed.success && parsed.data.status === "active") items.push(parsed.data);
        }
        setSnapshot({ uid, items });
      },
      () => setSnapshot({ uid, items: [] }),
    );
  }, [uid]);

  const memberships = useMemo(
    () => (uid && snapshot?.uid === uid ? snapshot.items : []),
    [uid, snapshot],
  );
  const loading = Boolean(uid) && snapshot?.uid !== uid;

  const value = useMemo<OrgState>(() => {
    const current = memberships.find((m) => m.organizationId === selected) ?? memberships[0] ?? null;
    return {
      memberships,
      current,
      loading,
      select: (id) => {
        setSelected(id);
        storeOrg(id);
      },
    };
  }, [memberships, selected, loading]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrganizations(): OrgState {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrganizations deve ser usado dentro de OrganizationProvider");
  return ctx;
}
