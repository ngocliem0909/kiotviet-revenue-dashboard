/**
 * ==============================================================================
 * MODULE BÁO CÁO KINH DOANH TỰ ĐỘNG QUA TELEGRAM BOT (L&T Analytics)
 * ==============================================================================
 */

const TELEGRAM_DEFAULT_CHAT_ID = '530892002';

function getTelegramConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    token: props.getProperty('TELEGRAM_BOT_TOKEN') || '',
    chatId: props.getProperty('TELEGRAM_CHAT_ID') || TELEGRAM_DEFAULT_CHAT_ID
  };
}

/**
 * Cài đặt Token và Chat ID của bot Telegram
 */
function setTelegramCredentials(botToken, chatId) {
  const props = PropertiesService.getScriptProperties();
  if (botToken) props.setProperty('TELEGRAM_BOT_TOKEN', botToken.trim());
  if (chatId) props.setProperty('TELEGRAM_CHAT_ID', chatId.trim());
  Logger.log('Đã lưu cấu hình Telegram thành công.');
  return { success: true, message: 'Đã lưu cấu hình Telegram' };
}

/**
 * Gửi tin nhắn qua Telegram API
 */
function sendTelegramMessage(text, parseMode) {
  const cfg = getTelegramConfig_();
  if (!cfg.token) {
    throw new Error('Chưa cấu hình TELEGRAM_BOT_TOKEN trong Script Properties');
  }
  const url = 'https://api.telegram.org/bot' + cfg.token + '/sendMessage';
  const payload = {
    chat_id: cfg.chatId,
    text: text,
    parse_mode: parseMode || 'HTML',
    disable_web_page_preview: true
  };
  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Gửi Telegram thất bại (' + resp.getResponseCode() + '): ' + resp.getContentText());
  }
  return JSON.parse(resp.getContentText());
}

/**
 * Xây dựng nội dung báo cáo kinh doanh ngày chuyên nghiệp
 */
