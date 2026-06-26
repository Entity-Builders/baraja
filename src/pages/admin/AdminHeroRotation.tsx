import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DeckSchema } from '@eb-packages/deck-engine';
import { DIGITAL_DECKS } from '../../lib/digitalDeckCatalog';
import {
  DEFAULT_HERO_ROTATION_SLOTS,
  HERO_ROTATION_TONES,
  loadHeroRotationSlots,
  resetHeroRotationSlots,
  saveHeroRotationSlots,
  type HeroRotationSlot,
  type HeroRotationTone,
} from '../../lib/heroRotationConfig';

const panelStyle = {
  padding: '1.25rem',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  background: 'rgba(255,255,255,0.055)',
} as const;

const inputStyle = {
  width: '100%',
  minHeight: '40px',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: '8px',
  background: 'rgba(255,255,255,0.06)',
  color: 'white',
  padding: '0.65rem 0.75rem',
  font: 'inherit',
} as const;

function getDeckLabel(deck: DeckSchema): string {
  return `${deck.name} · ${deck.card_count} cartas`;
}

function getDeckBySlug(decks: DeckSchema[], slug: string): DeckSchema | undefined {
  return decks.find((deck) => deck.slug === slug || deck.id === slug || deck.edition === slug);
}

function createSlotId(label: string): string {
  return `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
}

export default function AdminHeroRotation() {
  const deckOptions = useMemo(() => DIGITAL_DECKS, []);
  const [slots, setSlots] = useState<HeroRotationSlot[]>(() => loadHeroRotationSlots());
  const [notice, setNotice] = useState<string | null>(null);

  function updateSlot(slotId: string, updates: Partial<HeroRotationSlot>) {
    setSlots((current) => current.map((slot) => (
      slot.id === slotId ? { ...slot, ...updates } : slot
    )));
    setNotice(null);
  }

  function addSlot() {
    const fallbackDeck =
      deckOptions.find((deck) => !slots.some((slot) => slot.deckSlug === deck.slug)) ??
      deckOptions[0];

    if (!fallbackDeck) {
      return;
    }

    setSlots((current) => [
      ...current,
      {
        id: createSlotId('categoria'),
        label: 'Nueva categoría',
        claim: 'probar una idea en la mesa',
        tone: 'conversation',
        deckSlug: fallbackDeck.slug,
        enabled: true,
      },
    ]);
    setNotice(null);
  }

  function removeSlot(slotId: string) {
    setSlots((current) => current.filter((slot) => slot.id !== slotId));
    setNotice(null);
  }

  function handleSave() {
    const normalized = saveHeroRotationSlots(slots);
    setSlots(normalized);
    setNotice('Giro guardado. La landing pública ya lee esta configuración en este navegador.');
  }

  function handleReset() {
    const defaults = resetHeroRotationSlots();
    setSlots(defaults);
    setNotice('Giro restaurado al orden curado inicial.');
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, rgba(20,18,16,0.98), rgba(8,10,9,1))',
      color: 'white',
    }}>
      <div style={{ padding: '2rem', maxWidth: '1120px', margin: '0 auto' }}>
        <Link to="/admin" style={{ color: 'var(--color-gold)', textDecoration: 'none', fontSize: '0.85rem' }}>
          &larr; Dashboard
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginTop: '1rem' }}>
          <div>
            <p style={{ margin: '0 0 0.45rem', color: 'var(--color-gold)', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Landing institucional
            </p>
            <h1 style={{ margin: 0 }}>Giro del hero</h1>
            <p style={{ maxWidth: '680px', margin: '0.6rem 0 0', opacity: 0.72 }}>
              Elegí qué frase dinámica, categoría y mazo representa cada paso del hero interactivo.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Link to="/" className="btn-ghost" style={{ textDecoration: 'none' }}>
              Ver landing
            </Link>
            <button className="btn-primary" type="button" onClick={handleSave}>
              Guardar giro
            </button>
          </div>
        </div>

        {notice && (
          <div style={{
            ...panelStyle,
            marginTop: '1.25rem',
            color: '#9ee0b6',
            borderColor: 'rgba(116,196,147,0.32)',
            background: 'rgba(116,196,147,0.08)',
          }}>
            {notice}
          </div>
        )}

        <div style={{ ...panelStyle, marginTop: '1.5rem', background: 'rgba(212,175,100,0.06)', borderColor: 'rgba(212,175,100,0.2)' }}>
          <strong style={{ display: 'block', color: 'var(--color-gold)', marginBottom: '0.35rem' }}>Criterio editorial</strong>
          <p style={{ margin: 0, opacity: 0.75, fontSize: '0.9rem' }}>
            La landing no necesita mostrar todos los mazos publicados. Acá definimos la muestra inicial: por ejemplo, cine queda afuera salvo que lo agreguemos como categoría.
          </p>
        </div>

        <div style={{ display: 'grid', gap: '1rem', marginTop: '1.5rem' }}>
          {slots.map((slot, index) => {
            const selectedDeck = getDeckBySlug(deckOptions, slot.deckSlug);
            const cardOptions = selectedDeck?.cards ?? [];

            return (
              <section key={slot.id} style={panelStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: '0.85rem', alignItems: 'center', marginBottom: '1rem' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontWeight: 800 }}>
                  <input
                    type="checkbox"
                    checked={slot.enabled}
                    onChange={(event) => updateSlot(slot.id, { enabled: event.currentTarget.checked })}
                  />
                  #{index + 1}
                </label>
                <strong>{slot.label || 'Categoría sin nombre'}</strong>
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => removeSlot(slot.id)}
                  disabled={slots.length <= 1}
                  style={{ opacity: slots.length <= 1 ? 0.45 : 1 }}
                >
                  Quitar
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 0.7fr) minmax(190px, 1fr) minmax(130px, 0.5fr) minmax(210px, 1fr) minmax(210px, 1fr)', gap: '0.85rem' }}>
                <label style={{ display: 'grid', gap: '0.4rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.62)' }}>
                  Categoría pública
                  <input
                    style={inputStyle}
                    value={slot.label}
                    onChange={(event) => updateSlot(slot.id, { label: event.currentTarget.value })}
                  />
                </label>

                <label style={{ display: 'grid', gap: '0.4rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.62)' }}>
                  Frase dinámica
                  <input
                    style={inputStyle}
                    value={slot.claim}
                    onChange={(event) => updateSlot(slot.id, { claim: event.currentTarget.value })}
                  />
                </label>

                <label style={{ display: 'grid', gap: '0.4rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.62)' }}>
                  Color
                  <select
                    style={inputStyle}
                    value={slot.tone}
                    onChange={(event) => updateSlot(slot.id, { tone: event.currentTarget.value as HeroRotationTone })}
                  >
                    {HERO_ROTATION_TONES.map((tone) => (
                      <option key={tone.value} value={tone.value}>{tone.label}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: '0.4rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.62)' }}>
                  Mazo
                  <select
                    style={inputStyle}
                    value={slot.deckSlug}
                    onChange={(event) => updateSlot(slot.id, {
                      deckSlug: event.currentTarget.value,
                      cardId: undefined,
                    })}
                  >
                    {deckOptions.map((deck) => (
                      <option key={deck.slug} value={deck.slug}>{getDeckLabel(deck)}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: '0.4rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.62)' }}>
                  Carta de muestra
                  <select
                    style={inputStyle}
                    value={slot.cardId ?? ''}
                    onChange={(event) => updateSlot(slot.id, {
                      cardId: event.currentTarget.value || undefined,
                    })}
                  >
                    <option value="">Automática</option>
                    {cardOptions.map((card) => (
                      <option key={card.id} value={card.id}>
                        #{String(card.front.number).padStart(2, '0')} · {card.front.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              </section>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
          <button className="btn-ghost" type="button" onClick={addSlot}>
            Agregar categoría
          </button>
          <button className="btn-ghost" type="button" onClick={handleReset}>
            Restaurar default
          </button>
          <button className="btn-primary" type="button" onClick={handleSave}>
            Guardar giro
          </button>
        </div>

        <div style={{ ...panelStyle, marginTop: '1.5rem' }}>
          <strong style={{ display: 'block', marginBottom: '0.75rem' }}>Default actual</strong>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {DEFAULT_HERO_ROTATION_SLOTS.map((slot) => {
              const deck = getDeckBySlug(deckOptions, slot.deckSlug);
              return (
                <span
                  key={slot.id}
                  style={{
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '999px',
                    padding: '0.45rem 0.65rem',
                    color: 'rgba(255,255,255,0.76)',
                    fontSize: '0.78rem',
                  }}
                >
                  {slot.label}: {slot.claim} · {deck?.name ?? slot.deckSlug}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
