'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input } from '@/components/ui';

interface SaveSnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  initialName?: string;
  initialDescription?: string;
  mode?: 'create' | 'edit';
}

const SaveSnapshotModal: React.FC<SaveSnapshotModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialName = '',
  initialDescription = '',
  mode = 'create',
}) => {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [descriptionLineCount, setDescriptionLineCount] = useState(1);
  const [isDescriptionFocused, setIsDescriptionFocused] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setDescription(initialDescription);
      setDescriptionLineCount(1);
      // Focus the name input when modal opens
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [isOpen, initialName, initialDescription]);

  // Calculate line count when description changes
  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDescription(value);

    // Calculate actual line count based on textarea scroll height
    if (descriptionRef.current) {
      const textarea = descriptionRef.current;
      // Reset height to auto to get accurate scrollHeight
      textarea.style.height = 'auto';
      const lineHeight = 20; // approximate line height
      const lines = Math.ceil(textarea.scrollHeight / lineHeight);
      setDescriptionLineCount(Math.max(1, lines));
      // Set height based on content (min 40px for single line)
      textarea.style.height = `${Math.max(40, textarea.scrollHeight)}px`;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim(), description.trim());
      onClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderRadius: '24px',
          padding: '24px',
          width: '400px',
          maxWidth: '90vw',
          border: '0.5px solid var(--border-default)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <h2
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '20px',
          }}
        >
          {mode === 'edit' ? 'Edit Snapshot' : 'New Snapshot'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <Input
              ref={nameInputRef}
              id="snapshot-name"
              label="Name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Snapshot name"
              variant="elevated"
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="snapshot-description"
              className="label text-text-tertiary mb-1 block"
            >
              Description (optional)
            </label>
            <textarea
              ref={descriptionRef}
              id="snapshot-description"
              value={description}
              onChange={handleDescriptionChange}
              onFocus={() => setIsDescriptionFocused(true)}
              onBlur={() => setIsDescriptionFocused(false)}
              placeholder="Add a description..."
              rows={1}
              className="button-small w-full bg-bg-elevated hover:bg-bg-elevated border border-border-default px-4 py-0 placeholder:text-text-disabled focus:outline-none"
              style={{
                borderWidth: 'var(--border-width)',
                borderRadius: descriptionLineCount >= 2 ? '24px' : '9999px',
                color: (isDescriptionFocused || description) ? 'var(--text-primary)' : 'var(--text-disabled)',
                outline: isDescriptionFocused ? '1px solid var(--border-focus)' : 'none',
                outlineOffset: '-1px',
                minHeight: '40px',
                lineHeight: '20px',
                paddingTop: '10px',
                paddingBottom: '10px',
                resize: 'none',
                overflow: 'hidden',
                transition: 'border-radius 0.15s ease',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Button
              type="button"
              variant="tertiary"
              size="medium"
              onClick={onClose}
              style={{ minWidth: '100px' }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="medium"
              disabled={!name.trim()}
              style={{ minWidth: '100px' }}
            >
              {mode === 'edit' ? 'Save Changes' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default SaveSnapshotModal;
