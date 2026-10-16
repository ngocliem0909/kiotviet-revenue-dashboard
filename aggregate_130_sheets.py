#!/usr/bin/env python3
"""
Full aggregation pipeline for 130 KiotViet Monthly Invoice Sheets (2016 to 2026).
Computes:
1. Monthly aggregates (invoices, revenue, collected)
2. Daily aggregates (clean, deduplicated)
3. Branch aggregates (by year and month)
4. Channel aggregates (by year and month)
5. Seller aggregates (by year and month)
6. Yearly summaries (2016 to 2026)
"""

import os
import sys
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MAP_FILE = os.path.join(SCRIPT_DIR, 'source_files_map.json')
GSHEETS_CLI = '/Users/ngocliem0909/.gemini/config/plugins/gsheets/skills/gsheets/scripts/gsheets'
OUTPUT_FILE = os.path.join(SCRIPT_DIR, 'historical_summary.json')

def parse_num(v):
    if v is None or v == '':
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(' ', '').replace(',', '.')
    try:
        return float(s)
    except:
        return 0.0

def detect_channel(code, desc):
    c = str(code or '')
    d = str(desc or '').upper()
    if c.startswith('HDTTS_') or 'TIKTOK' in d:
        return 'TikTok Shop'
    if c.startswith('HD_SP_') or 'SHOPEE' in d:
        return 'Shopee'
    if 'ZALO' in d or 'AFF' in d or 'COD' in d:
        return 'Zalo / Online COD'
    return 'Cửa hàng trực tiếp'

def normalize_status(val, raw):
    s1 = str(val or '').lower()
    s2 = str(raw or '').lower()
    if 'hủy' in s1 or 'cancel' in s2 or s2 == '2':
        return 'Đã hủy'
    if 'hoàn thành' in s1 or 'completed' in s2 or s2 == '1':
        return 'Hoàn thành'
    return 'Đang xử lý'

def process_single_file(file_name, file_id):
    import subprocess
    cmd = [GSHEETS_CLI, 'readonly', 'read', file_id, 'Invoices!A1:N10000', '--json']
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        rows = json.loads(res.stdout)
    except Exception as e:
        return {
            'file_name': file_name,
            'success': False,
            'error': str(e)
        }

    if not rows or len(rows) <= 1:
        return {
            'file_name': file_name,
            'success': True,
            'invoices': 0,
            'revenue': 0,
            'collected': 0,
            'cancelled': 0,
            'daily': {},
            'branches': {},
            'channels': {},
            'sellers': {}
        }

    data = rows[1:]
    tot_rev = 0.0
    tot_col = 0.0
    active_inv = 0
    cancelled_inv = 0

    daily = {}
    branches = {}
    channels = {}
    sellers = {}

    for r in data:
        code = str(r[1] or '').strip()
        date_raw = str(r[2] or '').strip()
        date_str = date_raw[:10] if len(date_raw) >= 10 else ''
        branch = str(r[3] or 'Chưa xác định').strip()
        seller = str(r[4] or 'Chưa gán').strip()
        tot = parse_num(r[6] if len(r) > 6 else 0)
        col = parse_num(r[7] if len(r) > 7 else 0)
        raw_st = r[8] if len(r) > 8 else ''
        desc = r[9] if len(r) > 9 else ''
        st_val = r[13] if len(r) > 13 else ''

        if not code and not date_str:
            continue

        status = normalize_status(st_val, raw_st)
        ch = detect_channel(code, desc)

        if status == 'Đã hủy':
            cancelled_inv += 1
            continue

        active_inv += 1
        tot_rev += tot
        tot_col += col

        # Daily
        if date_str:
            if date_str not in daily:
                daily[date_str] = {'invoices': 0, 'revenue': 0.0, 'collected': 0.0}
            daily[date_str]['invoices'] += 1
            daily[date_str]['revenue'] += tot
            daily[date_str]['collected'] += col

        # Branches
        if branch:
            if branch not in branches:
                branches[branch] = {'invoices': 0, 'revenue': 0.0}
            branches[branch]['invoices'] += 1
            branches[branch]['revenue'] += tot

        # Channels
        if ch not in channels:
            channels[ch] = {'invoices': 0, 'revenue': 0.0}
        channels[ch]['invoices'] += 1
        channels[ch]['revenue'] += tot

        # Sellers
        if seller and seller != 'Chưa gán':
            if seller not in sellers:
                sellers[seller] = {'invoices': 0, 'revenue': 0.0, 'branch': branch}
            sellers[seller]['invoices'] += 1
            sellers[seller]['revenue'] += tot

    return {
        'file_name': file_name,
        'success': True,
        'invoices': active_inv,
        'revenue': round(tot_rev, 2),
        'collected': round(tot_col, 2),
        'cancelled': cancelled_inv,
        'daily': daily,
        'branches': branches,
        'channels': channels,
        'sellers': sellers
    }

