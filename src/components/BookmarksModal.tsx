'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Bookmark,
  BookmarkToast,
  getBookmarks,
  deleteBookmark,
  updateBookmark,
  formatDateRange,
  messageForBookmarkError,
} from '@/lib/bookmarks';
import BookmarkCard from './BookmarkCard';
import SaveBookmarkModal from './SaveBookmarkModal';

// Helper to get day mode from selected days array
const getDayModeLabel = (selectedDays: number[]): string => {
  if (selectedDays.length === 7 || selectedDays.length === 0) return 'All Days';
  const weekdays = [1, 2, 3, 4, 5];
  const weekends = [0, 6];
  if (selectedDays.length === 5 && weekdays.every(d => selectedDays.includes(d))) return 'Weekdays';
  if (selectedDays.length === 2 && weekends.every(d => selectedDays.includes(d))) return 'Weekends';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return selectedDays.map(d => dayNames[d]).join(', ');
};

// Helper to format time from "HH:MM:SS" to "H:MM AM/PM"
const formatTime12Hour = (time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

// Helper to get context strings from bookmark state
const getBookmarkContext = (bookmark: Bookmark) => {
  const state = bookmark.state;

  // Context title and type - what view/item is being bookmarked
  let contextTitle = 'System';
  let contextType: 'system' | 'routes' | 'stops' | 'route' | 'stop' = 'system';
  if (state.selectedRouteId) {
    const routeName = state.selectedRouteName || `Route ${state.selectedRouteId}`;
    if (state.selectedTrip) {
      // Trip selected: show route, time, and pattern/headsign
      contextTitle = `${routeName} (${formatTime12Hour(state.selectedTrip.start_time)} · ${state.selectedPattern || state.selectedTrip.headsign})`;
    } else if (state.selectedPattern) {
      // Pattern selected but no trip: show route and pattern
      contextTitle = `${routeName} (${state.selectedPattern})`;
    } else {
      // Just route selected
      contextTitle = routeName;
    }
    contextType = 'route';
  } else if (state.selectedStopId) {
    contextTitle = state.selectedStopName || `Stop ${state.selectedStopId}`;
    contextType = 'stop';
  } else if (state.activeTab === 'routes') {
    contextTitle = 'Routes';
    contextType = 'routes';
  } else if (state.activeTab === 'stops') {
    contextTitle = 'Stops';
    contextType = 'stops';
  }

  // Context subtitle - date range and filters (used when not in comparison mode)
  const dateStr = formatDateRange(state.dateRange.start, state.dateRange.end);
  const daysStr = getDayModeLabel(state.selectedDays);
  const periodsStr = state.selectedPeriods.length === 0 || state.selectedPeriods.length === 5
    ? 'All Day'
    : state.selectedPeriods.join(', ');
  const contextSubtitle = `${dateStr} (${daysStr} · ${periodsStr})`;

  // Comparison mode date labels
  const comparisonMode = state.comparisonMode;
  let primaryDateLabel: string | undefined;
  let comparisonDateLabel: string | undefined;

  if (comparisonMode) {
    // Primary date label
    primaryDateLabel = `${dateStr} (${daysStr} · ${periodsStr})`;

    // Comparison date label
    if (state.comparisonDateRange.start && state.comparisonDateRange.end) {
      const compDateStr = formatDateRange(state.comparisonDateRange.start, state.comparisonDateRange.end);
      const compDaysStr = getDayModeLabel(state.comparisonDays);
      const compPeriodsStr = state.comparisonPeriods.length === 0 || state.comparisonPeriods.length === 5
        ? 'All Day'
        : state.comparisonPeriods.join(', ');
      comparisonDateLabel = `${compDateStr} (${compDaysStr} · ${compPeriodsStr})`;
    }
  }

  // Context filters - ridership filters if applicable
  const filters: string[] = [];
  const formatRidershipFilter = (min: number | null, max: number | null) => {
    if (min !== null && max !== null) {
      return `Boardings: ${min.toLocaleString()} - ${max.toLocaleString()}`;
    } else if (min !== null) {
      return `Boardings >${min.toLocaleString()}`;
    } else if (max !== null) {
      return `Boardings <${max.toLocaleString()}`;
    }
    return null;
  };

  if (!state.selectedTrip) {
    if (state.selectedRouteId) {
      const ridershipStr = formatRidershipFilter(state.tripFilterMin, state.tripFilterMax);
      if (ridershipStr) filters.push(ridershipStr);
    } else if (!state.selectedStopId) {
      // Check route filters (routes tab or system tab)
      if (state.activeTab === 'routes' || state.activeTab === 'system') {
        const routeRidershipStr = formatRidershipFilter(state.routeFilterMin, state.routeFilterMax);
        if (routeRidershipStr) filters.push(routeRidershipStr);
      }
      // Check stop filters (stops tab or system tab)
      if (state.activeTab === 'stops' || state.activeTab === 'system') {
        const stopRidershipStr = formatRidershipFilter(state.stopFilterMin, state.stopFilterMax);
        if (stopRidershipStr) filters.push(stopRidershipStr);
      }
    }
  }

  const contextFilters = filters.length > 0 ? filters.join(' · ') : undefined;

  return { contextTitle, contextType, contextSubtitle, contextFilters, comparisonMode, primaryDateLabel, comparisonDateLabel };
};

interface BookmarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewBookmark: (bookmark: Bookmark) => void;
  onBookmarkToast?: (toast: BookmarkToast) => void;
}

