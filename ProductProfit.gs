/**
 * ==============================================================================
 * MODULE THỐNG KÊ SẢN PHẨM & GIÁ VỐN / LỢI NHUẬN GỘP (L&T Analytics)
 * ==============================================================================
 */

function getSummarySpreadsheet_() {
  try {
    return SpreadsheetApp.openById(SUMMARY_SPREADSHEET_ID);
  } catch (e) {
    try {
      return SpreadsheetApp.getActiveSpreadsheet();
    } catch (e2) {
      Logger.log("getSummarySpreadsheet_ warning: " + e.message);
      return null;
    }
  }
}

/**
 * Lấy danh sách Top Sản Phẩm Bán Chạy Nhất từ KiotViet-Summary
 */
function getTopSellingProducts(year, month, limit) {
  limit = limit || 10;
  const ss = getSummarySpreadsheet_();
  if (!ss) return [];
  
  // Ưu tiên đọc từ ProductCurrent nếu xem tháng hiện tại
  let targetTab = 'ProductCurrent';
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;

  if (year && month && (Number(year) !== curY || Number(month) !== curM)) {
    targetTab = 'ProductMonthly';
  }

  const sh = ss.getSheetByName(targetTab);
  if (!sh || sh.getLastRow() < 2) return [];

  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
  const products = [];

  const yStr = year ? String(year) : String(curY);
  const mStr = month ? String(month).padStart(2, '0') : String(curM).padStart(2, '0');

  for (let i = 0; i < vals.length; i++) {
    const rowY = String(vals[i][0]);
    const rowM = String(vals[i][1]).padStart(2, '0');

    if (rowY === yStr && (!month || rowM === mStr)) {
      products.push({
        code: String(vals[i][2] || ''),
        name: String(vals[i][3] || ''),
        qty: Number(vals[i][4]) || 0,
        revenue: Number(vals[i][5]) || 0,
        costPerUnit: Number(vals[i][6]) || 0,
        grossProfit: Number(vals[i][7]) || 0
      });
    }
  }

  // Sắp xếp theo Doanh thu giảm dần
  products.sort((a, b) => b.revenue - a.revenue);
  return products.slice(0, limit);
}

/**
 * Lấy tổng quan Lợi Nhuận Gộp & Biên Lợi Nhuận từ ProfitSummary
 */
function getProfitOverview(year, month) {
  const ss = getSummarySpreadsheet_();
  if (!ss) {
    return { revenue: 0, grossProfit: 0, marginPct: 0, revWithCost: 0 };
  }
  const sh = ss.getSheetByName('ProfitSummary');
  if (!sh || sh.getLastRow() < 2) {
    return { revenue: 0, grossProfit: 0, marginPct: 0, revWithCost: 0 };
  }

  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  let totRev = 0, totProfit = 0, totWithCost = 0;

  for (let i = 0; i < vals.length; i++) {
    const rowY = String(vals[i][0]);
    const rowM = String(vals[i][1]).padStart(2, '0');

    if (year && rowY !== String(year)) continue;
    if (month && rowM !== String(month).padStart(2, '0')) continue;

    totRev += Number(vals[i][2]) || 0;
    totProfit += Number(vals[i][3]) || 0;
    totWithCost += Number(vals[i][4]) || 0;
  }

  const marginPct = totRev > 0 ? ((totProfit / totRev) * 100).toFixed(1) : 0;
  const coveragePct = totRev > 0 ? ((totWithCost / totRev) * 100).toFixed(1) : 0;

  return {
    revenue: totRev,
    grossProfit: totProfit,
    marginPct: Number(marginPct),
    coveragePct: Number(coveragePct)
  };
}

/**
 * Lấy thông tin Tồn Kho mới nhất từ InventoryDaily
 */
function getInventoryOverview() {
  const ss = getSummarySpreadsheet_();
  if (!ss) return null;
  const sh = ss.getSheetByName('InventoryDaily');
  if (!sh || sh.getLastRow() < 2) {
    return null;
  }
  const lastRow = sh.getLastRow();
  const r = sh.getRange(lastRow, 1, 1, 7).getValues()[0];
  return {
    date: String(r[0] || ''),
    skuCount: Number(r[1]) || 0,
    totalOnHand: Number(r[2]) || 0,
    totalValue: Number(r[3]) || 0,
    lowStockCount: Number(r[4]) || 0,
    outOfStockCount: Number(r[5]) || 0,
    updatedAt: String(r[6] || '')
  };
}

