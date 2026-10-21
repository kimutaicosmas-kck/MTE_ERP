import { useQuery } from "@tanstack/react-query";
import { PageBusy, PageHeader } from "../components/ui";
import { api } from "../lib/api";

type Spec = {
  info: { title: string; description?: string };
  paths: Record<string, Record<string, { summary?: string }>>;
};

export function Docs() {
  const spec = useQuery({ queryKey: ["openapi"], queryFn: () => api<Spec>("/api/docs/openapi.json") });
  if (spec.isLoading) return <PageBusy label="Loading API docs…" />;
  const paths = spec.data?.paths || {};
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="REST" title="API documentation" />
      <div className="card space-y-2">
        <p className="text-sm text-stone-500">{spec.data?.info.description}</p>
        <a className="text-sm text-gold" href="/api/docs" target="_blank" rel="noreferrer">Open printable reference</a>
      </div>
      {Object.entries(paths).map(([path, methods]) =>
        Object.entries(methods).map(([method, d]) => (
          <div key={`${method}${path}`} className="card flex flex-wrap items-center gap-3">
            <span className="rounded bg-gold/20 px-2 py-0.5 text-xs font-bold uppercase">{method}</span>
            <code className="text-sm">/api{path}</code>
            <span className="text-sm text-stone-500">{d.summary}</span>
          </div>
        ))
      )}
    </div>
  );
}
