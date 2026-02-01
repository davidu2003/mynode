import { useMemo } from 'react';
import { Button, Select, Space } from 'antd';

interface ServerSelectorProps {
  servers: Array<{ id: number; name: string; ip?: string; agentStatus?: string }>;
  value: number[];
  onChange: (value: number[]) => void;
  placeholder?: string;
  loading?: boolean;
  includeAllStatuses?: boolean;
}

export default function ServerSelector({
  servers,
  value,
  onChange,
  placeholder = '选择服务器',
  loading = false,
  includeAllStatuses = false,
}: ServerSelectorProps) {
  const selectableServers = useMemo(() => {
    if (includeAllStatuses) return servers;
    return servers.filter((item) => item.agentStatus === 'online');
  }, [servers, includeAllStatuses]);

  const options = useMemo(
    () =>
      servers.map((server) => ({
        value: server.id,
        label: server.ip ? `${server.name} (${server.ip})` : `${server.name} (${server.agentStatus || '-'})`,
        disabled: !includeAllStatuses && server.agentStatus !== 'online',
      })),
    [servers, includeAllStatuses]
  );

  return (
    <>
      <Space style={{ marginBottom: 8 }}>
        <Button size="small" onClick={() => onChange(selectableServers.map((item) => item.id))}>
          全选
        </Button>
        <Button size="small" onClick={() => onChange([])}>
          反选
        </Button>
      </Space>
      <Select
        mode="multiple"
        allowClear
        placeholder={placeholder}
        style={{ width: '100%' }}
        loading={loading}
        value={value}
        onChange={(next) => onChange(next as number[])}
        options={options}
      />
    </>
  );
}
