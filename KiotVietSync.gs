/**
 * ==============================================================================
 * MODULE KẾT NỐI KIOTVIET PUBLIC API & ĐỒNG BỘ DỮ LIỆU TỰ ĐỘNG (L&T Analytics)
 * ==============================================================================
 */

const ROOT_FOLDER_NAME = 'KiotViet-HoaDon';
const INVOICES_TAB_NAME = 'Invoices';
const INVOICE_COLUMNS = [
  'id','code','purchaseDate','branchName','soldByName','customerName',
  'total','totalPayment','status','description','data','pageSize','currentItem',
  'statusValue','branchId','customerId','_source','_reconciliation','_type','_differences'
];

/**
 * Đọc cấu hình KiotViet từ Script Properties
 */
function getKiotConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    clientId: props.getProperty('KIOT_CLIENT_ID') || '',
    clientSecret: props.getProperty('KIOT_CLIENT_SECRET') || '',
    retailer: props.getProperty('KIOT_RETAILER') || 'leeandteevn'
  };
}

/**
 * Cài đặt thông tin xác thực KiotViet API
 */
function setKiotCredentials(clientId, clientSecret, retailer) {
  const props = PropertiesService.getScriptProperties();
  if (clientId) props.setProperty('KIOT_CLIENT_ID', clientId.trim());
  if (clientSecret) props.setProperty('KIOT_CLIENT_SECRET', clientSecret.trim());
  if (retailer) props.setProperty('KIOT_RETAILER', retailer.trim());
  Logger.log('Đã lưu cấu hình KiotViet API thành công.');
  return { success: true, message: 'Đã lưu cấu hình KiotViet API' };
}

/**
 * Lấy Access Token từ KiotViet OAuth2
 */
function getAccessToken() {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty('KIOT_TOKEN');
  const expiry = parseInt(props.getProperty('KIOT_TOKEN_EXP') || '0', 10);
  if (cached && Date.now() < expiry) {
    return cached;
  }

  const cfg = getKiotConfig_();
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error('Chưa cấu hình KIOT_CLIENT_ID hoặc KIOT_CLIENT_SECRET trong Script Properties');
  }

  const resp = UrlFetchApp.fetch('https://id.kiotviet.vn/connect/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: 'PublicApi.Access'
    },
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error('Lấy token KiotViet thất bại (' + resp.getResponseCode() + '): ' + resp.getContentText().substring(0, 200));
  }

  const data = JSON.parse(resp.getContentText());
  props.setProperty('KIOT_TOKEN', data.access_token);
  // Cache token 23 giờ
  props.setProperty('KIOT_TOKEN_EXP', String(Date.now() + 23 * 3600 * 1000));
  return data.access_token;
}

/**
 * Kiểm tra kết nối KiotViet API
 */
