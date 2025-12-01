import React, { useState, useRef, useEffect } from 'react';
import { Tooltip } from './Tooltip';

const ChevronUpIcon = () => (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ transform: 'rotate(180deg)' }}>
    <path d="M1.3252 5.87686C0.891707 5.44966 0.891515 4.75706 1.3252 4.32998C1.75895 3.90299 2.46275 3.90296 2.89648 4.32998L7.99609 9.35342L13.1045 4.32217C13.5382 3.89551 14.2411 3.8955 14.6748 4.32217C15.1085 4.74929 15.1084 5.44186 14.6748 5.86904L8.87695 11.58C8.8496 11.6143 8.82019 11.648 8.78809 11.6796C8.57123 11.8931 8.28713 11.9999 8.00293 11.9999C7.7139 12.0036 7.42367 11.8977 7.20313 11.6806C7.1676 11.6456 7.13517 11.6085 7.10547 11.5702L1.3252 5.87686Z" fill="currentColor"/>
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.3252 5.87686C0.891707 5.44966 0.891515 4.75706 1.3252 4.32998C1.75895 3.90299 2.46275 3.90296 2.89648 4.32998L7.99609 9.35342L13.1045 4.32217C13.5382 3.89551 14.2411 3.8955 14.6748 4.32217C15.1085 4.74929 15.1084 5.44186 14.6748 5.86904L8.87695 11.58C8.8496 11.6143 8.82019 11.648 8.78809 11.6796C8.57123 11.8931 8.28713 11.9999 8.00293 11.9999C7.7139 12.0036 7.42367 11.8977 7.20313 11.6806C7.1676 11.6456 7.13517 11.6085 7.10547 11.5702L1.3252 5.87686Z" fill="currentColor"/>
  </svg>
);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  variant?: 'default' | 'elevated';
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', id, variant = 'default', ...props }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
    const [showTooltip, setShowTooltip] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const tooltipTimerRef = useRef<NodeJS.Timeout | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      return () => {
        if (tooltipTimerRef.current) {
          clearTimeout(tooltipTimerRef.current);
        }
      };
    }, []);

    const handleMouseEnter = () => {
      setIsHovered(true);
      tooltipTimerRef.current = setTimeout(() => {
        if (inputRef.current) {
          const isOverflowing = inputRef.current.scrollWidth > inputRef.current.clientWidth;
          if (isOverflowing && inputRef.current.value) {
            setShowTooltip(true);
          }
        }
      }, 500);
    };

    const handleMouseLeave = () => {
      setIsHovered(false);
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
        tooltipTimerRef.current = null;
      }
      setShowTooltip(false);
    };

    const isNumberInput = props.type === 'number';

    const bgClasses = variant === 'elevated'
      ? 'bg-bg-elevated hover:bg-bg-elevated'
      : 'bg-bg-primary hover:bg-bg-elevated focus:bg-bg-elevated';

    const inputClasses = `
      button-small
      w-full
      h-10
      ${bgClasses}
      border
      ${error ? 'border-error' : 'border-border-default'}
      rounded-full
      px-4
      py-0
      ${isNumberInput ? 'pr-10' : ''}
      placeholder:text-text-disabled
      focus:outline-none
      disabled:opacity-50
      disabled:cursor-not-allowed
      ${className}
    `.trim().replace(/\s+/g, ' ');

    const hasValue = props.value !== undefined && props.value !== '';

    const style = {
      borderWidth: 'var(--border-width)',
      color: (isFocused || hasValue) ? 'var(--text-primary)' : 'var(--text-disabled)',
      outline: isFocused && !error ? '1px solid var(--border-focus)' : 'none',
      outlineOffset: '-1px',
      lineHeight: '40px', // Match height for vertical centering
      // Hide default number input spinners
      ...(isNumberInput ? {
        MozAppearance: 'textfield' as const,
        WebkitAppearance: 'none' as const,
      } : {}),
      ...props.style
    };

    const handleIncrement = () => {
      if (inputRef.current && !props.disabled) {
        inputRef.current.stepUp();
        inputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
        // Trigger onChange manually
        const event = { target: inputRef.current } as React.ChangeEvent<HTMLInputElement>;
        props.onChange?.(event);
      }
    };

    const handleDecrement = () => {
      if (inputRef.current && !props.disabled) {
        inputRef.current.stepDown();
        inputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
        // Trigger onChange manually
        const event = { target: inputRef.current } as React.ChangeEvent<HTMLInputElement>;
        props.onChange?.(event);
      }
    };

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="label text-text-tertiary mb-1 block">
            {label}
          </label>
        )}
        <div
          className="relative"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <style>{`
            input[type="number"]::-webkit-outer-spin-button,
            input[type="number"]::-webkit-inner-spin-button {
              -webkit-appearance: none;
              margin: 0;
            }
          `}</style>
          <input
            ref={(node) => {
              inputRef.current = node;
              if (typeof ref === 'function') {
                ref(node);
              } else if (ref) {
                ref.current = node;
              }
            }}
            id={inputId}
            className={inputClasses}
            style={style}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            {...props}
          />
          {isNumberInput && isHovered && (
            <div
              className="absolute inset-y-0 right-4 flex flex-col justify-center gap-0.5"
            >
              <button
                type="button"
                onClick={handleIncrement}
                disabled={props.disabled}
                className="flex items-center justify-center disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                style={{ height: '10px', color: 'var(--text-disabled)' }}
                tabIndex={-1}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-disabled)'}
              >
                <ChevronUpIcon />
              </button>
              <button
                type="button"
                onClick={handleDecrement}
                disabled={props.disabled}
                className="flex items-center justify-center disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                style={{ height: '10px', color: 'var(--text-disabled)' }}
                tabIndex={-1}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-disabled)'}
              >
                <ChevronDownIcon />
              </button>
            </div>
          )}
          {showTooltip && inputRef.current?.value && (
            <Tooltip text={inputRef.current.value}>
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
    );
  }
);

Input.displayName = 'Input';
