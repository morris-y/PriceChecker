from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import duckdb
import pandas as pd
from config import CSV_PATH, DEFAULT_SOL_PRICE, PARQUET_PATH
import time
import numpy as np
import logging
from fastapi.responses import JSONResponse
from fastapi import Request
import datetime
from birdeye_api import batch_birdeye_prices
from solana_api import get_slot_timestamps

# 日志配置
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

# 共用函式
def to_gmt8(ts):
    try:
        ts = float(ts)
        # 自動判斷單位：10位數為秒，13位數為毫秒
        if ts < 1e10:  # 秒
            dt = datetime.datetime.utcfromtimestamp(ts) + datetime.timedelta(hours=8)
        else:  # 毫秒
            dt = datetime.datetime.utcfromtimestamp(ts / 1000) + datetime.timedelta(hours=8)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return None

def to_gmt0(ts):
    try:
        ts = float(ts)
        if ts < 1e10:
            dt = datetime.datetime.utcfromtimestamp(ts)
        else:
            dt = datetime.datetime.utcfromtimestamp(ts / 1000)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return None

_cache = {}

def cache_with_expiry(key, value, ttl=300):
    _cache[key] = (value, time.time() + ttl)

def get_cache(key):
    v = _cache.get(key)
    if v and v[1] > time.time():
        return v[0]
    return None

app = FastAPI()