function testKiotConnection() {
  try {
    const token = getAccessToken();
    const cfg = getKiotConfig_();
    const resp = UrlFetchApp.fetch('https://public.kiotapi.com/invoices?pageSize=1', {
      headers: {
        'Retailer': cfg.retailer,
        'Authorization': 'Bearer ' + token
      },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() === 200) {
      const data = JSON.parse(resp.getContentText());
      return {
        success: true,
        message: 'Kết nối KiotViet API thành công!',
        totalInvoices: data.total || 0,
        retailer: cfg.retailer
      };
    } else {
      return {
        success: false,
        message: 'Lỗi Kiot API (' + resp.getResponseCode() + '): ' + resp.getContentText().substring(0, 150)
      };
    }
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Hàm đồng bộ tự động hàng giờ (syncHourly)
 */
function syncHourly() {
  const props = PropertiesService.getScriptProperties();
  const lastSyncStr = props.getProperty('LAST_SYNC') || Utilities.formatDate(new Date(Date.now() - 2 * 3600 * 1000), 'Asia/Ho_Chi_Minh', "yyyy-MM-dd'T'HH:mm:ss");
  const lastSync = new Date(lastSyncStr);
  const now = new Date();

  // Chia theo chunk tối đa 2 giờ để tránh timeout 6 phút của Apps Script
  let syncEnd = now;
  const maxChunkMs = 2 * 60 * 60 * 1000;
  if (now.getTime() - lastSync.getTime() > maxChunkMs) {
    syncEnd = new Date(lastSync.getTime() + maxChunkMs);
    Logger.log('Syncing chunk từ %s đến %s', lastSync.toISOString(), syncEnd.toISOString());
  } else {
    Logger.log('Sync từ %s đến %s', lastSync.toISOString(), syncEnd.toISOString());
  }

  try {
    const token = getAccessToken();
    const invoices = fetchInvoicesRange(token, lastSync.toISOString(), syncEnd.toISOString());
    Logger.log('KiotViet trả về: %d hóa đơn', invoices.length);

    if (invoices.length > 0) {
      upsertToMonthlySheets(invoices);
      try {
        refreshCurrentSummary_();
      } catch (sumErr) {
        Logger.log('Cập nhật summary lỗi nhẹ: ' + sumErr.toString());
      }
    }

    props.setProperty('LAST_SYNC', syncEnd.toISOString());
    props.setProperty('LAST_SYNC_SUCCESS_TIME', Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss'));
    props.setProperty('LAST_SYNC_COUNT', String(invoices.length));
    props.deleteProperty('LAST_SYNC_ERROR');
    Logger.log('Đồng bộ KiotViet thành công. LAST_SYNC=%s', syncEnd.toISOString());
    return { success: true, count: invoices.length, syncEnd: syncEnd.toISOString() };
  } catch (e) {
    Logger.log('Lỗi syncHourly: %s', e.toString());
    props.setProperty('LAST_SYNC_ERROR', e.toString());
    throw e;
  }
}

/**
 * Lấy danh sách hóa đơn trong khoảng thời gian từ KiotViet API
 */
function fetchInvoicesRange(token, fromDate, toDate) {
  const cfg = getKiotConfig_();
  const all = [];
  let currentItem = 0;
  const pageSize = 100;
  const maxRetries = 3;

  while (true) {
    const url = 'https://public.kiotapi.com/invoices?' +
      'pageSize=' + pageSize +
      '&currentItem=' + currentItem +
      '&fromPurchaseDate=' + encodeURIComponent(fromDate) +
      '&toPurchaseDate=' + encodeURIComponent(toDate);

    let resp = null;
    let success = false;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        resp = UrlFetchApp.fetch(url, {
          headers: { 'Retailer': cfg.retailer, 'Authorization': 'Bearer ' + token },
          muteHttpExceptions: true
        });
        if (resp.getResponseCode() === 200) {
          success = true;
          break;
        }
        throw new Error('HTTP ' + resp.getResponseCode());
      } catch (e) {
        if (attempt >= maxRetries) throw e;
        Utilities.sleep(Math.pow(2, attempt) * 2000);
      }
    }

    const data = JSON.parse(resp.getContentText());
    const batch = data.data || [];
    for (let i = 0; i < batch.length; i++) all.push(batch[i]);

    if (all.length >= (data.total || 0) || batch.length === 0) break;
    currentItem += pageSize;
    Utilities.sleep(500);
  }

  return all;
}

/**
 * Ghi đè / thêm mới hóa đơn vào các Sheet tháng tương ứng trong Google Drive
 */
function upsertToMonthlySheets(invoices) {
  const groups = {};
  invoices.forEach(inv => {
    const pd = String(inv.purchaseDate || '');
    const ym = pd.substring(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) return;
    (groups[ym] = groups[ym] || []).push(inv);
  });

  Object.keys(groups).forEach(ym => {
    const sheet = (typeof getMonthSheetDynamic_ === 'function' ? getMonthSheetDynamic_(ym) : null) || getOrCreateMonthSheet_(ym);
    if (sheet) {
      upsertRows_(sheet, groups[ym]);
      Logger.log('%s: Đã cập nhật %d hóa đơn', ym, groups[ym].length);
    }
  });
}

function getOrCreateMonthSheet_(yearMonth) {
  const parts = yearMonth.split('-');
  const year = parts[0];
  const month = parts[1];
  const root = getOrCreateFolder_(ROOT_FOLDER_NAME, null);
  const yearFolder = getOrCreateFolder_(year, root);
  const monthFolder = getOrCreateFolder_(month, yearFolder);
  const files = monthFolder.getFilesByName('HoaDon_' + yearMonth);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next()).getSheetByName(INVOICES_TAB_NAME);
  }
  const templates = root.getFilesByName('HoaDon_TEMPLATE');
  if (templates.hasNext()) {
    const copy = templates.next().makeCopy('HoaDon_' + yearMonth, monthFolder);
    return SpreadsheetApp.open(copy).getSheetByName(INVOICES_TAB_NAME);
  }
  return null;
}

