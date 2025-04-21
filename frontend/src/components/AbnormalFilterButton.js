import React from "react";
import { Button } from "antd";

export default function AbnormalFilterButton({ loading, abnormalMode, onClick }) {
  return (
    <Button
      type={abnormalMode ? "primary" : "default"}
      danger={abnormalMode}
      onClick={onClick}
      loading={loading}
      style={{ marginLeft: 8 }}
      size="middle"
    >
      {abnormalMode ? "显示全部" : "异常值过滤"}
    </Button>
  );
}
