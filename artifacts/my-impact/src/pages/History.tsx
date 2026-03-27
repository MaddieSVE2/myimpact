import { useState } from "react";
import { useGetImpactHistory } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, TrendingUp, ArrowRight, ChevronDown, ChevronUp,
  HandCoins, UserPlus, Trophy, Clock,
} from "lucide-react";
import { Link } from "wouter";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceDot,
} from "recharts";

type Breakdown = {
  activityId: string;
  activityName: string;
  category: string;
  proxy: string;
  proxyYear: string;
  sdg: string;
  sdgColor: string;
  impactValue: number;
  hours: number;
};

function RecordDetail({ result }: { result: any }) {
  const breakdowns: Breakdown[] = result.activityBreakdowns ?? [];

  const metrics = [
    { label: "Direct impact", value: result.impactValue, icon: TrendingUp, colour: "#F06127" },
    { label: "Contribution", value: result.contributionValue, icon: UserPlus, colour: "#3b82f6" },
    { label: "Donations", value: result.donationsValue, icon: HandCoins, colour: "#22c55e" },
    { label: "Personal dev", value: result.personalDevelopmentValue, icon: Trophy, colour: "#f59e0b" },
  ];

  return (
    <div className="border-t border-border">
      {/* Mini metrics row */}
      <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
        {metrics.map(m => (
          <div key={m.label} className="px-3 py-2.5 flex flex-col gap-0.5">
            <m.icon className="w-3 h-3 mb-0.5" style={{ color: m.colour }} />
            <p className="text-[10px] text-muted-foreground leading-none">{m.label}</p>
            <p className="text-xs font-bold text-foreground">{formatCurrency(m.value)}</p>
          </div>
        ))}
      </div>

      {/* Activity list */}
      {breakdowns.length > 0 ? (
        <div className="divide-y divide-border">
          {breakdowns.map(b => (
            <div key={b.activityId} className="flex items-center gap-3 px-4 py-3">
              <div
                className="w-0.5 self-stretch rounded-full shrink-0"
                style={{ backgroundColor: b.sdgColor || "#7E8FAD", minHeight: 20 }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground leading-snug truncate">{b.activityName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{b.category}</span>
                  {b.hours > 0 && (
                    <>
                      <span className="text-[10px] text-muted-foreground/40">·</span>
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Clock className="w-2.5 h-2.5" /> {b.hours} hrs
                      </span>
                    </>
                  )}
                </div>
              </div>
              <p className="text-xs font-bold shrink-0" style={{ color: "#F06127" }}>
                {formatCurrency(b.impactValue)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-4 py-3 text-xs text-muted-foreground italic">No activity breakdown recorded.</p>
      )}

      {/* Totals footer */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/10 border-t border-border">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          {Math.round(result.totalHours)} volunteer hours total
        </div>
        <p className="text-xs font-bold text-foreground">{formatCurrency(result.totalValue)} total value</p>
      </div>
    </div>
  );
}

export default function History() {
  const { user } = useAuth();
  const { data, isLoading } = useGetImpactHistory({ userId: user?.id ?? "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const records = data?.records || [];

  const chartData = [...records].reverse().map(r => ({
    date: r.period || new Date(r.createdAt).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    fullDate: r.period || new Date(r.createdAt).toLocaleDateString("en-GB"),
    value: r.impactResult.totalValue,
  }));

  const latest = records[0];
  const previous = records[1];
  const changeVsLast = latest && previous
    ? latest.impactResult.totalValue - previous.impactResult.totalValue
    : null;
  const allTimeTotal = records.reduce((sum, r) => sum + r.impactResult.totalValue, 0);

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
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">All-time total</p>
                <p className="text-2xl font-display font-bold text-foreground">{formatCurrency(allTimeTotal)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Across {records.length} {records.length === 1 ? "record" : "records"}
                </p>
              </div>
              <div className="bg-white border border-border rounded-xl p-5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                  {changeVsLast !== null ? "Change vs previous" : "Latest period"}
                </p>
                {changeVsLast !== null ? (
                  <>
                    <p className={`text-2xl font-display font-bold ${changeVsLast >= 0 ? "text-green-600" : "text-destructive"}`}>
                      {changeVsLast >= 0 ? "+" : ""}{formatCurrency(changeVsLast)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{changeVsLast >= 0 ? "↑ Growing!" : "↓ Room to improve"}</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-display font-bold text-foreground">{formatCurrency(latest.impactResult.totalValue)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{latest.period || new Date(latest.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {/* Chart */}
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
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }}
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
            {records.map((record, i) => {
              const isOpen = expandedId === record.id;
              const activityCount = record.impactResult.activityBreakdowns?.length ?? 0;
              return (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="bg-white border border-border rounded-lg overflow-hidden transition-shadow hover:shadow-sm"
                  style={{ borderColor: isOpen ? "hsl(var(--primary) / 0.4)" : undefined }}
                >
                  {/* Clickable header row */}
                  <button
                    onClick={() => setExpandedId(isOpen ? null : record.id)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition-colors"
                        style={{ backgroundColor: isOpen ? "#F06127" : "hsl(var(--muted))" }}
                      >
                        <Calendar className="w-3.5 h-3.5" style={{ color: isOpen ? "white" : "hsl(var(--muted-foreground))" }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {record.period && (
                            <span
                              className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: "#213547", color: "white" }}
                            >
                              {record.period}
                            </span>
                          )}
                          {!record.period && (
                            <p className="text-sm font-semibold text-foreground">{record.name}</p>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(record.createdAt).toLocaleDateString("en-GB", {
                            weekday: "short", year: "numeric", month: "long", day: "numeric",
                          })}
                          {activityCount > 0 && (
                            <span className="ml-2 text-muted-foreground/60">· {activityCount} {activityCount === 1 ? "activity" : "activities"}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <p className="text-lg font-display font-bold text-foreground">
                        {formatCurrency(record.impactResult.totalValue)}
                      </p>
                      {isOpen
                        ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      }
                    </div>
                  </button>

                  {/* Expandable detail */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="detail"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: "easeInOut" }}
                        style={{ overflow: "hidden" }}
                      >
                        <RecordDetail result={record.impactResult} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
