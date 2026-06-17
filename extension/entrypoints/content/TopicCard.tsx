import { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MinusCircle,
} from 'lucide-react';
import { cn } from './cn';
import { LIGHT_RGB, type Finding, type TopicCard as TopicCardData, type TrafficLight } from './topics';

// Short status word shown next to the topic title in the collapsed header.
const LIGHT_WORD: Record<TrafficLight, string> = {
  green: 'OK',
  yellow: 'Caution',
  red: 'Alert',
  gray: 'Not checked',
};

// A single collapsible topic card. Border + background are tinted with the
// topic's traffic-light colour; the body (findings) is hidden until opened.
export function TopicCard({ topic }: { topic: TopicCardData }) {
  const [open, setOpen] = useState(false);
  const rgb = LIGHT_RGB[topic.light];
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div
      className="rounded-lg border-2"
      style={{ borderColor: `rgb(${rgb})`, backgroundColor: `rgba(${rgb}, 0.10)` }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-3 text-left"
      >
        <span className="flex items-center gap-2 font-semibold text-gray-900">
          <LightIcon light={topic.light} loading={topic.loading} />
          {topic.title}
        </span>
        <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: `rgb(${rgb})` }}>
          {topic.loading ? 'Checking…' : LIGHT_WORD[topic.light]}
          <Chevron className="w-4 h-4 text-gray-500" />
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {topic.loading ? (
            <p className="text-sm text-gray-600">Checking…</p>
          ) : topic.findings.length ? (
            topic.findings.map((f) => <FindingRow key={f.label} finding={f} />)
          ) : (
            <p className="text-sm text-gray-600">Nothing to report — not checked for this image.</p>
          )}
        </div>
      )}
    </div>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const [showDetail, setShowDetail] = useState(false);
  const Chevron = showDetail ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-md bg-white/70 border border-gray-200 p-2.5">
      <div className="flex items-center gap-2">
        <LightIcon light={finding.light} />
        <span className="font-medium text-gray-900 text-sm">{finding.label}</span>
      </div>
      {finding.message && (
        <p className="text-sm text-gray-800 mt-1 leading-snug">{finding.message}</p>
      )}
      {finding.explainer && (
        <p className="text-xs text-gray-500 mt-1 leading-snug">{finding.explainer}</p>
      )}
      {finding.detail && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setShowDetail((d) => !d)}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
          >
            <Chevron className="w-3.5 h-3.5" />
            {showDetail ? 'Hide details' : 'Why?'}
          </button>
          {showDetail && (
            <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-snug text-gray-600">
              {finding.detail}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function LightIcon({ light, loading }: { light: TrafficLight; loading?: boolean }) {
  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-gray-400" />;
  if (light === 'green') return <CheckCircle2 className="w-5 h-5 text-green-600" />;
  if (light === 'yellow') return <AlertTriangle className="w-5 h-5 text-amber-500" />;
  if (light === 'red') return <XCircle className="w-5 h-5 text-red-600" />;
  return <MinusCircle className="w-5 h-5 text-gray-400" />;
}
