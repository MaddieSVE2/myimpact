import { Link } from "wouter";
import { ArrowRight, Globe2, HeartHandshake, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

export default function Intro() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center relative overflow-hidden pb-20">
      {/* Background elements */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[20%] -right-[10%] w-[70%] h-[70%] rounded-full bg-gradient-to-br from-primary/20 to-accent/20 blur-3xl opacity-60 mix-blend-multiply" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-gradient-to-tr from-blue-400/20 to-primary/20 blur-3xl opacity-60 mix-blend-multiply" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-5xl h-96 rounded-full bg-gradient-to-r from-orange-200/30 via-yellow-100/20 to-blue-200/30 blur-3xl" />
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm border border-white/40 shadow-sm text-sm font-semibold text-primary mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Powered by Social Value Engine
          </div>
          
          <h1 className="text-5xl md:text-7xl font-display font-black text-foreground leading-[1.1] mb-6">
            Discover the <br className="hidden md:block" />
            <span className="text-gradient">real value</span> of what you do.
          </h1>
          
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Volunteering, helping out, doing good—it all adds up. Calculate your personal social value in pounds (£) and see the actual impact you're making on the world.
          </p>

          <Link 
            href="/wizard/actions" 
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-primary to-primary/90 text-white font-bold text-lg shadow-xl shadow-primary/30 hover:shadow-2xl hover:shadow-primary/40 hover:-translate-y-1 transition-all duration-300"
          >
            Calculate My Impact <ArrowRight className="w-5 h-5" />
          </Link>
        </motion.div>

        <motion.div 
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24 text-left"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="glass-card p-6 rounded-3xl">
            <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center text-primary mb-4">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold mb-2">Track Your Actions</h3>
            <p className="text-muted-foreground text-sm">Log your volunteering, donations, and community work in one place.</p>
          </div>
          <div className="glass-card p-6 rounded-3xl">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 mb-4">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold mb-2">Measure Value</h3>
            <p className="text-muted-foreground text-sm">We use robust proxies to translate your actions into financial social value.</p>
          </div>
          <div className="glass-card p-6 rounded-3xl">
            <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center text-green-600 mb-4">
              <Globe2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold mb-2">Align with SDGs</h3>
            <p className="text-muted-foreground text-sm">See how your everyday actions contribute to the UN Sustainable Development Goals.</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
