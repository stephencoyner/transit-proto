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
    <path d="M12.0029 20.2751C11.4271 20.2751 10.9343 20.0705 10.5247 19.6613C10.115 19.252 9.91016 18.76 9.91016 18.1853C9.91016 17.609 10.1148 17.1157 10.5242 16.7053C10.9333 16.295 11.4252 16.0898 11.9999 16.0898C12.5777 16.0898 13.0705 16.2948 13.4782 16.7046C13.8858 17.1146 14.0897 17.6073 14.0897 18.1828C14.0897 18.7585 13.8858 19.2511 13.4782 19.6606C13.0705 20.0703 12.5787 20.2751 12.0029 20.2751ZM12.0029 14.0898C11.4271 14.0898 10.9343 13.8852 10.5247 13.4758C10.115 13.0667 9.91016 12.5748 9.91016 12.0001C9.91016 11.4223 10.1148 10.9295 10.5242 10.5218C10.9333 10.1142 11.4252 9.91035 11.9999 9.91035C12.5777 9.91035 13.0705 10.1142 13.4782 10.5218C13.8858 10.9295 14.0897 11.4213 14.0897 11.9971C14.0897 12.5729 13.8858 13.0657 13.4782 13.4753C13.0705 13.885 12.5787 14.0898 12.0029 14.0898ZM12.0029 7.91035C11.4271 7.91035 10.9343 7.70502 10.5247 7.29435C10.115 6.88368 9.91016 6.38993 9.91016 5.8131C9.91016 5.23626 10.1148 4.7441 10.5242 4.3366C10.9333 3.92893 11.4252 3.7251 11.9999 3.7251C12.5777 3.7251 13.0705 3.92893 13.4782 4.3366C13.8858 4.7441 14.0897 5.23626 14.0897 5.8131C14.0897 6.38993 13.8858 6.88368 13.4782 7.29435C13.0705 7.70502 12.5787 7.91035 12.0029 7.91035Z" fill="currentColor"/>
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
