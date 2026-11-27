import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Timer, X } from 'lucide-react';
import { PlannerModal } from './PlannerShell';
import { nativeTimers, openTimerAlarmSettings, prepareTileTimerAlarm, tileTimerAlarm } from '../native/tileTimerAlarm';
import { cancelTileTimer, expireTileTimers, readTileTimers, remainingTime, startTileTimer, timerChangeEvent, timerStorageKey, type TileTimer } from '../services/tileTimers';
import './TileTimers.css';

type TimerContext = { timers: TileTimer[]; open: (id: string, name: string) => void };
const Context = createContext<TimerContext | null>(null);

function Countdown({ timer }: { timer: TileTimer }) {
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timer.endsAt]);
  return <span className="tile-timer-countdown">{remainingTime(timer, Date.now())}</span>;
}

export function TileTimerButton({ blockId, name, menu = false, beforeOpen }: { blockId: string; name: string; menu?: boolean; beforeOpen?: () => void }) {
  const context = useContext(Context);
  if (!context) return null;
  const timer = context.timers.find(item => item.blockId === blockId);
  return <button type="button" className={menu ? 'tile-timer-menu' : 'tile-timer-button'} data-running={!!timer}
    title={timer ? 'Change or cancel timer' : 'Set timer'} aria-label={'Timer for ' + name}
    onClick={event => { event.stopPropagation(); beforeOpen?.(); context.open(blockId, name); }}>
    <Timer size={18} />{timer ? <Countdown timer={timer} /> : menu ? 'Set timer' : null}
  </button>;
}

export function TileTimersProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [timers, setTimers] = useState<TileTimer[]>([]);
  const [selection, setSelection] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const [minutes, setMinutes] = useState('10');
  const refresh = () => {
    const next = readTileTimers(localStorage, userId);
    setTimers(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
  };
  useEffect(() => {
    const check = () => {
      try {
        const due = expireTileTimers(localStorage, userId);
        refresh();
        if (due.length && !nativeTimers && audio.current?.state === 'running') {
          const ctx = audio.current;
          for (let index = 0; index < 3; index++) {
            const oscillator = ctx.createOscillator(), volume = ctx.createGain();
            const at = ctx.currentTime + index * 0.35;
            oscillator.frequency.value = 660; volume.gain.setValueAtTime(0, at);
            volume.gain.linearRampToValueAtTime(0.15, at + 0.02); volume.gain.exponentialRampToValueAtTime(0.001, at + 0.25);
            oscillator.connect(volume); volume.connect(ctx.destination);
            oscillator.start(at); oscillator.stop(at + 0.26);
          }
        }
      } catch { setError('Timers could not be loaded or saved on this device.'); }
    };
    const onStorage = (event: StorageEvent) => { if (event.key === timerStorageKey(userId)) check(); };
    const onChange = () => { try { refresh(); } catch { setError('Could not refresh timers.'); } };
    check();
    const interval = window.setInterval(check, 1000);
    window.addEventListener(timerChangeEvent, onChange);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(interval); window.removeEventListener(timerChangeEvent, onChange); window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check);
    };
  }, [userId]);
  useEffect(() => () => { void audio.current?.close(); }, []);
  const open = (id: string, name: string) => {
    setSelection({ id, name }); setMinutes(String(timers.find(item => item.blockId === id)?.minutes ?? 10)); setError('');
  };
  const action = async (operation: () => Promise<void>) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try { await operation(); refresh(); setSelection(null); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save the timer. Please retry.'); }
    finally { saving.current = false; setBusy(false); }
  };
  const current = timers.find(timer => timer.blockId === selection?.id);
  const due = timers.filter(timer => timer.fired);
  return <Context.Provider value={{ timers, open }}>
    {children}
    {selection && <PlannerModal title={selection.id.startsWith('routine-run:') ? 'Routine timer' : 'Tile timer'} busy={busy} onClose={() => setSelection(null)}>
      <form className="tile-timer-form" onSubmit={event => {
        event.preventDefault();
        if (!nativeTimers) {
          try { audio.current ??= new AudioContext(); void audio.current.resume().catch(() => {}); } catch { /* The visual alert remains available without audio. */ }
        }
        void action(async () => {
          await prepareTileTimerAlarm();
          const ids = new Set(readTileTimers(localStorage, userId).map(timer => timer.notificationId));
          let id: number;
          do { id = (crypto.getRandomValues(new Uint32Array(1))[0] % 2147483647) + 1; } while (ids.has(id));
          await startTileTimer(localStorage, tileTimerAlarm, userId, selection.id, selection.name, Number(minutes), id);
        });
      }}>
        <strong>{selection.name}</strong>
        {current && <div className="tile-timer-current"><Timer size={20} /><Countdown timer={current} /></div>}
        <label>Minutes from now<input type="number" min="1" max="1440" step="1" required value={minutes} disabled={busy} onChange={event => setMinutes(event.target.value)} /></label>
        {!nativeTimers && <p className="tile-timer-notice">Keep this app open for the alert. Timers are saved on this device.</p>}
        {nativeTimers && <p className="tile-timer-notice">Phone notification sound and Do Not Disturb settings apply.</p>}
        {error && <p role="alert">{error}</p>}
        {nativeTimers && error.includes('Alarms & reminders') && <button type="button" onClick={() => void openTimerAlarmSettings().catch(() => setError('Open Alarms & reminders in Android settings.'))}>Alarms & reminders settings</button>}
        <footer>{current && <button type="button" disabled={busy} onClick={() => void action(() => cancelTileTimer(localStorage, tileTimerAlarm, userId, selection.id))}>Cancel timer</button>}
          <button type="submit" disabled={busy}>{busy ? 'Saving...' : current ? 'Restart timer' : 'Start timer'}</button></footer>
      </form>
    </PlannerModal>}
    {!!due.length && !selection && <section className="tile-timer-alerts" aria-label="Timers ready">
      {due.map(timer => <div className="tile-timer-alert" role="alert" key={timer.blockId}>
        <Timer size={22} /><div><strong>Timer ready</strong><span>{timer.label}</span></div>
        <button type="button" disabled={busy} onClick={() => open(timer.blockId, timer.label)} title="Restart timer" aria-label={'Restart timer for ' + timer.label}><Timer size={20} /></button>
        <button type="button" disabled={busy} onClick={() => void action(() => cancelTileTimer(localStorage, tileTimerAlarm, userId, timer.blockId))} title="Dismiss timer" aria-label={'Dismiss timer for ' + timer.label}><X size={20} /></button>
      </div>)}
      {error && <p role="alert">{error}</p>}
    </section>}
    {error && !selection && !due.length && <div className="tile-timer-alerts" role="alert">{error}</div>}
  </Context.Provider>;
}
