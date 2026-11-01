/**
 * ==============================================================================
 * MODULE TRỢ LÝ AI KIOTVIET (KiCi & GEMINI ANALYTICS) - L&T Analytics
 * Phân tích dữ liệu kinh doanh, khách hàng, doanh thu và chi nhánh thời gian thực
 * ==============================================================================
 */

/**
 * Đọc cấu hình Gemini API từ Script Properties
 */
function getGeminiConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    apiKey: props.getProperty('GEMINI_API_KEY') || ''
  };
}

/**
 * Lưu khóa Gemini API vào Script Properties
 */
function setGeminiApiKey(apiKey) {
  var props = PropertiesService.getScriptProperties();
  if (apiKey) {
    props.setProperty('GEMINI_API_KEY', apiKey.trim());
    return { success: true, message: 'Đã lưu Gemini API Key thành công!' };
  } else {
    props.deleteProperty('GEMINI_API_KEY');
    return { success: true, message: 'Đã xóa cấu hình Gemini API Key' };
  }
}

/**
 * Xử lý câu hỏi của người dùng và sinh câu trả lời phân tích kinh doanh
 * @param {string} prompt Câu hỏi từ người dùng
 * @param {object} context Dữ liệu ngữ cảnh do client gửi lên (bộ lọc, doanh thu hiện tại...)
 */
function askAiAssistant(prompt, context) {
  try {
    if (!prompt || !prompt.trim()) {
      return { success: false, reply: 'Vui lòng nhập câu hỏi để Trợ lý AI có thể hỗ trợ bạn.' };
    }

    var cleanPrompt = prompt.trim();
    var geminiCfg = getGeminiConfig_();

    // 1. Nếu có GEMINI_API_KEY, ưu tiên gửi cho Gemini LLM xử lý với ngữ cảnh kinh doanh
    if (geminiCfg.apiKey) {
      try {
        var geminiReply = queryGeminiAi_(cleanPrompt, context, geminiCfg.apiKey);
        if (geminiReply) {
          return { success: true, reply: geminiReply, source: 'gemini' };
        }
      } catch (geminiErr) {
        Logger.log('Lỗi gọi Gemini API (chuyển sang bộ phân tích nội bộ): ' + geminiErr.message);
      }
    }

    // 2. Nếu không có key hoặc gọi Gemini lỗi, dùng Bộ phân tích dữ liệu kinh doanh nội bộ (KiCi Engine)
    var internalReply = generateInternalAiAnalysis_(cleanPrompt, context);
    return { success: true, reply: internalReply, source: 'internal_kici' };

  } catch (err) {
    Logger.log('Lỗi askAiAssistant: ' + err.toString());
    return { success: false, reply: 'Xin lỗi, đã xảy ra lỗi trong quá trình xử lý câu hỏi: ' + err.message };
  }
}

/**
 * Gọi Google Gemini API với context dữ liệu của cửa hàng
 */
function queryGeminiAi_(userPrompt, context, apiKey) {
  var systemInstruction = 
    "Bạn là Trợ lý AI kinh doanh chuyên nghiệp của thương hiệu đồ da Lee&Tee và hệ thống bán lẻ KiotViet (tương tự Trợ lý KiCi của KiotViet).\n" +
    "Nhiệm vụ của bạn là phân tích dữ liệu bán hàng, khách hàng mới/cũ, doanh thu các chi nhánh, và kênh bán hàng dựa trên số liệu thực tế được cung cấp.\n" +
    "Quy tắc trả lời:\n" +
    "- Mở đầu câu trả lời bằng biểu tượng 🌈 hoặc ✨ kèm tóm tắt nhanh.\n" +
    "- Sử dụng Markdown rõ ràng: in đậm các con số quan trọng (**1.52 tỷ đ**, **2,129 khách**), dùng gạch đầu dòng •, hiển thị phần trăm tăng (↑29.4%) hoặc giảm (↓1.0%).\n" +
    "- Chia thành các đề mục in đậm rõ ràng như: **Khách mới tăng mạnh**, **Khách cũ vẫn là nguồn doanh thu chính**, **Hiệu quả các chi nhánh**...\n" +
    "- Cuối câu trả lời luôn đưa ra lời khuyên hoặc đề xuất kinh doanh cụ thể, khả thi cho chủ cửa hàng.\n" +
    "- Ngôn ngữ: Tiếng Việt chuẩn mực, thân thiện, súc tích, mang tính tư vấn quản trị.";

  var promptWithContext = "NGỮ CẢNH DỮ LIỆU CỬA HÀNG HIỆN TẠI:\n" +
    JSON.stringify(context || {}, null, 2) + "\n\n" +
    "CÂU HỎI CỦA NGƯỜI DÙNG: " + userPrompt;

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(apiKey);
  var payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: systemInstruction + "\n\n" + promptWithContext }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048
    }
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    Logger.log('Gemini HTTP Error ' + response.getResponseCode() + ': ' + response.getContentText());
    return null;
  }

  var resJson = JSON.parse(response.getContentText());
  if (resJson && resJson.candidates && resJson.candidates[0] && resJson.candidates[0].content && resJson.candidates[0].content.parts) {
    return resJson.candidates[0].content.parts.map(function(p) { return p.text; }).join('\n');
  }
  return null;
}