function getOrCreateFolder_(name, parent) {
  let folders;
  if (parent) { folders = parent.getFoldersByName(name); }
  else { folders = DriveApp.getFoldersByName(name); }
  if (folders.hasNext()) return folders.next();
  return parent ? parent.createFolder(name) : DriveApp.createFolder(name);
}

function upsertRows_(sheet, invoices) {
  const lastRow = sheet.getLastRow();
  const idMap = {};
  let existingRows = [];

  if (lastRow > 1) {
    existingRows = sheet.getRange(2, 1, lastRow - 1, INVOICE_COLUMNS.length).getValues();
    for (let i = 0; i < existingRows.length; i++) {
      const idVal = String(existingRows[i][0]);
      if (idVal) idMap[idVal] = i;
    }
  }

  let appendCount = 0;
  let updateCount = 0;
  const newAppendRows = [];

  invoices.forEach(inv => {
    const row = invoiceToRow_(inv);
    const idKey = String(inv.id);
    if (idMap.hasOwnProperty(idKey)) {
      const idx = idMap[idKey];
      existingRows[idx] = row;
      updateCount++;
    } else {
      newAppendRows.push(row);
      appendCount++;
    }
  });

  if (updateCount > 0 && existingRows.length > 0) {
    sheet.getRange(2, 1, existingRows.length, INVOICE_COLUMNS.length).setValues(existingRows);
  }
  if (newAppendRows.length > 0) {
    const startAppendRow = sheet.getLastRow() + 1;
    sheet.getRange(startAppendRow, 1, newAppendRows.length, INVOICE_COLUMNS.length).setValues(newAppendRows);
  }

  return { totalInvoices: invoices.length, appended: appendCount, updated: updateCount };
}

function invoiceToRow_(inv) {
  let pd = String(inv.purchaseDate || '');
  if (pd.indexOf('T') > 0) pd = pd.replace('T', ' ').substring(0, 19);
  return [
    inv.id || '', inv.code || '', pd, inv.branchName || '', inv.soldByName || '',
    inv.customerName || '', inv.total || 0, inv.totalPayment || 0, inv.statusValue || '',
    inv.description || '', '', '', '', inv.statusValue || '', inv.branchId || '',
    inv.customerId || '', 'lt-analytics-sync', '', '', ''
  ];
}

/**
 * Cập nhật dòng tháng này và ngày hôm nay trong bảng KiotViet-Summary
 */
