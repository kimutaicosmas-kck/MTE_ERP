import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Modal } from "./ui";

type StkStart = {
  id: string;
  phone: string;
  amount: number;
  invoice: string;
  message: string;
};

type Txn = { id: string; status: string; receipt?: string | null; resultDesc?: string | null; amount: number; phone?: string | null };

export function StkPrompt({
  invoiceId,
  orderId,
  defaultPhone,
  defaultAmount,
  onClose,
  onPaid,
}: {
  invoiceId?: string;
  orderId?: string;
  defaultPhone?: string;
  defaultAmount?: number;
  onClose: () => void;
  onPaid?: () => void;
}) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState(defaultPhone || "");
  const [amount, setAmount] = useState(String(defaultAmount || ""));
  const [txnId, setTxnId] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () =>
      api<StkStart>("/api/mpesa/stk", {
        method: "POST",
        body: JSON.stringify({ invoiceId, orderId, phone, amount: Number(amount) }),
      }),
    onSuccess: (row) => setTxnId(row.id),
  });
  const txn = useQuery({
    queryKey: ["mpesa-txn", txnId],
    queryFn: () => api<Txn>(`/api/mpesa/transactions/${txnId}`),
    enabled: Boolean(txnId),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === "PENDING" ? 3000 : false;
    },
  });
  useEffect(() => {
    if (txn.data?.status === "SUCCESS") {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order"] });
      qc.invalidateQueries({ queryKey: ["mpesa-txns"] });
      onPaid?.();
    }
  }, [txn.data?.status, qc, onPaid]);

  const status = txn.data?.status || (txnId ? "PENDING" : "");

  return (
    <Modal onClose={onClose}>
      <div className="space-y-3">
        <h3 className="font-semibold">Send M-Pesa prompt</h3>
        <p className="text-sm text-stone-500">The customer gets a Safaricom PIN prompt. When they pay, the invoice is marked paid automatically.</p>
        {!txnId && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
          >
            <div>
              <label>Safaricom number</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" required />
            </div>
            <div>
              <label>Amount</label>
              <input type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            {send.error && <p className="text-sm text-red-600">{(send.error as Error).message}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-success" disabled={send.isPending}>{send.isPending ? "Sending…" : "Send prompt"}</button>
            </div>
          </form>
        )}
        {txnId && (
          <div className="space-y-3">
            <p className="text-sm">{send.data?.message || "Waiting for the customer to enter their PIN…"}</p>
            <p className={`text-sm font-semibold ${
              status === "SUCCESS" ? "text-emerald-700" : status === "FAILED" || status === "CANCELLED" ? "text-red-600" : "text-amber-600"
            }`}>
              {status === "SUCCESS" ? `Paid · ${txn.data?.receipt || "M-Pesa"}` : status === "CANCELLED" ? "Customer cancelled" : status === "FAILED" ? (txn.data?.resultDesc || "Payment failed") : "Waiting for PIN…"}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={onClose}>{status === "SUCCESS" ? "Close" : "Done"}</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
