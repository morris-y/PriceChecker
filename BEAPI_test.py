import os
import requests
from dotenv import load_dotenv
from datetime import datetime, timedelta

# 1. 读取API KEY
load_dotenv(r'N:\Windsurf\Hubble-QA\QA-20250411\Birdeye\.env')
API_KEY = os.getenv('BIRDEYE_API_KEY')

# 2. 构造参数
token_mint_address = "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN"  # 示例
# 假设交易时间为 2025-04-18 23:55:45 GMT+8
dt = datetime(2025, 4, 18, 23, 55, 45)
# 转为 UTC 时间戳
dt_utc = dt - timedelta(hours=8)
minute_start = dt_utc.replace(second=0)
minute_end = dt_utc.replace(second=59)
time_from = int(minute_start.timestamp())
time_to = int(minute_end.timestamp())

url = (
    f"https://public-api.birdeye.so/defi/history_price?"
    f"address={token_mint_address}&address_type=token&type=1m"
    f"&time_from={time_from}&time_to={time_to}"
)

headers = {
    "accept": "application/json",
    "x-chain": "solana",
    "X-API-KEY": API_KEY,
}

response = requests.get(url, headers=headers)
print(response.json())