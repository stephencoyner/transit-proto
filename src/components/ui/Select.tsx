import React, { useState, useRef, useEffect } from 'react';

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

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
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
}

export const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  ({ label, error, helperText, options, placeholder, value, onChange, disabled, className = '', id }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedValue, setSelectedValue] = useState(value || '');
    const [isHovered, setIsHovered] = useState(false);
    const [hoveredItemIndex, setHoveredItemIndex] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;

    const selectedOption = options.find(opt => opt.value === selectedValue);
    const displayText = selectedOption?.label || placeholder || 'Select...';

    useEffect(() => {
      if (value !== undefined) {
        setSelectedValue(value);
      }
    }, [value]);

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
      hover:bg-bg-elevated
      border
      ${error ? 'border-error' : 'border-border-default'}
      ${isOpen ? 'border-border-focus' : ''}
      rounded-default
      px-4
      py-2
      pr-10
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
      <div className="w-full" ref={ref}>
        {label && (
          <label htmlFor={selectId} className="label text-text-secondary mb-2 block">
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
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
          >
            <span style={{
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

          {isOpen && (
            <div
              ref={dropdownRef}
              className="absolute z-50 w-full mt-2"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '0.5px solid var(--border-default)',
                borderRadius: 'var(--radius-large)',
                boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden'
              }}
              role="listbox"
            >
              {options.map((option, index) => {
                const isSelected = selectedValue === option.value;
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
                      alignItems: 'center',
                      gap: '12px',
                      transition: 'background-color 0.2s ease, border 0.2s ease',
                      backgroundColor: isItemHovered && !option.disabled ? 'var(--bg-elevated)' : 'transparent',
                      border: isItemHovered && !option.disabled ? '0.5px solid var(--border-hover)' : '0.5px solid transparent',
                      borderRadius: '20px',
                      margin: index === 0 ? '12px 12px 4px 12px' : (index === options.length - 1 ? '4px 12px 12px 12px' : '4px 12px'),
                      whiteSpace: 'nowrap',
                      opacity: option.disabled ? 0.5 : 1
                    }}
                    role="option"
                    aria-selected={isSelected}
                  >
                    {isSelected && (
                      <div style={{ color: 'var(--text-primary)' }}>
                        <CheckIcon />
                      </div>
                    )}
                    <span style={{ marginLeft: isSelected ? '0' : '32px' }}>
                      {option.label}
                    </span>
                  </div>
                );
              })}
            </div>
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
    );
  }
);

Select.displayName = 'Select';
