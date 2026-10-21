import { Link } from "react-router-dom";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

export type ActionAlert = {
  id: string;
  level: "info" | "warn" | "danger";
  label: string;
  to: string;
};

const ICON = {
  danger: AlertCircle,
  warn: AlertTriangle,
  info: Info,
} as const;

export function ActionAlertList({
  alerts,
  compact,
  onSelect,
}: {
  alerts: ActionAlert[];
  compact?: boolean;
  onSelect?: () => void;
}) {
  if (!alerts.length) return null;
  return (
    <ul className={compact ? "action-alert-list action-alert-list--compact" : "action-alert-list"}>
      {alerts.map((a) => {
        const Icon = ICON[a.level];
        return (
          <li key={a.id}>
            <Link to={a.to} className={`action-alert-item action-alert-item--${a.level}`} onClick={onSelect}>
              <Icon size={14} strokeWidth={2} aria-hidden />
              <span className="action-alert-label">{a.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
