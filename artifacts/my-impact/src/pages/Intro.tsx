import { Link } from "wouter";
import { ArrowRight, BarChart2, FileText, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

export default function Intro() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 lg:px-8 w-full pt-16 pb-24">

        {/* Hero */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-left"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-border text-xs font-medium text-muted-foreground mb-8">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
              </span>
              Powered by the Social Value Engine
            </div>

            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground leading-[1.15] mb-5">
              Quantify your impact,<br />
              <span className="text-primary">inspire positive change.</span>
            </h1>

            <p className="text-base text-muted-foreground mb-4 leading-relaxed max-w-md">
              Turn your positive actions into measurable impact. My Impact calculates the real social value of what you do — in pounds — using globally recognised standards.
            </p>

            <p className="text-sm text-muted-foreground italic mb-8 max-w-md">
              "The Difference I Make"
            </p>

            <Link
              href="/wizard/actions"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors duration-200"
            >
              Calculate My Impact <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex justify-center lg:justify-end"
          >
            <img
              src={`${import.meta.env.BASE_URL}images/faces.png`}
              alt="My Impact illustration"
              className="w-56 md:w-64 object-contain mix-blend-multiply"
            />
          </motion.div>
        </div>

        {/* How it works */}
        <motion.div
          className="mt-20"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
        >
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-6">How it works</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: <FileText className="w-4 h-4" />,
                step: "1",
                title: "Tell us about you",
                desc: "Share where you live and what you care about — in just a few clicks."
              },
              {
                icon: <BarChart2 className="w-4 h-4" />,
                step: "2",
                title: "Log your activities",
                desc: "Pick from our library of verified Social Value Engine proxies — volunteering, eco actions, giving and more."
              },
              {
                icon: <TrendingUp className="w-4 h-4" />,
                step: "3",
                title: "See your value",
                desc: "Get a credible, shareable breakdown of your social impact in pounds — ready for CVs and applications."
              }
            ].map((item) => (
              <div key={item.step} className="bg-white border border-border rounded-lg p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-semibold text-primary bg-primary/10 rounded-full w-5 h-5 flex items-center justify-center">{item.step}</span>
                  <span className="text-foreground">{item.icon}</span>
                </div>
                <h3 className="text-sm font-semibold mb-1.5 text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
