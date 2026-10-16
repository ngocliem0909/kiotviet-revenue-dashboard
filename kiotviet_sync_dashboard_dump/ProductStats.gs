/**
 * Product-level sales stats (quantity, revenue, gross profit by product x month).
 *
 * Tabs in KiotViet-Summary:
 *   - ProductMonthly: finalized months, append-only.
 *       year, month, productCode, productName, qty, revenue, costPerUnit, grossProfit, updatedAt
 *   - ProductCurrent: current (incomplete) month, overwritten by updateProductStatsDaily().
 *
 * Functions:
 *   - startProductBackfill2026(): reset progress + create 10-min trigger (run once manually)
 *   - backfillProductMonth():       one finalized 2026 month per trigger run (01..09)
 *   - updateProductStatsDaily():    refresh current month; rolls finished month into ProductMonthly
 *
 * Cost comes from the Products tab (populated by syncProductsAndInventory in Products.gs).
 * Reuses getAccessToken() from Code.gs, getSummarySpreadsheet() from Summary.gs,
 * and fetchUrlWithRetry/writeTabOverwrite/appendTabWithHeader from Products.gs.
 */

var PRODUCT_MONTHLY_TAB = 'ProductMonthly';
var PRODUCT_CURRENT_TAB = 'ProductCurrent';
var PM_HEADER = ['year', 'month', 'productCode', 'productName', 'qty', 'revenue',
  'costPerUnit', 'grossProfit', 'updatedAt'];

function getCostMap() {
  var map = {};
  var sh = getSummarySpreadsheet().getSheetByName(PRODUCTS_TAB);
  if (!sh || sh.getLastRow() < 2) return map;
  var vals = sh.getRange(2, 2, sh.getLastRow() - 1, 3).getValues();
  for (var i = 0; i < vals.length; i++) {
    map[String(vals[i][0])] = Number(vals[i][2]) || 0;
  }
  return map;
}

function fetchInvoicesByMonth(token, year, month) {
  var props = PropertiesService.getScriptProperties();
  var retailer = props.getProperty('KIOT_RETAILER') || 'leeandteevn';
  var mm = ('0' + month).slice(-2);
  var from = year + '-' + mm + '-01T00:00:00';
  var lastDay = new Date(year, month, 0).getDate();
  var to = year + '-' + mm + '-' + lastDay + 'T23:59:59';
  var all = [];
  var currentItem = 0;
  var pageSize = 100;
  while (true) {
    var url = 'https://public.kiotapi.com/invoices?pageSize=' + pageSize +
      '&currentItem=' + currentItem +
      '&fromPurchaseDate=' + encodeURIComponent(from) +
      '&toPurchaseDate=' + encodeURIComponent(to);
    var resp = fetchUrlWithRetry(url, {
      headers: { 'Retailer': retailer, 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    var data = JSON.parse(resp.getContentText());
    var batch = data.data || [];
    for (var i = 0; i < batch.length; i++) all.push(batch[i]);
    if (all.length >= (data.total || 0) || batch.length === 0) break;
    currentItem += pageSize;
    Utilities.sleep(2000);
  }
  return all;
}

function aggregateProducts(invoices, year, month, costMap, nowStr) {
  var agg = {};
  invoices.forEach(function (inv) {
    var details = inv.invoiceDetails || [];
    details.forEach(function (d) {
      var code = d.productCode || '';
      if (!code) return;
      if (!agg[code]) agg[code] = { code: code, name: d.productName || '', qty: 0, revenue: 0 };
      var qty = Number(d.quantity) || 0;
      var lineRev = (d.subTotal !== null && d.subTotal !== undefined) ? Number(d.subTotal) :
        (Number(d.price) || 0) * qty - (Number(d.discount) || 0);
      agg[code].qty += qty;
      agg[code].revenue += lineRev;
    });
  });
  var rows = [];
  Object.keys(agg).forEach(function (code) {
    var a = agg[code];
    var cost = costMap[code] || 0;
    rows.push([year, ('0' + month).slice(-2), a.code, a.name, a.qty,
      Math.round(a.revenue), cost, Math.round(a.revenue - cost * a.qty), nowStr]);
  });
  rows.sort(function (x, y) { return y[5] - x[5]; });
  return rows;
}

function deleteTriggersByName(fnName) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === fnName) ScriptApp.deleteTrigger(t);
  });
}