function buildDailyReportMessage() {
  const now = new Date();
  const tz = 'Asia/Ho_Chi_Minh';
  const todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const ym = Utilities.formatDate(now, tz, 'yyyy-MM');
  const displayDate = Utilities.formatDate(now, tz, 'dd/MM/yyyy');
  const monthLabel = ym.substring(5) + '/' + ym.substring(0, 4);

  // Đọc dữ liệu từ file hóa đơn tháng hiện tại (tự động theo tháng hiện tại và tương lai)
  let sh = null;
  if (ym === '2026-10') {
    try { sh = SpreadsheetApp.openById(INVOICES_2026_10_ID).getSheetByName('Invoices'); } catch (e) {}
  } else if (ym === '2026-09') {
    try { sh = SpreadsheetApp.openById(INVOICES_2026_09_ID).getSheetByName('Invoices'); } catch (e) {}
  }
  // Nếu không có ID cố định, tìm động trong thư mục Drive KiotViet-HoaDon
  if (!sh && typeof getOrCreateMonthSheet_ === 'function') {
    try { sh = getOrCreateMonthSheet_(ym); } catch (e) {}
  }

  let rows = [];
  if (sh) {
    try {
      const lastRow = sh.getLastRow();
      if (lastRow > 1) {
        rows = sh.getRange(2, 1, lastRow - 1, 9).getValues();
      }
    } catch (e) {
      Logger.log('Lỗi đọc sheet tháng (' + ym + '): ' + e);
    }
  }

  let dInv = 0, dRev = 0, dPaid = 0;
  let mInv = 0, mRev = 0, mPaid = 0;
  const branchTodayMap = {};
  const sellerTodayMap = {};

  rows.forEach(r => {
    const rawDate = r[2];
    let pdStr = '';
    if (Object.prototype.toString.call(rawDate) === '[object Date]') {
      // Dùng Asia/Ho_Chi_Minh để trích xuất chuẩn ngày Việt Nam cho các đơn hàng sáng sớm
      pdStr = Utilities.formatDate(rawDate, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    } else {
      pdStr = String(rawDate || '').substring(0, 10);
    }

    const st = String(r[8] || '');
    if (st === 'Đã hủy') return;

    const total = Number(r[6]) || 0;
    const paid = Number(r[7]) || 0;
    const branch = String(r[3] || '');
    const seller = String(r[4] || '');

    mInv++;
    mRev += total;
    mPaid += paid;

    if (pdStr === todayStr) {
      dInv++;
      dRev += total;
      dPaid += paid;
      if (branch) branchTodayMap[branch] = (branchTodayMap[branch] || 0) + total;
      if (seller && seller !== 'Chưa gán') sellerTodayMap[seller] = (sellerTodayMap[seller] || 0) + total;
    }
  });

  const vnd = n => Math.round(n).toLocaleString('vi-VN') + ' ₫';
  const aov = dInv > 0 ? Math.round(dRev / dInv) : 0;

  // Top 3 chi nhánh hôm nay
  const topBranches = Object.keys(branchTodayMap)
    .map(b => ({ name: b, rev: branchTodayMap[b] }))
    .sort((a, b) => b.rev - a.rev)
    .slice(0, 3);

  let branchText = '';
  topBranches.forEach((b, idx) => {
    const medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : '🥉');
    branchText += `  ${medal} <b>${b.name}</b>: ${vnd(b.rev)}\n`;
  });
  if (!branchText) branchText = '  <i>Chưa có số liệu phát sinh hôm nay</i>\n';

  // Lợi nhuận gộp ước tính (~58% biên trung bình)
  const estMargin = 0.58;
  const estProfit = Math.round(dRev * estMargin);

  const msg = 
    `📊 <b>BÁO CÁO DOANH THU L&T ANALYTICS</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📅 <b>Ngày:</b> ${displayDate}\n\n` +
    `💰 <b>HÔM NAY:</b>\n` +
    `• Hóa đơn: <b>${dInv.toLocaleString()} đơn</b>\n` +
    `• Doanh thu: <b>${vnd(dRev)}</b>\n` +
    `• Thực thu: <b>${vnd(dPaid)}</b>\n` +
    `• Giá trị TB/đơn: <b>${vnd(aov)}</b>\n` +
    `• Lợi nhuận gộp ước tính (~58%): <b>${vnd(estProfit)}</b>\n\n` +
    `🏆 <b>TOP CHI NHÁNH HÔM NAY:</b>\n` +
    branchText + `\n` +
    `📈 <b>LŨY KẾ THÁNG ${monthLabel}:</b>\n` +
    `• Tổng hóa đơn: <b>${mInv.toLocaleString()} đơn</b>\n` +
    `• Tổng doanh thu: <b>${vnd(mRev)}</b>\n` +
    `• Tổng thực thu: <b>${vnd(mPaid)}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔗 <a href="https://script.google.com/macros/s/AKfycbzBJ8SdazzihyeIomttMdgIgj3czv_I4xMt_K1Bw7Syc2Jdc7sU0wJRnjUbQvaKhyXs/exec">Mở Dashboard L&T Analytics</a>`;

  return msg;
}

/**
 * Gửi báo cáo hàng ngày (gọi tự động bởi trigger 23:59)
 */
function sendDailyReportToTelegram() {
  try {
    const text = buildDailyReportMessage();
    const res = sendTelegramMessage(text, 'HTML');
    Logger.log('Đã gửi báo cáo Telegram thành công.');
    return { success: true, message: 'Đã gửi báo cáo Telegram thành công' };
  } catch (e) {
    Logger.log('Lỗi gửi Telegram: ' + e.toString());
    return { success: false, message: e.toString() };
  }
}

/**
 * Hàm test gửi báo cáo Telegram ngay lập tức
 */
function testTelegramReport() {
  return sendDailyReportToTelegram();
}