function refreshCurrentSummary_() {
  const now = new Date();
  const tz = 'Asia/Ho_Chi_Minh';
  const ym = Utilities.formatDate(now, tz, 'yyyy-MM');
  const todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const year = ym.substring(0, 4);
  const month = ym.substring(5, 7);

  const sheet = getOrCreateMonthSheet_(ym);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const vals = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  let mInv = 0, mRev = 0, mCol = 0;
  let dInv = 0, dRev = 0, dCol = 0;

  vals.forEach(r => {
    const st = String(r[8] || '');
    if (st === 'Đã hủy') return;

    const tot = Number(r[6]) || 0;
    const paid = Number(r[7]) || 0;
    const dStr = String(r[2] || '').substring(0, 10);

    mInv++;
    mRev += tot;
    mCol += paid;

    if (dStr === todayStr) {
      dInv++;
      dRev += tot;
      dCol += paid;
    }
  });

  let ss = null;
  try {
    ss = SpreadsheetApp.openById(SUMMARY_SPREADSHEET_ID);
  } catch (e) {
    Logger.log('Không thể mở Summary Sheet: ' + e.message);
    return;
  }
  const nowStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');

  // 1. Cập nhật tab Monthly
  const mSh = ss.getSheetByName('Monthly');
  if (mSh) {
    const mVals = mSh.getDataRange().getValues();
    for (let i = 1; i < mVals.length; i++) {
      if (String(mVals[i][0]) === year && String(mVals[i][1]).padStart(2, '0') === month) {
        mSh.getRange(i + 1, 3, 1, 4).setValues([[mInv, mRev, mCol, nowStr]]);
        break;
      }
    }
  }

  // 2. Cập nhật tab Daily
  const dSh = ss.getSheetByName('Daily');
  if (dSh) {
    const dVals = dSh.getDataRange().getValues();
    let updated = false;
    for (let i = 1; i < dVals.length; i++) {
      if (String(dVals[i][0]) === todayStr) {
        dSh.getRange(i + 1, 2, 1, 4).setValues([[dInv, dRev, dCol, nowStr]]);
        updated = true;
        break;
      }
    }
    if (!updated && dInv > 0) {
      dSh.appendRow([todayStr, dInv, dRev, dCol, nowStr]);
    }
  }
}

/**
 * Đối chiếu số lượng đơn KiotViet vs Google Sheet cho một khoảng thời gian
 */
