import { useState, type CSSProperties } from 'react';
import { ArrowUpRight, CalendarClock, Plus, X, MoreHorizontal, StickyNote } from 'lucide-react';
import { useItemLongPress } from './useItemLongPress';
import { TileTimerButton } from './TileTimers';
import { ReadingLinkCard } from './ReadingLink';
import type { ReadingLink } from '../services/readingLinks';

export type StackItem = {
  id: string;
  name: string;
  themeId?: string;
  detail: string;
  time?: string;
  completed?: boolean;
  openLabel?: string;
  removeLabel?: string;
  onOpen: () => void;
  onDone?: () => void;
  onRemove?: () => void;
  onActions?: () => void;
  onNote?: () => void;
  hasNote?: boolean;
  readingLink?: ReadingLink;
};
export type StackDay = { date: string; anytime: StackItem[]; timed: StackItem[]; suggestions: StackItem[] };

// Stable accents follow theme identity, even when themes are reordered.
function themeStyle(id = ''): CSSProperties {
  const colors = [ ['#40846c', '#edf6f0'], ['#397ba2', '#edf4fa'], ['#ae5575', '#fbf0f4'], ['#947222', '#faf6e8'] ];
  const hash = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const [edge, fill] = id ? colors[hash % colors.length] : ['#88938e', '#f1f4f2'];
  return { '--stack-edge': edge, '--stack-fill': fill } as CSSProperties;
}

function PlanCard({ item }: { item: StackItem }) {
  const { cancel: cancelPress, ...press } = useItemLongPress(item.onActions);
  return <article className={`stack-plan-card${item.readingLink ? ' has-reading-link' : ''}${item.completed ? ' is-complete' : ''}`} style={themeStyle(item.themeId)}>
    {item.onDone && <input type="checkbox" checked={!!item.completed} onChange={item.onDone} aria-label={`${item.completed ? 'Mark incomplete' : 'Complete'} ${item.name}`} />}
    <button type="button" className="stack-card-content" {...press} onDragStart={cancelPress} onClick={item.onOpen} title={item.openLabel ?? (item.time ? `Open day for ${item.name}` : `Plan ${item.name}`)}>
      <strong>{item.name}</strong><span>{item.time ?? item.detail}</span>{item.time && <small>{item.detail}</small>}
    </button>
    {item.onActions && <button type="button" className="stack-card-actions" aria-label={`Options for ${item.name}`} title={`Options for ${item.name}`} onClick={item.onActions}><MoreHorizontal size={18} /></button>}
    {item.time && <div className="stack-tile-timer">{item.onNote && <button type="button" className="grid-note-button" data-has-note={!!item.hasNote} title={`${item.hasNote ? 'Read note' : 'Add note'} for ${item.name}`} aria-label={`Notes for ${item.name}`} onClick={item.onNote}><StickyNote size={18} /></button>}<TileTimerButton blockId={item.id} name={item.name} /></div>}
    {item.onRemove && <button type="button" className="stack-card-remove" onClick={item.onRemove} aria-label={item.removeLabel ?? `Remove day for ${item.name}`} title={item.removeLabel ?? 'Remove day'}><X size={14} /></button>}
    {item.readingLink && <ReadingLinkCard link={item.readingLink} title={item.name} />}
    {!item.onDone && !item.onRemove && <CalendarClock className="stack-card-symbol" size={15} aria-hidden="true" />}
  </article>;
}

export function WeeklyStack({ days, today, selectedDay, onSelectDay, themes, onAdd, onOpenDay }: {
  days: StackDay[]; today: string; selectedDay: number; onSelectDay: (index: number) => void;
  themes: { id: string; name: string }[]; onAdd: (date: string) => void; onOpenDay: (index: number) => void;
}) {
  const [theme, setTheme] = useState('');
  const matches = (item: StackItem) => !theme || item.themeId === theme;
  const visible = days.map(day => ({ ...day, anytime: day.anytime.filter(matches), timed: day.timed.filter(matches), suggestions: day.suggestions.filter(matches) }));
  return <section className="weekly-stack" aria-label="Stacked week">
    <div className="stack-filter"><label>Theme <select value={theme} onChange={event => setTheme(event.target.value)}><option value="">All themes</option>{themes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
    <div className="stack-day-strip" aria-label="Select a day">{visible.map((day, index) => {
      const date = new Date(`${day.date}T12:00:00`);
      return <button key={day.date} type="button" onClick={() => onSelectDay(index)} aria-pressed={selectedDay === index} aria-label={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} aria-current={day.date === today ? 'date' : undefined}>
        <span>{date.toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>{date.getDate()}</strong><span className={`stack-day-dot${day.anytime.length + day.timed.length ? ' has-plans' : ''}`} />
      </button>;
    })}</div>
    <div className="stack-week-columns">{visible.map((day, index) => {
      const date = new Date(`${day.date}T12:00:00`);
      const count = day.anytime.length + day.timed.length;
      return <section className="stack-day-column" key={day.date} data-selected={selectedDay === index} data-today={day.date === today} aria-label={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
        <header className="stack-day-heading"><div><span>{date.toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>{date.getDate()}</strong></div><button type="button" onClick={() => onOpenDay(index)} aria-label={`Open ${date.toLocaleDateString(undefined, { weekday: 'long' })}`} title="Open day"><ArrowUpRight size={17} /></button></header>
        <div className="stack-day-summary">{day.date === today ? 'Today' : date.toLocaleDateString(undefined, { month: 'short' })}<span>{count} {count === 1 ? 'plan' : 'plans'}</span></div>
        <section className="stack-day-group stack-anytime"><h3>Any time</h3>{day.anytime.map(item => <PlanCard key={item.id} item={item} />)}{!day.anytime.length && <p className="stack-empty">{theme ? 'No matching plans' : 'Nothing planned'}</p>}</section>
        <section className="stack-day-group"><h3>Scheduled</h3>{day.timed.map(item => <PlanCard key={item.id} item={item} />)}{!day.timed.length && <p className="stack-empty">{theme ? 'No matching plans' : 'Time open'}</p>}</section>
        {!!day.suggestions.length && <section className="stack-day-group stack-suggestions"><h3>Suggested</h3>{day.suggestions.map(item => <PlanCard key={item.id} item={item} />)}</section>}
        <button type="button" className="stack-day-add" onClick={() => onAdd(day.date)} title={`Plan for ${date.toLocaleDateString()}`} aria-label={`Plan for ${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}><Plus size={17} /> Plan</button>
      </section>;
    })}</div>
  </section>;
}
