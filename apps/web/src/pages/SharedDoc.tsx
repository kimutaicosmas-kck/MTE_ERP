import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { DocPaper } from "../components/DocPaper";
import { ShareMenu } from "../components/ShareMenu";
import type { DocModel } from "../lib/doc-style";

export function SharedDoc() {
  const { token = "" } = useParams();
  const q = useQuery({
    queryKey: ["share", token],
    queryFn: async () => {
      const res = await fetch(`/api/share/${token}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Document not found");
      return data;
    },
    enabled: Boolean(token),
  });

  if (q.isLoading) return <div className="grid min-h-dvh place-items-center text-stone-500">Opening document…</div>;
  if (q.error || !q.data) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold">This link is not valid</p>
          <p className="mt-1 text-sm text-stone-500">{(q.error as Error | undefined)?.message || "Ask the sender for a new copy."}</p>
        </div>
      </div>
    );
  }

  const d = q.data;
  const doc: DocModel = {
    kind: d.kind === "quotation" ? "quotation" : "sales-order",
    number: d.number,
    date: new Date(d.createdAt).toLocaleDateString("en-GB"),
    customerName: d.customer?.name || "",
    customerPhone: d.customer?.phone,
    salesperson: d.salesperson?.name,
    companyName: d.company?.legalName || d.company?.name || "MTE ERP",
    companyPhone: d.company?.phone,
    companyEmail: d.company?.email,
    companyAddress: d.company?.address,
    paybill: d.company?.mpesaPaybill,
    account: d.company?.mpesaAccount,
    status: d.status,
    intro: d.intro,
    validDays: d.validDays,
    lpo: d.lpo,
    dispatchMethod: d.dispatchMethod,
    lines: (d.lines || []).map((l: { sku: string; name: string; qty: number; price: number }) => ({
      sku: l.sku,
      name: l.name,
      qty: l.qty,
      price: l.price,
    })),
    vatRate: d.vatRate,
  };

  return (
    <div className="shared-doc">
      <div className="doc-overlay-bar">
        <p className="min-w-0 truncate text-sm font-semibold">{doc.number}</p>
        <div className="flex items-center gap-2">
          <a className="btn-ghost" href={`/api/share/${token}/pdf`} target="_blank" rel="noreferrer">PDF</a>
          <ShareMenu
            token={token}
            kind={doc.kind}
            number={doc.number}
            customerName={doc.customerName}
            phone={d.customer?.phone}
            email={d.company?.email}
          />
        </div>
      </div>
      <div className="doc-overlay-body">
        <DocPaper doc={doc} />
      </div>
    </div>
  );
}
