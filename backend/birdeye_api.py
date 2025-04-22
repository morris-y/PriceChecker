import os
import requests
from dotenv import load_dotenv
from datetime import datetime, timedelta
from typing import List, Dict, Any

# Load API Key from env file (absolute path)
load_dotenv(r'N:/Windsurf/Hubble-QA/QA-20250411/Birdeye/.env')
BIRDEYE_API_KEY = os.getenv('BIRDEYE_API_KEY')

BIRDEYE_URL = "https://public-api.birdeye.so/defi/history_price"


def get_birdeye_price(address: str, trade_time: int, chain: str = "solana") -> Any:
    """
    获取单笔交易的Birdeye价格，trade_time为秒级Unix时间戳（GMT+8），自动转为分钟区间（UTC）。
    """
    # 转为 UTC
    dt_utc = datetime.utcfromtimestamp(trade_time - 8 * 3600)
    minute_start = dt_utc.replace(second=0, microsecond=0)
    minute_end = dt_utc.replace(second=59, microsecond=0)
    time_from = int(minute_start.timestamp())
    time_to = int(minute_end.timestamp())

    params = {
        "address": address,
        "address_type": "token",
        "type": "1m",
        "time_from": time_from,
        "time_to": time_to,
    }
    headers = {
        "accept": "application/json",
        "x-chain": chain,
        "X-API-KEY": BIRDEYE_API_KEY,
    }
    resp = requests.get(BIRDEYE_URL, params=params, headers=headers, timeout=10)
    resp.raise_for_status()
    return resp.json()


def batch_birdeye_prices(trades: List[Dict[str, Any]]) -> List[Any]:
    """
    批量获取Birdeye价格。trades为包含'token_mint_address'和'trade_time'的dict列表。
    返回每笔交易的价格（若无则为'-'）。
    """
    import time
    results = []
    for idx, trade in enumerate(trades):
        try:
            address = trade['token_mint_address']
            trade_time = int(trade['trade_time'])
            data = get_birdeye_price(address, trade_time)
            items = data.get('data', {}).get('items', [])
            if items and isinstance(items, list) and len(items) > 0:
                results.append(items[0]['value'])
            else:
                results.append('-')
        except Exception as e:
            results.append('-')
        # 限流：每次请求后sleep 1秒，最后一条不sleep
        if idx != len(trades) - 1:
            time.sleep(1)
    return results