def main():
    if not os.path.exists(MAP_FILE):
        print(f"Error: {MAP_FILE} not found")
        sys.exit(1)

    with open(MAP_FILE) as f:
        files_map = json.load(f)

    file_items = sorted(files_map.items())
    total_files = len(file_items)
    print(f"Starting aggregation for {total_files} monthly invoice files...")

    t0 = time.time()
    results = {}
    completed_count = 0

    # Run with 8 workers
    with ThreadPoolExecutor(max_workers=8) as executor:
        future_to_key = {
            executor.submit(process_single_file, fname, fid): fname
            for fname, fid in file_items
        }

        for future in as_completed(future_to_key):
            fname = future_to_key[future]
            completed_count += 1
            try:
                data = future.result()
                results[fname] = data
                if data.get('success'):
                    print(f"[{completed_count:03d}/{total_files}] OK: {fname} -> {data['invoices']} inv, {data['revenue']:,.0f} VND")
                else:
                    print(f"[{completed_count:03d}/{total_files}] FAIL: {fname} -> {data.get('error')}")
            except Exception as exc:
                print(f"[{completed_count:03d}/{total_files}] ERROR: {fname} -> {exc}")

    print(f"\nAll {total_files} files processed in {time.time() - t0:.2f}s!")

    # Build High-Level Aggregates
    monthly_data = {}
    daily_data = {}
    yearly_data = {}

    for fname, d in sorted(results.items()):
        if not d.get('success'):
            continue

        ym = fname.replace('HoaDon_', '')
        parts = ym.split('-')
        yr = parts[0]
        mo = parts[1]

        monthly_data[ym] = {
            'year': yr,
            'month': mo,
            'invoices': d['invoices'],
            'revenue': d['revenue'],
            'collected': d['collected'],
            'cancelled': d['cancelled'],
            'branches': d['branches'],
            'channels': d['channels'],
            'top_sellers': sorted(
                [{'seller': s, 'revenue': round(v['revenue'], 2), 'invoices': v['invoices'], 'branch': v['branch']}
                 for s, v in d['sellers'].items()],
                key=lambda x: x['revenue'],
                reverse=True
            )[:10]
        }

        # Daily
        for d_str, d_val in d['daily'].items():
            daily_data[d_str] = {
                'invoices': d_val['invoices'],
                'revenue': round(d_val['revenue'], 2),
                'collected': round(d_val['collected'], 2)
            }

        # Yearly aggregation
        if yr not in yearly_data:
            yearly_data[yr] = {
                'year': yr,
                'invoices': 0,
                'revenue': 0.0,
                'collected': 0.0,
                'cancelled': 0,
                'months': {},
                'branches': {},
                'channels': {},
                'sellers': {}
            }

        y_entry = yearly_data[yr]
        y_entry['invoices'] += d['invoices']
        y_entry['revenue'] += d['revenue']
        y_entry['collected'] += d['collected']
        y_entry['cancelled'] += d['cancelled']
        y_entry['months'][mo] = {
            'invoices': d['invoices'],
            'revenue': d['revenue'],
            'collected': d['collected']
        }

        # Year branches
        for b, bv in d['branches'].items():
            if b not in y_entry['branches']:
                y_entry['branches'][b] = {'invoices': 0, 'revenue': 0.0}
            y_entry['branches'][b]['invoices'] += bv['invoices']
            y_entry['branches'][b]['revenue'] += bv['revenue']

        # Year channels
        for c, cv in d['channels'].items():
            if c not in y_entry['channels']:
                y_entry['channels'][c] = {'invoices': 0, 'revenue': 0.0}
            y_entry['channels'][c]['invoices'] += cv['invoices']
            y_entry['channels'][c]['revenue'] += cv['revenue']

        # Year sellers
        for s, sv in d['sellers'].items():
            if s not in y_entry['sellers']:
                y_entry['sellers'][s] = {'invoices': 0, 'revenue': 0.0, 'branch': sv['branch']}
            y_entry['sellers'][s]['invoices'] += sv['invoices']
            y_entry['sellers'][s]['revenue'] += sv['revenue']

    # Finalize Yearly formatting (Top branches, Top sellers)
    final_yearly = {}
    for yr, y in yearly_data.items():
        sorted_branches = sorted(
            [{'branch': b, 'revenue': round(v['revenue'], 2), 'invoices': v['invoices']}
             for b, v in y['branches'].items()],
            key=lambda x: x['revenue'],
            reverse=True
        )
        sorted_sellers = sorted(
            [{'seller': s, 'revenue': round(v['revenue'], 2), 'invoices': v['invoices'], 'branch': v['branch']}
             for s, v in y['sellers'].items()],
            key=lambda x: x['revenue'],
            reverse=True
        )

        final_yearly[yr] = {
            'year': yr,
            'invoices': y['invoices'],
            'revenue': round(y['revenue'], 2),
            'collected': round(y['collected'], 2),
            'cancelled': y['cancelled'],
            'avg_order_value': round(y['revenue'] / y['invoices'], 0) if y['invoices'] > 0 else 0,
            'months': y['months'],
            'channels': {c: round(v['revenue'], 2) for c, v in y['channels'].items()},
            'top_branches': sorted_branches[:10],
            'top_sellers': sorted_sellers[:15]
        }

    # Summary all-time
    all_time_rev = sum(y['revenue'] for y in final_yearly.values())
    all_time_col = sum(y['collected'] for y in final_yearly.values())
    all_time_inv = sum(y['invoices'] for y in final_yearly.values())
    all_time_can = sum(y['cancelled'] for y in final_yearly.values())

    full_output = {
        'generated_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        'total_months': len(monthly_data),
        'total_days': len(daily_data),
        'all_time': {
            'revenue': round(all_time_rev, 2),
            'collected': round(all_time_col, 2),
            'invoices': all_time_inv,
            'cancelled': all_time_can,
            'avg_order_value': round(all_time_rev / all_time_inv, 0) if all_time_inv > 0 else 0
        },
        'yearly': final_yearly,
        'monthly': monthly_data,
        'daily': daily_data
    }

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as out:
        json.dump(full_output, out, ensure_ascii=False, indent=2)

    print(f"\nSuccessfully wrote {OUTPUT_FILE} ({os.path.getsize(OUTPUT_FILE) / 1024:.1f} KB)")
    print(f"All-time Revenue: {all_time_rev:,.0f} VND across {all_time_inv:,} orders.")

if __name__ == '__main__':
    main()
