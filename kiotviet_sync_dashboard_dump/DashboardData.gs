/**
 * Dashboard data functions for Profit / Inventory / Top Products.
 * New file — does not modify existing code.
 * Reads from KiotViet-Summary tabs: ProductMonthly, ProductCurrent,
 * Products, Inventory, InventoryDaily.
 * Reuses getSummarySpreadsheet() from Summary.gs.
 */

/**
 * Profit summary for a year + list of months (['01',...]).
 * Reads from pre-aggregated ProfitSummary sheet (fast: ~130 rows).
 * Returns { revenue, grossProfit, marginPct, coveragePct }.
 * coveragePct = % of revenue from products WITH cost data.
 */
function getProfitData(year, months) {
  var ss = getSummarySpreadsheet();
  var y = String(year);
  var monthSet = {};
  months.forEach(function (m) { monthSet[String(m).padStart(2, '0')] = true; });

  var sh = ss.getSheetByName('ProfitSummary');
  var revenue = 0, profit = 0, revWithCost = 0;

  if (sh && sh.getLastRow() >= 2) {
    // year(A), month(B), revenue(C), grossProfit(D), revWithCost(E)
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]) !== y) continue;
      var m = String(vals[i][1]).padStart(2, '0');
      if (!monthSet[m]) continue;
      revenue += Number(vals[i][2]) || 0;
      profit += Number(vals[i][3]) || 0;
      revWithCost += Number(vals[i][4]) || 0;
    }
  }

  // Include current (incomplete) month from ProductCurrent if requested
  var now = new Date();
  var curY = String(now.getFullYear());
  var curM = ('0' + (now.getMonth() + 1)).slice(-2);
  if (y === curY && monthSet[curM]) {
    var pc = ss.getSheetByName('ProductCurrent');
    if (pc && pc.getLastRow() >= 2) {
      var plast = pc.getLastRow();
      var pyears = pc.getRange(2, 1, plast - 1, 2).getValues();
      var pnums = pc.getRange(2, 6, plast - 1, 3).getValues();
      for (var j = 0; j < pyears.length; j++) {
        if (String(pyears[j][0]) !== y) continue;
        if (String(pyears[j][1]).padStart(2, '0') !== curM) continue;
        var r2 = Number(pnums[j][0]) || 0;
        var c2 = Number(pnums[j][1]) || 0;
        var g2 = Number(pnums[j][2]) || 0;
        revenue += r2;
        profit += g2;
        if (c2 > 0) revWithCost += r2;
      }
    }
  }

  revenue = Math.round(revenue);
  profit = Math.round(profit);
  return {
    revenue: revenue,
    grossProfit: profit,
    marginPct: revenue > 0 ? Math.round(profit / revenue * 1000) / 10 : 0,
    coveragePct: revenue > 0 ? Math.round(revWithCost / revenue * 1000) / 10 : 0
  };
}

/**
 * Profit with same-period comparison: { current, comparison }.
 * Comparison uses the same months in the previous year.
 * Fast: getProfitData reads from pre-aggregated ProfitSummary (~130 rows).
 */
function getProfitWithComparison(year, months) {
  var prevYear = String(Number(year) - 1);
  return {
    current: getProfitData(year, months),
    comparison: getProfitData(prevYear, months)
  };
}

/**
 * Top products by revenue for a year + months. Returns array of
 * { code, name, qty, revenue, grossProfit }, sorted desc, limited.
 */
function getTopProducts(year, months, limit) {
  limit = limit || 10;
  var ss = getSummarySpreadsheet();
  var y = String(year);
  var monthSet = {};
  months.forEach(function (m) { monthSet[m] = true; });

  var agg = {};
  function accumulate(sh) {
    if (!sh || sh.getLastRow() < 2) return;
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]) !== y) continue;
      if (!monthSet[String(vals[i][1])]) continue;
      var code = String(vals[i][2]);
      if (!agg[code]) {
        agg[code] = { code: code, name: String(vals[i][3]), qty: 0, revenue: 0, grossProfit: 0 };
      }
      agg[code].qty += Number(vals[i][4]) || 0;
      agg[code].revenue += Number(vals[i][5]) || 0;
      agg[code].grossProfit += Number(vals[i][7]) || 0;
    }
  }

  accumulate(ss.getSheetByName('ProductMonthly'));

  var now = new Date();
  var curY = String(now.getFullYear());
  var curM = ('0' + (now.getMonth() + 1)).slice(-2);
  if (y === curY && monthSet[curM]) {
    accumulate(ss.getSheetByName('ProductCurrent'));
  }

  var arr = Object.keys(agg).map(function (k) {
    var a = agg[k];
    a.qty = Math.round(a.qty);
    a.revenue = Math.round(a.revenue);
    a.grossProfit = Math.round(a.grossProfit);
    return a;
  });
  arr.sort(function (x, y) { return y.revenue - x.revenue; });
  return arr.slice(0, limit);
}