/**
 * Đồng bộ danh mục sản phẩm và giá vốn từ KiotViet API
 */
function syncProductsAndInventory() {
  const token = getAccessToken();
  const cfg = getKiotConfig_();
  const all = [];
  let currentItem = 0;
  const pageSize = 100;

  while (true) {
    const url = 'https://public.kiotapi.com/products?pageSize=' + pageSize +
      '&currentItem=' + currentItem + '&includeInventory=true';
    const resp = UrlFetchApp.fetch(url, {
      headers: { 'Retailer': cfg.retailer, 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) {
      throw new Error('Kiot Products API lỗi ' + resp.getResponseCode() + ': ' + resp.getContentText().substring(0, 150));
    }
    const data = JSON.parse(resp.getContentText());
    const batch = data.data || [];
    for (let i = 0; i < batch.length; i++) all.push(batch[i]);
    if (all.length >= (data.total || 0) || batch.length === 0) break;
    currentItem += pageSize;
    Utilities.sleep(1000);
  }

  Logger.log('Đã tải %d sản phẩm từ KiotViet', all.length);

  const tz = 'Asia/Ho_Chi_Minh';
  const nowStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
  const todayStr = nowStr.substring(0, 10);

  const prodRows = [['productId', 'productCode', 'productName', 'cost', 'updatedAt']];
  const invRows = [['productCode', 'productName', 'branchName', 'onHand', 'cost', 'stockValue', 'updatedAt']];

  let totalOnHand = 0, totalValue = 0, lowStock = 0, outOfStock = 0;

  all.forEach(p => {
    let cost = 0;
    const invs = p.inventories || [];
    for (let i = 0; i < invs.length; i++) {
      if (invs[i].cost !== null && invs[i].cost !== undefined) {
        cost = Number(invs[i].cost) || 0;
        break;
      }
    }

    prodRows.push([p.id || '', p.code || '', p.name || '', cost, nowStr]);

    invs.forEach(inv => {
      const onHand = Number(inv.onHand) || 0;
      const invCost = (inv.cost !== null && inv.cost !== undefined) ? Number(inv.cost) : cost;
      const stockVal = onHand * invCost;
      totalOnHand += onHand;
      totalValue += stockVal;
      if (onHand <= 0) outOfStock++;
      else if (onHand < 5) lowStock++;

      invRows.push([p.code || '', p.name || '', inv.branchName || '', onHand, invCost, stockVal, nowStr]);
    });
  });

  const ss = getSummarySpreadsheet_();
  if (!ss) throw new Error('Không thể mở Spreadsheet để ghi sản phẩm');
  
  // Ghi tab Products
  let pSh = ss.getSheetByName('Products');
  if (!pSh) pSh = ss.insertSheet('Products');
  pSh.clear();
  pSh.getRange(1, 1, prodRows.length, prodRows[0].length).setValues(prodRows);

  // Ghi tab Inventory
  let iSh = ss.getSheetByName('Inventory');
  if (!iSh) iSh = ss.insertSheet('Inventory');
  iSh.clear();
  iSh.getRange(1, 1, invRows.length, invRows[0].length).setValues(invRows);

  // Ghi tab InventoryDaily
  let idSh = ss.getSheetByName('InventoryDaily');
  if (!idSh) {
    idSh = ss.insertSheet('InventoryDaily');
    idSh.getRange(1, 1, 1, 7).setValues([['date', 'skuCount', 'totalOnHand', 'totalValue', 'lowStockCount', 'outOfStockCount', 'updatedAt']]);
  }
  idSh.appendRow([todayStr, all.length, totalOnHand, Math.round(totalValue), lowStock, outOfStock, nowStr]);

  Logger.log('Đồng bộ Sản Phẩm & Tồn Kho hoàn tất. Tổng SKU: %d, Giá trị kho: %d', all.length, Math.round(totalValue));
  return { success: true, skuCount: all.length, totalValue: Math.round(totalValue) };
}
