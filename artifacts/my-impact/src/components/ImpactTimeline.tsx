import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

export interface MonthlyDataPoint {
  month: string;
  value: number;
}

interface ImpactTimelineProps {
  data: MonthlyDataPoint[];
  isLoading?: boolean;
}

export function ImpactTimeline({ data, isLoading }: ImpactTimelineProps) {
  if (isLoading) {
    return (
      <div className="h-[200px] flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="h-[200px] flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No data available for this period.</p>
      </div>
    );
  }

  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="impactGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#F06127" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#F06127" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={v => `£${(v / 1000).toFixed(0)}k`}
            width={44}
          />
          <RechartsTooltip
            formatter={(v: number) => [formatCurrency(v), "Social Value"]}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#F06127"
            strokeWidth={2}
            fill="url(#impactGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "#F06127" }}
            isAnimationActive={true}
            animationDuration={1000}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
