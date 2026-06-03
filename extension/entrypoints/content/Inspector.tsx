import React, { useEffect, useState } from 'react';
import {
  X,
  MapPin,
  FileText,
  ShieldCheck,
  Info,
  Loader2,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from 'lucide-react';
import type { Inspection, MethodState } from './types';
import { computeVerdict, VERDICT_STYLE } from './verdict';
import { cn } from './cn';
import { MapPanel } from './MapPanel';

type PanelType = 'map' | 'exif' | 'verification' | 'info' | null;

const Z = 2147483647;

export function Inspector({
  inspection,
  onClose,
}: {
  inspection: Inspection;
  onClose: () => void;
}) {
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const verdict = computeVerdict(inspection.geocam, inspection.synthid);
  const { rgb } = VERDICT_STYLE[verdict];
  const borderColor = `rgb(${rgb})`;

  // Icons sit on the opposite side from the image.
  const iconsOnLeft = inspection.position === 'right';

  const handleIconClick = (panel: PanelType) => {
    setActivePanel((cur) => (cur === panel ? null : panel));
    setIsFlipped(false);
  };

  const iconRail = (
    <div className="flex flex-col gap-4">
      <IconButton icon={MapPin} label="Map" active={activePanel === 'map'} onClick={() => handleIconClick('map')} position={iconsOnLeft ? 'left' : 'right'} />
      <IconButton icon={FileText} label="EXIF" active={activePanel === 'exif'} onClick={() => handleIconClick('exif')} position={iconsOnLeft ? 'left' : 'right'} />
      <IconButton icon={ShieldCheck} label="Verification" active={activePanel === 'verification'} onClick={() => handleIconClick('verification')} position={iconsOnLeft ? 'left' : 'right'} />
      <IconButton icon={Info} label="Info" active={activePanel === 'info'} onClick={() => handleIconClick('info')} position={iconsOnLeft ? 'left' : 'right'} />
    </div>
  );

  const panel = activePanel && (
    <div className="w-[450px] max-w-[90vw] bg-white/95 backdrop-blur-md rounded-xl p-6 shadow-2xl border border-gray-200 max-h-[80vh] overflow-auto">
      {activePanel === 'map' && (() => {
        // Prefer GeoCam's signed location; fall back to EXIF GPS.
        const geo = inspection.geocam;
        const exif = inspection.exif.exif;
        const coords =
          geo.lat != null && geo.lng != null
            ? { lat: geo.lat, lng: geo.lng, source: 'GeoCam' }
            : exif?.lat != null && exif?.lng != null
              ? { lat: exif.lat, lng: exif.lng, source: 'EXIF' }
              : { lat: undefined, lng: undefined, source: undefined };
        return <MapPanel lat={coords.lat} lng={coords.lng} source={coords.source} />;
      })()}
      {activePanel === 'exif' && <ExifPanel inspection={inspection} />}
      {activePanel === 'verification' && <VerificationPanel inspection={inspection} />}
      {activePanel === 'info' && <InfoPanel inspection={inspection} />}
    </div>
  );

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      style={{ zIndex: Z }}
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 z-10 rounded-full p-3 bg-black/60 hover:bg-black/80 text-white transition-colors backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </button>

      <div className="flex items-center gap-6 max-w-7xl mx-auto" onClick={(e) => e.stopPropagation()}>
        {iconsOnLeft && (
          <>
            {iconRail}
            {panel}
          </>
        )}

        {/* Image with verdict border + 3D flip */}
        <div className="flex-shrink-0">
          <div
            className="relative cursor-pointer group"
            style={{ perspective: '1000px' }}
            onClick={() => {
              setIsFlipped((f) => !f);
              setActivePanel(null);
            }}
          >
            <div
              className="relative transition-transform duration-700"
              style={{
                transformStyle: 'preserve-3d',
                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              }}
            >
              {/* Front — the image */}
              <div
                className="relative rounded-lg overflow-hidden"
                style={{
                  backfaceVisibility: 'hidden',
                  border: `16px solid ${borderColor}`,
                  boxShadow: `0 0 40px rgba(${rgb}, 0.38), 0 0 80px rgba(${rgb}, 0.18)`,
                }}
              >
                <img
                  src={inspection.imageUrl}
                  alt={inspection.imageAlt}
                  className="w-[500px] h-[500px] max-w-[70vw] max-h-[70vh] object-cover"
                />

                {/* Page curl (dog-ear) hint */}
                {!isFlipped && (
                  <div className="absolute top-0 right-0 w-0 h-0 border-l-[60px] border-l-transparent border-t-[60px] border-t-gray-700/80 transition-opacity group-hover:opacity-100 opacity-70">
                    <div className="absolute -top-[58px] -right-[2px] w-0 h-0 border-r-[58px] border-r-transparent border-b-[58px] border-b-gray-500/40" />
                  </div>
                )}
              </div>

              {/* Back — per-method status */}
              <div
                className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-8 overflow-auto"
                style={{
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                  border: `16px solid ${borderColor}`,
                  boxShadow: `0 0 40px rgba(${rgb}, 0.38)`,
                }}
              >
                <h3 className="text-white font-semibold mb-6 text-2xl">Backend Verification</h3>
                <div className="space-y-5">
                  <BackendMethodRow label="GeoCam" state={inspection.geocam} passLabel="Verified" failLabel="Not verified" />
                  <BackendMethodRow label="SynthID" state={inspection.synthid} passLabel="No watermark" failLabel="Watermark found" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {!iconsOnLeft && (
          <>
            {panel}
            {iconRail}
          </>
        )}
      </div>
    </div>
  );
}

