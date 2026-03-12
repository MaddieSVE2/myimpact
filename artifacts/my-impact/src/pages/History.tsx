import { useGetImpactHistory } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import { Calendar, TrendingUp, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceDot,
} from "recharts";

export default function History() {
  const { data, isLoading } = useGetImpactHistory({ userId: "user_demo_123" });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const records = data?.records || [];

  const chartData = [...records].reverse().map(r => ({
    date: new Date(r.createdAt).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    fullDate: new Date(r.createdAt).toLocaleDateString("en-GB"),
    value: r.impactResult.totalValue,
  }));

  const latest = records[0];
  const previous = records[1];
  const changeVsLast = latest && previous
    ? latest.impactResult.totalValue - previous.impactResult.totalValue
    : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-semibold text-foreground mb-1">My impact history</h1>
        <p className="text-sm text-muted-foreground">Watch your social value grow over time.</p>
      </div>

      {records.length === 0 ? (
        <div className="bg-white border border-dashed border-border rounded-xl py-16 text-center">
          <TrendingUp className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No records yet</p>
          <p className="text-xs text-muted-foreground mb-5">Complete the calculator and save a record to start tracking your impact.</p>
          <Link
            href="/wizard/actions"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            Calculate my impact <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <>
          {/* Summary stat */}
          {latest && (
            <motion.div
              className="grid grid-cols-2 gap-3 mb-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="bg-white border border-border rounded-xl p-5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Latest record</p>
                <p className="text-2xl font-display font-bold text-foreground">{formatCurrency(latest.impactResult.totalValue)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(latest.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                </p>
              </div>
              {changeVsLast !== null && (
                <div className="bg-white border border-border rounded-xl p-5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Change vs previous</p>
                  <p className={`text-2xl font-display font-bold ${changeVsLast >= 0 ? "text-green-600" : "text-destructive"}`}>
                    {changeVsLast >= 0 ? "+" : ""}{formatCurrency(changeVsLast)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{changeVsLast >= 0 ? "↑ Growing!" : "↓ Room to improve"}</p>
                </div>
              )}
            </motion.div>
          )}

          {/* Chart — shown even with 1 record */}
          <motion.div
            className="bg-white border border-border rounded-xl p-5 mb-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h3 className="text-sm font-semibold text-foreground mb-4">Social value over time</h3>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F06127" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#F06127" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    axisLine={false} tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false} tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={v => `£${(v / 1000).toFixed(1)}k`}
                  />
                  <RechartsTooltip
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ""}
                    formatter={(value: number) => [formatCurrency(value), "Social Value"]}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone" dataKey="value"
                    stroke="#F06127" strokeWidth={2.5}
                    fillOpacity={1} fill="url(#colorValue)"
                    dot={chartData.length === 1 ? { fill: "#F06127", r: 5 } : false}
                    activeDot={{ r: 5, fill: "#F06127" }}
                  />
                  {chartData.length === 1 && (
                    <ReferenceDot
                      x={chartData[0].date} y={chartData[0].value}
                      r={6} fill="#F06127" stroke="white" strokeWidth={2}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {chartData.length === 1 && (
              <p className="text-center text-xs text-muted-foreground mt-3">
                Save more records to see your impact trend over time.
              </p>
            )}
          </motion.div>

          {/* Record list */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground mb-3">All records</h3>
            {records.map((record, i) => (
              <motion.div
                key={record.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07 }}
                className="bg-white border border-border rounded-lg p-4 flex items-center justify-between hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{record.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(record.createdAt).toLocaleDateString("en-GB", {
                        weekday: "short", year: "numeric", month: "long", day: "numeric",
                      })}
                    </p>
                  </div>
                </div>
                <p className="text-lg font-display font-bold text-foreground">{formatCurrency(record.impactResult.totalValue)}</p>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
