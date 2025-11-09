import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Tooltip } from './Tooltip';

const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.3252 5.87686C0.891707 5.44966 0.891515 4.75706 1.3252 4.32998C1.75895 3.90299 2.46275 3.90296 2.89648 4.32998L7.99609 9.35342L13.1045 4.32217C13.5382 3.89551 14.2411 3.8955 14.6748 4.32217C15.1085 4.74929 15.1084 5.44186 14.6748 5.86904L8.87695 11.58C8.8496 11.6143 8.82019 11.648 8.78809 11.6796C8.57123 11.8931 8.28713 11.9999 8.00293 11.9999C7.7139 12.0036 7.42367 11.8977 7.20313 11.6806C7.1676 11.6456 7.13517 11.6085 7.10547 11.5702L1.3252 5.87686Z" fill="currentColor"/>
  </svg>
);

const ArrowUpIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14.2705 6.84277C14.636 7.20544 14.6345 7.79101 14.2676 8.15234C13.8997 8.51443 13.3034 8.51452 12.9355 8.15234L8.94434 4.2207L8.94434 14.0664C8.94434 14.5819 8.5262 15 8.01074 15C7.49537 14.9999 7.07715 14.5818 7.07715 14.0664L7.07715 4.16309L3.06055 8.11816C2.69326 8.47944 2.09761 8.47967 1.73047 8.11816C1.36353 7.75664 1.36377 7.17026 1.73047 6.80859L7.37793 1.24707C7.58841 1.03991 7.87522 0.966462 8.14746 1.01367C8.29814 1.01576 8.45 1.07218 8.56836 1.18945L8.64746 1.26758C8.65154 1.2715 8.65612 1.2753 8.66016 1.2793C8.66397 1.28309 8.66813 1.28717 8.67187 1.29102L14.2705 6.84277Z" fill="currentColor"/>
  </svg>
);

export interface SortOption {
  value: string;
  label: string;
}

export interface SortButtonProps {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  options: SortOption[];
  onSortByChange: (value: string) => void;
  onSortOrderToggle: () => void;
}

export const SortButton: React.FC<SortButtonProps> = ({
  sortBy,
  sortOrder,
  options,
  onSortByChange,
  onSortOrderToggle
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLeftHovered, setIsLeftHovered] = useState(false);
  const [isRightHovered, setIsRightHovered] = useState(false);
  const [hoveredItemIndex, setHoveredItemIndex] = useState<number | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const leftSideRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const tooltipTimerRef = useRef<NodeJS.Timeout | null>(null);

  const selectedOption = options.find(opt => opt.value === sortBy);
  const displayText = selectedOption ? selectedOption.label : 'Sort';

  useEffect(() => {
    if (isOpen && leftSideRef.current) {
      const rect = leftSideRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width
      });
      // Clear tooltip timer and hide tooltip when menu opens
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
        tooltipTimerRef.current = null;
      }
      setShowTooltip(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    setIsLeftHovered(true);
    if (!isOpen) {
      tooltipTimerRef.current = setTimeout(() => {
        if (textRef.current && leftSideRef.current && !isOpen) {
          const isOverflowing = textRef.current.scrollWidth > textRef.current.clientWidth;
          if (isOverflowing) {
            const rect = leftSideRef.current.getBoundingClientRect();
            setTooltipPosition({
              top: rect.bottom + window.scrollY + 8,
              left: rect.left + window.scrollX
            });
            setShowTooltip(true);
          }
        }
      }, 500);
    }
  };

  const handleMouseLeave = () => {
    setIsLeftHovered(false);
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setShowTooltip(false);
  };

  const handleSelect = (optionValue: string) => {
    onSortByChange(optionValue);
    setIsOpen(false);
  };

  return (
    <>
      <div
        ref={containerRef}
        style={{
          display: 'flex',
          height: '40px',
          backgroundColor: 'var(--bg-primary)',
          border: 'var(--border-width) solid var(--border-default)',
          borderRadius: '20px',
          overflow: 'hidden',
          fontFamily: 'Inter, sans-serif',
          fontSize: '14px'
        }}
      >
        {/* Left side - Sort by selector */}
        <div
          ref={leftSideRef}
          onClick={() => setIsOpen(!isOpen)}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0 12px 0 20px',
            cursor: 'pointer',
            backgroundColor: isLeftHovered ? 'var(--bg-elevated)' : 'transparent',
            transition: 'background-color 0.2s ease',
            color: 'var(--text-secondary)',
            borderRight: 'var(--border-width) solid var(--border-default)',
            maxWidth: '160px',
            position: 'relative'
          }}
        >
          <span ref={textRef} className="button-small" style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            Sort: {displayText}
          </span>
          <div style={{ flexShrink: 0 }}>
            <ChevronDownIcon />
          </div>
        </div>

        {/* Right side - Sort order toggle */}
        <div
          onClick={onSortOrderToggle}
          onMouseEnter={() => setIsRightHovered(true)}
          onMouseLeave={() => setIsRightHovered(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: '0',
            paddingBottom: '0',
            paddingLeft: sortOrder === 'asc' ? '10px' : '12px',
            paddingRight: sortOrder === 'asc' ? '12px' : '10px',
            cursor: 'pointer',
            backgroundColor: isRightHovered ? 'var(--bg-elevated)' : 'transparent',
            transition: 'background-color 0.2s ease',
            color: 'var(--text-secondary)',
            transform: sortOrder === 'desc' ? 'rotate(180deg)' : 'none'
          }}
        >
          <ArrowUpIcon />
        </div>
      </div>

      {/* Dropdown menu */}
      {isOpen && dropdownPosition && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            minWidth: `${dropdownPosition.width}px`,
            maxHeight: '640px',
            backgroundColor: 'var(--bg-elevated)',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-large)',
            boxShadow: 'var(--shadow-lg)',
            overflowY: 'auto',
            zIndex: 9999
          }}
          role="listbox"
        >
          {options.map((option, index) => {
            const isSelected = sortBy === option.value;
            const isItemHovered = hoveredItemIndex === index;

            return (
              <div
                key={option.value}
                onClick={() => handleSelect(option.value)}
                onMouseEnter={() => setHoveredItemIndex(index)}
                onMouseLeave={() => setHoveredItemIndex(null)}
                className="button-small"
                style={{
                  padding: '12px 28px 12px 16px',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'background-color 0.2s ease',
                  backgroundColor: isItemHovered ? 'color-mix(in srgb, var(--btn-secondary) 50%, transparent)' : 'transparent',
                  margin: index === 0 ? '12px 0 4px 0' : (index === options.length - 1 ? '4px 0 12px 0' : '4px 0')
                }}
                role="option"
                aria-selected={isSelected}
              >
                {isSelected && (
                  <div style={{ color: 'var(--text-primary)', flexShrink: 0 }}>
                    <CheckIcon />
                  </div>
                )}
                <div style={{
                  marginLeft: isSelected ? '0' : '32px'
                }}>
                  <span>{option.label}</span>
                </div>
              </div>
            );
          })}
        </div>,
        document.body
      )}

      {/* Tooltip */}
      {showTooltip && tooltipPosition && createPortal(
        <div
          className="label"
          style={{
            position: 'fixed',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            backgroundColor: 'var(--btn-primary)',
            color: 'var(--text-btn-primary)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            whiteSpace: 'nowrap',
            zIndex: 10000,
            boxShadow: 'var(--shadow-lg)',
            pointerEvents: 'none'
          }}
        >
          Sort: {displayText}
        </div>,
        document.body
      )}
    </>
  );
};
