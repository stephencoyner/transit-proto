import React, { useState, useRef, useEffect } from 'react';
import { Tooltip } from './Tooltip';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
    const [showTooltip, setShowTooltip] = useState(false);
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
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
        tooltipTimerRef.current = null;
      }
      setShowTooltip(false);
    };

    const inputClasses = `
      button-small
      w-full
      h-10
      bg-bg-primary
      hover:bg-bg-elevated
      focus:bg-bg-elevated
      border
      ${error ? 'border-error' : 'border-border-default'}
      ${error ? 'focus:border-error' : 'focus:border-border-focus'}
      rounded-full
      px-4
      text-text-primary
      placeholder:text-text-disabled
      focus:outline-none
      disabled:opacity-50
      disabled:cursor-not-allowed
      transition-colors
      ${className}
    `.trim().replace(/\s+/g, ' ');

    const style = { borderWidth: 'var(--border-width)', ...props.style };

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="label text-text-tertiary mb-1 block">
            {label}
          </label>
        )}
        <div className="relative">
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
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            {...props}
          />
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
