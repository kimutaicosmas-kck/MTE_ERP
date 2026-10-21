import { addDays, DOC_PALETTE, docKes, docMoney, type DocModel } from "../lib/doc-style";

const DEFAULT_TAGLINE =
  "Dealers in heavy machinery, earth-moving equipment, lubricants, filters & genuine spare parts.";

function lineLabel(l: { sku?: string; name: string }) {
  if (!l.name || l.name === "—") return "—";
  return [l.sku, l.name].filter(Boolean).join(" ");
}

export function DocPaper({ doc }: { doc: DocModel }) {
  const pal = DOC_PALETTE[doc.kind];
  const net = doc.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
  const discountPct = doc.discountPct ?? 0;
  const discountAmt = doc.discountAmount ?? (net * discountPct) / 100;
  const afterDiscount = Math.max(0, net - discountAmt);
  const vatRate = doc.vatRate ?? 0.16;
  const vat = Math.round(afterDiscount * vatRate * 100) / 100;
  const payable = afterDiscount + vat;
  const initials = (doc.companyName || "MTE")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const validUntil = doc.validDays ? addDays(doc.date, doc.validDays) : doc.date;
  const prepared = doc.salesperson || "—";
  const contact = [doc.companyPhone ? `Tel: ${doc.companyPhone}` : null, doc.companyEmail ? `Email: ${doc.companyEmail}` : null]
    .filter(Boolean)
    .join(" | ");
  const itemsTitle =
    doc.kind === "quotation" ? "Quotation Items" : doc.kind === "invoice" ? "Invoice Items" : "Sales Order Items";
  const terms =
    doc.kind === "quotation"
      ? doc.intro || `Prices valid until ${validUntil || "—"} unless withdrawn earlier.`
      : doc.kind === "invoice"
        ? "Payment due on receipt unless credit terms apply. Use invoice number as payment reference."
        : "Goods remain company property until paid in full. Report shortages on the day of receipt.";

  const metaRows =
    doc.kind === "quotation"
      ? [
          ["Date", doc.date],
          ["Quote No.", doc.number],
          ["Valid until", validUntil || "—"],
        ]
      : doc.kind === "invoice"
        ? [
            ["Date", doc.date],
            ["Invoice No.", doc.number],
            ["Order / LPO", doc.lpo || doc.orderNumber || "—"],
          ]
        : [
            ["Date", doc.date],
            ["Order No.", doc.number],
            ["L.P.O.", doc.lpo || "—"],
          ];

  return (
    <article
      className={`doc-paper is-${doc.kind}`}
      style={{ ["--doc-ink" as string]: pal.ink, ["--doc-soft" as string]: pal.soft, ["--doc-dark" as string]: pal.dark }}
    >
      <header className="suite-doc-head">
        <div className="suite-doc-brand">
          <span className="suite-doc-mark">{initials || "M"}</span>
          <div>
            <h1>{doc.companyName || "MTE ERP"}</h1>
            {contact ? <p className="suite-doc-contact">{contact}</p> : null}
          </div>
        </div>
        <div className="suite-doc-badge">{pal.badge}</div>
      </header>

      {(doc.paybill || doc.account) && (
        <section className="suite-doc-mpesa">
          <strong>LIPA NA MPESA</strong>
          <p>PAYBILL NUMBER: {doc.paybill || "—"}</p>
          <p>ACC. NO: {doc.account || "—"}</p>
          <p>B/S NAME: {doc.companyName}</p>
        </section>
      )}

      <div className="suite-doc-parties">
        <div className="suite-doc-party-col">
          <div className="suite-doc-party">
            <span className="suite-doc-party-label">From</span>
            <strong>{doc.companyName}</strong>
            <p className="suite-doc-party-muted">{doc.companyTagline || DEFAULT_TAGLINE}</p>
          </div>
          <div className="suite-doc-party">
            <span className="suite-doc-party-label">To</span>
            <strong>{doc.customerName || "—"}</strong>
            {doc.customerPhone ? <p className="suite-doc-party-muted">{doc.customerPhone}</p> : null}
          </div>
        </div>
        <dl className="suite-doc-meta-grid">
          {metaRows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <h2 className="suite-doc-section-title">{itemsTitle}</h2>
      <table className="suite-doc-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Item</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {(doc.lines.length ? doc.lines : [{ name: "—", qty: 0, price: 0 }]).map((l, i) => (
            <tr key={i}>
              <td>{l.name && l.name !== "—" ? i + 1 : ""}</td>
              <td>{lineLabel(l)}</td>
              <td>{l.name && l.name !== "—" ? docMoney(l.qty) : ""}</td>
              <td>{l.name && l.name !== "—" ? docMoney(l.price) : ""}</td>
              <td>{l.name && l.name !== "—" ? docMoney((Number(l.qty) || 0) * (Number(l.price) || 0)) : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="suite-doc-eoe">
              E.&amp; O.E
            </td>
            <td colSpan={3} className="suite-doc-foot-no">
              No. {doc.number}
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="suite-doc-bottom">
        <div className="suite-doc-signatures">
          <div>
            <span className="suite-doc-sig-label">Prepared By:</span>
            <strong>{prepared}</strong>
          </div>
          <div>
            <span className="suite-doc-sig-label">Authorized By:</span>
            <strong>{prepared}</strong>
          </div>
        </div>
        <div className="suite-doc-totals">
          <div>
            <span>Total Amount:</span>
            <b>{docKes(net)}</b>
          </div>
          <div>
            <span>Less Discount:</span>
            <b>
              {docMoney(discountPct)} % | {docKes(discountAmt)}
            </b>
          </div>
          <div>
            <span>After Discount:</span>
            <b>{docKes(afterDiscount)}</b>
          </div>
          <div className="suite-doc-vat-row">
            <span>VAT Inclusive:</span>
            <b>{docKes(vat)}</b>
          </div>
          <div className="suite-doc-payable">
            <span>Amount Payable:</span>
            <b>{docKes(payable)}</b>
          </div>
          {doc.kind === "invoice" && doc.paid != null && (
            <>
              <div>
                <span>Paid:</span>
                <b>{docKes(doc.paid)}</b>
              </div>
              <div className="suite-doc-balance">
                <span>Balance Due:</span>
                <b>{docKes(doc.balance ?? payable - doc.paid)}</b>
              </div>
            </>
          )}
        </div>
      </div>

      <section className="suite-doc-terms">
        <h3>Terms and Conditions</h3>
        <p>{terms}</p>
      </section>
    </article>
  );
}
