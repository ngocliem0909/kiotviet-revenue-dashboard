/**
 * KiotViet Summary tables — pre-aggregated revenue data for fast dashboard loads.
 *
 * Spreadsheet: KiotViet-Summary (in KiotViet-HoaDon root folder)
 *   Tab "Monthly": year | month | invoices | revenue | collected | updated_at
 *   Tab "Daily":   date | invoices | revenue | collected | updated_at
 *
 * refreshSummary() runs after each hourly sync (incremental: current month + today).
 * backfillSummary() is one-time: recompute all history from monthly sheets.
 */

var SUMMARY_SHEET_ID = '1FrWL8e_7LAFhjL7at915i9CKt6t87NzXKFLQ9j_V-uo';

function getSummarySpreadsheet() {
  return SpreadsheetApp.openById(SUMMARY_SHEET_ID);
}

/**
 * Recompute totals for one YYYY-MM from its monthly sheet.
 * Returns {invoices, revenue, collected} or null if sheet missing.
 */
function computeMonthTotals(yearMonth) {
  var rows = readMonthRows(yearMonth);
  if (!rows.length) return { invoices: 0, revenue: 0, collected: 0 };
  var inv = 0, rev = 0, col = 0;
  rows.forEach(function (r) {
    inv++;
    rev += Number(r.total) || 0;
    col += Number(r.totalPayment) || 0;
  });
  return { invoices: inv, revenue: Math.round(rev), collected: Math.round(col) };
}

/**
 * Recompute daily totals for one YYYY-MM-DD from its monthly sheet.
 */
function computeDayTotals(dateStr) {
  var ym = dateStr.substring(0, 7);
  var rows = readMonthRows(ym);
  var inv = 0, rev = 0, col = 0;
  rows.forEach(function (r) {
    if (String(r.purchaseDate || '').substring(0, 10) === dateStr) {
      inv++;
      rev += Number(r.total) || 0;
      col += Number(r.totalPayment) || 0;
    }
  });
  return { invoices: inv, revenue: Math.round(rev), collected: Math.round(col) };
}

/**
 * Upsert a row into Monthly tab keyed by (year, month).
 */
function upsertMonthlyRow(year, month, totals) {
  var sh = getSummarySpreadsheet().getSheetByName('Monthly');
  var vals = sh.getDataRange().getValues();
  var now = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss');
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(year) && String(vals[i][1]).padStart(2, '0') === String(month).padStart(2, '0')) {
      sh.getRange(i + 1, 3, 1, 4).setValues([[totals.invoices, totals.revenue, totals.collected, now]]);
      return;
    }
  }
  sh.appendRow([year, String(month).padStart(2, '0'), totals.invoices, totals.revenue, totals.collected, now]);
}

/**
 * Upsert a row into Daily tab keyed by date.
 */
function upsertDailyRow(dateStr, totals) {
  var sh = getSummarySpreadsheet().getSheetByName('Daily');
  var vals = sh.getDataRange().getValues();
  var now = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss');
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).substring(0, 10) === dateStr) {
      sh.getRange(i + 1, 2, 1, 4).setValues([[totals.invoices, totals.revenue, totals.collected, now]]);
      return;
    }
  }
  sh.appendRow([dateStr, totals.invoices, totals.revenue, totals.collected, now]);
}

/**
 * Incremental refresh: current month + today. Called after each hourly sync.
 */
function refreshSummary() {
  var now = new Date();
  var tz = 'Asia/Ho_Chi_Minh';
  var ym = Utilities.formatDate(now, tz, 'yyyy-MM');
  var todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var parts = ym.split('-');

  var mt = computeMonthTotals(ym);
  upsertMonthlyRow(parts[0], parts[1], mt);

  var dt = computeDayTotals(todayStr);
  upsertDailyRow(todayStr, dt);

  console.log('Summary refreshed for ' + ym + ' / ' + todayStr);
}

/**
 * One-time backfill: recompute Monthly + Daily for all history.
 * Run manually once. Takes a few minutes.
 */
function backfillSummary() {
  var root = DriveApp.getFoldersByName('KiotViet-HoaDon');
  if (!root.hasNext()) return;
  var yearIt = root.next().getFolders();
  var monthsDone = 0, daysDone = 0;
  while (yearIt.hasNext()) {
    var yf = yearIt.next();
    var yName = yf.getName();
    if (!/^\d{4}$/.test(yName)) continue;
    var mIt = yf.getFolders();
    while (mIt.hasNext()) {
      var mf = mIt.next();
      var mName = mf.getName();
      if (!/^\d{2}$/.test(mName)) continue;
      var ym = yName + '-' + mName;
      try {
        var mt = computeMonthTotals(ym);
        if (mt.invoices > 0) {
          upsertMonthlyRow(yName, mName, mt);
          monthsDone++;
        }
        // Daily rows for this month
        var rows = readMonthRows(ym);
        var byDay = {};
        rows.forEach(function (r) {
          var d = String(r.purchaseDate || '').substring(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
          if (!byDay[d]) byDay[d] = { invoices: 0, revenue: 0, collected: 0 };
          byDay[d].invoices++;
          byDay[d].revenue += Number(r.total) || 0;
          byDay[d].collected += Number(r.totalPayment) || 0;
        });
        Object.keys(byDay).forEach(function (d) {
          var t = byDay[d];
          t.revenue = Math.round(t.revenue);
          t.collected = Math.round(t.collected);
          upsertDailyRow(d, t);
          daysDone++;
        });
        console.log('Backfilled ' + ym + ': ' + mt.invoices + ' invoices');
      } catch (e) {
        console.error('Failed ' + ym + ': ' + e.message);
      }
    }
  }
  console.log('Summary backfill done: ' + monthsDone + ' months, ' + daysDone + ' days');
}

/* ---------- Dashboard readers (fast: summary tables only) ---------- */

function getYearlySummaryFast(year) {
  var sh = getSummarySpreadsheet().getSheetByName('Monthly');
  var vals = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(year)) {
      out.push({
        month: String(vals[i][1]).padStart(2, '0'),
        invoices: Number(vals[i][2]) || 0,
        revenue: Number(vals[i][3]) || 0,
        collected: Number(vals[i][4]) || 0
      });
    }
  }
  out.sort(function (a, b) { return a.month < b.month ? -1 : 1; });
  return out;
}