# 允许跨域，方便前端本地开发调试
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Request: {request.method} {request.url}")
    try:
        response = await call_next(request)
        logger.info(f"Response status: {response.status_code}")
        return response
    except Exception as e:
        logger.error(f"Unhandled error: {e}", exc_info=True)
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/api/random_sample")
def random_sample(
    rows: int = Query(100, gt=0, le=10000),
    tokens: int = Query(10, gt=0, le=1000),
    sol_price: float = Query(DEFAULT_SOL_PRICE, gt=0),
    token_list: Optional[str] = Query(None),
    price_type: str = Query(None, regex="^(buy_price|sell_price)$"),
    price_bin: Optional[int] = Query(None),
    price_unit: str = Query("SOL", regex="^(SOL|USD)$")
):
    try:
        con = duckdb.connect()
        # 構建 where 條件
        where_clauses = []
        if price_type:
            where_clauses.append(f"{price_type}_sol IS NOT NULL")
        if token_list:
            token_items = [f"'{x.strip()}'" for x in token_list.split(",") if x.strip()]
            if token_items:
                where_clauses.append(f"token_mint_address IN ({','.join(token_items)})")
        if price_bin is not None:
            bins = [0, 10, 100, 1000, 10000, 100000, 1e20]
            low = bins[price_bin]
            high = bins[price_bin+1] if price_bin+1 < len(bins) else 1e20
            if price_type:
                price_col = price_type if price_unit == 'SOL' else f"{price_type}_sol*{sol_price}"
                where_clauses.append(f"{price_col} >= {low}")
                if high != 1e20:
                    where_clauses.append(f"{price_col} < {high}")
        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
        logger.info(f"random_sample where_sql: {where_sql}")
        # 先查 count
        count_sql = f"SELECT COUNT(*) AS total FROM read_parquet('{PARQUET_PATH}') WHERE {where_sql};"
        logger.info(f"random_sample count_sql: {count_sql}")
        total = con.execute(count_sql).fetchone()[0]
        logger.info(f"random_sample total: {total}")
        if total == 0:
            logger.warning(f"random_sample no data found for where_sql: {where_sql}")
            # 返回结构与 filter_data 保持一致
            return {"data": [], "total": 0, "page": 1, "page_size": rows, "summary": {"count": 0, "avg": None, "min": None, "max": None}}
        # 用 ORDER BY RANDOM() + LIMIT 取代 SAMPLE，保證能返回足夠 rows 條數據
        sql = f"SELECT * FROM (SELECT * FROM read_parquet('{PARQUET_PATH}') WHERE {where_sql}) ORDER BY RANDOM() LIMIT {rows};"
        logger.info(f"random_sample sample_sql: {sql}")
        df = con.execute(sql).df()
        logger.info(f"random_sample sample result rows: {len(df)}")
        # summary 統計
        if price_type and not df.empty:
            # 新增：同時計算 SOL 和 USD 統計
            if price_type in ['buy_price', 'sell_price']:
                sol_col = f"{price_type}_sol"
                usd_col = f"{price_type}_usd"
                # 補全 usd 欄位
                if usd_col not in df.columns:
                    if sol_col in df.columns:
                        df[usd_col] = df[sol_col].astype(float) * float(sol_price)
                summary = {
                    "count": len(df),
                    "avg_sol": df[sol_col].mean(),
                    "min_sol": df[sol_col].min(),
                    "max_sol": df[sol_col].max(),
                    "avg_usd": df[usd_col].mean(),
                    "min_usd": df[usd_col].min(),
                    "max_usd": df[usd_col].max(),
                }
            else:
                summary = {
                    "count": len(df),
                    "avg": df[price_type].mean(),
                    "min": df[price_type].min(),
                    "max": df[price_type].max()
                }
        else:
            summary = {"count": len(df), "avg": None, "min": None, "max": None}
        # 補全欄位（solscan_link, gmgn_link, 時間欄位）
        def safe_json(obj):
            if isinstance(obj, dict):
                return {k: safe_json(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [safe_json(x) for x in obj]
            elif isinstance(obj, float):
                # 统一处理所有非法JSON float
                if obj == float('inf') or obj == float('-inf') or obj == 1e20 or obj == -1e20:
                    return None
                if obj != obj:  # NaN
                    return None
                return float(obj)
            return obj
        def enrich_row(row):
            row = dict(row)
            ts = row.get("trade_timestamp")
            row["trade_time_gmt8"] = to_gmt8(ts) if ts else None
            row["trade_time_gmt0"] = to_gmt0(ts) if ts else None
            row["solscan_link"] = f"https://solscan.io/tx/{row.get('transaction_signature','')}" if row.get("transaction_signature") else ""
            row["gmgn_link"] = f"https://www.gmgn.ai/sol/token/{row.get('token_mint_address','')}" if row.get("token_mint_address") else ""
            # 保證 buy_price_usd/sell_price_usd 欄位補全
            if "buy_price_sol" in row and "buy_price_usd" not in row:
                try:
                    row["buy_price_usd"] = float(row["buy_price_sol"]) * float(sol_price) if row["buy_price_sol"] not in [None, '', 'nan'] else None
                except Exception:
                    row["buy_price_usd"] = None
            if "sell_price_sol" in row and "sell_price_usd" not in row:
                try:
                    row["sell_price_usd"] = float(row["sell_price_sol"]) * float(sol_price) if row["sell_price_sol"] not in [None, '', 'nan'] else None
                except Exception:
                    row["sell_price_usd"] = None
            return row
        data = [enrich_row(row) for _, row in df.iterrows()]
        safe_data = safe_json(data)
        safe_summary = safe_json(summary)
        return {"data": safe_data, "total": total, "page": 1, "page_size": rows, "summary": safe_summary}
    except Exception as e:
        logger.error(f"/api/random_sample error: {e}", exc_info=True)
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/api/top_tokens")
def top_tokens(top: int = Query(20, gt=0, le=1000)):
    try:
        cache_key = f"top_tokens_{top}"
        cached = get_cache(cache_key)
        if cached:
            return {"data": cached}
        con = duckdb.connect()
        query = f"""
            SELECT token_mint_address, COUNT(*) as count
            FROM read_csv_auto('{CSV_PATH}')
            GROUP BY token_mint_address
            ORDER BY count DESC
            LIMIT {top}
        """
        df = con.execute(query).df()
        result = [
            {"token_mint_address": row["token_mint_address"], "count": int(row["count"])}
            for _, row in df.iterrows()
        ]
        cache_with_expiry(cache_key, result, ttl=300)
        if not result:
            return {"data": result, "message": "无数据"}
        return {"data": result}
    except Exception as e:
        logger.error(f"/api/top_tokens error: {e}", exc_info=True)
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/api/price_ranges")
def price_ranges(
    price_type: str = Query("buy_price", regex="^(buy_price|sell_price)$"),
    price_unit: str = Query("USD", regex="^(SOL|USD)$"),
    sol_price: float = Query(133, gt=0)
):
    try:
        # 固定6个区间（单位USD）
        bins = [0, 10, 100, 1000, 10000, 100000, 1e20]
        labels = [
            "0-10",
            "10-100",
            "100-1K",
            "1K-10K",
            "10K-100K",
            "100K以上"
        ]
        cache_key = f"price_ranges_{price_type}_{price_unit}_{sol_price}_v2"
        cached = get_cache(cache_key)
        if cached:
            return {"data": cached}
        con = duckdb.connect()
        query = f"SELECT {price_type}_sol FROM read_csv_auto('{CSV_PATH}') WHERE {price_type}_sol IS NOT NULL AND {price_type}_sol > 0"
        df = con.execute(query).df()
        prices = df[price_type + "_sol"].sort_values().to_list()
        n = len(prices)
        if price_unit == "SOL":
            prices_usd = prices
        else:
            prices_usd = [p * sol_price for p in prices]
        total = len(prices_usd)
        bin_ranges = []
        for i in range(len(bins)):
            low = bins[i]
            high = bins[i+1] if i+1 < len(bins) else 1e20
            count = sum(1 for p in prices_usd if low <= p < high) if high != 1e20 else sum(1 for p in prices_usd if p >= low)
            percent = round(100 * count / total, 2) if total > 0 else 0
            bin_ranges.append({
                "label": labels[i],
                "low": low,
                "high": None if i+1 == len(bins) else high,
                "count": count,
                "percent": percent
            })
        result = {"bins": bin_ranges, "unit": "USD", "total": total}
        def safe_json(obj):
            if isinstance(obj, dict):
                return {k: safe_json(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [safe_json(x) for x in obj]
            elif isinstance(obj, float):
                # 统一处理所有非法JSON float
                if obj == float('inf') or obj == float('-inf') or obj == 1e20 or obj == -1e20:
                    return None
                if obj != obj:  # NaN
                    return None
                return float(obj)
            return obj
        safe_result = safe_json(result)
        cache_with_expiry(cache_key, safe_result, ttl=300)
        return {"data": safe_result}
    except Exception as e:
        logger.error(f"/api/price_ranges error: {e}", exc_info=True)
        return JSONResponse(content={"error": str(e)}, status_code=500)

# 共用查詢+欄位補全函式（支援 return_detail 決定回傳明細或統計）
def query_and_enrich(
    price_type: str,
    price_unit: str,
    sol_price: float,
    token_list: Optional[str] = None,
    price_bin: Optional[int] = None,
    page: int = 1,
    page_size: int = 20,
    buy_price_filter: Optional[str] = None,
    bins: Optional[list] = None,
    fetch_all: bool = False,
    return_detail: bool = True,
    abnormal_only: bool = False,
    abnormal_condition: str = ""
):
    con = duckdb.connect()
    # 處理 price_col 與 where 條件
    def col_expr(col):
        if col == 'buy_price_usd':
            return f"buy_price_sol*{sol_price}"
        elif col == 'sell_price_usd':
            return f"sell_price_sol*{sol_price}"
        else:
            # 兼容旧逻辑，buy_price/sell_price直接映射为buy_price_sol/sell_price_sol
            if col == 'buy_price':
                return 'buy_price_sol'
            elif col == 'sell_price':
                return 'sell_price_sol'
            return col
    where_clauses = []
    if token_list:
        tokens = [f"'{x.strip()}'" for x in token_list.split(",") if x.strip()]
        tokens_str = ",".join(tokens)
        where_clauses.append(f"token_mint_address IN ({tokens_str})")
    if buy_price_filter == 'gt0':
        where_clauses.append("buy_price_sol > 0")
    elif buy_price_filter == 'eq0':
        where_clauses.append("buy_price_sol = 0")
    if abnormal_only:
        where_clauses.append(abnormal_condition)
    if price_unit == "SOL":
        # 兼容前端传buy_price/sell_price
        if price_type == 'buy_price':
            price_col = 'buy_price_sol'
        elif price_type == 'sell_price':
            price_col = 'sell_price_sol'
        else:
            price_col = price_type
    else:
        price_col = price_type + "_usd"
    # bins 過濾
    if bins is not None and price_bin is not None and 0 <= price_bin < len(bins)-1:
        low = bins[price_bin]
        high = bins[price_bin+1] if price_bin+1 < len(bins) else 1e20
        where_clauses.append(f"{col_expr(price_col)} >= {low}")
        if high != 1e20:
            where_clauses.append(f"{col_expr(price_col)} < {high}")
    where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
    # 明細查詢
    if return_detail:
        # 只查當頁資料
        select_cols = "*"
        select_expr = f"{select_cols}, buy_price_sol, sell_price_sol, buy_price_sol*{sol_price} AS buy_price_usd, sell_price_sol*{sol_price} AS sell_price_usd"
        sql = f"SELECT {select_expr} FROM read_parquet('{PARQUET_PATH}') WHERE {where_sql} LIMIT {page_size} OFFSET {(page-1)*page_size}"
        df = con.execute(sql).df()
        # 統計總數
        count_sql = f"SELECT COUNT(*) AS total FROM read_parquet('{PARQUET_PATH}') WHERE {where_sql}"
        total = con.execute(count_sql).fetchone()[0]
        def enrich_time_fields(row):
            row = dict(row)
            ts = row.get("trade_timestamp")
            return {
                **row,
                "trade_time_gmt8": to_gmt8(ts) if ts else None,
                "trade_time_gmt0": to_gmt0(ts) if ts else None,
                "solscan_link": f"https://solscan.io/tx/{row.get('transaction_signature','')}" if row.get("transaction_signature") else "",
                "gmgn_link": f"https://www.gmgn.ai/sol/token/{row.get('token_mint_address','')}" if row.get("token_mint_address") else ""
            }
        data = df.to_dict(orient='records')
        enriched = [enrich_time_fields(r) for r in data]
        def safe_json(obj):
            if isinstance(obj, dict):
                return {k: safe_json(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [safe_json(x) for x in obj]
            elif isinstance(obj, float):
                # 统一处理所有非法JSON float
                if obj == float('inf') or obj == float('-inf') or obj == 1e20 or obj == -1e20:
                    return None
                if obj != obj:  # NaN
                    return None
                return float(obj)
            return obj
        return safe_json(enriched), total
    else:
        # 只做統計（同時計算 SOL 和 USD 統計）
        if price_type in ['buy_price', 'sell_price']:
            sol_col = 'buy_price_sol' if price_type == 'buy_price' else 'sell_price_sol'
            usd_col = f"{price_type}_usd"
            # 補全 usd 欄位
            try:
                sql_tmp = f"SELECT {sol_col}, {sol_col}*{sol_price} AS {usd_col} FROM read_parquet('{PARQUET_PATH}') WHERE {where_sql}"
                df_tmp = con.execute(sql_tmp).df()
                sol_vals = df_tmp[sol_col]
                usd_vals = df_tmp[usd_col]
                stats = {
                    "count": len(sol_vals),
                    "avg_sol": sol_vals.mean(),
                    "min_sol": sol_vals.min(),
                    "max_sol": sol_vals.max(),
                    "avg_usd": usd_vals.mean(),
                    "min_usd": usd_vals.min(),
                    "max_usd": usd_vals.max(),
                }
            except Exception as e:
                logger.error(f"query_and_enrich stats error: {e}", exc_info=True)
                stats = {"count": 0, "avg_sol": None, "min_sol": None, "max_sol": None, "avg_usd": None, "min_usd": None, "max_usd": None}
        else:
            agg_sql = f"SELECT COUNT(*) AS count, AVG({col_expr(price_col)}) AS avg, MIN({col_expr(price_col)}) AS min, MAX({col_expr(price_col)}) AS max FROM read_parquet('{PARQUET_PATH}') WHERE {where_sql}"
            stats = con.execute(agg_sql).fetchdf().to_dict('records')[0]
            if not isinstance(stats, dict):
                stats = dict(stats)
        def safe_json(obj):
            if isinstance(obj, dict):
                return {k: safe_json(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [safe_json(x) for x in obj]
            elif isinstance(obj, float):
                # 统一处理所有非法JSON float
                if obj == float('inf') or obj == float('-inf') or obj == 1e20 or obj == -1e20:
                    return None
                if obj != obj:  # NaN
                    return None
                return float(obj)
            return obj
        return safe_json(stats), None

@app.get("/api/filter_data")
def filter_data(
    price_type: str = Query("buy_price", pattern="^(buy_price|sell_price)$"),
    price_unit: str = Query("USD", pattern="^(SOL|USD)$"),
    sol_price: float = Query(133, gt=0),
    token_list: Optional[str] = Query(None),
    price_bin: Optional[int] = Query(None),
    page: int = Query(1, gt=0),
    page_size: int = Query(20, gt=0, le=200),
    buy_price_filter: Optional[str] = Query(None),
    abnormal_only: bool = Query(False)
):
    try:
        bins = [0, 10, 100, 1000, 10000, 100000, 1e20]
        # 新增異常值過濾條件
        abnormal_condition = "((type = 'buy_token' AND (buy_price_sol IS NULL OR buy_price_sol = 0 OR isnan(buy_price_sol))) OR (type = 'sell_token' AND (sell_price_sol IS NULL OR sell_price_sol = 0 OR isnan(sell_price_sol))))"
        # 查詢明細
        data, total = query_and_enrich(
            price_type=price_type,
            price_unit=price_unit,
            sol_price=sol_price,
            token_list=token_list,
            price_bin=price_bin,
            page=page,
            page_size=page_size,
            buy_price_filter=buy_price_filter,
            bins=bins,
            abnormal_only=abnormal_only,
            abnormal_condition=abnormal_condition,
            return_detail=True
        )
        # 查詢統計
        summary, _ = query_and_enrich(
            price_type=price_type,
            price_unit=price_unit,
            sol_price=sol_price,
            token_list=token_list,
            price_bin=price_bin,
            page=page,
            page_size=page_size,
            buy_price_filter=buy_price_filter,
            bins=bins,
            abnormal_only=abnormal_only,
            abnormal_condition=abnormal_condition,
            return_detail=False
        )
        return {"data": data, "total": total, "page": page, "page_size": page_size, "summary": summary}
    except Exception as e:
        logger.error(f"/api/filter_data error: {e}", exc_info=True)
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get('/api/batch_bins_data')
def batch_bins_data(
    price_type: str = Query("buy_price", regex="^(buy_price|sell_price)$"),
    price_unit: str = Query("USD", regex="^(SOL|USD)$"),
    sol_price: float = Query(133, gt=0),
    bins: str = Query("3,4,5"),
    page: Optional[int] = Query(None, gt=0),
    page_size: int = Query(20, gt=0, le=200),
    page_start: Optional[int] = Query(None, gt=0),
    page_end: Optional[int] = Query(None, gt=0),
    mode: Optional[str] = Query(None),
    return_detail: bool = Query(True)
):
    """
    多模式 batch_bins_data：
    - mode=init: 返回所有 bins 的第一页
    - page_start/page_end: 返回某 bin 的多页（如1-5页）
    - page: 返回某 bin 的单页
    支持 bins=2,3,4,5,1,0
    """
    try:
        bins_idx = [int(x) for x in bins.split(",") if x.strip().isdigit()]
        bins_edges = [0, 10, 100, 1000, 10000, 100000, 1e20]
        result = {}
        # 模式A：mode=init，所有 bins 的第一页
        if mode == 'init':
            for idx in bins_idx:
                data, total = query_and_enrich(
                    price_type=price_type,
                    price_unit=price_unit,
                    sol_price=sol_price,
                    price_bin=idx,
                    bins=bins_edges,
                    page=1,
                    page_size=page_size,
                    return_detail=return_detail
                )
                summary, _ = query_and_enrich(
                    price_type=price_type,
                    price_unit=price_unit,
                    sol_price=sol_price,
                    price_bin=idx,
                    bins=bins_edges,
                    page=1,
                    page_size=1000000,
                    return_detail=False
                )
                json_high = None if idx+1 == len(bins_edges)-1 else float(bins_edges[idx+1])
                json_low = float(bins_edges[idx])
                result[idx] = {'pages': {1: data}, 'total': total, 'low': json_low, 'high': json_high, 'summary': summary}
            return result
        # 模式B：批量多页
        elif page_start and page_end:
            idx = bins_idx[0]  # 只支持单bin批量多页
            pages = {}
            total = 0
            # 修复：对每一页单独查询数据，确保每页正确的记录数
            for p in range(page_start, page_end+1):
                # 确保每页使用正确的page参数，并指定正确的page_size
                data, t = query_and_enrich(
                    price_type=price_type,
                    price_unit=price_unit,
                    sol_price=sol_price,
                    price_bin=idx,
                    bins=bins_edges,
                    page=p,  # 关键修复：确保每页使用正确的页码
                    page_size=page_size,  # 使用指定的page_size
                    return_detail=return_detail
                )
                # 记录该页的数据，每页应有page_size条（除非最后一页可能少于page_size）
                pages[p] = data
                total = t  # 保留总记录数
            summary, _ = query_and_enrich(
                price_type=price_type,
                price_unit=price_unit,
                sol_price=sol_price,
                price_bin=idx,
                bins=bins_edges,
                page=1,
                page_size=1000000,
                return_detail=False
            )
            json_high = None if idx+1 == len(bins_edges)-1 else float(bins_edges[idx+1])
            json_low = float(bins_edges[idx])
            result[idx] = {'pages': pages, 'total': total, 'low': json_low, 'high': json_high, 'summary': summary}
            return result
        # 模式C：单页
        elif page:
            for idx in bins_idx:
                data, total = query_and_enrich(
                    price_type=price_type,
                    price_unit=price_unit,
                    sol_price=sol_price,
                    price_bin=idx,
                    bins=bins_edges,
                    page=page,
                    page_size=page_size,
                    return_detail=return_detail
                )
                summary, _ = query_and_enrich(
                    price_type=price_type,
                    price_unit=price_unit,
                    sol_price=sol_price,
                    price_bin=idx,
                    bins=bins_edges,
                    page=1,
                    page_size=1000000,
                    return_detail=False
                )
                json_high = None if idx+1 == len(bins_edges)-1 else float(bins_edges[idx+1])
                json_low = float(bins_edges[idx])
                result[idx] = {'pages': {page: data}, 'total': total, 'low': json_low, 'high': json_high, 'summary': summary}
            return result
        else:
            return {"error": "参数不合法，需指定 mode=init 或 page_start/page_end 或 page"}
    except Exception as e:
        logger.error(f"/api/batch_bins_data error: {e}", exc_info=True)
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/api/birdeye_prices")
def birdeye_prices(trades: List[dict]):
    """
    批量获取Birdeye价格。trades为包含'token_mint_address'和'trade_time'的dict列表。
    返回每笔交易的价格（若无则为'-'）。
    """
    try:
        prices = batch_birdeye_prices(trades)
        return {"prices": prices}
    except Exception as e:
        logger.error(f"/api/birdeye_prices error: {e}", exc_info=True)
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/api/slot_timestamps")
def slot_timestamps_api(req: dict):
    """
    批量获取Solana slot的区块时间戳。POST: {slots: [slot1, slot2, ...]}
    返回: {timestamps: {slot: timestamp, ...}}
    """
    try:
        slots = req.get("slots", [])
        if not isinstance(slots, list):
            return JSONResponse(content={"error": "slots参数必须为列表"}, status_code=400)
        timestamps = get_slot_timestamps(slots)
        return {"timestamps": timestamps}
    except Exception as e:
        logger.error(f"/api/slot_timestamps error: {e}", exc_info=True)
        return JSONResponse(content={"error": str(e)}, status_code=500)
