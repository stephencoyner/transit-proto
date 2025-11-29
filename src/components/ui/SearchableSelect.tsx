import React, { useState, useRef, useEffect, useId, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Tooltip } from './Tooltip';

const SelectDropdownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="pointer-events-none">
    <path d="M1.3252 5.87686C0.891707 5.44966 0.891515 4.75706 1.3252 4.32998C1.75895 3.90299 2.46275 3.90296 2.89648 4.32998L7.99609 9.35342L13.1045 4.32217C13.5382 3.89551 14.2411 3.8955 14.6748 4.32217C15.1085 4.74929 15.1084 5.44186 14.6748 5.86904L8.87695 11.58C8.8496 11.6143 8.82019 11.648 8.78809 11.6796C8.57123 11.8931 8.28713 11.9999 8.00293 11.9999C7.7139 12.0036 7.42367 11.8977 7.20313 11.6806C7.1676 11.6456 7.13517 11.6085 7.10547 11.5702L1.3252 5.87686Z" fill="currentColor"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7.33333 12.6667C10.2789 12.6667 12.6667 10.2789 12.6667 7.33333C12.6667 4.38781 10.2789 2 7.33333 2C4.38781 2 2 4.38781 2 7.33333C2 10.2789 4.38781 12.6667 7.33333 12.6667Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M14 14L11.1 11.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SearchableSelectProps {
  label?: string;
  error?: string;
  helperText?: string;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  maxHeight?: number;
  /** When true, only renders the dropdown menu (no trigger button) */
  menuOnly?: boolean;
  /** External control for open state (used with menuOnly) */
  isOpen?: boolean;
  /** Callback when menu should close (used with menuOnly) */
  onClose?: () => void;
  /** Position for the menu when using menuOnly mode */
  menuPosition?: { top: number; left: number };
}

