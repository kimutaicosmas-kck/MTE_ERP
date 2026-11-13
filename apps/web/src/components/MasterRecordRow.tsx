import type { ReactNode } from "react";

/** Horizontal “master record” row — name block, meta, category, location, etc. */
export function MasterRecordRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`master-record-row ${className}`.trim()}>{children}</div>;
}

export function MasterRecordPrimary({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <div className="master-record-primary">
      <div className="master-record-title">{title}</div>
      {meta ? <div className="master-record-meta">{meta}</div> : null}
    </div>
  );
}

export function MasterRecordCol({
  label,
  children,
  className = "",
  wide,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div className={`master-record-col ${wide ? "master-record-col-wide" : ""} ${className}`.trim()}>
      <span className="master-record-label">{label}</span>
      <div className="master-record-field">{children}</div>
    </div>
  );
}
