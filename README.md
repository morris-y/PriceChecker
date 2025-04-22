![image](https://github.com/user-attachments/assets/59721d32-2869-4553-a082-1a91c9de82e9)

### 描述

1. 原始資料與預處理
原始資料（raw data）來自於 SlotTest.csv 或 SlotTest_with_header.csv。
通常會先用 duckdb 將 csv 轉換成 parquet 格式（SlotTest_with_header.parquet），以便更高效查詢。
配置檔 backend/config.py 會指定這些檔案的路徑。

2. 後端服務（FastAPI）
主要邏輯都寫在 backend/main.py，使用 FastAPI 提供 API 介面，並用 duckdb 直接查詢 parquet 檔案。

#### 主要 API 與功能步驟

a. /api/filter_data

步驟
  - 用 duckdb 讀取 parquet 檔（read_parquet）。
  - 根據請求參數（如 token、價格區間、價格單位、異常值過濾等）做過濾、分頁。
  - 轉換時間戳為 GMT+8/GMT0 格式。
  - 結果做 NaN/inf 處理，返回 JSON。
  - 支持異常值過濾（如買價為0/NULL/NaN等），可選只顯示異常交易。
用途：根據條件篩選出你想要的交易資料，支持全量分頁、異常值檢查。

b. /api/batch_bins_data

步驟
  - 解析 bins 區間參數（預設六個價格區間，單位USD：0-10, 10-100, 100-1K, 1K-10K, 10K-100K, 100K以上）。
  - duckdb 查詢 parquet 檔，根據 bins 分組聚合資料。
  - 每個 bins 內再做分頁、統計，並計算 rows 占比（如買價區間占比）。
  - 轉換時間欄位，處理特殊數值，返回 JSON。
用途：分區間批量查詢價格分布與統計，支援區間占比展示。

c. /api/random_sample
步驟
  - duckdb 讀取 parquet 檔（read_parquet）。
  - 根據請求參數（如 rows、tokens、價格區間、token_list、價格單位等）先過濾，再隨機抽樣。
  - 返回的 data 僅為抽樣樣本（如100條），summary 僅針對這批樣本做描述性統計。
  - 轉換時間欄位，組裝回傳資料。
用途：根據複合條件隨機抽樣部分資料，供前端展示或測試，summary 反映樣本統計。

d. /api/top_tokens
步驟
  - duckdb 讀取 parquet 檔，統計出現最多的 token。
  - 支援快取，減少重複查詢。
用途：查詢出現頻率最高的 token。

3. 其他輔助邏輯
- 快取機制：部分查詢結果會快取（如 top_tokens），減少重複計算。
- 時間戳轉換：所有查詢結果都會將 unix timestamp 轉換為人類可讀的時間（GMT+8, GMT0）。
- NaN/inf 處理：所有返回資料都會做特殊數值處理，避免前端解析錯誤。
- CORS 支援：允許前端本地開發跨域請求。
- 日誌記錄：所有請求與錯誤都會記錄日誌，方便追蹤問題。

4. 前端（frontend）
前端部分在 frontend 目錄，主要負責呼叫上述 API 並展示查詢結果，不影響數據讀取邏輯。

總結流程（以 filter_data 為例）
前端發請求（帶參數）到 /api/filter_data。
FastAPI 處理請求，duckdb 查詢 parquet 檔，過濾並分頁。
轉換時間欄位，處理特殊數值。
返回 JSON 給前端。

---

功能说明：

1. 基於價格實現的多级筛选
- 六個價格區間（USD）：0-10、10-100、100-1K、1K-10K、10K-100K、100K以上。
- 每個區間會顯示 rows 占比（如買價在所有買價中的占比）。
- 支持根據價格區間、token、type等多條件篩選。

2. 隨機抽樣為二級篩選
- 選擇價格區間等條件後，預設展示全量分頁。
- 輸入 rows/tokens 並查詢後，才會根據當前條件進行隨機抽樣，僅展示抽樣樣本及其統計。
- rows 必須 >0 且 <=10000，tokens 必須 >0 且 <=1000。

3. 優化策略
- 支持分批加載六個價格區間（可從價格高的開始預加載/快取）。
- 前端可根據需要先行展示部分區間結果，提升用戶體驗。

#### 使用

cd PriceChecker\frontend
npm start

cd PriceChecker\backend
python -m uvicorn main:app --reload

如果需要 duckdb 的 parquet 文件，可以运行 @preprocess_parquet.py

**新增birdeye 百分比栏位**

功能
在前端 PriceTable.js 组件中，已在“Birdeye价格”列右侧新增“Birdeye百分比差异”列。
该列百分比由前端计算，比较 buy_price_usd 或 sell_price_usd 与 birdeye_price 的百分比差异，仅保留两位小数，不做hover展示。
若任一数据为 null、空、- 或无效，直接显示“-”。
百分比为正数时显示绿色，为负数时显示红色，零为默认色，符合最佳实践。