export const SearchableSelect = React.forwardRef<HTMLDivElement, SearchableSelectProps>(
  ({ label, error, helperText, options, placeholder, searchPlaceholder = 'Search...', value, onChange, disabled, className = '', id, maxHeight = 300, menuOnly = false, isOpen: externalIsOpen, onClose, menuPosition }, ref) => {
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const isOpen = menuOnly ? (externalIsOpen ?? false) : internalIsOpen;
    const setIsOpen = menuOnly ? (open: boolean) => { if (!open && onClose) onClose(); } : setInternalIsOpen;
    const [selectedValue, setSelectedValue] = useState(value || '');
    const [isHovered, setIsHovered] = useState(false);
    const [hoveredItemIndex, setHoveredItemIndex] = useState<number | null>(null);
    const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showTooltip, setShowTooltip] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const tooltipTimerRef = useRef<NodeJS.Timeout | null>(null);
    const generatedId = useId();
    const selectId = id || generatedId;

    const selectedOption = options.find(opt => opt.value === selectedValue);
    const displayText = selectedOption?.label || placeholder || 'Select...';
    const selectedItemRef = useRef<HTMLDivElement>(null);

    // Filter and sort options based on search query
    // When not searching: sort alphabetically A-Z, but keep selected at top
    // When searching: filter by query, sort alphabetically
    const filteredOptions = useMemo(() => {
      let filtered = options;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = options.filter(opt =>
          opt.label.toLowerCase().includes(query) ||
          (opt.description && opt.description.toLowerCase().includes(query))
        );
      }

      // Sort alphabetically A-Z
      const sorted = [...filtered].sort((a, b) => a.label.localeCompare(b.label));

      // If not searching and there's a selected value, move it to the top
      if (!searchQuery.trim() && selectedValue) {
        const selectedIndex = sorted.findIndex(opt => opt.value === selectedValue);
        if (selectedIndex > 0) {
          const [selected] = sorted.splice(selectedIndex, 1);
          sorted.unshift(selected);
        }
      }

      return sorted;
    }, [options, searchQuery, selectedValue]);

    useEffect(() => {
      if (value !== undefined) {
        setSelectedValue(value);
      }
    }, [value]);

    useEffect(() => {
      if (isOpen) {
        if (menuOnly && menuPosition) {
          // Use provided position for menuOnly mode
          setDropdownPosition({
            top: menuPosition.top,
            left: menuPosition.left,
            width: 340 // Fixed width for menuOnly
          });
        } else if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setDropdownPosition({
            top: rect.bottom + window.scrollY + 8,
            left: rect.left + window.scrollX,
            width: rect.width
          });
        }
        // Clear tooltip timer and hide tooltip when menu opens
        if (tooltipTimerRef.current) {
          clearTimeout(tooltipTimerRef.current);
          tooltipTimerRef.current = null;
        }
        setShowTooltip(false);
        // Scroll to selected item instantly (selected is already at top due to sorting)
        // Use a small delay to ensure DOM is ready
        setTimeout(() => {
          if (selectedItemRef.current) {
            selectedItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'instant' as ScrollBehavior });
          }
        }, 0);
      } else {
        // Clear search when closing
        setSearchQuery('');
      }
    }, [isOpen, menuOnly, menuPosition]);

    // Cleanup tooltip timer on unmount
    useEffect(() => {
      return () => {
        if (tooltipTimerRef.current) {
          clearTimeout(tooltipTimerRef.current);
        }
      };
    }, []);

    const handleMouseEnter = () => {
      setIsHovered(true);
      if (!isOpen) {
        tooltipTimerRef.current = setTimeout(() => {
          if (textRef.current && !isOpen) {
            const isOverflowing = textRef.current.scrollWidth > textRef.current.clientWidth;
            if (isOverflowing && displayText) {
              setShowTooltip(true);
            }
          }
        }, 500);
      }
    };

    const handleMouseLeave = () => {
      setIsHovered(false);
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
        tooltipTimerRef.current = null;
      }
      setShowTooltip(false);
    };

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

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (optionValue: string) => {
      setSelectedValue(optionValue);
      setIsOpen(false);
      onChange?.(optionValue);
    };

    const selectClasses = `
      button-small
      w-full
      h-10
      hover:bg-bg-elevated
      border
      ${error ? 'border-error' : 'border-border-default'}
      ${isOpen ? 'border-border-focus' : ''}
      rounded-full
      px-4
      pr-10
      flex
      items-center
      focus:outline-none
      disabled:opacity-50
      disabled:cursor-not-allowed
      transition-colors
      cursor-pointer
      ${className}
    `.trim().replace(/\s+/g, ' ');

    const style = {
      borderWidth: 'var(--border-width)',
      color: 'var(--text-secondary)',
      backgroundColor: isOpen ? 'var(--bg-elevated)' : (isHovered ? 'var(--bg-elevated)' : 'var(--bg-primary)')
    } as React.CSSProperties;

    return (
      <>
        {!menuOnly && (
          <div className="w-full" ref={ref}>
            {label && (
              <label htmlFor={selectId} className="label text-text-tertiary mb-1 block">
                {label}
              </label>
            )}
            <div className="relative">
              <div
                ref={containerRef}
                id={selectId}
                className={selectClasses}
                style={style}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
              >
                <span ref={textRef} style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'block'
                }}>
                  {displayText}
                </span>
              </div>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none" style={{ color: 'var(--text-secondary)' }}>
                <SelectDropdownIcon />
              </div>
              {showTooltip && displayText && (
                <Tooltip text={displayText} containerRef={containerRef as React.RefObject<HTMLElement>}>
                  {null}
                </Tooltip>
              )}
            </div>
            {error && (
              <span className="caption text-error mt-1 block">
                {error}
              </span>
            )}
            {!error && helperText && (
              <span className="caption text-text-tertiary mt-1 block">
                {helperText}
              </span>
            )}
          </div>
        )}

        {isOpen && dropdownPosition && createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: '340px',
              backgroundColor: 'var(--bg-elevated)',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-large)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
            role="listbox"
          >
            {/* Search Input */}
            <div style={{
              padding: '16px 16px',
              borderBottom: '0.5px solid var(--border-default)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-default)',
                border: '0.5px solid var(--border-default)',
                outline: isSearchFocused ? '2px solid var(--border-focus)' : 'none',
                outlineOffset: '-1px'
              }}>
                <div style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
                  <SearchIcon />
                </div>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  placeholder={searchPlaceholder}
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    backgroundColor: 'transparent',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '14px',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>
            </div>

            {/* Options List */}
            <div style={{
              maxHeight: `${maxHeight}px`,
              overflowY: 'auto',
              overflowX: 'hidden'
            }}>
              {filteredOptions.length === 0 ? (
                <div style={{
                  padding: '16px',
                  textAlign: 'center',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '14px'
                }}>
                  No results found
                </div>
              ) : (
                filteredOptions.map((option, index) => {
                  const isSelected = selectedValue === option.value;
                  const isItemHovered = hoveredItemIndex === index;
                  // Show divider after the first item (selected item) when not searching and there are more items
                  const showDividerAfter = !searchQuery.trim() && index === 0 && selectedValue && filteredOptions.length > 1;

                  return (
                    <React.Fragment key={option.value}>
                      <div
                        ref={isSelected ? selectedItemRef : undefined}
                        onClick={() => !option.disabled && handleSelect(option.value)}
                        onMouseEnter={() => setHoveredItemIndex(index)}
                        onMouseLeave={() => setHoveredItemIndex(null)}
                        className="button-small"
                        style={{
                          padding: '12px 28px 12px 16px',
                          cursor: option.disabled ? 'not-allowed' : 'pointer',
                          color: option.disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
                          display: 'flex',
                          alignItems: option.description ? 'flex-start' : 'center',
                          gap: '12px',
                          transition: 'background-color 0.2s ease',
                          backgroundColor: isItemHovered && !option.disabled ? 'var(--bg-primary)' : 'transparent',
                          margin: index === 0 ? '4px 0' : (index === filteredOptions.length - 1 ? '4px 0 12px 0' : '4px 0'),
                          opacity: option.disabled ? 0.5 : 1
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
                          marginLeft: isSelected ? '0' : '32px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px'
                        }}>
                          <span>{option.label}</span>
                          {option.description && (
                            <span style={{
                              fontSize: '12px',
                              color: 'var(--text-tertiary)',
                              lineHeight: '16px'
                            }}>
                              {option.description}
                            </span>
                          )}
                        </div>
                      </div>
                      {showDividerAfter && (
                        <div style={{
                          height: '1px',
                          backgroundColor: 'var(--border-default)',
                          margin: '0'
                        }} />
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }
);

SearchableSelect.displayName = 'SearchableSelect';

export default SearchableSelect;
