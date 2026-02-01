import { Badge } from './ui/badge';

interface ServerSelectionGridProps {
  servers: Array<{ id: number; name: string; agentStatus?: string }>;
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  loading?: boolean;
}

export default function ServerSelectionGrid({ servers, selectedIds, onChange, loading }: ServerSelectionGridProps) {
  const toggleSelection = (id: number) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(sid => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-500">加载中...</div>;
  }

  return (
    <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded-md p-2 dark:border-slate-800">
      <div className="grid grid-cols-2 gap-2">
        {servers.map(server => {
          const isSelected = selectedIds.includes(server.id);
          return (
            <div 
              key={server.id}
              className={`
                cursor-pointer p-2 rounded-md border flex items-center justify-between text-xs transition-colors
                ${isSelected 
                  ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' 
                  : 'bg-white border-slate-100 hover:border-slate-300 dark:bg-slate-950 dark:border-slate-800 dark:hover:border-slate-700'}
              `}
              onClick={() => toggleSelection(server.id)}
            >
              <div className="truncate font-medium flex-1 mr-2" title={server.name}>{server.name}</div>
              <Badge variant={server.agentStatus === 'online' ? 'success' : 'secondary'} className="px-1.5 py-0 h-4 text-[10px]">
                {server.agentStatus}
              </Badge>
            </div>
          );
        })}
        {servers.length === 0 && <div className="col-span-2 text-center py-4 text-slate-500">无数据</div>}
      </div>
    </div>
  );
}
