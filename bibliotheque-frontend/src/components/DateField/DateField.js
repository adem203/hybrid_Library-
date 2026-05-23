import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './DateField.css';

/**
 * Dark-theme date field with DD/MM/YYYY display and a calendar popover.
 * - value: ISO 'YYYY-MM-DD' or '' (controlled).
 * - onChange: receives ISO 'YYYY-MM-DD' or ''.
 * - min/max: optional ISO bounds enforced both in the input and in the grid.
 *
 * Why the popover is rendered through a portal:
 * The Emprunts page nests this field inside `.panel` containers that clip
 * overflow. A portal to document.body keeps the calendar visible above all
 * page chrome regardless of ancestor `overflow` settings.
 */

const MIN_YEAR_DEFAULT = 1900;
const MAX_YEAR_DEFAULT = 9999;
const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const WEEKDAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const POP_WIDTH = 280;

const pad2 = (n) => String(n).padStart(2, '0');

const isoToDisplay = (iso) => {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
};

// Strict parse with leap-year + month-length round-trip check.
const displayToIso = (text, minYear, maxYear) => {
  if (!text) return { iso: '', error: null };
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return { iso: null, error: 'incomplete' };
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (yyyy < minYear || yyyy > maxYear) return { iso: null, error: 'year' };
  if (mm < 1 || mm > 12) return { iso: null, error: 'month' };
  if (dd < 1 || dd > 31) return { iso: null, error: 'day' };
  // Native round-trip catches impossible days for each month and non-leap Feb 29.
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) {
    return { iso: null, error: 'day' };
  }
  return { iso: `${yyyy}-${pad2(mm)}-${pad2(dd)}`, error: null };
};

// Digit-position-aware mask. Rejects any keystroke that would make the
// running prefix unable to become a valid DD/MM/YYYY date — so 44/16/2026
// and 31/02/202X simply never appear in the input, full-date check below
// then catches month-specific day overflows like 31/04.
const maskInput = (raw) => {
  const digits = raw.replace(/\D/g, '');
  const kept = [];
  for (let i = 0; i < digits.length && kept.length < 8; i++) {
    const ch = digits[i];
    const n = Number(ch);
    const pos = kept.length;
    let ok = true;
    if (pos === 0) {
      // day tens: 0..3
      if (n > 3) ok = false;
    } else if (pos === 1) {
      // day ones, constrained by day tens
      const tens = Number(kept[0]);
      if (tens === 0 && n === 0) ok = false;          // 00 invalid
      else if (tens === 3 && n > 1) ok = false;        // 32..39 invalid
    } else if (pos === 2) {
      // month tens: 0..1
      if (n > 1) ok = false;
    } else if (pos === 3) {
      // month ones, constrained by month tens
      const tens = Number(kept[2]);
      if (tens === 0 && n === 0) ok = false;          // 00 invalid
      else if (tens === 1 && n > 2) ok = false;        // 13..19 invalid
    } else if (pos === 4) {
      // first year digit: forbid 0 (no year 0xxx)
      if (n === 0) ok = false;
    }
    if (ok) kept.push(ch);
  }
  let out = '';
  for (let i = 0; i < kept.length; i++) {
    if (i === 2 || i === 4) out += '/';
    out += kept[i];
  }
  return out;
};

function buildCalendarGrid(year, month) {
  // 6-week Monday-first grid.
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - startOffset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return cells;
}

const cmpIso = (a, b) => {
  // Lexicographic compare works on YYYY-MM-DD.
  if (a === b) return 0;
  return a < b ? -1 : 1;
};

