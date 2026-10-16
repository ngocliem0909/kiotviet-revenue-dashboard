const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 3000;
const HTML_FILE = path.join(__dirname, 'Index.html');
const DATA_FILE = path.join(__dirname, 'october_data.json');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/' || url.pathname === '/index.html') {
    fs.readFile(HTML_FILE, 'utf8', (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Lỗi đọc file Index.html: ' + err.message);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    });
    return;
  }

  if (url.pathname === '/clean') {
    const cleanFile = path.join(__dirname, 'dashboard_clean.html');
    fs.readFile(cleanFile, 'utf8', (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Lỗi đọc file dashboard_clean.html: ' + err.message);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    });
    return;
  }

  if (url.pathname === '/api/data') {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    });
    return;
  }

  if (url.pathname === '/api/refresh') {
    try {
      const cmd = '/Users/ngocliem0909/.gemini/config/plugins/gsheets/skills/gsheets/scripts/gsheets readonly read 14e0fIJYN28HEJkBKpmo6rSVhb4nd4puQz0niA4GRg-M Invoices!A1:N10000 --json';
      const output = execSync(cmd, { maxBuffer: 50 * 1024 * 1024 }).toString();
      const rows = JSON.parse(output);

      function detectSalesChannel_(code, desc) {
        code = String(code || '');
        desc = String(desc || '').toUpperCase();
        if (code.indexOf('HDTTS_') === 0 || desc.indexOf('TIKTOK') !== -1) return 'TikTok Shop';
        if (code.indexOf('HD_SP_') === 0 || desc.indexOf('SHOPEE') !== -1) return 'Shopee';
        if (desc.indexOf('ZALO') !== -1 || desc.indexOf('AFF') !== -1 || desc.indexOf('COD') !== -1) return 'Zalo / Online COD';
        return 'Cửa hàng trực tiếp';
      }

      function normalizeStatus_(statusVal, rawStatus) {
        var s1 = String(statusVal || '').trim().toLowerCase();
        var s2 = String(rawStatus || '').trim().toLowerCase();
        if (s1.indexOf('hủy') !== -1 || s2.indexOf('cancel') !== -1 || s2 === '2') return 'Đã hủy';
        if (s1.indexOf('hoàn thành') !== -1 || s2.indexOf('completed') !== -1 || s2 === '1') return 'Hoàn thành';
        return 'Đang xử lý';
      }

      const records = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const code = String(r[1] || '').trim();
        const date = String(r[2] || '').slice(0, 10);
        const branch = String(r[3] || 'Chưa xác định').trim();
        const seller = String(r[4] || 'Chưa gán').trim();
        const customer = String(r[5] || 'Khách lẻ').trim();
        const total = Number(r[6]) || 0;
        const collected = Number(r[7]) || 0;
        const channel = detectSalesChannel_(code, r[9]);
        const status = normalizeStatus_(r[13], r[8]);
        if (!code && !date) continue;
        records.push({
          orderCode: code,
          date: date,
          branch: branch,
          seller: seller,
          customer: customer,
          total: total,
          collected: collected,
          channel: channel,
          status: status
        });
      }

      fs.writeFileSync(DATA_FILE, JSON.stringify(records));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: records.length }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

server.listen(PORT, () => {
  console.log(`🚀 Dashboard Server đang chạy tại: http://localhost:${PORT}`);
});
