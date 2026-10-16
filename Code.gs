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
  'ngocliem0909@gmail.com'
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
 * Khởi tạo Web App (doGet) kèm xác thực tài khoản Google
 */
function doGet(e) {
  // Hỗ trợ API JSON cho các ứng dụng ngoài (như GitHub Pages, website độc lập)
  if (e && e.parameter && (e.parameter.api === '1' || e.parameter.format === 'json')) {
    var fresh = getFreshOctoberRecords();
    return ContentService.createTextOutput(JSON.stringify(fresh))
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
  template.currentUserEmail = userEmail || 'Ủy quyền nội bộ';
  return template.evaluate()
    .setTitle('Dashboard Doanh Thu KiotViet - Lee&Tee')
    .setFaviconUrl('https://ssl.gstatic.com/docs/spreadsheets/forms/favicon_qp2.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
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
        var ssOct = SpreadsheetApp.openById(INVOICES_2026_10_ID);
        var shOct = ssOct.getSheetByName('Invoices') || ssOct.getSheets()[0];
        var lrOct = shOct.getLastRow();
        if (lrOct > 1) {
          rawValues = rawValues.concat(shOct.getRange(2, 1, lrOct - 1, 14).getValues());
        }
      } catch (eOct) {
        console.warn('Lỗi đọc sheet tháng 10: ' + eOct.message);
      }
    }

    if (needSep) {
      try {
        var ssSep = SpreadsheetApp.openById(INVOICES_2026_09_ID);
        var shSep = ssSep.getSheetByName('Invoices') || ssSep.getSheets()[0];
        var lrSep = shSep.getLastRow();
        if (lrSep > 1) {
          rawValues = rawValues.concat(shSep.getRange(2, 1, lrSep - 1, 14).getValues());
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
 * Lấy danh sách hóa đơn tháng 10 mới nhất theo thời gian thực (READ ONLY)
 */
function getFreshOctoberRecords() {
  try {
    var userEmail = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    if (userEmail && ALLOWED_EMAILS.indexOf(userEmail) === -1) {
      return { success: false, error: 'Tài khoản ' + userEmail + ' không có quyền truy cập.' };
    }

    var ssOct = SpreadsheetApp.openById(INVOICES_2026_10_ID);
    var shOct = ssOct.getSheetByName('Invoices') || ssOct.getSheets()[0];
    var lrOct = shOct.getLastRow();
    if (lrOct <= 1) {
      return { success: true, count: 0, records: [] };
    }

    var raw = shOct.getRange(2, 1, lrOct - 1, 14).getValues();
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
      if (yr === 2026 && mo > 0) {
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
