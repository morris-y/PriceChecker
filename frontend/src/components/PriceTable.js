import React from "react";
import { Table, Tooltip, Descriptions, Button, Spin } from "antd";
import { fetchSlotTimestamps } from "../api";
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

function formatNumber(val, digits = 8) {
  if (val === undefined || val === null || val === "") return "-";
  const num = Number(val);
  if (isNaN(num)) return val;
  let safeDigits = 8;
  if (typeof digits === 'number' && isFinite(digits)) {
    safeDigits = Math.max(0, Math.min(20, Math.floor(digits)));
  }
  return num.toLocaleString(undefined, { maximumFractionDigits: safeDigits });
}

function formatSlotTime(ts, timezone) {
  if (!ts) return "-";
  // 保证 ts 是数字
  const tsNum = Number(ts);
  if (isNaN(tsNum)) return "-";
  // 用 dayjs.utc 保证基础时间是 UTC
  const d = dayjs.unix(tsNum).utc();
  if (timezone === "gmt8") {
    return d.add(8, 'hour').format("YYYY-MM-DD HH:mm:ss");
  } else {
    return d.format("YYYY-MM-DD HH:mm:ss");
  }
}

const PriceTable = ({ data = [], loading, timezone, priceUnit, pagination, summary, priceType, slotTimes = {}, slotLoading = false, showArbCols = false }) => {
  const [slotError, setSlotError] = React.useState(null);

  // 触发获取slot timestamp
  const handleGetSlotTime = async () => {
    try {
      const slots = data.map(row => row.transaction_slot).filter(Boolean);
      const res = await fetchSlotTimestamps(slots);
      // slotTimes 由 props 传入，不再更新本地状态
    } catch (e) {
      setSlotError("获取slot timestamp失败");
    }
  };

  const columns = [
    {
      title: "Solscan",
      dataIndex: "solscan_link",
      key: "solscan_link",
      render: (text) => (
        <a href={text} target="_blank" rel="noopener noreferrer">Solscan</a>
      ),
      fixed: 'left',
    },
    {
      title: timezone === "gmt8" ? "交易时间 (GMT+8)" : "交易时间 (GMT+0)",
      dataIndex: timezone === "gmt8" ? "trade_time_gmt8" : "trade_time_gmt0",
      key: "trade_time",
      width: 160,
    },
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 80,
    },
    {
      title: "Token地址",
      dataIndex: "gmgn_link",
      key: "gmgn_link",
      render: (text, record) => (
        <Tooltip title={record.token_mint_address}>
          <a href={text} target="_blank" rel="noopener noreferrer">{record.token_mint_address?.slice(0, 4)}</a>
        </Tooltip>
      ),
      width: 120,
    },
    {
      title: "买入数量",
      dataIndex: "buy_amount",
      key: "buy_amount",
      align: 'right',
      render: formatNumber,
      sorter: (a, b) => Number(a.buy_amount) - Number(b.buy_amount),
    },
    {
      title: "买入SOL数量",
      dataIndex: "buy_sol_amount",
      key: "buy_sol_amount",
      align: 'right',
      render: formatNumber,
      sorter: (a, b) => Number(a.buy_sol_amount) - Number(b.buy_sol_amount),
    },
    {
      title: `买入价格(${priceUnit})`,
      dataIndex: priceUnit === 'USD' ? 'buy_price_usd' : 'buy_price_sol',
      key: "buy_price",
      align: 'right',
      render: (text, record) => {
        const usd = record.buy_price_usd;
        const sol = record.buy_price_sol;
        let mainVal, hoverVal, hoverUnit;
        if (priceUnit === 'USD') {
          mainVal = usd;
          hoverVal = sol;
          hoverUnit = 'SOL';
        } else {
          mainVal = sol;
          hoverVal = usd;
          hoverUnit = 'USD';
        }
        const strMain = mainVal === undefined || mainVal === null || mainVal === '' ? '-' : String(mainVal);
        const strHover = hoverVal === undefined || hoverVal === null || hoverVal === '' ? '-' : String(hoverVal);
        const shortVal = formatNumber(mainVal, 8);
        return (
          <Tooltip title={strHover !== '-' ? `${hoverUnit}: ${strHover}` : '-'}>
            <span>{shortVal}</span>
          </Tooltip>
        );
      },
      sorter: (a, b) => Number((priceUnit === 'USD' ? a.buy_price_usd : a.buy_price_sol) || 0) - Number((priceUnit === 'USD' ? b.buy_price_usd : b.buy_price_sol) || 0),
    },
    {
      title: "卖出数量",
      dataIndex: "sell_amount",
      key: "sell_amount",
      align: 'right',
      render: formatNumber,
      sorter: (a, b) => Number(a.sell_amount) - Number(b.sell_amount),
    },
    {
      title: "卖出SOL数量",
      dataIndex: "sell_sol_amount",
      key: "sell_sol_amount",
      align: 'right',
      render: formatNumber,
      sorter: (a, b) => Number(a.sell_sol_amount) - Number(b.sell_sol_amount),
    },
    {
      title: `卖出价格(${priceUnit})`,
      dataIndex: priceUnit === 'USD' ? 'sell_price_usd' : 'sell_price_sol',
      key: "sell_price",
      align: 'right',
      render: (text, record) => {
        const usd = record.sell_price_usd;
        const sol = record.sell_price_sol;
        let mainVal, hoverVal, hoverUnit;
        if (priceUnit === 'USD') {
          mainVal = usd;
          hoverVal = sol;
          hoverUnit = 'SOL';
        } else {
          mainVal = sol;
          hoverVal = usd;
          hoverUnit = 'USD';
        }
        const strMain = mainVal === undefined || mainVal === null || mainVal === '' ? '-' : String(mainVal);
        const strHover = hoverVal === undefined || hoverVal === null || hoverVal === '' ? '-' : String(hoverVal);
        const shortVal = formatNumber(mainVal, 8);
        return (
          <Tooltip title={strHover !== '-' ? `${hoverUnit}: ${strHover}` : '-'}>
            <span>{shortVal}</span>
          </Tooltip>
        );
      },
      sorter: (a, b) => Number((priceUnit === 'USD' ? a.sell_price_usd : a.sell_price_sol) || 0) - Number((priceUnit === 'USD' ? b.sell_price_usd : b.sell_price_sol) || 0),
    },
  ];

  // 找到交易时间栏位索引
  const tradeTimeIdx = columns.findIndex(col => col.key === "trade_time");
  // 构造 Slot时间栏位
  const slotTimeColumn = {
    title: "Slot时间",
    dataIndex: "transaction_slot",
    key: "slot_timestamp",
    align: 'right',
    width: 160, // 与交易时间栏位统一
    render: (slot, record) => {
      if (!slot) return "-";
      if (slotLoading) return <Spin size="small" />;
      const ts = slotTimes && slotTimes[slot];
      // 注意：ts 可能为 0 或 undefined/null
      if (ts === undefined || ts === null) return "-";
      return formatSlotTime(ts, timezone);
    },
  };
  // 插入到交易时间栏位右边
  if (tradeTimeIdx !== -1) {
    columns.splice(tradeTimeIdx + 1, 0, slotTimeColumn);
  } else {
    columns.push(slotTimeColumn);
  }

  // 动态插入 Birdeye 价格列
  if (columns.every(col => col.key !== 'birdeye_price')) {
    columns.push({
      title: 'Birdeye价格',
      dataIndex: 'birdeye_price',
      key: 'birdeye_price',
      align: 'right',
      render: (val) => val === undefined || val === null || val === '' ? '-' : val,
    });
  }

  // 新增 Birdeye 百分比差异列，紧跟在 Birdeye价格 右侧
  if (columns.every(col => col.key !== 'birdeye_percent_diff')) {
    columns.push({
      title: '百分比差异',
      key: 'birdeye_percent_diff',
      align: 'right',
      render: (text, record) => {
        const birdeye = record.birdeye_price;
        const price = record.buy_price_usd; // 只用买入价格
        if (
          birdeye === undefined || birdeye === null || birdeye === '' || birdeye === '-' ||
          price === undefined || price === null || price === '' || price === '-'
        ) {
          return '-';
        }
        // 修正：强制只取birdeye中的第一个数字，去掉换行和多余字符
        const birdeyeClean = String(birdeye).split(/[\s\n]/)[0].replace(/[^0-9.\-eE]/g, '');
        const numBirdeye = Number(birdeyeClean);
        const numPrice = Number(price);
        if (isNaN(numBirdeye) || isNaN(numPrice) || numBirdeye === 0) return '-';
        const diff = ((numPrice - numBirdeye) / numBirdeye) * 100;
        const diffStr = diff > 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`;
        // 最佳实践：正负色彩区分
        return <span style={{color: diff > 0 ? '#3f8600' : diff < 0 ? '#cf1322' : undefined}}>{diffStr}</span>;
      },
    });
  }

  // 动态插入套利相关栏位
  if (showArbCols) {
    columns.push(
      {
        title: "套利盈亏",
        dataIndex: "arbitrage_profit_loss",
        key: "arbitrage_profit_loss",
        align: 'right',
        render: formatNumber,
        sorter: (a, b) => Number(a.arbitrage_profit_loss) - Number(b.arbitrage_profit_loss),
        width: 90,
      },
      {
        title: "套利价格变化",
        dataIndex: "arbitrage_price_change",
        key: "arbitrage_price_change",
        align: 'right',
        render: formatNumber,
        sorter: (a, b) => Number(a.arbitrage_price_change) - Number(b.arbitrage_price_change),
        width: 110,
      },
      {
        title: "套利交易量",
        dataIndex: "arbitrage_volume",
        key: "arbitrage_volume",
        align: 'right',
        render: formatNumber,
        sorter: (a, b) => Number(a.arbitrage_volume) - Number(b.arbitrage_volume),
        width: 100,
      }
    );
  }

  const enhancedData = (Array.isArray(data) ? data : []).map(row => ({
    ...row,
    buy_price_usd: row.buy_price_usd,
    sell_price_usd: row.sell_price_usd
  }));

  // 統計摘要渲染
  const renderSummary = () => {
    if (!summary) return null;
    // 根據 priceUnit 決定顯示 SOL 還是 USD 統計
    const isUSD = priceUnit === 'USD';
    const avg = isUSD ? summary.avg_usd : summary.avg_sol;
    const min = isUSD ? summary.min_usd : summary.min_sol;
    const max = isUSD ? summary.max_usd : summary.max_sol;
    return (
      <Descriptions title="本區間統計" bordered size="small" column={4} style={{ marginBottom: 12 }}>
        <Descriptions.Item label="總筆數">{summary.count}</Descriptions.Item>
        <Descriptions.Item label={`均價(${priceUnit})`}>{avg !== undefined && avg !== null ? formatNumber(avg) : '-'}</Descriptions.Item>
        <Descriptions.Item label={`最大值(${priceUnit})`}>{max !== undefined && max !== null ? formatNumber(max) : '-'}</Descriptions.Item>
        <Descriptions.Item label={`最小值(${priceUnit})`}>{min !== undefined && min !== null ? formatNumber(min) : '-'}</Descriptions.Item>
      </Descriptions>
    );
  };

  return (
    <>
      {renderSummary()}
      <Table
        columns={columns}
        dataSource={enhancedData}
        loading={loading}
        rowKey={row => row.transaction_signature || row.id || row.key || row.token_mint_address || row.index}
        scroll={{ x: 1200 }}
        pagination={pagination}
      />
    </>
  );
};

export default PriceTable;
