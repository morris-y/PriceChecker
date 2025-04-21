import React, { useState, useEffect, useRef } from "react";
import { Layout, InputNumber, Button, Row, Col, Typography, message, Select, Spin, Tabs } from "antd";
import PriceTable from "./components/PriceTable";
import AbnormalFilterButton from "./components/AbnormalFilterButton";
import { fetchRandomSample, fetchTopTokens, fetchBatchBinsData, fetchFilterData } from "./api";

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

  // 区间tab相关
  const binIdxList = [4, 3, 2, 5, 1, 0]; // 保證 tab 與預加載順序均以 100-1K USD (bin 4) 為第一順位
  const [activeBin, setActiveBin] = useState(4); // 預設 activeBin 也為 4
  const [binData, setBinData] = useState({}); // {binIdx: {data, total}}
  const [binLoading, setBinLoading] = useState(false);

  useEffect(() => {
    setActiveBin(4); // 保證初次渲染時tab正確
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

  // 价格区间详细文案
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
    setBinLoading(true);
    fetchBatchBinsData({ priceType, priceUnit, solPrice, bins: binIdxList, page: 1, pageSize })
      .then(res => setBinData(res))
      .finally(() => setBinLoading(false));
  }, [priceType, priceUnit, solPrice, pageSize]);

  useEffect(() => {
    if (mode !== 'sample') {
      setPage(1);
      fetchPageData({ page: 1 });
    }
  }, [selectedToken, priceType, priceUnit, solPrice, mode]);

  // 异常值过滤切换
  const handleAbnormalFilter = () => {
    if (!abnormalMode) {
      setLoading(true);
      fetchFilterData({
        priceType,
        priceUnit,
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
      priceUnit,
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

  // 預加載多頁 bins 數據
  const preloadBinPages = async (binIdx, pages = 5, pageSize = 100) => {
    setBinLoading(true);
    let allRows = [];
    let total = 0;
    for (let p = 1; p <= pages; p++) {
      // 每頁單獨請求
      const res = await fetchBatchBinsData({ priceType, priceUnit, solPrice, bins: [binIdx], page: p, pageSize });
      if (res && res[binIdx]) {
        allRows = allRows.concat(res[binIdx].data || []);
        total = res[binIdx].total;
      }
    }
    setBinData(prev => ({
      ...prev,
      [binIdx]: { data: allRows, total, loadedPages: new Set(Array.from({length: pages}, (_, i) => i + 1)) }
    }));
    setBinLoading(false);
  };

  const handleTabChange = (key) => {
    const idx = Number(key);
    setActiveBin(idx);
    setPage(1); // 切換tab時重置到第一頁
    if (!binData[idx] || !binData[idx].loadedPages || binData[idx].loadedPages.size < 5) {
      preloadBinPages(idx, 5, 100);
    }
    // 直接更新total为该区间的total
    if (binData[idx] && binData[idx].total !== undefined) {
      setTotal(binData[idx].total);
    }
  };

  // bins分頁時如超出已加載範圍則動態加載新頁
  const handleTableChange = (pagination) => {
    setPage(pagination.current);
    setPageSize(pagination.pageSize);
    const loadedPages = binData[activeBin]?.loadedPages || new Set();
    const targetPage = pagination.current;
    if (!loadedPages.has(targetPage)) {
      // 動態加載新頁並合併
      fetchBatchBinsData({ priceType, priceUnit, solPrice, bins: [activeBin], page: targetPage, pageSize: pagination.pageSize })
        .then(res => {
          if (res && res[activeBin]) {
            setBinData(prev => {
              const prevRows = prev[activeBin]?.data || [];
              const startIdx = (targetPage - 1) * pagination.pageSize;
              const newRows = res[activeBin].data || [];
              // 合併新頁數據到正確位置
              const mergedRows = [...prevRows];
              for (let i = 0; i < newRows.length; i++) {
                mergedRows[startIdx + i] = newRows[i];
              }
              const newLoadedPages = new Set(loadedPages);
              newLoadedPages.add(targetPage);
              return {
                ...prev,
                [activeBin]: {
                  data: mergedRows,
                  total: res[activeBin].total,
                  loadedPages: newLoadedPages
                }
              };
            });
          }
        });
    }
  };

  const handleReset = () => {
    setMode('all');
    fetchPageData(); // fetchPageData 已带当前 tab/bin/筛选条件
  };

  const controlSize = "middle";

  // 随机抽样分页数据（slice 容错处理）
  const pagedSampleData =
    mode === 'sample' && Number.isInteger(samplePage) && Number.isInteger(samplePageSize) && samplePage > 0 && samplePageSize > 0
      ? data.slice((samplePage - 1) * samplePageSize, samplePage * samplePageSize)
      : [];

  // bins分頁數據
  const pagedBinData =
    binData[activeBin]?.data && Array.isArray(binData[activeBin].data)
      ? binData[activeBin].data.slice((page - 1) * pageSize, page * pageSize)
      : [];

  const binSummary = binData[activeBin]?.summary || null;
  const binTotal = binData[activeBin]?.total ?? 0;

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
      priceUnit,
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

  const handlePriceUnitChange = (val) => {
    setPriceUnit(val);
    if (mode === 'sample') {
      // 僅本地轉換，不重新請求
      setData(prev => prev.map(row => ({ ...row })));
      setSummary(prev => {
        if (!prev) return prev;
        return { ...prev };
      });
      return;
    }
    // 非 sample mode，才重新請求
    fetchPageData({ priceUnit: val });
  };

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