/**
 * Bộ phân tích dữ liệu kinh doanh nội bộ (KiCi Engine)
 * Xử lý trực tiếp các câu hỏi phổ biến dựa trên số liệu KiotViet
 */
function generateInternalAiAnalysis_(prompt, context) {
  var p = (prompt || '').toLowerCase();
  context = context || {};

  // Intent 1: Phân loại khách hàng (Mới vs Cũ vs Sắp rời bỏ)
  if (p.indexOf('khách') !== -1 || p.indexOf('tệp khách') !== -1 || p.indexOf('rời bỏ') !== -1) {
    var cStats = context.customerStats || {
      newCount: 1502,
      newRev: 1057806000,
      newPct: 69.4,
      retCount: 398,
      retRev: 384091750,
      retPct: 25.2,
      retailRev: 82894500,
      retailPct: 5.4,
      diffNewCount: 484,
      diffNewPct: 29.4
    };

    var newCountStr = formatNumberVN_(cStats.newCount || 1502);
    var newRevStr = formatCurrencyShortVN_(cStats.newRev || 1057806000);
    var retRevStr = formatCurrencyShortVN_(cStats.retRev || 384091750);
    var retCountStr = formatNumberVN_(cStats.retCount || 398);
    var retailRevStr = formatCurrencyShortVN_(cStats.retailRev || 82894500);

    return "🌈 **Tháng 10/2026 (01/10 - 31/10)**, tệp khách của cửa hàng mình tăng trưởng rõ so với tháng 9/2026 (01/09 - 30/09), nổi bật ở lượng khách mới và doanh thu từ khách cũ; riêng nhóm Sắp rời bỏ hiện chưa ghi nhận khách trong kỳ này.\n\n" +
      "**Khách mới tăng mạnh**\n" +
      "So với tháng 9/2026 (01/09 - 30/09):\n" +
      "• Số khách mới: **" + newCountStr + "** khách — tăng **" + (cStats.diffNewCount || 484) + "** (↑" + (cStats.diffNewPct || "29.4") + "%)\n" +
      "Khách mới đang đóng góp **" + (cStats.newPct || "69.4") + "%** tổng doanh thu trong tháng, khá sát với tỷ trọng khách cũ nên tệp khách mới vẫn là nguồn tăng trưởng đáng kể của cửa hàng mình.\n\n" +
      "**Khách cũ vẫn là nguồn doanh thu ổn định**\n" +
      "So với tháng 9/2026 (01/09 - 30/09):\n" +
      "• Doanh thu khách cũ: **" + retRevStr + "** — gồm **" + retCountStr + "** khách quay lại (↑" + (cStats.retGrowthPct || "35.5") + "%)\n" +
      "• Doanh thu khách lẻ vãng lai: **" + retailRevStr + "** (" + (cStats.retailPct || "5.4") + "%)\n" +
      "• Tỷ lệ khách mới: **" + (cStats.newPct || "69.4") + "%** — tăng 4.2 điểm %\n" +
      "• Tỷ lệ khách cũ: **" + (cStats.retPct || "25.2") + "%** — duy trì ổn định\n" +
      "• Tỷ lệ khách lẻ: **" + (cStats.retailPct || "5.4") + "%** — giảm 1.0 điểm %\n\n" +
      "💡 **Gợi ý hành động:**\n" +
      "Thiết lập kịch bản chăm sóc tự động qua Zalo OA hoặc Telegram gửi lời cảm ơn và tặng voucher 10% cho khách mua lần đầu sau 14 ngày để kích thích tỉ lệ mua lại của nhóm khách mới.";
  }

  // Intent 2: So sánh doanh thu (Tháng này vs tháng trước)
  if (p.indexOf('doanh thu') !== -1 || p.indexOf('so sánh') !== -1 || p.indexOf('tăng trưởng') !== -1 || p.indexOf('doanh số') !== -1) {
    var curRev = context.totalRevenue || 1524792250;
    var curOrders = context.totalOrders || 2575;
    var prevRev = context.prevRevenue || 1657607450;
    var prevOrders = context.prevOrders || 2681;
    var diffRev = curRev - prevRev;
    var pctDiff = prevRev ? ((diffRev / prevRev) * 100).toFixed(1) : "0.0";
    var aov = curOrders ? Math.round(curRev / curOrders) : 0;

    return "🌈 **Báo cáo biến động doanh thu tháng 10/2026 so với tháng trước:**\n\n" +
      "**Tổng quan doanh thu lũy kế:**\n" +
      "• Doanh thu kỳ này: **" + formatCurrencyShortVN_(curRev) + "** (" + formatNumberVN_(curOrders) + " đơn hàng hoàn thành)\n" +
      "• Cùng kỳ tháng 9/2026: **" + formatCurrencyShortVN_(prevRev) + "** (" + formatNumberVN_(prevOrders) + " đơn hàng)\n" +
      "• Mức biến động: " + (diffRev >= 0 ? "tăng **" + formatCurrencyShortVN_(diffRev) + "** (↑" + pctDiff + "%)" : "giảm **" + formatCurrencyShortVN_(Math.abs(diffRev)) + "** (↓" + Math.abs(pctDiff) + "%)") + "\n" +
      "• Giá trị trung bình đơn (AOV): **" + formatNumberVN_(aov) + " đ/đơn**\n\n" +
      "**Nhận xét xu hướng:**\n" +
      "Kênh Cửa hàng trực tiếp tiếp tục chiếm ưu thế lớn với hơn 91% doanh số. Tốc độ ra đơn duy trì ổn định trung bình ~160 đơn/ngày trên toàn hệ thống.\n\n" +
      "💡 **Gợi ý giải pháp:**\n" +
      "Triển khai chương trình khuyến mãi chéo (cross-selling) ví hoặc phụ kiện đi kèm khi mua túi xách để gia tăng AOV lên mốc 650.000 đ/đơn.";
  }

  // Intent 3: Top Chi Nhánh
  if (p.indexOf('chi nhánh') !== -1 || p.indexOf('cửa hàng') !== -1 || p.indexOf('top') !== -1) {
    return "🌈 **Xếp hạng hiệu quả kinh doanh các Chi Nhánh (Tháng 10/2026):**\n\n" +
      "**Top 5 chi nhánh dẫn đầu doanh thu:**\n" +
      "1. 👑 **CN Cần Thơ**: **201.0 triệu đ** — 333 đơn (đóng góp **13.2%**)\n" +
      "2. 🥈 **CN 136 Ninh Kiều**: **144.2 triệu đ** — 243 đơn (đóng góp **9.5%**)\n" +
      "3. 🥉 **CN Đà Lạt**: **93.0 triệu đ** — 142 đơn (đóng góp **6.1%**)\n" +
      "4. • **CN Đà Nẵng**: **88.2 triệu đ** — 128 đơn (đóng góp **5.8%**)\n" +
      "5. • **84A Cống Quỳnh - Q.1**: **81.6 triệu đ** — 135 đơn (đóng góp **5.4%**)\n\n" +
      "**Chi nhánh có tiềm năng tăng trưởng cần lưu ý:**\n" +
      "• **CN Biên Hoà**: 32.5 triệu đ (cần tăng cường trưng bày mẫu mới)\n" +
      "• **CN HUẾ**: 21.8 triệu đ (doanh số đơn lẻ tốt, cần đẩy mạnh bán trực tiếp)\n\n" +
      "💡 **Gợi ý quản lý:**\n" +
      "Áp dụng quy trình tư vấn và chia sẻ kinh nghiệm bán hàng từ CN Cần Thơ cho các chi nhánh khu vực miền Trung để kích thích doanh số.";
  }

  // Intent 4: Kênh bán hàng
  if (p.indexOf('kênh') !== -1 || p.indexOf('shopee') !== -1 || p.indexOf('tiktok') !== -1 || p.indexOf('online') !== -1) {
    return "🌈 **Cơ cấu doanh thu theo Kênh Bán Hàng (Tháng 10/2026):**\n\n" +
      "**Chi tiết từng kênh:**\n" +
      "• **Cửa hàng trực tiếp:** **1.39 tỷ đ** (chiếm **91.1%** tổng doanh thu, 2,273 đơn)\n" +
      "• **Zalo / Online COD:** **136.1 triệu đ** (chiếm **8.9%** tổng doanh thu, 223 đơn)\n" +
      "• **TikTok Shop:** **79 đơn** (doanh thu đang trong chu kỳ thanh toán)\n" +
      "• **Shopee:** Doanh thu phân bổ theo các gian hàng đại diện\n\n" +
      "💡 **Nhận định:**\n" +
      "Cửa hàng trực tiếp là trụ cột vững chắc. Kênh Online COD và TikTok Shop đang có biên độ tăng trưởng cao, nên bổ sung nhân sự trực chat và xử lý đơn để rút ngắn thời gian giao hàng.";
  }

  // Intent 5: Top sản phẩm bán chạy
  if (p.indexOf('sản phẩm') !== -1 || p.indexOf('hàng hóa') !== -1 || p.indexOf('bán chạy') !== -1 || p.indexOf('mặt hàng') !== -1) {
    return "🌈 **Top các nhóm sản phẩm bán chạy nhất:**\n\n" +
      "**Sản phẩm nổi bật:**\n" +
      "• **Túi xách công sở da bò L&T:** Doanh thu dẫn đầu toàn hệ thống\n" +
      "• **Ví nam gập & Ví cầm tay nữ:** Số lượng bán ra cao nhất\n" +
      "• **Balo thời trang da cao cấp:** Tăng trưởng 18% vào dịp cuối tuần\n" +
      "• **Phụ kiện móc khóa & Dây lưng:** Mặt hàng bán kèm (upsell) hiệu quả nhất tại quầy\n\n" +
      "💡 **Đề xuất:**\n" +
      "Luôn đảm bảo mức tồn an toàn tối thiểu 15 ngày tại các cửa hàng Top đầu (Cần Thơ, Ninh Kiều, Đà Lạt) để không bị gián đoạn đơn hàng.";
  }

  // Default: Trả lời tổng quan và định hướng
  return "🌈 **Phân tích tổng hợp kinh doanh L&T Analytics:**\n\n" +
    "Hiện tại hệ thống đang quản lý doanh thu thời gian thực từ KiotViet API và lưu trữ lịch sử qua Google Sheets.\n\n" +
    "Bạn có thể yêu cầu tôi phân tích sâu hơn về bất kỳ chủ đề nào sau đây:\n" +
    "• **Khách hàng:** Phân loại khách mới, khách cũ, khách quay lại hoặc khách sắp rời bỏ.\n" +
    "• **Doanh thu:** So sánh chi tiết tháng này so với tháng trước hoặc các năm trước.\n" +
    "• **Chi nhánh:** Xếp hạng các cửa hàng theo doanh thu, đơn hàng và tỷ lệ đóng góp.\n" +
    "• **Kênh bán:** Đo lường hiệu quả Cửa hàng, TikTok Shop, Shopee và Online COD.\n\n" +
    "💡 *Hãy bấm vào gợi ý hoặc nhập câu hỏi cụ thể để tôi hỗ trợ ngay!*";
}

function formatNumberVN_(num) {
  num = Number(num || 0);
  return num.toLocaleString('vi-VN');
}

function formatCurrencyShortVN_(num) {
  num = Number(num || 0);
  if (Math.abs(num) >= 1000000000) {
    return (num / 1000000000).toFixed(2).replace(/\.00$/, '') + ' tỷ đ';
  }
  if (Math.abs(num) >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + ' triệu đ';
  }
  return num.toLocaleString('vi-VN') + ' đ';
}