function getDailyRevenueFast(days) {
  days = Math.min(days || 30, 90);
  var sh = getSummarySpreadsheet().getSheetByName('Daily');
  var vals = sh.getDataRange().getValues();
  // Build map date -> row (take last occurrence)
  var byDate = {};
  for (var i = 1; i < vals.length; i++) {
    var d = String(vals[i][0]).substring(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      byDate[d] = {
        revenue: Number(vals[i][3]) || 0,
        invoices: Number(vals[i][2]) || 0
      };
    }
  }
  var out = [];
  var today = new Date();
  for (var k = days - 1; k >= 0; k--) {
    var dt = new Date(today);
    dt.setDate(dt.getDate() - k);
    var key = Utilities.formatDate(dt, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    out.push({
      date: key,
      revenue: (byDate[key] || {}).revenue || 0,
      invoices: (byDate[key] || {}).invoices || 0
    });
  }
  return out;
}

function getMonthSummaryFast(yearMonth) {
  var parts = yearMonth.split('-');
  var sh = getSummarySpreadsheet().getSheetByName('Monthly');
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === parts[0] &&
        String(vals[i][1]).padStart(2, '0') === parts[1]) {
      return {
        revenue: Number(vals[i][3]) || 0,
        invoices: Number(vals[i][2]) || 0,
        collected: Number(vals[i][4]) || 0
      };
    }
  }
  return { revenue: 0, invoices: 0, collected: 0 };
}

/**
 * Single-call dashboard init: years + yearly summary + 30-day revenue.
 * Combined with localStorage cache on the client for near-instant loads.
 */
function getDashboardInit() {
  var years = getAvailableYears();
  var year = years.length ? years[0] : '';
  var yd = year ? getYearDataWithComparison(year) : { summary: [], comparison: null };
  // Include profit in the same call so all cards render together (no lag)
  var profit = null;
  if (year && yd.summary && yd.summary.length) {
    var months = yd.summary.map(function(r) { return r.month; });
    try { profit = getProfitWithComparison(year, months); } catch (e) { profit = null; }
  }
  return {
    years: years,
    year: year,
    summary: yd.summary,
    comparison: yd.comparison,
    daily: getDailyRevenue(30),
    profit: profit
  };
}

/**
 * Totals for a year, optionally restricted to specific months ('MM' array).
 * Read from the Monthly summary tab (fast).
 */
function getPeriodTotals(year, months) {
  var sh = getSummarySpreadsheet().getSheetByName('Monthly');
  var vals = sh.getDataRange().getValues();
  var inv = 0, rev = 0, col = 0;
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) !== String(year)) continue;
    var m = String(vals[i][1]).padStart(2, '0');
    if (months && months.indexOf(m) < 0) continue;
    inv += Number(vals[i][2]) || 0;
    rev += Number(vals[i][3]) || 0;
    col += Number(vals[i][4]) || 0;
  }
  return { invoices: inv, revenue: rev, collected: col };
}

function monthsWithData(year) {
  var sh = getSummarySpreadsheet().getSheetByName('Monthly');
  var vals = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(year) && (Number(vals[i][2]) || 0) > 0) {
      out.push(String(vals[i][1]).padStart(2, '0'));
    }
  }
  return out;
}

/**
 * Year view with same-period-last-year comparison.
 * Comparison uses only months present in BOTH years (true "cung ky").
 */
function getYearDataWithComparison(year) {
  var summary = getYearlySummary(year);
  var prevYear = String(Number(year) - 1);
  var curMonths = summary.map(function (r) { return r.month; });
  var prevMonths = monthsWithData(prevYear);
  var common = curMonths.filter(function (m) { return prevMonths.indexOf(m) >= 0; });
  var profit = null;
  if (curMonths.length) {
    try { profit = getProfitWithComparison(year, curMonths); } catch (e) { profit = null; }
  }
  return {
    summary: summary,
    comparison: getPeriodTotals(prevYear, common),
    profit: profit
  };
}

function getMonthDataWithComparison(yearMonth) {
  var p = yearMonth.split('-');
  var prevYear = String(Number(p[0]) - 1);
  return {
    current: getMonthSummary(yearMonth),
    comparison: getPeriodTotals(prevYear, [p[1]])
  };
}

