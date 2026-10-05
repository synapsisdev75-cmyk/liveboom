import type { InvoiceParty, PurchaseInvoiceRow } from './walletApi';

function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cop(amount: number) {
  return `$${Math.round(amount).toLocaleString('es-CO')} COP`;
}

function invoiceHtml(row: PurchaseInvoiceRow, seller: InvoiceParty, buyer: InvoiceParty) {
  const date = row.paidAtMs ? new Date(row.paidAtMs).toLocaleString('es-CO') : '—';
  const buyerName = buyer.name || (buyer.username ? `@${buyer.username}` : 'Usuario LiveBoom');
  const concept = row.kind === 'ads' ? 'Publicidad paga' : 'Compra de BLAST';
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Factura ${esc(row.invoiceNumber)} · ${esc(seller.brand || 'LiveBoom')}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:24px;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b;background:#fff}
  .doc{max-width:760px;margin:0 auto}
  header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;border-bottom:2px solid #e4e4e7;padding-bottom:16px}
  h1{margin:0;font-size:22px}
  .muted{color:#52525b;font-size:12px}
  .num{text-align:right}
  .num strong{display:block;font-size:18px}
  .parties{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:20px 0}
  .box{border:1px solid #e4e4e7;border-radius:12px;padding:12px}
  .box h2{margin:0 0 6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#71717a}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{padding:10px 8px;border-bottom:1px solid #e4e4e7;text-align:left;vertical-align:top}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#71717a}
  td.r,th.r{text-align:right}
  .total{display:flex;justify-content:flex-end;gap:24px;margin-top:12px;font-size:18px;font-weight:700}
  footer{margin-top:24px;font-size:11px;color:#71717a}
  .actions{margin:20px 0 0;text-align:center}
  .actions button{min-height:44px;padding:0 20px;border:0;border-radius:999px;background:#18181b;color:#fff;font-weight:700;cursor:pointer}
  @media print{body{padding:0}.actions{display:none}}
</style></head>
<body><div class="doc">
<header>
  <div>
    <h1>${esc(seller.brand || 'LiveBoom')}</h1>
    <div class="muted">${esc(seller.name)} · NIT ${esc(seller.nit || '')}</div>
    <div class="muted">${esc(seller.address || '')}</div>
    <div class="muted">${esc(seller.email || '')}${seller.phone ? ` · ${esc(seller.phone)}` : ''}</div>
  </div>
  <div class="num">
    <span class="muted">Factura de compra</span>
    <strong>${esc(row.invoiceNumber)}</strong>
    <span class="muted">Fecha de pago: ${esc(date)}</span>
  </div>
</header>
<section class="parties">
  <div class="box"><h2>Cliente</h2>
    <div><strong>${esc(buyerName)}</strong></div>
    ${buyer.username ? `<div class="muted">@${esc(buyer.username)}</div>` : ''}
    ${buyer.email ? `<div class="muted">${esc(buyer.email)}</div>` : ''}
  </div>
  <div class="box"><h2>Pago</h2>
    <div>Medio: Wompi (PSE, tarjetas y billeteras)</div>
    <div class="muted">Referencia: ${esc(row.reference)}</div>
    ${row.wompiTransactionId ? `<div class="muted">Transacción Wompi: ${esc(row.wompiTransactionId)}</div>` : ''}
    <div class="muted">Estado: Pagado</div>
  </div>
</section>
<table>
  <thead><tr><th>Concepto</th><th>Descripción</th><th class="r">Valor</th></tr></thead>
  <tbody><tr>
    <td>${esc(concept)}</td>
    <td>${esc(row.description)}${row.detail ? `<div class="muted">${esc(row.detail)}</div>` : ''}</td>
    <td class="r">${esc(cop(row.amountCop))}</td>
  </tr></tbody>
</table>
<div class="total"><span>Total pagado</span><span>${esc(cop(row.amountCop))}</span></div>
<footer>
  Valor total en pesos colombianos (${esc(row.currency || 'COP')}), impuestos incluidos según aplique.
  Documento soporte de la compra realizada en ${esc(seller.brand || 'LiveBoom')} y pagada a través de Wompi.
  No sustituye la factura electrónica de venta validada por la DIAN cuando esta sea exigible.
</footer>
<div class="actions"><button type="button" onclick="window.print()">Guardar como PDF / Imprimir</button></div>
</div></body></html>`;
}

/** Abre la factura imprimible; si el navegador bloquea la ventana, descarga el HTML. */
export function openPurchaseInvoice(row: PurchaseInvoiceRow, seller: InvoiceParty, buyer: InvoiceParty) {
  const html = invoiceHtml(row, seller, buyer);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `Factura-${row.invoiceNumber}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