const BookmarksModal: React.FC<BookmarksModalProps> = ({ isOpen, onClose, onViewBookmark, onBookmarkToast }) => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  // Load bookmarks when modal opens
  useEffect(() => {
    if (isOpen) {
      setBookmarks(getBookmarks());
      setIsScrolled(false);
    }
  }, [isOpen]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setIsScrolled(e.currentTarget.scrollTop > 0);
  };

  // Refresh bookmarks (called after save from capture button)
  const refreshBookmarks = useCallback(() => {
    setBookmarks(getBookmarks());
  }, []);

  // Expose refresh function via window for capture button to call
  useEffect(() => {
    (window as unknown as { refreshBookmarks?: () => void }).refreshBookmarks = refreshBookmarks;
    return () => {
      delete (window as unknown as { refreshBookmarks?: () => void }).refreshBookmarks;
    };
  }, [refreshBookmarks]);

  const handleView = (bookmark: Bookmark) => {
    onClose();
    onViewBookmark(bookmark);
  };

  const handleEdit = (bookmark: Bookmark) => {
    setEditError(null);
    setEditingBookmark(bookmark);
  };

  const handleDelete = (bookmark: Bookmark) => {
    const result = deleteBookmark(bookmark.id);
    if (!result.ok && result.kind !== 'not_found') {
      const message = messageForBookmarkError(result.kind);
      onBookmarkToast?.({ kind: 'error', message });
      return;
    }
    setBookmarks(getBookmarks());
  };

  const handleSaveEdit = (name: string, description: string): boolean => {
    if (!editingBookmark) return true;
    const result = updateBookmark(editingBookmark.id, { name, description });
    if (!result.ok) {
      // If the bookmark was somehow deleted underneath us, close the edit modal
      // rather than leaving the user stuck in an un-saveable state.
      if (result.kind === 'not_found') {
        setEditingBookmark(null);
        setBookmarks(getBookmarks());
        return true;
      }
      const message = messageForBookmarkError(result.kind);
      setEditError(message);
      onBookmarkToast?.({ kind: 'error', message });
      return false;
    }
    setBookmarks(getBookmarks());
    setEditingBookmark(null);
    setEditError(null);
    return true;
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
          width: '1200px',
          maxWidth: '90vw',
          height: '693px',
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
            Bookmarks
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
              borderRadius: '50%',
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
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
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
          {bookmarks.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                color: 'var(--border-focus)',
                height: '100%',
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
                No bookmarks yet
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              alignContent: 'start',
              marginTop: '4px',
            }}>
              {bookmarks.map((bookmark) => (
                <BookmarkCard
                  key={bookmark.id}
                  bookmark={bookmark}
                  onView={handleView}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>

        {/* Edit Modal */}
        {editingBookmark && (() => {
          const { contextTitle, contextType, contextSubtitle, contextFilters, comparisonMode, primaryDateLabel, comparisonDateLabel } = getBookmarkContext(editingBookmark);
          return (
            <SaveBookmarkModal
              isOpen={true}
              onClose={() => { setEditingBookmark(null); setEditError(null); }}
              onSave={handleSaveEdit}
              initialName={editingBookmark.name}
              initialDescription={editingBookmark.description}
              mode="edit"
              bookmarkImage={editingBookmark.image}
              errorMessage={editError}
              contextTitle={contextTitle}
              contextType={contextType}
              contextSubtitle={contextSubtitle}
              contextFilters={contextFilters}
              comparisonMode={comparisonMode}
              primaryDateLabel={primaryDateLabel}
              comparisonDateLabel={comparisonDateLabel}
            />
          );
        })()}

      </div>
    </div>,
    document.body
  );
};

export default BookmarksModal;
