import React, { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { Tooltip } from './Tooltip';

const SelectDropdownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="pointer-events-none">
    <path d="M1.3252 5.87686C0.891707 5.44966 0.891515 4.75706 1.3252 4.32998C1.75895 3.90299 2.46275 3.90296 2.89648 4.32998L7.99609 9.35342L13.1045 4.32217C13.5382 3.89551 14.2411 3.8955 14.6748 4.32217C15.1085 4.74929 15.1084 5.44186 14.6748 5.86904L8.87695 11.58C8.8496 11.6143 8.82019 11.648 8.78809 11.6796C8.57123 11.8931 8.28713 11.9999 8.00293 11.9999C7.7139 12.0036 7.42367 11.8977 7.20313 11.6806C7.1676 11.6456 7.13517 11.6085 7.10547 11.5702L1.3252 5.87686Z" fill="currentColor"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.36682 9.86655L12.0002 4.23322C12.1789 4.05544 12.3875 3.96655 12.626 3.96655C12.8643 3.96655 13.0724 4.05427 13.2502 4.22972C13.4279 4.40516 13.5168 4.6135 13.5168 4.85472C13.5168 5.09594 13.4279 5.30544 13.2502 5.48322L6.98349 11.7499C6.80771 11.9277 6.60266 12.0166 6.36832 12.0166C6.13399 12.0166 5.92793 11.9277 5.75016 11.7499L2.78349 8.78322C2.60571 8.60844 2.5196 8.40083 2.52515 8.16039C2.53071 7.92005 2.62121 7.711 2.79665 7.53322C2.9721 7.35544 3.18043 7.26655 3.42165 7.26655C3.66288 7.26655 3.87238 7.35544 4.05015 7.53322L6.36682 9.86655Z" fill="currentColor"/>
  </svg>
);

export interface SelectOption {
  value: string;
  label: string;
  description?: string; // Secondary text below label
  disabled?: boolean;
  isDivider?: boolean; // Render as a divider line
}

export interface SelectProps {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  multiCheck?: string[]; // Additional values to show checkmarks for (for multi-state selections)
  /** Background color token for the trigger button (e.g., 'var(--bg-secondary)') */
  background?: string;
}

export const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  ({ label, error, helperText, options, placeholder, value, onChange, disabled, className = '', id, multiCheck = [], background = 'var(--bg-primary)' }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedValue, setSelectedValue] = useState(value || '');
    const [isHovered, setIsHovered] = useState(false);
    const [hoveredItemIndex, setHoveredItemIndex] = useState<number | null>(null);
    const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
    const [showTooltip, setShowTooltip] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const tooltipTimerRef = useRef<NodeJS.Timeout | null>(null);
    const generatedId = useId();
    const selectId = id || generatedId;

    const selectedOption = options.find(opt => opt.value === selectedValue);
    const displayText = selectedOption?.label || placeholder || 'Select...';

    useEffect(() => {
      if (value !== undefined) {
        setSelectedValue(value);
      }
    }, [value]);

    useEffect(() => {
      if (isOpen && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const dropdownMaxHeight = 640;
        const gap = 8;

        // Always open below, constrain maxHeight to available space
        const top = rect.bottom + gap;
        const availableHeight = Math.min(dropdownMaxHeight, Math.max(spaceBelow - gap, 100));

        setDropdownPosition({
          top: top,
          left: rect.left,
          width: rect.width,
          maxHeight: availableHeight
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

      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isOpen]);

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
      backgroundColor: isOpen ? 'var(--bg-elevated)' : (isHovered ? 'var(--bg-elevated)' : background)
    } as React.CSSProperties;

    return (
      <>
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

        {isOpen && dropdownPosition && createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              minWidth: `${dropdownPosition.width}px`,
              maxHeight: `${dropdownPosition.maxHeight}px`,
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
              // Render divider
              if (option.isDivider) {
                return (
                  <div
                    key={`divider-${index}`}
                    style={{
                      borderTop: 'var(--border-width) solid var(--border-default)',
                      margin: '8px 0'
                    }}
                  />
                );
              }

              const isSelected = selectedValue === option.value || multiCheck.includes(option.value);
              const isItemHovered = hoveredItemIndex === index;

              return (
                <div
                  key={option.value}
                  onClick={() => !option.disabled && handleSelect(option.value)}
                  onMouseEnter={() => setHoveredItemIndex(index)}
                  onMouseLeave={() => setHoveredItemIndex(null)}
                  className="button-small"
                  style={{
                    padding: '12px 16px',
                    cursor: option.disabled ? 'not-allowed' : 'pointer',
                    color: option.disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
                    display: 'flex',
                    alignItems: option.description ? 'flex-start' : 'center',
                    gap: '12px',
                    transition: 'background-color 0.2s ease',
                    backgroundColor: isItemHovered && !option.disabled ? 'var(--bg-primary)' : 'transparent',
                    margin: index === 0 ? '12px 0 4px 0' : (index === options.length - 1 ? '4px 0 12px 0' : '4px 0'),
                    opacity: option.disabled ? 0.5 : 1
                  }}
                  role="option"
                  aria-selected={isSelected}
                >
                  {isSelected && (
                    <div style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
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
              );
            })}
          </div>,
          document.body
        )}
      </>
    );
  }
);

Select.displayName = 'Select';
