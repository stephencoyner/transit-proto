'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input } from '@/components/ui';
import { DATETIME_1_COLOR, DATETIME_2_COLOR } from '@/utils/comparisonColors';

// View icons (matching NavRail)
const SystemIcon = () => (
  <svg width="14" height="14" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="16.4852" width="12" height="2" rx="1" transform="rotate(-45 8 16.4852)" fill="currentColor"/>
    <rect y="8.48523" width="12" height="2" rx="1" transform="rotate(-45 0 8.48523)" fill="currentColor"/>
    <rect x="1" y="15.1421" width="20" height="2" rx="1" transform="rotate(-45 1 15.1421)" fill="currentColor"/>
  </svg>
);

const RoutesIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.221802" y="14.364" width="20" height="2" rx="1" transform="rotate(-45 0.221802 14.364)" fill="currentColor"/>
  </svg>
);

const StopsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2"/>
  </svg>
);

// Helper to get the appropriate icon for the context type
const getViewIcon = (contextType: string | undefined) => {
  if (!contextType) return <SystemIcon />;
  if (contextType === 'route' || contextType === 'routes') return <RoutesIcon />;
  if (contextType === 'stop' || contextType === 'stops') return <StopsIcon />;
  return <SystemIcon />;
};

interface SaveBookmarkModalFullScreenProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  initialName?: string;
  initialDescription?: string;
  mode?: 'create' | 'edit';
  contextTitle?: string;
  contextType?: 'system' | 'routes' | 'stops' | 'route' | 'stop';
  contextSubtitle?: string;
  contextFilters?: string;
  bookmarkImage?: string | null;
  // Comparison mode date ranges
  comparisonMode?: boolean;
  primaryDateLabel?: string;
  comparisonDateLabel?: string;
}

