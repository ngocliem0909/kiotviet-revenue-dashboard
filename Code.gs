/**
 * ==============================================================================
 * HỆ THỐNG BÁO CÁO DOANH THU & ĐƠN HÀNG KIOTVIET (CHẾ ĐỘ CHỈ ĐỌC - READ ONLY)
 * Dữ liệu thực tế từ HoaDon_2026-10 & KiotViet-Summary
 * Tuyệt đối KHÔNG thay đổi, ghi đè hay xóa dữ liệu nguồn
 * ==============================================================================
 */

// 1. ID Google Sheet hóa đơn tháng 10/2026 & tháng 09/2026
const INVOICES_2026_10_ID = '14e0fIJYN28HEJkBKpmo6rSVhb4nd4puQz0niA4GRg-M';
const INVOICES_2026_09_ID = '1ScVtrPPfiliyukNoF_c5tROABMSTIPQAPON6-uhJJlY';

// 2. ID Google Sheet tổng hợp KiotViet (Lịch sử các tháng)
const SUMMARY_SPREADSHEET_ID = '1FrWL8e_7LAFhjL7at915i9CKt6t87NzXKFLQ9j_V-uo';

// Danh sách email được phép truy cập hệ thống
const ALLOWED_EMAILS = [
  'lee.famn@gmail.com',
  'ngocliem0909@gmail.com',
  'zoolnguyen@gmail.com',
  'duong.nguyen@leeandtee.com'
];

/**
 * Kiểm tra quyền của tài khoản hiện tại
 */
function isUserAuthorized_() {
  var email = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) return false;
  return ALLOWED_EMAILS.indexOf(email) !== -1;
}

/**
 * Tự động tạo Menu điều khiển khi mở Google Sheet
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('📊 L&T Analytics')
      .addItem('⚡ Kích hoạt tất cả Triggers (1-Click)', 'setupAllTriggers')
      .addSeparator()
      .addItem('🔄 Đồng bộ KiotViet ngay', 'syncHourly')
      .addItem('📱 Gửi thử báo cáo Telegram', 'testTelegramReport')
      .addItem('📦 Cập nhật Sản phẩm & Tồn kho', 'syncProductsAndInventory')
      .addSeparator()
      .addItem('🔑 Cài đặt KiotViet API (Client ID / Secret)', 'promptSetKiotCredentials')
      .addItem('🤖 Cài đặt Telegram Bot (Token / Chat ID)', 'promptSetTelegramCredentials')
      .addSeparator()
      .addItem('❌ Xóa tất cả Triggers', 'removeAllTriggers')
      .addToUi();
  } catch (e) {
    Logger.log('onOpen notice: ' + e.message);
  }
}

/**
 * Hộp thoại cài đặt nhanh thông tin KiotViet API từ Google Sheet
 */
function promptSetKiotCredentials() {
  var ui = SpreadsheetApp.getUi();
  var cid = ui.prompt('Cài đặt KiotViet API (Bước 1/3)', 'Nhập KIOT_CLIENT_ID của bạn:', ui.ButtonSet.OK_CANCEL);
  if (cid.getSelectedButton() !== ui.Button.OK || !cid.getResponseText().trim()) return;
  var sec = ui.prompt('Cài đặt KiotViet API (Bước 2/3)', 'Nhập KIOT_CLIENT_SECRET:', ui.ButtonSet.OK_CANCEL);
  if (sec.getSelectedButton() !== ui.Button.OK || !sec.getResponseText().trim()) return;
  var ret = ui.prompt('Cài đặt KiotViet API (Bước 3/3)', 'Nhập Mã gian hàng KiotViet (Mặc định: leeandteevn):', ui.ButtonSet.OK_CANCEL);
  var retVal = (ret.getSelectedButton() === ui.Button.OK && ret.getResponseText().trim()) ? ret.getResponseText().trim() : 'leeandteevn';
  setKiotCredentials(cid.getResponseText().trim(), sec.getResponseText().trim(), retVal);
  ui.alert('Thành công', 'Đã lưu cấu hình KiotViet API vào Script Properties!', ui.ButtonSet.OK);
}

