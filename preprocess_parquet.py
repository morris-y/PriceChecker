import pandas as pd
from pathlib import Path

# 文件路徑
csv_path = Path('SlotTest_with_header.csv')
parquet_path = Path('SlotTest_with_header.parquet')

# 讀取 CSV
print(f'Reading CSV: {csv_path}')
df = pd.read_csv(csv_path)

# 檢查 trade_timestamp 欄位
if 'trade_timestamp' not in df.columns:
    raise ValueError('找不到 trade_timestamp 欄位，請確認 CSV 檔案格式正確！')

# 新增 DATETIME 欄位
print('Adding trade_datetime (datetime64[ns]) column...')
df['trade_datetime'] = pd.to_datetime(df['trade_timestamp'], unit='ms')

# 儲存為 Parquet
print(f'Writing Parquet: {parquet_path}')
df.to_parquet(parquet_path, index=False)

print('Done! 已在 Parquet 文件中新增 trade_datetime 欄位，後續可直接用於 DuckDB 查詢。')