const SaveBookmarkModalFullScreen: React.FC<SaveBookmarkModalFullScreenProps> = ({
  isOpen,
  onClose,
  onSave,
  initialName = '',
  initialDescription = '',
  mode = 'create',
  contextTitle,
  contextType,
  contextSubtitle,
  contextFilters,
  bookmarkImage,
  comparisonMode,
  primaryDateLabel,
  comparisonDateLabel,
}) => {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isDescriptionFocused, setIsDescriptionFocused] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setDescription(initialDescription);
      // Focus the name input when modal opens
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [isOpen, initialName, initialDescription]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim(), description.trim());
      onClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-secondary)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 12px border frame with content inside */}
      <div
        style={{
          position: 'absolute',
          inset: '12px',
          borderRadius: '28px',
          overflow: 'hidden',
          display: 'flex',
          border: '0.5px solid var(--border-default)',
        }}
      >
        {/* Left panel - 1/3 width */}
        <div
          style={{
            width: '33.333%',
            backgroundColor: 'var(--bg-elevated)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            borderRight: '0.5px solid var(--border-default)',
          }}
        >
          {/* Header */}
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
              marginBottom: '4px',
            }}
          >
            {mode === 'edit' ? 'Edit Bookmark' : 'New Bookmark'}
          </h2>

          {/* Context info */}
          {(contextTitle || contextSubtitle) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
              {contextTitle && (
                <div style={{
                  fontSize: '13px',
                  color: 'var(--text-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  <span style={{ flexShrink: 0, width: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{getViewIcon(contextType)}</span>
                  <span>{contextTitle}</span>
                </div>
              )}
              {comparisonMode && primaryDateLabel && comparisonDateLabel ? (
                <>
                  <div style={{
                    fontSize: '13px',
                    color: 'var(--text-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    <span style={{ flexShrink: 0, width: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: DATETIME_1_COLOR }} />
                    </span>
                    <span>{primaryDateLabel}</span>
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: 'var(--text-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    <span style={{ flexShrink: 0, width: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: DATETIME_2_COLOR }} />
                    </span>
                    <span>{comparisonDateLabel}</span>
                  </div>
                </>
              ) : contextSubtitle && (
                <div style={{
                  fontSize: '13px',
                  color: 'var(--text-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                    <path d="M7.90488 13.9819C7.60138 13.9819 7.34679 13.8792 7.14113 13.6739C6.93546 13.4685 6.83262 13.2141 6.83262 12.9106C6.83262 12.6071 6.93529 12.3515 7.14063 12.1439C7.34596 11.9362 7.60046 11.8324 7.90413 11.8324C8.20763 11.8324 8.46221 11.9362 8.66787 12.1439C8.87338 12.3515 8.97613 12.6071 8.97613 12.9106C8.97613 13.2141 8.87346 13.4685 8.66813 13.6739C8.46279 13.8792 8.20838 13.9819 7.90488 13.9819ZM12.0006 13.9819C11.697 13.9819 11.4424 13.8792 11.2369 13.6739C11.0312 13.4685 10.9284 13.2141 10.9284 12.9106C10.9284 12.6071 11.031 12.3515 11.2364 12.1439C11.4417 11.9362 11.6961 11.8324 11.9996 11.8324C12.3033 11.8324 12.5579 11.9362 12.7634 12.1439C12.969 12.3515 13.0719 12.6071 13.0719 12.9106C13.0719 13.2141 12.9692 13.4685 12.7639 13.6739C12.5585 13.8792 12.3041 13.9819 12.0006 13.9819ZM16.0961 13.9819C15.7926 13.9819 15.538 13.8792 15.3324 13.6739C15.1269 13.4685 15.0241 13.2141 15.0241 12.9106C15.0241 12.6071 15.1268 12.3515 15.3321 12.1439C15.5375 11.9362 15.7919 11.8324 16.0954 11.8324C16.3989 11.8324 16.6535 11.9362 16.8591 12.1439C17.0648 12.3515 17.1676 12.6071 17.1676 12.9106C17.1676 13.2141 17.065 13.4685 16.8596 13.6739C16.6543 13.8792 16.3998 13.9819 16.0961 13.9819ZM5.07187 22.2031C4.44221 22.2031 3.90562 21.9814 3.46212 21.5379C3.01862 21.0944 2.79688 20.5578 2.79688 19.9281V6.07163C2.79688 5.44196 3.01862 4.90538 3.46212 4.46188C3.90562 4.01838 4.44221 3.79663 5.07187 3.79663H6.00013V2.86238C6.00013 2.56305 6.10396 2.31063 6.31162 2.10513C6.51912 1.89946 6.77254 1.79663 7.07188 1.79663C7.37121 1.79663 7.62363 1.89946 7.82913 2.10513C8.03479 2.31063 8.13763 2.56305 8.13763 2.86238V3.79663H15.8626V2.86238C15.8626 2.56305 15.9665 2.31063 16.1741 2.10513C16.3816 1.89946 16.635 1.79663 16.9344 1.79663C17.2337 1.79663 17.4861 1.89946 17.6916 2.10513C17.8973 2.31063 18.0001 2.56305 18.0001 2.86238V3.79663H18.9284C19.558 3.79663 20.0946 4.01838 20.5381 4.46188C20.9816 4.90538 21.2034 5.44196 21.2034 6.07163V19.9281C21.2034 20.5578 20.9816 21.0944 20.5381 21.5379C20.0946 21.9814 19.558 22.2031 18.9284 22.2031H5.07187ZM5.07187 19.9281H18.9284V9.99988H5.07187V19.9281ZM5.07187 7.99988H18.9284V6.07163H5.07187V7.99988Z" fill="currentColor"/>
                  </svg>
                  <span>{contextSubtitle}</span>
                </div>
              )}
              {contextFilters && (
                <div style={{
                  fontSize: '13px',
                  color: 'var(--text-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                    <path d="M3 4.5H13M5 8H11M7 11.5H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>{contextFilters}</span>
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div
            style={{
              height: '0.5px',
              backgroundColor: 'var(--border-default)',
            }}
          />

          {/* Name input */}
          <div style={{ marginTop: '24px' }} />
          <Input
            ref={nameInputRef}
            id="bookmark-name"
            label="Name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bookmark name"
            variant="elevated"
          />

          {/* Description textarea */}
          <div style={{ marginTop: '24px' }}>
            <label
              htmlFor="bookmark-description"
              className="label text-text-tertiary mb-1 block"
            >
              Description
            </label>
            <textarea
              ref={descriptionRef}
              id="bookmark-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onFocus={() => setIsDescriptionFocused(true)}
              onBlur={() => setIsDescriptionFocused(false)}
              placeholder="Add a description..."
              rows={4}
              className="button-small w-full bg-bg-elevated hover:bg-bg-elevated border border-border-default px-4 placeholder:text-text-disabled focus:outline-none"
              style={{
                borderWidth: 'var(--border-width)',
                borderRadius: '16px',
                color: 'var(--text-primary)',
                minHeight: '100px',
                lineHeight: '20px',
                paddingTop: '12px',
                paddingBottom: '12px',
                resize: 'none',
                outline: isDescriptionFocused ? '1px solid var(--border-focus)' : 'none',
                outlineOffset: '-1px',
              }}
            />
          </div>

          {/* Spacer to push buttons to bottom */}
          <div style={{ flex: 1 }} />

          {/* Buttons at bottom of panel */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}
          >
            <Button
              type="button"
              variant="elevated"
              size="medium"
              onClick={onClose}
              style={{ width: '100px' }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="medium"
              disabled={!name.trim()}
              onClick={handleSubmit}
              style={{ minWidth: '100px', whiteSpace: 'nowrap' }}
            >
              {mode === 'edit' ? 'Save Changes' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Right side - 2/3 width for map */}
        <div
          style={{
            width: '66.667%',
            backgroundColor: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {bookmarkImage ? (
            <img
              src={bookmarkImage}
              alt="Map bookmark preview"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'right center',
              }}
            />
          ) : (
            <>
              {/* Spinner */}
              <div
                style={{
                  width: 48,
                  height: 48,
                  border: '4px solid var(--border-default)',
                  borderTopColor: 'var(--text-secondary)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SaveBookmarkModalFullScreen;