/**
 * Hộp thoại cài đặt nhanh Telegram Bot Token từ Google Sheet
 */
function promptSetTelegramCredentials() {
  var ui = SpreadsheetApp.getUi();
  var tok = ui.prompt('Cài đặt Telegram Bot (Bước 1/2)', 'Nhập TELEGRAM_BOT_TOKEN (do @BotFather cấp):', ui.ButtonSet.OK_CANCEL);
  if (tok.getSelectedButton() !== ui.Button.OK || !tok.getResponseText().trim()) return;
  var chat = ui.prompt('Cài đặt Telegram Bot (Bước 2/2)', 'Nhập TELEGRAM_CHAT_ID (Mặc định: 530892002):', ui.ButtonSet.OK_CANCEL);
  var chatVal = (chat.getSelectedButton() === ui.Button.OK && chat.getResponseText().trim()) ? chat.getResponseText().trim() : '530892002';
  setTelegramCredentials(tok.getResponseText().trim(), chatVal);
  ui.alert('Thành công', 'Đã lưu cấu hình Telegram Bot vào Script Properties!', ui.ButtonSet.OK);
}

/**
 * Khởi tạo Web App (doGet) kèm xác thực tài khoản Google
 */
function doGet(e) {
  // Hỗ trợ API JSON cho các ứng dụng ngoài (như GitHub Pages, website độc lập)
  if (e && e.parameter && (e.parameter.api === 'history' || e.parameter.type === 'history')) {
    var yearly = getYearlySummary_();
    return ContentService.createTextOutput(JSON.stringify(yearly))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (e && e.parameter && (e.parameter.api === '1' || e.parameter.format === 'json')) {
    var fresh = getFreshOctoberRecords();
    return ContentService.createTextOutput(JSON.stringify(fresh))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 1. API Top Sản Phẩm Bán Chạy
  if (e && e.parameter && e.parameter.api === 'products') {
    try {
      var prods = getTopSellingProducts(e.parameter.year, e.parameter.month, Number(e.parameter.limit || 15));
      return ContentService.createTextOutput(JSON.stringify({ success: true, count: prods.length, products: prods }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message, products: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 2. API Tổng quan Lợi Nhuận Gộp & Biên Lợi Nhuận
  if (e && e.parameter && e.parameter.api === 'profit') {
    try {
      var prof = getProfitOverview(e.parameter.year, e.parameter.month);
      return ContentService.createTextOutput(JSON.stringify({ success: true, profit: prof }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 3. API Thống Kê Tồn Kho
  if (e && e.parameter && e.parameter.api === 'inventory') {
    try {
      var inv = getInventoryOverview();
      return ContentService.createTextOutput(JSON.stringify({ success: true, inventory: inv }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // API Kiểm tra đối chiếu số lượng đơn KiotViet vs Google Sheet
  if (e && e.parameter && e.parameter.api === 'kiot_audit') {
    try {
      var fromDate = (e.parameter.from || '2026-10-01 00:00:00').trim();
      var toDate = (e.parameter.to || '2026-10-02 23:59:59').trim();
      var resAudit = auditKiotVietAgainstSheet_(fromDate, toDate);
      return ContentService.createTextOutput(JSON.stringify(resAudit))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // API Backfill KiotViet cho một khoảng thời gian cụ thể
  if (e && e.parameter && e.parameter.api === 'backfill') {
    try {
      var fromDate = (e.parameter.from || '2026-10-01 00:00:00').trim();
      var toDate = (e.parameter.to || '2026-10-02 23:59:59').trim();
      var resBackfill = backfillKiotVietDates_(fromDate, toDate);
      return ContentService.createTextOutput(JSON.stringify(resBackfill))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Kiểm tra quyền Quản trị cho các API tác động hệ thống
  function isAuthorizedAdminRequest_() {
    var uEmail = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    if (uEmail && ALLOWED_EMAILS.indexOf(uEmail) !== -1) return true;
    var props = PropertiesService.getScriptProperties();
    var secretToken = props.getProperty('ADMIN_SECRET_KEY');
    if (!secretToken) {
      secretToken = 'LT_SEC_' + Utilities.getUuid().replace(/-/g, '').substring(0, 16);
      props.setProperty('ADMIN_SECRET_KEY', secretToken);
    }
    var reqKey = (e && e.parameter && (e.parameter.key || e.parameter.adminKey || e.parameter.secret)) || '';
    return reqKey === secretToken;
  }

  // 4. API Trạng Thái Hệ Thống & Tự Động Hóa
  if (e && e.parameter && e.parameter.api === 'system_status') {
    try {
      var kiotCfg = getKiotConfig_();
      var props = PropertiesService.getScriptProperties();
      var triggers = getTriggersStatus();
      var triggerHandlers = triggers.map(function(t) { return t.handler; });
      var isAdmin = isAuthorizedAdminRequest_();
      var info = {
        triggers: {
          totalCount: triggers.length,
          installed: triggerHandlers,
          list: triggers
        },
        kiot: {
          configured: !!(kiotCfg.clientId && kiotCfg.clientSecret),
          retailer: kiotCfg.retailer || 'leeandteevn',
          clientId: kiotCfg.clientId || '',
          hasClientSecret: !!kiotCfg.clientSecret,
          tokenCached: !!props.getProperty('KIOT_TOKEN'),
          lastSyncTime: props.getProperty('LAST_SYNC_SUCCESS_TIME') || '',
          lastSyncCount: props.getProperty('LAST_SYNC_COUNT') || '0',
          lastError: props.getProperty('LAST_SYNC_ERROR') || null
        },
        telegram: {
          configured: !!getTelegramConfig_().token,
          chatId: getTelegramConfig_().chatId || '530892002'
        },
        isAdmin: isAdmin
      };
      if (isAdmin) {
        info.adminKey = props.getProperty('ADMIN_SECRET_KEY') || '';
      }
      var statusData = {
        success: true,
        status: info,
        triggers: info.triggers,
        kiot: info.kiot,
        telegram: info.telegram,
        adminKey: isAdmin ? (props.getProperty('ADMIN_SECRET_KEY') || '') : undefined
      };
      return ContentService.createTextOutput(JSON.stringify(statusData))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (stErr) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: stErr.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 5. API Kích hoạt gửi thử Telegram (Admin Only)
  if (e && e.parameter && e.parameter.api === 'test_telegram') {
    if (!isAuthorizedAdminRequest_()) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Yêu cầu quyền Quản trị viên hoặc Admin Secret Key.' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var resTel = testTelegramReport();
    return ContentService.createTextOutput(JSON.stringify(resTel))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 6. API Kích hoạt đồng bộ KiotViet ngay (Admin Only)
  if (e && e.parameter && e.parameter.api === 'sync_now') {
    if (!isAuthorizedAdminRequest_()) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Yêu cầu quyền Quản trị viên hoặc Admin Secret Key.' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var resSync = syncHourly();
    return ContentService.createTextOutput(JSON.stringify(resSync))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 7. API Kích hoạt cài đặt Triggers tự động (Admin Only)
  if (e && e.parameter && e.parameter.api === 'setup_triggers') {
    if (!isAuthorizedAdminRequest_()) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Yêu cầu quyền Quản trị viên hoặc Admin Secret Key.' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var resTrig = setupAllTriggers();
    return ContentService.createTextOutput(JSON.stringify(resTrig))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 8. API Lưu Cấu Hình KiotViet (Client ID / Secret / Retailer) (Admin Only)
  if (e && e.parameter && e.parameter.api === 'save_kiot_config') {
    if (!isAuthorizedAdminRequest_()) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: 'Từ chối truy cập: Yêu cầu quyền Quản trị viên hoặc Admin Secret Key.' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var cId = (e.parameter.clientId || '').trim();
    var cSec = (e.parameter.clientSecret || '').trim();
    var cRet = (e.parameter.retailer || 'leeandteevn').trim();
    if (!cId || !cSec) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: 'Thiếu Client ID hoặc Client Secret' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var resSaveK = setKiotCredentials(cId, cSec, cRet);
    return ContentService.createTextOutput(JSON.stringify(resSaveK))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 9. API Lưu Cấu Hình Telegram (Bot Token / Chat ID) (Admin Only)
  if (e && e.parameter && e.parameter.api === 'save_telegram_config') {
    if (!isAuthorizedAdminRequest_()) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: 'Từ chối truy cập: Yêu cầu quyền Quản trị viên hoặc Admin Secret Key.' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var bTok = (e.parameter.botToken || '').trim();
    var cIdTele = (e.parameter.chatId || '530892002').trim();
    if (!bTok) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: 'Thiếu Bot Token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var resSaveT = setTelegramCredentials(bTok, cIdTele);
    return ContentService.createTextOutput(JSON.stringify(resSaveT))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var userEmail = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();

  // Kiểm tra quyền truy cập: nếu có email tài khoản và không nằm trong danh sách thì chặn
  if (userEmail && ALLOWED_EMAILS.indexOf(userEmail) === -1) {
    var output = '<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Truy Cập Bị Từ Chối</title>' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<script src="https://cdn.tailwindcss.com"></script>' +
      '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700&display=swap" rel="stylesheet">' +
      '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">' +
      '</head><body class="bg-slate-100 flex items-center justify-center min-h-screen p-4" style="font-family: \'Plus Jakarta Sans\', sans-serif;">' +
      '<div class="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200 p-8 text-center">' +
      '<div class="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl border border-rose-100 shadow-sm">' +
      '<i class="fa-solid fa-user-lock"></i>' +
      '</div>' +
      '<h2 class="text-xl font-bold text-slate-900 mb-2">Quyền Truy Cập Bị Hạn Chế</h2>' +
      '<p class="text-xs text-slate-500 mb-4">Tài khoản Google đang kết nối: <br><strong class="text-slate-800 text-sm font-semibold">' + (userEmail || 'Chưa xác thực danh tính') + '</strong></p>' +
      '<div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800 mb-6 text-left">' +
      '<p class="font-bold mb-1.5 flex items-center"><i class="fa-solid fa-shield-halved mr-1.5 text-amber-600"></i> Chính sách bảo mật nội bộ:</p>' +
      '<p class="text-slate-600 mb-2">Báo cáo doanh thu KiotViet chỉ cấp quyền xem riêng cho các tài khoản sau:</p>' +
      '<ul class="space-y-1 font-mono text-[11px] text-indigo-700 bg-white/70 p-2.5 rounded-xl border border-amber-200">' +
      '<li>&bull; lee.famn@gmail.com</li>' +
      '<li>&bull; ngocliem0909@gmail.com</li>' +
      '<li>&bull; zoolnguyen@gmail.com</li>' +
      '<li>&bull; duong.nguyen@leeandtee.com</li>' +
      '</ul>' +
      '</div>' +
      '<a href="https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(ScriptApp.getService().getUrl()) + '" class="inline-flex items-center justify-center w-full px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-500/20 transition">' +
      '<i class="fa-solid fa-arrow-right-arrow-left mr-2"></i> Chuyển sang tài khoản được cấp quyền' +
      '</a>' +
      '</div></body></html>';
    return HtmlService.createHtmlOutput(output)
      .setTitle('Truy Cập Bị Từ Chối - KiotViet Analytics')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  }

  var freshOct = getFreshOctoberRecords();
  var template = HtmlService.createTemplateFromFile('Index');
  template.freshOctoberRecords = (freshOct && freshOct.success) ? freshOct.records : [];
  template.freshOctoberRecordsJson = (freshOct && freshOct.success) ? JSON.stringify(freshOct.records).replace(/<\/script/gi, '<\\/script') : '[]';
  template.currentUserEmail = userEmail || 'Ủy quyền nội bộ';
  return template.evaluate()
    .setTitle('L&T Analytics - Báo Cáo Doanh Thu KiotViet')
    .setFaviconUrl('https://ngocliem0909.github.io/kiotviet-revenue-dashboard/app-icon.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Nhận diện Kênh bán hàng từ mã đơn và ghi chú
 */
function detectSalesChannel_(code, desc) {
  code = String(code || '');
  desc = String(desc || '').toUpperCase();
  if (code.indexOf('HDTTS_') === 0 || desc.indexOf('TIKTOK') !== -1) {
    return 'TikTok Shop';
  }
  if (code.indexOf('HD_SP_') === 0 || desc.indexOf('SHOPEE') !== -1) {
    return 'Shopee';
  }
  if (desc.indexOf('ZALO') !== -1 || desc.indexOf('AFF') !== -1 || desc.indexOf('COD') !== -1) {
    return 'Zalo / Online COD';
  }
  return 'Cửa hàng trực tiếp';
}

/**
 * Chuẩn hóa trạng thái đơn hàng (Khớp 100% dữ liệu KiotViet)
 */
function normalizeStatus_(statusVal, rawStatus) {
  var s1 = String(statusVal || '').trim().toLowerCase();
  var s2 = String(rawStatus || '').trim().toLowerCase();
  if (s1.indexOf('hủy') !== -1 || s2.indexOf('cancel') !== -1 || s2 === '2') {
    return 'Đã hủy';
  }
  if (s1.indexOf('hoàn thành') !== -1 || s2.indexOf('completed') !== -1 || s2 === '1') {
    return 'Hoàn thành';
  }
  return 'Đang xử lý';
}

/**
 * Trích xuất ngày chuẩn dạng YYYY-MM-DD
 */
function extractDateStr_(val) {
  if (!val) return '';
  if (val instanceof Date) {
    // Spreadsheet có TimeZone là Etc/GMT nên các trường thời gian từ KiotViet (giờ VN)
    // được lưu dưới dạng giá trị ngày/giờ nguyên bản trong GMT.
    // Dùng Etc/GMT để trích xuất đúng ngày (YYYY-MM-DD), tránh bị cộng thêm 7 tiếng làm trôi đơn buổi tối sang ngày hôm sau!
    return Utilities.formatDate(val, 'Etc/GMT', 'yyyy-MM-dd');
  }
  var s = String(val).trim();
  if (s.length >= 10) {
    return s.substring(0, 10).replace('T', ' ');
  }
  return '';
}

/**
 * Lấy dữ liệu báo cáo (HOÀN TOÀN CHỈ ĐỌC - READ ONLY)
 */
function getRevenueReportData(filter) {
  try {
    filter = filter || {};

    var userEmail = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    if (userEmail && ALLOWED_EMAILS.indexOf(userEmail) === -1) {
      return { success: false, error: 'Tài khoản ' + userEmail + ' không có quyền truy cập dữ liệu.' };
    }

    var filterStartDate = filter.startDate ? String(filter.startDate).trim() : null;
    var filterEndDate = filter.endDate ? String(filter.endDate).trim() : null;
    var filterBranch = (filter.branch && filter.branch !== 'ALL') ? filter.branch : null;
    var filterChannel = (filter.channel && filter.channel !== 'ALL') ? filter.channel : null;
    var filterStatus = (filter.status && filter.status !== 'ALL') ? filter.status : null;

    var rawValues = [];
    var needSep = !filterStartDate || filterStartDate < '2026-10-01';
    var needOct = !filterEndDate || filterEndDate >= '2026-10-01';

    if (needOct) {
      try {
        var shOct = getMonthSheetDynamic_('2026-10');
        if (shOct) {
          var lrOct = shOct.getLastRow();
          if (lrOct > 1) {
            rawValues = rawValues.concat(shOct.getRange(2, 1, lrOct - 1, 14).getValues());
          }
        }
      } catch (eOct) {
        console.warn('Lỗi đọc sheet tháng 10: ' + eOct.message);
      }
    }

    if (needSep) {
      try {
        var shSep = getMonthSheetDynamic_('2026-09');
        if (shSep) {
          var lrSep = shSep.getLastRow();
          if (lrSep > 1) {
            rawValues = rawValues.concat(shSep.getRange(2, 1, lrSep - 1, 14).getValues());
          }
        }
      } catch (eSep) {
        console.warn('Lỗi đọc sheet tháng 9: ' + eSep.message);
      }
    }

    if (rawValues.length === 0) {
      return { success: true, empty: true, summary: {}, charts: {}, recentTransactions: [] };
    }

    var uniqueBranches = {};
    var uniqueChannels = {};
    var filteredRows = [];

    var totalRevenue = 0;
    var totalCollected = 0;
    var completedOrders = 0;
    var processingOrders = 0;
    var cancelledOrders = 0;

    var revenueByDateMap = {};
    var revenueByBranchMap = {};
    var revenueByChannelMap = {};
    var revenueBySellerMap = {};

    var minDate = '9999-99-99';
    var maxDate = '0000-00-00';

    for (var i = 0; i < rawValues.length; i++) {
      var row = rawValues[i];
      var orderCode = String(row[1] || '').trim();
      var dateRaw = row[2];
      var branchName = String(row[3] || 'Chưa xác định').trim();
      var sellerName = String(row[4] || 'Chưa gán').trim();
      var customerName = String(row[5] || 'Khách lẻ').trim();
      var total = Number(row[6]) || 0;
      var collected = Number(row[7]) || 0;
      var rawStatus = row[8];
      var description = String(row[9] || '').trim();
      var statusVal = row[13];

      if (!orderCode && !dateRaw) continue;

      var dateStr = extractDateStr_(dateRaw);
      if (dateStr) {
        if (dateStr < minDate) minDate = dateStr;
        if (dateStr > maxDate) maxDate = dateStr;
      }

      var channel = detectSalesChannel_(orderCode, description);
      var status = normalizeStatus_(statusVal, rawStatus);

      // Thu thập options cho dropdown bộ lọc
      if (branchName) uniqueBranches[branchName] = true;
      if (channel) uniqueChannels[channel] = true;

      // 1. Lọc theo Ngày (so sánh chuỗi YYYY-MM-DD chuẩn xác)
      if (filterStartDate && (!dateStr || dateStr < filterStartDate)) continue;
      if (filterEndDate && (!dateStr || dateStr > filterEndDate)) continue;

      // 2. Lọc theo Chi nhánh
      if (filterBranch && branchName !== filterBranch) continue;

      // 3. Lọc theo Kênh bán
      if (filterChannel && channel !== filterChannel) continue;

      // 4. Lọc theo Trạng thái
      if (filterStatus && status !== filterStatus) continue;

      // Phân loại đơn và tích lũy doanh số
      if (status === 'Đã hủy') {
        cancelledOrders++;
      } else {
        if (status === 'Hoàn thành') {
          completedOrders++;
        } else {
          processingOrders++;
        }

        totalRevenue += total;
        totalCollected += collected;

        // Tích lũy biểu đồ ngày
        if (dateStr) {
          revenueByDateMap[dateStr] = (revenueByDateMap[dateStr] || 0) + total;
        }

        // Tích lũy biểu đồ chi nhánh
        if (branchName) {
          revenueByBranchMap[branchName] = (revenueByBranchMap[branchName] || 0) + total;
        }

        // Tích lũy biểu đồ kênh
        if (channel) {
          revenueByChannelMap[channel] = (revenueByChannelMap[channel] || 0) + total;
        }

        // Tích lũy biểu đồ nhân viên
        if (sellerName && sellerName !== 'Chưa gán') {
          revenueBySellerMap[sellerName] = (revenueBySellerMap[sellerName] || 0) + total;
        }
      }

      filteredRows.push({
        orderCode: orderCode,
        date: dateStr,
        branch: branchName,
        seller: sellerName,
        customer: customerName,
        total: total,
        collected: collected,
        channel: channel,
        status: status
      });
    }

    var totalActiveOrders = completedOrders + processingOrders;
    var totalOrders = totalActiveOrders + cancelledOrders;
    var aov = totalActiveOrders > 0 ? Math.round(totalRevenue / totalActiveOrders) : 0;
    var completionRate = totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : 0;

    // Sắp xếp biểu đồ ngày theo thứ tự thời gian tăng dần
    var sortedDates = Object.keys(revenueByDateMap).sort();
    var chartTimeline = {
      labels: sortedDates,
      data: sortedDates.map(function(d) { return revenueByDateMap[d]; })
    };

    // Sắp xếp Top 7 Chi nhánh có doanh thu cao nhất
    var sortedBranches = Object.keys(revenueByBranchMap).map(function(b) {
      return { name: b, revenue: revenueByBranchMap[b] };
    }).sort(function(a, b) {
      return b.revenue - a.revenue;
    }).slice(0, 7);

    var chartBranch = {
      labels: sortedBranches.map(function(b) { return b.name; }),
      data: sortedBranches.map(function(b) { return b.revenue; })
    };

    // Biểu đồ Kênh bán
    var channelLabels = Object.keys(revenueByChannelMap);
    var chartChannel = {
      labels: channelLabels,
      data: channelLabels.map(function(c) { return revenueByChannelMap[c]; })
    };

    // Sắp xếp Top 7 Nhân viên bán hàng xuất sắc nhất
    var sortedSellers = Object.keys(revenueBySellerMap).map(function(s) {
      return { name: s, revenue: revenueBySellerMap[s] };
    }).sort(function(a, b) {
      return b.revenue - a.revenue;
    }).slice(0, 7);

    var chartSellers = {
      labels: sortedSellers.map(function(s) { return s.name; }),
      data: sortedSellers.map(function(s) { return s.revenue; })
    };

    // Đọc lịch sử doanh thu theo tháng từ KiotViet-Summary (năm 2026)
    var monthlySummary = get2026MonthlySummary_();

    return {
      success: true,
      dateRange: {
        min: minDate !== '9999-99-99' ? minDate : '2026-10-01',
        max: maxDate !== '0000-00-00' ? maxDate : '2026-10-16'
      },
      summary: {
        totalRevenue: totalRevenue,
        totalCollected: totalCollected,
        totalOrders: totalOrders,
        completedOrders: completedOrders,
        processingOrders: processingOrders,
        cancelledOrders: cancelledOrders,
        completionRate: Number(completionRate),
        averageOrderValue: aov
      },
      charts: {
        timeline: chartTimeline,
        branch: chartBranch,
        channel: chartChannel,
        sellers: chartSellers,
        monthly: monthlySummary
      },
      filterOptions: {
        branches: Object.keys(uniqueBranches).sort(),
        channels: Object.keys(uniqueChannels).sort(),
        statuses: ['Hoàn thành', 'Đang xử lý', 'Đã hủy']
      },
      // 80 giao dịch gần nhất
      recentTransactions: filteredRows.slice(0, 80)
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}
 
/**
 * Lấy sheet hóa đơn theo tháng (tự động theo tháng hiện tại và tương lai)
 */
function getMonthSheetDynamic_(yearMonth) {
  var tz = 'Asia/Ho_Chi_Minh';
  var ym = yearMonth || Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  if (ym === '2026-10') {
    try { return SpreadsheetApp.openById(INVOICES_2026_10_ID).getSheetByName('Invoices'); } catch (e) {}
  }
  if (ym === '2026-09') {
    try { return SpreadsheetApp.openById(INVOICES_2026_09_ID).getSheetByName('Invoices'); } catch (e) {}
  }
  // Tìm động trong thư mục KiotViet-HoaDon trên Google Drive
  if (typeof getOrCreateMonthSheet_ === 'function') {
    try { return getOrCreateMonthSheet_(ym); } catch (e) {}
  }
  return null;
}

/**
 * Lấy danh sách hóa đơn tháng mới nhất theo thời gian thực (READ ONLY)
 */
function getFreshOctoberRecords() {
  return getFreshCurrentMonthRecords();
}

function getFreshCurrentMonthRecords() {
  try {
    var userEmail = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    if (userEmail && ALLOWED_EMAILS.indexOf(userEmail) === -1) {
      return { success: false, error: 'Tài khoản ' + userEmail + ' không có quyền truy cập.' };
    }

    var shCurrent = getMonthSheetDynamic_();
    if (!shCurrent) {
      return { success: true, count: 0, records: [] };
    }
    var lr = shCurrent.getLastRow();
    if (lr <= 1) {
      return { success: true, count: 0, records: [] };
    }

    var raw = shCurrent.getRange(2, 1, lr - 1, 14).getValues();
    var records = [];

    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      var orderCode = String(r[1] || '').trim();
      var dateRaw = r[2];
      var dateStr = extractDateStr_(dateRaw);
      var branchName = String(r[3] || 'Chưa xác định').trim();
      var sellerName = String(r[4] || 'Chưa gán').trim();
      var customerName = String(r[5] || 'Khách lẻ').trim();
      var total = Number(r[6]) || 0;
      var collected = Number(r[7]) || 0;
      var rawStatus = r[8];
      var description = String(r[9] || '').trim();
      var statusVal = r[13];

      if (!orderCode && !dateStr) continue;

      records.push({
        orderCode: orderCode,
        date: dateStr,
        branch: branchName,
        seller: sellerName,
        customer: customerName,
        total: total,
        collected: collected,
        channel: detectSalesChannel_(orderCode, description),
        status: normalizeStatus_(statusVal, rawStatus)
      });
    }

    return {
      success: true,
      count: records.length,
      records: records
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Đọc tổng hợp doanh thu các tháng năm 2026 từ KiotViet-Summary
 */
function get2026MonthlySummary_() {
  try {
    var ss = SpreadsheetApp.openById(SUMMARY_SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Monthly');
    if (!sheet) return { labels: [], data: [] };

    var lastRow = Math.min(sheet.getLastRow(), 20);
    var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues(); // year, month, invoices, revenue
    var list = [];

    for (var i = 0; i < data.length; i++) {
      var yr = Number(data[i][0]);
      var mo = Number(data[i][1]);
      var rev = Number(data[i][3]) || 0;
      var curY = new Date().getFullYear();
      if ((yr === 2026 || yr === curY) && mo > 0) {
        list.push({ label: 'Tháng ' + mo, monthNum: mo, revenue: rev });
      }
    }

    list.sort(function(a, b) { return a.monthNum - b.monthNum; });

    return {
      labels: list.map(function(x) { return x.label; }),
      data: list.map(function(x) { return x.revenue; })
    };
  } catch (e) {
    console.warn('Lỗi đọc Monthly Summary: ' + e.message);
    return { labels: [], data: [] };
  }
}

/**
 * Đọc bảng tổng hợp các năm từ KiotViet-Summary (Yearly)
 */
function getYearlySummary_() {
  try {
    var ss = SpreadsheetApp.openById(SUMMARY_SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Yearly');
    if (!sheet) return [];
    var lr = sheet.getLastRow();
    if (lr <= 1) return [];
    var vals = sheet.getRange(2, 1, lr - 1, 7).getValues();
    return vals.map(function(r) {
      return {
        year: String(r[0]),
        invoices: Number(r[1]) || 0,
        revenue: Number(r[2]) || 0,
        collected: Number(r[3]) || 0,
        cancelled: Number(r[4]) || 0,
        avgOrderValue: Number(r[5]) || 0,
        updatedAt: r[6]
      };
    });
  } catch (e) {
    console.warn('Lỗi đọc Yearly Summary: ' + e.message);
    return [];
  }
}

