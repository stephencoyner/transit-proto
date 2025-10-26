'use client';

import React, { useState } from 'react';

interface NavRailProps {
  activeTab: 'system' | 'routes' | 'stops' | 'components';
  onTabChange: (tab: 'system' | 'routes' | 'stops' | 'components') => void;
  userInitial?: string;
  isFiltersPanelOpen: boolean;
  onToggleFiltersPanel: () => void;
}

// Inline SVG components for nav icons
const SystemIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="16.4852" width="12" height="2" rx="1" transform="rotate(-45 8 16.4852)" fill="currentColor"/>
    <rect y="8.48523" width="12" height="2" rx="1" transform="rotate(-45 0 8.48523)" fill="currentColor"/>
    <rect x="1" y="15.1421" width="20" height="2" rx="1" transform="rotate(-45 1 15.1421)" fill="currentColor"/>
  </svg>
);

const RoutesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.221802" y="14.364" width="20" height="2" rx="1" transform="rotate(-45 0.221802 14.364)" fill="currentColor"/>
  </svg>
);

const StopsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2"/>
  </svg>
);

const ComponentsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor"/>
    <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor"/>
    <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor"/>
    <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor"/>
  </svg>
);

const OpenFiltersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect y="2" width="16" height="2" rx="1" fill="currentColor"/>
    <rect y="7" width="16" height="2" rx="1" fill="currentColor"/>
    <rect y="12" width="16" height="2" rx="1" fill="currentColor"/>
  </svg>
);

const OpenFilters2Icon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3.80664 14.7515C3.41808 15.1432 2.79051 15.1417 2.40332 14.7485C2.01538 14.3544 2.01538 13.7159 2.40332 13.3218L7.63184 8.01319L2.44043 2.74073C2.05314 2.34727 2.05314 1.70939 2.44043 1.31593C2.82791 0.922713 3.4563 0.922669 3.84375 1.31593L9.80176 7.36671C10.0237 7.59225 10.1024 7.89924 10.0518 8.19093C10.0496 8.35257 9.98915 8.51515 9.86328 8.6421L3.80664 14.7515Z" fill="currentColor"/>
    <rect x="12" y="15.0001" width="14" height="2" rx="1" transform="rotate(-90 12 15.0001)" fill="currentColor"/>
  </svg>
);

const CloseFiltersIcon = () => (
  <svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect y="2" width="11" height="2" rx="1" fill="currentColor"/>
    <rect y="7" width="8" height="2" rx="1" fill="currentColor"/>
    <rect y="12" width="11" height="2" rx="1" fill="currentColor"/>
    <path d="M9.7296 8.68689C9.33035 8.2659 9.33913 7.6035 9.74939 7.19324L14.2786 2.66404C14.6728 2.26979 15.312 2.26979 15.7063 2.66404C16.0952 3.05298 16.1012 3.68171 15.7197 4.07799L11.2777 8.69265C10.8543 9.1324 10.1496 9.12977 9.7296 8.68689Z" fill="currentColor"/>
    <path d="M10.2588 7.32618C10.6649 7.10875 11.1655 7.18285 11.4913 7.5086L15.7168 11.7341C16.1098 12.1272 16.1098 12.7644 15.7168 13.1575C15.3273 13.547 14.6972 13.551 14.3027 13.1667L10.0226 8.99642C9.5163 8.50306 9.63551 7.65984 10.2588 7.32618Z" fill="currentColor"/>
  </svg>
);

const CloseFilters2Icon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.1231 1.32543C12.5503 0.891944 13.2429 0.891752 13.67 1.32543C14.097 1.75919 14.097 2.46299 13.67 2.89672L8.64658 7.99633L13.6778 13.1047C14.1045 13.5384 14.1045 14.2414 13.6778 14.675C13.2507 15.1088 12.5581 15.1087 12.131 14.675L6.42001 8.87719C6.3857 8.84984 6.35203 8.82043 6.3204 8.78832C6.10691 8.57146 6.0001 8.28736 6.00009 8.00317C5.99644 7.71413 6.10225 7.4239 6.31943 7.20336C6.35442 7.16784 6.39152 7.13541 6.42978 7.10571L12.1231 1.32543Z" fill="currentColor"/>
    <rect x="4" y="1.00022" width="14" height="2" rx="1" transform="rotate(90 4 1.00022)" fill="currentColor"/>
  </svg>
);

const NavRail: React.FC<NavRailProps> = ({
  activeTab,
  onTabChange,
  userInitial = 'S',
  isFiltersPanelOpen,
  onToggleFiltersPanel
}) => {
  const [isFilterButtonHovered, setIsFilterButtonHovered] = useState(false);

  const navItems = [
    { id: 'system' as const, label: 'System', Icon: SystemIcon },
    { id: 'routes' as const, label: 'Routes', Icon: RoutesIcon },
    { id: 'stops' as const, label: 'Stops', Icon: StopsIcon },
    { id: 'components' as const, label: 'Components', Icon: ComponentsIcon },
  ];

  return (
    <div className="flex flex-col items-center bg-bg-secondary h-full px-2 relative" style={{ paddingTop: '12px', paddingBottom: '12px', borderRadius: '28px 0 0 28px', border: '0.5px solid var(--border-default)' }}>
      {/* Divider Line */}
      <div
        className="absolute left-0 right-0 border-t border-border-default"
        style={{ top: '64px', borderTopWidth: '0.5px' }}
      />

      {/* Toggle Filters Button */}
      <button
        onClick={onToggleFiltersPanel}
        onMouseEnter={() => setIsFilterButtonHovered(true)}
        onMouseLeave={() => setIsFilterButtonHovered(false)}
        className="flex items-center justify-center w-10 h-10 rounded-default transition-colors hover:bg-btn-secondary/50 mb-3 text-text-tertiary"
        aria-label="Toggle filters panel"
        aria-expanded={isFiltersPanelOpen}
        aria-controls="filters-panel"
      >
        {isFilterButtonHovered
          ? (isFiltersPanelOpen ? <CloseFilters2Icon /> : <OpenFilters2Icon />)
          : <OpenFiltersIcon />
        }
      </button>

      {/* Navigation Items */}
      <nav className="flex flex-col w-full flex-1" style={{ marginTop: '8px' }} aria-label="Main navigation">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className="flex flex-col items-center justify-center gap-1 py-3 px-2"
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div
                className={`
                  flex items-center justify-center rounded-default transition-colors text-text-tertiary
                  ${isActive
                    ? 'bg-border-default'
                    : 'bg-transparent hover:bg-btn-secondary/50'
                  }
                `}
                style={{ width: '40px', height: '32px' }}
              >
                <item.Icon />
              </div>
              <span className="nav-label text-text-tertiary">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* User Profile - At Bottom */}
      <div
        className="flex items-center justify-center w-10 h-10 rounded-full bg-btn-secondary"
        style={{ marginBottom: '0' }}
        aria-label="User profile"
      >
        <span className="body-large text-text-primary">
          {userInitial}
        </span>
      </div>
    </div>
  );
};

export default NavRail;
