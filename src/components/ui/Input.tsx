import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    const inputClasses = `
      body-regular
      w-full
      bg-bg-elevated
      border
      ${error ? 'border-error' : 'border-border-default'}
      ${error ? 'focus:border-error' : 'focus:border-border-focus'}
      rounded-default
      px-4
      py-2
      text-text-primary
      placeholder:text-text-disabled
      focus:outline-none
      focus:ring-2
      ${error ? 'focus:ring-error/20' : 'focus:ring-border-focus/20'}
      disabled:opacity-50
      disabled:cursor-not-allowed
      transition-colors
      ${className}
    `.trim().replace(/\s+/g, ' ');

    const style = { borderWidth: 'var(--border-width)', ...props.style };

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="label text-text-secondary mb-2 block">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={inputClasses}
          style={style}
          {...props}
        />
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
