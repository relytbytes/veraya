import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { PurchaseOrder } from "./api";

export async function generatePOInvoicePDF(po: PurchaseOrder, receivedQtys: Record<string, number>, receivedBy?: string) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const rows = po.items.map((item) => {
    const received = receivedQtys[item.id] ?? 0;
    const lineTotal = received * Number(item.unitCost);
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${item.ingredient.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${item.quantity} ${item.ingredient.unit}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${received} ${item.ingredient.unit}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">$${Number(item.unitCost).toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">$${lineTotal.toFixed(2)}</td>
      </tr>`;
  }).join("");

  const receivedTotal = po.items.reduce((sum, item) => {
    const received = receivedQtys[item.id] ?? 0;
    return sum + received * Number(item.unitCost);
  }, 0);

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: -apple-system, Arial, sans-serif; font-size: 13px; color: #111; margin: 0; padding: 24px; max-width: 760px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  .brand { font-size: 22px; font-weight: 800; color: #f59e0b; }
  .brand-sub { font-size: 12px; color: #6b7280; }
  .invoice-title { font-size: 28px; font-weight: 700; text-align: right; }
  .invoice-meta { text-align: right; color: #6b7280; font-size: 12px; margin-top: 4px; }
  .section { margin-bottom: 20px; }
  .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 4px; }
  .section-value { font-size: 14px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  thead { background: #f9fafb; }
  th { padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; }
  th.right { text-align: right; }
  .total-row { background: #fffbeb; font-weight: 700; }
  .total-row td { padding: 12px; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600; background: #d1fae5; color: #065f46; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
</style></head>
<body>
  <div class="header">
    <div>
      <div class="brand">Veraya</div>
      <div class="brand-sub">Purchase Order Invoice</div>
    </div>
    <div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-meta">${po.invoiceNumber ? `#${po.invoiceNumber}` : `PO-${po.id.slice(-8).toUpperCase()}`}</div>
      <div class="invoice-meta">${dateStr}</div>
    </div>
  </div>

  <div style="display:flex;gap:40px;margin-bottom:24px">
    <div class="section">
      <div class="section-label">Supplier</div>
      <div class="section-value">${po.vendor.name}</div>
    </div>
    <div class="section">
      <div class="section-label">Order Date</div>
      <div class="section-value">${po.orderedAt ? new Date(po.orderedAt).toLocaleDateString() : "—"}</div>
    </div>
    <div class="section">
      <div class="section-label">Received</div>
      <div class="section-value">${dateStr}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px">${timeStr}</div>
    </div>
    <div class="section">
      <div class="section-label">Status</div>
      <div class="status-badge">RECEIVED</div>
    </div>
  </div>

  ${receivedBy ? `
  <div style="margin-bottom:24px;padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;display:flex;align-items:center;gap:12px">
    <div style="width:32px;height:32px;border-radius:50%;background:#16a34a;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">${receivedBy[0].toUpperCase()}</div>
    <div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#16a34a;font-weight:600">Received By</div>
      <div style="font-size:14px;font-weight:600;color:#14532d">${receivedBy}</div>
      <div style="font-size:11px;color:#4ade80">${dateStr} at ${timeStr}</div>
    </div>
  </div>` : ""}

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th style="text-align:center">Ordered</th>
        <th style="text-align:center">Received</th>
        <th class="right">Unit Cost</th>
        <th class="right">Line Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="4" style="text-align:right;padding:12px">Total Received Value</td>
        <td style="text-align:right;padding:12px">$${receivedTotal.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  ${po.notes ? `<p style="margin-top:16px;padding:12px;background:#f9fafb;border-radius:8px;font-size:12px;color:#374151">📝 ${po.notes}</p>` : ""}

  <div class="footer">Generated by Veraya · ${now.toLocaleString()}${receivedBy ? ` · Received by ${receivedBy}` : ""}</div>
</body></html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
}

export async function sharePDF(uri: string) {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Share Invoice" });
  }
}
