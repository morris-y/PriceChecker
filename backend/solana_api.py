import requests
import time

def get_slot_timestamps(slots, endpoint="https://api.mainnet-beta.solana.com"):
    """
    批量获取Solana slot的区块时间戳，返回{slot: timestamp}
    slots: list[int]
    """
    result = {}
    for idx, slot in enumerate(slots):
        # 构造请求体
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBlockTime",
            "params": [int(slot)]
        }
        try:
            resp = requests.post(endpoint, json=payload, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            ts = data.get("result", None)
            result[slot] = ts
        except Exception as e:
            result[slot] = None
        # 限流：每次请求后sleep 1秒，最后一条不sleep
        if idx != len(slots) - 1:
            time.sleep(1)
    return result
