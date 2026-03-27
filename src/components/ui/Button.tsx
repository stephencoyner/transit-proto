import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'elevated';
export type ButtonSize = 'small' | 'medium';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'medium', className = '', children, ...props }, ref) => {
    const baseClasses = `rounded-full transition-colors duration-200 disabled:cursor-not-allowed cursor-pointer${variant !== 'primary' ? ' disabled:opacity-50' : ''}`;

    const variantClasses = {
      primary: 'hover:opacity-90',
      secondary: 'bg-btn-secondary text-text-primary',
      tertiary: 'bg-bg-elevated hover:bg-bg-primary',
      elevated: 'bg-bg-elevated text-text-primary hover:bg-bg-primary',
    };

    const sizeClasses = {
      small: 'button-small h-7 px-4',
      medium: 'button-medium h-10 px-5',
    };

    const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim();

    // Apply custom border for variants with borders, and color overrides
    const { style: propStyle, ...restProps } = props;
    const primaryStyle = props.disabled
      ? { backgroundColor: 'var(--bg-primary)', color: 'color-mix(in srgb, var(--text-primary) 40%, transparent)' }
      : { backgroundColor: 'var(--accent-ui-text)', color: 'white' };
    const style = variant === 'primary'
      ? { ...primaryStyle, ...propStyle }
      : (variant === 'secondary' || variant === 'tertiary' || variant === 'elevated')
        ? {
            ...propStyle,
            border: '0.5px solid var(--border-default)',
            ...(variant === 'tertiary' ? { color: 'var(--accent-ui-text)' } : {}),
          }
        : propStyle;

    return (
      <button ref={ref} className={classes} style={style} {...restProps}>
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export interface StatefulButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onToggle'> {
  size?: ButtonSize;
  selected?: boolean;
  onToggle?: (selected: boolean) => void;
  children: React.ReactNode;
}

export const StatefulButton = React.forwardRef<HTMLButtonElement, StatefulButtonProps>(
  ({ size = 'small', selected = false, onToggle, className = '', children, disabled, ...props }, ref) => {
    const baseClasses = 'button-small rounded-full transition-colors duration-200';

    const stateClasses = disabled
      ? 'bg-bg-elevated text-text-tertiary'
      : selected
        ? 'bg-bg-primary text-text-primary'
        : 'bg-bg-elevated text-text-primary hover:bg-bg-primary';

    const cursorClass = disabled ? 'cursor-not-allowed' : 'cursor-pointer';

    const sizeClasses = {
      small: 'h-7 px-4',
      medium: 'h-10 px-4',
    };

    const classes = `${baseClasses} ${stateClasses} ${cursorClass} ${sizeClasses[size]} ${className}`.trim();

    const handleClick = () => {
      if (disabled) return;
      if (onToggle) {
        onToggle(!selected);
      }
    };

    const { style: propStyle, ...restProps } = props;

    const style = {
      ...propStyle,
      border: '0.5px solid var(--border-default)',
      boxShadow: selected && !disabled ? 'inset 0 0 0 0.5px var(--border-focus)' : 'none',
      opacity: disabled ? 0.4 : 1,
    };

    return (
      <button
        ref={ref}
        className={classes}
        style={style}
        onClick={handleClick}
        disabled={disabled}
        {...restProps}
      >
        {children}
      </button>
    );
  }
);

StatefulButton.displayName = 'StatefulButton';
