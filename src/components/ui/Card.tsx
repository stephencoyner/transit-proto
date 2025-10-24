import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  padding?: 'none' | 'small' | 'medium' | 'large';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, header, footer, padding = 'medium', className = '', ...props }, ref) => {
    const paddingClasses = {
      none: '',
      small: 'p-4',
      medium: 'p-6',
      large: 'p-8',
    };

    const baseClasses = 'bg-bg-elevated rounded-large border border-border-default shadow-md';
    const classes = `${baseClasses} ${className}`.trim();

    return (
      <div ref={ref} className={classes} {...props}>
        {header && (
          <div className={`border-b border-border-default ${paddingClasses[padding]} pb-4`}>
            {header}
          </div>
        )}
        <div className={paddingClasses[padding]}>
          {children}
        </div>
        {footer && (
          <div className={`border-t border-border-default ${paddingClasses[padding]} pt-4`}>
            {footer}
          </div>
        )}
      </div>
    );
  }
);

Card.displayName = 'Card';