export default function DateField({
  value = '',
  onChange,
  placeholder = 'jj/mm/aaaa',
  minYear = MIN_YEAR_DEFAULT,
  maxYear = MAX_YEAR_DEFAULT,
  min = '',
  max = '',
  disabled = false,
  className = '',
  id,
  ariaLabel,
}) {
  const rootRef = useRef(null);
  const popoverRef = useRef(null);
  const [text, setText] = useState(isoToDisplay(value));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [popPos, setPopPos] = useState({ top: 0, left: 0 });

  // Initial visible month — selected date, otherwise today.
  const initialView = useMemo(() => {
    if (value) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [value]);
  const [view, setView] = useState(initialView);

  useEffect(() => {
    setText(isoToDisplay(value));
    setError(null);
  }, [value]);

  // Compute popover position from the input rect. Re-runs on any scroll or
  // resize so the popover stays glued to the input even if a scrollable
  // ancestor moves.
  const reposition = useCallback(() => {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 6;
    let left = rect.left + window.scrollX;
    const viewportRight = window.scrollX + document.documentElement.clientWidth - 8;
    if (left + POP_WIDTH > viewportRight) left = Math.max(8, viewportRight - POP_WIDTH);
    setPopPos({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    reposition();
    const onDocClick = (ev) => {
      if (rootRef.current?.contains(ev.target)) return;
      if (popoverRef.current?.contains(ev.target)) return;
      setOpen(false);
    };
    const onKey = (ev) => { if (ev.key === 'Escape') setOpen(false); };
    // capture-mode scroll picks up scrolling inside any ancestor.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, reposition]);

  const emit = (iso) => { onChange?.(iso); };

  const outOfRange = (iso) => {
    if (!iso) return null;
    if (min && cmpIso(iso, min) < 0) return 'min';
    if (max && cmpIso(iso, max) > 0) return 'max';
    return null;
  };

  const handleTextChange = (raw) => {
    const masked = maskInput(raw);
    setText(masked);
    if (masked.length === 0) {
      setError(null);
      emit('');
      return;
    }
    if (masked.length === 10) {
      const { iso, error: err } = displayToIso(masked, minYear, maxYear);
      if (!iso) { setError(err); return; }
      const rangeErr = outOfRange(iso);
      if (rangeErr) { setError(rangeErr); return; }
      setError(null);
      emit(iso);
      const d = new Date(iso);
      setView({ year: d.getFullYear(), month: d.getMonth() });
    } else {
      setError(null);
    }
  };

  const handleBlur = () => {
    if (!text) { setError(null); emit(''); return; }
    const { iso, error: err } = displayToIso(text, minYear, maxYear);
    if (!iso) { setError(err || 'invalid'); return; }
    const rangeErr = outOfRange(iso);
    if (rangeErr) { setError(rangeErr); return; }
    setError(null);
    emit(iso);
  };

  const handleClear = () => {
    setText('');
    setError(null);
    emit('');
  };

  const pickDay = (d) => {
    const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    if (outOfRange(iso)) return; // guard, though disabled days shouldn't fire
    setText(isoToDisplay(iso));
    setError(null);
    emit(iso);
    setOpen(false);
  };

  const prevMonth = () => setView(v => v.month === 0
    ? { year: v.year - 1, month: 11 }
    : { year: v.year, month: v.month - 1 });
  const nextMonth = () => setView(v => v.month === 11
    ? { year: v.year + 1, month: 0 }
    : { year: v.year, month: v.month + 1 });

  const cells = useMemo(() => buildCalendarGrid(view.year, view.month), [view]);
  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }, []);

  const errorMessage = ({
    incomplete: 'Date incomplète (jj/mm/aaaa).',
    year: `L'année doit être entre ${minYear} et ${maxYear}.`,
    month: 'Mois invalide.',
    day: 'Jour invalide pour ce mois.',
    invalid: 'Date invalide.',
    min: 'La date est antérieure à la borne minimale.',
    max: 'La date est postérieure à la borne maximale.',
  })[error];

  const openCalendar = () => {
    if (disabled) return;
    setOpen(o => !o);
  };

  return (
    <div ref={rootRef} className={`datefield ${className}`}>
      <div className={`datefield-control ${disabled ? 'is-disabled' : ''} ${error ? 'has-error' : ''}`}>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={ariaLabel}
          className="datefield-input"
          placeholder={placeholder}
          value={text}
          maxLength={10}
          disabled={disabled}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={handleBlur}
        />
        {text && !disabled && (
          <button type="button" className="datefield-btn datefield-clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear} aria-label="Effacer la date" title="Effacer">✕</button>
        )}
        <button type="button" className="datefield-btn datefield-toggle"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openCalendar}
          disabled={disabled} aria-label="Ouvrir le calendrier" title="Calendrier">📅</button>
      </div>
      {error && <div className="datefield-error">{errorMessage}</div>}

      {open && createPortal(
        <div ref={popoverRef}
             className="datefield-popover"
             role="dialog"
             style={{ top: popPos.top, left: popPos.left, width: POP_WIDTH }}>
          <div className="datefield-pop-header">
            <button type="button" className="datefield-nav" onClick={prevMonth} aria-label="Mois précédent">‹</button>
            <div className="datefield-pop-title">{MONTHS_FR[view.month]} {view.year}</div>
            <button type="button" className="datefield-nav" onClick={nextMonth} aria-label="Mois suivant">›</button>
          </div>
          <div className="datefield-pop-weekdays">
            {WEEKDAYS_FR.map(w => <div key={w} className="datefield-pop-wd">{w}</div>)}
          </div>
          <div className="datefield-pop-grid">
            {cells.map((d, i) => {
              const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
              const inMonth = d.getMonth() === view.month;
              const isToday = iso === todayIso;
              const isSelected = iso === value;
              const yearOut = d.getFullYear() < minYear || d.getFullYear() > maxYear;
              const rangeOut = !!outOfRange(iso);
              const cellDisabled = yearOut || rangeOut;
              return (
                <button
                  key={i}
                  type="button"
                  className={[
                    'datefield-day',
                    inMonth ? '' : 'is-other-month',
                    isToday ? 'is-today' : '',
                    isSelected ? 'is-selected' : '',
                    cellDisabled ? 'is-disabled' : '',
                  ].filter(Boolean).join(' ')}
                  disabled={cellDisabled}
                  onClick={() => pickDay(d)}>
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="datefield-pop-footer">
            <button type="button" className="datefield-foot-btn"
              onClick={() => {
                const t = new Date();
                pickDay(new Date(t.getFullYear(), t.getMonth(), t.getDate()));
              }}>Aujourd'hui</button>
            <button type="button" className="datefield-foot-btn" onClick={handleClear}>Effacer</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
