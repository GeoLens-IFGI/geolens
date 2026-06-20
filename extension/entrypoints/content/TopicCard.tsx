import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Info, Loader2, Minus, X } from 'lucide-react';
import { cn } from './cn';
import { Tooltip } from './Tooltip';
import {
  LIGHT_RGB,
  LIGHT_TEXT_ON,
  type Finding,
  type TopicCard as TopicCardData,
  type TrafficLight,
} from './topics';

// A single category box. The header is a solid traffic-light colour with the
// category name centred and a help "?" on the right. Clicking the box selects it
// (driving the image frame colour) and expands the detail panel beneath, where
// the contributing verifiers, metadata and findings are shown.
export function TopicCard({
  topic,
  selected,
  onToggle,
}: {
  topic: TopicCardData;
  selected: boolean;
  onToggle: () => void;
}) {
  const rgb = LIGHT_RGB[topic.light];
  const fill = `rgb(${rgb})`;
  const text = LIGHT_TEXT_ON[topic.light];

  return (
    <div
      className={cn(
        'relative rounded-xl transition-shadow duration-200',
        selected && 'shadow-lg',
      )}
    >
      {/* Connector notch toward the image frame (left side). */}
      {selected && (
        <span
          aria-hidden
          className="absolute right-full top-7 h-3 w-3 -translate-y-1/2 rotate-45 rounded-[2px] transition-opacity duration-200"
          style={{ backgroundColor: fill, marginRight: '-6px' }}
        />
      )}

      {/* Coloured header / toggle — hovering anywhere on it shows the help text. */}
      <Tooltip content={topic.help} side="top" className="block w-full">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={selected}
          aria-label={`${topic.title} — ${topic.help}`}
          className={cn(
            'flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left transition-transform duration-200',
            'hover:brightness-[1.04] active:scale-[0.99]',
            selected && 'rounded-b-none',
          )}
          style={{ backgroundColor: fill, color: text }}
        >
          {/* Left spacer keeps the centred title balanced against the status icon. */}
          {topic.loading ? (
            <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin" style={{ color: text }} />
          ) : (
            <span className="h-5 w-5 flex-shrink-0" />
          )}
          <span className="flex-1 text-center text-[15px] font-semibold">{topic.title}</span>
          {/* Status indicator (check / cross / warning / dash). */}
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center" style={{ color: text }}>
            {topic.loading ? null : <StatusIcon light={topic.light} />}
          </span>
        </button>
      </Tooltip>

      {/* Expanded detail */}
      {selected && (
        <div className="rounded-b-xl border border-t-0 border-gray-200 bg-white px-4 py-3">
          {topic.loading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Retrieving data…
            </div>
          ) : (
            <ExpandedBody topic={topic} />
          )}
        </div>
      )}
    </div>
  );
}

function ExpandedBody({ topic }: { topic: TopicCardData }) {
  const hasContent = topic.findings.length || topic.rows?.length || topic.badge;

  return (
    <div className="space-y-3">
      {topic.badge && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
          style={{
            backgroundColor: `rgba(${LIGHT_RGB[topic.badge.light]}, 0.18)`,
            color: badgeText(topic.badge.light),
          }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: `rgb(${LIGHT_RGB[topic.badge.light]})` }}
          />
          {topic.badge.text}
        </span>
      )}

      {/* Key/value metadata table (Camera & File Info). */}
      {topic.rows && topic.rows.length > 0 && (
        <div className="space-y-0.5">
          {topic.rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-start justify-between gap-4 border-b border-gray-100 py-1.5 last:border-0"
            >
              <span className="shrink-0 text-sm font-medium text-gray-500">{label}</span>
              <span className="break-words text-right text-sm text-gray-900">{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Verifier findings. */}
      {topic.findings.map((f) => (
        <FindingRow key={`${f.verifier}-${f.label}`} finding={f} />
      ))}

      {!hasContent && !topic.noData?.length && (
        <p className="text-sm text-gray-500">No data available for this category.</p>
      )}

      {/* Verifiers that were checked but returned nothing. */}
      {topic.noData && topic.noData.length > 0 && (
        <div className="pt-1">
          <p className="mb-1 text-xs font-medium text-gray-400">No data from:</p>
          <ul className="space-y-0.5">
            {topic.noData.map((n) => (
              <li key={n} className="text-xs text-gray-400">
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const [showDetail, setShowDetail] = useState(false);
  const Chevron = showDetail ? ChevronDown : ChevronRight;
  const dot = LIGHT_RGB[finding.light];

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: `rgb(${dot})` }}
        />
        <span className="text-sm font-medium text-gray-900">{finding.label}</span>
        {finding.verifier && (
          <Tooltip
            content={
              <span>
                Checked by <strong>{finding.verifier}</strong>
                {finding.explainer ? ` — ${finding.explainer}` : ''}
              </span>
            }
            side="top"
          >
            <span className="flex items-center text-gray-400 transition-colors hover:text-gray-600">
              <Info className="h-3.5 w-3.5" />
            </span>
          </Tooltip>
        )}
        {finding.verifier && (
          <span className="ml-auto rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600">
            {finding.verifier}
          </span>
        )}
      </div>

      {finding.message && (
        <p className="mt-1 break-words text-sm leading-snug text-gray-800">{finding.message}</p>
      )}
      {finding.explainer && (
        <p className="mt-1 text-xs leading-snug text-gray-500">{finding.explainer}</p>
      )}

      {finding.detail && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setShowDetail((d) => !d)}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-gray-800"
          >
            <Chevron className="h-3.5 w-3.5" />
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

// Status indicator shown on the right of each category box: a checkmark when
// verified, a cross when failed, a warning for partial, a dash when not checked.
function StatusIcon({ light }: { light: TrafficLight }) {
  if (light === 'green') return <Check className="h-[18px] w-[18px]" strokeWidth={3} />;
  if (light === 'red') return <X className="h-[18px] w-[18px]" strokeWidth={3} />;
  if (light === 'orange') return <AlertTriangle className="h-4 w-4" strokeWidth={2.5} />;
  return <Minus className="h-[18px] w-[18px]" strokeWidth={3} />;
}

// Darker, readable text for the small translucent badge pill.
function badgeText(light: TrafficLight): string {
  if (light === 'green') return '#0c5e44';
  if (light === 'orange') return '#9a4d10';
  if (light === 'red') return '#a31528';
  return '#4b5563';
}
