import duckdb
import pandas as pd
from pathlib import Path

# 文件路径
csv_path = Path('SlotTest_with_header.csv')
parquet_path = Path('SlotTest_with_header.parquet')

# 连接 duckdb
con = duckdb.connect()

print('==== 1. 字段类型（schema）对比 ====')
# 新增：为csv和parquet创建临时view
con.execute(f"CREATE OR REPLACE VIEW csv_view AS SELECT * FROM read_csv_auto('{csv_path.as_posix()}')")
con.execute(f"CREATE OR REPLACE VIEW parquet_view AS SELECT * FROM '{parquet_path.as_posix()}'")
csv_schema = con.execute("PRAGMA table_info('csv_view')").fetchdf()
parquet_schema = con.execute("PRAGMA table_info('parquet_view')").fetchdf()
print('CSV Schema:')
print(csv_schema)
print('Parquet Schema:')
print(parquet_schema)

print('\n==== 2. 前5行内容对比 ====')
csv_sample = con.execute("SELECT * FROM csv_view LIMIT 5").fetchdf()
parquet_sample = con.execute("SELECT * FROM parquet_view LIMIT 5").fetchdf()
print('CSV Sample:')
print(csv_sample)
print('Parquet Sample:')
print(parquet_sample)

print('\n==== 3. 行数对比 ====')
csv_count = con.execute("SELECT COUNT(*) FROM csv_view").fetchone()[0]
parquet_count = con.execute("SELECT COUNT(*) FROM parquet_view").fetchone()[0]
print(f'CSV 行数: {csv_count}')
print(f'Parquet 行数: {parquet_count}')

print('\n==== 4. 检查 buy_price/buy_price_usd 的特殊值（NULL/NaN/inf）====')
# 检查字段是否存在
fields = [col for col in parquet_schema['name'].tolist() if col in ['buy_price', 'buy_price_usd']]
for field in fields:
    print(f'检查字段: {field}')
    sql = f"SELECT * FROM parquet_view WHERE {field} IS NULL OR isnan({field}) OR isinf({field}) LIMIT 5"
    res = con.execute(sql).fetchdf()
    print(res)

print('\n==== 5. CSV 与 Parquet 差异（前5条）====')
diff = con.execute("SELECT * FROM csv_view EXCEPT SELECT * FROM parquet_view LIMIT 5").fetchdf()
print(diff)

print('\n==== 6. 检查 csv/parquet 买入数量有但买入价格无的行（前20条）====')
csv_problem = con.execute("SELECT buy_amount, buy_price FROM csv_view WHERE buy_amount > 0 AND (buy_price IS NULL OR buy_price = 0) LIMIT 20").fetchdf()
parquet_problem = con.execute("SELECT buy_amount, buy_price FROM parquet_view WHERE buy_amount > 0 AND (buy_price IS NULL OR buy_price = 0) LIMIT 20").fetchdf()
print('CSV 问题行:')
print(csv_problem)
print('Parquet 问题行:')
print(parquet_problem)

con.close()
