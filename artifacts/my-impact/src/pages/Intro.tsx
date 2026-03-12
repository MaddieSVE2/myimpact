import { Link } from "wouter";
import { ArrowRight, Globe2, HeartHandshake, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

export default function Intro() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center relative overflow-hidden pb-20">
      {/* Background elements (simplified) */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[20%] -right-[10%] w-[70%] h-[70%] rounded-full bg-primary/5 blur-3xl opacity-60 mix-blend-multiply" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-left"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-border text-xs font-medium text-muted-foreground mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Powered by Social Value Engine
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-foreground leading-[1.1] mb-6">
              Discover the <br className="hidden md:block" />
              <span className="text-primary">real value</span> of what you do.
            </h1>
            
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed max-w-lg">
              Volunteering, helping out, doing good—it all adds up. Calculate your personal social value in pounds (£) and see the actual impact you're making on the world.
            </p>

            <Link 
              href="/wizard/actions" 
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-primary text-white font-medium shadow-sm hover:bg-primary/90 transition-colors duration-200"
            >
              Calculate My Impact <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex justify-center lg:justify-end"
          >
            <img 
              src={`${import.meta.env.BASE_URL}images/faces.png`} 
              alt="Faces Illustration" 
              className="w-full max-w-md object-contain mix-blend-multiply"
            />
          </motion.div>
        </div>

        <motion.div 
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 text-left"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="bg-white border border-border p-6 rounded-xl">
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-primary mb-4">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold mb-2">Track Your Actions</h3>
            <p className="text-muted-foreground text-sm">Log your volunteering, donations, and community work in one place.</p>
          </div>
          <div className="bg-white border border-border p-6 rounded-xl">
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-foreground mb-4">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold mb-2">Measure Value</h3>
            <p className="text-muted-foreground text-sm">We use robust proxies to translate your actions into financial social value.</p>
          </div>
          <div className="bg-white border border-border p-6 rounded-xl">
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-foreground mb-4">
              <Globe2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold mb-2">Align with SDGs</h3>
            <p className="text-muted-foreground text-sm">See how your everyday actions contribute to the UN Sustainable Development Goals.</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
