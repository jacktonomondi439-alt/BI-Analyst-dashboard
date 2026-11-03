import * as React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const INSIGHT =
  'AI Insight: Low throughput at Terminal C suggests a bottleneck in the sorting area. Divert 15% of flow to Warehouse B to maintain SLA.';

export default function AIInsightBox() {
  const [typed, setTyped] = React.useState('');

  React.useEffect(() => {
    let i = 0;
    const tickMs = 22;
    const t = window.setInterval(() => {
      i += 1;
      setTyped(INSIGHT.slice(0, i));
      if (i >= INSIGHT.length) window.clearInterval(t);
    }, tickMs);

    return () => window.clearInterval(t);
  }, []);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="rounded-xl border p-4"
      style={{
        backgroundColor: 'rgba(4, 10, 26, 0.55)',
        borderColor: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 0 0 1px rgba(0,212,255,0.18), 0 0 26px rgba(0,212,255,0.12)',
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg border"
          style={{ borderColor: '#00d4ff44', backgroundColor: '#00d4ff12', color: '#00d4ff' }}
          aria-hidden="true"
        >
          <Sparkles className="h-4 w-4" />
        </div>
        <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">AI Diagnostics</h3>
      </div>

      <p className="font-sans text-sm leading-relaxed text-slate-200">
        {typed}
        <motion.span
          aria-hidden="true"
          className="inline-block pl-0.5"
          animate={{ opacity: [1, 0.35, 1] }}
          transition={{ repeat: Infinity, duration: 0.9, ease: 'easeInOut' }}
        >
          |
        </motion.span>
      </p>
    </motion.section>
  );
}

