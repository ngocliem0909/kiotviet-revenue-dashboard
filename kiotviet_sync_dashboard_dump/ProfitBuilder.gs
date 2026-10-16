/**
 * Build/refresh the ProfitSummary sheet from ProductMonthly.
 * Aggregates 61k+ product-month rows into ~130 year-month periods.
 *
 * ProfitSummary columns: year | month | revenue | grossProfit | revWithCost | updatedAt
 */
function buildProfitSummary() {
  var ss = getSummarySpreadsheet();
  var tz = 'Asia/Ho_Chi_Minh';
  var pm = ss.getSheetByName('ProductMonthly');
  if (!pm || pm.getLastRow() < 2) {
    Logger.log('ProductMonthly empty or missing, skipping ProfitSummary build');
    return;
  }
  var lastRow = pm.getLastRow();
  var vals = pm.getRange(2, 1, lastRow - 1, 8).getValues();
  var agg = {};
  for (var i = 0; i < vals.length; i++) {
    var y = String(vals[i][0]);
    var m = String(vals[i][1]).padStart(2, '0');
    var key = y + '-' + m;
    var revenue = Number(vals[i][5]) || 0;
    var costPerUnit = Number(vals[i][6]) || 0;
    var grossProfit = Number(vals[i][7]) || 0;
    if (!agg[key]) { agg[key] = { revenue: 0, grossProfit: 0, revWithCost: 0 }; }
    agg[key].revenue += revenue;
    agg[key].grossProfit += grossProfit;
    if (costPerUnit > 0) { agg[key].revWithCost += revenue; }
  }
  var now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
  var rows = [];
  var keys = Object.keys(agg).sort();
  for (var k = 0; k < keys.length; k++) {
    var parts = keys[k].split('-');
    rows.push([parts[0], parts[1], Math.round(agg[keys[k]].revenue), Math.round(agg[keys[k]].grossProfit), Math.round(agg[keys[k]].revWithCost), now]);
  }
  var ps = ss.getSheetByName('ProfitSummary');
  if (!ps) { ps = ss.insertSheet('ProfitSummary'); }
  ps.clear();
  ps.getRange(1, 1, 1, 6).setValues([['year', 'month', 'revenue', 'grossProfit', 'revWithCost', 'updatedAt']]);
  if (rows.length > 0) { ps.getRange(2, 1, rows.length, 6).setValues(rows); }
  Logger.log('ProfitSummary rebuilt: %d periods from %d ProductMonthly rows', rows.length, vals.length);
}
