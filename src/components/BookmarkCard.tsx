'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, formatDateRange } from '@/lib/bookmarks';
import { DATETIME_1_COLOR, DATETIME_2_COLOR } from '@/utils/comparisonColors';

// Helper to determine if an image is wide (landscape) based on data URL
// Wide images should show 'right center' to capture the map content
const useImagePosition = (imageDataUrl: string | undefined): 'center' | 'right center' => {
  const [position, setPosition] = useState<'center' | 'right center'>('center');

  useEffect(() => {
    if (!imageDataUrl) {
      setPosition('center');
      return;
    }

    const img = new Image();
    img.onload = () => {
      // If image is significantly wider than tall (aspect ratio > 1.2), use right center
      // This handles full-screen captures which are wider than square
      const aspectRatio = img.width / img.height;
      setPosition(aspectRatio > 1.2 ? 'right center' : 'center');
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  return position;
};

// View icons (matching NavRail and modals)
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
const getViewIcon = (contextType: string) => {
  if (contextType === 'route' || contextType === 'routes') return <RoutesIcon />;
  if (contextType === 'stop' || contextType === 'stops') return <StopsIcon />;
  return <SystemIcon />;
};

// Helper to format time from "HH:MM:SS" to "H:MM AM/PM"
const formatTime12Hour = (time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

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
      contextTitle = `${routeName}, ${state.selectedPattern}`;
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

  // Context subtitle - date range and filters
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

interface BookmarkCardProps {
  bookmark: Bookmark;
  onView: (bookmark: Bookmark) => void;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
}

const ActionsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5.81735 14.0897C5.24168 14.0897 4.7491 13.885 4.3396 13.4757C3.92993 13.0665 3.7251 12.5746 3.7251 11.9999C3.7251 11.4221 3.92968 10.9293 4.33885 10.5217C4.74818 10.114 5.24018 9.91016 5.81485 9.91016C6.39118 9.91016 6.88451 10.114 7.29485 10.5217C7.70518 10.9293 7.91035 11.4211 7.91035 11.9969C7.91035 12.5727 7.70543 13.0655 7.2956 13.4752C6.8856 13.8848 6.39285 14.0897 5.81735 14.0897ZM12.0031 14.0897C11.4273 14.0897 10.9345 13.885 10.5248 13.4757C10.1152 13.0665 9.91035 12.5746 9.91035 11.9999C9.91035 11.4221 10.115 10.9293 10.5243 10.5217C10.9335 10.114 11.4254 9.91016 12.0001 9.91016C12.5779 9.91016 13.0707 10.114 13.4783 10.5217C13.886 10.9293 14.0898 11.4211 14.0898 11.9969C14.0898 12.5727 13.886 13.0655 13.4783 13.4752C13.0707 13.8848 12.5789 14.0897 12.0031 14.0897ZM18.1871 14.0897C17.6103 14.0897 17.1165 13.885 16.7058 13.4757C16.2952 13.0665 16.0898 12.5746 16.0898 11.9999C16.0898 11.4221 16.2952 10.9293 16.7058 10.5217C17.1165 10.114 17.6103 9.91016 18.1871 9.91016C18.7639 9.91016 19.2561 10.114 19.6636 10.5217C20.0713 10.9293 20.2751 11.4211 20.2751 11.9969C20.2751 12.5727 20.0713 13.0655 19.6636 13.4752C19.2561 13.8848 18.7639 14.0897 18.1871 14.0897Z" fill="currentColor"/>
  </svg>
);

const BookmarkCard: React.FC<BookmarkCardProps> = ({
  bookmark,
  onView,
  onEdit,
  onDelete,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const imagePosition = useImagePosition(bookmark.image);

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
    onEdit(bookmark);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    onDelete(bookmark);
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
      onClick={() => onView(bookmark)}
      style={{
        backgroundColor: 'var(--bg-elevated)',
        borderRadius: '16px',
        padding: '12px',
        cursor: 'pointer',
        border: '0.5px solid var(--border-default)',
        outline: '0px solid transparent',
        transition: 'border-color 0.15s ease, outline 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-focus)';
        e.currentTarget.style.outline = '0.5px solid var(--border-focus)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)';
        e.currentTarget.style.outline = '0px solid transparent';
      }}
    >
      {/* Map thumbnail */}
      {bookmark.image && (
        <div
          style={{
            width: '100%',
            aspectRatio: '1 / 1',
            borderRadius: '8px',
            overflow: 'hidden',
            marginBottom: '12px',
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          <img
            src={bookmark.image}
            alt="Map bookmark"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: imagePosition,
            }}
          />
        </div>
      )}

      {/* Header with name and menu */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
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
          {bookmark.name}
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
      {bookmark.description && (
        <p
          style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            margin: '0 0 12px 0',
            lineHeight: 1.4,
          }}
        >
          {bookmark.description}
        </p>
      )}

      {/* Context info - view, date range, and filters */}
      {(() => {
        const { contextTitle, contextType, contextSubtitle, contextFilters, comparisonMode, primaryDateLabel, comparisonDateLabel } = getBookmarkContext(bookmark);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '0.5px solid var(--border-default)', paddingTop: '12px', marginTop: '12px' }}>
            {/* View/entity with icon */}
            <div
              style={{
                fontSize: '13px',
                color: 'var(--text-tertiary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span style={{ flexShrink: 0, width: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{getViewIcon(contextType)}</span>
              <span>{contextTitle}</span>
            </div>
            {/* Date ranges - comparison mode shows two with colored circles */}
            {comparisonMode && primaryDateLabel && comparisonDateLabel ? (
              <>
                <div
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span style={{ flexShrink: 0, width: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: DATETIME_1_COLOR }} />
                  </span>
                  <span>{primaryDateLabel}</span>
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span style={{ flexShrink: 0, width: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: DATETIME_2_COLOR }} />
                  </span>
                  <span>{comparisonDateLabel}</span>
                </div>
              </>
            ) : (
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                  <path d="M7.90488 13.9819C7.60138 13.9819 7.34679 13.8792 7.14113 13.6739C6.93546 13.4685 6.83262 13.2141 6.83262 12.9106C6.83262 12.6071 6.93529 12.3515 7.14063 12.1439C7.34596 11.9362 7.60046 11.8324 7.90413 11.8324C8.20763 11.8324 8.46221 11.9362 8.66787 12.1439C8.87338 12.3515 8.97613 12.6071 8.97613 12.9106C8.97613 13.2141 8.87346 13.4685 8.66813 13.6739C8.46279 13.8792 8.20838 13.9819 7.90488 13.9819ZM12.0006 13.9819C11.697 13.9819 11.4424 13.8792 11.2369 13.6739C11.0312 13.4685 10.9284 13.2141 10.9284 12.9106C10.9284 12.6071 11.031 12.3515 11.2364 12.1439C11.4417 11.9362 11.6961 11.8324 11.9996 11.8324C12.3033 11.8324 12.5579 11.9362 12.7634 12.1439C12.969 12.3515 13.0719 12.6071 13.0719 12.9106C13.0719 13.2141 12.9692 13.4685 12.7639 13.6739C12.5585 13.8792 12.3041 13.9819 12.0006 13.9819ZM16.0961 13.9819C15.7926 13.9819 15.538 13.8792 15.3324 13.6739C15.1269 13.4685 15.0241 13.2141 15.0241 12.9106C15.0241 12.6071 15.1268 12.3515 15.3321 12.1439C15.5375 11.9362 15.7919 11.8324 16.0954 11.8324C16.3989 11.8324 16.6535 11.9362 16.8591 12.1439C17.0648 12.3515 17.1676 12.6071 17.1676 12.9106C17.1676 13.2141 17.065 13.4685 16.8596 13.6739C16.6543 13.8792 16.3998 13.9819 16.0961 13.9819ZM5.07187 22.2031C4.44221 22.2031 3.90562 21.9814 3.46212 21.5379C3.01862 21.0944 2.79688 20.5578 2.79688 19.9281V6.07163C2.79688 5.44196 3.01862 4.90538 3.46212 4.46188C3.90562 4.01838 4.44221 3.79663 5.07187 3.79663H6.00013V2.86238C6.00013 2.56305 6.10396 2.31063 6.31162 2.10513C6.51912 1.89946 6.77254 1.79663 7.07188 1.79663C7.37121 1.79663 7.62363 1.89946 7.82913 2.10513C8.03479 2.31063 8.13763 2.56305 8.13763 2.86238V3.79663H15.8626V2.86238C15.8626 2.56305 15.9665 2.31063 16.1741 2.10513C16.3816 1.89946 16.635 1.79663 16.9344 1.79663C17.2337 1.79663 17.4861 1.89946 17.6916 2.10513C17.8973 2.31063 18.0001 2.56305 18.0001 2.86238V3.79663H18.9284C19.558 3.79663 20.0946 4.01838 20.5381 4.46188C20.9816 4.90538 21.2034 5.44196 21.2034 6.07163V19.9281C21.2034 20.5578 20.9816 21.0944 20.5381 21.5379C20.0946 21.9814 19.558 22.2031 18.9284 22.2031H5.07187ZM5.07187 19.9281H18.9284V9.99988H5.07187V19.9281ZM5.07187 7.99988H18.9284V6.07163H5.07187V7.99988Z" fill="currentColor"/>
                </svg>
                <span>{contextSubtitle}</span>
              </div>
            )}
            {/* Filters with icon (only if present) - rendered outside the date comparison ternary */}
            {contextFilters && (
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                  <path d="M3 4.5H13M5 8H11M7 11.5H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>{contextFilters}</span>
              </div>
            )}
          </div>
        );
      })()}

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

export default BookmarkCard;
