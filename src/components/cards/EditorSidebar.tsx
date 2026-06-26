// src/components/admin/EditorSidebar.tsx
import React, { useState } from 'react';
import type { Card } from '@eb-packages/deck-engine';
import styles from './EditorSidebar.module.css';

interface EditorSidebarProps {
  card: Card;
  onClose: () => void;
  onSave: (e: React.FormEvent) => Promise<void>;
  onUpdateCard: (card: Card) => void;
  generatingArt?: boolean;
}

export function EditorSidebar({ card, onClose, onSave, onUpdateCard, generatingArt = false }: EditorSidebarProps) {
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    setSaving(true);
    await onSave(e);
    setSaving(false);
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h2>Edit Card</h2>
        <button type="button" onClick={onClose} className={styles.btnClose} aria-label="Cerrar editor de carta">✕</button>
      </div>
      
      <form onSubmit={handleSubmit} className={styles.formContainer}>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="card-title">Title</label>
          <input 
            id="card-title"
            name="title"
            type="text" 
            value={card.front.title} 
            onChange={(e) => onUpdateCard({...card, front: {...card.front, title: e.target.value}})}
            className={styles.input}
          />
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="card-phrase">Phrase</label>
          <textarea 
            id="card-phrase"
            name="phrase"
            value={card.back.phrase} 
            onChange={(e) => onUpdateCard({...card, back: {...card.back, phrase: e.target.value}})}
            className={`${styles.input} ${styles.textareaSmall}`}
          />
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="card-instruction">Instruction</label>
          <textarea 
            id="card-instruction"
            name="instruction"
            value={card.back.instruction} 
            onChange={(e) => onUpdateCard({...card, back: {...card.back, instruction: e.target.value}})}
            className={`${styles.input} ${styles.textareaLarge}`}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="card-answer">Trivia Answer (Optional)</label>
          <input 
            id="card-answer"
            name="answer"
            type="text" 
            value={card.back.answer || ''} 
            onChange={(e) => onUpdateCard({...card, back: {...card.back, answer: e.target.value}})}
            className={styles.input}
            placeholder="Only needed if it's a game/trivia"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="card-fun-fact">Fun Fact (Nerdy info to spark chat)</label>
          <textarea 
            id="card-fun-fact"
            name="fun_fact"
            value={card.back.fun_fact || ''} 
            onChange={(e) => onUpdateCard({...card, back: {...card.back, fun_fact: e.target.value}})}
            className={`${styles.input} ${styles.textareaSmall}`}
            placeholder="Sabías que...?"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="card-when-to-use">When to use</label>
          <input 
            id="card-when-to-use"
            name="when_to_use"
            type="text" 
            value={card.back.when_to_use} 
            onChange={(e) => onUpdateCard({...card, back: {...card.back, when_to_use: e.target.value}})}
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="card-art-prompt">Art Prompt</label>
          <textarea 
            id="card-art-prompt"
            name="art_prompt"
            value={card.front.art_prompt} 
            onChange={(e) => onUpdateCard({...card, front: {...card.front, art_prompt: e.target.value}})}
            className={`${styles.input} ${styles.textareaPrompt}`}
          />
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="card-art-url">Art URL</label>
          <input 
            id="card-art-url"
            name="art_url"
            type="text" 
            value={card.front.art_url || ''} 
            onChange={(e) => onUpdateCard({...card, front: {...card.front, art_url: e.target.value}})}
            className={styles.input}
            placeholder="https://..."
          />
          {card.front.art_url && (
            <img 
              src={card.front.art_url} 
              alt="Preview" 
              className={styles.previewImage}
            />
          )}
        </div>

        <div className={styles.actionsBox}>
          <button type="button" onClick={onClose} className="btn-ghost" style={{ flex: 1 }}>
            Cancel
          </button>
          <button type="submit" disabled={saving || generatingArt} className="btn-primary" style={{ flex: 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
