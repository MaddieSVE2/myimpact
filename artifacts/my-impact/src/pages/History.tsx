import { useGetImpactHistory } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import { History as HistoryIcon, Calendar } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";

export default function History() {
  const { data, isLoading } = useGetImpactHistory({ userId: "user_demo_123" });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const records = data?.records || [];
  
  // Format data for chart
  const chartData = [...records].reverse().map(r => ({
    date: new Date(r.createdAt).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
    fullDate: new Date(r.createdAt).toLocaleDateString('en-GB'),
    value: r.impactResult.totalValue
  }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-10">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
          <HistoryIcon className="w-7 h-7" />
        </div>
        <div>
          <h1 className="text-4xl font-display font-black text-foreground">Impact History</h1>
          <p className="text-muted-foreground text-lg">Watch your social value grow over time.</p>
        </div>
      </div>

      {records.length > 1 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 md:p-8 rounded-[2rem] mb-12"
        >
          <h3 className="text-xl font-bold mb-6 font-display">Value Trend</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} dy={10} />
                <YAxis 
                  axisLine={false} tickLine={false} 
                  tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}}
                  tickFormatter={(val) => `£${value/1000}k`}
                />
                <RechartsTooltip 
                  labelFormatter={(label, payload) => payload[0]?.payload.fullDate || label}
                  formatter={(value: number) => [formatCurrency(value), "Total Value"]}
                />
                <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={4} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      <div className="space-y-4">
        <h3 className="text-xl font-bold font-display">Past Records</h3>
        {records.length === 0 ? (
          <div className="text-center py-12 glass-card rounded-3xl text-muted-foreground">
            No history found. Complete the wizard and save a record!
          </div>
        ) : (
          records.map((record, i) => (
            <motion.div 
              key={record.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="glass-card p-6 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-primary/30 transition-colors cursor-default"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-lg">{record.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {new Date(record.createdAt).toLocaleDateString('en-GB', { 
                      weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' 
                    })}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-display font-black text-foreground">{formatCurrency(record.impactResult.totalValue)}</p>
                <p className="text-sm text-primary font-bold">Social Value</p>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