function backfillProductMonth() {
  var props = PropertiesService.getScriptProperties();
  var months = ['01', '02', '03', '04', '05', '06', '07', '08', '09'];
  var cur = props.getProperty('PROD_BACKFILL_2026');
  var idx = cur ? months.indexOf(cur) : 0;
  if (idx < 0 || idx >= months.length) {
    deleteTriggersByName('backfillProductMonth');
    props.deleteProperty('PROD_BACKFILL_2026');
    Logger.log('2026 product backfill complete.');
    return;
  }
  var costMap = getCostMap();
  if (Object.keys(costMap).length === 0) {
    Logger.log('Products catalog empty; run syncProductsAndInventory first. Retrying next trigger.');
    return;
  }
  var mm = months[idx];
  Logger.log('Backfilling product stats 2026-%s', mm);
  var token = getAccessToken();
  var invoices = fetchInvoicesByMonth(token, 2026, parseInt(mm, 10));
  Logger.log('Fetched %d invoices for 2026-%s', invoices.length, mm);
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss');
  var rows = aggregateProducts(invoices, '2026', mm, costMap, nowStr);
  appendTabWithHeader(getSummarySpreadsheet(), PRODUCT_MONTHLY_TAB, [PM_HEADER], rows);
  Logger.log('Wrote %d product rows for 2026-%s', rows.length, mm);
  var next = idx + 1;
  if (next >= months.length) {
    props.deleteProperty('PROD_BACKFILL_2026');
    deleteTriggersByName('backfillProductMonth');
    Logger.log('2026 product backfill complete.');
  } else {
    props.setProperty('PROD_BACKFILL_2026', months[next]);
  }
}

function startProductBackfill2026() {
  deleteTriggersByName('backfillProductMonth');
  PropertiesService.getScriptProperties().setProperty('PROD_BACKFILL_2026', '01');
  ScriptApp.newTrigger('backfillProductMonth').timeBased().everyMinutes(10).create();
  Logger.log('Started 2026 product backfill trigger (one month per 10 min).');
}

function updateProductStatsDaily() {
  var ss = getSummarySpreadsheet();
  var now = new Date();
  var year = now.getFullYear();
  var mm = ('0' + (now.getMonth() + 1)).slice(-2);
  var newYM = year + '-' + mm;

  var cur = ss.getSheetByName(PRODUCT_CURRENT_TAB);
  if (cur && cur.getLastRow() > 1) {
    var first = cur.getRange(2, 1, 1, 2).getValues()[0];
    var curYM = first[0] + '-' + first[1];
    if (curYM !== newYM) {
      var rows = cur.getRange(2, 1, cur.getLastRow() - 1, PM_HEADER.length).getValues();
      appendTabWithHeader(ss, PRODUCT_MONTHLY_TAB, [PM_HEADER], rows);
      Logger.log('Rolled %s into ProductMonthly (%d rows)', curYM, rows.length);
    }
  }

  var costMap = getCostMap();
  if (Object.keys(costMap).length === 0) {
    Logger.log('Products catalog empty; run syncProductsAndInventory first.');
    return;
  }
  var token = getAccessToken();
  var invoices = fetchInvoicesByMonth(token, year, parseInt(mm, 10));
  var nowStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss');
  var aggRows = aggregateProducts(invoices, String(year), mm, costMap, nowStr);
  writeTabOverwrite(ss, PRODUCT_CURRENT_TAB, [PM_HEADER].concat(aggRows));
  Logger.log('Updated ProductCurrent %s: %d products from %d invoices', newYM, aggRows.length, invoices.length);
}