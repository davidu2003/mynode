import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import * as echarts from 'echarts';

export type SeriesPoint = [number | string | Date, number];

type LineChartProps = {
  data: SeriesPoint[];
  overlay?: SeriesPoint[];
  extraSeries?: Array<{ data: SeriesPoint[]; color: string; label?: string }>;
  color?: string;
  overlayColor?: string;
  height?: number;
  smoothing?: number;
  suffix?: string;
  valueFormatter?: (value: number) => string;
  overlayLabel?: string;
  mainLabel?: string;
  onZoomChange?: (isZoomed: boolean) => void;
  gapThreshold?: number; // 数据间隔阈值（毫秒），超过此间隔显示为缺口
  timeRangeStart?: number; // 横轴起始时间（时间戳毫秒）
  timeRangeEnd?: number; // 横轴结束时间（时间戳毫秒）
};

export type LineChartRef = {
  resetZoom: () => void;
  isZoomed: () => boolean;
};

const LineChart = forwardRef<LineChartRef, LineChartProps>(({
  data,
  overlay,
  extraSeries,
  color = '#1890ff',
  overlayColor = '#faad14',
  height = 160,
  smoothing = 0.2,
  suffix = '',
  valueFormatter,
  overlayLabel,
  mainLabel,
  onZoomChange,
  gapThreshold = 120000, // 默认 2 分钟，超过此间隔显示为缺口
  timeRangeStart,
  timeRangeEnd,
}, ref) => {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const isDark = useRef(false);

  // 用户缩放状态
  const isUserZoomed = useRef(false);
  const userZoomRange = useRef<{ start: number; end: number } | null>(null);

  // 处理数据点，在间隔过大时插入 null 形成缺口
  const normalizePointsWithGaps = (points: SeriesPoint[]): (SeriesPoint | [number, null])[] => {
    const map = new Map<number, number>();
    for (const point of points) {
      const ts = new Date(point[0]).getTime();
      map.set(ts, Number(point[1] ?? 0));
    }
    const sorted = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);

    if (sorted.length === 0) return [];

    const result: (SeriesPoint | [number, null])[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const [ts, value] = sorted[i];

      // 如果与前一个点间隔超过阈值，插入 null 形成缺口
      if (i > 0) {
        const prevTs = sorted[i - 1][0];
        if (ts - prevTs > gapThreshold) {
          // 在中间位置插入一个 null 点
          result.push([prevTs + 1, null]);
        }
      }

      result.push([ts, value] as SeriesPoint);
    }

    return result;
  };

  // 用于计算时间范围的简单归一化（不插入缺口）
  const normalizePoints = (points: SeriesPoint[]): SeriesPoint[] => {
    const map = new Map<number, number>();
    for (const point of points) {
      const ts = new Date(point[0]).getTime();
      map.set(ts, Number(point[1] ?? 0));
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ts, value]) => [ts, value] as SeriesPoint);
  };

  const buildOptions = useCallback(() => {
    const mainSeries = normalizePointsWithGaps(data);
    const overlaySeries = overlay ? normalizePointsWithGaps(overlay) : [];

    // 使用外部传入的时间范围，而非从数据推断
    const now = Date.now();
    const maxTime = timeRangeEnd ?? now;
    const minTime = timeRangeStart ?? (maxTime - 6 * 60 * 60 * 1000);
    const gridLine = isDark.current ? '#1b2127' : '#eef2f7';
    const axisLine = isDark.current ? '#30363d' : '#d9d9d9';
    const axisLabel = isDark.current ? '#9aa4ad' : '#888';
    const tooltipBg = isDark.current ? '#0b0f14' : '#0f172a';

    // 根据用户缩放状态决定显示范围
    const zoomStart = isUserZoomed.current && userZoomRange.current
      ? userZoomRange.current.start
      : minTime;
    const zoomEnd = isUserZoomed.current && userZoomRange.current
      ? userZoomRange.current.end
      : maxTime;

    const series: any[] = [
      {
        name: mainLabel || 'Main',
        type: 'line',
        data: mainSeries,
        smooth: smoothing,
        showSymbol: false,
        symbolSize: 5,
        showAllSymbol: false,
        lineStyle: { color, width: 1 },
        itemStyle: { color },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${color}55` },
              { offset: 1, color: `${color}05` },
            ],
          },
        },
      },
    ];

    if (overlay && overlay.length) {
      series.push({
        name: overlayLabel || 'Overlay',
        type: 'line',
        data: overlaySeries,
        smooth: smoothing,
        showSymbol: false,
        symbolSize: 5,
        showAllSymbol: false,
        lineStyle: { color: overlayColor, width: 1 },
        itemStyle: { color: overlayColor },
        areaStyle: undefined,
      });
    }

    if (extraSeries) {
      extraSeries.forEach((s) => {
        series.push({
          name: s.label || 'Series',
          type: 'line',
          data: normalizePointsWithGaps(s.data),
          smooth: smoothing,
          showSymbol: false,
          symbolSize: 5,
          showAllSymbol: false,
          lineStyle: { color: s.color, width: 1 },
          itemStyle: { color: s.color },
          areaStyle: undefined,
        });
      });
    }

    return {
      grid: {
        top: 16,
        left: 48,
        right: 16,
        bottom: 32,
      },
      xAxis: {
        type: 'time',
        boundaryGap: false,
        min: minTime,
        max: maxTime,
        axisLine: { lineStyle: { color: axisLine } },
        axisLabel: { color: axisLabel, fontSize: 10 },
        splitLine: { show: true, lineStyle: { color: gridLine } },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: axisLine } },
        axisLabel: {
          color: axisLabel,
          fontSize: 10,
          formatter: (value: number) => {
            if (valueFormatter) return valueFormatter(value);
            if (suffix) return `${Number(value).toFixed(2)} ${suffix}`;
            return String(value);
          },
        },
        splitLine: { show: true, lineStyle: { color: gridLine } },
      },
      dataZoom: [
        {
          type: 'inside',
          startValue: zoomStart,
          endValue: zoomEnd,
          minValueSpan: 10 * 60 * 1000,
        },
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBg,
        textStyle: { color: '#fff' },
        formatter: (params: Array<{ value: unknown; seriesIndex: number; marker: string; seriesName?: string }>) => {
          const lines = params.map((item) => {
            const rawValue = Array.isArray(item.value) ? item.value[1] : item.value;
            const value = Number(rawValue || 0);
            
            // Determine label
            let label = item.seriesName;
            if (!label || label === 'Main' || label === 'Overlay' || label === 'Series') {
               if (item.seriesIndex === 0) label = mainLabel;
               else if (item.seriesIndex === 1 && overlay) label = overlayLabel;
               else if (extraSeries) {
                 // Calculate index in extraSeries
                 const extraIndex = item.seriesIndex - (overlay ? 2 : 1);
                 if (extraIndex >= 0 && extraIndex < extraSeries.length) {
                   label = extraSeries[extraIndex].label;
                 }
               }
            }

            const formattedValue = valueFormatter
              ? valueFormatter(value)
              : `${value.toFixed(2)}${suffix ? ` ${suffix}` : ''}`;
            return `${item.marker}${label ? `${label} ` : ''}${formattedValue}`;
          });
          return lines.join('<br/>');
        },
      },
      series,
    };
  }, [data, overlay, extraSeries, color, overlayColor, smoothing, suffix, valueFormatter, overlayLabel, mainLabel, gapThreshold, timeRangeStart, timeRangeEnd]);

  // 重置缩放
  const resetZoom = useCallback(() => {
    isUserZoomed.current = false;
    userZoomRange.current = null;
    onZoomChange?.(false);
    if (chartInstance.current) {
      chartInstance.current.setOption(buildOptions(), { notMerge: false });
    }
  }, [buildOptions, onZoomChange]);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    resetZoom,
    isZoomed: () => isUserZoomed.current,
  }), [resetZoom]);

  useEffect(() => {
    if (!chartRef.current) return undefined;
    chartInstance.current = echarts.init(chartRef.current);

    const onResize = () => chartInstance.current?.resize();
    window.addEventListener('resize', onResize);

    const updateTheme = () => {
      isDark.current = document.documentElement.classList.contains('dark');
      chartInstance.current?.setOption(buildOptions());
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // 监听 dataZoom 事件，记录用户缩放状态
    chartInstance.current.on('dataZoom', () => {
      type DataZoomOption = { startValue?: number; endValue?: number };
      type ChartOption = { dataZoom?: DataZoomOption[] };
      const option = chartInstance.current?.getOption() as ChartOption | undefined;
      if (option?.dataZoom?.[0]) {
        const zoom = option.dataZoom[0];
        const startValue = zoom.startValue;
        const endValue = zoom.endValue;

        // 判断是否是用户主动缩放（而非程序设置）
        // 通过比较当前范围与数据完整范围来判断
        const mainSeries = normalizePoints(data);
        const dataMinTime = mainSeries.length ? new Date(mainSeries[0][0]).getTime() : 0;
        const dataMaxTime = mainSeries.length ? new Date(mainSeries[mainSeries.length - 1][0]).getTime() : Date.now();

        // 如果范围与完整数据范围有差异，说明用户进行了缩放
        const isFullRange = Math.abs(startValue - dataMinTime) < 1000 && Math.abs(endValue - dataMaxTime) < 1000;

        if (!isFullRange) {
          isUserZoomed.current = true;
          userZoomRange.current = { start: startValue, end: endValue };
          onZoomChange?.(true);
        }
      }
    });

    return () => {
      window.removeEventListener('resize', onResize);
      observer.disconnect();
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartInstance.current) return;
    chartInstance.current.setOption(buildOptions(), { notMerge: false });
  }, [buildOptions]);

  return <div ref={chartRef} style={{ width: '100%', height }} />;
});

LineChart.displayName = 'LineChart';

export default LineChart;
