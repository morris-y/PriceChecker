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

export const fetchBatchBinsData = async ({ priceType, bins, page = 1, pageSize = 20 }) => {
  const params = {
    price_type: priceType,
    bins: bins.join(','),
    page,
    page_size: pageSize
  };
  const res = await axios.get(`${API_BASE}/batch_bins_data`, { params });
  return res.data;
};
