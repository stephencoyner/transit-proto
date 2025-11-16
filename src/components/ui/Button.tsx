import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary';
export type ButtonSize = 'small' | 'medium';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'medium', className = '', children, ...props }, ref) => {
    const baseClasses = 'rounded-full transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

    const variantClasses = {
      primary: 'bg-btn-primary text-text-on-primary hover:opacity-90',
      secondary: 'bg-btn-secondary text-text-primary',
      tertiary: 'bg-btn-tertiary text-text-primary hover:bg-bg-elevated',
    };

    const sizeClasses = {
      small: 'button-small h-7 px-4',
      medium: 'button-medium h-10 px-5',
    };

    const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim();

    // Apply custom border for variants with borders
    const { style: propStyle, ...restProps } = props;
    const style = (variant === 'secondary' || variant === 'tertiary')
      ? {
          ...propStyle,
          border: '0.5px solid var(--border-default)'
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
  ({ size = 'small', selected = false, onToggle, className = '', children, ...props }, ref) => {
    const baseClasses = 'button-small rounded-full transition-colors duration-200 cursor-pointer';

    const stateClasses = selected
      ? 'bg-bg-primary text-text-primary'
      : 'bg-bg-elevated text-text-primary hover:bg-bg-primary';

    const sizeClasses = {
      small: 'h-7 px-4',
      medium: 'h-10 px-5',
    };

    const classes = `${baseClasses} ${stateClasses} ${sizeClasses[size]} ${className}`.trim();

    const handleClick = () => {
      if (onToggle) {
        onToggle(!selected);
      }
    };

    const { style: propStyle, ...restProps } = props;

    const style = {
      ...propStyle,
      border: selected
        ? '0.5px solid var(--border-focus)'
        : '0.5px solid var(--border-default)'
    };

    return (
      <button
        ref={ref}
        className={classes}
        style={style}
        onClick={handleClick}
        {...restProps}
      >
        {children}
      </button>
    );
  }
);

StatefulButton.displayName = 'StatefulButton';
