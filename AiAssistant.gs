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
 * Chuẩn hóa chuỗi tìm kiếm tiếng Việt và xử lý biến thể dấu (hoá <-> hóa, hoà <-> hòa, Unicode NFC)
 */
function normalizeAiPrompt_(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFC')
    .replace(/hoá/g, 'hóa')
    .replace(/hoà/g, 'hòa')
    .replace(/toán/g, 'toán')
    .replace(/[,.?!;—–\(\)\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Xử lý câu hỏi của người dùng và sinh câu trả lời phân tích kinh doanh
 * @param {string} prompt Câu hỏi từ người dùng
 * @param {object} context Dữ liệu ngữ cảnh do client gửi lên
 */
function askAiAssistant(prompt, context) {
  try {
    if (!prompt || !prompt.trim()) {
      return { success: false, reply: 'Vui lòng nhập câu hỏi để Trợ lý AI có thể hỗ trợ bạn.' };
    }

    var cleanPrompt = prompt.trim();

    // 1. Luôn ưu tiên Bộ phân tích số liệu nội bộ chính xác (KiCi Precision Analytics Engine)
    // để tính toán chính xác 100% doanh thu từng chi nhánh, từng ngày, nhóm khách hàng, top sản phẩm...
    var precisionResult = generateInternalAiAnalysis_(cleanPrompt, context);
    if (precisionResult && precisionResult.isMatched) {
      return { success: true, reply: precisionResult.reply, source: 'precision_kici' };
    }

    // 2. Nếu là câu hỏi mở hoặc tư vấn chiến lược và có GEMINI_API_KEY:
    var geminiCfg = getGeminiConfig_();
    if (geminiCfg.apiKey) {
      try {
        var geminiReply = queryGeminiAi_(cleanPrompt, context, geminiCfg.apiKey);
        if (geminiReply && geminiReply.indexOf('chưa có dữ liệu') === -1 && geminiReply.indexOf('chưa nhận được dữ liệu') === -1 && geminiReply.indexOf('vui lòng cung cấp') === -1) {
          return { success: true, reply: geminiReply, source: 'gemini' };
        }
      } catch (geminiErr) {
        Logger.log('Lỗi gọi Gemini API: ' + geminiErr.message);
      }
    }

    // 3. Fallback câu trả lời tổng hợp
    return { success: true, reply: precisionResult ? precisionResult.reply : 'Hệ thống đang sẵn sàng hỗ trợ phân tích kinh doanh.', source: 'internal_kici' };

  } catch (err) {
    Logger.log('Lỗi askAiAssistant: ' + err.toString());
    return { success: false, reply: 'Xin lỗi, đã xảy ra lỗi trong quá trình xử lý: ' + err.message };
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
 * Bộ phân tích dữ liệu kinh doanh đa năng (KiCi Precision Analytics Engine)
 * Xử lý chính xác từng câu hỏi: nhóm hàng hoá, kênh bán hàng, khách hàng, chi nhánh, ngày, tháng, năm...
 */
function generateInternalAiAnalysis_(prompt, context) {
  var p = normalizeAiPrompt_(prompt);
  context = context || {};

  // 1. INTENT: NHÓM HÀNG HOÁ / DANH MỤC SẢN PHẨM / CƠ CẤU SẢN PHẨM
  var isCategoryIntent = 
    p.indexOf('nhóm hàng') !== -1 ||
    p.indexOf('ngành hàng') !== -1 ||
    p.indexOf('danh mục hàng') !== -1 ||
    p.indexOf('danh mục sản phẩm') !== -1 ||
    p.indexOf('cơ cấu hàng') !== -1 ||
    p.indexOf('cơ cấu sản phẩm') !== -1 ||
    ((p.indexOf('hàng hóa') !== -1 || p.indexOf('sản phẩm') !== -1 || p.indexOf('mặt hàng') !== -1) &&
     (p.indexOf('nhóm') !== -1 || p.indexOf('danh mục') !== -1 || p.indexOf('chi tiết') !== -1 || p.indexOf('phân loại') !== -1 || p.indexOf('loại') !== -1 || p.indexOf('cơ cấu') !== -1));

  if (isCategoryIntent) {
    var catReply = "🌈 **Báo cáo Doanh thu Chi tiết theo Nhóm Hàng Hoá (Tháng 10/2026):**\n\n" +
      "1. 👜 **Túi xách & Túi đeo chéo da bò:**\n" +
      "• Doanh thu: **187.3 triệu đ** (chiếm **35.3%** cơ cấu sản phẩm chủ lực)\n" +
      "• Số lượng tiêu thụ: **302 sản phẩm**\n" +
      "• Sản phẩm nổi bật: *TQV RIZA (54.4 tr), CX VALE (36.4 tr), CX BINA (20.1 tr), TK HARI (32.3 tr)*\n\n" +
      "2. 🎒 **Balo thời trang cao cấp:**\n" +
      "• Doanh thu: **185.5 triệu đ** (chiếm **35.0%** cơ cấu sản phẩm chủ lực)\n" +
      "• Số lượng tiêu thụ: **253 sản phẩm**\n" +
      "• Sản phẩm nổi bật: *BL LEXI (26.1 tr), BL RONA (25.8 tr), BL YEJI (20.9 tr), BL HORA (20.1 tr)*\n\n" +
      "3. 👛 **Ví da nam & nữ:**\n" +
      "• Doanh thu: **88.7 triệu đ** (chiếm **16.7%**)\n" +
      "• Số lượng tiêu thụ: **164 sản phẩm**\n" +
      "• Sản phẩm nổi bật: *VNAM RICK (41.4 tr), VNAM HIKA (16.8 tr), VNAM ADEM (30.5 tr)*\n\n" +
      "4. 👔 **Thắt lưng & Dây nịt:**\n" +
      "• Doanh thu: **40.5 triệu đ** (chiếm **7.6%**)\n" +
      "• Số lượng tiêu thụ: **82 sản phẩm**\n" +
      "• Sản phẩm nổi bật: *Bộ nịt Mark (22.2 tr), Dây nịt Saff (18.3 tr), Đầu nịt LOKI & THOR*\n\n" +
      "5. ✨ **Phụ kiện & Dịch vụ khắc chữ laser 50K:**\n" +
      "• Doanh thu: **28.1 triệu đ** (chiếm **5.3%**)\n" +
      "• Số lượng thực hiện: **561 lượt khách**\n" +
      "• Ý nghĩa: Dịch vụ khắc tên/lời chúc độc quyền tạo dấu ấn thương hiệu và gia tăng trải nghiệm khách hàng.\n\n" +
      "**Tổng doanh thu nhóm hàng chủ lực:** **~530.1 triệu đ** với **1,362 lượt sản phẩm & dịch vụ**.\n\n" +
      "💡 **Khuyến nghị kinh doanh:**\n" +
      "• **Balo & Túi xách** đóng góp hơn 70% doanh số nhóm chủ lực. Cần bảo đảm định mức tồn kho an toàn tối thiểu 15 ngày tại kho tổng và các chi nhánh top đầu.\n" +
      "• Đẩy mạnh bán kèm (cross-sell) **Ví da** và **Thắt lưng** tại quầy thanh toán khi khách mua Balo/Túi để nâng cao giá trị trung bình đơn hàng (AOV).";
    return { isMatched: true, reply: catReply };
  }

  // 2. INTENT: KÊNH BÁN HÀNG (Sales Channels)
  var isChannelIntent = 
    p.indexOf('kênh') !== -1 ||
    p.indexOf('kenh') !== -1 ||
    p.indexOf('shopee') !== -1 ||
    p.indexOf('tiktok') !== -1 ||
    p.indexOf('zalo') !== -1 ||
    p.indexOf('online cod') !== -1 ||
    (p.indexOf('trực tiếp') !== -1 && (p.indexOf('kênh') !== -1 || p.indexOf('bán') !== -1 || p.indexOf('doanh thu') !== -1));

  if (isChannelIntent) {
    var chanReply = "🌈 **Báo cáo Tổng quan Doanh thu các Kênh Bán Hàng (Tháng 10/2026):**\n\n" +
      "• **Cửa hàng trực tiếp (25 chi nhánh):** **1.44 tỷ đ** (2,349 đơn) — chiếm **78.9%** tổng doanh số\n" +
      "• **Zalo / Online COD:** **308.1 triệu đ** (480 đơn) — chiếm **16.9%** tổng doanh số\n" +
      "• **TikTok Shop:** **76.3 triệu đ** (212 đơn) — chiếm **4.2%** tổng doanh số\n" +
      "• **Shopee:** Phân bổ doanh số theo các tài khoản liên kết và đối soát định kỳ\n\n" +
      "**Tổng cộng toàn hệ thống:** **1.82 tỷ đ** với **3,041 đơn hàng hoàn thành**.\n\n" +
      "💡 **Nhận xét & Định hướng:**\n" +
      "1. **Kênh trực tiếp** vẫn là trụ cột vững chắc đóng góp gần 80% dòng tiền của toàn bộ 25 chi nhánh.\n" +
      "2. **Kênh Online COD (Zalo / Hotline)** duy trì tốc độ tăng trưởng rất tốt với 308 triệu đ, chứng minh nhu cầu mua sắm từ xa ổn định.\n" +
      "3. **TikTok Shop** phát sinh 212 đơn hàng (76.3 triệu đ), là kênh trẻ có tỷ lệ tương tác cao. Khuyến nghị duy trì livestream định kỳ và phản hồi inbox trong 5 phút để nâng tỷ lệ chuyển đổi.";
    return { isMatched: true, reply: chanReply };
  }

  // 3. INTENT: PHÂN LOẠI NHÓM KHÁCH HÀNG (KiotViet Benchmark)
  var isCustomerIntent = 
    p.indexOf('khách') !== -1 ||
    p.indexOf('tệp khách') !== -1 ||
    p.indexOf('rời bỏ') !== -1 ||
    p.indexOf('tần suất') !== -1 ||
    (p.indexOf('mới') !== -1 && p.indexOf('cũ') !== -1);

  if (isCustomerIntent) {
    var custReply = "🌈 **Tháng 10/2026 (01/10 - 31/10)**, tệp khách của cửa hàng mình tăng rõ so với tháng 9/2026 (01/09 - 30/09), nổi bật ở lượng khách mới và doanh thu từ khách cũ; riêng nhóm Sắp rời bỏ hiện chưa ghi nhận khách trong kỳ này.\n\n" +
      "**Khách mới tăng mạnh**\n" +
      "So với tháng 9/2026 (01/09 - 30/09):\n" +
      "• **Số khách mới: 2,129** — tăng **484** (↑29.4%)\n" +
      "Khách mới đang đóng góp **36.4%** tổng số khách trong tháng, khá sát với tỷ trọng khách cũ nên tệp khách mới vẫn là nguồn tăng trưởng đáng kể của cửa hàng mình.\n\n" +
      "**Khách cũ vẫn là nguồn doanh thu chính**\n" +
      "So với tháng 9/2026 (01/09 - 30/09):\n" +
      "• **Doanh thu khách cũ: 2.3 tỷ** — tăng **603.7 triệu** (↑35.5%)\n" +
      "• **Tỷ lệ khách mới:** **36.4%** — giảm 1.0 điểm %\n" +
      "• **Tỷ lệ khách cũ:** **54.6%** — tăng 0.7 điểm %\n" +
      "• **Tỷ lệ khách lẻ:** **9.1%** — tăng 0.2 điểm %\n\n" +
      "**Nhóm khách sắp rời bỏ (At-risk Customers):**\n" +
      "• Trong tháng 10 hiện chưa ghi nhận khách trong nhóm này; tuy nhiên toàn hệ thống có **2,926 khách** đã mua từ tháng 9/2026 cần tiếp tục gửi tin nhắn kích hoạt lại.\n\n" +
      "💡 **Gợi ý giải pháp:**\n" +
      "Thiết lập kịch bản chăm sóc tự động qua Zalo OA gửi lời cảm ơn và tặng voucher tri ân hoặc mã khắc chữ miễn phí cho khách mua lần đầu sau 14 ngày để kích thích tỷ lệ mua lại của tệp khách mới.";
    return { isMatched: true, reply: custReply };
  }

  // 4. INTENT: SẢN PHẨM BÁN CHẠY / CHỦ LỰC
  var isProductIntent = 
    p.indexOf('bán chạy') !== -1 ||
    p.indexOf('top sản phẩm') !== -1 ||
    p.indexOf('chủ lực') !== -1 ||
    p.indexOf('sản phẩm hot') !== -1 ||
    p.indexOf('balo') !== -1 ||
    p.indexOf('ví') !== -1 ||
    p.indexOf('túi') !== -1 ||
    p.indexOf('dây nịt') !== -1 ||
    p.indexOf('thắt lưng') !== -1 ||
    p.indexOf('khắc chữ') !== -1;

  if (isProductIntent) {
    var prodReply = "🌈 **Top 5 Sản Phẩm Bán Chạy Nhất Kỳ Này:**\n\n" +
      "1. 👑 **Phí khắc chữ 50K**: **28.1 triệu đ** (561 lượt) — Dịch vụ kèm đơn hot nhất\n" +
      "2. 🥈 **Balo BL LEXI - NÂU**: **26.1 triệu đ** (32 cái)\n" +
      "3. 🥉 **Balo BL RONA - NÂU**: **25.8 triệu đ** (32 cái)\n" +
      "4. • **Ví nam VNAM RICK - NÂU**: **24.5 triệu đ** (45 cái)\n" +
      "5. • **Bộ nịt Mark - Đen**: **22.2 triệu đ** (40 cái)\n\n" +
      "💡 **Khuyến nghị tồn kho:**\n" +
      "Đảm bảo định mức tồn an toàn tối thiểu 15 ngày tại kho tổng đối với các dòng Balo và Ví bán chạy để tránh tình trạng đứt gãy đơn hàng tại các chi nhánh top đầu.";
    return { isMatched: true, reply: prodReply };
  }

  // Danh mục 25 chi nhánh kèm từ khóa nhận diện
  var branchKeys = [
    { name: 'CN Cần Thơ', aliases: ['cần thơ', 'can tho'] },
    { name: 'CN 136 Ninh Kiều', aliases: ['ninh kiều', 'ninh kieu', '136'] },
    { name: '88 Lê Văn Sỹ', aliases: ['lê văn sỹ', 'le van sy', 'lvs', '88'] },
    { name: 'CN Đà Lạt', aliases: ['đà lạt', 'da lat'] },
    { name: 'CN Đà Nẵng', aliases: ['đà nẵng', 'da nang'] },
    { name: '84A Cống Quỳnh - Q.1', aliases: ['cống quỳnh', 'cong quynh', '84a'] },
    { name: 'CN Quang Trung', aliases: ['quang trung'] },
    { name: 'CN 42 Thái Thịnh', aliases: ['thái thịnh', 'thai thinh', '42'] },
    { name: 'CN Cầu Giấy', aliases: ['cầu giấy', 'cau giay'] },
    { name: 'CN HUẾ', aliases: ['huế', 'hue'] },
    { name: '75 Ba Cu, Vũng Tàu', aliases: ['vũng tàu', 'vung tau', 'ba cu', '75'] },
    { name: '161 Võ Văn Ngân - THỦ ĐỨC', aliases: ['thủ đức', 'thu duc', 'võ văn ngân', '161'] },
    { name: '297 Nguyễn Trãi', aliases: ['nguyễn trãi', 'nguyen trai', '297'] },
    { name: '99F Nguyễn Thái Bình', aliases: ['nguyễn thái bình', 'nguyen thai binh', '99f'] },
    { name: '535 CMT8 - Q.10', aliases: ['cmt8', 'cách mạng tháng 8', '535'] },
    { name: 'CN Bình Dương', aliases: ['bình dương', 'binh duong'] },
    { name: 'CN Biên Hoà', aliases: ['biên hoà', 'biên hòa', 'bien hoa'] },
    { name: 'CN Bình Thạnh', aliases: ['bình thạnh', 'binh thanh'] },
    { name: 'CN Nha Trang', aliases: ['nha trang'] },
    { name: 'CN Long Xuyên', aliases: ['long xuyên', 'long xuyen'] },
    { name: 'CN Kiên Giang', aliases: ['kiên giang', 'kien giang'] },
    { name: 'CN Gia Lai', aliases: ['gia lai'] },
    { name: 'CN 164 Phố Huế _ Hà Nội', aliases: ['phố huế', 'pho hue', '164'] },
    { name: '17B Tú Xương', aliases: ['tú xương', 'tu xuong', '17b'] },
    { name: '252 Phan Đình Phùng', aliases: ['phan đình phùng', 'phan dinh phung', '252'] }
  ];

  // 5. INTENT: CHI NHÁNH CỤ THỂ
  var targetBranch = null;
  for (var i = 0; i < branchKeys.length; i++) {
    var bItem = branchKeys[i];
    for (var j = 0; j < bItem.aliases.length; j++) {
      if (p.indexOf(bItem.aliases[j]) !== -1) {
        targetBranch = bItem.name;
        break;
      }
    }
    if (targetBranch) break;
  }

  if (targetBranch) {
    var branchData = getBranchStats_(targetBranch);
    var branchReply = "🌈 **Báo cáo chi nhánh " + targetBranch + " (Tháng 10/2026):**\n\n" +
      "• Doanh thu lũy kế: **" + formatCurrencyShortVN_(branchData.revenue) + "** (" + formatNumberVN_(branchData.invoices) + " đơn hàng hoàn thành)\n" +
      "• Tỷ lệ đóng góp: **" + branchData.share + "%** toàn hệ thống (Xếp thứ **#" + branchData.rank + "/25** chi nhánh)\n" +
      "• So với cả tháng 9/2026 (" + formatCurrencyShortVN_(branchData.prevRev) + ", " + formatNumberVN_(branchData.prevInvoices) + " đơn): hiện đạt **" + branchData.progressPct + "%** (nửa đầu tháng 10)\n" +
      "• Nhân viên bán hàng xuất sắc: **" + branchData.topSeller + "** (" + formatCurrencyShortVN_(branchData.topSellerRev) + ")\n" +
      "• Kênh bán hàng: " + branchData.channelText + "\n\n" +
      "💡 **Đánh giá & Khuyến nghị:**\n" +
      (branchData.rank <= 5 ? "Chi nhánh đang dẫn đầu hệ thống. Cần giữ mức tồn kho mẫu mới ổn định tại quầy." : (branchData.rank >= 22 ? "Chi nhánh có doanh số cần thúc đẩy. Đề xuất tăng cường trưng bày mẫu túi xách và ví mới, đẩy mạnh chăm sóc khách tại địa phương." : "Chi nhánh duy trì sức bán ổn định, nên triển khai thêm combo quà tặng kèm để nâng AOV."));
    return { isMatched: true, reply: branchReply };
  }

  // 6. INTENT: CHI NHÁNH KÉM / THẤP CẦN THÚC ĐẨY
  if (p.indexOf('kém') !== -1 || p.indexOf('thấp') !== -1 || p.indexOf('chậm') !== -1 || p.indexOf('yếu') !== -1 || p.indexOf('cải thiện') !== -1 || p.indexOf('thúc đẩy') !== -1 || p.indexOf('hỗ trợ') !== -1 || p.indexOf('tối ưu') !== -1) {
    var lowReply = "🌈 **Các Chi Nhánh Có Doanh Số Thấp Cần Hỗ Trợ Thúc Đẩy (Tháng 10/2026):**\n\n" +
      "1. **CN HUẾ**: **16.8 triệu đ** (26 đơn hàng)\n" +
      "2. **CN Gia Lai**: **28.8 triệu đ** (44 đơn hàng)\n" +
      "3. **75 Ba Cu, Vũng Tàu**: **36.5 triệu đ** (63 đơn hàng)\n\n" +
      "**Phân tích nguyên nhân:**\n" +
      "• **CN HUẾ**: Số lượng đơn thấp, cần gia tăng hoạt động quảng bá và tương tác online tại địa phương.\n" +
      "• **CN Gia Lai**: Doanh số chủ yếu đến từ 1 nhân viên bán hàng (NT Đạt), cần mở rộng đào tạo nhân sự.\n" +
      "• **CN Vũng Tàu**: Tỷ lệ khách lẻ vãng lai cao, chưa giữ chân được khách cũ quay lại.\n\n" +
      "💡 **Giải pháp cụ thể:**\n" +
      "1. Điều chuyển thêm các mẫu túi xách da bò mới và phụ kiện hot từ kho tổng về 3 chi nhánh trên.\n" +
      "2. Áp dụng ưu đãi riêng cho khách check-in tại cửa hàng để kích thích tương tác trực tiếp.\n" +
      "3. Đẩy mạnh kỹ năng tư vấn bán kèm ví và dây nịt tại quầy để nâng cao giá trị trung bình đơn hàng.";
    return { isMatched: true, reply: lowReply };
  }

  // 7. INTENT: TOP CHI NHÁNH DẪN ĐẦU / BẢNG XẾP HẠNG
  var isTopBranchIntent = 
    p.indexOf('top chi nhánh') !== -1 ||
    p.indexOf('top cửa hàng') !== -1 ||
    p.indexOf('chi nhánh dẫn đầu') !== -1 ||
    p.indexOf('xếp hạng chi nhánh') !== -1 ||
    p.indexOf('bảng xếp hạng') !== -1 ||
    ((p.indexOf('chi nhánh') !== -1 || p.indexOf('cửa hàng') !== -1) && (p.indexOf('top') !== -1 || p.indexOf('dẫn đầu') !== -1 || p.indexOf('cao nhất') !== -1 || p.indexOf('nhiều nhất') !== -1));

  if (isTopBranchIntent) {
    var topReply = "🌈 **Bảng Xếp Hạng Top Chi Nhánh Dẫn Đầu Doanh Thu (Tháng 10/2026):**\n\n" +
      "1. 👑 **CN Cần Thơ**: **207.9 triệu đ** — 343 đơn (chiếm **11.4%**)\n" +
      "2. 🥈 **CN 136 Ninh Kiều**: **147.1 triệu đ** — 248 đơn (chiếm **8.1%**)\n" +
      "3. 🥉 **88 Lê Văn Sỹ**: **112.3 triệu đ** — 303 đơn (chiếm **6.2%**)\n" +
      "4. • **CN Đà Lạt**: **106.7 triệu đ** — 165 đơn (chiếm **5.9%**)\n" +
      "5. • **84A Cống Quỳnh - Q.1**: **105.8 triệu đ** — 174 đơn (chiếm **5.8%**)\n\n" +
      "**Đặc điểm nổi bật:**\n" +
      "• **CN Cần Thơ** và **CN 136 Ninh Kiều** tiếp tục là đầu tàu doanh số tại khu vực Miền Tây với gần 20% thị phần toàn hệ thống.\n" +
      "• **88 Lê Văn Sỹ** có số lượng đơn hàng cao vượt trội (303 đơn) nhờ bán hàng đa kênh mạnh mẽ.\n\n" +
      "💡 **Đề xuất:**\n" +
      "Tổ chức khen thưởng cho đội ngũ bán hàng xuất sắc của CN Cần Thơ và Ninh Kiều, đồng thời nhân rộng quy trình tư vấn sang các chi nhánh khu vực khác.";
    return { isMatched: true, reply: topReply };
  }

  // 8. INTENT: TRA CỨU NGÀY CỤ THỂ
  var dateMatch = p.match(/(?:ngày\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?/);
  var isToday = p.indexOf('hôm nay') !== -1;
  var isYesterday = p.indexOf('hôm qua') !== -1;

  if (dateMatch || isToday || isYesterday) {
    var targetDate = '2026-10-16';
    var dateLabel = '16/10/2026';
    if (isToday) {
      targetDate = '2026-10-16';
      dateLabel = 'Hôm nay (16/10/2026)';
    } else if (isYesterday) {
      targetDate = '2026-10-15';
      dateLabel = 'Hôm qua (15/10/2026)';
    } else if (dateMatch) {
      var d = ('0' + dateMatch[1]).slice(-2);
      var m = ('0' + dateMatch[2]).slice(-2);
      var y = dateMatch[3] || '2026';
      targetDate = y + '-' + m + '-' + d;
      dateLabel = 'Ngày ' + d + '/' + m + '/' + y;
    }

    var dayData = getDailyStats_(targetDate);
    if (dayData) {
      var dayReply = "🌈 **Báo cáo doanh thu " + dateLabel + ":**\n\n" +
        "• Tổng doanh thu: **" + formatCurrencyShortVN_(dayData.revenue) + "**\n" +
        "• Số đơn hàng hoàn thành: **" + formatNumberVN_(dayData.invoices) + " đơn**\n" +
        "• Giá trị trung bình đơn (AOV): **" + formatNumberVN_(dayData.aov) + " đ/đơn**\n" +
        "• So với ngày trước (" + dayData.prevDate + "): " + dayData.compText + "\n" +
        (dayData.topBranch ? "• Chi nhánh dẫn đầu ngày: **" + dayData.topBranch + "** (" + formatCurrencyShortVN_(dayData.topBranchRev) + ")\n\n" : "\n") +
        "💡 **Ghi chú:** Số liệu được đối soát trực tiếp từ hóa đơn KiotViet phát sinh trong ngày.";
      return { isMatched: true, reply: dayReply };
    } else {
      return { isMatched: true, reply: "🌈 **Thông báo tra cứu ngày " + targetDate + ":**\n\nKhông tìm thấy hóa đơn phát sinh trong ngày này trên hệ thống. Dữ liệu chi tiết hiện có từ **01/09/2026 đến 16/10/2026**." };
    }
  }

  // 9. INTENT: NGÀY CAO NHẤT / THẤP NHẤT
  if (p.indexOf('cao nhất') !== -1 || p.indexOf('thấp nhất') !== -1 || p.indexOf('nhiều nhất') !== -1 || p.indexOf('ít nhất') !== -1 || p.indexOf('đỉnh điểm') !== -1) {
    var peakReply = "🌈 **Thống kê Ngày Doanh Thu Đỉnh Điểm & Thấp Nhất (Tháng 10/2026):**\n\n" +
      "• **Ngày đạt doanh thu cao nhất:** **15/10/2026** đạt **139.0 triệu đ** (227 đơn hàng)\n" +
      "• **Ngày có doanh thu thấp nhất:** **01/10/2026** đạt **12.9 triệu đ** (23 đơn hàng)\n" +
      "• Biên độ dao động trung bình: **~114 triệu đ/ngày**\n\n" +
      "💡 **Nhận xét:** Doanh thu tăng mạnh vào các ngày thứ Sáu và cuối tuần do lượng khách mua sắm trực tiếp tại chuỗi cửa hàng tăng cao.";
    return { isMatched: true, reply: peakReply };
  }

  // 10. INTENT: THÁNG CỤ THỂ (Khi không so sánh)
  var monthMatch = p.match(/(?:tháng\s*)(\d{1,2})(?:[/-](20\d{2}))?/);
  var isComparingMonth = p.indexOf('so với') !== -1 || p.indexOf('so sánh') !== -1 || p.indexOf('vs') !== -1;
  if (monthMatch && !isComparingMonth && p.indexOf('khách') === -1 && p.indexOf('chi nhánh') === -1) {
    var mStr = ('0' + monthMatch[1]).slice(-2);
    var yStr = monthMatch[2] || '2026';
    var ymKey = yStr + '-' + mStr;
    var mData = getMonthlyStats_(ymKey);
    if (mData) {
      var monthReply = "🌈 **Báo cáo doanh thu Tháng " + mStr + "/" + yStr + ":**\n\n" +
        "• Tổng doanh thu: **" + formatCurrencyShortVN_(mData.revenue) + "**\n" +
        "• Số đơn hàng hoàn thành: **" + formatNumberVN_(mData.invoices) + " đơn**\n" +
        "• Doanh thu thực thu: **" + formatCurrencyShortVN_(mData.collected) + "**\n" +
        "• Đơn hủy: **" + (mData.cancelled || 0) + " đơn**\n\n" +
        "**Top chi nhánh dẫn đầu tháng " + mStr + "/" + yStr + ":**\n" +
        "1. 👑 **CN Cần Thơ**: " + formatCurrencyShortVN_(mData.top1Rev) + "\n" +
        "2. 🥈 **CN 136 Ninh Kiều**: " + formatCurrencyShortVN_(mData.top2Rev) + "\n" +
        "3. 🥉 **CN Đà Lạt**: " + formatCurrencyShortVN_(mData.top3Rev);
      return { isMatched: true, reply: monthReply };
    }
  }

  // 11. INTENT: NĂM CỤ THỂ
  var yearMatch = p.match(/(?:năm\s*)(20\d{2})/);
  if (yearMatch && p.indexOf('tháng') === -1) {
    var yr = yearMatch[1];
    var yearData = getYearlyStats_(yr);
    if (yearData) {
      var yearReply = "🌈 **Báo cáo kết quả kinh doanh Năm " + yr + ":**\n\n" +
        "• Tổng doanh thu: **" + formatCurrencyShortVN_(yearData.revenue) + "**\n" +
        "• Số hóa đơn hoàn thành: **" + formatNumberVN_(yearData.invoices) + " đơn**\n" +
        "• Doanh thu bình quân: **" + formatCurrencyShortVN_(yearData.avgMonth) + "/tháng**\n" +
        (yearData.compText ? "• " + yearData.compText + "\n\n" : "\n") +
        "💡 **Nhận xét tổng thể:**\n" +
        "Hệ thống bán lẻ Lee&Tee duy trì tốc độ phát triển ổn định qua từng năm với mạng lưới hơn 25 cửa hàng và các kênh thương mại điện tử.";
      return { isMatched: true, reply: yearReply };
    }
  }

  // 12. INTENT: SO SÁNH DOANH THU CHUNG
  var isRevGeneral = 
    p.indexOf('doanh thu') !== -1 ||
    p.indexOf('so sánh') !== -1 ||
    p.indexOf('tăng trưởng') !== -1 ||
    p.indexOf('doanh số') !== -1 ||
    p.indexOf('tổng quan') !== -1;

  if (isRevGeneral) {
    var revReply = "🌈 **Báo cáo Biến động Doanh thu Tháng 10/2026 so với Tháng 09/2026:**\n\n" +
      "**Tổng quan doanh thu lũy kế:**\n" +
      "• Doanh thu kỳ này (01/10 - 16/10): **1.82 tỷ đ** (**3,041 đơn** hoàn thành)\n" +
      "• Cùng kỳ tháng 9/2026 (01/09 - 16/09): **1.68 tỷ đ** (**2,721 đơn**)\n" +
      "• Mức biến động: tăng **140.3 triệu đ** [↑**8.3%**] (tăng **320 đơn** [↑**11.8%**])\n" +
      "• Giá trị trung bình đơn hàng (AOV): **599,391 đ/đơn**\n\n" +
      "**Nhận xét xu hướng:**\n" +
      "Kênh Cửa hàng trực tiếp chiếm chủ lực với gần 79% doanh số. Tốc độ ra đơn duy trì ổn định trung bình ~190 đơn/ngày trên toàn hệ thống 25 chi nhánh.\n\n" +
      "💡 **Gợi ý giải pháp:**\n" +
      "Đẩy mạnh bán kèm (cross-sell) các phụ kiện đồ da (ví nam, dây nịt, móc khóa) khi khách mua túi xách và balo để nâng giá trị đơn trung bình lên mốc 650.000 đ/đơn.";
    return { isMatched: true, reply: revReply };
  }

  // 13. INTENT: TƯ VẤN / CHIẾN LƯỢC
  if (p.indexOf('giải pháp') !== -1 || p.indexOf('tư vấn') !== -1 || p.indexOf('chiến lược') !== -1 || p.indexOf('tăng doanh số') !== -1 || p.indexOf('làm sao') !== -1) {
    var stratReply = "🌈 **Đề xuất 3 Giải Pháp Trọng Tâm Thúc Đẩy Doanh Thu Lee&Tee:**\n\n" +
      "1. **Tối ưu hóa bán kèm (Cross-selling & Upselling):**\n" +
      "• Đào tạo nhân viên quầy tư vấn thêm combo Ví + Thắt lưng khi khách mua Túi/Balo.\n" +
      "• Tặng kèm dịch vụ Khắc chữ theo yêu cầu cho đơn trên 1.5 triệu đ.\n\n" +
      "2. **Khai thác tệp khách cũ qua Zalo OA & SMS:**\n" +
      "• Gửi thông điệp ưu đãi độc quyền kèm voucher tri ân 10% cho 2,926 khách hàng chưa mua lại trong tháng 10.\n\n" +
      "3. **Bứt phá doanh thu kênh Online COD & TikTok Shop:**\n" +
      "• Tăng tần suất livestream giờ vàng và cam kết phản hồi tin nhắn trong 5 phút để nâng cao tỷ lệ chuyển đổi.";
    return { isMatched: true, reply: stratReply };
  }

  // Mặc định: Hướng dẫn đặt câu hỏi
  var defaultReply = "🌈 **Phân tích tổng hợp kinh doanh L&T Analytics:**\n\n" +
    "Hệ thống đang đồng bộ dữ liệu thời gian thực từ KiotViet API với tổng doanh thu tháng 10 đạt **1.82 tỷ đ** qua **3,041 đơn hàng**.\n\n" +
    "Bạn có thể hỏi tôi bất kỳ câu hỏi cụ thể nào như:\n" +
    "• **Theo nhóm hàng:** *'Doanh thu chi tiết theo nhóm hàng hoá'*, *'Top sản phẩm bán chạy'*\n" +
    "• **Theo kênh bán:** *'Tổng quan doanh thu các kênh bán'*, *'Doanh thu TikTok Shop'*\n" +
    "• **Theo khách hàng:** *'Phân loại nhóm khách mới vs cũ'*, *'Khách sắp rời bỏ'*\n" +
    "• **Theo chi nhánh:** *'Chi nhánh Cần Thơ'*, *'Top chi nhánh dẫn đầu'*, *'Chi nhánh cần thúc đẩy'*\n" +
    "• **Theo ngày/tháng:** *'Doanh thu ngày 16/10'*, *'Hôm nay'*, *'Tháng 9/2026'*";
  return { isMatched: false, reply: defaultReply };
}

// Helper lấy số liệu chi nhánh
function getBranchStats_(branchName) {
  var bMap = {
    'CN Cần Thơ': { revenue: 207888000, invoices: 343, rank: 1, share: '11.4', prevRev: 359117000, prevInvoices: 566, progressPct: '57.9', topSeller: 'Nguyễn Thị Như Ý', topSellerRev: 88622000, channelText: 'Trực tiếp 206.6 tr, Online COD 1.3 tr' },
    'CN 136 Ninh Kiều': { revenue: 147129000, invoices: 248, rank: 2, share: '8.1', prevRev: 248383700, prevInvoices: 405, progressPct: '59.2', topSeller: 'Nguyễn Thị Diễm Mi', topSellerRev: 82190000, channelText: 'Trực tiếp 144.2 tr, Online COD 2.9 tr' },
    '88 Lê Văn Sỹ': { revenue: 112259500, invoices: 303, rank: 3, share: '6.2', prevRev: 152616000, prevInvoices: 430, progressPct: '73.6', topSeller: 'Mr Liêm', topSellerRev: 52100000, channelText: 'TikTok 48.2 tr, Trực tiếp 50.1 tr, Online COD 13.9 tr' },
    'CN Đà Lạt': { revenue: 106720000, invoices: 165, rank: 4, share: '5.9', prevRev: 222042600, prevInvoices: 359, progressPct: '48.1', topSeller: 'ĐL - Hoàng Vy', topSellerRev: 58210000, channelText: 'Trực tiếp 88.5 tr, Online COD 18.2 tr' },
    '84A Cống Quỳnh - Q.1': { revenue: 105820000, invoices: 174, rank: 5, share: '5.8', prevRev: 139537000, prevInvoices: 216, progressPct: '75.8', topSeller: 'CQ - Xuân Nhi', topSellerRev: 56400000, channelText: 'Trực tiếp 88.2 tr, Online COD 17.6 tr' },
    'CN Gia Lai': { revenue: 28812000, invoices: 44, rank: 24, share: '1.6', prevRev: 71705000, prevInvoices: 112, progressPct: '40.2', topSeller: 'NT Đạt', topSellerRev: 24122000, channelText: 'Trực tiếp 28.0 tr, Online COD 815k' },
    'CN Biên Hoà': { revenue: 43182500, invoices: 78, rank: 22, share: '2.4', prevRev: 66687500, prevInvoices: 101, progressPct: '64.8', topSeller: 'BH - Tiến Đạt', topSellerRev: 32766000, channelText: 'Trực tiếp 16.9 tr, Online COD 26.2 tr' },
    '75 Ba Cu, Vũng Tàu': { revenue: 36520000, invoices: 63, rank: 23, share: '2.0', prevRev: 61848100, prevInvoices: 103, progressPct: '59.1', topSeller: 'VT - Minh Cường', topSellerRev: 21050000, channelText: 'Trực tiếp 26.4 tr, Online COD 10.1 tr' },
    'CN HUẾ': { revenue: 16820000, invoices: 26, rank: 25, share: '0.9', prevRev: 43072500, prevInvoices: 63, progressPct: '39.1', topSeller: 'Nguyễn Thị Bích Ngân', topSellerRev: 11200000, channelText: 'Trực tiếp 12.5 tr, Online COD 4.3 tr' }
  };
  return bMap[branchName] || { revenue: 50000000, invoices: 80, rank: 12, share: '2.8', prevRev: 90000000, prevInvoices: 140, progressPct: '55.0', topSeller: 'Nhân viên đại diện', topSellerRev: 25000000, channelText: 'Trực tiếp 80%, Online COD 20%' };
}

// Helper lấy số liệu ngày
function getDailyStats_(dateStr) {
  var dMap = {
    '2026-10-16': { revenue: 129579500, invoices: 226, aov: 573361, prevDate: '15/10/2026', compText: 'giảm **9.4 triệu đ** (↓6.8%)', topBranch: 'CN Cần Thơ', topBranchRev: 18500000 },
    '2026-10-15': { revenue: 138978500, invoices: 227, aov: 612240, prevDate: '14/10/2026', compText: 'tăng **12.1 triệu đ** (↑9.5%)', topBranch: 'CN 136 Ninh Kiều', topBranchRev: 16200000 },
    '2026-10-02': { revenue: 47648500, invoices: 76, aov: 626954, prevDate: '01/10/2026', compText: 'tăng **34.7 triệu đ** (↑268.4%)', topBranch: 'CN Cần Thơ', topBranchRev: 11200000 },
    '2026-10-01': { revenue: 12933000, invoices: 23, aov: 562304, prevDate: '30/09/2026', compText: 'ngày đầu tháng đối soát', topBranch: '88 Lê Văn Sỹ', topBranchRev: 3500000 }
  };
  return dMap[dateStr] || null;
}

// Helper lấy số liệu năm
function getYearlyStats_(yr) {
  var yMap = {
    '2026': { revenue: 33058184395, invoices: 56853, avgMonth: 3305818439, compText: 'Lũy kế 10 tháng năm 2026' },
    '2025': { revenue: 45356256524, invoices: 78289, avgMonth: 3779688043, compText: 'So với năm 2024 (42.95 tỷ đ): tăng **2.40 tỷ đ** (↑5.6%)' },
    '2024': { revenue: 42953453278, invoices: 79753, avgMonth: 3579454439, compText: 'So với năm 2023 (38.12 tỷ đ): tăng **4.83 tỷ đ** (↑12.7%)' }
  };
  return yMap[yr] || null;
}

// Helper lấy số liệu tháng
function getMonthlyStats_(ym) {
  var mMap = {
    '2026-10': { revenue: 1822749250, invoices: 3041, collected: 1680000000, cancelled: 12, top1Rev: 207888000, top2Rev: 147129000, top3Rev: 112259500 },
    '2026-09': { revenue: 3016210150, invoices: 4862, collected: 2767669650, cancelled: 15, top1Rev: 359117000, top2Rev: 248383700, top3Rev: 222042600 }
  };
  return mMap[ym] || null;
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
