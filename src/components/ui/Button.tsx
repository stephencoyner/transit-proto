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
    const baseClasses = 'rounded-default transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

    const variantClasses = {
      primary: 'bg-btn-primary text-text-on-primary hover:opacity-90',
      secondary: 'bg-btn-secondary text-text-primary border border-border-default hover:border-border-hover',
      tertiary: 'bg-btn-tertiary text-text-primary border border-border-default hover:bg-btn-secondary',
    };

    const sizeClasses = {
      small: 'button-small px-4 py-2',
      medium: 'button-medium px-6 py-3',
    };

    const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim();

    // Apply custom border width for variants with borders
    const style = (variant === 'secondary' || variant === 'tertiary')
      ? { borderWidth: 'var(--border-width)', ...props.style }
      : props.style;

    return (
      <button ref={ref} className={classes} style={style} {...props}>
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
