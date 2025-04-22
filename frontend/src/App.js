import React, { useState, useEffect, useRef } from "react";
import { Layout, InputNumber, Button, Row, Col, Typography, message, Select, Spin, Tabs } from "antd";
import PriceTable from "./components/PriceTable";
import AbnormalFilterButton from "./components/AbnormalFilterButton";
import { fetchRandomSample, fetchTopTokens, fetchBatchBinsData, fetchFilterData, fetchBirdeyePrices } from "./api";

const { Header, Content } = Layout;
const { Title } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

function App() {
  const [rows, setRows] = useState(100);
  const [tokens, setTokens] = useState(10);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [topTokens, setTopTokens] = useState([]);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const [priceType, setPriceType] = useState("buy_price");
  const [priceUnit, setPriceUnit] = useState("USD"); 
  const [timezone, setTimezone] = useState("gmt8");
  const [showFullToken, setShowFullToken] = useState(false);
  const [solPrice, setSolPrice] = useState(133); 
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [mode, setMode] = useState('all'); // all: 全量分页, sample: 随机抽样
  const [summary, setSummary] = useState(null);
  const [samplePage, setSamplePage] = useState(1);
  const [samplePageSize, setSamplePageSize] = useState(20);
  const [abnormalMode, setAbnormalMode] = useState(false); // 新增异常模式
  const [birdeyeLoading, setBirdeyeLoading] = useState(false);
  const [birdeyeStatus, setBirdeyeStatus] = useState(null); // 'loading' | 'success' | 'error'

  // 控件尺寸（用于 antd 组件）
  const controlSize = "middle";

  // 区间tab相关
  const binIdxList = [2, 3, 4, 5, 1, 0]; // 调整顺序为 2,3,4,5,1,0
  const [activeBin, setActiveBin] = useState(2); // 默认展示 bins=2
  const [binData, setBinData] = useState({}); // {binIdx: {pages: {pageNum: data[]}, total, summary, loadedPageRange}}
  const [binLoading, setBinLoading] = useState(false);

  useEffect(() => {
    setActiveBin(2); // 保证初次渲染时tab正确
  }, []);

  useEffect(() => {
    if (mode === 'sample') {
      setSamplePage(1);
      setSamplePageSize(20);
    }
  }, [mode]);

  useEffect(() => {
    if (mode === 'sample') {
      setSamplePage(1);
    }
  }, [mode]);

  // 僅在 mode !== 'sample' 時才根據 selectedToken 自動過濾 data
  useEffect(() => {
    if (mode !== 'sample') {
      let intermediateData = data;
      if (selectedToken) {
        intermediateData = intermediateData.filter(row => row.token_mint_address === selectedToken);
      }
      setData(intermediateData);
    }
  }, [data, selectedToken, mode]);

  // 价格区间详细文案（USD为锚点，bins区间始终以USD为主）
  const binLabels = [
    "0-10 USD",
    "10-100 USD",
    "100-1K USD",
    "1K-10K USD",
    "10K-100K USD",
    "100K+ USD"
  ];

  useEffect(() => {
    setTokenLoading(true);
    fetchTopTokens(20)
      .then(setTopTokens)
      .catch(err => console.error("Fetch top tokens error:", err))
      .finally(() => setTokenLoading(false));
  }, []);

  useEffect(() => {
    console.debug('[DEBUG] 初始化请求所有区间第一页数据');
    setBinLoading(true);
    
    // 初始化请求：仅请求所有区间的第一页数据
    fetchBatchBinsData({
      priceType, 
      priceUnit: 'USD', // 确保所有价格区间（bins/tab）始终以USD为主锚定
      solPrice,
      bins: binIdxList,  // 所有区间
      pageSize: pageSize || 20,
      mode: 'init'
    })
      .then(res => {
        console.debug('[DEBUG] 初始化加载成功:', Object.keys(res));
        // 统一缓存结构
        const newBinData = {};
        for (const idx of binIdxList) {
          if (res[idx]) {
            newBinData[idx] = {
              pages: { 1: res[idx].pages[1] || [] },
              total: res[idx].total,
              summary: res[idx].summary,
              loadedPageRange: [[1,1]] // 仅记录第一页已加载
            };
          }
        }
        setBinData(newBinData);
        
        // 检查是否有当前激活区间的第一页数据
        const hasActiveFirstPage = newBinData[activeBin] && newBinData[activeBin].pages && newBinData[activeBin].pages[1];
        
        if (hasActiveFirstPage) {
          // 只要获取到第一个区间的第一页数据，就允许用户交互（不等待所有区间数据）
          console.debug(`[DEBUG] 已获取当前区间${activeBin}第一页数据，解除加载状态`); 
          setBinLoading(false);
          
          // 后台异步加载当前激活区间的第2-5页
          console.debug(`[DEBUG] 后台异步加载当前区间${activeBin}的2-5页数据`);
          loadCurrentBinPages(activeBin, 2, 5);
        } else {
          console.warn(`[WARN] 返回数据中没有当前区间${activeBin}的第一页`);
          message.error(`无法获取价格区间${activeBin}的数据`);
          setBinLoading(false);
        }
      })
      .catch(err => {
        console.error('[ERROR] 初始化数据加载失败:', err);
        message.error('初始数据加载失败');
        setBinLoading(false);
      });
  }, []); // 移除eslint禁用注释，使用空依赖数组确保只在组件挂载时执行一次

  const loadCurrentBinPages = (binIdx, startPage, endPage) => {
    // 检查是否已缓存该区间的页面范围
    const loaded = binData[binIdx]?.loadedPageRange || [];
    const isRangeCached = loaded.some(([s, e]) => s <= startPage && e >= endPage);
    
    if (isRangeCached) {
      console.debug(`[DEBUG] 区间${binIdx}的${startPage}-${endPage}页已缓存，无需请求`);
      return;
    }
    
    // 确保所有参数都是有效的数字类型
    const currentPageSize = Number(pageSize || 20);
    const binIdxNumber = Number(binIdx);
    const startPageNumber = Number(startPage);
    const endPageNumber = Number(endPage);
    
    console.debug(`[DEBUG] 后台加载区间${binIdxNumber}的${startPageNumber}-${endPageNumber}页数据，pageSize=${currentPageSize}`, {
      binIdx: binIdxNumber,
      startPage: startPageNumber,
      endPage: endPageNumber,
      pageSize: currentPageSize,
      paramTypes: {
        binIdx: typeof binIdxNumber,
        startPage: typeof startPageNumber,
        endPage: typeof endPageNumber,
        pageSize: typeof currentPageSize
      }
    });
    
    // 后台异步加载该区间的指定页码范围
    fetchBatchBinsData({
      priceType, 
      priceUnit: 'USD', // 确保所有价格区间（bins/tab）始终以USD为主锚定
      solPrice,
      bins: [binIdxNumber],
      pageSize: currentPageSize,
      pageStart: startPageNumber,
      pageEnd: endPageNumber
      // 注意：不需要额外的mode参数，api.js已经修复了验证逻辑
    })
      .then(res => {
        if (res[binIdxNumber] && res[binIdxNumber].pages) {
          console.debug(`[DEBUG] 区间${binIdxNumber}的${startPageNumber}-${endPageNumber}页加载成功`);
          setBinData(prev => {
            const prevPages = prev[binIdxNumber]?.pages || {};
            const newPages = { ...prevPages, ...res[binIdxNumber].pages };
            return {
              ...prev,
              [binIdxNumber]: {
                ...prev[binIdxNumber],
                pages: newPages,
                total: res[binIdxNumber].total,
                summary: res[binIdxNumber].summary,
                loadedPageRange: mergeRanges((prev[binIdxNumber]?.loadedPageRange || []).concat([[startPageNumber, endPageNumber]]))
              }
            };
          });
        }
      })
      .catch(err => {
        console.error(`[ERROR] 加载区间${binIdxNumber}的${startPageNumber}-${endPageNumber}页失败:`, err);
      });
  };

  useEffect(() => {
    console.debug('[DEBUG] 价格参数变化，重置数据');
    // 清空所有缓存数据
    setBinData({});
    setPage(1);
    
    // 重新初始化所有区间第一页
    setBinLoading(true);
    fetchBatchBinsData({
      priceType, 
      priceUnit: 'USD', // 确保所有价格区间（bins/tab）始终以USD为主锚定
      solPrice,
      bins: binIdxList,
      pageSize: pageSize || 20,
      mode: 'init'
    })
      .then(res => {
        // 统一缓存结构
        const newBinData = {};
        for (const idx of binIdxList) {
          if (res[idx]) {
            newBinData[idx] = {
              pages: { 1: res[idx].pages[1] || [] },
              total: res[idx].total,
              summary: res[idx].summary,
              loadedPageRange: [[1,1]]
            };
          }
        }
        setBinData(newBinData);
        
        // 检查是否有当前激活区间的第一页数据
        const hasActiveFirstPage = newBinData[activeBin] && newBinData[activeBin].pages && newBinData[activeBin].pages[1];
        
        if (hasActiveFirstPage) {
          // 只要获取到第一个区间的第一页数据，就允许用户交互（不等待所有区间数据）
          console.debug(`[DEBUG] 已获取当前区间${activeBin}第一页数据，解除加载状态`); 
          setBinLoading(false);
          
          // 后台异步加载当前激活区间的第2-5页
          console.debug(`[DEBUG] 后台异步加载当前区间${activeBin}的2-5页数据`);
          loadCurrentBinPages(activeBin, 2, 5);
        } else {
          console.warn(`[WARN] 返回数据中没有当前区间${activeBin}的第一页`);
          message.error(`无法获取价格区间${activeBin}的数据`);
          setBinLoading(false);
        }
      })
      .catch(err => {
        console.error('[ERROR] 重置数据失败:', err);
        message.error('重置数据失败');
        setBinLoading(false);
      });
  }, [priceType, solPrice]);

  useEffect(() => {
    if (Object.keys(binData).length > 0) {
      console.debug('[DEBUG] 页面大小变化，重新加载数据');
      // 清空数据，重新初始化
      setBinData({});
      setPage(1);
      
      // 重新初始化所有区间第一页
      setBinLoading(true);
      fetchBatchBinsData({
        priceType, 
        priceUnit: 'USD', // 确保所有价格区间（bins/tab）始终以USD为主锚定
        solPrice,
        bins: binIdxList,
        pageSize: pageSize || 20,
        mode: 'init'
      })
        .then(res => {
          const newBinData = {};
          for (const idx of binIdxList) {
            if (res[idx]) {
              newBinData[idx] = {
                pages: { 1: res[idx].pages[1] || [] },
                total: res[idx].total,
                summary: res[idx].summary,
                loadedPageRange: [[1,1]]
              };
            }
          }
          setBinData(newBinData);
          loadCurrentBinPages(activeBin, 2, 5);
        })
        .catch(err => {
          console.error('[ERROR] 页面大小变化重载数据失败:', err);
          message.error('更新页面大小失败');
          setBinLoading(false);
        })
        .finally(() => setBinLoading(false));
    }
  }, [pageSize]);

  useEffect(() => {
    if (mode !== 'sample') {
      setPage(1);
      fetchPageData({ page: 1 });
    }
  }, [selectedToken, priceType, solPrice, mode]);

  // 异常值过滤切换
  const handleAbnormalFilter = () => {
    if (!abnormalMode) {
      setLoading(true);
      fetchFilterData({
        priceType,
        priceUnit: 'USD', // 确保所有价格区间（bins/tab）始终以USD为主锚定
        solPrice,
        token: selectedToken,
        page,
        pageSize,
        abnormal_only: true
      })
        .then(res => {
          setData(res.data || []);
          setTotal(res.total || 0);
          setSummary(res.summary || null);
          setMode('all');
          setAbnormalMode(true);
        })
        .catch(err => {
          message.error('获取异常数据失败');
          setData([]);
          setSummary(null);
        })
        .finally(() => setLoading(false));
    } else {
      setAbnormalMode(false);
      fetchPageData(); // 恢复全量
    }
  };

  const handleSampleTableChange = (pagination) => {
    setSamplePage(pagination.current);
    setSamplePageSize(pagination.pageSize);
  };

  const handleQuery = () => {
    setLoading(true);
    setSamplePage(1);
    setSamplePageSize(20);
    fetchRandomSample(rows, tokens, {
      priceType,
      priceUnit: 'USD', // 确保所有价格区间（bins/tab）始终以USD为主锚定
      solPrice,
      token: selectedToken,
      priceBin: activeBin // 傳遞當前tab bin index
    })
      .then(res => {
        setData(res.data || []);
        setTotal(res.total || 0);
        setSummary(res.summary || null);
        setMode('sample');
        message.success(`成功获取 ${res.data?.length || 0} 条随机样本`);
      })
      .catch(err => {
        message.error('获取数据失败');
        setData([]);
        setSummary(null);
      })
      .finally(() => setLoading(false));
  };

  // tab切换
  const handleTabChange = (key) => {
    const idx = Number(key);
    console.debug(`[DEBUG] 切换到区间${idx}`);
    
    // 设置当前区间
    setActiveBin(idx);
    setPage(1); // 切换区间时始终显示第一页
    
    // 检查是否已缓存该区间的第一页
    const binCache = binData[idx];
    const loadedRanges = binCache?.loadedPageRange || [];
    
    // 检查是否已缓存该区间的第一页
    if (!binCache || !binCache.pages || !binCache.pages[1]) {
      // 缓存不存在，需要请求第一页
      console.debug(`[DEBUG] 区间${idx}的第一页未缓存，需要请求`);
      setBinLoading(true);
      
      fetchBatchBinsData({
        priceType,
        priceUnit: 'USD', // 确保所有价格区间（bins/tab）始终以USD为主锚定
        solPrice,
        bins: [idx],
        pageSize: pageSize || 20,
        page: 1,
        mode: 'init' // 添加明确的模式参数
      })
        .then(res => {
          if (res[idx] && res[idx].pages) {
            console.debug(`[DEBUG] 区间${idx}的第一页加载成功`);
            setBinData(prev => ({
              ...prev,
              [idx]: {
                pages: { 1: res[idx].pages[1] || [] },
                total: res[idx].total,
                summary: res[idx].summary,
                loadedPageRange: [[1, 1]]
              }
            }));
            
            // 加载第一页成功后，异步加载2-5页
            setTimeout(() => loadCurrentBinPages(idx, 2, 5), 100);
          }
        })
        .catch(err => {
          console.error(`[ERROR] 请求区间${idx}的第一页失败:`, err);
          message.error('请求区间数据失败');
        })
        .finally(() => setBinLoading(false));
    } else {
      // 检查是否已缓存该区间的1-5页
      const has1to5 = loadedRanges.some(([s, e]) => s <= 1 && e >= 5);
      
      if (!has1to5) {
        console.debug(`[DEBUG] 区间${idx}的1-5页未缓存，需要批量加载`);
        // 加载2-5页
        setTimeout(() => loadCurrentBinPages(idx, 2, 5), 100);
      } else {
        console.debug(`[DEBUG] 区间${idx}的1-5页已缓存，无需请求`);
      }
    }
  };

  // 翻页加载
  const handleTableChange = (pagination) => {
    // 防御：数据未ready时直接跳过，避免undefined异常和无意义请求
    if (!binData[activeBin]) {
      console.debug('[DEBUG] 当前区间数据未准备好，跳过翻页处理');
      return;
    }
    
    const idx = activeBin;
    let curPage;
    let curPageSize = pageSize || 20;
    
    // 支持两种调用情况：
    // 1. pagination是一个包含当前页码和页大小的对象
    // 2. pagination直接是一个页码数字
    if (typeof pagination === 'object' && pagination !== null) {
      // 如果是对象，尝试从 pagination.current 获取页码
      curPage = pagination.current;
      if (pagination.pageSize !== undefined) {
        curPageSize = pagination.pageSize;
      }
    } else if (typeof pagination === 'number') {
      // 如果直接是数字，则使用这个数字作为页码
      curPage = pagination;
    } else {
      // 如果都不是，则使用当前状态的页码或默认值
      console.warn('[WARN] 无法从 pagination 参数获取页码，使用当前页码代替:', pagination);
      curPage = page || 1;
    }
    
    // 计算应批量加载哪5页，添加更严格的类型检查
    const curPageNumber = Number(curPage);
    if (isNaN(curPageNumber) || curPageNumber < 1) {
      console.error(`[ERROR] curPage转换为有效数字失败:`, { curPage, curPageType: typeof curPage });
      return; // 中止翻页操作
    }
    
    const curPageSizeNumber = Number(curPageSize);
    if (isNaN(curPageSizeNumber) || curPageSizeNumber < 1) {
      console.error(`[ERROR] curPageSize转换为有效数字失败:`, { curPageSize });
      return; // 中止翻页操作
    }
    
    // 记录调试信息
    console.debug(`[DEBUG] handleTableChange参数检查:`, {
      pagination,
      paginationType: typeof pagination,
      curPage,
      curPageNumber,
      curPageSize,
      curPageSizeNumber,
      idx
    });
    
    // 计算应批量加载哪5页
    const batchStart = Math.floor((curPageNumber - 1) / 5) * 5 + 1;
    const batchEnd = batchStart + 4;
    
    console.debug(`[DEBUG] 批量加载页码范围: ${batchStart}-${batchEnd}页`, {
      batchStart,
      batchEnd,
      curPage: curPageNumber,
      pageSize: curPageSizeNumber,
      binIdx: idx
    });
    
    // 检查是否已缓存该页码范围
    const loaded = binData[idx]?.loadedPageRange || [];
    let pageIsCached = loaded.some(([s, e]) => curPageNumber >= s && curPageNumber <= e);
    
    console.debug('[DEBUG] 翻页处理:', { 当前区间: idx, 当前页码: curPageNumber, 缓存页码范围: loaded, 是否已缓存: pageIsCached });
    
    if (pageIsCached) {
      // 使用缓存数据
      const cachedData = binData[idx].pages[curPageNumber];
      console.debug(`[DEBUG] 使用缓存数据，当前页码${curPageNumber}共${cachedData.length}条记录`);
    } else {
      // 批量加载该页码范围
      setBinLoading(true);
      
      // 请求批量加载数据
      fetchBatchBinsData({
        priceType, 
        priceUnit: 'USD', // 确保所有价格区间（bins/tab）始终以USD为主锚定
        solPrice,
        bins: [idx],
        pageSize: curPageSizeNumber,
        pageStart: batchStart,
        pageEnd: batchEnd
        // 注意：不需要额外的mode参数，api.js已经修复了验证逻辑
      })
        .then(res => {
          console.debug(`[DEBUG] 批量加载成功，返回数据:`, { idx, res });
          
          if (res[idx] && res[idx].pages) {
            // 更新缓存数据
            setBinData(prev => {
              const prevPages = prev[idx]?.pages || {};
              const newPages = { ...prevPages };
              
              // 合并新数据
              Object.keys(res[idx].pages).forEach(pageNum => {
                const pageData = res[idx].pages[pageNum];
                if (Array.isArray(pageData) && pageData.length > 0) {
                  newPages[pageNum] = pageData;
                  console.debug(`[DEBUG] 更新缓存数据，页码${pageNum}共${pageData.length}条记录`);
                } else {
                  console.warn(`[WARN] 返回数据中页码${pageNum}无记录`);
                }
              });
              
              return {
                ...prev,
                [idx]: {
                  ...prev[idx],
                  pages: newPages,
                  total: res[idx].total || prev[idx]?.total || 0,
                  summary: res[idx].summary || prev[idx]?.summary || {},
                  // 更新缓存页码范围
                  loadedPageRange: mergeRanges(
                    (prev[idx]?.loadedPageRange || []).concat([[batchStart, batchEnd]])
                  )
                }
              };
            });
          } else {
            console.error('[ERROR] 批量加载失败，返回数据无效:', res);
            message.error('批量加载失败');
          }
        })
        .catch(err => {
          console.error('[ERROR] 批量加载失败，异常信息:', err);
          message.error('批量加载失败');
        })
        .finally(() => setBinLoading(false));
    }
    
    // 更新当前页码和页大小
    setPage(curPageNumber);
    setPageSize(curPageSizeNumber);
  };

  // 合并区间工具
  function mergeRanges(ranges) {
    if (ranges.length === 0) return [];
    const sorted = ranges.slice().sort((a,b)=>a[0]-b[0]);
    const merged = [sorted[0]];
    for (let i=1;i<sorted.length;i++) {
      const last = merged[merged.length-1];
      if (sorted[i][0]<=last[1]+1) {
        last[1] = Math.max(last[1], sorted[i][1]);
      } else {
        merged.push(sorted[i]);
      }
    }
    return merged;
  }

  // bins分頁數據
  const pagedBinData = binData[activeBin]?.pages?.[page] || [];

  const binTotal = binData[activeBin]?.total ?? 0;
  const binSummary = binData[activeBin]?.summary || null;

  const getTablePagination = () => {
    // 随机抽样模式下启用分页（前端分页，数据不变）
    if (mode === 'sample') {
      return {
        current: samplePage,
        pageSize: samplePageSize,
        total: data.length,
        showTotal: (total) => `共 ${total} 条`,
        showSizeChanger: true,
        onChange: handleSampleTableChange,
      };
    }
    // 全量分页模式下正常分页
    if (abnormalMode) {
      return {
        current: page,
        pageSize,
        total,
        showTotal: (total) => `共 ${total} 条`,
        showSizeChanger: true,
        onChange: handleTableChange,
      };
    }
    // bins分頁
    return {
      current: page,
      pageSize,
      total: binTotal,
      showTotal: (total) => `共 ${total} 条`,
      showSizeChanger: true,
      onChange: handleTableChange,
    };
  };

  const fetchPageData = (params = {}) => {
    setLoading(true);
    fetchFilterData({
      priceType,
      priceUnit: 'USD', // 确保所有价格区间（bins/tab）始终以USD为主锚定
      solPrice,
      token: selectedToken,
      page,
      pageSize,
      ...params
    })
      .then(res => {
        setData(res.data || []);
        setTotal(res.total || 0);
        setSummary(res.summary || null);
        setMode('all');
      })
      .catch(err => {
        message.error('获取数据失败');
        setData([]);
        setSummary(null);
      })
      .finally(() => setLoading(false));
  };

  // 重置按钮逻辑（用于恢复全部数据/筛选等）
  const handleReset = () => {
    setMode('all');
    fetchPageData(); // fetchPageData 已带当前 tab/bin/筛选条件
  };

  // Birdeye价格按钮点击
  const handleCallBirdeye = async () => {
    if (!data || data.length === 0) return;
    setBirdeyeLoading(true);
    setBirdeyeStatus('loading');
    message.loading({ content: '开始调用 Birdeye API，请稍等', key: 'birdeye' });
    try {
      // 收集当前页的 token_mint_address 和 trade_time 字段
      const trades = data.map(row => ({
        token_mint_address: row.token_mint_address,
        trade_time: row.trade_timestamp || row.trade_time_gmt8 || row.trade_time_gmt0 // 需为 unix timestamp
      }));
      // 处理 trade_time 字段为 int
      trades.forEach(t => { t.trade_time = parseInt(t.trade_time, 10); });
      const prices = await fetchBirdeyePrices(trades);
      // 将价格插入 data
      const newData = data.map((row, idx) => ({ ...row, birdeye_price: prices[idx] }));
      // debug: 打印即将 setData 的内容
      console.log('即将 setData 的 newData:', newData.map(r => ({
        buy_price_usd: r.buy_price_usd,
        sell_price_usd: r.sell_price_usd,
        buy_price: r.buy_price,
        sell_price: r.sell_price,
        birdeye_price: r.birdeye_price,
        token_mint_address: r.token_mint_address,
        trade_time: r.trade_timestamp || r.trade_time_gmt8 || r.trade_time_gmt0
      })));
      setData(newData);
      setBirdeyeStatus('success');
      message.success({ content: 'Birdeye API 回传结果完成', key: 'birdeye' });
    } catch (e) {
      setBirdeyeStatus('error');
      message.error({ content: `数据获取失败：${e.message || e}`, key: 'birdeye' });
    } finally {
      setBirdeyeLoading(false);
    }
  };

  // 切换单位时只切换前端展示字段，不重新请求后端数据
  const handlePriceUnitChange = (val) => {
    setPriceUnit(val);
    // 不重新请求，只切换显示字段
    setBinData(prev => ({ ...prev }));
    setSummary(prev => prev ? { ...prev } : prev);
  };

  // DEBUG: 翻頁及數據變動時打印狀態
  useEffect(() => {
    if (mode === 'sample') {
      console.log('[DEBUG] data.length:', data.length, 'samplePage:', samplePage, 'samplePageSize:', samplePageSize);
      console.log('[DEBUG] pagedSampleData:', data.slice((samplePage - 1) * samplePageSize, samplePage * samplePageSize));
    }
  }, [data, samplePage, samplePageSize, mode]);

  const sampleFirstIn = useRef(true);
  useEffect(() => {
    if (mode === 'sample') {
      if (sampleFirstIn.current) {
        setSamplePage(1);
        setSamplePageSize(20);
        sampleFirstIn.current = false;
      }
    } else {
      sampleFirstIn.current = true;
    }
  }, [mode]);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ background: "#fff", padding: "10px 24px 10px 24px", height: 'auto', display: 'flex', alignItems: 'center' }}>
        <Row align="middle" justify="space-between" style={{ width: '100%' }}>
          <Col flex="none">
            <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', height: '100%' }}>Price Checker</Title>
          </Col>
          <Col flex="auto">
            <Row gutter={[8, 8]} align="middle" justify="end" wrap style={{ height: '100%' }}>
              <Col>
                <Spin spinning={tokenLoading} size={controlSize}>
                  <Select
                    allowClear
                    showSearch
                    style={{ minWidth: 130 }}
                    placeholder="Token"
                    value={selectedToken}
                    onChange={setSelectedToken}
                    optionFilterProp="children"
                    filterOption={(input, option) =>
                      (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    size={controlSize}
                  >
                    {topTokens.map(t => (
                      <Option key={t.token_mint_address} value={t.token_mint_address}>
                        ({t.count}) {t.token_mint_address.slice(0, 6)}...
                      </Option>
                    ))}
                  </Select>
                </Spin>
              </Col>
              <Col>
                <Select
                  value={priceType}
                  onChange={setPriceType}
                  style={{ minWidth: 70 }}
                  size={controlSize}
                >
                  <Option value="buy_price">买价</Option>
                  <Option value="sell_price">卖价</Option>
                </Select>
              </Col>
              <Col>
                <span style={{ marginRight: 4 }}>Rows</span>
                <InputNumber min={1} max={10000} value={rows} onChange={setRows} style={{ width: 90 }} size={controlSize} />
              </Col>
              <Col>
                <span style={{ marginRight: 4 }}>Tokens</span>
                <InputNumber min={1} max={1000} value={tokens} onChange={setTokens} style={{ width: 90 }} size={controlSize} />
              </Col>
              <Col>
                <span style={{ marginRight: 4 }}>SOL/USD</span>
                <InputNumber min={1} max={10000} value={solPrice} onChange={setSolPrice} style={{ width: 100 }} size={controlSize} />
              </Col>
              <Col>
                <Select
                  value={priceUnit}
                  onChange={handlePriceUnitChange}
                  style={{ minWidth: 70 }}
                  size={controlSize}
                >
                  <Option value="SOL">SOL</Option>
                  <Option value="USD">USD</Option>
                </Select>
              </Col>
              <Col>
                <Select
                  value={timezone}
                  onChange={setTimezone}
                  style={{ minWidth: 80 }}
                  size={controlSize}
                >
                  <Option value="gmt0">GMT+0</Option>
                  <Option value="gmt8">GMT+8</Option>
                </Select>
              </Col>
              <Col>
                <Select
                  value={showFullToken}
                  onChange={setShowFullToken}
                  style={{ minWidth: 90 }}
                  size={controlSize}
                >
                  <Option value={false}>Token缩略</Option>
                  <Option value={true}>Token全显</Option>
                </Select>
              </Col>
              <Col>
                <Button type="primary" onClick={handleQuery} loading={loading} size={controlSize}>
                  查询
                </Button>
              </Col>
              <Col>
                <AbnormalFilterButton
                  loading={loading}
                  abnormalMode={abnormalMode}
                  onClick={handleAbnormalFilter}
                />
              </Col>
              <Col>
                <Button onClick={handleCallBirdeye} loading={birdeyeLoading} disabled={!data || data.length === 0} size={controlSize}>
                  Call BirdEye
                </Button>
              </Col>
              <Col>
                <Button onClick={handleReset} size={controlSize}>重置</Button>
              </Col>
            </Row>
          </Col>
        </Row>
      </Header>
      <Content style={{ padding: 24 }}>
        <Tabs
          activeKey={activeBin.toString()}
          onChange={handleTabChange}
          items={binIdxList.map(idx => ({
            key: idx.toString(),
            label: binLabels[idx] || `Bin${idx}`
          }))}
        />
        <PriceTable
          data={mode === 'sample' ? data : abnormalMode ? data : pagedBinData}
          summary={mode === 'sample' ? summary : abnormalMode ? summary : binSummary}
          loading={loading || binLoading}
          timezone={timezone}
          showFullToken={showFullToken}
          priceUnit={priceUnit}
          pagination={getTablePagination()}
          rowKey={row => row.transaction_signature || row.id || row.key || row.token_mint_address || row.index}
        />
      </Content>
    </Layout>
  );
}

export default App;