function auditKiotVietAgainstSheet_(fromDateStr, toDateStr) {
  const token = getAccessToken();
  const cfg = getKiotConfig_();

  let fDate = String(fromDateStr || '2026-10-01').trim();
  let tDate = String(toDateStr || '2026-10-02').trim();
  if (fDate.length === 10) fDate += ' 00:00:00';
  if (tDate.length === 10) tDate += ' 23:59:59';

  const testFormats = [
    { from: fDate, to: tDate, label: 'space' },
    { from: fDate.replace(' ', 'T'), to: tDate.replace(' ', 'T'), label: 'ISO-T' }
  ];

  let bestData = null;
  let usedUrl = '';
  let statusLog = [];

  for (let tf of testFormats) {
    const url = 'https://public.kiotapi.com/invoices?pageSize=1' +
      '&fromPurchaseDate=' + encodeURIComponent(tf.from) +
      '&toPurchaseDate=' + encodeURIComponent(tf.to);
    try {
      const resp = UrlFetchApp.fetch(url, {
        headers: { 'Retailer': cfg.retailer, 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true
      });
      statusLog.push({ format: tf.label, code: resp.getResponseCode(), body: resp.getContentText().substring(0, 150) });
      if (resp.getResponseCode() === 200) {
        bestData = JSON.parse(resp.getContentText());
        usedUrl = url;
        break;
      }
    } catch (e) {
      statusLog.push({ format: tf.label, error: e.toString() });
    }
  }

  // Đếm số lượng hiện có trong Sheet Tháng 10
  const sh10 = (typeof getMonthSheetDynamic_ === 'function') ? getMonthSheetDynamic_('2026-10') : null;
  let sheetCounts = {};
  if (sh10 && sh10.getLastRow() > 1) {
    const vals = sh10.getRange(2, 3, sh10.getLastRow() - 1, 1).getValues();
    vals.forEach(r => {
      const ds = (typeof extractDateStr_ === 'function') ? extractDateStr_(r[0]) : String(r[0]).substring(0, 10);
      if (ds && ds >= fDate.substring(0, 10) && ds <= tDate.substring(0, 10)) {
        sheetCounts[ds] = (sheetCounts[ds] || 0) + 1;
      }
    });
  }

  return {
    success: true,
    range: { from: fDate, to: tDate },
    kiotTotal: bestData ? bestData.total : null,
    sheetCountsInTargetRange: sheetCounts,
    statusLog: statusLog
  };
}

/**
 * Backfill hóa đơn từ KiotViet API vào Google Sheet
 */
function backfillKiotVietDates_(fromDateStr, toDateStr) {
  const token = getAccessToken();
  const cfg = getKiotConfig_();

  let fDate = String(fromDateStr || '2026-10-01').trim();
  let tDate = String(toDateStr || '2026-10-02').trim();
  if (fDate.length === 10) fDate += ' 00:00:00';
  if (tDate.length === 10) tDate += ' 23:59:59';

  const allInvoices = [];
  let currentItem = 0;
  const pageSize = 100;
  let totalKiot = 0;

  while (true) {
    const url = 'https://public.kiotapi.com/invoices?' +
      'pageSize=' + pageSize +
      '&currentItem=' + currentItem +
      '&fromPurchaseDate=' + encodeURIComponent(fDate) +
      '&toPurchaseDate=' + encodeURIComponent(tDate);

    const resp = UrlFetchApp.fetch(url, {
      headers: { 'Retailer': cfg.retailer, 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) {
      throw new Error('Lỗi KiotViet API (' + resp.getResponseCode() + '): ' + resp.getContentText().substring(0, 200));
    }

    const data = JSON.parse(resp.getContentText());
    totalKiot = data.total || 0;
    const batch = data.data || [];
    for (let i = 0; i < batch.length; i++) allInvoices.push(batch[i]);

    if (allInvoices.length >= totalKiot || batch.length === 0) break;
    currentItem += pageSize;
    Utilities.sleep(250);
  }

  // Phân nhóm theo tháng
  const groups = {};
  allInvoices.forEach(inv => {
    const pd = String(inv.purchaseDate || '');
    const ym = pd.substring(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) {
      (groups[ym] = groups[ym] || []).push(inv);
    }
  });

  const upsertStats = {};
  Object.keys(groups).forEach(ym => {
    const sheet = (typeof getMonthSheetDynamic_ === 'function' ? getMonthSheetDynamic_(ym) : null) || getOrCreateMonthSheet_(ym);
    if (sheet) {
      const stats = upsertRows_(sheet, groups[ym]);
      upsertStats[ym] = stats;
    }
  });

  try {
    refreshCurrentSummary_();
  } catch (e) {}

  // Đếm lại số lượng hóa đơn theo ngày trong tháng 10 sau khi backfill
  const sh10 = (typeof getMonthSheetDynamic_ === 'function') ? getMonthSheetDynamic_('2026-10') : null;
  const postCounts = {};
  if (sh10 && sh10.getLastRow() > 1) {
    const vals = sh10.getRange(2, 3, sh10.getLastRow() - 1, 1).getValues();
    vals.forEach(r => {
      const ds = (typeof extractDateStr_ === 'function') ? extractDateStr_(r[0]) : String(r[0]).substring(0, 10);
      if (ds && ds >= fDate.substring(0, 10) && ds <= tDate.substring(0, 10)) {
        postCounts[ds] = (postCounts[ds] || 0) + 1;
      }
    });
  }

  return {
    success: true,
    range: { from: fDate, to: tDate },
    kiotTotal: totalKiot,
    invoicesFetched: allInvoices.length,
    upsertStats: upsertStats,
    postCounts: postCounts
  };
}
