'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Snapshot, formatDateRange } from '@/lib/snapshots';

interface SnapshotCardProps {
  snapshot: Snapshot;
  onView: (snapshot: Snapshot) => void;
  onEdit: (snapshot: Snapshot) => void;
  onDelete: (snapshot: Snapshot) => void;
}

const ActionsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5.81735 14.0897C5.24168 14.0897 4.7491 13.885 4.3396 13.4757C3.92993 13.0665 3.7251 12.5746 3.7251 11.9999C3.7251 11.4221 3.92968 10.9293 4.33885 10.5217C4.74818 10.114 5.24018 9.91016 5.81485 9.91016C6.39118 9.91016 6.88451 10.114 7.29485 10.5217C7.70518 10.9293 7.91035 11.4211 7.91035 11.9969C7.91035 12.5727 7.70543 13.0655 7.2956 13.4752C6.8856 13.8848 6.39285 14.0897 5.81735 14.0897ZM12.0031 14.0897C11.4273 14.0897 10.9345 13.885 10.5248 13.4757C10.1152 13.0665 9.91035 12.5746 9.91035 11.9999C9.91035 11.4221 10.115 10.9293 10.5243 10.5217C10.9335 10.114 11.4254 9.91016 12.0001 9.91016C12.5779 9.91016 13.0707 10.114 13.4783 10.5217C13.886 10.9293 14.0898 11.4211 14.0898 11.9969C14.0898 12.5727 13.886 13.0655 13.4783 13.4752C13.0707 13.8848 12.5789 14.0897 12.0031 14.0897ZM18.1871 14.0897C17.6103 14.0897 17.1165 13.885 16.7058 13.4757C16.2952 13.0665 16.0898 12.5746 16.0898 11.9999C16.0898 11.4221 16.2952 10.9293 16.7058 10.5217C17.1165 10.114 17.6103 9.91016 18.1871 9.91016C18.7639 9.91016 19.2561 10.114 19.6636 10.5217C20.0713 10.9293 20.2751 11.4211 20.2751 11.9969C20.2751 12.5727 20.0713 13.0655 19.6636 13.4752C19.2561 13.8848 18.7639 14.0897 18.1871 14.0897Z" fill="currentColor"/>
  </svg>
);

const SnapshotCard: React.FC<SnapshotCardProps> = ({
  snapshot,
  onView,
  onEdit,
  onDelete,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Format the date ranges for display
  const dateRangeDisplay = formatDateRange(
    snapshot.state.dateRange.start,
    snapshot.state.dateRange.end
  );

  const comparisonRangeDisplay = snapshot.state.comparisonMode
    ? formatDateRange(
        snapshot.state.comparisonDateRange.start,
        snapshot.state.comparisonDateRange.end
      )
    : null;

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.right - 120, // 120px menu width
      });
    }
    setIsMenuOpen(!isMenuOpen);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    onEdit(snapshot);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    onDelete(snapshot);
  };

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuButtonRef.current &&
        !menuButtonRef.current.contains(event.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  return (
    <div
      onClick={() => onView(snapshot)}
      style={{
        backgroundColor: 'var(--bg-elevated)',
        borderRadius: '16px',
        padding: '12px',
        cursor: 'pointer',
        border: '0.5px solid var(--border-default)',
        transition: 'border-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-focus)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)';
      }}
    >
      {/* Header with name and menu */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3
          style={{
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
            flex: 1,
            lineHeight: 1.3,
          }}
        >
          {snapshot.name}
        </h3>
        <button
          ref={menuButtonRef}
          onClick={handleMenuClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            border: 'none',
            borderRadius: '50%',
            backgroundColor: 'transparent',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            marginLeft: '8px',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <ActionsIcon />
        </button>
      </div>

      {/* Description */}
      {snapshot.description && (
        <p
          style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            margin: '0 0 12px 0',
            lineHeight: 1.4,
          }}
        >
          {snapshot.description}
        </p>
      )}

      {/* Date range info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '0.5px solid var(--border-default)', paddingTop: '12px', marginTop: '12px' }}>
        <div
          style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {snapshot.state.comparisonMode && (
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#D4CABA',
                flexShrink: 0,
              }}
            />
          )}
          <span>{dateRangeDisplay}</span>
        </div>
        {comparisonRangeDisplay && (
          <div
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#5C4939',
                flexShrink: 0,
              }}
            />
            <span>{comparisonRangeDisplay}</span>
          </div>
        )}
      </div>

      {/* Dropdown menu */}
      {isMenuOpen && menuPosition && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            width: '120px',
            backgroundColor: 'var(--bg-elevated)',
            border: '0.5px solid var(--border-default)',
            borderRadius: '20px',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
            zIndex: 10000,
            padding: '8px',
          }}
        >
          <button
            onClick={handleEdit}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '13px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '24px',
              backgroundColor: 'transparent',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '13px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '24px',
              backgroundColor: 'transparent',
              color: '#D31028',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            Delete
          </button>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SnapshotCard;
