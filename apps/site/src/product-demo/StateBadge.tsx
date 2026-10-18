import { Icon } from "../components/Icon";
import { STATE_LABEL, type ValidationState } from "./data";

/** Estado sempre com texto (nunca só cor) + ícone. */
export function StateBadge({ state }: { state: ValidationState }) {
  return (
    <span className={`pd-state pd-state--${state}`}>
      {state === "validated" && <Icon name="check" size={14} />}
      {state === "check" && <Icon name="alert" size={14} />}
      {state === "not_found" && <span className="pd-state__dash" aria-hidden="true">—</span>}
      {STATE_LABEL[state]}
    </span>
  );
}
