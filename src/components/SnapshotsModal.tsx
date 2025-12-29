'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Snapshot, getSnapshots, deleteSnapshot, updateSnapshot } from '@/lib/snapshots';
import SnapshotCard from './SnapshotCard';
import SaveSnapshotModal from './SaveSnapshotModal';

interface SnapshotsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewSnapshot: (snapshot: Snapshot) => void;
}

const SnapshotsModal: React.FC<SnapshotsModalProps> = ({ isOpen, onClose, onViewSnapshot }) => {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [editingSnapshot, setEditingSnapshot] = useState<Snapshot | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  // Load snapshots when modal opens
  useEffect(() => {
    if (isOpen) {
      setSnapshots(getSnapshots());
      setIsScrolled(false);
    }
  }, [isOpen]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setIsScrolled(e.currentTarget.scrollTop > 0);
  };

  // Refresh snapshots (called after save from capture button)
  const refreshSnapshots = useCallback(() => {
    setSnapshots(getSnapshots());
  }, []);

  // Expose refresh function via window for capture button to call
  useEffect(() => {
    (window as unknown as { refreshSnapshots?: () => void }).refreshSnapshots = refreshSnapshots;
    return () => {
      delete (window as unknown as { refreshSnapshots?: () => void }).refreshSnapshots;
    };
  }, [refreshSnapshots]);

  const handleView = (snapshot: Snapshot) => {
    onClose();
    onViewSnapshot(snapshot);
  };

  const handleEdit = (snapshot: Snapshot) => {
    setEditingSnapshot(snapshot);
  };

  const handleDelete = (snapshot: Snapshot) => {
    deleteSnapshot(snapshot.id);
    setSnapshots(getSnapshots());
  };

  const handleSaveEdit = (name: string, description: string) => {
    if (editingSnapshot) {
      updateSnapshot(editingSnapshot.id, { name, description });
      setSnapshots(getSnapshots());
      setEditingSnapshot(null);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderRadius: '24px',
          width: '800px',
          maxWidth: '90vw',
          height: '420px',
          maxHeight: '90vh',
          border: '0.5px solid var(--border-default)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          flexShrink: 0,
          borderBottom: isScrolled ? '0.5px solid var(--border-default)' : '0.5px solid transparent',
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            Snapshots
          </h2>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: 'transparent',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3.80773 13.7071C3.41721 14.0976 2.78419 14.0976 2.39367 13.7071C2.00323 13.3166 2.00318 12.6835 2.39367 12.293L6.63684 8.05086L2.39367 3.80769C2.00328 3.41716 2.00319 2.78411 2.39367 2.39363C2.78416 2.00323 3.41723 2.00326 3.80773 2.39363L8.0509 6.6368L12.2931 2.39363C12.6836 2.00325 13.3167 2.00323 13.7071 2.39363C14.0976 2.78412 14.0976 3.41716 13.7071 3.80769L9.46496 8.05086L13.7071 12.293C14.0976 12.6835 14.0976 13.3166 13.7071 13.7071C13.3166 14.0976 12.6836 14.0976 12.2931 13.7071L8.0509 9.46492L3.80773 13.7071Z" fill="currentColor"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div
          onScroll={handleScroll}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 24px 24px 24px',
          }}
        >
          {snapshots.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                color: 'var(--border-focus)',
                padding: '48px 0',
              }}
            >
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12.0001 18.2211L7.97337 19.9434C7.21504 20.2625 6.49604 20.1992 5.81637 19.7534C5.13671 19.3077 4.79688 18.677 4.79688 17.8614V5.07163C4.79688 4.44196 5.01863 3.90538 5.46213 3.46188C5.90563 3.01838 6.44221 2.79663 7.07188 2.79663H16.9284C17.558 2.79663 18.0946 3.01838 18.5381 3.46188C18.9816 3.90538 19.2034 4.44196 19.2034 5.07163V17.8614C19.2034 18.677 18.8635 19.3077 18.1839 19.7534C17.5042 20.1992 16.7852 20.2625 16.0269 19.9434L12.0001 18.2211ZM12.0001 15.7281L16.9284 17.8424V5.07163H7.07188V17.8424L12.0001 15.7281ZM12.0001 5.07163H7.07188H16.9284H12.0001Z"
                  fill="currentColor"
                />
              </svg>
              <p style={{ fontSize: '14px', margin: 0, color: 'var(--text-secondary)' }}>
                No snapshots yet
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              alignContent: 'start'
            }}>
              {snapshots.map((snapshot) => (
                <SnapshotCard
                  key={snapshot.id}
                  snapshot={snapshot}
                  onView={handleView}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>

        {/* Edit Modal */}
        <SaveSnapshotModal
          isOpen={!!editingSnapshot}
          onClose={() => setEditingSnapshot(null)}
          onSave={handleSaveEdit}
          initialName={editingSnapshot?.name || ''}
          initialDescription={editingSnapshot?.description || ''}
          mode="edit"
        />

      </div>
    </div>,
    document.body
  );
};

export default SnapshotsModal;