/**
 * Current inventory summary. Returns
 * { totalValue, skuCount, totalOnHand, lowStockCount, outOfStockCount, updatedAt }.
 */
function getInventoryData() {
  var ss = getSummarySpreadsheet();
  var sh = ss.getSheetByName('InventoryDaily');
  if (!sh || sh.getLastRow() < 2) return null;
  // date(A), skuCount(B), totalOnHand(C), totalValue(D), lowStock(E), outOfStock(F), updatedAt(G)
  var last = sh.getRange(sh.getLastRow(), 1, 1, 7).getValues()[0];
  return {
    date: String(last[0]),
    skuCount: Number(last[1]) || 0,
    totalOnHand: Number(last[2]) || 0,
    totalValue: Math.round(Number(last[3]) || 0),
    lowStockCount: Number(last[4]) || 0,
    outOfStockCount: Number(last[5]) || 0,
    updatedAt: String(last[6])
  };
}

/**
 * Low/out-of-stock products list (for dashboard alert section).
 * Returns up to `limit` rows { code, name, branch, onHand } with onHand <= 0 first.
 */
function getStockAlerts(limit) {
  limit = limit || 20;
  var ss = getSummarySpreadsheet();
  var sh = ss.getSheetByName('Inventory');
  if (!sh || sh.getLastRow() < 2) return [];
  // productCode(A), productName(B), branchName(C), onHand(D)
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var onHand = Number(vals[i][3]) || 0;
    if (onHand <= 0) {
      out.push({ code: String(vals[i][0]), name: String(vals[i][1]),
        branch: String(vals[i][2]), onHand: onHand });
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Reconciliation: compare KiotViet API vs Sheets for today.
 * Returns { date, kiotvietCount, sheetCount, difference, lastSync }.
 */

function getReconciliationStatus() {
  var tz = 'Asia/Ho_Chi_Minh';
  var now = new Date();
  var todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var ictStart = new Date(todayStr + 'T00:00:00+07:00');
  var ictEnd = new Date(todayStr + 'T23:59:59+07:00');
  var todayStart = ictStart.toISOString();
  var todayEnd = ictEnd.toISOString();
  var kiotvietCount = 0;
  try {
    var token = getAccessToken();
    var invoices = fetchInvoicesRange(token, todayStart, todayEnd);
    kiotvietCount = invoices.length;
  } catch (e) {
    Logger.log('Reconciliation KiotViet query failed: ' + e.toString());
  }
  var sheetCount = 0;
  try {
    var ym = Utilities.formatDate(now, tz, 'yyyy-MM');
    var root = DriveApp.getFoldersByName('KiotViet-HoaDon');
    if (root.hasNext()) {
      var yf = root.next().getFoldersByName(ym.substring(0,4));
      if (yf.hasNext()) {
        var mf = yf.next().getFoldersByName(ym.substring(5));
        if (mf.hasNext()) {
          var files = mf.next().getFilesByName('HoaDon_' + ym);
          if (files.hasNext()) {
            var sh = SpreadsheetApp.open(files.next()).getSheetByName('Invoices');
            var lastRow = sh.getLastRow();
            if (lastRow >= 2) {
              var dateVals = sh.getRange(2, 3, lastRow - 1, 1).getDisplayValues();
              for (var i = 0; i < dateVals.length; i++) {
                var dStr = String(dateVals[i][0] || '').substring(0, 10);
                if (dStr === todayStr) sheetCount++;
              }
            }
          }
        }
      }
    }
  } catch (e) {
    Logger.log('Reconciliation Sheets query failed: ' + e.toString());
  }
  var lastSync = PropertiesService.getScriptProperties().getProperty('LAST_SYNC') || '';
  return {
    date: todayStr,
    kiotvietCount: kiotvietCount,
    sheetCount: sheetCount,
    difference: kiotvietCount - sheetCount,
    lastSync: lastSync
  };
}

