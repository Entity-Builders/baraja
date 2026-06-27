export function SessionSettings({
  onEndSession,
  onSoundEnabledChange,
  onTogglePause,
  onVibrationEnabledChange,
  soundEnabled,
  variant,
  vibrationEnabled,
}: {
  onEndSession?: () => void;
  onSoundEnabledChange: (enabled: boolean) => void;
  onTogglePause?: () => void;
  onVibrationEnabledChange: (enabled: boolean) => void;
  soundEnabled: boolean;
  variant: 'inline' | 'pause';
  vibrationEnabled: boolean;
}) {
  const className = variant === 'inline'
    ? 'baraja-session-settings-inline'
    : 'baraja-pause-settings';

  return (
    <div className={className}>
      <label>
        <input
          type="checkbox"
          checked={soundEnabled}
          onChange={(event) => onSoundEnabledChange(event.currentTarget.checked)}
        />
        Sonido
      </label>
      <label>
        <input
          type="checkbox"
          checked={vibrationEnabled}
          onChange={(event) => onVibrationEnabledChange(event.currentTarget.checked)}
        />
        Vibración
      </label>
      {variant === 'inline' && (
        <>
          <button type="button" onClick={onTogglePause}>Pausar</button>
          <button type="button" onClick={onEndSession}>Reiniciar</button>
        </>
      )}
    </div>
  );
}
