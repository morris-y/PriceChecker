import axios from "axios";

const API_BASE = "http://localhost:8000/api";

export const fetchRandomSample = async (rows, tokens, { priceType, priceUnit, solPrice, token, priceBin } = {}) => {
  const params = { rows, tokens };
  if (priceType) params.price_type = priceType;
  if (priceUnit) params.price_unit = priceUnit;
  if (solPrice) params.sol_price = solPrice;
  if (token) params.token_list = token;
  if (priceBin !== undefined && priceBin !== null) params.price_bin = priceBin;
  const res = await axios.get(`${API_BASE}/random_sample`, { params });
  return res.data;
};

export const fetchTopTokens = async (top = 20) => {
  const res = await axios.get(`${API_BASE}/top_tokens`, {
    params: { top }
  });
  return res.data.data;
};

export const fetchPriceRanges = async (priceType = "buy_price") => {
  const res = await axios.get(`${API_BASE}/price_ranges`, {
    params: { price_type: priceType }
  });
  return res.data.data;
};

export const fetchFilterData = async ({ priceType, priceUnit, solPrice, token, priceBin, page, pageSize, buyPriceFilter, abnormal_only }) => {
  const params = {
    price_type: priceType,
    price_unit: priceUnit,
    sol_price: solPrice,
    page,
    page_size: pageSize
  };
  if (token) params.token_list = token;
  if (priceBin !== undefined && priceBin !== null) params.price_bin = priceBin;
  if (buyPriceFilter) params.buy_price_filter = buyPriceFilter;
  if (abnormal_only) params.abnormal_only = abnormal_only;
  const res = await axios.get(`${API_BASE}/filter_data`, { params });
  return res.data;
};

// 新增支持多模式批量bins分页数据加载
export const fetchBatchBinsData = async (paramsObj) => {
  console.debug('[DEBUG] fetchBatchBinsData called with:', JSON.stringify(paramsObj, null, 2));
  const { priceType, priceUnit, solPrice, bins, page, pageSize, pageStart, pageEnd, mode } = paramsObj;
  
  // 检查参数详细信息
  console.debug('[DEBUG] Parameter details:', {
    priceType,
    priceUnit,
    solPrice,
    bins,
    pageSize,
    page: page || 'undefined',
    pageStart: pageStart || 'undefined',
    pageEnd: pageEnd || 'undefined',
    mode: mode || 'undefined',
    hasPage: !!page,
    hasPageRange: !!(pageStart && pageEnd),
    hasMode: !!mode
  });
  
  // 检查必须参数
  if (!priceType || !priceUnit || !solPrice || !bins || !bins.length || !pageSize) {
    console.error('[ERROR] Missing required parameters:', { priceType, priceUnit, solPrice, bins, pageSize });
    throw new Error('fetchBatchBinsData 缺少必须的参数');
  }
  
  // 安全地解析数字参数，确保转换为有效的数字
  const safeParseInt = (val) => {
    if (val === undefined || val === null) return null;
    const num = Number(val);
    return !isNaN(num) && Number.isFinite(num) ? num : null;
  };
  
  const parsedPage = safeParseInt(page);
  const parsedPageStart = safeParseInt(pageStart);
  const parsedPageEnd = safeParseInt(pageEnd);
  
  // 创建参数对象
  const params = {
    price_type: priceType,
    price_unit: priceUnit,
    sol_price: solPrice,
    bins: bins.join(','),
    page_size: pageSize
  };
  
  // 检测请求模式并设置参数
  let requestMode = '';
  
  if (mode) {
    params.mode = mode;
    requestMode = 'mode';
  }
  
  if (parsedPageStart !== null && parsedPageEnd !== null) {
    params.page_start = parsedPageStart;
    params.page_end = parsedPageEnd;
    requestMode = 'page_range';
  } else if (parsedPage !== null) {
    params.page = parsedPage;
    requestMode = 'single_page';
  }
  
  // 修改验证逻辑：只要有一个有效的模式即可
  if (!requestMode) {
    console.error('[ERROR] No valid request mode specified, received:', {
      page,
      pageStart,
      pageEnd,
      mode,
      parsedPage,
      parsedPageStart,
      parsedPageEnd
    });
    throw new Error('fetchBatchBinsData 缺少有效的模式参数（mode/page/pageStart+pageEnd）');
  }
  
  console.debug(`[DEBUG] Sending batch request in ${requestMode} mode with params:`, params);
  
  try {
    const res = await axios.get(`${API_BASE}/batch_bins_data`, { params });
    console.debug('[DEBUG] Batch data response:', { mode: requestMode, binsRequested: bins, binsReturned: Object.keys(res.data) });
    return res.data;
  } catch (error) {
    console.error('[ERROR] fetchBatchBinsData failed:', error);
    throw error;
  }
};

export const fetchBirdeyePrices = async (trades) => {
  // trades: [{token_mint_address, trade_time}]
  const res = await axios.post(`${API_BASE}/birdeye_prices`, trades);
  return res.data.prices;
};
