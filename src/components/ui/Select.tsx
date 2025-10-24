import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, placeholder, className = '', id, ...props }, ref) => {
    const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;

    const selectClasses = `
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
      focus:outline-none
      focus:ring-2
      ${error ? 'focus:ring-error/20' : 'focus:ring-border-focus/20'}
      disabled:opacity-50
      disabled:cursor-not-allowed
      transition-colors
      cursor-pointer
      ${className}
    `.trim().replace(/\s+/g, ' ');

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="label text-text-secondary mb-2 block">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={selectClasses}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
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