// ── Icon rail button ────────────────────────────────────────────────────────

interface IconButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
  position: 'left' | 'right';
}

function IconButton({ icon: Icon, label, active, onClick, position }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 group transition-transform',
        position === 'right' ? 'flex-row' : 'flex-row-reverse',
        active && 'scale-105',
      )}
      title={label}
    >
      <div
        className={cn(
          'w-16 h-16 rounded-full bg-gray-600 hover:bg-gray-500 text-white flex items-center justify-center shadow-lg hover:shadow-2xl transition-all backdrop-blur-sm',
          active && 'ring-4 ring-white',
        )}
      >
        <Icon className="w-8 h-8" />
      </div>
      <span className="text-sm font-medium text-white drop-shadow-lg whitespace-nowrap">{label}</span>
    </button>
  );
}

// ── Flip-side method row ─────────────────────────────────────────────────────

function BackendMethodRow({
  label,
  state,
  passLabel,
  failLabel,
}: {
  label: string;
  state: MethodState;
  passLabel: string;
  failLabel: string;
}) {
  return (
    <div className="bg-white/10 rounded-lg p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-white font-semibold text-lg">{label}</span>
        <StatusBadge state={state} passLabel={passLabel} failLabel={failLabel} />
      </div>
      {(state.message || state.error) && state.status !== 'loading' && (
        <p className="text-gray-300 text-sm mt-2 leading-snug">{state.message || state.error}</p>
      )}
    </div>
  );
}

function StatusBadge({
  state,
  passLabel,
  failLabel,
}: {
  state: MethodState;
  passLabel: string;
  failLabel: string;
}) {
  if (state.status === 'loading') {
    return (
      <span className="inline-flex items-center gap-1.5 text-gray-300 text-sm font-medium">
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking…
      </span>
    );
  }
  if (state.status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/20 text-green-300 text-sm font-semibold">
        <CheckCircle2 className="w-4 h-4" />
        {passLabel}
      </span>
    );
  }
  if (state.status === 'not-verified') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 text-red-300 text-sm font-semibold">
        <XCircle className="w-4 h-4" />
        {failLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-500/20 text-gray-300 text-sm font-semibold">
      <MinusCircle className="w-4 h-4" />
      Unavailable
    </span>
  );
}

// ── Verification panel ───────────────────────────────────────────────────────

function VerificationPanel({ inspection }: { inspection: Inspection }) {
  const verdict = computeVerdict(inspection.geocam, inspection.synthid);
  const { label, rgb } = VERDICT_STYLE[verdict];

  return (
    <div>
      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 text-gray-900">
        <ShieldCheck className="w-5 h-5" />
        Verification Result
      </h3>

      <div
        className="rounded-lg p-5 border-2 mb-5"
        style={{ borderColor: `rgb(${rgb})`, backgroundColor: `rgba(${rgb}, 0.12)` }}
      >
        <span className="text-2xl font-bold" style={{ color: `rgb(${rgb})` }}>
          {label}
        </span>
        <p className="text-gray-700 mt-1 text-sm">
          Overall verdict from the authenticity checks below.
        </p>
      </div>

      <div className="space-y-3">
        <MethodDetail label="GeoCam" state={inspection.geocam} />
        <MethodDetail label="SynthID" state={inspection.synthid} />
      </div>
    </div>
  );
}

