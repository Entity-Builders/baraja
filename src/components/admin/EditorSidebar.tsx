// src/components/admin/EditorSidebar.tsx
import React, { useState } from 'react';
import { Card } from '@eb-packages/deck-engine';
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
        <button onClick={onClose} className={styles.btnClose}>✕</button>
      </div>
      
      <form onSubmit={handleSubmit} className={styles.formContainer}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Title</label>
          <input 
            type="text" 
            value={card.front.title} 
            onChange={(e) => onUpdateCard({...card, front: {...card.front, title: e.target.value}})}
            className={styles.input}
          />
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.label}>Phrase</label>
          <textarea 
            value={card.back.phrase} 
            onChange={(e) => onUpdateCard({...card, back: {...card.back, phrase: e.target.value}})}
            className={`${styles.input} ${styles.textareaSmall}`}
          />
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.label}>Instruction</label>
          <textarea 
            value={card.back.instruction} 
            onChange={(e) => onUpdateCard({...card, back: {...card.back, instruction: e.target.value}})}
            className={`${styles.input} ${styles.textareaLarge}`}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Trivia Answer (Optional)</label>
          <input 
            type="text" 
            value={card.back.answer || ''} 
            onChange={(e) => onUpdateCard({...card, back: {...card.back, answer: e.target.value}})}
            className={styles.input}
            placeholder="Only needed if it's a game/trivia"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Fun Fact (Nerdy info to spark chat)</label>
          <textarea 
            value={card.back.fun_fact || ''} 
            onChange={(e) => onUpdateCard({...card, back: {...card.back, fun_fact: e.target.value}})}
            className={`${styles.input} ${styles.textareaSmall}`}
            placeholder="Sabías que...?"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>When to use</label>
          <input 
            type="text" 
            value={card.back.when_to_use} 
            onChange={(e) => onUpdateCard({...card, back: {...card.back, when_to_use: e.target.value}})}
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Art Prompt</label>
          <textarea 
            value={card.front.art_prompt} 
            onChange={(e) => onUpdateCard({...card, front: {...card.front, art_prompt: e.target.value}})}
            className={`${styles.input} ${styles.textareaPrompt}`}
          />
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.label}>Art URL</label>
          <input 
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
          <button type="submit" disabled={saving || generatingArt} className="btn-primary" style={{ flex: 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