function MethodDetail({ label, state }: { label: string; state: MethodState }) {
  const text =
    state.status === 'loading'
      ? 'Checking…'
      : state.message || state.error || statusFallback(state.status);

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-gray-900">{label}</span>
        <StatusDot status={state.status} />
      </div>
      <p className="text-sm text-gray-600 mt-1 leading-snug">{text}</p>
    </div>
  );
}

function statusFallback(status: MethodState['status']) {
  if (status === 'verified') return 'Passed.';
  if (status === 'not-verified') return 'Flagged.';
  return 'Could not be checked.';
}

function StatusDot({ status }: { status: MethodState['status'] }) {
  if (status === 'loading') return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />;
  if (status === 'verified') return <CheckCircle2 className="w-5 h-5 text-green-600" />;
  if (status === 'not-verified') return <XCircle className="w-5 h-5 text-red-600" />;
  return <MinusCircle className="w-5 h-5 text-gray-400" />;
}

// ── EXIF panel ───────────────────────────────────────────────────────────────

function ExifPanel({ inspection }: { inspection: Inspection }) {
  const { status, exif, error } = inspection.exif;

  const body = () => {
    if (status === 'loading') return <Empty icon={FileText} text="Decoding EXIF metadata…" spin />;
    if (status === 'unavailable') return <Empty icon={FileText} text={error ?? 'EXIF decoding is unavailable.'} />;
    if (status === 'none' || !exif) return <Empty icon={FileText} text="No EXIF metadata found." />;

    const rows: Array<[string, string | undefined]> = [
      ['Camera', exif.camera],
      ['Lens', exif.lens],
      ['Date Taken', exif.takenAt],
      ['ISO', exif.iso],
      ['Aperture', exif.aperture],
      ['Shutter Speed', exif.shutterSpeed],
      ['Focal Length', exif.focalLength],
      ['Title', exif.title],
      ['Description', exif.description],
      ['Photographer', exif.author],
      ['License', exif.license],
      ['GPS', exif.gps],
    ];
    const present = rows.filter(([, v]) => !!v) as Array<[string, string]>;
    if (!present.length) return <Empty icon={FileText} text="No EXIF metadata found." />;

    return (
      <div className="space-y-1">
        {present.map(([label, value]) => (
          <DetailRow key={label} label={label} value={value} />
        ))}
      </div>
    );
  };

  return (
    <div>
      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 text-gray-900">
        <FileText className="w-5 h-5" />
        EXIF Metadata
      </h3>
      {body()}
    </div>
  );
}

// ── Info panel ───────────────────────────────────────────────────────────────

function InfoPanel({ inspection }: { inspection: Inspection }) {
  const { naturalWidth, naturalHeight, format, fileSize } = inspection;
  const rows: Array<[string, string | undefined]> = [
    [
      'Dimensions',
      naturalWidth && naturalHeight ? `${naturalWidth} × ${naturalHeight} px` : undefined,
    ],
    [
      'Aspect Ratio',
      naturalWidth && naturalHeight ? (naturalWidth / naturalHeight).toFixed(2) : undefined,
    ],
    ['Format', format ? format.toUpperCase() : undefined],
    ['File Size', fileSize],
  ];
  const present = rows.filter(([, v]) => !!v) as Array<[string, string]>;

  return (
    <div>
      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 text-gray-900">
        <Info className="w-5 h-5" />
        Image Information
      </h3>
      {present.length ? (
        <div className="space-y-1">
          {present.map(([label, value]) => (
            <DetailRow key={label} label={label} value={value} />
          ))}
        </div>
      ) : (
        <Empty icon={Info} text="No image information available." />
      )}
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-gray-200 last:border-0">
      <span className="text-sm text-gray-600 font-medium shrink-0">{label}</span>
      <span className="text-sm text-gray-900 text-right break-words">{value}</span>
    </div>
  );
}

function Empty({
  icon: Icon,
  text,
  spin,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  spin?: boolean;
}) {
  return (
    <div className="text-center py-12">
      <Icon className={cn('w-16 h-16 mx-auto mb-4 text-gray-300', spin && 'animate-spin')} />
      <p className="text-gray-600">{text}</p>
    </div>
  );
}
